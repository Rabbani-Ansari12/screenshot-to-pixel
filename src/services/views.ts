/** Builders that turn stored records into the view models pages display. */
import type {
  Bill,
  BillView,
  Expense,
  ExpenseView,
  Invoice,
  InvoiceView,
  Order,
  OrderView,
  Payment,
  PaymentStatus,
  PaymentView,
  ProfitBreakdown,
  Purchase,
  PurchaseView,
  ShortageStatus,
  Trip,
  TripView,
} from "@/types";
import { DEMO_TODAY } from "@/lib/format";
import { db } from "./core";

const find = <T extends { id: string }>(items: T[], id: string | null | undefined) =>
  id ? items.find((i) => i.id === id) : undefined;
const r2 = (n: number) => Math.round(n * 100) / 100;
const daysPast = (date: string) =>
  Math.max(
    0,
    Math.round(
      (Date.parse(`${DEMO_TODAY}T00:00:00Z`) - Date.parse(`${date.slice(0, 10)}T00:00:00Z`)) /
        86_400_000,
    ),
  );

export const lookup = {
  material: (id: string) => find(db.materials, id),
  customer: (id: string) => find(db.customers, id),
  site: (id: string) => find(db.sites, id),
  provider: (id: string) => find(db.providers, id),
  transporter: (id: string) => find(db.transporters, id),
  vehicle: (id: string) => find(db.vehicles, id),
  driver: (id: string) => find(db.drivers, id),
  yard: (id: string | null) => find(db.yards, id),
  order: (id: string) => find(db.orders, id),
  purchase: (id: string | null) => find(db.purchases, id),
  trip: (id: string | null) => find(db.trips, id),
  partyName: (type: "Customer" | "Provider" | "Transporter", id: string) =>
    (type === "Customer"
      ? find(db.customers, id)
      : type === "Provider"
        ? find(db.providers, id)
        : find(db.transporters, id)
    )?.name ?? id,
};

export function shortageStatusOf(difference: number, tolerance: number): ShortageStatus {
  if (difference <= tolerance) return "Normal";
  if (difference <= tolerance * 2) return "Needs Verification";
  return "Confirmed Shortage";
}

export function toTripView(trip: Trip): TripView {
  const order = lookup.order(trip.orderId);
  const material = lookup.material(trip.materialId);
  const tolerance = material?.tolerance ?? 0;
  const deliveredQty = trip.delivery?.net ?? null;
  const difference = deliveredQty === null ? null : r2(trip.loading.net - deliveredQty);
  const documentCount = db.documents.filter(
    (d) => d.link?.type === "Trip" && d.link.id === trip.id,
  ).length;
  return {
    ...trip,
    orderRef: order?.ref ?? trip.orderId,
    customerId: order?.customerId ?? "",
    customerName: lookup.customer(order?.customerId ?? "")?.name ?? "—",
    siteName: lookup.site(trip.siteId)?.name ?? "—",
    materialName: material?.name ?? trip.materialId,
    unit: material?.unit ?? "MT",
    providerName: lookup.provider(trip.providerId)?.name ?? "—",
    yardName: lookup.yard(trip.yardId)?.name ?? null,
    transporterName: lookup.transporter(trip.transporterId)?.name ?? "—",
    vehiclePlate: lookup.vehicle(trip.vehicleId)?.plate ?? "—",
    driverName: lookup.driver(trip.driverId)?.name ?? "—",
    loadedQty: trip.loading.net,
    deliveredQty,
    difference,
    tolerance,
    shortageStatus: difference === null ? null : shortageStatusOf(difference, tolerance),
    documentCount,
  };
}

/** Purchase cost of one trip (material + share of additional costs). */
export function tripPurchaseCost(trip: Trip): number {
  const purchase = lookup.purchase(trip.purchaseId);
  if (purchase) {
    const tripsInPurchase = db.trips.filter((t) => t.purchaseId === purchase.id).length || 1;
    const extras = purchase.additionalCosts.reduce((s, c) => s + c.amount, 0);
    return trip.loading.net * purchase.rate + extras / tripsInPurchase;
  }
  // Issued from yard: weighted average landed rate of yard purchases of the material.
  const yardPurchases = db.purchases.filter(
    (p) =>
      p.deliveryMode === "Stock-Yard" &&
      p.materialId === trip.materialId &&
      p.yardId === trip.yardId,
  );
  const qty = yardPurchases.reduce((s, p) => s + p.quantity, 0);
  const cost = yardPurchases.reduce(
    (s, p) => s + p.quantity * p.rate + p.additionalCosts.reduce((a, c) => a + c.amount, 0),
    0,
  );
  return (
    trip.loading.net * (qty ? cost / qty : (lookup.material(trip.materialId)?.purchaseRate ?? 0))
  );
}

