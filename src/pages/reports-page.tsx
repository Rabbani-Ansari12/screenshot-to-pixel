import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowRight, BarChart3, Landmark, ShoppingCart, Truck } from "lucide-react";
import {
  FINANCIAL_REPORTS,
  REPORTS,
  REPORT_FILTERS,
  exportReport,
  type ColumnFormat,
  type ReportFilters,
  type ReportId,
  type ReportMeta,
} from "@/services/reports.service";
import { EntityPicker } from "@/components/entity-picker";
import {
  ChartBox,
  ChartLegend,
  ChartTooltip,
  axisProps,
  gridProps,
  series,
} from "@/components/charts";
import {
  ErrorState,
  ExportButtons,
  PageSkeleton,
  SectionCard,
  saveBlob,
} from "@/components/common";
import { DataTable, type Column } from "@/components/data-table";
import { DateRangePicker, type DateRangeValue } from "@/components/filter-bar";
import { PageHeader } from "@/components/page-header";
import { useMasterOptions, useReport } from "@/hooks/queries";
import { useAuth } from "@/lib/auth";
import { formatDate, formatINR, formatINRCompact, formatNumber, todayIST } from "@/lib/format";

const ICONS: Record<ReportMeta["category"], typeof Truck> = {
  Operations: Truck,
  Sales: BarChart3,
  Purchases: ShoppingCart,
  Finance: Landmark,
};

