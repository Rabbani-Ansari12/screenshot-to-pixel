/** Material Providers and Transporters (list + detail + add). */
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { z } from "zod";
import { AlertTriangle, ArrowDownToLine, IndianRupee, Plus, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DetailList, DetailSkeleton, ErrorState, KpiCard, SectionCard } from "@/components/common";
import { DataTable, type Column } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { QuickAddDialog } from "@/components/quick-add-dialog";
import {
  billColumns,
  paymentColumns,
  purchaseColumns,
  tripColumns,
} from "@/components/record-columns";
import { SimpleTable } from "@/components/simple-table";
import { StatusBadge } from "@/components/status-badge";
import {
  api,
  useAction,
  useMasterOptions,
  useProvider,
  useProviders,
  useTransporter,
  useTransporters,
} from "@/hooks/queries";
import { useAuth } from "@/lib/auth";
import { formatINR, formatINRCompact } from "@/lib/format";
import type { ProviderRow, TransporterRow } from "@/services/masters.service";

const gstin = z
  .string()
  .regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/, "Enter a valid 15-character GSTIN");
const phone = z.string().regex(/^\+?[\d\s]{10,15}$/, "Enter a valid phone number");

// ---------- Providers ----------
export function ProvidersPage() {
  const { data, isLoading, error } = useProviders();
  const { data: options } = useMasterOptions();
  const { can } = useAuth();
  const [open, setOpen] = useState(false);
  const add = useAction(api.masters.addProvider, (p) => `${p.name} added`);
  if (error) return <ErrorState error={error} />;
  const columns: Column<ProviderRow>[] = [
    {
      id: "name",
      header: "Provider",
      mobile: "title",
      sortValue: (p) => p.name,
      cell: (p) => (
        <div>
          <Link
            to="/providers/$providerId"
            params={{ providerId: p.id }}
            onClick={(e) => e.stopPropagation()}
            className="font-medium text-primary hover:underline"
          >
            {p.name}
          </Link>
          <p className="text-xs text-muted-foreground">{p.city}</p>
        </div>
      ),
    },
    {
      id: "materials",
      header: "Materials",
      mobile: "subtitle",
      cell: (p) => <span className="line-clamp-2 max-w-xs">{p.materialNames.join(", ")}</span>,
    },
    {
      id: "contact",
      header: "Contact",
      hideBelow: "lg",
      cell: (p) => (
        <div>
          <p>{p.contactName}</p>
          <p className="text-xs text-muted-foreground">{p.phone}</p>
        </div>
      ),
    },
    {
      id: "purchases",
      header: "Purchases",
      align: "right",
      sortValue: (p) => p.purchaseValue,
      cell: (p) => <span className="tabular-nums">{formatINRCompact(p.purchaseValue)}</span>,
    },
    {
      id: "terms",
      header: "Terms",
      align: "right",
      hideBelow: "xl",
      cell: (p) => `${p.paymentTermsDays} days`,
    },
    {
      id: "payable",
      header: "Payable",
      align: "right",
      mobile: "badge",
      sortValue: (p) => p.payable,
      cell: (p) => <span className="font-semibold tabular-nums">{formatINR(p.payable)}</span>,
    },
  ];
  return (
    <>
      <PageHeader
        title="Material Providers"
        description="Quarries, crushers, depots and mills we buy from. Providers don't log in — their slips and bills arrive on WhatsApp."
        actions={
          can("manage_orders") && (
            <Button onClick={() => setOpen(true)}>
              <Plus className="size-4" /> Add provider
            </Button>
          )
        }
      />
      <DataTable
        data={data}
        isLoading={isLoading}
        columns={columns}
        getRowId={(p) => p.id}
        rowHref={(p) => `/providers/${p.id}`}
        searchText={(p) => `${p.name} ${p.city} ${p.materialNames.join(" ")}`}
        searchPlaceholder="Search provider, material…"
        defaultSort={{ id: "payable", desc: true }}
        exportName="providers"
      />
      <QuickAddDialog
        open={open}
        onOpenChange={setOpen}
        title="Add material provider"
        schema={z.object({
          name: z.string().min(2, "Required"),
          city: z.string().min(2, "Required"),
          gstin,
          contactName: z.string().min(2, "Required"),
          phone,
          paymentTermsDays: z.number({ invalid_type_error: "Enter days" }).int().min(0),
          materialIds: z.array(z.string()).min(1, "Pick at least one material"),
        })}
        defaults={{
          name: "",
          city: "",
          gstin: "",
          contactName: "",
          phone: "",
          paymentTermsDays: 30,
          materialIds: [],
        }}
        fields={[
          { name: "name", label: "Name", full: true },
          { name: "city", label: "City" },
          { name: "gstin", label: "GSTIN" },
          { name: "contactName", label: "Contact person" },
          {
            name: "phone",
            label: "WhatsApp number",
            type: "tel",
            hint: "Documents from this number are matched to the provider",
          },
          { name: "paymentTermsDays", label: "Payment terms (days)", type: "number" },
          {
            name: "materialIds",
            label: "Materials supplied",
            type: "multiselect",
            full: true,
            options: (options?.materials ?? []).map((m) => ({ value: m.id, label: m.name })),
          },
        ]}
        onSubmit={(v) => add.mutateAsync(v)}
        submitLabel="Add provider"
      />
    </>
  );
}

