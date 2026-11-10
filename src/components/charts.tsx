/**
 * Chart helpers on top of Recharts.
 * Colors use validated categorical slots (--series-1..4) assigned in fixed order,
 * one y-axis per chart, a hover tooltip on every chart and a legend for 2+ series.
 */
import type { ReactNode } from "react";
import type { TooltipProps } from "recharts";
import { formatINR, formatINRCompact, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export const SERIES = [
  "var(--series-1)",
  "var(--series-2)",
  "var(--series-3)",
  "var(--series-4)",
] as const;
export const series = (i: number) => SERIES[i] ?? SERIES[0];

export const axisProps = {
  tick: { fill: "var(--muted-foreground)", fontSize: 12 },
  axisLine: false,
  tickLine: false,
} as const;

export const gridProps = {
  vertical: false,
  stroke: "var(--border)",
  strokeDasharray: "3 4",
} as const;

export type ValueFormat = "inr" | "inrCompact" | "number" | "qty" | "percent";

export function formatValue(v: number, format: ValueFormat, unit = "") {
  if (format === "inr") return formatINR(v);
  if (format === "inrCompact") return formatINRCompact(v);
  if (format === "percent") return `${v.toFixed(1)}%`;
  if (format === "qty") return `${formatNumber(v, 2)}${unit ? ` ${unit}` : ""}`;
  return formatNumber(v, Number.isInteger(v) ? 0 : 2);
}

/** Tooltip content: values in text ink, a colored key beside each series name. */
export function ChartTooltip({
  active,
  payload,
  label,
  format = "number",
  unit,
  labelFormatter,
}: TooltipProps<number, string> & {
  format?: ValueFormat;
  unit?: string;
  labelFormatter?: (l: string) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-[160px] rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-lg">
      {label !== undefined && (
        <p className="mb-1.5 font-semibold">
          {labelFormatter ? labelFormatter(String(label)) : String(label)}
        </p>
      )}
      <ul className="space-y-1">
        {payload.map((p) => (
          <li key={String(p.dataKey)} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span
                className="size-2 rounded-sm"
                style={{ backgroundColor: String(p.color ?? p.fill ?? "currentColor") }}
                aria-hidden
              />
              {p.name}
            </span>
            <span className="font-semibold tabular-nums">
              {formatValue(Number(p.value ?? 0), format, unit)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ChartLegend({
  items,
  className,
}: {
  items: { label: string; color: string; dashed?: boolean }[];
  className?: string;
}) {
  return (
    <ul
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground",
        className,
      )}
      aria-label="Chart legend"
    >
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span
            className={cn(
              "h-2.5 w-3 rounded-sm",
              i.dashed && "h-0.5 border-t-2 border-dashed bg-transparent",
            )}
            style={i.dashed ? { borderColor: i.color } : { backgroundColor: i.color }}
            aria-hidden
          />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

/** Fixed-height wrapper; Recharts' ResponsiveContainer fills it. */
export function ChartBox({
  height = 260,
  children,
  label,
}: {
  height?: number;
  children: ReactNode;
  label: string;
}) {
  return (
    <div style={{ height }} className="w-full" role="img" aria-label={label}>
      {children}
    </div>
  );
}
