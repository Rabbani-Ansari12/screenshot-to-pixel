/** Vehicles & Drivers, and Materials (list + detail + add). */
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { z } from "zod";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, Boxes, ClipboardList, Plus, Scale, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { DataTable, optionsFrom, type Column } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { QuickAddDialog } from "@/components/quick-add-dialog";
import { orderColumns, purchaseColumns, tripColumns } from "@/components/record-columns";
import { SimpleTable } from "@/components/simple-table";
import { StatusBadge } from "@/components/status-badge";
import {
  api,
  useAction,
  useMasterOptions,
  useMaterial,
  useMaterials,
  useVehicle,
  useVehicles,
} from "@/hooks/queries";
import { useAuth } from "@/lib/auth";
import { formatINR, formatMonth, formatNumber, formatQty } from "@/lib/format";
import type { MaterialRow, VehicleRow } from "@/services/masters.service";

// ---------- Vehicles ----------
export function VehiclesPage() {
  const { data, isLoading, error } = useVehicles();
  const { data: options } = useMasterOptions();
  const { can } = useAuth();
  const [open, setOpen] = useState(false);
  const add = useAction(api.masters.addVehicle, (v) => `${v.plate} added`);
  if (error) return <ErrorState error={error} />;
  const columns: Column<VehicleRow>[] = [
    {
      id: "plate",
      header: "Vehicle",
      mobile: "title",
      sortValue: (v) => v.plate,
      cell: (v) => (
        <div>
          <Link
            to="/vehicles/$vehicleId"
            params={{ vehicleId: v.id }}
            onClick={(e) => e.stopPropagation()}
            className="whitespace-nowrap font-medium text-primary hover:underline"
          >
            {v.plate}
          </Link>
          <p className="text-xs text-muted-foreground">
            {v.type} · {v.capacity} MT
          </p>
        </div>
      ),
    },
    {
      id: "transporter",
      header: "Transporter",
      mobile: "subtitle",
      sortValue: (v) => v.transporterName,
      cell: (v) => v.transporterName,
    },
    {
      id: "driver",
      header: "Driver",
      cell: (v) => (
        <div>
          <p>{v.driverName}</p>
          <p className="text-xs text-muted-foreground">{v.driverPhone}</p>
        </div>
      ),
    },
    {
      id: "trips",
      header: "Trips",
      align: "right",
      sortValue: (v) => v.tripCount,
      cell: (v) => v.tripCount,
    },
    {
      id: "avg",
      header: "Avg difference",
      align: "right",
      hideBelow: "lg",
      sortValue: (v) => v.avgDifference,
      cell: (v) => <span className="tabular-nums">{formatNumber(v.avgDifference, 2)}</span>,
    },
    {
      id: "short",
      header: "Above tolerance",
      align: "right",
      sortValue: (v) => v.shortageCount,
      cell: (v) => v.shortageCount,
    },
    {
      id: "flag",
      header: "Pattern",
      mobile: "badge",
      sortValue: (v) => (v.recurringShortage ? 1 : 0),
      cell: (v) =>
        !v.active ? (
          <StatusBadge status="Inactive" />
        ) : v.recurringShortage ? (
          <StatusBadge status="Recurring difference" tone="warning" />
        ) : (
          <StatusBadge status="Normal" />
        ),
    },
  ];
  return (
    <>
      <PageHeader
        title="Vehicles & Drivers"
        description="Trucks linked to their transporter and regular driver. Vehicles with repeated delivery differences are highlighted for a check."
        actions={
          can("manage_trips") && (
            <Button onClick={() => setOpen(true)}>
              <Plus className="size-4" /> Add vehicle
            </Button>
          )
        }
      />
      <DataTable
        data={data}
        isLoading={isLoading}
        columns={columns}
        getRowId={(v) => v.id}
        rowHref={(v) => `/vehicles/${v.id}`}
        searchText={(v) =>
          `${v.plate} ${v.plate.replaceAll(" ", "")} ${v.driverName} ${v.transporterName}`
        }
        searchPlaceholder="Search plate, driver…"
        filters={[
          {
            id: "transporter",
            label: "Transporters",
            options: optionsFrom(data?.map((v) => v.transporterName) ?? []),
            value: (v) => v.transporterName,
          },
          {
            id: "flag",
            label: "Patterns",
            options: [
              { value: "rec", label: "Recurring difference" },
              { value: "ok", label: "Normal" },
            ],
            value: (v) => (v.recurringShortage ? "rec" : "ok"),
          },
        ]}
        defaultSort={{ id: "short", desc: true }}
        exportName="vehicles"
      />
      <QuickAddDialog
        open={open}
        onOpenChange={setOpen}
        title="Add vehicle & driver"
        schema={z.object({
          plate: z
            .string()
            .regex(
              /^[A-Za-z]{2}\s?\d{1,2}\s?[A-Za-z]{1,3}\s?\d{3,4}$/,
              "Use the format MH 12 AB 1234",
            ),
          transporterId: z.string().min(1, "Choose transporter"),
          type: z.string().min(2, "Required"),
          capacity: z.number({ invalid_type_error: "Enter capacity" }).positive(),
          driverName: z.string().min(2, "Required"),
          driverPhone: z.string().regex(/^\+?[\d\s]{10,15}$/, "Enter a valid phone"),
          licenseNo: z.string().min(6, "Required"),
        })}
        defaults={{
          plate: "",
          transporterId: "",
          type: "10-wheel tipper",
          capacity: 28,
          driverName: "",
          driverPhone: "",
          licenseNo: "",
        }}
        fields={[
          { name: "plate", label: "Registration number", placeholder: "MH 12 AB 1234" },
          {
            name: "transporterId",
            label: "Transporter",
            type: "select",
            options: (options?.transporters ?? []).map((t) => ({ value: t.id, label: t.name })),
          },
          { name: "type", label: "Vehicle type" },
          { name: "capacity", label: "Capacity (MT)", type: "number" },
          { name: "driverName", label: "Driver name" },
          { name: "driverPhone", label: "Driver phone", type: "tel" },
          { name: "licenseNo", label: "Driving licence no.", full: true },
        ]}
        onSubmit={(v) => add.mutateAsync(v)}
        submitLabel="Add vehicle"
      />
    </>
  );
}