export function ProviderDetailPage({ providerId }: { providerId: string }) {
  const { data, isLoading, error } = useProvider(providerId);
  if (error) return <ErrorState error={error} />;
  if (isLoading || !data) return <DetailSkeleton />;
  const { provider: p, purchases, trips, bills, payments } = data;
  return (
    <>
      <PageHeader
        title={p.name}
        crumbs={[{ label: p.name }]}
        description={`${p.city} · GSTIN ${p.gstin} · ${p.paymentTermsDays} days credit`}
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Purchase value"
          value={formatINRCompact(p.purchaseValue)}
          icon={ArrowDownToLine}
        />
        <KpiCard label="Purchases" value={p.purchaseCount} icon={ArrowDownToLine} tone="blue" />
        <KpiCard
          label="Payable"
          value={formatINRCompact(p.payable)}
          icon={IndianRupee}
          tone="amber"
        />
        <KpiCard
          label="Bills with mismatches"
          value={
            bills.filter((b) => b.reconStatus === "Mismatch" || b.reconStatus === "Disputed").length
          }
          icon={AlertTriangle}
          tone="red"
        />
      </div>
      <Tabs defaultValue="purchases">
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <TabsList>
            <TabsTrigger value="purchases">Purchases</TabsTrigger>
            <TabsTrigger value="trips">Trips</TabsTrigger>
            <TabsTrigger value="bills">Bills</TabsTrigger>
            <TabsTrigger value="payments">Payments</TabsTrigger>
            <TabsTrigger value="outstanding">Outstanding</TabsTrigger>
            <TabsTrigger value="profile">Profile</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="purchases" className="mt-4">
          <SectionCard>
            <SimpleTable
              rows={purchases}
              getRowId={(x) => x.id}
              rowHref={(x) => `/purchases/${x.id}`}
              maxRows={30}
              columns={purchaseColumns({ hide: ["provider"] })}
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
              columns={tripColumns({ hide: ["provider", "driver", "docs"] })}
            />
          </SectionCard>
        </TabsContent>
        <TabsContent value="bills" className="mt-4">
          <SectionCard>
            <SimpleTable
              rows={bills}
              getRowId={(b) => b.id}
              rowHref={(b) => `/bills/${b.id}`}
              columns={billColumns({ hide: ["party"] })}
            />
          </SectionCard>
        </TabsContent>
        <TabsContent value="payments" className="mt-4">
          <SectionCard>
            <SimpleTable
              rows={payments}
              getRowId={(x) => x.id}
              columns={paymentColumns({ hide: ["party"] })}
              empty="No payments yet"
            />
          </SectionCard>
        </TabsContent>
        <TabsContent value="outstanding" className="mt-4">
          <SectionCard title={`Outstanding ${formatINR(p.payable)}`}>
            <SimpleTable
              rows={bills.filter((b) => b.outstanding > 0)}
              getRowId={(b) => b.id}
              rowHref={(b) => `/bills/${b.id}`}
              columns={billColumns({ hide: ["party", "doc"] })}
              empty="Nothing outstanding"
            />
          </SectionCard>
        </TabsContent>
        <TabsContent value="profile" className="mt-4">
          <SectionCard>
            <DetailList
              columns={3}
              items={[
                { label: "Contact", value: p.contactName },
                { label: "WhatsApp / phone", value: p.phone },
                { label: "GSTIN", value: p.gstin },
                { label: "City", value: p.city },
                { label: "Materials", value: p.materialNames.join(", ") },
                { label: "Payment terms", value: `${p.paymentTermsDays} days` },
              ]}
            />
          </SectionCard>
        </TabsContent>
      </Tabs>
    </>
  );
}

