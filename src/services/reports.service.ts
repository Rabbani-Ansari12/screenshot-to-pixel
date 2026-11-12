/**
 * Reports from the database (report_run: date + entity filters, permission-checked) and
 * server-side Excel / PDF export through the report-export Edge Function.
 */
import { formatMonth } from "@/lib/format";
import { AppError, unwrap } from "./supabase/errors";
import { sb } from "./supabase/fetch";
import { num } from "./supabase/mappers";

export type ReportId =
  | "daily"
  | "monthly"
  | "customer"
  | "material"
  | "provider-purchase"
  | "transporter-expense"
  | "vehicle-trips"
  | "shortage"
  | "pending-bills"
  | "customer-outstanding"
  | "payables"
  | "expense"
  | "order-pl"
  | "monthly-pl";

export interface ReportMeta {
  id: ReportId;
  title: string;
  description: string;
  category: "Operations" | "Sales" | "Purchases" | "Finance";
}

export const REPORTS: ReportMeta[] = [
  {
    id: "daily",
    title: "Daily Report",
    description: "Trips, quantities and value for each day.",
    category: "Operations",
  },
  {
    id: "monthly",
    title: "Monthly Report",
    description: "Month-wise dispatch, delivery and sales.",
    category: "Operations",
  },
  {
    id: "customer",
    title: "Customer-wise Report",
    description: "Sales, quantity and outstanding per customer.",
    category: "Sales",
  },
  {
    id: "material",
    title: "Material-wise Report",
    description: "Quantity, sales and margin by material.",
    category: "Sales",
  },
  {
    id: "provider-purchase",
    title: "Provider Purchase Report",
    description: "Purchases and payables per material provider.",
    category: "Purchases",
  },
  {
    id: "transporter-expense",
    title: "Transporter Expense Report",
    description: "Freight cost per transporter, per trip and per MT.",
    category: "Purchases",
  },
  {
    id: "vehicle-trips",
    title: "Vehicle-wise Trip Report",
    description: "Trips and delivery differences per vehicle.",
    category: "Operations",
  },
  {
    id: "shortage",
    title: "Shortage Report",
    description: "Trips above tolerance and their outcomes.",
    category: "Operations",
  },
  {
    id: "pending-bills",
    title: "Pending Bills Report",
    description: "Provider and transporter bills not yet reconciled or paid.",
    category: "Finance",
  },
  {
    id: "customer-outstanding",
    title: "Customer Outstanding Report",
    description: "Unpaid invoice balances by customer.",
    category: "Finance",
  },
  {
    id: "payables",
    title: "Payables Report",
    description: "What we owe providers and transporters.",
    category: "Finance",
  },
  {
    id: "expense",
    title: "Expense Report",
    description: "Operating expenses by category and month.",
    category: "Finance",
  },
  {
    id: "order-pl",
    title: "Order-wise P&L",
    description: "Estimated profit for every order.",
    category: "Finance",
  },
  {
    id: "monthly-pl",
    title: "Monthly P&L",
    description: "Sales, costs and estimated profit per month.",
    category: "Finance",
  },
];

export type ColumnFormat = "text" | "inr" | "number" | "qty" | "percent" | "date";

export interface ReportResult {
  meta: ReportMeta;
  columns: { key: string; label: string; format: ColumnFormat }[];
  rows: Record<string, string | number>[];
  chart: {
    type: "bar" | "line";
    xKey: string;
    series: { key: string; label: string }[];
    data: Record<string, string | number>[];
    valueFormat: ColumnFormat;
  } | null;
  summary: { label: string; value: number; format: ColumnFormat }[];
}

export interface ReportFilters {
  from: string;
  to: string;
  customerId?: string;
  materialId?: string;
  providerId?: string;
  transporterId?: string;
  vehicleId?: string;
}

/** Which entity filters each report understands. */
export const REPORT_FILTERS: Record<
  ReportId,
  ("customer" | "material" | "provider" | "transporter" | "vehicle")[]
