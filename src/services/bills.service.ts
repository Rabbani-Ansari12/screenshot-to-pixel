import type {
  BillKind,
  BillView,
  DocumentRecord,
  InvoiceFlag,
  InvoiceView,
  PaymentView,
  ReconStatus,
  TripView,
} from "@/types";
import { NotFoundError, clone, db, delay, logAudit } from "./core";
import {
  billRecordedLine,
  lookup,
  toBillView,
  toInvoiceView,
  toPaymentView,
  toTripView,
} from "./views";

export interface BillLineMatch {
  lineId: string | null;
  billedRef: string;
  date: string;
  vehicle: string;
  billed: { quantity: number; rate: number; amount: number } | null;
  recorded: { quantity: number; rate: number; amount: number } | null;
  tripId: string | null;
  state: "Matched" | "Quantity differs" | "Rate differs" | "Not in system" | "Missing on bill";
  reason: string;
}

export interface BillDetail {
  bill: BillView;
  lines: BillLineMatch[];
  trips: TripView[];
  payments: PaymentView[];
  document: DocumentRecord | null;
}

// TODO(backend): supabase.from("bills_view").select("*").eq("kind", kind)
export async function listBills(kind?: BillKind): Promise<BillView[]> {
  await delay();
  return clone(
    db.bills
      .filter((b) => !kind || b.kind === kind)
      .map(toBillView)
      .reverse(),
  );
}

export async function getBill(id: string): Promise<BillDetail> {
  await delay();
  const bill = db.bills.find((b) => b.id === id);
  if (!bill) throw new NotFoundError(`Bill ${id}`);
  const unit =
    bill.kind === "Provider"
      ? (lookup.material(lookup.trip(bill.expectedTripIds[0] ?? null)?.materialId ?? "")?.unit ??
        "MT")
      : "trip";
  const lines: BillLineMatch[] = bill.lines.map((l) => {
    const rec = billRecordedLine(bill, l.tripId);
    const billed = { quantity: l.quantity, rate: l.rate, amount: l.amount };
    if (!rec)
      return {
        lineId: l.id,
        billedRef: l.billedRef,
        date: l.date,
        vehicle: l.vehicle,
        billed,
        recorded: null,
        tripId: null,
        state: "Not in system",
        reason: "No trip in the system matches this bill line (slip, vehicle and date checked).",
      };
    const qtyDiff = Math.round((l.quantity - rec.quantity) * 100) / 100;
    const rateDiff = l.rate - rec.rate;
    if (Math.abs(qtyDiff) > 0.009)
      return {
        lineId: l.id,
        billedRef: l.billedRef,
        date: l.date,
        vehicle: l.vehicle,
        billed,
        recorded: rec,
        tripId: l.tripId,
        state: "Quantity differs",
        reason: `Billed ${qtyDiff > 0 ? "+" : ""}${qtyDiff} ${unit} versus the loading slip.`,
      };
    if (Math.abs(rateDiff) > 0.5)
      return {
        lineId: l.id,
        billedRef: l.billedRef,
        date: l.date,
        vehicle: l.vehicle,
        billed,
        recorded: rec,
        tripId: l.tripId,
        state: "Rate differs",
        reason: `Billed rate is ₹${rateDiff > 0 ? "+" : ""}${rateDiff} per ${unit} versus the agreed rate.`,
      };
    return {
      lineId: l.id,
      billedRef: l.billedRef,
      date: l.date,
      vehicle: l.vehicle,
      billed,
      recorded: rec,
      tripId: l.tripId,
      state: "Matched",
      reason: "",
    };
  });
  const billedTripIds = new Set(bill.lines.map((l) => l.tripId));
  bill.expectedTripIds
    .filter((t) => !billedTripIds.has(t))
    .forEach((tripId) => {
      const trip = lookup.trip(tripId);
      const rec = billRecordedLine(bill, tripId);
      lines.push({
        lineId: null,
        billedRef: trip?.loading.slipNo ?? tripId,
        date: trip?.loading.at.slice(0, 10) ?? "",
        vehicle: lookup.vehicle(trip?.vehicleId ?? "")?.plate ?? "",
        billed: null,
        recorded: rec,
        tripId,
        state: "Missing on bill",
        reason: "Trip is recorded in the system but not included in this bill.",
      });
    });
  const trips = bill.expectedTripIds
    .map((t) => lookup.trip(t))
    .filter((t): t is NonNullable<typeof t> => Boolean(t));
  return clone({
    bill: toBillView(bill),
    lines,
    trips: trips.map(toTripView),
    payments: db.payments
      .filter((p) => p.againstType === "Bill" && p.againstId === id)
      .map(toPaymentView),
    document: bill.documentId ? (db.documents.find((d) => d.id === bill.documentId) ?? null) : null,
  });
}

export type ReconAction =
  "approve_difference" | "dispute" | "request_correction" | "mark_reconciled";
const actionStatus: Record<ReconAction, ReconStatus> = {
  approve_difference: "Difference Approved",
  dispute: "Disputed",
  request_correction: "Correction Requested",
  mark_reconciled: "Reconciled",
};