// ---------- Transporters ----------
export function TransportersPage() {
  const { data, isLoading, error } = useTransporters();
  const { can } = useAuth();
  const [open, setOpen] = useState(false);
  const add = useAction(api.masters.addTransporter, (t) => `${t.name} added`);
  if (error) return <ErrorState error={error} />;
  const columns: Column<TransporterRow>[] = [
    {
      id: "name",
      header: "Transporter",
      mobile: "title",
      sortValue: (t) => t.name,
      cell: (t) => (
        <div>
          <Link
            to="/transporters/$transporterId"
            params={{ transporterId: t.id }}
            onClick={(e) => e.stopPropagation()}
            className="font-medium text-primary hover:underline"
          >
            {t.name}
          </Link>
          <p className="text-xs text-muted-foreground">{t.city}</p>
        </div>
      ),
    },
    {
      id: "contact",
      header: "Contact",
      mobile: "subtitle",
      cell: (t) => (
        <div>
          <p>{t.contactName}</p>
          <p className="text-xs text-muted-foreground">{t.phone}</p>
        </div>
      ),
    },
    {
      id: "vehicles",
      header: "Vehicles",
      align: "right",
      sortValue: (t) => t.vehicleCount,
      cell: (t) => t.vehicleCount,
    },
    {
      id: "trips",
      header: "Trips",
      align: "right",
      sortValue: (t) => t.tripCount,
      cell: (t) => t.tripCount,
    },
    {
      id: "rate",
      header: "Rate / trip",
      align: "right",
      hideBelow: "lg",
      sortValue: (t) => t.ratePerTrip,
      cell: (t) => formatINR(t.ratePerTrip),
    },
    {
      id: "short",
      header: "Above tolerance",
      align: "right",
      hideBelow: "lg",
      sortValue: (t) => t.shortageTrips,
      cell: (t) => (
        <span
          className={t.shortageTrips >= 5 ? "font-semibold text-amber-700 dark:text-amber-300" : ""}
        >
          {t.shortageTrips}
        </span>
      ),
    },
    {
      id: "payable",
      header: "Payable",
      align: "right",
      mobile: "badge",
      sortValue: (t) => t.payable,
      cell: (t) => <span className="font-semibold tabular-nums">{formatINR(t.payable)}</span>,
    },
  ];
  return (
    <>
      <PageHeader
        title="Transporters"
        description="Haulage partners and their fleets. Transporters and drivers don't log in."
        actions={
          can("manage_trips") && (
            <Button onClick={() => setOpen(true)}>
              <Plus className="size-4" /> Add transporter
            </Button>
          )
        }
      />
      <DataTable
        data={data}
        isLoading={isLoading}
        columns={columns}
        getRowId={(t) => t.id}
        rowHref={(t) => `/transporters/${t.id}`}
        searchText={(t) => `${t.name} ${t.city} ${t.contactName}`}
        searchPlaceholder="Search transporter…"
        defaultSort={{ id: "trips", desc: true }}
        exportName="transporters"
      />
      <QuickAddDialog
        open={open}
        onOpenChange={setOpen}
        title="Add transporter"
        schema={z.object({
          name: z.string().min(2, "Required"),
          city: z.string().min(2, "Required"),
          gstin,
          contactName: z.string().min(2, "Required"),
          phone,
          ratePerTrip: z.number({ invalid_type_error: "Enter rate" }).positive(),
        })}
        defaults={{ name: "", city: "", gstin: "", contactName: "", phone: "", ratePerTrip: 5800 }}
        fields={[
          { name: "name", label: "Name", full: true },
          { name: "city", label: "City" },
          { name: "gstin", label: "GSTIN" },
          { name: "contactName", label: "Contact person" },
          { name: "phone", label: "WhatsApp number", type: "tel" },
          { name: "ratePerTrip", label: "Default rate per trip (₹)", type: "number" },
        ]}
        onSubmit={(v) => add.mutateAsync(v)}
        submitLabel="Add transporter"
      />
    </>
  );
}