> = {
  daily: ["customer", "material", "transporter", "vehicle"],
  monthly: ["customer", "material", "transporter", "vehicle"],
  customer: ["customer"],
  material: ["material", "provider"],
  "provider-purchase": ["provider", "material"],
  "transporter-expense": ["transporter", "vehicle"],
  "vehicle-trips": ["vehicle", "transporter", "material"],
  shortage: ["vehicle", "transporter", "material", "customer"],
  "pending-bills": ["provider", "transporter"],
  "customer-outstanding": ["customer"],
  payables: ["provider", "transporter"],
  expense: [],
  "order-pl": ["customer"],
  "monthly-pl": [],
};

/** Reports that need view_financial_reports. */
export const FINANCIAL_REPORTS = new Set<ReportId>([
  "customer",
  "material",
  "provider-purchase",
  "transporter-expense",
  "pending-bills",
  "customer-outstanding",
  "payables",
  "expense",
  "order-pl",
  "monthly-pl",
]);

const filterArgs = (f: ReportFilters) => {
  const out: Record<string, string> = {};
  if (f.customerId) out["customer_id"] = f.customerId;
  if (f.materialId) out["material_id"] = f.materialId;
  if (f.providerId) out["provider_id"] = f.providerId;
  if (f.transporterId) out["transporter_id"] = f.transporterId;
  if (f.vehicleId) out["vehicle_id"] = f.vehicleId;
  return out;
};

interface RawReport {
  title: string;
  columns: ReportResult["columns"];
  rows: Record<string, string | number | null>[];
  chart: {
    type: "bar" | "line";
    xKey: string;
    series: { key: string; label: string }[];
    valueFormat: ColumnFormat;
  } | null;
  summary: { label: string; value: number | string; format: ColumnFormat }[];
}

export async function getReport(id: ReportId, filters: ReportFilters): Promise<ReportResult> {
  const meta = REPORTS.find((r) => r.id === id);
  if (!meta) throw new AppError("Unknown report.", null, "not_found");
  const raw = unwrap(
    await sb().rpc("report_run", {
      p_report: id,
      p_filters: filterArgs(filters),
      ...(filters.from ? { p_from: filters.from } : {}),
      ...(filters.to ? { p_to: filters.to } : {}),
    }),
  ) as unknown as RawReport;
  const rows = (raw.rows ?? []).map((r) =>
    Object.fromEntries(
      Object.entries(r).map(([k, v]) => {
        const col = raw.columns.find((c) => c.key === k);
        if (v === null || v === undefined)
          return [k, col && col.format !== "text" && col.format !== "date" ? 0 : ""];
        if (col && col.format !== "text" && col.format !== "date") return [k, num(v as number)];
        return [
          k,
          k === "month" && /^\d{4}-\d{2}$/.test(String(v)) ? formatMonth(String(v)) : String(v),
        ];
      }),
    ),
  ) as Record<string, string | number>[];
  const chartRows = rows.slice(0, 30);
  return {
    meta,
    columns: raw.columns,
    rows,
    // Daily rows come newest first; charts read left to right in time.
    chart: raw.chart
      ? { ...raw.chart, data: raw.chart.xKey === "date" ? [...chartRows].reverse() : chartRows }
      : null,
    summary: (raw.summary ?? []).map((s) => ({ ...s, value: num(s.value as number) })),
  };
}

/** Excel / PDF built on the server (works for large reports); returns the file to save. */
export async function exportReport(
  id: ReportId,
  filters: ReportFilters,
  format: "xlsx" | "pdf",
): Promise<{ blob: Blob; fileName: string }> {
  const { data, error } = await sb().functions.invoke("report-export", {
    body: {
      report: id,
      format,
      from: filters.from || null,
      to: filters.to || null,
      filters: filterArgs(filters),
    },
  });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    let message = "Export failed. Please try again.";
    if (ctx && typeof ctx.json === "function") {
      const body = (await ctx.json().catch(() => null)) as { error?: string } | null;
      if (body?.error) message = body.error;
    }
    throw new AppError(message, null, ctx?.status === 403 ? "forbidden" : "unknown");
  }
  const blob = data instanceof Blob ? data : new Blob([data as BlobPart]);
  return {
    blob,
    fileName: `${id}${filters.from ? `_${filters.from}` : ""}${filters.to ? `_${filters.to}` : ""}.${format}`,
  };
}
