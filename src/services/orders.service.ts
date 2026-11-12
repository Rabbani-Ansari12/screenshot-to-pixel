import type {
  AuditEvent,
  DocumentRecord,
  InvoiceView,
  Order,
  OrderItem,
  OrderStatus,
  OrderView,
  PaymentView,
  ProfitBreakdown,
  PurchaseView,
  TripView,
} from "@/types";
import { AppError, rows, unwrap, unwrapMaybe } from "./supabase/errors";
import { fetchOrders, fetchPurchases, fetchTrips, orderItemsFor, sb } from "./supabase/fetch";
import { num, orderPayload, orderStatusToDb, toOrder, toOrderView } from "./supabase/mappers";
import { activeFilter, ilikeTerm, type Page, type TableQuery } from "./supabase/table-query";
import { listEntityAudit } from "./admin.service";
import { invoicesWhere, paymentsAgainstAny } from "./finance-links";

export interface OrderDetail {
  order: OrderView;
  trips: TripView[];
  purchases: PurchaseView[];
  documents: DocumentRecord[];
  invoices: InvoiceView[];
  payments: PaymentView[];
  profit: ProfitBreakdown;
  itemProgress: { itemId: string; dispatched: number; delivered: number }[];
  activity: AuditEvent[];
}

export interface OrderInput {
  customerId: string;
  siteId: string;
  orderDate: string;
  customerRef: string;
  expectedDelivery: string;
  status: OrderStatus;
  notes: string;
  items: Omit<OrderItem, "id">[];
  /** Required when an existing quantity or rate changes (stored in the audit log). */
  reason?: string;
}

export async function listOrders(): Promise<OrderView[]> {
  return fetchOrders();
}

const ORDER_SORT: Record<string, string> = {
  ref: "order_code",
  order: "order_code",
  customer: "customer_name",
  date: "order_date",
  orderDate: "order_date",
  expected: "expected_delivery",
  status: "status",
  value: "order_value",
  progress: "delivered_qty",
  materials: "materials_label",
  profit: "estimated_profit",
};

/** Server-side paginated, filtered, sorted and searched order list. */
export async function listOrdersPage(q: TableQuery): Promise<Page<OrderView>> {
  let query = sb().from("v_order_list").select("*", { count: "exact" });
  if (q.search.trim()) {
    const t = ilikeTerm(q.search);
    query = query.or(
      `order_code.ilike.${t},customer_name.ilike.${t},site_name.ilike.${t},customer_reference.ilike.${t},materials_label.ilike.${t}`,
    );
  }
  const status = activeFilter(q, "status");
  if (status) query = query.eq("status", orderStatusToDb(status as OrderStatus));
  const customer = activeFilter(q, "customer");
  if (customer) query = query.eq("customer_id", customer);
  const material = activeFilter(q, "material");
  if (material) query = query.contains("material_ids", [material]);
  if (q.from) query = query.gte("order_date", q.from);
  if (q.to) query = query.lte("order_date", q.to);
  const col = (q.sort && ORDER_SORT[q.sort.id]) ?? "order_date";
  const desc = q.sort ? q.sort.desc : true;
  const res = await query
    .order(col as "order_date", { ascending: !desc })
    .order("created_at", { ascending: false })
    .range(q.page * q.pageSize, q.page * q.pageSize + q.pageSize - 1);
  const list = rows(res);
  const items = await orderItemsFor(list.map((r) => r.id ?? "").filter(Boolean));
  return { rows: list.map((r) => toOrderView(r, items)), total: res.count ?? list.length };
}

async function orderRow(id: string) {
  const row = unwrapMaybe(await sb().from("v_order_list").select("*").eq("id", id).maybeSingle());
  if (!row) throw new AppError("Order not found.", null, "not_found");
  return row;
}

export async function getOrder(id: string): Promise<OrderDetail> {
  const [row, items, trips, purchases, profitRow, progress] = await Promise.all([
    orderRow(id),
    orderItemsFor([id]),
    fetchTrips({ order_id: id }),
    fetchPurchases({ order_id: id }),
    sb().from("v_order_profit").select("*").eq("order_id", id).maybeSingle(),
    sb().from("v_order_progress").select("*").eq("order_id", id),
  ]);
  const p = unwrapMaybe(profitRow);
  const salesValue = num(p?.sales_value);
  const profit = num(p?.estimated_profit);
  const tripUuids = trips.map((t) => t.uuid ?? "").filter(Boolean);
  const [activity, invoices] = await Promise.all([
    listEntityAudit([id, ...items.map((i) => i.id), ...tripUuids], 25),
    invoicesWhere({ order_id: id }),
  ]);
  const payments = await paymentsAgainstAny(invoices.map((i) => i.id));
  return {
    order: toOrderView(row, items),
    trips,
    purchases,
    documents: [],
    invoices,
    payments,
    profit: {
      salesValue,
      purchaseCost: num(p?.purchase_cost),
      transportCost: num(p?.transport_cost),
      loadingUnloading: num(p?.loading_unloading_cost),
      labour: num(p?.labour_cost),
      other: num(p?.other_expenses),
      profit,
      marginPct: salesValue ? (profit / salesValue) * 100 : 0,
    },
    itemProgress: rows(progress).map((x) => ({
      itemId: x.order_item_id ?? "",
      dispatched: num(x.dispatched_qty),
      delivered: num(x.delivered_qty),
    })),
    activity,
  };
}

export async function getOrderRecord(id: string): Promise<Order> {
  const [row, items] = await Promise.all([orderRow(id), orderItemsFor([id])]);
  return toOrder(row, items);
}

/** Creates the order and all its items in one transaction (RPC create_order). */
export async function createOrder(input: OrderInput): Promise<Order> {
  const payload = orderPayload(input);
  const res = unwrap(
    await sb().rpc("create_order", { p_order: payload.order, p_items: payload.items }),
  ) as { id: string };
  return getOrderRecord(res.id);
}

/** Updates header + items in one transaction. Quantity / rate changes need input.reason. */
export async function updateOrder(id: string, input: OrderInput): Promise<Order> {
  const payload = orderPayload(input);
  unwrap(
    await sb().rpc("update_order", {
      p_order_id: id,
      p_order: payload.order,
      p_items: payload.items,
      ...(input.reason ? { p_reason: input.reason } : {}),
    }),
  );
  return getOrderRecord(id);
}

export interface OrderSummary {
  active: number;
  activeTrips: number;
  completed: number;
  onHold: number;
  openValue: number;
}

/** KPI tiles on the orders page (independent of the table's current page). */
export async function getOrderSummary(): Promise<OrderSummary> {
  const list = rows(await sb().from("v_order_list").select("status, trip_count, order_value"));
  const active = list.filter((o) => o.status === "confirmed" || o.status === "in_progress");
  return {
    active: active.length,
    activeTrips: active.reduce((s, o) => s + num(o.trip_count), 0),
    completed: list.filter((o) => o.status === "completed").length,
    onHold: list.filter((o) => o.status === "on_hold").length,
    openValue: active.reduce((s, o) => s + num(o.order_value), 0),
  };
}