export function TransporterDetailPage({ transporterId }: { transporterId: string }) {
  const { data, isLoading, error } = useTransporter(transporterId);
  if (error) return <ErrorState error={error} />;
  if (isLoading || !data) return <DetailSkeleton />;
  const { transporter: t, vehicles, trips, bills, payments } = data;
  return (
    <>
      <PageHeader
        title={t.name}
        crumbs={[{ label: t.name }]}
        description={`${t.city} · GSTIN ${t.gstin} · ${formatINR(t.ratePerTrip)} per trip`}
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Vehicles" value={t.vehicleCount} icon={Truck} />
        <KpiCard label="Trips" value={t.tripCount} icon={Truck} tone="blue" />
        <KpiCard
          label="Trips above tolerance"
          value={t.shortageTrips}
          icon={AlertTriangle}
          tone="amber"
        />
        <KpiCard
          label="Payable"
          value={formatINRCompact(t.payable)}
          icon={IndianRupee}
          tone="amber"
        />
      </div>
      <Tabs defaultValue="vehicles">
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <TabsList>
            <TabsTrigger value="vehicles">Vehicles</TabsTrigger>
            <TabsTrigger value="trips">Trips</TabsTrigger>
            <TabsTrigger value="bills">Bills</TabsTrigger>
            <TabsTrigger value="payments">Payments</TabsTrigger>
            <TabsTrigger value="outstanding">Outstanding</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="vehicles" className="mt-4">
          <SectionCard>
            <SimpleTable
              rows={vehicles}
              getRowId={(v) => v.id}
              rowHref={(v) => `/vehicles/${v.id}`}
              columns={[
                {
                  id: "p",
                  header: "Vehicle",
                  mobile: "title",
                  cell: (v) => <span className="font-medium">{v.plate}</span>,
                },
                { id: "d", header: "Driver", cell: (v) => `${v.driverName} · ${v.driverPhone}` },
                { id: "t", header: "Trips", align: "right", cell: (v) => v.tripCount },
                {
                  id: "s",
                  header: "Above tolerance",
                  align: "right",
                  cell: (v) => v.shortageCount,
                },
                {
                  id: "r",
                  header: "Pattern",
                  mobile: "badge",
                  cell: (v) =>
                    v.recurringShortage ? (
                      <StatusBadge status="Recurring difference" tone="warning" />
                    ) : (
                      <StatusBadge status="Normal" />
                    ),
                },
              ]}
            />
          </SectionCard>
        </TabsContent>
        <TabsContent value="trips" className="mt-4">
          <SectionCard>
            <SimpleTable
              rows={trips}
              getRowId={(x) => x.id}
              rowHref={(x) => `/trips/${x.id}`}
              maxRows={30}
              columns={tripColumns({ hide: ["transporter", "provider", "docs"] })}
            />
          </SectionCard>
        </TabsContent>
        <TabsContent value="bills" className="mt-4">
          <SectionCard>
            <SimpleTable
              rows={bills}
              getRowId={(b) => b.id}
              rowHref={(b) => `/bills/${b.id}`}
              columns={billColumns({ hide: ["party"] })}
            />
          </SectionCard>
        </TabsContent>
        <TabsContent value="payments" className="mt-4">
          <SectionCard>
            <SimpleTable
              rows={payments}
              getRowId={(x) => x.id}
              columns={paymentColumns({ hide: ["party"] })}
              empty="No payments yet"
            />
          </SectionCard>
        </TabsContent>
        <TabsContent value="outstanding" className="mt-4">
          <SectionCard title={`Outstanding ${formatINR(t.payable)}`}>
            <SimpleTable
              rows={bills.filter((b) => b.outstanding > 0)}
              getRowId={(b) => b.id}
              rowHref={(b) => `/bills/${b.id}`}
              columns={billColumns({ hide: ["party", "doc"] })}
              empty="Nothing outstanding"
            />
          </SectionCard>
        </TabsContent>
      </Tabs>
    </>
  );
}