/** Sales value of one trip using the authoritative weight setting. */
export function tripSalesValue(trip: Trip): number {
  const order = lookup.order(trip.orderId);
  const rate =
    order?.items.find((i) => i.materialId === trip.materialId)?.sellingRate ??
    lookup.material(trip.materialId)?.sellingRate ??
    0;
  const qty =
    db.settings.authoritativeWeight === "Delivery"
      ? (trip.delivery?.net ?? trip.loading.net)
      : trip.loading.net;
  return qty * rate;
}

export function profitOf(trips: Trip[], expenses: Expense[]): ProfitBreakdown {
  const salesValue = trips.reduce((s, t) => s + tripSalesValue(t), 0);
  const purchaseCost = trips.reduce((s, t) => s + tripPurchaseCost(t), 0);
  const transportCost = trips.reduce((s, t) => s + t.freight, 0);
  const sum = (cats: string[]) =>
    expenses.filter((e) => cats.includes(e.category)).reduce((s, e) => s + e.amount, 0);
  const loadingUnloading = sum(["Loading", "Unloading"]);
  const labour = sum(["Labour"]);
  const other = sum(["Fuel", "Toll", "Waiting Charges", "Other"]);
  const profit = salesValue - purchaseCost - transportCost - loadingUnloading - labour - other;
  return {
    salesValue: Math.round(salesValue),
    purchaseCost: Math.round(purchaseCost),
    transportCost: Math.round(transportCost),
    loadingUnloading,
    labour,
    other,
    profit: Math.round(profit),
    marginPct: salesValue ? (profit / salesValue) * 100 : 0,
  };
}

export function toOrderView(order: Order): OrderView {
  const trips = db.trips.filter((t) => t.orderId === order.id);
  const units = [...new Set(order.items.map((i) => i.unit))];
  const sameUnit = units.length === 1;
  const materialNames = order.items.map((i) => lookup.material(i.materialId)?.name ?? i.materialId);
  const orderValue = order.items.reduce((s, i) => s + i.quantity * i.sellingRate, 0);
  const expenses = db.expenses.filter((e) => e.orderId === order.id);
  return {
    ...order,
    customerName: lookup.customer(order.customerId)?.name ?? "—",
    siteName: lookup.site(order.siteId)?.name ?? "—",
    materialsLabel: materialNames.join(", "),
    unitLabel: sameUnit ? (units[0] ?? "MT") : "mixed",
    requiredQty: r2(order.items.reduce((s, i) => s + i.quantity, 0)),
    dispatchedQty: r2(trips.reduce((s, t) => s + t.loading.net, 0)),
    deliveredQty: r2(trips.reduce((s, t) => s + (t.delivery?.net ?? 0), 0)),
    orderValue,
    estimatedProfit: profitOf(trips, expenses).profit,
    tripCount: trips.length,
  };
}

export function toPurchaseView(p: Purchase): PurchaseView {
  const order = p.orderId ? lookup.order(p.orderId) : undefined;
  const baseAmount = Math.round(p.quantity * p.rate);
  const additionalTotal = p.additionalCosts.reduce((s, c) => s + c.amount, 0);
  return {
    ...p,
    providerName: lookup.provider(p.providerId)?.name ?? "—",
    materialName: lookup.material(p.materialId)?.name ?? p.materialId,
    orderRef: order?.ref ?? null,
    customerName: order ? (lookup.customer(order.customerId)?.name ?? null) : null,
    yardName: lookup.yard(p.yardId)?.name ?? null,
    baseAmount,
    additionalTotal,
    totalAmount: baseAmount + additionalTotal,
    landedRate: p.quantity ? (baseAmount + additionalTotal) / p.quantity : 0,
    tripCount: db.trips.filter((t) => t.purchaseId === p.id).length,
  };
}

function paymentStatus(total: number, paid: number): PaymentStatus {
  if (paid <= 0) return "Unpaid";
  if (paid + 1 >= total) return "Paid";
  return "Partial";
}

