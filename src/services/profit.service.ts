/**
 * Profit and landed cost from the database views (v_order_profit, v_monthly_profit,
 * v_landed_cost). Estimated profit = sales value − purchase − transport − expenses; customer
 * cash received is never profit. "Final Settled" only when every bill and invoice of the order
 * is reconciled and paid and the order is completed. Needs view_financial_reports.
 */
import type { MonthlyProfitView, OrderProfitView } from "@/types";
import { rows } from "./supabase/errors";
import { LIST_CAP, sb } from "./supabase/fetch";
import { toMonthlyProfitView, toOrderProfitView } from "./supabase/finance-mappers";
import { num, unitFromDb } from "./supabase/mappers";

export async function getOrderProfits(): Promise<OrderProfitView[]> {
  const list = rows(
    await sb()
      .from("v_order_profit")
      .select("*")
      .gt("trip_count", 0)
      .order("order_code", { ascending: false })
      .limit(LIST_CAP),
  );
  const items = list.length
    ? rows(
        await sb()
          .from("order_items")
          .select("order_id, unit")
          .in(
            "order_id",
            list.map((o) => o.order_id ?? ""),
          ),
      )
    : [];
  const unitOf = new Map<string, string>();
  for (const i of items) {
    const u = unitFromDb(i.unit);
    const prev = unitOf.get(i.order_id);
    unitOf.set(i.order_id, prev && prev !== u ? "mixed" : u);
  }
  return list.map((r) => toOrderProfitView(r, unitOf.get(r.order_id ?? "") ?? "MT"));
}

export async function getMonthlyProfits(): Promise<MonthlyProfitView[]> {
  const list = rows(await sb().from("v_monthly_profit").select("*").order("month"));
  return list.map(toMonthlyProfitView);
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

/** Landed cost per unit = (purchase + transport) / loaded quantity, by material and by provider. */
export async function getLandedCosts(): Promise<{
  byMaterial: LandedCostRow[];
  byProvider: LandedCostRow[];
}> {
  const list = rows(await sb().from("v_landed_cost").select("*").order("material_name"));
  const toRow = (r: (typeof list)[number]): LandedCostRow => {
    const landed = num(r.landed_per_unit);
    const selling = num(r.selling_per_unit);
    return {
      key: r.provider_id ? `${r.provider_id}|${r.material_id}` : (r.material_id ?? ""),
      label: r.provider_id
        ? `${r.provider_name ?? "Own stock"} · ${r.material_name}`
        : (r.material_name ?? ""),
      unit: unitFromDb(r.unit),
      quantity: num(r.quantity),
      purchaseRate: num(r.purchase_per_unit),
      transportPerUnit: num(r.transport_per_unit),
      landedCost: landed,
      sellingRate: selling,
      marginPerUnit: Math.round((selling - landed) * 100) / 100,
    };
  };
  const byMaterial = list.filter((r) => r.level === "material").map(toRow);
  const byProvider = list.filter((r) => r.level === "provider").map(toRow);
  return { byMaterial, byProvider };
}
