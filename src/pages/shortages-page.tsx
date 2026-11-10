import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, CheckCircle2, Loader2, Scale, Settings2 } from "lucide-react";
import type { InvestigationOutcome, TripView } from "@/types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import {
  ChartBox,
  ChartLegend,
  ChartTooltip,
  axisProps,
  gridProps,
  series,
} from "@/components/charts";
import { DetailList, ErrorState, InfoNote, KpiCard, SectionCard } from "@/components/common";
import { DataTable, optionsFrom, type Column } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { DifferenceValue } from "@/components/record-columns";
import { StatusBadge } from "@/components/status-badge";
import { api, useAction, useMaterials, useShortages } from "@/hooks/queries";
import { useAuth } from "@/lib/auth";
import { formatDate, formatNumber, formatQty } from "@/lib/format";

const OUTCOMES: InvestigationOutcome[] = [
  "Under investigation",
  "Weighbridge calibration difference",
  "Moisture / spillage loss",
  "Site measurement difference",
  "Recovered from transporter",
  "Accepted as normal loss",
];

function InvestigationSheet({ trip, onClose }: { trip: TripView | null; onClose: () => void }) {
  const { can } = useAuth();
  const [outcome, setOutcome] = useState<InvestigationOutcome>("Under investigation");
  const [status, setStatus] = useState<"Delivered" | "Needs Verification" | "Confirmed Shortage">(
    "Needs Verification",
  );
  const [notes, setNotes] = useState("");
  const save = useAction(
    (v: { outcome: InvestigationOutcome; notes: string; status: typeof status }) =>
      api.trips.recordInvestigation(trip?.id ?? "", v),
    "Investigation outcome saved",
  );
  useEffect(() => {
    setOutcome(trip?.investigation?.outcome ?? "Under investigation");
    setNotes(trip?.investigation?.notes ?? "");
    setStatus(
      trip?.status === "Confirmed Shortage"
        ? "Confirmed Shortage"
        : trip?.status === "Needs Verification"
          ? "Needs Verification"
          : "Delivered",
    );
  }, [trip]);

  return (
    <Sheet open={Boolean(trip)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {trip && (
          <>
            <SheetHeader>
              <SheetTitle>Investigate {trip.id}</SheetTitle>
              <SheetDescription>
                Record what was found. Differences have many normal causes — keep notes factual.
              </SheetDescription>
            </SheetHeader>
            <div className="space-y-5 px-4">
              <div className="rounded-xl border p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Difference</span>
                  <StatusBadge status={trip.shortageStatus ?? "Normal"} />
                </div>
                <p className="mt-1 font-display text-2xl font-extrabold">
                  {formatQty(trip.difference ?? 0, trip.unit)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Tolerance {formatQty(trip.tolerance, trip.unit)} ·{" "}
                  {trip.tolerance
                    ? `${formatNumber(((trip.difference ?? 0) / trip.tolerance) * 100, 0)}% of tolerance`
                    : ""}
                </p>
              </div>
              <DetailList
                columns={2}
                items={[
                  {
                    label: "Vehicle",
                    value: (
                      <Link
                        to="/vehicles/$vehicleId"
                        params={{ vehicleId: trip.vehicleId }}
                        className="text-primary hover:underline"
                      >
                        {trip.vehiclePlate}
                      </Link>
                    ),
                  },
                  { label: "Driver", value: trip.driverName },
                  { label: "Transporter", value: trip.transporterName },
                  { label: "Material", value: trip.materialName },
                  {
                    label: "Loaded",
                    value: `${formatQty(trip.loadedQty, trip.unit)} · ${trip.loading.slipNo}`,
                  },
                  {
                    label: "Delivered",
                    value: `${formatQty(trip.deliveredQty ?? 0, trip.unit)} · ${trip.delivery?.slipNo ?? ""}`,
                  },
                ]}
              />
              <Button asChild variant="outline" size="sm">
                <Link to="/trips/$tripId" params={{ tripId: trip.id }}>
                  Open trip & original slips
                </Link>
              </Button>
              {can("manage_trips") ? (
                <div className="space-y-4 border-t pt-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="outcome">Outcome</Label>
                    <Select
                      value={outcome}
                      onValueChange={(v) => setOutcome(v as InvestigationOutcome)}
                    >
                      <SelectTrigger id="outcome">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {OUTCOMES.map((o) => (
                          <SelectItem key={o} value={o}>
                            {o}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="trip-status">Trip status</Label>
                    <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
                      <SelectTrigger id="trip-status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Delivered">Normal — close the check</SelectItem>
                        <SelectItem value="Needs Verification">Needs verification</SelectItem>
                        <SelectItem value="Confirmed Shortage">Confirmed shortage</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="notes">Notes (required)</Label>
                    <Textarea
                      id="notes"
                      rows={4}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Who was contacted, what was checked, agreed next step"
                    />
                  </div>
                </div>
              ) : (
                <InfoNote>You can view this check but not change it.</InfoNote>
              )}
            </div>
            {can("manage_trips") && (
              <SheetFooter className="flex-row justify-end gap-2">
                <Button variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <Button
                  disabled={notes.trim().length < 5 || save.isPending}
                  onClick={async () => {
                    await save.mutateAsync({ outcome, notes, status });
                    onClose();
                  }}
                >
                  {save.isPending && <Loader2 className="size-4 animate-spin" />}Save outcome
                </Button>
              </SheetFooter>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

export function ShortagesPage() {
  const { data, isLoading, error } = useShortages();
  const { data: materials } = useMaterials();
  const [selected, setSelected] = useState<TripView | null>(null);
  const vehicleChart = useMemo(() => {
    const map = new Map<string, { plate: string; verify: number; confirmed: number }>();
    (data ?? [])
      .filter((t) => t.shortageStatus !== "Normal")
      .forEach((t) => {
        const row = map.get(t.vehiclePlate) ?? { plate: t.vehiclePlate, verify: 0, confirmed: 0 };
        if (t.shortageStatus === "Confirmed Shortage") row.confirmed += 1;
        else row.verify += 1;
        map.set(t.vehiclePlate, row);
      });
    return [...map.values()]
      .sort((a, b) => b.verify + b.confirmed - (a.verify + a.confirmed))
      .slice(0, 10);
  }, [data]);
  if (error) return <ErrorState error={error} />;
  const count = (s: string) => data?.filter((t) => t.shortageStatus === s).length ?? 0;
  const open = data?.filter((t) => t.status === "Needs Verification").length ?? 0;

  const columns: Column<TripView>[] = [
    {
      id: "id",
      header: "Trip",
      mobile: "title",
      sortValue: (t) => t.id,
      cell: (t) => <span className="font-medium text-primary">{t.id}</span>,
    },
    {
      id: "date",
      header: "Delivered",
      sortValue: (t) => t.delivery?.at ?? "",
      cell: (t) => formatDate(t.delivery?.at),
    },
    {
      id: "vehicle",
      header: "Vehicle",
      mobile: "subtitle",
      sortValue: (t) => t.vehiclePlate,
      cell: (t) => (
        <div>
          <p className="whitespace-nowrap">{t.vehiclePlate}</p>
          <p className="text-xs text-muted-foreground">{t.transporterName}</p>
        </div>
      ),
    },
    {
      id: "material",
      header: "Material",
      hideBelow: "lg",
      sortValue: (t) => t.materialName,
      cell: (t) => t.materialName,
    },
    {
      id: "loaded",
      header: "Loaded",
      align: "right",
      hideBelow: "xl",
      cell: (t) => formatQty(t.loadedQty, t.unit),
    },
    {
      id: "delivered",
      header: "Delivered",
      align: "right",
      hideBelow: "xl",
      cell: (t) => formatQty(t.deliveredQty ?? 0, t.unit),
    },
    {
      id: "difference",
      header: "Difference",
      align: "right",
      sortValue: (t) => t.difference,
      cell: (t) => <DifferenceValue trip={t} />,
    },
    {
      id: "tolerance",
      header: "Tolerance",
      align: "right",
      hideBelow: "lg",
      cell: (t) => <span className="text-muted-foreground">{formatQty(t.tolerance, t.unit)}</span>,
    },
    {
      id: "status",
      header: "Status",
      mobile: "badge",
      sortValue: (t) => t.shortageStatus,
      cell: (t) => <StatusBadge status={t.shortageStatus ?? "Normal"} />,
    },
    {
      id: "outcome",
      header: "Outcome",
      hideBelow: "lg",
      cell: (t) =>
        t.investigation ? (
          <span className="text-sm">{t.investigation.outcome}</span>
        ) : t.shortageStatus === "Normal" ? (
          <span className="text-muted-foreground">Within tolerance</span>
        ) : (
          <span className="text-amber-700 dark:text-amber-300">Not checked yet</span>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Delivery & Shortages"
        description="Loading weight vs delivery weight for every trip, checked against each material's tolerance."
        actions={
          <Button asChild variant="outline">
            <Link to="/settings">
              <Settings2 className="size-4" /> Tolerance settings
            </Link>
          </Button>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Within tolerance"
          value={count("Normal")}
          hint="Small difference, no action"
          icon={CheckCircle2}
          tone="green"
        />
        <KpiCard
          label="Needs verification"
          value={count("Needs Verification")}
          hint={`${open} still open`}
          icon={Scale}
          tone="amber"
          emphasis={open > 0}
        />
        <KpiCard
          label="Confirmed shortage"
          value={count("Confirmed Shortage")}
          hint="More than 2× tolerance"
          icon={AlertTriangle}
          tone="red"
        />
        <KpiCard
          label="Total difference"
          value={`${formatNumber(
            (data ?? [])
              .filter((t) => t.unit === "MT")
              .reduce((s, t) => s + (t.difference ?? 0), 0),
            1,
          )} MT`}
          hint="All trips with a shortfall"
          icon={Scale}
        />
      </div>
      <div className="mb-4 grid gap-4 xl:grid-cols-[1fr_1.4fr]">
        <SectionCard
          title="Tolerance by material"
          description="Normal ≤ tolerance · Needs verification ≤ 2× · Confirmed shortage > 2×"
        >
          <ul className="grid gap-2 sm:grid-cols-2">
            {(materials ?? []).map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
              >
                <span className="truncate">{m.name}</span>
                <span className="ml-2 shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums">
                  {m.tolerance ? `± ${formatQty(m.tolerance, m.unit)}` : "Exact count"}
                </span>
              </li>
            ))}
          </ul>
        </SectionCard>
        <SectionCard
          title="Vehicles with recurring differences"
          description="Trips above tolerance since June"
          actions={
            <ChartLegend
              items={[
                { label: "Needs verification", color: series(0) },
                { label: "Confirmed shortage", color: series(1) },
              ]}
            />
          }
        >
          <ChartBox height={240} label="Stacked bar chart of trips above tolerance by vehicle">
            <ResponsiveContainer>
              <BarChart
                data={vehicleChart.map((v) => ({ ...v, label: v.plate.slice(-7) }))}
                margin={{ left: -20, right: 4, top: 8 }}
              >
                <CartesianGrid {...gridProps} />
                <XAxis
                  dataKey="label"
                  {...axisProps}
                  interval={0}
                  angle={-25}
                  textAnchor="end"
                  height={48}
                />
                <YAxis {...axisProps} allowDecimals={false} />
                <Tooltip
                  content={
                    <ChartTooltip
                      format="number"
                      labelFormatter={(l) =>
                        vehicleChart.find((v) => v.plate.endsWith(l))?.plate ?? l
                      }
                    />
                  }
                  cursor={{ fill: "var(--muted)", opacity: 0.5 }}
                />
                <Bar
                  dataKey="verify"
                  name="Needs verification"
                  stackId="s"
                  fill={series(0)}
                  maxBarSize={30}
                  stroke="var(--card)"
                  strokeWidth={1}
                />
                <Bar
                  dataKey="confirmed"
                  name="Confirmed shortage"
                  stackId="s"
                  fill={series(1)}
                  maxBarSize={30}
                  radius={[4, 4, 0, 0]}
                  stroke="var(--card)"
                  strokeWidth={1}
                />
              </BarChart>
            </ResponsiveContainer>
          </ChartBox>
        </SectionCard>
      </div>
      <DataTable
        data={data}
        isLoading={isLoading}
        columns={columns}
        getRowId={(t) => t.id}
        onRowClick={setSelected}
        searchText={(t) =>
          `${t.id} ${t.vehiclePlate} ${t.driverName} ${t.transporterName} ${t.materialName}`
        }
        searchPlaceholder="Search trip, vehicle, driver…"
        filters={[
          {
            id: "status",
            label: "Statuses",
            options: ["Normal", "Needs Verification", "Confirmed Shortage"].map((s) => ({
              value: s,
              label: s,
            })),
            value: (t) => t.shortageStatus ?? "Normal",
          },
          {
            id: "vehicle",
            label: "Vehicles",
            options: optionsFrom(data?.map((t) => t.vehiclePlate) ?? []),
            value: (t) => t.vehiclePlate,
          },
          {
            id: "material",
            label: "Materials",
            options: optionsFrom(data?.map((t) => t.materialName) ?? []),
            value: (t) => t.materialName,
          },
        ]}
        initialFilters={{ status: "Needs Verification" }}
        dateValue={(t) => t.delivery?.at ?? null}
        defaultSort={{ id: "date", desc: true }}
        exportName="delivery-shortages"
      />
      <p className="mt-3 text-xs text-muted-foreground">
        Click a trip to record the investigation outcome.
      </p>
      <InvestigationSheet trip={selected} onClose={() => setSelected(null)} />
    </>
  );
}
