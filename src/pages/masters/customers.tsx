import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { z } from "zod";
import { Building2, MapPin, Plus, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DetailList, DetailSkeleton, ErrorState, KpiCard, SectionCard } from "@/components/common";
import { DataTable, type Column } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { QuickAddDialog } from "@/components/quick-add-dialog";
import {
  invoiceColumns,
  orderColumns,
  paymentColumns,
  tripColumns,
} from "@/components/record-columns";
import { SimpleTable } from "@/components/simple-table";
import { StatusBadge } from "@/components/status-badge";
import { api, useAction, useCustomer, useCustomers } from "@/hooks/queries";
import { useAuth } from "@/lib/auth";
import { formatDate, formatINR, formatINRCompact } from "@/lib/format";
import type { CustomerRow } from "@/services/masters.service";

const gstin = z
  .string()
  .regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/, "Enter a valid 15-character GSTIN");
const customerSchema = z.object({
  name: z.string().min(2, "Required"),
  type: z.enum(["Builder", "Infrastructure", "Contractor", "Industrial"]),
  gstin,
  contactName: z.string().min(2, "Required"),
  phone: z.string().regex(/^\+?[\d\s]{10,15}$/, "Enter a valid phone number"),
  email: z.string().email("Enter a valid email"),
  city: z.string().min(2, "Required"),
  state: z.string().min(2, "Required"),
  billingAddress: z.string().min(5, "Required"),
  creditDays: z.number({ invalid_type_error: "Enter days" }).int().min(0).max(180),
  siteName: z.string(),
  siteAddress: z.string(),
});

export function CustomersPage() {
  const { data, isLoading, error } = useCustomers();
  const { can } = useAuth();
  const [open, setOpen] = useState(false);
  const add = useAction(api.masters.addCustomer, (c) => `${c.name} added`);
  if (error) return <ErrorState error={error} />;
  const columns: Column<CustomerRow>[] = [
    {
      id: "name",
      header: "Customer",
      mobile: "title",
      sortValue: (c) => c.name,
      cell: (c) => (
        <div>
          <Link
            to="/customers/$customerId"
            params={{ customerId: c.id }}
            onClick={(e) => e.stopPropagation()}
            className="font-medium text-primary hover:underline"
          >
            {c.name}
          </Link>
          <p className="text-xs text-muted-foreground">{c.gstin}</p>
        </div>
      ),
    },
    {
      id: "type",
      header: "Type",
      mobile: "badge",
      sortValue: (c) => c.type,
      cell: (c) => <StatusBadge status={c.type} tone="neutral" />,
    },
    {
      id: "contact",
      header: "Contact",
      mobile: "subtitle",
      cell: (c) => (
        <div>
          <p>{c.contactName}</p>
          <p className="text-xs text-muted-foreground">{c.phone}</p>
        </div>
      ),
    },
    {
      id: "city",
      header: "City",
      hideBelow: "lg",
      sortValue: (c) => c.city,
      cell: (c) => `${c.city}, ${c.state}`,
    },
    {
      id: "sites",
      header: "Sites",
      align: "right",
      sortValue: (c) => c.siteCount,
      cell: (c) => c.siteCount,
    },
    {
      id: "orders",
      header: "Active orders",
      align: "right",
      sortValue: (c) => c.activeOrders,
      cell: (c) => c.activeOrders,
    },
    {
      id: "outstanding",
      header: "Outstanding",
      align: "right",
      sortValue: (c) => c.outstanding,
      cell: (c) => <span className="font-semibold tabular-nums">{formatINR(c.outstanding)}</span>,
    },
  ];
  return (
    <>
      <PageHeader
        title="Customers"
        description="Construction companies we supply, with their sites."
        actions={
          can("manage_orders") && (
            <Button onClick={() => setOpen(true)}>
              <Plus className="size-4" /> Add customer
            </Button>
          )
        }
      />
      <DataTable
        data={data}
        isLoading={isLoading}
        columns={columns}
        getRowId={(c) => c.id}
        rowHref={(c) => `/customers/${c.id}`}
        searchText={(c) => `${c.name} ${c.gstin} ${c.contactName} ${c.city}`}
        searchPlaceholder="Search customer, GSTIN, contact…"
        filters={[
          {
            id: "type",
            label: "Types",
            options: ["Builder", "Infrastructure", "Contractor", "Industrial"].map((t) => ({
              value: t,
              label: t,
            })),
            value: (c) => c.type,
          },
        ]}
        defaultSort={{ id: "outstanding", desc: true }}
        exportName="customers"
      />
      <QuickAddDialog
        open={open}
        onOpenChange={setOpen}
        title="Add customer"
        description="Customers don't get a login. Add their first site now or later."
        schema={customerSchema}
        defaults={{
          name: "",
          type: "Builder",
          gstin: "",
          contactName: "",
          phone: "",
          email: "",
          city: "Pune",
          state: "Maharashtra",
          billingAddress: "",
          creditDays: 30,
          siteName: "",
          siteAddress: "",
        }}
        fields={[
          { name: "name", label: "Company name", full: true },
          {
            name: "type",
            label: "Type",
            type: "select",
            options: ["Builder", "Infrastructure", "Contractor", "Industrial"].map((t) => ({
              value: t,
              label: t,
            })),
          },
          { name: "gstin", label: "GSTIN", placeholder: "27AAAAA0000A1Z5" },
          { name: "contactName", label: "Contact person" },
          { name: "phone", label: "Phone", type: "tel", placeholder: "+91 98xxx xxxxx" },
          { name: "email", label: "Email", type: "email" },
          { name: "creditDays", label: "Credit days", type: "number" },
          { name: "city", label: "City" },
          { name: "state", label: "State" },
          { name: "billingAddress", label: "Billing address", full: true },
          { name: "siteName", label: "First site name (optional)" },
          { name: "siteAddress", label: "Site address" },
        ]}
        onSubmit={(v) => add.mutateAsync(v)}
        submitLabel="Add customer"
      />
    </>
  );
}

