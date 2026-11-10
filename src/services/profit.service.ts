import type { MonthlyProfitView, OrderProfitView } from "@/types";
import { formatMonth } from "@/lib/format";
import { clone, db, delay } from "./core";
import { lookup, profitOf, toInvoiceView, toOrderView, tripPurchaseCost } from "./views";

/** Profit per order. "Final Settled" only when the order is complete and every invoice is paid. */
// TODO(backend): supabase.rpc("order_profit")
export async function getOrderProfits(): Promise<OrderProfitView[]> {
  await delay();
  return clone(
    db.orders
      .filter((o) => db.trips.some((t) => t.orderId === o.id))
      .map((order) => {
        const trips = db.trips.filter((t) => t.orderId === order.id);
        const breakdown = profitOf(
          trips,
          db.expenses.filter((e) => e.orderId === order.id),
        );
        const invoices = db.invoices.filter((i) => i.orderId === order.id).map(toInvoiceView);
        const settled =
          order.status === "Completed" &&
          trips.every((t) => t.delivery) &&
          invoices.length > 0 &&
          invoices.every((i) => i.paymentStatus === "Paid");
        const view = toOrderView(order);
        return {
          ...breakdown,
          orderId: order.id,
          orderRef: order.ref,
          customerName: view.customerName,
          status: settled ? ("Final Settled" as const) : ("Estimated" as const),
          deliveredQty: view.deliveredQty,
          unitLabel: view.unitLabel,
        };
      })
      .reverse(),
  );
}

/** Month-wise P&L. Trips count in the month they were delivered (or loaded, if still on the road). */
export async function getMonthlyProfits(): Promise<MonthlyProfitView[]> {
  await delay();
  const months = [
    ...new Set(db.trips.map((t) => (t.delivery?.at ?? t.loading.at).slice(0, 7))),
  ].sort();
  return clone(
    months.map((month) => {
      const trips = db.trips.filter((t) => (t.delivery?.at ?? t.loading.at).startsWith(month));
      const expenses = db.expenses.filter((e) => e.date.startsWith(month));
      return {
        ...profitOf(trips, expenses),
        month,
        label: formatMonth(month),
        status: month < "2026-10" ? ("Final Settled" as const) : ("Estimated" as const),
      };
    }),
  );
}

export interface LandedCostRow {
  key: string;
  label: string;
  unit: string;
  quantity: number;
  purchaseRate: number;
  transportPerUnit: number;
  landedCost: number;
  sellingRate: number;
  marginPerUnit: number;
}

export async function getLandedCosts(): Promise<{
  byMaterial: LandedCostRow[];
  byProvider: LandedCostRow[];
}> {
  await delay();
  const build = (key: string, label: string, trips: typeof db.trips): LandedCostRow => {
    const qty = trips.reduce((s, t) => s + t.loading.net, 0) || 1;
    const purchase = trips.reduce((s, t) => s + tripPurchaseCost(t), 0) / qty;
    const transport = trips.reduce((s, t) => s + t.freight, 0) / qty;
    const selling =
      trips.reduce(
        (s, t) =>
          s +
          (lookup.order(t.orderId)?.items.find((i) => i.materialId === t.materialId)?.sellingRate ??
            0) *
            t.loading.net,
        0,
      ) / qty;
    const unit = lookup.material(trips[0]?.materialId ?? "")?.unit ?? "MT";
    return {
      key,
      label,
      unit,
      quantity: Math.round(qty * 100) / 100,
      purchaseRate: Math.round(purchase),
      transportPerUnit: Math.round(transport),
      landedCost: Math.round(purchase + transport),
      sellingRate: Math.round(selling),
      marginPerUnit: Math.round(selling - purchase - transport),
    };
  };
  const byMaterial = db.materials
    .map((m) => ({ m, trips: db.trips.filter((t) => t.materialId === m.id) }))
    .filter((x) => x.trips.length)
    .map(({ m, trips }) => build(m.id, m.name, trips));
  const byProvider = db.providers.flatMap((p) =>
    db.materials
      .map((m) => ({
        m,
        trips: db.trips.filter((t) => t.providerId === p.id && t.materialId === m.id && !t.yardId),
      }))
      .filter((x) => x.trips.length >= 2)
      .map(({ m, trips }) => build(`${p.id}|${m.id}`, `${p.name} · ${m.name}`, trips)),
  );
  return clone({ byMaterial, byProvider });
}
