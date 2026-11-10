/**
 * Review queue = documents the pipeline could not record on its own (status needs_review), with the
 * matcher's ranked candidates. Every decision is a permission-checked Postgres function.
 */
import type { CandidateView, ReviewItemView, TripView } from "@/types";
import type { Json, Tables } from "@/lib/supabase";
import * as documents from "./documents.service";
import { AppError, check, rows, unwrapMaybe } from "./supabase/errors";
import { fetchTripsIn, sb } from "./supabase/fetch";
import { toTripView } from "./supabase/mappers";

type DocRow = Tables<"documents">;
const obj = (j: Json | null | undefined) =>
  j && typeof j === "object" && !Array.isArray(j) ? (j as Record<string, Json>) : {};

interface StoredCandidate {
  tripId: string;
  tripCode: string;
  score: number;
  recordType: "loading" | "delivery";
  excluded: string | null;
  breakdown: {
    criterion: string;
    score: number;
    weight: number;
    applicable: boolean;
    detail: string;
  }[];
}

const PRIORITY: Record<string, "High" | "Medium" | "Low"> = {
  conflicting_weight_values: "High",
  vehicle_mismatch: "High",
  missing_essential_info: "Medium",
  multiple_possible_matches: "Medium",
  no_match: "Medium",
  low_confidence: "Low",
};

function storedCandidates(d: DocRow): StoredCandidate[] {
  const list = obj(d.review_detail)["candidates"];
  return Array.isArray(list) ? (list as unknown as StoredCandidate[]) : [];
}

function toReviewItem(
  d: DocRow,
  doc: ReturnType<typeof documents.toDocumentRecord>,
  trips: Map<string, TripView>,
): ReviewItemView {
  const detail = obj(d.review_detail);
  const field = (k: string) => {
    const v = doc.fields.find((f) => f.key === k)?.value;
    return v ? Number(v) : NaN;
  };
  const candidateTrips: CandidateView[] = storedCandidates(d)
    .filter((c) => !c.excluded && trips.has(c.tripId))
    .map((c) => {
      const s = (k: string) => c.breakdown.find((b) => b.criterion === k);
      const ok = (k: string) => (s(k)?.score ?? 0) >= 0.99;
      const trip = trips.get(c.tripId)!;
      return {
        tripId: trip.id,
        score: Math.round(c.score * 100),
        criteria: {
          vehicle: ok("vehicle"),
          date: (s("time")?.score ?? 0) >= 0.5,
          material: ok("material"),
          provider: ok("provider"),
          destination: ok("destination"),
        },
        breakdown: c.breakdown,
        recordType: c.recordType,
        trip,
      };
    })
    .sort((a, b) => b.score - a.score);
  const reasonKey = d.review_reason ?? "low_confidence";
  const vehicle = doc.fields.find((f) => f.key === "vehicle_number")?.value;
  const conflict =
    reasonKey === "conflicting_weight_values" &&
    Number.isFinite(field("gross_weight")) &&
    Number.isFinite(field("tare_weight"))
      ? {
          printedNet: field("net_weight"),
          gross: field("gross_weight"),
          tare: field("tare_weight"),
        }
      : null;
  return {
    id: d.id,
    documentId: d.id,
    reason: documents.REVIEW_REASON[reasonKey],
    title: `${doc.type}${vehicle ? ` · ${vehicle}` : ""}`,
    summary:
      (typeof detail["explanation"] === "string" && detail["explanation"]) ||
      (typeof detail["record_error"] === "string" && detail["record_error"]) ||
      doc.note ||
      "Check the document and decide.",
    createdAt: d.processed_at ?? d.received_at,
    priority: PRIORITY[reasonKey] ?? "Medium",
    candidates: candidateTrips.map(({ trip: _t, ...c }) => c),
    weightConflict: conflict,
    financial: null,
    status:
      d.status === "needs_review" ? "Open" : d.status === "rejected" ? "Rejected" : "Resolved",
    document: doc,
    candidateTrips,
  };
}

async function build(list: DocRow[]): Promise<ReviewItemView[]> {
  const lk = await documents.lookupsFor(list);
  const ids = [...new Set(list.flatMap((d) => storedCandidates(d).map((c) => c.tripId)))];
  const trips = new Map((await fetchTripsIn("id", ids)).map((t) => [t.uuid ?? "", t]));
  return list.map((d) => toReviewItem(d, documents.toDocumentRecord(d, lk), trips));
}

/** Open items first, then items decided in the last 30 days. */
export async function listReviewItems(): Promise<ReviewItemView[]> {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const list = rows(
    await sb()
      .from("documents")
      .select("*")
      .is("deleted_at", null)
      .not("review_detail", "is", null)
      .or(
        `status.eq.needs_review,and(status.in.(matched,rejected,duplicate),updated_at.gte.${since})`,
      )
      .order("received_at", { ascending: false })
      .limit(500),
  ).filter(
    (d) =>
      d.status === "needs_review" ||
      d.review_reason !== null ||
      d.status === "matched" ||
      d.status === "rejected",
  );
  return build(list);
}

export async function getReviewItem(id: string): Promise<ReviewItemView> {
  const row = unwrapMaybe(
    await sb().from("documents").select("*").eq("id", id).is("deleted_at", null).maybeSingle(),
  );
  if (!row) throw new AppError("Review item not found.", null, "not_found");
  const [item] = await build([row]);
  const url = await documents.signedUrl(row.storage_path);
  return { ...item!, document: item!.document ? { ...item!.document, fileUrl: url } : null };
}

/** Trips a reviewer can pick when none of the suggestions fit (recent, not cancelled). */
export async function listOpenTrips(): Promise<TripView[]> {
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
  const list = rows(
    await sb()
      .from("v_trip_list")
      .select("*")
      .neq("status", "cancelled")
      .gte("sort_at", since)
      .order("sort_at", { ascending: false })
      .limit(300),
  );
  return list.map(toTripView);
}

export type Resolution =
  | {
      action: "attach";
      tripId: string;
      corrections: { key: string; value: string }[];
      reason: string;
      recordType?: "loading" | "delivery";
    }
  | { action: "create_trip"; reason: string; corrections: { key: string; value: string }[] }
  | { action: "reject"; reason: string }
  | { action: "approve_difference"; reason: string };

/**
 * Applies a review decision. Corrections are stored separately (originals kept, reason required).
 * create_trip only applies corrections here; the trip itself is created from the trip form
 * (createTripFromDocument). AI never approves financial differences, and bill differences are
 * handled in the reconciliation module.
 */
export async function resolveReviewItem(
  id: string,
  resolution: Resolution,
): Promise<ReviewItemView> {
  if ("corrections" in resolution && resolution.corrections.length)
    await documents.correctFields(id, resolution.corrections, resolution.reason);
  if (resolution.action === "attach") {
    const item = await getReviewItem(id);
    const candidate = item.candidateTrips.find((c) => c.tripId === resolution.tripId);
    await documents.linkDocument(
      id,
      { type: "Trip", id: resolution.tripId, label: resolution.tripId },
      resolution.reason,
      resolution.recordType ?? candidate?.recordType,
    );
  } else if (resolution.action === "reject") {
    check(await sb().rpc("reject_document", { p_document_id: id, p_reason: resolution.reason }));
  } else if (resolution.action === "approve_difference") {
    throw new AppError("Bill differences are approved in Bill Reconciliation.");
  }
  return getReviewItem(id);
}

// Keeps the trip mapper reachable for callers that build trips from rows.
export { toTripView };
