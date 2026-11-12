import type {
  AuditEvent,
  BillView,
  DocumentRecord,
  InvestigationOutcome,
  InvoiceView,
  Trip,
  TripStatus,
  TripView,
} from "@/types";
import { listEntityAudit } from "./admin.service";
import { AppError, check, rows, unwrap, unwrapMaybe } from "./supabase/errors";
import { fetchTrips, sb, tripUuid } from "./supabase/fetch";
import { outcomeToDb, toleranceToDb, toTripView, tripStatusToDb } from "./supabase/mappers";
import {
  activeFilter,
  endOfDayIST,
  ilikeTerm,
  startOfDayIST,
  type Page,
  type TableQuery,
} from "./supabase/table-query";
import { financeForTrip } from "./finance-links";

export interface TripDetail {
  trip: TripView;
  documents: DocumentRecord[];
  bills: BillView[];
  invoices: InvoiceView[];
  audit: AuditEvent[];
}

export async function listTrips(): Promise<TripView[]> {
  return fetchTrips();
}

const TRIP_SORT: Record<string, string> = {
  id: "trip_code",
  trip: "trip_code",
  date: "sort_at",
  order: "order_code",
  vehicle: "vehicle_number",
  material: "material_name",
  loaded: "loading_net",
  delivered: "delivered_net",
  difference: "quantity_difference",
  status: "status",
  transporter: "transporter_name",
  provider: "provider_name",
  driver: "driver_name",
};

/** Server-side paginated, filtered, sorted and searched trip list. */
export async function listTripsPage(q: TableQuery): Promise<Page<TripView>> {
  let query = sb().from("v_trip_list").select("*", { count: "exact" });
  if (q.search.trim()) {
    const t = ilikeTerm(q.search);
    query = query.or(
      [
        "trip_code",
        "order_code",
        "vehicle_number",
        "driver_name",
        "material_name",
        "provider_name",
        "transporter_name",
        "loading_slip_number",
        "delivery_slip_number",
        "site_name",
        "customer_name",
      ]
        .map((c) => `${c}.ilike.${t}`)
        .join(","),
    );
  }
  const status = activeFilter(q, "status");
  if (status) query = query.eq("status", tripStatusToDb(status as TripStatus));
  const material = activeFilter(q, "material");
  if (material) query = query.eq("material_id", material);
  const transporter = activeFilter(q, "transporter");
  if (transporter) query = query.eq("transporter_id", transporter);
  const vehicle = activeFilter(q, "vehicle");
  if (vehicle) query = query.eq("vehicle_id", vehicle);
  if (q.from) query = query.gte("sort_at", startOfDayIST(q.from));
  if (q.to) query = query.lte("sort_at", endOfDayIST(q.to));
  const col = (q.sort && TRIP_SORT[q.sort.id]) ?? "sort_at";
  const desc = q.sort ? q.sort.desc : true;
  const res = await query
    .order(col as "sort_at", { ascending: !desc, nullsFirst: false })
    .order("trip_code", { ascending: false })
    .range(q.page * q.pageSize, q.page * q.pageSize + q.pageSize - 1);
  const list = rows(res);
  return { rows: list.map(toTripView), total: res.count ?? list.length };
}

/** `id` is the trip code (TRP-2026-00123). */
export async function getTrip(id: string): Promise<TripDetail> {
  const row = unwrapMaybe(
    await sb().from("v_trip_list").select("*").eq("trip_code", id).maybeSingle(),
  );
  if (!row) throw new AppError(`Trip ${id} not found.`, null, "not_found");
  const trip = toTripView(row);
  const ids = [row.id, row.loading_weight_id, row.delivery_weight_id].filter((x): x is string =>
    Boolean(x),
  );
  const delivery = unwrapMaybe(
    await sb()
      .from("delivery_records")
      .select("id")
      .eq("trip_id", row.id ?? "")
      .maybeSingle(),
  );
  const [audit, finance] = await Promise.all([
    listEntityAudit([...ids, ...(delivery ? [delivery.id] : [])], 50),
    financeForTrip(row.id ?? ""),
  ]);
  return { trip, documents: [], bills: finance.bills, invoices: finance.invoices, audit };
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

const istTimestamp = (local: string) => (local.length === 16 ? `${local}:00+05:30` : local);

/** Trip + loading weight (+ delivery weight) in one transaction (RPC create_trip). */
export async function createTrip(input: TripInput): Promise<Trip> {
  const res = unwrap(
    await sb().rpc("create_trip", {
      p_trip: {
        order_id: input.orderId,
        material_id: input.materialId,
        provider_id: input.source === "provider" ? input.providerId : null,
        stock_location_id: input.source === "yard" ? input.yardId : null,
        transporter_id: input.transporterId,
        vehicle_id: input.vehicleId,
        driver_id: input.driverId || null,
        freight_amount: input.freight,
      },
      p_loading: {
        gross: input.loadingGross,
        tare: input.loadingTare,
        slip_number: input.loadingSlip,
        measured_at: istTimestamp(input.loadingAt),
        location: "Manual entry",
        measurement_method: "weighbridge",
      },
      ...(input.delivered
        ? {
            p_delivery: {
              gross: input.deliveryGross,
              tare: input.deliveryTare,
              slip_number: input.deliverySlip,
              measured_at: istTimestamp(input.deliveryAt),
              location: "Site",
              measurement_method: "weighbridge",
            },
          }
        : {}),
    }),
  ) as { id: string; trip_code: string };
  return (await getTrip(res.trip_code)).trip;
}

export interface WeightInput {
  kind: "loading" | "delivery";
  gross: number;
  tare: number;
  slipNo: string;
  at?: string;
  /** Required when correcting an existing weight; stored in the audit log. */
  reason: string;
}

/** Adds a missing weight or corrects an existing one (with a reason). Delivery checks recompute in the DB. */
export async function saveWeight(tripId: string, input: WeightInput): Promise<TripView> {
  const uuid = await tripUuid(tripId);
  check(
    await sb().rpc("save_weight_record", {
      p_trip_id: uuid,
      p_record_type: input.kind,
      p_values: {
        gross: input.gross,
        tare: input.tare,
        slip_number: input.slipNo,
        ...(input.at ? { measured_at: istTimestamp(input.at) } : {}),
      },
      p_reason: input.reason,
    }),
  );
  return (await getTrip(tripId)).trip;
}

/** Trips with a delivery difference, for the shortages page. */
export async function listShortages(): Promise<TripView[]> {
  const list = rows(
    await sb()
      .from("v_trip_list")
      .select("*")
      .gt("quantity_difference", 0)
      .order("sort_at", { ascending: false })
      .limit(1000),
  );
  return list.map(toTripView);
}

export async function recordInvestigation(
  tripId: string,
  input: {
    outcome: InvestigationOutcome;
    notes: string;
    status: "Delivered" | "Needs Verification" | "Confirmed Shortage";
  },
): Promise<Trip> {
  const uuid = await tripUuid(tripId);
  check(
    await sb().rpc("record_trip_investigation", {
      p_trip_id: uuid,
      p_outcome: outcomeToDb(input.outcome),
      p_notes: input.notes,
      p_status: tripStatusToDb(input.status),
    }),
  );
  return (await getTrip(tripId)).trip;
}

// Re-exported for pages that filter by tolerance status.
export { toleranceToDb };