export function VehicleDetailPage({ vehicleId }: { vehicleId: string }) {
  const { data, isLoading, error } = useVehicle(vehicleId);
  if (error) return <ErrorState error={error} />;
  if (isLoading || !data) return <DetailSkeleton />;
  const { vehicle: v, trips, driver } = data;
  const recent = trips
    .filter((t) => t.difference !== null && t.unit === "MT")
    .slice(0, 20)
    .reverse();
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
          </>
        }
      />
      {v.recurringShortage && (
        <InfoNote tone="warning" className="mb-4">
          This vehicle had {v.shortageCount} deliveries above tolerance. Worth checking the
          tarpaulin, the loading weighbridge and the route — differences can have ordinary causes.
        </InfoNote>
      )}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Trips" value={v.tripCount} icon={Truck} />
        <KpiCard
          label="Average difference"
          value={`${formatNumber(v.avgDifference, 2)}`}
          hint="Loading − delivery"
          icon={Scale}
        />
        <KpiCard
          label="Above tolerance"
          value={v.shortageCount}
          icon={AlertTriangle}
          tone={v.shortageCount >= 3 ? "amber" : "green"}
        />
        <KpiCard
          label="Driver"
          value={<span className="text-lg">{driver?.name ?? "—"}</span>}
          hint={driver?.phone}
          icon={ClipboardList}
          tone="blue"
        />
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
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
        <SectionCard title="Vehicle & driver">
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
              { label: "Login", value: "None — drivers send slips through the trip upload link" },
            ]}
          />
        </SectionCard>
      </div>
      <SectionCard title={`Trip history (${trips.length})`} className="mt-4">
        <SimpleTable
          rows={trips}
          getRowId={(t) => t.id}
          rowHref={(t) => `/trips/${t.id}`}
          maxRows={40}
          columns={tripColumns({ hide: ["vehicle", "transporter", "driver", "docs"] })}
        />
      </SectionCard>
    </>
  );
}

// ---------- Materials ----------
const UNIT_OPTIONS = ["MT", "CFT", "Brass", "m³", "Trips", "Bags", "Nos"].map((u) => ({
  value: u,
  label: u,
}));

