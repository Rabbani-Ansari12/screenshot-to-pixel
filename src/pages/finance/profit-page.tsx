import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { IndianRupee, Percent, TrendingUp, Wallet } from "lucide-react";
import type { MonthlyProfitView, OrderProfitView } from "@/types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ChartBox,
  ChartLegend,
  ChartTooltip,
  axisProps,
  gridProps,
  series,
} from "@/components/charts";
import { ErrorState, InfoNote, KpiCard, PageSkeleton, SectionCard } from "@/components/common";
import { DataTable, type Column } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { ProfitWaterfall } from "@/components/profit-waterfall";
import { SimpleTable } from "@/components/simple-table";
import { StatusBadge } from "@/components/status-badge";
import { useLandedCosts, useMonthlyProfits, useOrderProfits } from "@/hooks/queries";
import { formatINR, formatINRCompact, formatNumber, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export function ProfitPage() {
  const { data: orders, isLoading: ol, error } = useOrderProfits();
  const { data: monthly, isLoading: ml } = useMonthlyProfits();
  const { data: landed } = useLandedCosts();
  const [tab, setTab] = useState("monthly");
  const [month, setMonth] = useState<MonthlyProfitView | null>(null);
  const [order, setOrder] = useState<OrderProfitView | null>(null);
  const totals = useMemo(() => {
    const m = monthly ?? [];
    return { sales: sum(m.map((x) => x.salesValue)), profit: sum(m.map((x) => x.profit)) };
  }, [monthly]);
  if (error) return <ErrorState error={error} />;
  if (ml || !monthly) return <PageSkeleton kpis={4} />;
  const selectedMonth = month ?? monthly[monthly.length - 1] ?? null;
  const selectedOrder = order ?? orders?.[0] ?? null;

  const orderCols: Column<OrderProfitView>[] = [
    {
      id: "order",
      header: "Order",
      mobile: "title",
      sortValue: (o) => o.orderRef,
      cell: (o) => (
        <div>
          <Link
            to="/orders/$orderId"
            params={{ orderId: o.orderId }}
            onClick={(e) => e.stopPropagation()}
            className="font-medium text-primary hover:underline"
          >
            {o.orderRef}
          </Link>
          <p className="text-xs text-muted-foreground">{o.customerName}</p>
        </div>
      ),
    },
    {
      id: "sales",
      header: "Sales",
      align: "right",
      sortValue: (o) => o.salesValue,
      cell: (o) => <span className="tabular-nums">{formatINR(o.salesValue)}</span>,
    },
    {
      id: "purchase",
      header: "Purchase",
      align: "right",
      hideBelow: "lg",
      sortValue: (o) => o.purchaseCost,
      cell: (o) => <span className="tabular-nums">{formatINR(o.purchaseCost)}</span>,
    },
    {
      id: "transport",
      header: "Transport",
      align: "right",
      hideBelow: "lg",
      sortValue: (o) => o.transportCost,
      cell: (o) => <span className="tabular-nums">{formatINR(o.transportCost)}</span>,
    },
    {
      id: "other",
      header: "Other",
      align: "right",
      hideBelow: "xl",
      cell: (o) => (
        <span className="tabular-nums">{formatINR(o.loadingUnloading + o.labour + o.other)}</span>
      ),
    },
    {
      id: "profit",
      header: "Profit",
      align: "right",
      sortValue: (o) => o.profit,
      cell: (o) => (
        <span className={cn("font-semibold tabular-nums", o.profit < 0 && "text-rose-600")}>
          {formatINR(o.profit)}
        </span>
      ),
    },
    {
      id: "margin",
      header: "Margin",
      align: "right",
      sortValue: (o) => o.marginPct,
      cell: (o) => <span className="tabular-nums">{formatPercent(o.marginPct, 1)}</span>,
    },
    {
      id: "status",
      header: "Status",
      mobile: "badge",
      sortValue: (o) => o.status,
      cell: (o) => <StatusBadge status={o.status} />,
    },
  ];

  return (
    <>
      <PageHeader
        title="Profit & Loss"
        description="Sales value minus every cost of getting the material to site. Estimated until the order is complete and fully paid."
      />
      <InfoNote tone="warning" className="mb-4">
        <strong>Customer cash received is not profit.</strong> Profit = delivered value − purchase −
        transport − loading/unloading − labour − other costs. A paid invoice only changes cash, not
        profit.
      </InfoNote>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Sales value (Jun–Nov)"
          value={formatINRCompact(totals.sales)}
          icon={IndianRupee}
        />
        <KpiCard
          label="Total cost"
          value={formatINRCompact(totals.sales - totals.profit)}
          icon={Wallet}
          tone="amber"
        />
        <KpiCard
          label="Estimated profit"
          value={formatINRCompact(totals.profit)}
          icon={TrendingUp}
          tone="green"
        />
        <KpiCard
          label="Margin"
          value={formatPercent(totals.sales ? (totals.profit / totals.sales) * 100 : 0, 1)}
          icon={Percent}
          tone="blue"
        />
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="monthly">Monthly</TabsTrigger>
          <TabsTrigger value="orders">Order-wise</TabsTrigger>
          <TabsTrigger value="landed">Landed cost</TabsTrigger>
        </TabsList>

        <TabsContent value="monthly" className="mt-4 space-y-4">
          <SectionCard
            title="Month by month"
            actions={
              <ChartLegend
                items={[
                  { label: "Sales", color: series(0) },
                  { label: "Cost", color: series(1) },
                  { label: "Profit", color: series(2) },
                ]}
              />
            }
          >
            <ChartBox label="Grouped bar chart of monthly sales, cost and profit">
              <ResponsiveContainer>
                <BarChart
                  data={monthly.map((m) => ({ ...m, cost: m.salesValue - m.profit }))}
                  margin={{ left: 4, right: 4, top: 8 }}
                  barGap={2}
                  onClick={(s) => {
                    const p = s?.activePayload?.[0]?.payload as MonthlyProfitView | undefined;
                    if (p) setMonth(p);
                  }}
                >
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="label" {...axisProps} />
                  <YAxis
                    {...axisProps}
                    tickFormatter={(v: number) => formatINRCompact(v)}
                    width={70}
                  />
                  <Tooltip
                    content={<ChartTooltip format="inr" />}
                    cursor={{ fill: "var(--muted)", opacity: 0.5 }}
                  />
                  <Bar
                    dataKey="salesValue"
                    name="Sales"
                    fill={series(0)}
                    radius={[4, 4, 0, 0]}
                    maxBarSize={26}
                    className="cursor-pointer"
                  />
                  <Bar
                    dataKey="cost"
                    name="Cost"
                    fill={series(1)}
                    radius={[4, 4, 0, 0]}
                    maxBarSize={26}
                    className="cursor-pointer"
                  />
                  <Bar
                    dataKey="profit"
                    name="Profit"
                    fill={series(2)}
                    radius={[4, 4, 0, 0]}
                    maxBarSize={26}
                    className="cursor-pointer"
                  />
                </BarChart>
              </ResponsiveContainer>
            </ChartBox>
          </SectionCard>
          <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
            <SectionCard title="Monthly table" description="Click a month to see its breakdown">
              <SimpleTable
                rows={[...monthly].reverse()}
                getRowId={(m) => m.month}
                columns={[
                  {
                    id: "m",
                    header: "Month",
                    mobile: "title",
                    cell: (m) => (
                      <button
                        type="button"
                        onClick={() => setMonth(m)}
                        className={cn(
                          "font-medium hover:underline",
                          selectedMonth?.month === m.month && "text-primary",
                        )}
                      >
                        {m.label}
                      </button>
                    ),
                  },
                  {
                    id: "s",
                    header: "Sales",
                    align: "right",
                    cell: (m) => formatINR(m.salesValue),
                  },
                  {
                    id: "c",
                    header: "Cost",
                    align: "right",
                    hideBelow: "lg",
                    cell: (m) => formatINR(m.salesValue - m.profit),
                  },
                  {
                    id: "p",
                    header: "Profit",
                    align: "right",
                    cell: (m) => <span className="font-semibold">{formatINR(m.profit)}</span>,
                  },
                  {
                    id: "mg",
                    header: "Margin",
                    align: "right",
                    cell: (m) => formatPercent(m.marginPct, 1),
                  },
                  {
                    id: "st",
                    header: "Status",
                    mobile: "badge",
                    cell: (m) => <StatusBadge status={m.status} />,
                  },
                ]}
              />
            </SectionCard>
            {selectedMonth && (
              <SectionCard
                title={`Breakdown · ${selectedMonth.label}`}
                actions={<StatusBadge status={selectedMonth.status} />}
              >
                <ProfitWaterfall breakdown={selectedMonth} />
              </SectionCard>
            )}
          </div>
        </TabsContent>

        <TabsContent value="orders" className="mt-4 space-y-4">
          <div className="grid gap-4 2xl:grid-cols-[1.6fr_1fr]">
            <DataTable
              data={orders}
              isLoading={ol}
              columns={orderCols}
              getRowId={(o) => o.orderId}
              onRowClick={setOrder}
              searchText={(o) => `${o.orderRef} ${o.customerName}`}
              searchPlaceholder="Search order or customer…"
              filters={[
                {
                  id: "status",
                  label: "Statuses",
                  options: [
                    { value: "Estimated", label: "Estimated" },
                    { value: "Final Settled", label: "Final Settled" },
                  ],
                  value: (o) => o.status,
                },
              ]}
              defaultSort={{ id: "order", desc: true }}
              exportName="order-profit"
              rowClassName={(o) =>
                o.orderId === selectedOrder?.orderId ? "bg-primary/5" : undefined
              }
            />
            {selectedOrder && (
              <SectionCard
                title={`Breakdown · ${selectedOrder.orderRef}`}
                description={`${selectedOrder.customerName} · ${formatNumber(selectedOrder.deliveredQty, 1)} ${selectedOrder.unitLabel === "mixed" ? "" : selectedOrder.unitLabel} delivered`}
                actions={<StatusBadge status={selectedOrder.status} />}
                className="2xl:sticky 2xl:top-20 2xl:self-start"
              >
                <ProfitWaterfall breakdown={selectedOrder} />
              </SectionCard>
            )}
          </div>
        </TabsContent>

        <TabsContent value="landed" className="mt-4 space-y-4">
          <SectionCard
            title="Landed cost vs selling rate · MT materials"
            description="₹ per MT: purchase (incl. extras) + transport"
            actions={
              <ChartLegend
                items={[
                  { label: "Landed cost", color: series(0) },
                  { label: "Selling rate", color: series(1) },
                ]}
              />
            }
          >
            <ChartBox
              height={280}
              label="Bar chart comparing landed cost and selling rate per material"
            >
              <ResponsiveContainer>
                <BarChart
                  data={(landed?.byMaterial ?? []).filter(
                    (r) => r.unit === "MT" && r.sellingRate < 20000,
                  )}
                  margin={{ left: 4, right: 4, top: 8 }}
                  barGap={2}
                >
                  <CartesianGrid {...gridProps} />
                  <XAxis
                    dataKey="label"
                    {...axisProps}
                    interval={0}
                    tick={{ ...axisProps.tick, fontSize: 11 }}
                  />
                  <YAxis
                    {...axisProps}
                    tickFormatter={(v: number) => `₹${formatNumber(v)}`}
                    width={64}
                  />
                  <Tooltip
                    content={<ChartTooltip format="inr" />}
                    cursor={{ fill: "var(--muted)", opacity: 0.5 }}
                  />
                  <Bar
                    dataKey="landedCost"
                    name="Landed cost"
                    fill={series(0)}
                    radius={[4, 4, 0, 0]}
                    maxBarSize={30}
                  />
                  <Bar
                    dataKey="sellingRate"
                    name="Selling rate"
                    fill={series(1)}
                    radius={[4, 4, 0, 0]}
                    maxBarSize={30}
                  />
                </BarChart>
              </ResponsiveContainer>
            </ChartBox>
            <p className="mt-2 text-xs text-muted-foreground">
              Cement and steel are shown in the table only — their rates are on a different scale.
              No conversion between MT and volume is applied.
            </p>
          </SectionCard>
          <div className="grid gap-4 xl:grid-cols-2">
            <SectionCard title="Per material">
              <SimpleTable
                rows={landed?.byMaterial ?? []}
                getRowId={(r) => r.key}
                columns={[
                  {
                    id: "l",
                    header: "Material",
                    mobile: "title",
                    cell: (r) => <span className="font-medium">{r.label}</span>,
                  },
                  {
                    id: "p",
                    header: "Purchase",
                    align: "right",
                    cell: (r) => `${formatINR(r.purchaseRate)}/${r.unit}`,
                  },
                  {
                    id: "t",
                    header: "Transport",
                    align: "right",
                    hideBelow: "lg",
                    cell: (r) => formatINR(r.transportPerUnit),
                  },
                  {
                    id: "lc",
                    header: "Landed",
                    align: "right",
                    cell: (r) => <span className="font-semibold">{formatINR(r.landedCost)}</span>,
                  },
                  {
                    id: "s",
                    header: "Selling",
                    align: "right",
                    cell: (r) => formatINR(r.sellingRate),
                  },
                  {
                    id: "m",
                    header: "Margin",
                    align: "right",
                    mobile: "badge",
                    cell: (r) => (
                      <span
                        className={cn(
                          "font-semibold",
                          r.marginPerUnit < 0
                            ? "text-rose-600"
                            : "text-emerald-700 dark:text-emerald-300",
                        )}
                      >
                        {formatINR(r.marginPerUnit)}
                      </span>
                    ),
                  },
                ]}
              />
            </SectionCard>
            <SectionCard title="Per provider" description="Lowest landed cost first, per material">
              <SimpleTable
                rows={[...(landed?.byProvider ?? [])].sort(
                  (a, b) =>
                    a.key.split("|")[1]?.localeCompare(b.key.split("|")[1] ?? "") ||
                    a.landedCost - b.landedCost,
                )}
                getRowId={(r) => r.key}
                columns={[
                  {
                    id: "l",
                    header: "Provider · material",
                    mobile: "title",
                    cell: (r) => <span className="font-medium">{r.label}</span>,
                  },
                  {
                    id: "q",
                    header: "Qty",
                    align: "right",
                    hideBelow: "lg",
                    cell: (r) => `${formatNumber(r.quantity, 0)} ${r.unit}`,
                  },
                  {
                    id: "p",
                    header: "Purchase",
                    align: "right",
                    cell: (r) => formatINR(r.purchaseRate),
                  },
                  {
                    id: "t",
                    header: "Transport",
                    align: "right",
                    hideBelow: "lg",
                    cell: (r) => formatINR(r.transportPerUnit),
                  },
                  {
                    id: "lc",
                    header: "Landed / unit",
                    align: "right",
                    mobile: "badge",
                    cell: (r) => <span className="font-semibold">{formatINR(r.landedCost)}</span>,
                  },
                ]}
              />
            </SectionCard>
          </div>
        </TabsContent>
      </Tabs>
    </>
  );
}
