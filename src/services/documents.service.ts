/**
 * Documents from Supabase: upload (Storage + register_uploaded_document), inbox, detail with the
 * original file, and review actions. Processing (AI reading, matching) runs server-side in the
 * process-document worker; this module never calls the AI.
 */
import type {
  Correction,
  DocumentLink,
  DocumentRecord,
  DocumentType,
  ExtractedField,
  ProcessingStatus,
  ReviewItemView,
  ReviewReason,
  TimelineEvent,
  TripView,
} from "@/types";
import type { Enums, Json, Tables } from "@/lib/supabase";
import { prepareUpload } from "@/lib/upload-prep";
import { AppError, check, rows, unwrap, unwrapMaybe } from "./supabase/errors";
import { fetchTripsIn, sb, tripUuid } from "./supabase/fetch";

export interface DocumentDetail {
  document: DocumentRecord;
  trip: TripView | null;
  duplicateOf: DocumentRecord | null;
  duplicates: DocumentRecord[];
  review: Pick<ReviewItemView, "id" | "reason" | "status"> | null;
}

type DocRow = Tables<"documents">;
type DbDocType = Enums<"document_type">;

// ---------- Labels ----------
export const DOC_TYPE_LABEL: Record<DbDocType, DocumentType> = {
  weighbridge_slip: "Weighbridge Slip",
  loading_slip: "Loading Slip",
  unloading_slip: "Unloading Slip",
  provider_bill: "Provider Bill",
  transporter_bill: "Transporter Bill",
  delivery_photo: "Delivery Photo",
  payment_receipt: "Payment Receipt",
  other: "Other",
};
export const docTypeToDb = (t: DocumentType) =>
  (Object.entries(DOC_TYPE_LABEL).find(([, l]) => l === t)?.[0] ?? "other") as DbDocType;

const STATUS: Record<Enums<"document_status">, ProcessingStatus> = {
  received: "Received",
  processing: "Processing",
  information_extracted: "Information Extracted",
  matched: "Matched",
  automatically_recorded: "Automatically Recorded",
  needs_review: "Needs Review",
  failed: "Failed",
  duplicate: "Duplicate",
  rejected: "Rejected",
};

export const REVIEW_REASON: Record<Enums<"review_reason">, ReviewReason> = {
  low_confidence: "Low confidence",
  missing_essential_info: "Missing essential info",
  multiple_possible_matches: "Multiple possible matches",
  conflicting_weight_values: "Conflicting weight values",
  financial_discrepancy: "Financial discrepancy",
  no_match: "No match",
  vehicle_mismatch: "Vehicle mismatch",
};

export const FIELD_LABEL: Record<string, string> = {
  vehicle_number: "Vehicle number",
  slip_number: "Slip number",
  date: "Date",
  time: "Time",
  gross_weight: "Gross (MT)",
  tare_weight: "Tare (MT)",
  net_weight: "Net (MT)",
  weight_unit: "Weight unit",
  material_name: "Material",
  provider: "Provider",
  weighbridge_name: "Weighbridge",
};

export const docRef = (id: string) => `DOC-${id.slice(0, 8).toUpperCase()}`;
const obj = (j: Json | null | undefined) =>
  j && typeof j === "object" && !Array.isArray(j) ? (j as Record<string, Json>) : {};

// ---------- Mapping ----------
interface Lookups {
  names: Map<string, string>;
  tripCodes: Map<string, string>;
  corrections: Tables<"document_corrections">[];
}

function timelineOf(d: DocRow): TimelineEvent[] {
  const s = d.status;
  const extracted =
    (!["received", "processing"].includes(s) && s !== "duplicate") || Boolean(d.extracted);
  const steps: TimelineEvent[] = [
    { label: "Uploaded", at: d.received_at, state: "done" },
    {
      label: "Information extracted",
      at: extracted ? d.processed_at : null,
      state: extracted
        ? "done"
        : s === "processing"
          ? "current"
          : s === "failed"
            ? "failed"
            : "pending",
      ...(s === "processing" ? { note: "Reading the document…" } : {}),
    },
  ];
  if (s === "duplicate")
    steps.push({ label: "Duplicate — not recorded again", at: d.processed_at, state: "done" });
  else if (s === "rejected")
    steps.push({ label: "Rejected in review", at: d.updated_at, state: "failed" });
  else if (s === "needs_review")
    steps.push({
      label: "Needs review",
      at: d.processed_at,
      state: "current",
      note: "A person decides",
    });
  else if (s === "failed")
    steps.push({ label: "Could not be read", at: d.processed_at, state: "failed" });
  else {
    const matched = s === "matched" || s === "automatically_recorded";
    steps.push({
      label: "Matched to record",
      at: matched ? d.processed_at : null,
      state: matched ? "done" : "pending",
    });
    steps.push({
      label: s === "matched" ? "Recorded by reviewer" : "Recorded automatically",
      at: matched ? d.updated_at : null,
      state: matched ? "done" : "pending",
    });
  }
  return steps;
}