/** Records the decision only. Bill lines and trip records are never modified. */
// TODO(backend): supabase.from("reconciliations").insert({ bill_id, action, note })
export async function reconcileBill(
  id: string,
  action: ReconAction,
  note: string,
): Promise<BillView> {
  await delay(400);
  const bill = db.bills.find((b) => b.id === id);
  if (!bill) throw new NotFoundError(`Bill ${id}`);
  const prev = bill.reconStatus;
  bill.reconStatus = actionStatus[action];
  bill.reconNote = note;
  logAudit({
    action:
      action === "dispute"
        ? "Disputed"
        : action === "approve_difference"
          ? "Approved"
          : action === "mark_reconciled"
            ? "Reconciled"
            : "Updated",
    entityType: bill.kind === "Provider" ? "Provider Bill" : "Transporter Bill",
    entityId: id,
    entityLabel: bill.billNo,
    changes: [{ field: "Reconciliation status", from: prev, to: bill.reconStatus }],
    note,
  });
  const review = db.reviewItems.find((r) => r.financial?.billId === id && r.status === "Open");
  if (review && action !== "request_correction") review.status = "Resolved";
  return clone(toBillView(bill));
}

// ---------- Customer invoice verification ----------
export interface InvoiceCheck {
  flag: InvoiceFlag;
  passed: boolean;
  detail: string;
}

export interface InvoiceVerification {
  invoice: InvoiceView;
  checks: InvoiceCheck[];
  lines: {
    lineId: string;
    material: string;
    invoicedQty: number;
    deliveredQty: number;
    invoicedRate: number;
    orderRate: number;
    unit: string;
    tripIds: string[];
  }[];
}

export async function getInvoiceVerification(id: string): Promise<InvoiceVerification> {
  await delay();
  const inv = db.invoices.find((i) => i.id === id);
  if (!inv) throw new NotFoundError(`Invoice ${id}`);
  const order = lookup.order(inv.orderId);
  const lines = inv.lines.map((l) => {
    const trips = l.tripIds
      .map((t) => lookup.trip(t))
      .filter((t): t is NonNullable<typeof t> => Boolean(t));
    return {
      lineId: l.id,
      material: lookup.material(l.materialId)?.name ?? l.materialId,
      unit: l.unit,
      invoicedQty: l.quantity,
      deliveredQty: Math.round(trips.reduce((s, t) => s + (t.delivery?.net ?? 0), 0) * 100) / 100,
      invoicedRate: l.rate,
      orderRate: order?.items.find((i) => i.materialId === l.materialId)?.sellingRate ?? l.rate,
      tripIds: l.tripIds,
    };
  });
  const allTrips = inv.lines
    .flatMap((l) => l.tripIds)
    .map((t) => lookup.trip(t))
    .filter((t): t is NonNullable<typeof t> => Boolean(t));
  const missing = allTrips.filter((t) => !t.delivery);
  const foreign = allTrips.filter((t) => t.orderId !== inv.orderId);
  const others = db.invoices.filter((o) => o.id !== inv.id);
  const dup = others.find((o) =>
    o.lines.some((l) => l.tripIds.some((t) => inv.lines.some((x) => x.tripIds.includes(t)))),
  );
  const excess = lines.filter((l) => l.invoicedQty - l.deliveredQty > 0.05);
  const wrongRate = lines.filter((l) => l.invoicedRate !== l.orderRate);
  const deliveredValue = lines.reduce((s, l) => s + l.deliveredQty * l.orderRate, 0);
  const invoicedValue = lines.reduce((s, l) => s + l.invoicedQty * l.invoicedRate, 0);
  const checks: InvoiceCheck[] = [
    {
      flag: "Excess quantity",
      passed: !excess.length,
      detail: excess.length
        ? excess
            .map(
              (l) =>
                `${l.material}: invoiced ${l.invoicedQty} vs delivered ${l.deliveredQty} ${l.unit}`,
            )
            .join("; ")
        : "Invoiced quantity matches delivery slips.",
    },
    {
      flag: "Missing delivery records",
      passed: !missing.length,
      detail: missing.length
        ? `${missing.map((t) => t.id).join(", ")} has no delivery slip yet.`
        : "Every trip has a delivery record.",
    },
    {
      flag: "Wrong rate",
      passed: !wrongRate.length,
      detail: wrongRate.length
        ? wrongRate
            .map((l) => `${l.material}: ₹${l.invoicedRate} vs order ₹${l.orderRate}`)
            .join("; ")
        : "Rates match the order.",
    },
    {
      flag: "Duplicate invoice",
      passed: !dup,
      detail: dup
        ? `Trips already billed on ${dup.number}.`
        : "No other invoice contains these trips.",
    },
    {
      flag: "Amount difference",
      passed: Math.abs(invoicedValue - deliveredValue) < 1,
      detail:
        Math.abs(invoicedValue - deliveredValue) < 1
          ? "Amount matches delivered value."
          : `Invoice value differs from delivered value by ₹${Math.round(invoicedValue - deliveredValue).toLocaleString("en-IN")}.`,
    },
    {
      flag: "Order mismatch",
      passed: !foreign.length,
      detail: foreign.length
        ? `${foreign.map((t) => `${t.id} (${t.orderId})`).join(", ")} belongs to another order.`
        : "All trips belong to this order.",
    },
  ];
  return clone({ invoice: toInvoiceView(inv), checks, lines });
}

export async function reconcileInvoice(
  id: string,
  action: ReconAction,
  note: string,
): Promise<InvoiceView> {
  await delay(400);
  const inv = db.invoices.find((i) => i.id === id);
  if (!inv) throw new NotFoundError(`Invoice ${id}`);
  const prev = inv.reconStatus;
  inv.reconStatus = actionStatus[action];
  logAudit({
    action: action === "mark_reconciled" ? "Reconciled" : "Updated",
    entityType: "Invoice",
    entityId: id,
    entityLabel: inv.number,
    changes: [{ field: "Verification status", from: prev, to: inv.reconStatus }],
    note,
  });
  return clone(toInvoiceView(inv));
}
