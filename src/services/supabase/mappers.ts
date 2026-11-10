/**
 * Pure mappers between database rows (snake_case, enums) and the frontend types.
 * No network here, so these are unit-tested directly (src/test/mappers.test.ts).
 */
import type {
  Customer,
  CustomerType,
  DeliveryMode,
  Driver,
  InvestigationOutcome,
  Material,
  MaterialCategory,
  MeasurementSource,
  Order,
  OrderItem,
  OrderStatus,
  OrderView,
  Provider,
  PurchaseStatus,
  PurchaseView,
  RatePoint,
  ShortageStatus,
  Site,
  StockMovementView,
  Transporter,
  TripStatus,
  TripView,
  Unit,
  Vehicle,
  WeighRecord,
  Yard,
} from "@/types";
import type { Enums, Tables, Views } from "@/lib/supabase";

type DbUnit = Enums<"material_unit">;

// ---------- Enums ----------
const UNIT_TO_UI: Record<DbUnit, Unit> = {
  MT: "MT",
  CFT: "CFT",
  BRASS: "Brass",
  CUM: "m³",
  TRIP: "Trips",
  BAG: "Bags",
  NOS: "Nos",
};
const UNIT_TO_DB = Object.fromEntries(
  Object.entries(UNIT_TO_UI).map(([db, ui]) => [ui, db]),
) as Record<Unit, DbUnit>;

export const unitFromDb = (u: DbUnit | null | undefined): Unit => (u ? UNIT_TO_UI[u] : "MT");
export const unitToDb = (u: Unit): DbUnit => UNIT_TO_DB[u];

/** Weight (MT) and volume / count units are never converted into each other. */
export const UNIT_FAMILY: Record<Unit, "weight" | "volume" | "count"> = {
  MT: "weight",
  CFT: "volume",
  Brass: "volume",
  "m³": "volume",
  Trips: "count",
  Bags: "count",
  Nos: "count",
};

/** Quantities can only be compared or added when the unit is exactly the same. */
export function unitMismatchMessage(
  expected: Unit,
  actual: Unit,
  what = "This material",
): string | null {
  if (expected === actual) return null;
  return `${what} is traded in ${expected}, not ${actual}. Quantities are never converted between units (no MT ↔ volume conversion).`;
}

function invert<A extends string, B extends string>(m: Record<A, B>): Record<B, A> {
  return Object.fromEntries(Object.entries(m).map(([a, b]) => [b, a])) as Record<B, A>;
}

const ORDER_STATUS: Record<Enums<"order_status">, OrderStatus> = {
  draft: "Draft",
  confirmed: "Confirmed",
  in_progress: "In Progress",
  completed: "Completed",
  on_hold: "On Hold",
  cancelled: "Cancelled",
};
export const orderStatusFromDb = (s: Enums<"order_status"> | null) =>
  ORDER_STATUS[s ?? "confirmed"];
export const orderStatusToDb = (s: OrderStatus) => invert(ORDER_STATUS)[s];

const PURCHASE_STATUS: Record<Enums<"purchase_status">, PurchaseStatus> = {
  recorded: "Recorded",
  needs_verification: "Needs Verification",
  billed: "Billed",
  cancelled: "Cancelled",
};
export const purchaseStatusFromDb = (s: Enums<"purchase_status"> | null) =>
  PURCHASE_STATUS[s ?? "recorded"];
export const purchaseStatusToDb = (s: PurchaseStatus) => invert(PURCHASE_STATUS)[s];

const TRIP_STATUS: Record<Enums<"trip_status">, TripStatus> = {
  loaded: "Loaded",
  in_transit: "In Transit",
  delivered: "Delivered",
  needs_verification: "Needs Verification",
  confirmed_shortage: "Confirmed Shortage",
  cancelled: "Cancelled",
};
export const tripStatusFromDb = (s: Enums<"trip_status"> | null) => TRIP_STATUS[s ?? "loaded"];
export const tripStatusToDb = (s: TripStatus) => invert(TRIP_STATUS)[s];

