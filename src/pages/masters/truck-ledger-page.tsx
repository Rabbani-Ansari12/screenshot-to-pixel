/** One truck: every trip, weights, freight and what is still owed to its transporter. */
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  IndianRupee,
  PackageCheck,
  Phone,
  Scale,
  Truck,
  Wallet,
} from "lucide-react";
import type { TruckLedgerRow } from "@/types";
import { Button } from "@/components/ui/button";
import {
  ChartBox,
  ChartLegend,
  ChartTooltip,
  axisProps,
  gridProps,
  series,
} from "@/components/charts";
import {
  DetailList,
  DetailSkeleton,
  ErrorState,
  InfoNote,
  KpiCard,
  SectionCard,
} from "@/components/common";
import { DataTable, type Column } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { DifferenceValue } from "@/components/record-columns";
import { StatusBadge } from "@/components/status-badge";
import { useVehicle } from "@/hooks/queries";
import { useAuth } from "@/lib/auth";
import { formatDate, formatINR, formatNumber, formatQty } from "@/lib/format";
import { cn } from "@/lib/utils";
import { VEHICLE_TRIP_CAP } from "@/services/masters.service";
import { periodStart, truckLedgerTotals, type LedgerPeriod } from "@/services/truck-ledger";

const PERIODS: { id: LedgerPeriod; label: string }[] = [
  { id: "month", label: "This month" },
  { id: "3m", label: "Last 3 months" },
  { id: "all", label: "All trips" },
];

const stop = (e: React.MouseEvent) => e.stopPropagation();