export function CustomerDetailPage({ customerId }: { customerId: string }) {
  const { data, isLoading, error } = useCustomer(customerId);
  const { can } = useAuth();
  const [siteOpen, setSiteOpen] = useState(false);
  const addSite = useAction(api.masters.addSite, (s) => `Site ${s.name} added`);
  if (error) return <ErrorState error={error} />;
  if (isLoading || !data) return <DetailSkeleton />;
  const { customer: c, sites, orders, invoices, payments, trips } = data;
  const overdue = invoices.filter((i) => i.overdueDays > 0);
  return (
    <>
      <PageHeader
        title={c.name}
        crumbs={[{ label: c.name }]}
        badge={<StatusBadge status={c.type} tone="neutral" />}
        description={`${c.city}, ${c.state} · GSTIN ${c.gstin} · ${c.creditDays} days credit`}
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Construction sites" value={sites.length} icon={MapPin} />
        <KpiCard label="Active orders" value={c.activeOrders} icon={Building2} tone="blue" />
        <KpiCard label="Invoiced" value={formatINRCompact(c.totalInvoiced)} icon={Wallet} />
        <KpiCard
          label="Outstanding"
          value={formatINRCompact(c.outstanding)}
          hint={overdue.length ? `${overdue.length} invoices overdue` : "Nothing overdue"}
          icon={Wallet}
          tone={overdue.length ? "red" : "green"}
        />
      </div>
      <Tabs defaultValue="sites">
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <TabsList>
            <TabsTrigger value="sites">Sites ({sites.length})</TabsTrigger>
            <TabsTrigger value="orders">Orders ({orders.length})</TabsTrigger>
            <TabsTrigger value="trips">Trips ({trips.length})</TabsTrigger>
            <TabsTrigger value="invoices">Invoices ({invoices.length})</TabsTrigger>
            <TabsTrigger value="payments">Payments ({payments.length})</TabsTrigger>
            <TabsTrigger value="outstanding">Outstanding</TabsTrigger>
            <TabsTrigger value="profile">Profile</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="sites" className="mt-4">
          <SectionCard
            actions={
              can("manage_orders") && (
                <Button size="sm" variant="outline" onClick={() => setSiteOpen(true)}>
                  <Plus className="size-4" /> Add site
                </Button>
              )
            }
            title="Construction sites"
          >
            <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {sites.map((s) => (
                <li key={s.id} className="rounded-xl border p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium">{s.name}</p>
                    <StatusBadge status={s.active ? "Active" : "Inactive"} />
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {s.address}, {s.city}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Site contact: {s.contactName} · {s.contactPhone}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {orders.filter((o) => o.siteId === s.id).length} orders
                  </p>
                </li>
              ))}
            </ul>
          </SectionCard>
        </TabsContent>
        <TabsContent value="orders" className="mt-4">
          <SectionCard>
            <SimpleTable
              rows={orders}
              getRowId={(o) => o.id}
              rowHref={(o) => `/orders/${o.id}`}
              columns={orderColumns({
                hide: ["customer"],
                showProfit: can("view_financial_reports"),
              })}
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
              columns={tripColumns({ hide: ["provider", "transporter", "driver", "docs"] })}
            />
          </SectionCard>
        </TabsContent>
        <TabsContent value="invoices" className="mt-4">
          <SectionCard>
            <SimpleTable
              rows={invoices}
              getRowId={(i) => i.id}
              rowHref={(i) => `/invoices/${i.id}`}
              columns={invoiceColumns({ hide: ["customer"] })}
            />
          </SectionCard>
        </TabsContent>
        <TabsContent value="payments" className="mt-4">
          <SectionCard>
            <SimpleTable
              rows={payments}
              getRowId={(p) => p.id}
              columns={paymentColumns({ hide: ["party"] })}
              empty="No payments yet"
            />
          </SectionCard>
        </TabsContent>
        <TabsContent value="outstanding" className="mt-4">
          <SectionCard
            title="Unpaid invoices"
            description={`Total outstanding ${formatINR(c.outstanding)}`}
          >
            <SimpleTable
              rows={invoices.filter((i) => i.balance > 0)}
              getRowId={(i) => i.id}
              rowHref={(i) => `/invoices/${i.id}`}
              columns={invoiceColumns({ hide: ["customer", "flags"] })}
              empty="Nothing outstanding"
            />
          </SectionCard>
        </TabsContent>
        <TabsContent value="profile" className="mt-4">
          <SectionCard>
            <DetailList
              columns={3}
              items={[
                { label: "Contact person", value: c.contactName },
                { label: "Phone", value: c.phone },
                { label: "Email", value: c.email },
                { label: "GSTIN", value: c.gstin },
                { label: "Billing address", value: c.billingAddress },
                { label: "Credit days", value: c.creditDays },
                { label: "Customer since", value: formatDate(c.createdAt) },
                { label: "Portal login", value: "None — customers don't log in" },
              ]}
            />
          </SectionCard>
        </TabsContent>
      </Tabs>
      <QuickAddDialog
        open={siteOpen}
        onOpenChange={setSiteOpen}
        title={`Add site for ${c.name}`}
        schema={z.object({
          name: z.string().min(2, "Required"),
          address: z.string().min(3, "Required"),
          city: z.string().min(2, "Required"),
          contactName: z.string().min(2, "Required"),
          contactPhone: z.string().min(10, "Enter phone"),
        })}
        defaults={{ name: "", address: "", city: c.city, contactName: "", contactPhone: "" }}
        fields={[
          { name: "name", label: "Site name", full: true },
          { name: "address", label: "Address", full: true },
          { name: "city", label: "City" },
          { name: "contactName", label: "Site contact" },
          { name: "contactPhone", label: "Contact phone", type: "tel" },
        ]}
        onSubmit={(v) => addSite.mutateAsync({ ...v, customerId: c.id })}
        submitLabel="Add site"
      />
    </>
  );
}