export function billRecordedLine(bill: Bill, tripId: string | null) {
  const trip = lookup.trip(tripId);
  if (!trip) return null;
  if (bill.kind === "Provider") {
    const rate = lookup.purchase(trip.purchaseId)?.rate ?? 0;
    return { quantity: trip.loading.net, rate, amount: Math.round(trip.loading.net * rate) };
  }
  return { quantity: 1, rate: trip.freight, amount: trip.freight };
}

export function toBillView(bill: Bill): BillView {
  const billedSubtotal = bill.lines.reduce((s, l) => s + l.amount, 0);
  const taxAmount = Math.round((billedSubtotal * bill.taxRate) / 100);
  const total = billedSubtotal + taxAmount;
  const paid = db.payments
    .filter((p) => p.againstType === "Bill" && p.againstId === bill.id)
    .reduce((s, p) => s + p.amount, 0);
  const expected = bill.expectedTripIds
    .map((id) => lookup.trip(id))
    .filter((t): t is Trip => Boolean(t));
  const recordedSubtotal = expected.reduce(
    (s, t) => s + (billRecordedLine(bill, t.id)?.amount ?? 0),
    0,
  );
  const billedTripIds = new Set(bill.lines.map((l) => l.tripId).filter(Boolean));
  const outstanding = Math.max(0, total - paid);
  return {
    ...bill,
    partyName: lookup.partyName(bill.kind, bill.partyId),
    billedQuantity: r2(bill.lines.reduce((s, l) => s + l.quantity, 0)),
    billedTrips: bill.lines.filter((l) => l.tripId || l.billedRef.includes("/")).length,
    billedSubtotal,
    taxAmount,
    total,
    paid,
    outstanding,
    paymentStatus: paymentStatus(total, paid),
    recordedQuantity: r2(
      expected.reduce((s, t) => s + (bill.kind === "Provider" ? t.loading.net : 1), 0),
    ),
    recordedSubtotal,
    recordedTrips: expected.length,
    difference: billedSubtotal - recordedSubtotal,
    unmatchedLineCount: bill.lines.filter((l) => !l.tripId).length,
    missingTripIds: expected.filter((t) => !billedTripIds.has(t.id)).map((t) => t.id),
    overdueDays: outstanding > 0 ? daysPast(bill.dueDate) : 0,
  };
}

export function invoiceAmounts(inv: Pick<Invoice, "lines" | "additionalCharges" | "gstMode">) {
  const subtotal = inv.lines.reduce((s, l) => s + l.quantity * l.rate, 0);
  const additionalTotal = inv.additionalCharges.reduce((s, c) => s + c.amount, 0);
  const taxAmount =
    inv.gstMode === "None"
      ? 0
      : inv.lines.reduce((s, l) => s + (l.quantity * l.rate * l.gstRate) / 100, 0);
  return {
    subtotal: Math.round(subtotal),
    additionalTotal,
    taxAmount: Math.round(taxAmount),
    total: Math.round(subtotal + additionalTotal + taxAmount),
  };
}

export function toInvoiceView(inv: Invoice): InvoiceView {
  const amounts = invoiceAmounts(inv);
  const paid = db.payments
    .filter((p) => p.againstType === "Invoice" && p.againstId === inv.id)
    .reduce((s, p) => s + p.amount, 0);
  const balance = Math.max(0, amounts.total - paid);
  return {
    ...inv,
    ...amounts,
    customerName: lookup.customer(inv.customerId)?.name ?? "—",
    siteName: lookup.site(inv.siteId)?.name ?? "—",
    orderRef: lookup.order(inv.orderId)?.ref ?? inv.orderId,
    quantity: r2(inv.lines.reduce((s, l) => s + l.quantity, 0)),
    paid,
    balance,
    paymentStatus: paymentStatus(amounts.total, paid),
    overdueDays: balance > 0 ? daysPast(inv.dueDate) : 0,
  };
}

export function toPaymentView(p: Payment): PaymentView {
  const against =
    p.againstType === "Invoice"
      ? db.invoices.find((i) => i.id === p.againstId)?.number
      : db.bills.find((b) => b.id === p.againstId)?.billNo;
  return {
    ...p,
    partyName: lookup.partyName(p.partyType, p.partyId),
    againstLabel: against ?? p.againstId,
  };
}

export function toExpenseView(e: Expense): ExpenseView {
  return {
    ...e,
    orderRef: e.orderId ? (lookup.order(e.orderId)?.ref ?? e.orderId) : null,
    tripRef: e.tripId,
  };
}
