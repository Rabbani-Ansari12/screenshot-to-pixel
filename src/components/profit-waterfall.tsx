import type { ProfitBreakdown } from "@/types";
import { formatINR, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Waterfall: Sales − Purchase − Transport − Loading/Unloading − Labour − Other = Profit.
 * Each cost bar starts where the previous one ended so the drop is visible.
 */
export function ProfitWaterfall({ breakdown }: { breakdown: ProfitBreakdown }) {
  const steps = [
    { label: "Sales value", value: breakdown.salesValue, kind: "total" as const },
    { label: "Purchase cost", value: -breakdown.purchaseCost, kind: "cost" as const },
    { label: "Transport", value: -breakdown.transportCost, kind: "cost" as const },
    { label: "Loading / unloading", value: -breakdown.loadingUnloading, kind: "cost" as const },
    { label: "Labour", value: -breakdown.labour, kind: "cost" as const },
    { label: "Other expenses", value: -breakdown.other, kind: "cost" as const },
  ];
  const max = Math.max(breakdown.salesValue, 1);
  let running = 0;
  const rows = steps.map((s) => {
    const start = s.kind === "total" ? 0 : running + s.value;
    const width = Math.abs(s.value);
    running = s.kind === "total" ? s.value : running + s.value;
    return { ...s, start, width };
  });
  const profit = breakdown.profit;
  return (
    <div>
      <ul className="space-y-2.5" aria-label="Profit breakdown">
        {rows.map((r) => (
          <li
            key={r.label}
            className="grid grid-cols-[130px_1fr_110px] items-center gap-3 text-sm sm:grid-cols-[170px_1fr_130px]"
          >
            <span className="text-muted-foreground">
              {r.kind === "cost" ? "− " : ""}
              {r.label}
            </span>
            <span className="relative h-6 rounded bg-muted/50" aria-hidden>
              <span
                className={cn(
                  "absolute inset-y-0 rounded",
                  r.kind === "total" ? "bg-[var(--series-1)]" : "bg-[var(--series-2)]",
                )}
                style={{
                  left: `${(r.start / max) * 100}%`,
                  width: `${Math.max((r.width / max) * 100, r.width ? 0.6 : 0)}%`,
                }}
              />
            </span>
            <span className="text-right font-medium tabular-nums">
              {r.kind === "cost" ? "−" : ""}
              {formatINR(Math.abs(r.value))}
            </span>
          </li>
        ))}
        <li className="grid grid-cols-[130px_1fr_110px] items-center gap-3 border-t pt-2.5 text-sm sm:grid-cols-[170px_1fr_130px]">
          <span className="font-semibold">= Estimated profit</span>
          <span className="relative h-6 rounded bg-muted/50" aria-hidden>
            <span
              className={cn(
                "absolute inset-y-0 left-0 rounded",
                profit >= 0 ? "bg-[var(--series-3)]" : "bg-rose-500",
              )}
              style={{ width: `${(Math.abs(profit) / max) * 100}%` }}
            />
          </span>
          <span className={cn("text-right font-bold tabular-nums", profit < 0 && "text-rose-600")}>
            {formatINR(profit)}
          </span>
        </li>
      </ul>
      <p className="mt-3 text-xs text-muted-foreground">
        Margin {formatPercent(breakdown.marginPct, 1)} of sales value.
      </p>
    </div>
  );
}