const TOLERANCE: Record<Enums<"tolerance_status">, ShortageStatus> = {
  normal: "Normal",
  needs_verification: "Needs Verification",
  confirmed_shortage: "Confirmed Shortage",
};
export const toleranceFromDb = (s: Enums<"tolerance_status"> | null): ShortageStatus | null =>
  s ? TOLERANCE[s] : null;
export const toleranceToDb = (s: ShortageStatus) => invert(TOLERANCE)[s];

const OUTCOME: Record<Enums<"investigation_outcome">, InvestigationOutcome> = {
  under_investigation: "Under investigation",
  weighbridge_calibration_difference: "Weighbridge calibration difference",
  moisture_or_spillage_loss: "Moisture / spillage loss",
  site_measurement_difference: "Site measurement difference",
  recovered_from_transporter: "Recovered from transporter",
  accepted_as_normal_loss: "Accepted as normal loss",
};
export const outcomeFromDb = (o: Enums<"investigation_outcome"> | null) => (o ? OUTCOME[o] : null);
export const outcomeToDb = (o: InvestigationOutcome) => invert(OUTCOME)[o];

const DELIVERY_MODE: Record<Enums<"delivery_mode">, DeliveryMode> = {
  direct_to_site: "Direct-to-Site",
  stock_yard: "Stock-Yard",
};
export const deliveryModeFromDb = (m: Enums<"delivery_mode"> | null) =>
  DELIVERY_MODE[m ?? "direct_to_site"];
export const deliveryModeToDb = (m: DeliveryMode) => invert(DELIVERY_MODE)[m];

const METHOD: Record<Enums<"measurement_method">, MeasurementSource> = {
  weighbridge: "Weighbridge",
  site_measurement: "Site Measurement",
  manual_entry: "Manual Entry",
  count: "Manual Entry",
};
export const methodFromDb = (m: Enums<"measurement_method"> | null) => METHOD[m ?? "weighbridge"];
export const methodToDb = (m: MeasurementSource): Enums<"measurement_method"> =>
  m === "Weighbridge"
    ? "weighbridge"
    : m === "Site Measurement"
      ? "site_measurement"
      : "manual_entry";

export const sourceFromDb = (s: Enums<"record_source"> | null) =>
  s === "document" ? ("Document" as const) : ("Manual" as const);