export function toDocumentRecord(d: DocRow, lk: Lookups): DocumentRecord {
  const extracted = obj(d.extracted);
  const raw = obj(extracted["fields"] as Json);
  const mine = lk.corrections
    .filter((c) => c.document_id === d.id)
    .sort((a, b) => b.corrected_at.localeCompare(a.corrected_at));
  const latest = new Map<string, Tables<"document_corrections">>();
  for (const c of mine) if (!latest.has(c.field_key)) latest.set(c.field_key, c);
  const fields: ExtractedField[] = Object.keys(FIELD_LABEL)
    .filter((k) => k in raw || latest.has(k))
    .map((key) => {
      const f = obj(raw[key]);
      const corrected = latest.get(key);
      const value = corrected ? corrected.corrected_value : f["value"];
      return {
        key,
        label: FIELD_LABEL[key] ?? key,
        value: value === null || value === undefined ? "" : String(value),
        confidence: corrected ? 100 : Math.round(Number(f["confidence"] ?? 0) * 100),
      };
    });
  const detail = obj(d.review_detail);
  const link: DocumentLink | null = d.trip_id
    ? {
        type: "Trip",
        id: lk.tripCodes.get(d.trip_id) ?? d.trip_id,
        label: lk.tripCodes.get(d.trip_id) ?? "Trip",
      }
    : d.purchase_id
      ? { type: "Purchase", id: d.purchase_id, label: "Purchase" }
      : null;
  const corrections: Correction[] = mine.map((c) => ({
    field: FIELD_LABEL[c.field_key] ?? c.field_key,
    from: c.original_value ?? "—",
    to: c.corrected_value ?? "—",
    by: (c.corrected_by && lk.names.get(c.corrected_by)) || "—",
    at: c.corrected_at,
    reason: c.reason,
  }));
  const waiting = typeof detail["waiting"] === "string" ? detail["waiting"] : null;
  const failure = typeof detail["error"] === "string" ? detail["error"] : null;
  return {
    id: d.id,
    ref: docRef(d.id),
    type: DOC_TYPE_LABEL[d.doc_type],
    fileName: d.file_name ?? "document",
    pages: d.page_count ?? 1,
    senderName: d.uploaded_by_label || (d.uploaded_by && lk.names.get(d.uploaded_by)) || "—",
    source: d.source === "driver_link" ? "Driver Link" : "Staff Upload",
    receivedAt: d.received_at,
    status: STATUS[d.status],
    confidence: Math.round(Number(d.overall_confidence ?? 0) * 100),
    fields,
    link,
    timeline: timelineOf(d),
    corrections,
    duplicateOf: d.duplicate_of_document_id,
    reviewReason: d.review_reason ? REVIEW_REASON[d.review_reason] : null,
    note: d.notes ?? (typeof detail["explanation"] === "string" ? detail["explanation"] : "") ?? "",
    mimeType: d.mime_type,
    tripHint: d.trip_hint_id
      ? {
          id: lk.tripCodes.get(d.trip_hint_id) ?? d.trip_hint_id,
          label: lk.tripCodes.get(d.trip_hint_id) ?? "Trip",
        }
      : null,
    processingNote: d.status === "failed" ? failure : waiting,
  };
}

