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
import { NotFoundError, actingUser, clone, db, delay, logAudit, nextId } from "./core";
import {
  profitOf,
  toInvoiceView,
  toOrderView,
  toPaymentView,
  toPurchaseView,
  toTripView,
} from "./views";

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
}

// TODO(backend): supabase.from("orders_view").select("*").order("order_date", { ascending: false })
export async function listOrders(): Promise<OrderView[]> {
  await delay();
  return clone(db.orders.map(toOrderView).reverse());
}

// TODO(backend): fetch order + related rows in one RPC.
export async function getOrder(id: string): Promise<OrderDetail> {
  await delay();
  const order = db.orders.find((o) => o.id === id);
  if (!order) throw new NotFoundError(`Order ${id}`);
  const trips = db.trips.filter((t) => t.orderId === id);
  const tripIds = new Set(trips.map((t) => t.id));
  const invoices = db.invoices.filter((i) => i.orderId === id);
  const invoiceIds = new Set(invoices.map((i) => i.id));
  const purchases = db.purchases.filter((p) => p.orderId === id);
  return clone({
    order: toOrderView(order),
    trips: trips.map(toTripView).reverse(),
    purchases: purchases.map(toPurchaseView),
    documents: db.documents.filter((d) => d.link && tripIds.has(d.link.id)),
    invoices: invoices.map(toInvoiceView),
    payments: db.payments
      .filter((p) => p.againstType === "Invoice" && invoiceIds.has(p.againstId))
      .map(toPaymentView),
    profit: profitOf(
      trips,
      db.expenses.filter((e) => e.orderId === id),
    ),
    itemProgress: order.items.map((item) => {
      const its = trips.filter((t) => t.materialId === item.materialId);
      return {
        itemId: item.id,
        dispatched: its.reduce((s, t) => s + t.loading.net, 0),
        delivered: its.reduce((s, t) => s + (t.delivery?.net ?? 0), 0),
      };
    }),
    activity: db.auditEvents
      .filter((e) => e.entityId === id || tripIds.has(e.entityId) || invoiceIds.has(e.entityId))
      .slice(0, 25),
  });
}

export async function getOrderRecord(id: string): Promise<Order> {
  await delay(120);
  const order = db.orders.find((o) => o.id === id);
  if (!order) throw new NotFoundError(`Order ${id}`);
  return clone(order);
}

// TODO(backend): supabase.from("orders").insert(...) + order_items insert in a transaction.
export async function createOrder(input: OrderInput): Promise<Order> {
  await delay(400);
  const id = nextId("ORD-2026-", db.orders);
  const order: Order = {
    ...input,
    id,
    ref: id,
    createdBy: actingUser(),
    items: input.items.map((item, i) => ({ ...item, id: `${id}-${i + 1}` })),
  };
  db.orders.push(order);
  logAudit({
    action: "Created",
    entityType: "Order",
    entityId: id,
    entityLabel: id,
    changes: [{ field: "Status", from: "—", to: order.status }],
  });
  return clone(order);
}

export async function updateOrder(id: string, input: OrderInput): Promise<Order> {
  await delay(400);
  const order = db.orders.find((o) => o.id === id);
  if (!order) throw new NotFoundError(`Order ${id}`);
  const changes = (["status", "expectedDelivery", "customerRef", "siteId"] as const)
    .filter((k) => order[k] !== input[k])
    .map((k) => ({ field: k, from: String(order[k]), to: String(input[k]) }));
  Object.assign(order, {
    ...input,
    items: input.items.map((item, i) => ({ ...item, id: `${id}-${i + 1}` })),
  });
  logAudit({ action: "Updated", entityType: "Order", entityId: id, entityLabel: id, changes });
  return clone(order);
}
