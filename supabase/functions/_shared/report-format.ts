// Pure helpers for report exports (tested with Vitest): report ids, request schema and the
// table of display strings / raw values that the Excel and PDF builders consume.
import { z } from "./zod.ts";

export const REPORT_IDS = [
  "daily",
  "monthly",
  "customer",
  "material",
  "provider-purchase",
  "transporter-expense",
  "vehicle-trips",
  "shortage",
  "pending-bills",
  "customer-outstanding",
  "payables",
  "expense",
  "order-pl",
  "monthly-pl",
] as const;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use yyyy-MM-dd");
export const ExportRequest = z.object({
  report: z.enum(REPORT_IDS),
  format: z.enum(["xlsx", "pdf"]),
  from: isoDate.nullable().optional(),
  to: isoDate.nullable().optional(),
  filters: z
    .object({
      customer_id: z.string().uuid().optional(),
      material_id: z.string().uuid().optional(),
      provider_id: z.string().uuid().optional(),
      transporter_id: z.string().uuid().optional(),
      vehicle_id: z.string().uuid().optional(),
    })
    .strict()
    .default({}),
});
export type ExportRequest = z.infer<typeof ExportRequest>;

export type ColumnFormat = "text" | "inr" | "number" | "qty" | "percent" | "date";
export interface ReportResult {
  id: string;
  title: string;
  from: string | null;
  to: string | null;
  columns: { key: string; label: string; format: ColumnFormat }[];
  rows: Record<string, string | number | null>[];
  summary: { label: string; value: number; format: ColumnFormat }[];
  generatedAt: string;
}

/** Indian digit grouping: 12,34,567.89 */
export function groupIndian(n: number, digits = 2): string {
  const neg = n < 0;
  const [int, frac] = Math.abs(n).toFixed(digits).split(".");
  const last3 = int!.slice(-3);
  const rest = int!.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  const body = rest ? `${rest},${last3}` : last3;
  return `${neg ? "-" : ""}${body}${frac ? `.${frac}` : ""}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** yyyy-MM-dd → dd MMM yyyy */
export function formatDay(v: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  return m ? `${m[3]} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : v;
}

/** Display text for one cell. PDF fonts lack ₹, so money is written "Rs 1,234.00" there. */
export function formatCell(value: unknown, format: ColumnFormat, rupee = "₹"): string {
  if (value === null || value === undefined || value === "") return "—";
  if (format === "date") return formatDay(String(value));
  if (format === "text") return String(value);
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return String(value);
  if (format === "inr") return `${rupee}${groupIndian(n, 2)}`;
  if (format === "percent") return `${n.toFixed(1)}%`;
  return groupIndian(n, Number.isInteger(n) ? 0 : 2);
}

/** Raw cell for Excel: numbers stay numbers so the sheet can be summed. */
export function rawCell(value: unknown, format: ColumnFormat): string | number | null {
  if (value === null || value === undefined) return null;
  if (format === "text") return String(value);
  if (format === "date") return String(value).slice(0, 10);
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : String(value);
}

export function periodLabel(r: Pick<ReportResult, "from" | "to">): string {
  if (!r.from && !r.to) return "All dates";
  return `${r.from ? formatDay(r.from) : "start"} – ${r.to ? formatDay(r.to) : "today"}`;
}

export const fileName = (r: Pick<ReportResult, "id" | "from" | "to">, ext: string) =>
  `${r.id}${r.from ? `_${r.from}` : ""}${r.to ? `_${r.to}` : ""}.${ext}`;

/** Keeps only characters the standard PDF fonts can draw (WinAnsi). */
export const pdfSafe = (s: string) =>
  s
    .replace(/₹/g, "Rs ")
    .replace(/[–—]/g, "-")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");
