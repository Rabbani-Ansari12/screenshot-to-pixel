import type {
  AdditionalCost,
  DeliveryMode,
  DocumentRecord,
  Purchase,
  PurchaseStatus,
  PurchaseView,
  TripView,
  Unit,
} from "@/types";
import { AppError, rows, unwrap, unwrapMaybe } from "./supabase/errors";
import { fetchPurchases, fetchTripsIn, sb } from "./supabase/fetch";
import {
  deliveryModeToDb,
  num,
  purchaseStatusToDb,
  toPurchaseView,
  unitToDb,
} from "./supabase/mappers";
import { activeFilter, ilikeTerm, type Page, type TableQuery } from "./supabase/table-query";

export interface PurchaseInput {
  providerId: string;
  materialId: string;
  orderId: string | null;
  date: string;
  quantity: number;
  unit: Unit;
  rate: number;
  additionalCosts: AdditionalCost[];
  deliveryMode: DeliveryMode;
  yardId: string | null;
}

export interface RatePointView {
  date: string;
  rate: number;
  ref: string;
  quantity: number;
}

export async function listPurchases(): Promise<PurchaseView[]> {
  return fetchPurchases();
}

const PURCHASE_SORT: Record<string, string> = {
  ref: "purchase_code",
  date: "purchase_date",
  provider: "provider_name",
  material: "material_name",
  quantity: "quantity",
  qty: "quantity",
  order: "order_code",
  rate: "rate",
  total: "total_amount",
  amount: "total_amount",
  mode: "delivery_mode",
  status: "status",
};

/** Server-side paginated, filtered, sorted and searched purchase list. */
export async function listPurchasesPage(q: TableQuery): Promise<Page<PurchaseView>> {
  let query = sb().from("v_purchase_list").select("*", { count: "exact" });
  if (q.search.trim()) {
    const t = ilikeTerm(q.search);
    query = query.or(
      `purchase_code.ilike.${t},provider_name.ilike.${t},material_name.ilike.${t},order_code.ilike.${t},customer_name.ilike.${t},stock_location_name.ilike.${t}`,
    );
  }
  const mode = activeFilter(q, "mode");
  if (mode) query = query.eq("delivery_mode", deliveryModeToDb(mode as DeliveryMode));
  const provider = activeFilter(q, "provider");
  if (provider) query = query.eq("provider_id", provider);
  const material = activeFilter(q, "material");
  if (material) query = query.eq("material_id", material);
  const status = activeFilter(q, "status");
  if (status) query = query.eq("status", purchaseStatusToDb(status as PurchaseStatus));
  if (q.from) query = query.gte("purchase_date", q.from);
  if (q.to) query = query.lte("purchase_date", q.to);
  const col = (q.sort && PURCHASE_SORT[q.sort.id]) ?? "purchase_date";
  const desc = q.sort ? q.sort.desc : true;
  const res = await query
    .order(col as "purchase_date", { ascending: !desc })
    .order("created_at", { ascending: false })
    .range(q.page * q.pageSize, q.page * q.pageSize + q.pageSize - 1);
  const list = rows(res);
  return { rows: list.map(toPurchaseView), total: res.count ?? list.length };
}

export async function getPurchase(id: string): Promise<{
  purchase: PurchaseView;
  trips: TripView[];
  documents: DocumentRecord[];
  rateHistory: RatePointView[];
}> {
  const row = unwrapMaybe(
    await sb().from("v_purchase_list").select("*").eq("id", id).maybeSingle(),
  );
  if (!row) throw new AppError("Purchase not found.", null, "not_found");
  const purchase = toPurchaseView(row);
  const [trips, rateHistory] = await Promise.all([
    fetchTripsIn("purchase_id", [id]),
    getRateHistory(purchase.providerId, purchase.materialId),
  ]);
  // Documents move to Supabase with the documents module.
  return { purchase, trips, documents: [], rateHistory };
}

/** Historical purchase rates for a provider + material (used by the form chart). */
export async function getRateHistory(
  providerId: string,
  materialId: string,
): Promise<RatePointView[]> {
  if (!providerId || !materialId) return [];
  const list = rows(
    await sb()
      .from("v_purchase_list")
      .select("purchase_date, rate, purchase_code, quantity")
      .eq("provider_id", providerId)
      .eq("material_id", materialId)
      .order("purchase_date")
      .limit(200),
  );
  return list.map((r) => ({
    date: r.purchase_date ?? "",
    rate: num(r.rate),
    ref: r.purchase_code ?? "",
    quantity: num(r.quantity),
  }));
}

/** Purchase + item in one transaction (RPC create_purchase). Yard purchases add stock; direct-to-site never. */
export async function createPurchase(input: PurchaseInput): Promise<Purchase> {
  const res = unwrap(
    await sb().rpc("create_purchase", {
      p_purchase: {
        provider_id: input.providerId,
        order_id: input.deliveryMode === "Direct-to-Site" ? input.orderId : null,
        purchase_date: input.date,
        delivery_mode: deliveryModeToDb(input.deliveryMode),
        stock_location_id: input.deliveryMode === "Stock-Yard" ? input.yardId : null,
      },
      p_items: [
        {
          material_id: input.materialId,
          quantity: input.quantity,
          unit: unitToDb(input.unit),
          rate: input.rate,
          cost_breakdown: input.additionalCosts
            .filter((c) => c.amount > 0)
            .map((c) => ({ label: c.label, amount: c.amount })),
        },
      ],
    }),
  ) as { id: string };
  return (await getPurchase(res.id)).purchase;
}
