import type { StockMovementView, Unit, Yard } from "@/types";
import { check, rows } from "./supabase/errors";
import { sb } from "./supabase/fetch";
import { num, toStockMovementView, toYard, unitFromDb } from "./supabase/mappers";

export interface StockBalance {
  materialId: string;
  materialName: string;
  unit: Unit;
  received: number;
  issued: number;
  adjusted: number;
  balance: number;
  lastMovement: string | null;
}

/** Yard stock only. Direct-to-site deliveries never touch these balances (enforced in the database). */
export async function getStock(
  yardId: string | "all",
): Promise<{ yards: Yard[]; balances: StockBalance[]; movements: StockMovementView[] }> {
  let balances = sb().from("v_stock_balance").select("*");
  let ledger = sb().from("v_stock_ledger").select("*");
  if (yardId !== "all") {
    balances = balances.eq("stock_location_id", yardId);
    ledger = ledger.eq("stock_location_id", yardId);
  }
  const [y, b, l] = await Promise.all([
    sb().from("stock_locations").select("*").is("deleted_at", null).order("name"),
    balances,
    ledger
      .order("movement_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  // One balance per material across the selected yard(s). Units never mix: a material has one unit.
  const byMaterial = new Map<string, StockBalance>();
  for (const r of rows(b)) {
    const key = r.material_id ?? "";
    const cur = byMaterial.get(key) ?? {
      materialId: key,
      materialName: r.material_name ?? "",
      unit: unitFromDb(r.unit),
      received: 0,
      issued: 0,
      adjusted: 0,
      balance: 0,
      lastMovement: null,
    };
    cur.received += num(r.received_qty);
    cur.issued += num(r.issued_qty);
    cur.adjusted += num(r.adjusted_qty);
    cur.balance = Math.round((cur.balance + num(r.balance_qty)) * 1000) / 1000;
    if (r.last_movement_date && (!cur.lastMovement || r.last_movement_date > cur.lastMovement))
      cur.lastMovement = r.last_movement_date;
    byMaterial.set(key, cur);
  }
  return {
    yards: rows(y).map(toYard),
    balances: [...byMaterial.values()].filter((x) => x.received > 0 || x.balance !== 0),
    movements: rows(l).map(toStockMovementView),
  };
}

export interface StockAdjustmentInput {
  yardId: string;
  materialId: string;
  /** Positive adds, negative removes (e.g. after a physical count). */
  quantity: number;
  date: string;
  reason: string;
}

/** Owner only; the reason is stored in the audit log. Purchases and trips are never changed. */
export async function adjustStock(input: StockAdjustmentInput): Promise<void> {
  check(
    await sb().rpc("adjust_stock", {
      p_location_id: input.yardId,
      p_material_id: input.materialId,
      p_quantity: input.quantity,
      p_date: input.date,
      p_reason: input.reason,
    }),
  );
}