function ledgerColumns(showMoney: boolean): Column<TruckLedgerRow>[] {
  const cols: Column<TruckLedgerRow>[] = [
    {
      id: "date",
      header: "Date",
      mobile: "meta",
      sortValue: (r) => r.trip.loading.at,
      cell: (r) => <span className="whitespace-nowrap">{formatDate(r.trip.loading.at)}</span>,
      exportValue: (r) => formatDate(r.trip.loading.at),
    },
    {
      id: "trip",
      header: "Trip",
      mobile: "title",
      sortValue: (r) => r.trip.id,
      cell: (r) => (
        <div className="min-w-0">
          <Link
            to="/trips/$tripId"
            params={{ tripId: r.trip.id }}
            onClick={stop}
            className="font-medium text-primary hover:underline"
          >
            {r.trip.id}
          </Link>
          <p className="truncate text-xs text-muted-foreground">
            {r.trip.customerName} · {r.trip.siteName}
          </p>
        </div>
      ),
      exportValue: (r) => r.trip.id,
    },
    {
      id: "material",
      header: "Material",
      mobile: "subtitle",
      sortValue: (r) => r.trip.materialName,
      cell: (r) => r.trip.materialName,
    },
    {
      id: "loaded",
      header: "Loaded",
      align: "right",
      hideBelow: "lg",
      sortValue: (r) => r.trip.loadedQty,
      cell: (r) => <span className="tabular-nums">{formatQty(r.trip.loadedQty, r.trip.unit)}</span>,
      exportValue: (r) => r.trip.loadedQty,
    },
    {
      id: "delivered",
      header: "Delivered",
      align: "right",
      sortValue: (r) => r.trip.deliveredQty,
      cell: (r) => (
        <span className="tabular-nums">
          {r.trip.deliveredQty === null ? "—" : formatQty(r.trip.deliveredQty, r.trip.unit)}
        </span>
      ),
      exportValue: (r) => r.trip.deliveredQty,
    },
    {
      id: "difference",
      header: "Short",
      align: "right",
      hideBelow: "lg",
      sortValue: (r) => r.trip.difference,
      cell: (r) => <DifferenceValue trip={r.trip} />,
      exportValue: (r) => r.trip.difference,
    },
  ];
  if (showMoney) {
    cols.push(
      {
        id: "freight",
        header: "Freight",
        align: "right",
        sortValue: (r) => r.freight,
        cell: (r) => <span className="tabular-nums">{formatINR(r.freight)}</span>,
        exportValue: (r) => r.freight,
      },
      {
        id: "bill",
        header: "Transporter bill",
        hideBelow: "xl",
        sortValue: (r) => r.billNo,
        cell: (r) =>
          r.billId ? (
            <Link
              to="/bills/$billId"
              params={{ billId: r.billId }}
              onClick={stop}
              className="text-primary hover:underline"
            >
              {r.billNo}
            </Link>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
        exportValue: (r) => r.billNo,
      },
      {
        id: "pay",
        header: "Payment",
        mobile: "badge",
        sortValue: (r) => r.due,
        cell: (r) => (
          <div className="flex flex-col items-start gap-0.5">
            <StatusBadge
              status={r.freightStatus}
              tone={
                r.freightStatus === "Paid"
                  ? "success"
                  : r.freightStatus === "Not billed" || r.freightStatus === "Cancelled"
                    ? "neutral"
                    : "warning"
              }
            />
            {r.due > 0 && r.freightStatus !== "Not billed" && (
              <span className="text-xs tabular-nums text-muted-foreground">
                {formatINR(r.due)} due
              </span>
            )}
          </div>
        ),
        exportValue: (r) => r.freightStatus,
      },
      {
        id: "due",
        header: "Still to pay",
        align: "right",
        mobile: "hidden",
        hideBelow: "xl",
        sortValue: (r) => r.due,
        cell: (r) => (
          <span className={cn("tabular-nums", r.due === 0 && "text-muted-foreground")}>
            {formatINR(r.due)}
          </span>
        ),
        exportValue: (r) => r.due,
      },
    );
  } else {
    cols.push({
      id: "status",
      header: "Status",
      mobile: "badge",
      sortValue: (r) => r.trip.status,
      cell: (r) => <StatusBadge status={r.trip.status} />,
    });
  }
  return cols;
}

export function VehicleDetailPage({ vehicleId }: { vehicleId: string }) {
  const { data, isLoading, error } = useVehicle(vehicleId);
  const { can } = useAuth();
  const showMoney = can("view_financial_reports");
  const [period, setPeriod] = useState<LedgerPeriod>("all");
  const ledger = useMemo(() => {
    const start = periodStart(period);
    const all = data?.ledger ?? [];
    return start ? all.filter((r) => (r.trip.loading.at ?? "").slice(0, 10) >= start) : all;
  }, [data, period]);
  const totals = useMemo(() => truckLedgerTotals(ledger), [ledger]);
  const columns = useMemo(() => ledgerColumns(showMoney), [showMoney]);

  if (error) return <ErrorState error={error} />;
  if (isLoading || !data) return <DetailSkeleton />;
  const { vehicle: v, trips, driver } = data;
  const recent = trips
    .filter((t) => t.difference !== null && t.unit === "MT")
    .slice(0, 20)
    .reverse();
  const owed = totals.dueOnBills + totals.notBilled;
  const periodLabel = PERIODS.find((p) => p.id === period)!.label.toLowerCase();

  return (
    <>
      <PageHeader
        title={v.plate}
        crumbs={[{ label: v.plate }]}
        badge={
          v.recurringShortage ? (
            <StatusBadge status="Recurring difference" tone="warning" />
          ) : (
            <StatusBadge status={v.active ? "Active" : "Inactive"} />
          )
        }
        description={
          <>
            {v.type} · {v.capacity} MT ·{" "}
            <Link
              to="/transporters/$transporterId"
              params={{ transporterId: v.transporterId }}
              className="text-primary hover:underline"
            >
              {v.transporterName}
            </Link>
            {driver && <> · Driver {driver.name}</>}
          </>
        }
        actions={
          driver?.phone && (
            <Button variant="outline" asChild>
              <a href={`tel:${driver.phone.replace(/\s/g, "")}`}>
                <Phone className="size-4" /> Call driver
              </a>
            </Button>
          )
        }
      />

      {v.recurringShortage && (
        <InfoNote tone="warning" className="mb-4">
          This truck had {v.shortageCount} deliveries above tolerance. Worth checking the tarpaulin,
          the loading weighbridge and the route — differences can have ordinary causes.
        </InfoNote>
      )}

      <div
        role="group"
        aria-label="Period"
        className="mb-3 inline-flex rounded-xl border bg-muted/40 p-1"
      >
        {PERIODS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPeriod(p.id)}
            aria-pressed={period === p.id}
            className={cn(
              "h-8 rounded-lg px-3 text-[13px] font-medium transition-colors",
              period === p.id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      <section aria-label="Truck totals" className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Trips"
          value={totals.trips}
          hint={`${periodLabel} · cancelled not counted`}
          icon={Truck}
          tone="blue"
        />
        <KpiCard
          label="Delivered"
          value={`${formatNumber(totals.deliveredMT, 2)} MT`}
          hint="Delivery weight"
          icon={PackageCheck}
          tone="green"
        />
        {showMoney ? (
          <>
            <KpiCard
              label="Freight"
              value={formatINR(totals.freight)}
              hint={`Paid ${formatINR(totals.paid)}`}
              icon={IndianRupee}
            />
            <KpiCard
              label="Still to pay transporter"
              value={formatINR(owed)}
              hint={`${formatINR(totals.dueOnBills)} on bills · ${formatINR(totals.notBilled)} not billed yet`}
              icon={Wallet}
              tone="amber"
              emphasis={owed > 0}
            />
          </>
        ) : (
          <>
            <KpiCard
              label="Average difference"
              value={formatNumber(v.avgDifference, 2)}
              hint="Loading − delivery"
              icon={Scale}
            />
            <KpiCard
              label="Above tolerance"
              value={v.shortageCount}
              icon={AlertTriangle}
              tone={v.shortageCount >= 3 ? "amber" : "green"}
            />
          </>
        )}
      </section>

      <section aria-labelledby="ledger-heading">
        <div className="mb-3">
          <h2 id="ledger-heading" className="font-display text-base font-bold">
            Truck ledger
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {showMoney
              ? "Every trip with its freight and transporter bill. Payments are made against whole bills, so each trip shows its share."
              : "Every trip of this truck with loading and delivery weights."}
          </p>
        </div>
        <DataTable
          data={ledger}
          columns={columns}
          getRowId={(r) => r.trip.id}
          rowHref={(r) => `/trips/${r.trip.id}`}
          searchText={(r) =>
            `${r.trip.id} ${r.trip.customerName} ${r.trip.siteName} ${r.trip.materialName} ${r.billNo ?? ""}`
          }
          searchPlaceholder="Search trip, customer, bill…"
          filters={
            showMoney
              ? [
                  {
                    id: "pay",
                    label: "Payment",
                    options: ["Not billed", "Unpaid", "Part paid", "Paid", "Cancelled"].map(
                      (s) => ({ value: s, label: s }),
                    ),
                    value: (r) => r.freightStatus,
                  },
                ]
              : []
          }
          defaultSort={{ id: "date", desc: true }}
          pageSize={25}
          exportName={`truck-${v.plate.replace(/\s/g, "")}`}
          emptyTitle="No trips in this period"
          emptyDescription="Pick a longer period above, or create a trip for this truck."
        />
      </section>
      {trips.length >= VEHICLE_TRIP_CAP && (
        <p className="mt-2 text-xs text-muted-foreground">
          Showing the latest {VEHICLE_TRIP_CAP} trips. Older trips are in Truck Ledger → Trips.
        </p>
      )}

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <SectionCard
          title="Delivery difference per trip"
          description="Last 20 weighed trips · MT"
          actions={
            <ChartLegend
              items={[
                { label: "Difference", color: series(0) },
                { label: "Tolerance", color: series(1), dashed: true },
              ]}
            />
          }
        >
          <ChartBox height={220} label="Line chart of delivery difference per trip">
            <ResponsiveContainer>
              <LineChart
                data={recent.map((t) => ({
                  id: t.id.slice(-5),
                  difference: t.difference ?? 0,
                  tolerance: t.tolerance,
                }))}
                margin={{ left: -16, right: 8, top: 8 }}
              >
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="id" {...axisProps} />
                <YAxis {...axisProps} />
                <Tooltip content={<ChartTooltip format="qty" unit="MT" />} />
                <Line
                  dataKey="tolerance"
                  name="Tolerance"
                  stroke={series(1)}
                  strokeDasharray="5 4"
                  dot={false}
                  strokeWidth={2}
                />
                <Line
                  dataKey="difference"
                  name="Difference"
                  stroke={series(0)}
                  strokeWidth={2}
                  dot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartBox>
        </SectionCard>
        <SectionCard title="Truck & driver">
          <DetailList
            columns={2}
            items={[
              { label: "Registration", value: v.plate },
              { label: "Type", value: v.type },
              { label: "Capacity", value: `${v.capacity} MT` },
              { label: "Transporter", value: v.transporterName },
              { label: "Driver", value: driver?.name ?? "—" },
              { label: "Driver phone", value: driver?.phone ?? "—" },
              { label: "Licence", value: driver?.licenseNo ?? "—" },
              { label: "Average difference", value: formatNumber(v.avgDifference, 2) },
            ]}
          />
        </SectionCard>
      </div>
    </>
  );
}
