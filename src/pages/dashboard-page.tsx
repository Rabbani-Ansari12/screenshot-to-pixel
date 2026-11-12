import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowRight,
  Bot,
  Boxes,
  ClipboardList,
  Copy,
  FileUp,
  IndianRupee,
  Lightbulb,
  PackageCheck,
  ReceiptIndianRupee,
  Scale,
  Truck,
  Wallet,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorState, KpiCard, PageSkeleton, SectionCard } from "@/components/common";
import {
  ChartBox,
  ChartLegend,
  ChartTooltip,
  axisProps,
  gridProps,
  series,
} from "@/components/charts";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { UploadDialog } from "@/components/upload-dialog";
import { useDashboard } from "@/hooks/queries";
import { useAuth } from "@/lib/auth";
import { formatDate, formatINRCompact, formatNumber, todayIST } from "@/lib/format";
import { cn } from "@/lib/utils";

const attentionIcon = { review: Bot, bill: Scale, shortage: Truck, invoice: ReceiptIndianRupee };

export function DashboardPage() {
  const { data, isLoading, error } = useDashboard();
  const { user, can } = useAuth();
  const [upload, setUpload] = useState(false);
  if (error) return <ErrorState error={error} />;
  if (isLoading || !data) return <PageSkeleton kpis={8} />;
  const { kpis, automation } = data;
  const showMoney = can("view_financial_reports");
  const firstName = user?.name.split(" ")[0] ?? "";
  const hour = Number(
    new Intl.DateTimeFormat("en-IN", {
      hour: "numeric",
      hour12: false,
      timeZone: "Asia/Kolkata",
    }).format(new Date()),
  );
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const donut = [
    {
      name: "Processed automatically",
      value: automation.breakdown
        .filter((b) => b.status === "Automatically Recorded" || b.status === "Matched")
        .reduce((s, b) => s + b.count, 0),
    },
    {
      name: "In progress",
      value: automation.breakdown
        .filter((b) => ["Received", "Processing", "Information Extracted"].includes(b.status))
        .reduce((s, b) => s + b.count, 0),
    },
    {
      name: "Needs review",
      value: automation.breakdown.find((b) => b.status === "Needs Review")?.count ?? 0,
    },
    {
      name: "Failed / duplicate",
      value: automation.breakdown
        .filter((b) => b.status === "Failed" || b.status === "Duplicate")
        .reduce((s, b) => s + b.count, 0),
    },
  ];
  const monthly = data.monthly.map((m) => ({
    label: m.label.split(" ")[0],
    sales: m.salesValue,
    cost: m.salesValue - m.profit,
    profit: m.profit,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${greeting}, ${firstName}`}
        description={`Here's what needs you today. Everything else is being recorded automatically · ${formatDate(todayIST())}`}
        actions={
          <>
            <Button variant="outline" onClick={() => setUpload(true)}>
              <FileUp className="size-4" /> Upload document
            </Button>
            {can("manage_orders") && (
              <Button asChild>
                <Link to="/orders/new">
                  <ClipboardList className="size-4" /> New order
                </Link>
              </Button>
            )}
          </>
        }
      />

      <section
        aria-label="Key figures"
        className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5"
      >
        <KpiCard
          label="Active orders"
          value={kpis.activeOrders}
          hint="Confirmed, in progress or on hold"
          icon={ClipboardList}
          href="/orders"
        />
        <KpiCard
          label="Purchased this month"
          value={`${formatNumber(kpis.purchasedMT)} MT`}
          hint={data.monthLabel}
          icon={ArrowDownToLine}
          tone="amber"
          href="/purchases"
        />
        <KpiCard
          label="Dispatched this month"
          value={`${formatNumber(kpis.dispatchedMT)} MT`}
          hint="Loading weight"
          icon={Truck}
          href="/trips"
        />
        <KpiCard
          label="Delivered this month"
          value={`${formatNumber(kpis.deliveredMT)} MT`}
          hint="Delivery weight"
          icon={PackageCheck}
          tone="green"
          href="/trips"
        />
        <KpiCard
          label="Active trips"
          value={kpis.activeTrips}
          hint="Loaded or in transit"
          icon={Truck}
          tone="blue"
          href="/trips"
        />
        <KpiCard
          label="Trips needing verification"
          value={kpis.tripsToVerify}
          hint="Difference above tolerance"
          icon={AlertTriangle}
          tone="amber"
          emphasis={kpis.tripsToVerify > 0}
          href="/shortages"
        />
        <KpiCard
          label="Documents this month"
          value={kpis.documentsReceived}
          hint={`${kpis.documentsStaff} staff upload · ${kpis.documentsDriver} driver link · ${kpis.autoProcessedPct}% automatic`}
          icon={FileUp}
          href="/uploads"
        />
        <KpiCard
          label="Needs attention"
          value={kpis.needsAttention}
          hint="Reviews, shortages and bill differences"
          icon={AlertTriangle}
          tone="red"
          emphasis={kpis.needsAttention > 0}
          href="/review"
        />
        {showMoney && (
          <>
            <KpiCard
              label="Pending bills"
              value={kpis.pendingProviderBills + kpis.pendingTransporterBills}
              hint={`${kpis.pendingProviderBills} provider · ${kpis.pendingTransporterBills} transporter`}
              icon={Scale}
              tone="amber"
              href="/reconciliation"
            />
            <KpiCard
              label="Customer outstanding"
              value={formatINRCompact(kpis.customerOutstanding)}
              hint={`${kpis.overdueInvoices} invoices past due`}
              icon={Wallet}
              href="/payments"
            />
            <KpiCard
              label="Provider payable"
              value={formatINRCompact(kpis.providerPayable)}
              hint="Unpaid provider bills"
              icon={IndianRupee}
              tone="amber"
              href="/bills/provider"
            />
            <KpiCard
              label="Transporter payable"
              value={formatINRCompact(kpis.transporterPayable)}
              hint="Unpaid transporter bills"
              icon={Truck}
              tone="amber"
              href="/bills/transporter"
            />
            <KpiCard
              label="Estimated profit"
              value={formatINRCompact(kpis.estimatedProfit)}
              hint={`${data.monthLabel} · not final`}
              icon={Boxes}
              tone="green"
              href="/profit"
            />
          </>
        )}
      </section>

      <section aria-labelledby="automation-heading" className="grid gap-4 xl:grid-cols-[1fr_1.4fr]">
        <SectionCard
          title={
            <span id="automation-heading" className="flex items-center gap-2">
              <Bot className="size-4 text-primary" /> AI automation
            </span>
          }
          description="Documents received and handled without anyone typing."
        >
          <div className="grid gap-5 sm:grid-cols-[160px_1fr] sm:items-center">
            <div className="relative mx-auto size-40">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={donut}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="68%"
                    outerRadius="100%"
                    paddingAngle={2}
                    stroke="var(--card)"
                    strokeWidth={2}
                  >
                    {donut.map((d, i) => (
                      <Cell key={d.name} fill={series(i)} />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip format="number" />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
                <div>
                  <p className="font-display text-3xl font-extrabold">
                    {automation.autoProcessedPct}%
                  </p>
                  <p className="text-[11px] text-muted-foreground">automatic</p>
                </div>
              </div>
            </div>
            <div className="space-y-4">
              <ChartLegend
                items={donut.map((d, i) => ({ label: `${d.name} · ${d.value}`, color: series(i) }))}
                className="flex-col items-start gap-1.5"
              />
              <dl className="grid grid-cols-3 gap-3 border-t pt-4 text-center">
                <div>
                  <dt className="text-xs text-muted-foreground">
                    Received ({data.monthLabel.split(" ")[0]})
                  </dt>
                  <dd className="font-display text-xl font-bold">{automation.received}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Successful</dt>
                  <dd className="font-display text-xl font-bold">{automation.success}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Auto-updated</dt>
                  <dd className="font-display text-xl font-bold">{automation.autoUpdated}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Today</dt>
                  <dd className="font-display text-xl font-bold">{automation.today}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">This week</dt>
                  <dd className="font-display text-xl font-bold">{automation.week}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Awaiting review</dt>
                  <dd>
                    <Link
                      to="/review"
                      className="font-display text-xl font-bold text-amber-700 hover:underline dark:text-amber-300"
                    >
                      {automation.awaitingReview}
                    </Link>
                  </dd>
                </div>
              </dl>
              <div className="flex flex-wrap gap-2 text-xs">
                <Link
                  to="/documents"
                  className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 hover:bg-muted"
                >
                  <XCircle className="size-3.5 text-rose-600" /> {automation.failed} failed
                </Link>
                <Link
                  to="/documents"
                  className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 hover:bg-muted"
                >
                  <Copy className="size-3.5 text-muted-foreground" /> {automation.duplicates}{" "}
                  duplicates caught
                </Link>
              </div>
            </div>
          </div>
        </SectionCard>
        <SectionCard
          title="Documents handled per day"
          description="Last 14 days"
          actions={
            <ChartLegend
              items={[
                { label: "Automatic", color: series(0) },
                { label: "Needs a person", color: series(1) },
                { label: "Failed / duplicate", color: series(2) },
              ]}
            />
          }
        >
          <ChartBox height={240} label="Stacked bar chart of documents handled per day">
            <ResponsiveContainer>
              <BarChart
                data={automation.daily.map((d) => ({
                  ...d,
                  label: formatDate(d.date).slice(0, 6),
                }))}
                margin={{ left: -18, right: 4, top: 8 }}
              >
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" />
                <YAxis {...axisProps} allowDecimals={false} />
                <Tooltip
                  content={<ChartTooltip format="number" />}
                  cursor={{ fill: "var(--muted)", opacity: 0.5 }}
                />
                <Bar
                  dataKey="automatic"
                  name="Automatic"
                  stackId="a"
                  fill={series(0)}
                  maxBarSize={28}
                  stroke="var(--card)"
                  strokeWidth={1}
                />
                <Bar
                  dataKey="review"
                  name="Needs a person"
                  stackId="a"
                  fill={series(1)}
                  maxBarSize={28}
                  stroke="var(--card)"
                  strokeWidth={1}
                />
                <Bar
                  dataKey="failed"
                  name="Failed / duplicate"
                  stackId="a"
                  fill={series(2)}
                  maxBarSize={28}
                  radius={[4, 4, 0, 0]}
                  stroke="var(--card)"
                  strokeWidth={1}
                />
              </BarChart>
            </ResponsiveContainer>
          </ChartBox>
        </SectionCard>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <SectionCard
          title="Needs your attention"
          description="Exceptions only — review items, bill differences, shortages and overdue invoices."
          actions={
            <StatusBadge
              status={`${data.attention.length} open`}
              tone={data.attention.length ? "warning" : "success"}
            />
          }
          contentClassName="p-0 pt-2"
        >
          <ul className="divide-y">
            {data.attention.slice(0, 8).map((a) => {
              const Icon = attentionIcon[a.kind];
              return (
                <li key={`${a.kind}-${a.id}`} className="flex items-center gap-3 px-5 py-3">
                  <span
                    className={cn(
                      "grid size-9 shrink-0 place-items-center rounded-lg",
                      a.kind === "invoice"
                        ? "bg-primary/10 text-primary"
                        : "bg-amber-400/15 text-amber-700 dark:text-amber-300",
                    )}
                  >
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{a.title}</p>
                    <p className="truncate text-xs text-muted-foreground">{a.detail}</p>
                  </div>
                  <StatusBadge status={a.status} className="hidden sm:inline-flex" />
                  <Button asChild size="sm" variant="outline">
                    <Link to={a.href}>
                      {a.action}
                      <ArrowRight className="size-3.5" />
                    </Link>
                  </Button>
                </li>
              );
            })}
            {data.attention.length === 0 && (
              <li className="px-5 py-10 text-center text-sm text-muted-foreground">
                Nothing needs you right now.
              </li>
            )}
          </ul>
          {data.attention.length > 8 && (
            <div className="border-t px-5 py-3">
              <Link to="/review" className="text-sm font-medium text-primary hover:underline">
                See all {data.attention.length} items
              </Link>
            </div>
          )}
        </SectionCard>
        <SectionCard
          title={
            <span className="flex items-center gap-2">
              <Lightbulb className="size-4 text-amber-500" /> Business insights
            </span>
          }
          description="Answers worked out from your records"
        >
          <ul className="divide-y">
            {data.insights.map((i) => (
              <li key={i.label}>
                <Link to={i.href} className="group flex items-start gap-3 py-3 first:pt-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted-foreground">{i.label}</p>
                    <p className="font-semibold group-hover:text-primary">{i.value}</p>
                    <p className="text-xs text-muted-foreground">{i.detail}</p>
                  </div>
                  <ArrowRight className="mt-4 size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </Link>
              </li>
            ))}
          </ul>
        </SectionCard>
      </section>

      {showMoney && (
        <section className="grid gap-4 xl:grid-cols-2">
          <SectionCard
            title="Sales vs cost vs profit"
            description="Monthly · delivery weight × order rate · profit is estimated"
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
            <ChartBox label="Line chart of monthly sales, cost and profit">
              <ResponsiveContainer>
                <LineChart data={monthly} margin={{ left: 4, right: 8, top: 8 }}>
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="label" {...axisProps} />
                  <YAxis
                    {...axisProps}
                    tickFormatter={(v: number) => formatINRCompact(v)}
                    width={70}
                  />
                  <Tooltip content={<ChartTooltip format="inr" />} />
                  <Line
                    type="monotone"
                    dataKey="sales"
                    name="Sales"
                    stroke={series(0)}
                    strokeWidth={2}
                    dot={{ r: 4 }}
                    activeDot={{ r: 5 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="cost"
                    name="Cost"
                    stroke={series(1)}
                    strokeWidth={2}
                    dot={{ r: 4 }}
                    activeDot={{ r: 5 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="profit"
                    name="Profit"
                    stroke={series(2)}
                    strokeWidth={2}
                    dot={{ r: 4 }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartBox>
          </SectionCard>
          <SectionCard
            title="Gross margin by material"
            description="Sales − purchase − freight, since June"
          >
            <ChartBox label="Bar chart of gross margin by material">
              <ResponsiveContainer>
                <BarChart
                  data={data.materialProfit}
                  layout="vertical"
                  margin={{ left: 8, right: 16 }}
                >
                  <CartesianGrid {...gridProps} horizontal={false} vertical />
                  <XAxis
                    type="number"
                    {...axisProps}
                    tickFormatter={(v: number) => formatINRCompact(v)}
                  />
                  <YAxis type="category" dataKey="name" {...axisProps} width={130} />
                  <Tooltip
                    content={<ChartTooltip format="inr" />}
                    cursor={{ fill: "var(--muted)", opacity: 0.5 }}
                  />
                  <Bar
                    dataKey="profit"
                    name="Gross margin"
                    fill={series(0)}
                    radius={[0, 4, 4, 0]}
                    maxBarSize={22}
                  />
                </BarChart>
              </ResponsiveContainer>
            </ChartBox>
          </SectionCard>
        </section>
      )}

      <section className="grid gap-4 lg:grid-cols-3">
        <SectionCard
          title="Average delivery difference by vehicle"
          description="Loading − delivery, MT · higher = more loss"
        >
          <ChartBox height={240} label="Bar chart of average delivery difference per vehicle">
            <ResponsiveContainer>
              <BarChart
                data={data.vehicleDifference.map((v) => ({ ...v, label: v.plate.slice(-7) }))}
                margin={{ left: -14, right: 4, top: 8 }}
              >
                <CartesianGrid {...gridProps} />
                <XAxis
                  dataKey="label"
                  {...axisProps}
                  interval={0}
                  angle={-30}
                  textAnchor="end"
                  height={50}
                />
                <YAxis {...axisProps} />
                <Tooltip
                  content={
                    <ChartTooltip
                      format="qty"
                      unit="MT"
                      labelFormatter={(l) =>
                        data.vehicleDifference.find((v) => v.plate.endsWith(l))?.plate ?? l
                      }
                    />
                  }
                  cursor={{ fill: "var(--muted)", opacity: 0.5 }}
                />
                <Bar
                  dataKey="avgDifference"
                  name="Avg difference"
                  fill={series(0)}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={26}
                />
              </BarChart>
            </ResponsiveContainer>
          </ChartBox>
        </SectionCard>
        {showMoney && (
          <SectionCard title="Top customers" description="Invoiced value before GST">
            <ChartBox height={240} label="Bar chart of top customers by invoiced value">
              <ResponsiveContainer>
                <BarChart
                  data={data.topCustomers.map((c) => ({
                    ...c,
                    label: c.name.split(" ").slice(0, 2).join(" "),
                  }))}
                  layout="vertical"
                  margin={{ left: 0, right: 16 }}
                >
                  <XAxis
                    type="number"
                    {...axisProps}
                    tickFormatter={(v: number) => formatINRCompact(v)}
                  />
                  <YAxis type="category" dataKey="label" {...axisProps} width={110} />
                  <Tooltip
                    content={<ChartTooltip format="inr" />}
                    cursor={{ fill: "var(--muted)", opacity: 0.5 }}
                  />
                  <Bar
                    dataKey="sales"
                    name="Invoiced"
                    fill={series(0)}
                    radius={[0, 4, 4, 0]}
                    maxBarSize={20}
                  />
                </BarChart>
              </ResponsiveContainer>
            </ChartBox>
          </SectionCard>
        )}
        <SectionCard title="Transporter cost comparison" description="Freight per MT carried">
          <ChartBox height={240} label="Bar chart of freight cost per MT by transporter">
            <ResponsiveContainer>
              <BarChart
                data={data.transporterCost.map((t) => ({
                  ...t,
                  label: t.name.split(" ").slice(0, 2).join(" "),
                }))}
                margin={{ left: -6, right: 4, top: 8 }}
              >
                <CartesianGrid {...gridProps} />
                <XAxis
                  dataKey="label"
                  {...axisProps}
                  interval={0}
                  tick={{ ...axisProps.tick, fontSize: 11 }}
                />
                <YAxis {...axisProps} tickFormatter={(v: number) => `₹${v}`} />
                <Tooltip
                  content={<ChartTooltip format="inr" />}
                  cursor={{ fill: "var(--muted)", opacity: 0.5 }}
                />
                <Bar
                  dataKey="perMT"
                  name="Per MT"
                  fill={series(0)}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={36}
                />
              </BarChart>
            </ResponsiveContainer>
          </ChartBox>
        </SectionCard>
      </section>
      <UploadDialog open={upload} onOpenChange={setUpload} />
    </div>
  );
}
