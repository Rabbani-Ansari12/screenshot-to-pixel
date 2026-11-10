import type {
  AuditEvent,
  BillView,
  DocumentRecord,
  InvestigationOutcome,
  InvoiceView,
  Trip,
  TripView,
  WeighRecord,
} from "@/types";
import { NotFoundError, actingUser, clone, db, delay, logAudit, nextId, nowIso } from "./core";
import { lookup, toBillView, toInvoiceView, toTripView } from "./views";

export interface TripDetail {
  trip: TripView;
  documents: DocumentRecord[];
  bills: BillView[];
  invoices: InvoiceView[];
  audit: AuditEvent[];
}

// TODO(backend): supabase.from("trips_view").select("*").order("loaded_at", { ascending: false })
export async function listTrips(): Promise<TripView[]> {
  await delay();
  return clone(db.trips.map(toTripView).reverse());
}

export async function getTrip(id: string): Promise<TripDetail> {
  await delay();
  const trip = db.trips.find((t) => t.id === id);
  if (!trip) throw new NotFoundError(`Trip ${id}`);
  return clone({
    trip: toTripView(trip),
    documents: db.documents.filter(
      (d) =>
        d.link?.id === id || d.id === trip.loading.documentId || d.id === trip.delivery?.documentId,
    ),
    bills: db.bills
      .filter((b) => b.lines.some((l) => l.tripId === id) || b.expectedTripIds.includes(id))
      .map(toBillView),
    invoices: db.invoices
      .filter((i) => i.lines.some((l) => l.tripIds.includes(id)))
      .map(toInvoiceView),
    audit: db.auditEvents.filter((e) => e.entityId === id),
  });
}

export interface TripInput {
  orderId: string;
  materialId: string;
  source: "provider" | "yard";
  providerId: string;
  yardId: string | null;
  transporterId: string;
  vehicleId: string;
  driverId: string;
  loadingGross: number;
  loadingTare: number;
  loadingSlip: string;
  loadingAt: string;
  delivered: boolean;
  deliveryGross: number;
  deliveryTare: number;
  deliverySlip: string;
  deliveryAt: string;
  freight: number;
}

// TODO(backend): supabase.from("trips").insert(...) — manual fallback when WhatsApp is unavailable.
export async function createTrip(input: TripInput): Promise<Trip> {
  await delay(400);
  const order = lookup.order(input.orderId);
  if (!order) throw new NotFoundError(`Order ${input.orderId}`);
  const id = nextId("TRP-2026-", db.trips, 5);
  const record = (
    gross: number,
    tare: number,
    slipNo: string,
    at: string,
    location: string,
  ): WeighRecord => ({
    gross,
    tare,
    net: Math.round((gross - tare) * 100) / 100,
    slipNo,
    at: `${at}:00+05:30`,
    location,
    source: "Manual Entry",
    documentId: null,
    autoFilled: false,
  });
  const purchase = db.purchases.find(
    (p) =>
      p.orderId === order.id &&
      p.materialId === input.materialId &&
      p.providerId === input.providerId,
  );
  const trip: Trip = {
    id,
    orderId: order.id,
    materialId: input.materialId,
    providerId: input.providerId,
    purchaseId: input.source === "provider" ? (purchase?.id ?? null) : null,
    yardId: input.source === "yard" ? input.yardId : null,
    transporterId: input.transporterId,
    vehicleId: input.vehicleId,
    driverId: input.driverId,
    siteId: order.siteId,
    loading: record(
      input.loadingGross,
      input.loadingTare,
      input.loadingSlip,
      input.loadingAt,
      "Manual entry",
    ),
    delivery: input.delivered
      ? record(
          input.deliveryGross,
          input.deliveryTare,
          input.deliverySlip,
          input.deliveryAt,
          lookup.site(order.siteId)?.name ?? "Site",
        )
      : null,
    status: input.delivered ? "Delivered" : "In Transit",
    freight: input.freight,
    createdVia: "Manual",
    investigation: null,
  };
  db.trips.push(trip);
  logAudit({
    action: "Created",
    entityType: "Trip",
    entityId: id,
    entityLabel: id,
    changes: [{ field: "Loaded", from: "—", to: `${trip.loading.net}` }],
    note: "Manual entry (WhatsApp fallback)",
  });
  return clone(trip);
}

/** Trips with a delivery difference, for the shortages page. */
export async function listShortages(): Promise<TripView[]> {
  await delay();
  return clone(
    db.trips
      .filter((t) => t.delivery)
      .map(toTripView)
      .filter((t) => (t.difference ?? 0) > 0)
      .reverse(),
  );
}

// TODO(backend): supabase.from("trip_investigations").upsert(...)
export async function recordInvestigation(
  tripId: string,
  input: {
    outcome: InvestigationOutcome;
    notes: string;
    status: "Delivered" | "Needs Verification" | "Confirmed Shortage";
  },
): Promise<Trip> {
  await delay(350);
  const trip = db.trips.find((t) => t.id === tripId);
  if (!trip) throw new NotFoundError(`Trip ${tripId}`);
  const previous = trip.investigation?.outcome ?? "—";
  const prevStatus = trip.status;
  trip.investigation = {
    outcome: input.outcome,
    notes: input.notes,
    by: actingUser(),
    at: nowIso(),
  };
  trip.status = input.status;
  logAudit({
    action: "Updated",
    entityType: "Trip",
    entityId: tripId,
    entityLabel: tripId,
    changes: [
      { field: "Shortage outcome", from: previous, to: input.outcome },
      { field: "Status", from: prevStatus, to: input.status },
    ],
    note: input.notes,
  });
  return clone(trip);
}
