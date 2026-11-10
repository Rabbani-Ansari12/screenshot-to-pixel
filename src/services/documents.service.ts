import type { DocumentLink, DocumentRecord, DocumentType, ReviewItemView, TripView } from "@/types";
import { NotFoundError, actingUser, clone, db, delay, logAudit, nextId, nowIso } from "./core";
import { toTripView } from "./views";

export interface DocumentDetail {
  document: DocumentRecord;
  trip: TripView | null;
  duplicateOf: DocumentRecord | null;
  duplicates: DocumentRecord[];
  review: Pick<ReviewItemView, "id" | "reason" | "status"> | null;
}

// TODO(backend): supabase.from("documents").select("*").order("received_at", { ascending: false })
export async function listDocuments(): Promise<DocumentRecord[]> {
  await delay();
  return clone(db.documents);
}

export async function getDocument(id: string): Promise<DocumentDetail> {
  await delay();
  const doc = db.documents.find((d) => d.id === id);
  if (!doc) throw new NotFoundError(`Document ${id}`);
  const trip = doc.link?.type === "Trip" ? db.trips.find((t) => t.id === doc.link?.id) : undefined;
  const review = db.reviewItems.find((r) => r.documentId === id);
  return clone({
    document: doc,
    trip: trip ? toTripView(trip) : null,
    duplicateOf: doc.duplicateOf
      ? (db.documents.find((d) => d.id === doc.duplicateOf) ?? null)
      : null,
    duplicates: db.documents.filter((d) => d.duplicateOf === id),
    review: review ? { id: review.id, reason: review.reason, status: review.status } : null,
  });
}

function find(id: string) {
  const doc = db.documents.find((d) => d.id === id);
  if (!doc) throw new NotFoundError(`Document ${id}`);
  return doc;
}

/** Manual upload fallback. Files are not stored in the demo. */
// TODO(backend): upload to Supabase Storage, insert documents row, trigger AI extraction edge function.
export async function uploadDocuments(
  files: { name: string; type: DocumentType }[],
): Promise<DocumentRecord[]> {
  await delay(700);
  const created = files.map((file) => {
    const id = nextId("DOC-2026-", db.documents);
    const at = nowIso();
    const doc: DocumentRecord = {
      id,
      type: file.type,
      fileName: file.name,
      pages: 1,
      senderName: actingUser(),
      senderPhone: "—",
      source: "Manual Upload",
      receivedAt: at,
      status: "Processing",
      confidence: 0,
      fields: [],
      link: null,
      corrections: [],
      messageId: null,
      duplicateOf: null,
      reviewReason: null,
      note: "Uploaded manually. AI extraction is simulated in this demo.",
      timeline: [
        { label: "Uploaded manually", at, state: "done" },
        {
          label: "Information extracted",
          at: null,
          state: "current",
          note: "Reading the document…",
        },
        { label: "Matched to record", at: null, state: "pending" },
        { label: "Recorded automatically", at: null, state: "pending" },
      ],
    };
    db.documents.unshift(doc);
    logAudit({
      action: "Created",
      entityType: "Document",
      entityId: id,
      entityLabel: `${id} · ${file.type}`,
      note: `Manual upload: ${file.name}`,
    });
    return doc;
  });
  return clone(created);
}

// TODO(backend): call the extraction edge function again.
export async function reprocessDocument(id: string): Promise<DocumentRecord> {
  await delay(900);
  const doc = find(id);
  doc.timeline = doc.timeline.map((s, i) =>
    i === 0
      ? s
      : {
          ...s,
          state: i === 1 ? "current" : "pending",
          at: null,
          note: i === 1 ? "Re-processing requested" : "",
        },
  );
  if (doc.status === "Failed" || doc.status === "Received") doc.status = "Processing";
  logAudit({
    action: "Updated",
    entityType: "Document",
    entityId: id,
    entityLabel: `${id} · ${doc.type}`,
    note: "Re-processing requested",
  });
  return clone(doc);
}

export async function correctFields(
  id: string,
  updates: { key: string; value: string }[],
  reason: string,
): Promise<DocumentRecord> {
  await delay(400);
  const doc = find(id);
  updates.forEach(({ key, value }) => {
    const field = doc.fields.find((f) => f.key === key);
    if (!field || field.value === value) return;
    doc.corrections.unshift({
      field: field.label,
      from: field.value,
      to: value,
      by: actingUser(),
      at: nowIso(),
      reason,
    });
    logAudit({
      action: "Corrected",
      entityType: "Document",
      entityId: id,
      entityLabel: `${id} · ${doc.type}`,
      changes: [{ field: field.label, from: field.value, to: value }],
      note: reason,
    });
    field.value = value;
    field.confidence = 100;
  });
  return clone(doc);
}

export async function linkDocument(
  id: string,
  link: DocumentLink,
  note: string,
): Promise<DocumentRecord> {
  await delay(400);
  const doc = find(id);
  const previous = doc.link?.label ?? "—";
  doc.link = link;
  doc.status = "Matched";
  doc.timeline = doc.timeline.map((s, i) =>
    i <= 2
      ? { ...s, state: "done", at: s.at ?? nowIso() }
      : { ...s, state: "current", note: "Waiting for confirmation" },
  );
  logAudit({
    action: "Matched",
    entityType: "Document",
    entityId: id,
    entityLabel: `${id} · ${doc.type}`,
    changes: [{ field: "Linked record", from: previous, to: link.label }],
    note,
  });
  return clone(doc);
}

export async function markDuplicate(
  id: string,
  duplicateOf: string | null,
  reason: string,
): Promise<DocumentRecord> {
  await delay(350);
  const doc = find(id);
  const prev = doc.status;
  doc.status = "Duplicate";
  doc.duplicateOf = duplicateOf;
  doc.link = null;
  logAudit({
    action: "Updated",
    entityType: "Document",
    entityId: id,
    entityLabel: `${id} · ${doc.type}`,
    changes: [{ field: "Status", from: prev, to: "Duplicate" }],
    note: reason,
  });
  return clone(doc);
}