export function ReportsCatalogPage() {
  const { can } = useAuth();
  const finance = can("view_financial_reports");
  const groups = (["Operations", "Sales", "Purchases", "Finance"] as const)
    .map((c) => ({
      category: c,
      reports: REPORTS.filter((r) => r.category === c && (finance || !FINANCIAL_REPORTS.has(r.id))),
    }))
    .filter((g) => g.reports.length > 0);
  return (
    <>
      <PageHeader
        title="Reports"
        description="Every report is built from the same records you see elsewhere. Pick one to filter, chart and export."
      />
      <div className="space-y-8">
        {groups.map((g) => {
          const Icon = ICONS[g.category];
          return (
            <section key={g.category} aria-labelledby={`r-${g.category}`}>
              <h2
                id={`r-${g.category}`}
                className="mb-3 flex items-center gap-2 font-display text-base font-bold"
              >
                <Icon className="size-4 text-primary" />
                {g.category}
              </h2>
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {g.reports.map((r) => (
                  <li key={r.id}>
                    <Link
                      to="/reports/$reportId"
                      params={{ reportId: r.id }}
                      className="group flex h-full flex-col rounded-xl border bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
                    >
                      <p className="font-semibold group-hover:text-primary">{r.title}</p>
                      <p className="mt-1 flex-1 text-sm text-muted-foreground">{r.description}</p>
                      <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary">
                        Open report{" "}
                        <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </>
  );
}

function fmt(v: string | number | undefined, f: ColumnFormat) {
  if (v === undefined) return "—";
  if (typeof v === "string") return f === "date" ? formatDate(v) : v;
  if (f === "inr") return formatINR(v);
  if (f === "percent") return `${v.toFixed(1)}%`;
  return formatNumber(v, Number.isInteger(v) ? 0 : 2);
}

export function ReportPage({ reportId }: { reportId: ReportId }) {
  const [range, setRange] = useState<DateRangeValue>(() => {
    const today = todayIST();
    // Indian financial year: from 1 April.
    const fyStart =
      Number(today.slice(5, 7)) >= 4
        ? `${today.slice(0, 4)}-04-01`
        : `${Number(today.slice(0, 4)) - 1}-04-01`;
    return { from: fyStart, to: today };
  });
  const [entity, setEntity] = useState<Omit<ReportFilters, "from" | "to">>({});
  const filters: ReportFilters = { ...entity, from: range.from, to: range.to };
  const { data, isLoading, error } = useReport(reportId, filters);
  const { data: options } = useMasterOptions();
  const exportAs = async (format: "xlsx" | "pdf") => {
    const { blob, fileName } = await exportReport(reportId, filters, format);
    saveBlob(blob, fileName);
  };
  const columns = useMemo<Column<Record<string, string | number>>[]>(
    () =>
      (data?.columns ?? []).map((c, i) => ({
        id: c.key,
        header: c.label,
        align: ["inr", "number", "percent", "qty"].includes(c.format) ? "right" : "left",
        mobile: i === 0 ? "title" : "meta",
        sortValue: (r) => r[c.key] ?? null,
        cell: (r) => (
          <span className={i === 0 ? "font-medium" : "tabular-nums"}>
            {fmt(r[c.key], c.format)}
          </span>
        ),
      })),
    [data],
  );
  if (error) return <ErrorState error={error} />;
  const meta = REPORTS.find((r) => r.id === reportId);
  if (!meta) return <ErrorState error={new Error("Unknown report")} />;
  const chart = data?.chart;
  const chartFormat = chart?.valueFormat === "inr" ? "inr" : "number";

  return (
    <>
      <PageHeader
        title={meta.title}
        crumbs={[{ label: meta.title }]}
        description={meta.description}
        actions={
          <>
            <DateRangePicker value={range} onChange={setRange} />
            <ExportButtons
              name={reportId}
              onPdf={() => exportAs("pdf")}
              onExcel={() => exportAs("xlsx")}
            />
          </>
        }
      />
      {(REPORT_FILTERS[reportId] ?? []).length > 0 && (
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Report filters">
          {REPORT_FILTERS[reportId].map((kind) => {
            const list =
              kind === "customer"
                ? options?.customers
                : kind === "material"
                  ? options?.materials
                  : kind === "provider"
                    ? options?.providers
                    : kind === "transporter"
                      ? options?.transporters
                      : options?.vehicles.map((v) => ({ id: v.id, name: v.plate }));
            const key = `${kind}Id` as keyof typeof entity;
            return (
              <EntityPicker
                key={kind}
                aria-label={`Filter by ${kind}`}
                value={entity[key] ?? ""}
                onChange={(v) => setEntity((e) => ({ ...e, [key]: v || undefined }))}
                options={[
                  { value: "", label: `All ${kind}s` },
                  ...(list ?? []).map((x) => ({ value: x.id, label: x.name })),
                ]}
                placeholder={`All ${kind}s`}
              />
            );
          })}
        </div>
      )}
      {isLoading || !data ? (
        <PageSkeleton rows={6} />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {data.summary.map((s) => (
              <div key={s.label} className="rounded-xl border bg-card p-4 shadow-sm">
                <p className="text-sm text-muted-foreground">{s.label}</p>
                <p className="mt-1 font-display text-2xl font-extrabold tabular-nums">
                  {s.format === "inr"
                    ? formatINRCompact(s.value)
                    : formatNumber(s.value, Number.isInteger(s.value) ? 0 : 2)}
                </p>
              </div>
            ))}
            <div className="rounded-xl border bg-card p-4 shadow-sm">
              <p className="text-sm text-muted-foreground">Rows</p>
              <p className="mt-1 font-display text-2xl font-extrabold">{data.rows.length}</p>
            </div>
            <div className="rounded-xl border bg-card p-4 shadow-sm">
              <p className="text-sm text-muted-foreground">Period</p>
              <p className="mt-1 text-sm font-semibold">
                {range.from ? `${formatDate(range.from)} – ${formatDate(range.to)}` : "All time"}
              </p>
            </div>
          </div>
          {chart && chart.data.length > 0 && (
            <SectionCard
              title="Chart"
              actions={
                chart.series.length > 1 ? (
                  <ChartLegend
                    items={chart.series.map((s, i) => ({ label: s.label, color: series(i) }))}
                  />
                ) : undefined
              }
            >
              <ChartBox height={280} label={`${chart.type} chart for ${meta.title}`}>
                <ResponsiveContainer>
                  {chart.type === "line" ? (
                    <LineChart data={chart.data} margin={{ left: 4, right: 8, top: 8 }}>
                      <CartesianGrid {...gridProps} />
                      <XAxis dataKey={chart.xKey} {...axisProps} />
                      <YAxis
                        {...axisProps}
                        tickFormatter={(v: number) =>
                          chartFormat === "inr" ? formatINRCompact(v) : formatNumber(v)
                        }
                        width={70}
                      />
                      <Tooltip content={<ChartTooltip format={chartFormat} />} />
                      {chart.series.map((s, i) => (
                        <Line
                          key={s.key}
                          type="monotone"
                          dataKey={s.key}
                          name={s.label}
                          stroke={series(i)}
                          strokeWidth={2}
                          dot={{ r: 4 }}
                        />
                      ))}
                    </LineChart>
                  ) : (
                    <BarChart data={chart.data} margin={{ left: 4, right: 8, top: 8 }}>
                      <CartesianGrid {...gridProps} />
                      <XAxis
                        dataKey={chart.xKey}
                        {...axisProps}
                        interval={chart.data.length > 10 ? "preserveStartEnd" : 0}
                        tick={{ ...axisProps.tick, fontSize: 11 }}
                      />
                      <YAxis
                        {...axisProps}
                        tickFormatter={(v: number) =>
                          chartFormat === "inr" ? formatINRCompact(v) : formatNumber(v)
                        }
                        width={70}
                        allowDecimals={chartFormat === "inr"}
                      />
                      <Tooltip
                        content={<ChartTooltip format={chartFormat} />}
                        cursor={{ fill: "var(--muted)", opacity: 0.5 }}
                      />
                      {chart.series.map((s, i) => (
                        <Bar
                          key={s.key}
                          dataKey={s.key}
                          name={s.label}
                          fill={series(i)}
                          radius={[4, 4, 0, 0]}
                          maxBarSize={36}
                        />
                      ))}
                    </BarChart>
                  )}
                </ResponsiveContainer>
              </ChartBox>
            </SectionCard>
          )}
          <DataTable
            data={data.rows}
            columns={columns}
            getRowId={(r) => String(Object.values(r).slice(0, 3).join("|"))}
            searchText={(r) => Object.values(r).join(" ")}
            searchPlaceholder="Search this report…"
            pageSize={25}
            caption={meta.title}
          />
        </div>
      )}
    </>
  );
}