// ---------- Small helpers ----------
export const num = (v: number | string | null | undefined): number => {
  const n = typeof v === "string" ? Number(v) : (v ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const numOrNull = (v: number | string | null | undefined): number | null =>
  v === null || v === undefined ? null : num(v);
const r2 = (n: number) => Math.round(n * 100) / 100;
const str = (v: string | null | undefined) => v ?? "";

// ---------- Masters ----------
const CUSTOMER_TYPES: CustomerType[] = ["Builder", "Infrastructure", "Contractor", "Industrial"];

export function toCustomer(r: Tables<"customers">): Customer {
  return {
    id: r.id,
    name: r.name,
    type: (CUSTOMER_TYPES as string[]).includes(r.customer_type ?? "")
      ? (r.customer_type as CustomerType)
      : "Builder",
    gstin: str(r.gstin),
    contactName: str(r.contact_name),
    phone: str(r.phone),
    email: str(r.email),
    city: str(r.city),
    state: str(r.state),
    billingAddress: str(r.billing_address),
    creditDays: r.credit_days,
    active: r.is_active,
    createdAt: r.created_at.slice(0, 10),
  };
}

export function toSite(r: Tables<"construction_sites">): Site {
  return {
    id: r.id,
    customerId: r.customer_id,
    name: r.name,
    address: str(r.address),
    city: str(r.city),
    contactName: str(r.contact_name),
    contactPhone: str(r.contact_phone),
    active: r.is_active,
  };
}

/** Rate history from material_rates: one point per date, carrying the other rate forward. */
export function toRateHistory(
  rates: Pick<Tables<"material_rates">, "rate_type" | "rate" | "effective_from" | "provider_id">[],
): RatePoint[] {
  const sorted = [...rates]
    .filter((r) => r.rate_type === "selling" || r.provider_id === null)
    .sort((a, b) => a.effective_from.localeCompare(b.effective_from));
  const points: RatePoint[] = [];
  let purchaseRate = 0;
  let sellingRate = 0;
  for (const r of sorted) {
    if (r.rate_type === "purchase") purchaseRate = num(r.rate);
    else sellingRate = num(r.rate);
    const last = points[points.length - 1];
    if (last && last.date === r.effective_from) Object.assign(last, { purchaseRate, sellingRate });
    else points.push({ date: r.effective_from, purchaseRate, sellingRate });
  }
  return points;
}

export function toMaterial(
  r: Tables<"materials">,
  rates: Parameters<typeof toRateHistory>[0] = [],
): Material {
  return {
    id: r.id,
    name: r.name,
    category: r.category as MaterialCategory,
    unit: unitFromDb(r.unit),
    hsn: str(r.hsn_code),
    gstRate: num(r.gst_rate),
    purchaseRate: num(r.purchase_rate),
    sellingRate: num(r.selling_rate),
    tolerance: num(r.shortage_tolerance),
    rateHistory: toRateHistory(rates),
    active: r.is_active,
  };
}

export function toProvider(r: Tables<"material_providers">, materialIds: string[] = []): Provider {
  return {
    id: r.id,
    name: r.name,
    city: str(r.city),
    gstin: str(r.gstin),
    contactName: str(r.contact_name),
    phone: str(r.phone),
    materialIds,
    paymentTermsDays: r.payment_terms_days,
    active: r.is_active,
  };
}

export function toTransporter(r: Tables<"transporters">): Transporter {
  return {
    id: r.id,
    name: r.name,
    city: str(r.city),
    gstin: str(r.gstin),
    contactName: str(r.contact_name),
    phone: str(r.phone),
    ratePerTrip: num(r.rate_per_trip),
    active: r.is_active,
  };
}

export function toDriver(r: Tables<"drivers">): Driver {
  return {
    id: r.id,
    name: r.full_name,
    phone: str(r.phone),
    licenseNo: str(r.license_number),
    transporterId: r.transporter_id,
  };
}

export function toVehicle(r: Tables<"vehicles">): Vehicle {
  return {
    id: r.id,
    plate: r.vehicle_number,
    transporterId: r.transporter_id,
    driverId: str(r.default_driver_id),
    type: str(r.vehicle_type),
    capacity: num(r.capacity_mt),
    active: r.is_active,
  };
}

export function toYard(r: Tables<"stock_locations">): Yard {
  return { id: r.id, name: r.name, location: str(r.address) };
}

// ---------- Orders ----------
export function toOrderItem(r: Tables<"order_items">): OrderItem {
  return {
    id: r.id,
    materialId: r.material_id,
    quantity: num(r.quantity),
    unit: unitFromDb(r.unit),
    sellingRate: num(r.selling_rate),
  };
}

export function toOrder(r: Views<"v_order_list">, items: Tables<"order_items">[]): Order {
  return {
    id: str(r.id),
    ref: str(r.order_code),
    customerId: str(r.customer_id),
    siteId: str(r.site_id),
    orderDate: str(r.order_date),
    customerRef: str(r.customer_reference),
    expectedDelivery: str(r.expected_delivery) || str(r.order_date),
    status: orderStatusFromDb(r.status),
    items: items
      .filter((i) => i.order_id === r.id)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map(toOrderItem),
    notes: str(r.notes),
    createdBy: str(r.created_by_name),
  };
}

export function toOrderView(r: Views<"v_order_list">, items: Tables<"order_items">[]): OrderView {
  const unitLabel =
    r.unit_label && r.unit_label !== "mixed" ? unitFromDb(r.unit_label as DbUnit) : "mixed";
  return {
    ...toOrder(r, items),
    customerName: str(r.customer_name),
    siteName: str(r.site_name),
    materialsLabel: str(r.materials_label),
    unitLabel,
    requiredQty: num(r.required_qty),
    dispatchedQty: num(r.dispatched_qty),
    deliveredQty: num(r.delivered_qty),
    orderValue: num(r.order_value),
    estimatedProfit: num(r.estimated_profit),
    tripCount: num(r.trip_count),
  };
}

/** Form values → RPC payloads (create_order / update_order). */
export function orderPayload(input: {
  customerId: string;
  siteId: string;
  orderDate: string;
  customerRef: string;
  expectedDelivery: string;
  status: OrderStatus;
  notes: string;
  items: Omit<OrderItem, "id">[];
}) {
  return {
    order: {
      customer_id: input.customerId,
      site_id: input.siteId,
      order_date: input.orderDate,
      customer_reference: input.customerRef,
      expected_delivery: input.expectedDelivery || null,
      status: orderStatusToDb(input.status),
      notes: input.notes,
    },
    items: input.items.map((i) => ({
      material_id: i.materialId,
      quantity: i.quantity,
      unit: unitToDb(i.unit),
      selling_rate: i.sellingRate,
    })),
  };
}

// ---------- Purchases ----------
interface CostLine {
  label: string;
  amount: number;
}
function costBreakdown(json: unknown, total: number): CostLine[] {
  const lines = Array.isArray(json)
    ? json
        .filter(
          (c): c is { label?: unknown; amount?: unknown } => typeof c === "object" && c !== null,
        )
        .map((c) => ({ label: String(c.label ?? "Other"), amount: num(c.amount as number) }))
    : [];
  if (!lines.length && total > 0) return [{ label: "Additional costs", amount: total }];
  return lines;
}

export function toPurchaseView(r: Views<"v_purchase_list">): PurchaseView {
  const quantity = num(r.quantity);
  const additionalTotal = num(r.additional_costs);
  const baseAmount = num(r.base_amount);
  const totalAmount = num(r.total_amount);
  return {
    id: str(r.id),
    ref: str(r.purchase_code),
    providerId: str(r.provider_id),
    materialId: str(r.material_id),
    orderId: r.order_id,
    date: str(r.purchase_date),
    quantity,
    unit: unitFromDb(r.unit),
    rate: num(r.rate),
    additionalCosts: costBreakdown(r.cost_breakdown, additionalTotal),
    deliveryMode: deliveryModeFromDb(r.delivery_mode),
    yardId: r.stock_location_id,
    documentIds: r.document_ids ?? [],
    status: purchaseStatusFromDb(r.status),
    source: sourceFromDb(r.source),
    providerName: str(r.provider_name),
    materialName: str(r.material_name),
    orderRef: r.order_code,
    customerName: r.customer_name,
    yardName: r.stock_location_name,
    baseAmount,
    additionalTotal,
    totalAmount,
    landedRate: quantity ? r2(totalAmount / quantity) : 0,
    tripCount: num(r.trip_count),
  };
}

// ---------- Trips ----------
function weigh(r: Views<"v_trip_list">, kind: "loading" | "delivery"): WeighRecord | null {
  const L = kind === "loading";
  const id = L ? r.loading_weight_id : r.delivery_weight_id;
  if (!id) return null;
  const net = num(L ? r.loading_net : r.delivered_net);
  const gross = numOrNull(L ? r.loading_gross : r.delivery_gross);
  const tare = numOrNull(L ? r.loading_tare : r.delivery_tare);
  const source = L ? r.loading_source : r.delivery_source;
  return {
    // Printed / measured quantity only (no gross & tare): show it as gross with zero tare.
    gross: gross ?? net,
    tare: tare ?? 0,
    net,
    slipNo: str(L ? r.loading_slip_number : r.delivery_slip_number),
    at: str(L ? r.loaded_at : r.delivered_at),
    location: str(L ? r.loading_location : r.delivery_location),
    source: methodFromDb(L ? r.loading_method : r.delivery_method),
    documentId: L ? r.loading_document_id : r.delivery_document_id,
    autoFilled: source === "document",
  };
}

const EMPTY_WEIGH: WeighRecord = {
  gross: 0,
  tare: 0,
  net: 0,
  slipNo: "",
  at: "",
  location: "",
  source: "Manual Entry",
  documentId: null,
  autoFilled: false,
};

export function toTripView(r: Views<"v_trip_list">): TripView {
  const loading = weigh(r, "loading") ?? { ...EMPTY_WEIGH, at: str(r.created_at) };
  const delivery = weigh(r, "delivery");
  const outcome = outcomeFromDb(r.investigation_outcome);
  return {
    id: str(r.trip_code),
    uuid: str(r.id),
    orderId: str(r.order_id),
    materialId: str(r.material_id),
    providerId: str(r.provider_id),
    purchaseId: r.purchase_id,
    yardId: r.stock_location_id,
    transporterId: str(r.transporter_id),
    vehicleId: str(r.vehicle_id),
    driverId: str(r.driver_id),
    siteId: str(r.site_id),
    loading,
    delivery,
    status: tripStatusFromDb(r.status),
    freight: num(r.freight_amount),
    createdVia: sourceFromDb(r.source),
    investigation: outcome
      ? {
          outcome,
          notes: str(r.investigation_notes),
          by: str(r.investigated_by_name) || "—",
          at: str(r.investigated_at),
        }
      : null,
    orderRef: str(r.order_code),
    customerId: str(r.customer_id),
    customerName: str(r.customer_name) || "—",
    siteName: str(r.site_name) || "—",
    materialName: str(r.material_name),
    unit: unitFromDb(r.unit),
    providerName: r.provider_name ?? (r.stock_location_name ? "Own stock" : "—"),
    yardName: r.stock_location_name,
    transporterName: str(r.transporter_name) || "—",
    vehiclePlate: str(r.vehicle_number) || "—",
    driverName: str(r.driver_name) || "—",
    loadedQty: loading.net,
    deliveredQty: delivery ? delivery.net : null,
    difference: numOrNull(r.quantity_difference),
    tolerance: num(r.tolerance),
    shortageStatus: toleranceFromDb(r.tolerance_status),
    documentCount: num(r.document_count),
  };
}

// ---------- Stock ----------
export function toStockMovementView(r: Views<"v_stock_ledger">): StockMovementView {
  const type =
    r.movement_type === "received"
      ? "Received"
      : r.movement_type === "issued"
        ? "Issued"
        : "Adjustment";
  const referenceType =
    r.reference_type === "purchase"
      ? "Purchase"
      : r.reference_type === "trip"
        ? "Trip"
        : "Adjustment";
  return {
    id: str(r.id),
    yardId: str(r.stock_location_id),
    materialId: str(r.material_id),
    date: str(r.movement_date),
    type,
    quantity: num(r.quantity),
    referenceType,
    // Trips are addressed by trip code; purchases by id.
    referenceId:
      referenceType === "Trip" ? str(r.reference_code) : str(r.reference_id) || str(r.id),
    referenceLabel: str(r.reference_code) || (referenceType === "Adjustment" ? "Adjustment" : ""),
    note: str(r.notes) || (r.reference_code ? `${referenceType} ${r.reference_code}` : ""),
    materialName: str(r.material_name),
    unit: unitFromDb(r.unit),
    yardName: str(r.stock_location_name),
    balance: num(r.balance_after),
  };
}
