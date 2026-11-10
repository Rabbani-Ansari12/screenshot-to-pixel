import { CheckCircle2, XCircle } from "lucide-react";
import { formatINR, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface ComparisonRow {
  label: string;
  billed: number | null;
  recorded: number | null;
  format: "inr" | "qty" | "number";
  unit?: string;
  /** Explanation shown when the values differ. */
  reason?: string;
}

const fmt = (v: number | null, row: ComparisonRow) => {
  if (v === null) return "—";
  if (row.format === "inr") return formatINR(v);
  if (row.format === "qty") return `${formatNumber(v, 2)} ${row.unit ?? ""}`.trim();
  return formatNumber(v);
};

/**
 * Billed vs Recorded comparison. A positive difference (billed more than
 * recorded) is red; billed less is shown in amber; equal is green.
 */
export function ComparisonTable({
  rows,
  leftLabel = "Billed",
  rightLabel = "Recorded in system",
}: {
  rows: ComparisonRow[];
  leftLabel?: string;
  rightLabel?: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-xs text-muted-foreground">
            <th scope="col" className="py-2 pr-4 text-left font-semibold">
              Check
            </th>
            <th scope="col" className="px-4 py-2 text-right font-semibold">
              {leftLabel}
            </th>
            <th scope="col" className="px-4 py-2 text-right font-semibold">
              {rightLabel}
            </th>
            <th scope="col" className="px-4 py-2 text-right font-semibold">
              Difference
            </th>
            <th scope="col" className="py-2 pl-4 text-left font-semibold">
              Reason
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const diff =
              row.billed !== null && row.recorded !== null
                ? Math.round((row.billed - row.recorded) * 100) / 100
                : null;
            const ok = diff !== null && Math.abs(diff) < 0.01;
            return (
              <tr key={row.label} className="border-b last:border-0">
                <th scope="row" className="py-3 pr-4 text-left font-medium">
                  {row.label}
                </th>
                <td className="px-4 py-3 text-right tabular-nums">{fmt(row.billed, row)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{fmt(row.recorded, row)}</td>
                <td
                  className={cn(
                    "px-4 py-3 text-right font-semibold tabular-nums",
                    ok
                      ? "text-emerald-700 dark:text-emerald-300"
                      : diff !== null && diff > 0
                        ? "text-rose-700 dark:text-rose-300"
                        : "text-amber-700 dark:text-amber-300",
                  )}
                >
                  <span className="inline-flex items-center gap-1.5">
                    {ok ? (
                      <CheckCircle2 className="size-4" aria-hidden />
                    ) : (
                      <XCircle className="size-4" aria-hidden />
                    )}
                    {ok
                      ? "Matches"
                      : diff === null
                        ? "—"
                        : `${diff > 0 ? "+" : "−"}${fmt(Math.abs(diff), row)}`}
                  </span>
                </td>
                <td className="py-3 pl-4 text-xs text-muted-foreground">
                  {ok ? "" : (row.reason ?? "")}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
