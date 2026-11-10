/**
 * Shared Supabase reads used by several services (trips, orders, purchases appear on many pages).
 * Everything goes through RLS with the signed-in user's session.
 */
import { getSupabase } from "@/lib/supabase";
import type { OrderView, PurchaseView, TripView } from "@/types";
import { rows as list, unwrapMaybe } from "./errors";
import { toOrderView, toPurchaseView, toTripView } from "./mappers";

export const sb = () => getSupabase();

/** Equality filters on view columns, e.g. { customer_id: "…" }. */
export type Eq = Record<string, string | boolean>;

/** Hard cap for "all rows" reads that feed non-paginated widgets (detail tabs, pickers). */
export const LIST_CAP = 1000;

export async function fetchTrips(eq: Eq = {}, limit = LIST_CAP): Promise<TripView[]> {
  let q = sb().from("v_trip_list").select("*");
  for (const [k, v] of Object.entries(eq)) q = q.eq(k as "id", v as string);
  const rows = list(await q.order("sort_at", { ascending: false }).limit(limit));
  return rows.map(toTripView);
}

export async function fetchTripsIn(column: "id" | "purchase_id" | "order_id", ids: string[]) {
  if (!ids.length) return [];
  const rows = list(
    await sb()
      .from("v_trip_list")
      .select("*")
      .in(column, ids)
      .order("sort_at", { ascending: false }),
  );
  return rows.map(toTripView);
}

/** Trips are addressed by their code in the UI; this resolves code → database id. */
export async function tripUuid(code: string): Promise<string> {
  const row = unwrapMaybe(
    await sb().from("truck_trips").select("id").eq("trip_code", code).maybeSingle(),
  );
  if (!row) throw new Error(`Trip ${code} not found.`);
  return row.id;
}

export async function orderItemsFor(orderIds: string[]) {
  if (!orderIds.length) return [];
  return list(await sb().from("order_items").select("*").in("order_id", orderIds));
}

export async function fetchOrders(eq: Eq = {}, limit = LIST_CAP): Promise<OrderView[]> {
  let q = sb().from("v_order_list").select("*");
  for (const [k, v] of Object.entries(eq)) q = q.eq(k as "id", v as string);
  const rows = list(
    await q
      .order("order_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(limit),
  );
  const items = await orderItemsFor(rows.map((r) => r.id ?? "").filter(Boolean));
  return rows.map((r) => toOrderView(r, items));
}

export async function fetchOrdersIn(ids: string[]): Promise<OrderView[]> {
  if (!ids.length) return [];
  const rows = list(await sb().from("v_order_list").select("*").in("id", ids));
  const items = await orderItemsFor(ids);
  return rows.map((r) => toOrderView(r, items));
}

export async function fetchPurchases(eq: Eq = {}, limit = LIST_CAP): Promise<PurchaseView[]> {
  let q = sb().from("v_purchase_list").select("*");
  for (const [k, v] of Object.entries(eq)) q = q.eq(k as "id", v as string);
  const rows = list(
    await q
      .order("purchase_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(limit),
  );
  return rows.map(toPurchaseView);
}

/** Groups rows into a lookup by key. */
export function indexBy<T, K extends string>(rows: T[], key: (r: T) => K | null | undefined) {
  const map = new Map<K, T>();
  for (const r of rows) {
    const k = key(r);
    if (k) map.set(k, r);
  }
  return map;
}