/** Loads names, trip codes and corrections needed to map a set of documents. */
export async function lookupsFor(docs: DocRow[]): Promise<Lookups> {
  const tripIds = [
    ...new Set(
      docs.flatMap((d) => [d.trip_id, d.trip_hint_id]).filter((x): x is string => Boolean(x)),
    ),
  ];
  const ids = docs.map((d) => d.id);
  const [profiles, trips, corrections] = await Promise.all([
    sb().from("profiles").select("id, full_name, email"),
    tripIds.length
      ? sb().from("truck_trips").select("id, trip_code").in("id", tripIds)
      : Promise.resolve({ data: [], error: null }),
    ids.length
      ? sb().from("document_corrections").select("*").in("document_id", ids)
      : Promise.resolve({ data: [], error: null }),
  ]);
  return {
    names: new Map(rows(profiles).map((p) => [p.id, p.full_name || p.email || "User"])),
    tripCodes: new Map(rows(trips).map((t) => [t.id, t.trip_code])),
    corrections: rows(corrections),
  };
}

async function docRows(filter?: (q: ReturnType<typeof base>) => ReturnType<typeof base>) {
  const q = filter ? filter(base()) : base();
  return rows(await q.order("received_at", { ascending: false }).limit(1000));
}
const base = () => sb().from("documents").select("*").is("deleted_at", null);

// ---------- Reads ----------
export async function listDocuments(): Promise<DocumentRecord[]> {
  const list = await docRows();
  const lk = await lookupsFor(list);
  return list.map((d) => toDocumentRecord(d, lk));
}

async function docRow(id: string): Promise<DocRow> {
  const row = unwrapMaybe(await base().eq("id", id).maybeSingle());
  if (!row) throw new AppError("Document not found.", null, "not_found");
  return row;
}

export async function signedUrl(path: string): Promise<string | null> {
  const { data, error } = await sb().storage.from("documents").createSignedUrl(path, 3600);
  return error ? null : (data?.signedUrl ?? null);
}

export async function getDocument(id: string): Promise<DocumentDetail> {
  const row = await docRow(id);
  const related = await docRows((q) =>
    row.duplicate_of_document_id
      ? q.or(`id.eq.${row.duplicate_of_document_id},duplicate_of_document_id.eq.${row.id}`)
      : q.eq("duplicate_of_document_id", row.id),
  );
  const lk = await lookupsFor([row, ...related]);
  const [url, trips] = await Promise.all([
    signedUrl(row.storage_path),
    row.trip_id ? fetchTripsIn("id", [row.trip_id]) : Promise.resolve([]),
  ]);
  const document = { ...toDocumentRecord(row, lk), fileUrl: url };
  const original = related.find((d) => d.id === row.duplicate_of_document_id);
  return {
    document,
    trip: trips[0] ?? null,
    duplicateOf: original ? toDocumentRecord(original, lk) : null,
    duplicates: related
      .filter((d) => d.duplicate_of_document_id === row.id)
      .map((d) => toDocumentRecord(d, lk)),
    review:
      row.status === "needs_review" || row.review_reason
        ? {
            id: row.id,
            reason: row.review_reason ? REVIEW_REASON[row.review_reason] : "Low confidence",
            status:
              row.status === "needs_review"
                ? "Open"
                : row.status === "rejected"
                  ? "Rejected"
                  : "Resolved",
          }
        : null,
  };
}

// ---------- Upload ----------
export interface UploadInput {
  file: File;
  /** What the uploader says it is; the AI still verifies. */
  typeHint: DocumentType | null;
  /** Trip code the uploader picked; the matcher still checks the vehicle. */
  tripHint: string | null;
  /** Free text, e.g. the driver's name. */
  uploadedByLabel: string;
}

export interface UploadResult {
  record: DocumentRecord;
  duplicate: boolean;
}

