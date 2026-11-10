import type { StockMovementView, Unit, Yard } from "@/types";
import { clone, db, delay } from "./core";
import { lookup } from "./views";

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

/** Yard stock only. Direct-to-site deliveries never touch these balances. */
// TODO(backend): supabase.rpc("stock_balances", { yard_id })
export async function getStock(
  yardId: string | "all",
): Promise<{ yards: Yard[]; balances: StockBalance[]; movements: StockMovementView[] }> {
  await delay();
  const movements = db.stockMovements
    .filter((m) => yardId === "all" || m.yardId === yardId)
    .sort((a, b) => a.date.localeCompare(b.date));
  const running = new Map<string, number>();
  const views: StockMovementView[] = movements.map((m) => {
    const key = `${m.yardId}|${m.materialId}`;
    const balance = Math.round(((running.get(key) ?? 0) + m.quantity) * 100) / 100;
    running.set(key, balance);
    const material = lookup.material(m.materialId);
    return {
      ...m,
      materialName: material?.name ?? m.materialId,
      unit: material?.unit ?? "MT",
      yardName: lookup.yard(m.yardId)?.name ?? m.yardId,
      balance,
    };
  });
  const balances: StockBalance[] = db.materials
    .map((material) => {
      const ms = movements.filter((m) => m.materialId === material.id);
      const sum = (type: string) =>
        ms.filter((m) => m.type === type).reduce((s, m) => s + m.quantity, 0);
      const received = sum("Received");
      const issued = -sum("Issued");
      const adjusted = sum("Adjustment");
      return {
        materialId: material.id,
        materialName: material.name,
        unit: material.unit,
        received,
        issued,
        adjusted,
        balance: Math.round((received - issued + adjusted) * 100) / 100,
        lastMovement: ms[ms.length - 1]?.date ?? null,
      };
    })
    .filter((b) => b.received > 0);
  return clone({ yards: db.yards, balances, movements: views.reverse() });
}