export function MaterialsPage() {
  const { data, isLoading, error } = useMaterials();
  const { isOwner } = useAuth();
  const [open, setOpen] = useState(false);
  const add = useAction(api.masters.addMaterial, (m) => `${m.name} added`);
  if (error) return <ErrorState error={error} />;
  const columns: Column<MaterialRow>[] = [
    {
      id: "name",
      header: "Material",
      mobile: "title",
      sortValue: (m) => m.name,
      cell: (m) => (
        <div>
          <Link
            to="/materials/$materialId"
            params={{ materialId: m.id }}
            onClick={(e) => e.stopPropagation()}
            className="font-medium text-primary hover:underline"
          >
            {m.name}
          </Link>
          <p className="text-xs text-muted-foreground">
            HSN {m.hsn} · GST {m.gstRate}%
          </p>
        </div>
      ),
    },
    {
      id: "category",
      header: "Category",
      mobile: "subtitle",
      sortValue: (m) => m.category,
      cell: (m) => m.category,
    },
    {
      id: "unit",
      header: "Unit",
      mobile: "badge",
      cell: (m) => <StatusBadge status={m.unit} tone="neutral" />,
    },
    {
      id: "purchase",
      header: "Purchase rate",
      align: "right",
      sortValue: (m) => m.purchaseRate,
      cell: (m) => formatINR(m.purchaseRate),
    },
    {
      id: "selling",
      header: "Selling rate",
      align: "right",
      sortValue: (m) => m.sellingRate,
      cell: (m) => formatINR(m.sellingRate),
    },
    {
      id: "tolerance",
      header: "Tolerance",
      align: "right",
      hideBelow: "lg",
      cell: (m) => (m.tolerance ? `± ${formatQty(m.tolerance, m.unit)}` : "Exact"),
    },
    {
      id: "stock",
      header: "Yard stock",
      align: "right",
      hideBelow: "lg",
      sortValue: (m) => m.yardStock,
      cell: (m) => (m.yardStock ? formatQty(m.yardStock, m.unit, 1) : "—"),
    },
  ];
  return (
    <>
      <PageHeader
        title="Materials"
        description="Fully configurable: name, category, unit, rates and tolerance."
        actions={
          isOwner && (
            <Button onClick={() => setOpen(true)}>
              <Plus className="size-4" /> Add material
            </Button>
          )
        }
      />
      <InfoNote className="mb-4">
        Each material is traded in its own unit (MT, CFT, Brass, m³, Trips…). There is no automatic
        MT ↔ volume conversion anywhere in the system.
      </InfoNote>
      <DataTable
        data={data}
        isLoading={isLoading}
        columns={columns}
        getRowId={(m) => m.id}
        rowHref={(m) => `/materials/${m.id}`}
        searchText={(m) => `${m.name} ${m.category} ${m.hsn}`}
        searchPlaceholder="Search material…"
        filters={[
          {
            id: "category",
            label: "Categories",
            options: optionsFrom(data?.map((m) => m.category) ?? []),
            value: (m) => m.category,
          },
          {
            id: "unit",
            label: "Units",
            options: optionsFrom(data?.map((m) => m.unit) ?? []),
            value: (m) => m.unit,
          },
        ]}
        defaultSort={{ id: "name", desc: false }}
        exportName="materials"
      />
      <QuickAddDialog
        open={open}
        onOpenChange={setOpen}
        title="Add material"
        schema={z.object({
          name: z.string().min(2, "Required"),
          category: z.enum(["Sand", "Aggregate", "Cement", "Masonry", "Steel"]),
          unit: z.enum(["MT", "CFT", "Brass", "m³", "Trips", "Bags", "Nos"]),
          hsn: z.string().regex(/^\d{4,8}$/, "4–8 digit HSN"),
          gstRate: z.number({ invalid_type_error: "Enter GST %" }).min(0).max(28),
          purchaseRate: z.number({ invalid_type_error: "Enter rate" }).positive(),
          sellingRate: z.number({ invalid_type_error: "Enter rate" }).positive(),
          tolerance: z.number({ invalid_type_error: "Enter tolerance" }).min(0),
        })}
        defaults={{
          name: "",
          category: "Aggregate",
          unit: "MT",
          hsn: "",
          gstRate: 5,
          purchaseRate: Number.NaN,
          sellingRate: Number.NaN,
          tolerance: 0.25,
        }}
        fields={[
          { name: "name", label: "Name", full: true },
          {
            name: "category",
            label: "Category",
            type: "select",
            options: ["Sand", "Aggregate", "Cement", "Masonry", "Steel"].map((c) => ({
              value: c,
              label: c,
            })),
          },
          { name: "unit", label: "Unit", type: "select", options: UNIT_OPTIONS },
          { name: "hsn", label: "HSN code" },
          { name: "gstRate", label: "GST %", type: "number" },
          { name: "purchaseRate", label: "Purchase rate (₹/unit)", type: "number" },
          { name: "sellingRate", label: "Selling rate (₹/unit)", type: "number" },
          {
            name: "tolerance",
            label: "Shortage tolerance (in unit)",
            type: "number",
            full: true,
            hint: "Delivery differences up to this are Normal; up to 2× Needs Verification.",
          },
        ]}
        note={<InfoNote>No conversion between MT and volume units is applied.</InfoNote>}
        onSubmit={(v) => add.mutateAsync(v)}
        submitLabel="Add material"
      />
    </>
  );
}

