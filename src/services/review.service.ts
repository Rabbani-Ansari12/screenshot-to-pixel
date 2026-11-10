import type { ReviewItemView, TripView } from "@/types";
import { NotFoundError, actingUser, clone, db, delay, logAudit, nowIso } from "./core";
import { toTripView } from "./views";

function toView(id: string): ReviewItemView {
  const item = db.reviewItems.find((r) => r.id === id);
  if (!item) throw new NotFoundError(`Review item ${id}`);
  const document = item.documentId
    ? (db.documents.find((d) => d.id === item.documentId) ?? null)
    : null;
  return {
    ...item,
    document,
    candidateTrips: item.candidates
      .map((c) => {
        const trip = db.trips.find((t) => t.id === c.tripId);
        return trip ? { ...c, trip: toTripView(trip) } : null;
      })
      .filter((c): c is NonNullable<typeof c> => c !== null)
      .sort((a, b) => b.score - a.score),
  };
}

// TODO(backend): supabase.from("review_items").select("*, documents(*)").eq("status", "Open")
export async function listReviewItems(): Promise<ReviewItemView[]> {
  await delay();
  return clone(db.reviewItems.map((r) => toView(r.id)));
}

export async function getReviewItem(id: string): Promise<ReviewItemView> {
  await delay();
  return clone(toView(id));
}

/** Other open trips a reviewer can search when none of the suggestions fit. */
export async function listOpenTrips(): Promise<TripView[]> {
  await delay(150);
  return clone(
    db.trips
      .filter((t) => !t.delivery || t.loading.at >= "2026-11-01")
      .map(toTripView)
      .reverse(),
  );
}

export type Resolution =
  | {
      action: "attach";
      tripId: string;
      corrections: { key: string; value: string }[];
      reason: string;
    }
  | { action: "create_trip"; reason: string; corrections: { key: string; value: string }[] }
  | { action: "reject"; reason: string }
  | { action: "approve_difference"; reason: string };

// TODO(backend): supabase.rpc("resolve_review_item", {...}) — server applies the change and writes audit rows.
export async function resolveReviewItem(
  id: string,
  resolution: Resolution,
): Promise<ReviewItemView> {
  await delay(500);
  const item = db.reviewItems.find((r) => r.id === id);
  if (!item) throw new NotFoundError(`Review item ${id}`);
  const doc = item.documentId ? db.documents.find((d) => d.id === item.documentId) : undefined;

  if (doc && "corrections" in resolution) {
    resolution.corrections.forEach(({ key, value }) => {
      const field = doc.fields.find((f) => f.key === key);
      if (!field || field.value === value) return;
      doc.corrections.unshift({
        field: field.label,
        from: field.value,
        to: value,
        by: actingUser(),
        at: nowIso(),
        reason: resolution.reason,
      });
      logAudit({
        action: "Corrected",
        entityType: "Document",
        entityId: doc.id,
        entityLabel: `${doc.id} · ${doc.type}`,
        changes: [{ field: field.label, from: field.value, to: value }],
        note: resolution.reason,
      });
      field.value = value;
      field.confidence = 100;
    });
  }

  if (resolution.action === "attach" && doc) {
    const trip = db.trips.find((t) => t.id === resolution.tripId);
    if (!trip) throw new NotFoundError(`Trip ${resolution.tripId}`);
    const num = (key: string) => Number(doc.fields.find((f) => f.key === key)?.value ?? NaN);
    if (doc.type === "Unloading Slip" || doc.type === "Delivery Photo") {
      const net = num("net");
      if (Number.isFinite(net)) {
        trip.delivery = {
          gross: Number.isFinite(num("gross")) ? num("gross") : 0,
          tare: Number.isFinite(num("tare")) ? num("tare") : 0,
          net,
          slipNo: doc.fields.find((f) => f.key === "slipNo")?.value ?? "—",
          at: doc.receivedAt,
          location: db.sites.find((x) => x.id === trip.siteId)?.name ?? "Site",
          source: "Weighbridge",
          documentId: doc.id,
          autoFilled: true,
        };
        const tol = db.materials.find((m) => m.id === trip.materialId)?.tolerance ?? 0;
        const diff = trip.loading.net - net;
        trip.status =
          diff <= tol ? "Delivered" : diff <= tol * 2 ? "Needs Verification" : "Confirmed Shortage";
      }
    } else if (doc.type === "Weighbridge Slip") {
      const gross = num("gross");
      const tare = num("tare");
      const net = num("net");
      if (Number.isFinite(net))
        trip.loading = { ...trip.loading, gross, tare, net, documentId: doc.id };
    }
    doc.link = { type: "Trip", id: trip.id, label: trip.id };
    doc.status = "Automatically Recorded";
    doc.timeline = doc.timeline.map((s) => ({
      ...s,
      state: "done",
      at: s.at ?? nowIso(),
      note: "",
    }));
    logAudit({
      action: "Matched",
      entityType: "Trip",
      entityId: trip.id,
      entityLabel: trip.id,
      changes: [{ field: "Document", from: "—", to: doc.id }],
      note: `Review ${id}: ${resolution.reason}`,
    });
  }
  if (resolution.action === "create_trip" && doc) {
    doc.status = "Matched";
    doc.note = "Owner asked for a new trip to be created from this document.";
    logAudit({
      action: "Updated",
      entityType: "Document",
      entityId: doc.id,
      entityLabel: doc.id,
      note: `Review ${id}: new trip requested. ${resolution.reason}`,
    });
  }
  if (resolution.action === "reject" && doc) {
    doc.status = "Failed";
    doc.note = `Rejected in review: ${resolution.reason}`;
    logAudit({
      action: "Updated",
      entityType: "Document",
      entityId: doc.id,
      entityLabel: doc.id,
      changes: [{ field: "Status", from: "Needs Review", to: "Rejected" }],
      note: resolution.reason,
    });
  }
  if (resolution.action === "approve_difference") {
    const bill = item.financial ? db.bills.find((b) => b.id === item.financial?.billId) : undefined;
    if (bill) {
      const prev = bill.reconStatus;
      bill.reconStatus = "Difference Approved";
      bill.reconNote = resolution.reason;
      logAudit({
        action: "Approved",
        entityType: bill.kind === "Provider" ? "Provider Bill" : "Transporter Bill",
        entityId: bill.id,
        entityLabel: bill.billNo,
        changes: [{ field: "Reconciliation status", from: prev, to: "Difference Approved" }],
        note: resolution.reason,
      });
    }
  }
  item.status = resolution.action === "reject" ? "Rejected" : "Resolved";
  return clone(toView(id));
}