/** Downscale (photos), hash, store in the private bucket, register, queue for processing. */
export async function uploadDocuments(items: UploadInput[]): Promise<UploadResult[]> {
  const businessId = unwrap(await sb().rpc("current_business_id"));
  const results: { id: string; duplicate: boolean }[] = [];
  for (const item of items) {
    const prepared = await prepareUpload(item.file);
    const now = new Date();
    const path = `${businessId}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${crypto.randomUUID()}.${prepared.ext}`;
    const up = await sb().storage.from("documents").upload(path, prepared.blob, {
      contentType: prepared.mimeType,
      upsert: false,
    });
    if (up.error) throw new AppError(`Could not upload ${item.file.name}: ${up.error.message}`);
    const tripHintId = item.tripHint ? await tripUuid(item.tripHint).catch(() => null) : null;
    const res = unwrap(
      await sb().rpc("register_uploaded_document", {
        p_storage_path: path,
        p_sha256: prepared.sha256,
        p_file_name: item.file.name,
        p_mime_type: prepared.mimeType,
        p_size_bytes: prepared.blob.size,
        ...(tripHintId ? { p_trip_hint_id: tripHintId } : {}),
        ...(item.typeHint ? { p_document_type_hint: docTypeToDb(item.typeHint) } : {}),
        ...(item.uploadedByLabel.trim()
          ? { p_uploaded_by_label: item.uploadedByLabel.trim() }
          : {}),
      }),
    ) as { id: string; status: string };
    results.push({ id: res.id, duplicate: res.status === "duplicate" });
  }
  const list = await docRows((q) =>
    q.in(
      "id",
      results.map((r) => r.id),
    ),
  );
  const lk = await lookupsFor(list);
  return results.map((r) => ({
    record: toDocumentRecord(
      list.find((d) => d.id === r.id)!,
      lk,
    ),
    duplicate: r.duplicate,
  }));
}

// ---------- Actions (RPCs check permissions; originals are never changed) ----------
export async function reprocessDocument(id: string): Promise<DocumentRecord> {
  check(await sb().rpc("reprocess_document", { p_document_id: id }));
  return (await getDocument(id)).document;
}

/** Corrections are stored separately with a reason; the AI's original values stay. */
export async function correctFields(
  id: string,
  updates: { key: string; value: string }[],
  reason: string,
): Promise<DocumentRecord> {
  for (const u of updates)
    check(
      await sb().rpc("correct_document_field", {
        p_document_id: id,
        p_field: u.key,
        p_value: u.value,
        p_reason: reason,
      }),
    );
  return (await getDocument(id)).document;
}

/** Attach to a trip: records the document's weight on it (never overwrites an existing weight). */
export async function linkDocument(
  id: string,
  link: DocumentLink,
  note: string,
  recordType?: "loading" | "delivery",
): Promise<DocumentRecord> {
  if (link.type !== "Trip") throw new AppError("Only trips can be linked from here for now.");
  const row = await docRow(id);
  check(
    await sb().rpc("review_attach_document", {
      p_document_id: id,
      p_trip_id: await tripUuid(link.id),
      p_record_type: recordType ?? defaultRecordType(row.doc_type),
      p_reason: note,
    }),
  );
  return (await getDocument(id)).document;
}

export const defaultRecordType = (t: DbDocType): "loading" | "delivery" =>
  t === "unloading_slip" || t === "delivery_photo" ? "delivery" : "loading";

export async function markDuplicate(
  id: string,
  duplicateOf: string | null,
  reason: string,
): Promise<DocumentRecord> {
  check(
    await sb().rpc("mark_document_duplicate", {
      p_document_id: id,
      ...(duplicateOf
        ? { p_original_id: duplicateOf }
        : { p_original_id: null as unknown as string }),
      p_reason: reason,
    }),
  );
  return (await getDocument(id)).document;
}

export async function rejectDocument(id: string, reason: string): Promise<DocumentRecord> {
  check(await sb().rpc("reject_document", { p_document_id: id, p_reason: reason }));
  return (await getDocument(id)).document;
}

/** New trip from a loading / weighbridge slip; the loading weight comes from the document. */
export async function createTripFromDocument(
  documentId: string,
  trip: {
    orderId: string;
    materialId: string;
    providerId: string | null;
    yardId: string | null;
    transporterId: string;
    vehicleId: string;
    driverId: string;
    freight: number;
  },
  reason: string,
): Promise<{ id: string; trip_code: string }> {
  return unwrap(
    await sb().rpc("review_create_trip_from_document", {
      p_document_id: documentId,
      p_trip: {
        order_id: trip.orderId,
        material_id: trip.materialId,
        provider_id: trip.providerId,
        stock_location_id: trip.yardId,
        transporter_id: trip.transporterId,
        vehicle_id: trip.vehicleId,
        driver_id: trip.driverId || null,
        freight_amount: trip.freight,
      },
      p_reason: reason,
    }),
  ) as { id: string; trip_code: string };
}