export function MaterialDetailPage({ materialId }: { materialId: string }) {
  const { data, isLoading, error } = useMaterial(materialId);
  const { can } = useAuth();
  if (error) return <ErrorState error={error} />;
  if (isLoading || !data) return <DetailSkeleton />;
  const { material: m, purchases, orders, trips } = data;
  return (
    <>
      <PageHeader
        title={m.name}
        crumbs={[{ label: m.name }]}
        badge={<StatusBadge status={m.unit} tone="neutral" />}
        description={`${m.category} · HSN ${m.hsn} · GST ${m.gstRate}% · tolerance ${m.tolerance ? `± ${formatQty(m.tolerance, m.unit)}` : "exact count"}`}
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Purchase rate"
          value={formatINR(m.purchaseRate)}
          hint={`per ${m.unit}`}
          icon={Boxes}
          tone="amber"
        />
        <KpiCard
          label="Selling rate"
          value={formatINR(m.sellingRate)}
          hint={`per ${m.unit}`}
          icon={Boxes}
          tone="green"
        />
        <KpiCard
          label="Delivered (all time)"
          value={formatQty(m.deliveredQty, m.unit, 0)}
          icon={Truck}
        />
        <KpiCard
          label="Yard stock"
          value={formatQty(m.yardStock, m.unit, 1)}
          icon={Boxes}
          tone="blue"
        />
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <SectionCard
          title="Rate history"
          description={`₹ per ${m.unit}`}
          actions={
            <ChartLegend
              items={[
                { label: "Purchase", color: series(0) },
                { label: "Selling", color: series(1) },
              ]}
            />
          }
        >
          <ChartBox height={240} label="Line chart of purchase and selling rate history">
            <ResponsiveContainer>
              <LineChart
                data={m.rateHistory.map((r) => ({ ...r, label: formatMonth(r.date) }))}
                margin={{ left: 4, right: 8, top: 8 }}
              >
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="label" {...axisProps} />
                <YAxis
                  {...axisProps}
                  tickFormatter={(v: number) => `₹${formatNumber(v)}`}
                  width={70}
                  domain={["auto", "auto"]}
                />
                <Tooltip content={<ChartTooltip format="inr" />} />
                <Line
                  dataKey="purchaseRate"
                  name="Purchase"
                  stroke={series(0)}
                  strokeWidth={2}
                  dot={{ r: 4 }}
                />
                <Line
                  dataKey="sellingRate"
                  name="Selling"
                  stroke={series(1)}
                  strokeWidth={2}
                  dot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartBox>
        </SectionCard>
        <SectionCard title="Rate table">
          <SimpleTable
            rows={[...m.rateHistory].reverse()}
            getRowId={(r) => r.date}
            columns={[
              { id: "d", header: "From", mobile: "title", cell: (r) => formatMonth(r.date) },
              {
                id: "p",
                header: "Purchase",
                align: "right",
                cell: (r) => formatINR(r.purchaseRate),
              },
              { id: "s", header: "Selling", align: "right", cell: (r) => formatINR(r.sellingRate) },
              {
                id: "m",
                header: "Margin",
                align: "right",
                mobile: "badge",
                cell: (r) => formatINR(r.sellingRate - r.purchaseRate),
              },
            ]}
          />
          <InfoNote className="mt-4">
            Unit is {m.unit}. Quantities are never converted to or from other units.
          </InfoNote>
        </SectionCard>
      </div>
      <Tabs defaultValue="orders" className="mt-4">
        <TabsList>
          <TabsTrigger value="orders">Orders ({orders.length})</TabsTrigger>
          <TabsTrigger value="purchases">Purchases ({purchases.length})</TabsTrigger>
          <TabsTrigger value="trips">Recent trips</TabsTrigger>
        </TabsList>
        <TabsContent value="orders" className="mt-4">
          <SectionCard>
            <SimpleTable
              rows={orders}
              getRowId={(o) => o.id}
              rowHref={(o) => `/orders/${o.id}`}
              columns={orderColumns({
                hide: ["materials"],
                showProfit: can("view_financial_reports"),
              })}
            />
          </SectionCard>
        </TabsContent>
        <TabsContent value="purchases" className="mt-4">
          <SectionCard>
            <SimpleTable
              rows={purchases}
              getRowId={(p) => p.id}
              rowHref={(p) => `/purchases/${p.id}`}
              maxRows={30}
              columns={purchaseColumns({ hide: ["material"] })}
            />
          </SectionCard>
        </TabsContent>
        <TabsContent value="trips" className="mt-4">
          <SectionCard>
            <SimpleTable
              rows={trips}
              getRowId={(t) => t.id}
              rowHref={(t) => `/trips/${t.id}`}
              maxRows={30}
              columns={tripColumns({ hide: ["material", "driver", "docs"] })}
            />
          </SectionCard>
        </TabsContent>
      </Tabs>
    </>
  );
}
