import { useState } from "react";
import { Link } from "@tanstack/react-router";
import type { BillKind, BillView, InvoiceView } from "@/types";
import type { TableQuery } from "@/services/supabase/table-query";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable, type Column } from "@/components/data-table";
import { ErrorState, InfoNote } from "@/components/common";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { useBillsPage, useFinanceTotals, useInvoicesPage, useMasterOptions } from "@/hooks/queries";
import { formatDate, formatINR } from "@/lib/format";
import { cn } from "@/lib/utils";

const RECON = [
  "Unreconciled",
  "Matched",
  "Mismatch",
  "Disputed",
  "Correction Requested",
  "Difference Approved",
  "Reconciled",
];

export function DiffValue({ value }: { value: number }) {
  if (Math.abs(value) < 1)
    return <span className="text-emerald-700 dark:text-emerald-300">Matches</span>;
  return (
    <span
      className={cn(
        "font-semibold tabular-nums",
        value > 0 ? "text-rose-600 dark:text-rose-400" : "text-amber-700 dark:text-amber-300",
      )}
    >
      {value > 0 ? "+" : "−"}
      {formatINR(Math.abs(value))}
    </span>
  );
}

function billCols(): Column<BillView>[] {
  return [
    {
      id: "bill",
      header: "Bill",
      mobile: "title",
      sortValue: (b) => b.billNo,
      cell: (b) => (
        <div>
          <p className="font-medium text-primary">{b.billNo}</p>
          <p className="text-xs text-muted-foreground">{formatDate(b.date)}</p>
        </div>
      ),
    },
    {
      id: "party",
      header: "Party",
      mobile: "subtitle",
      sortValue: (b) => b.partyName,
      cell: (b) => b.partyName,
    },
    {
      id: "billed",
      header: "Billed",
      align: "right",
      sortValue: (b) => b.billedSubtotal,
      cell: (b) => <span className="tabular-nums">{formatINR(b.billedSubtotal)}</span>,
    },
    {
      id: "recorded",
      header: "Recorded",
      align: "right",
      hideBelow: "lg",
      sortValue: (b) => b.recordedSubtotal,
      cell: (b) => <span className="tabular-nums">{formatINR(b.recordedSubtotal)}</span>,
    },
    {
      id: "diff",
      header: "Difference",
      align: "right",
      sortValue: (b) => b.difference,
      cell: (b) => <DiffValue value={b.difference} />,
    },
    {
      id: "trips",
      header: "Trips (billed / recorded)",
      align: "right",
      hideBelow: "xl",
      cell: (b) => (
        <span
          className={cn(
            "tabular-nums",
            b.billedTrips !== b.recordedTrips && "font-semibold text-rose-600",
          )}
        >
          {b.billedTrips} / {b.recordedTrips}
        </span>
      ),
    },
    {
      id: "status",
      header: "Status",
      mobile: "badge",
      sortValue: (b) => b.reconStatus,
      cell: (b) => <StatusBadge status={b.reconStatus} />,
    },
    {
      id: "act",
      header: "",
      align: "right",
      mobile: "hidden",
      cell: (b) => (
        <Button
          asChild
          size="sm"
          variant={
            ["Mismatch", "Unreconciled", "Matched"].includes(b.reconStatus) ? "default" : "ghost"
          }
          onClick={(e) => e.stopPropagation()}
        >
          <Link to="/reconciliation/$recordId" params={{ recordId: b.id }}>
            {["Mismatch", "Unreconciled", "Matched"].includes(b.reconStatus) ? "Reconcile" : "View"}
          </Link>
        </Button>
      ),
    },
  ];
}

const invoiceCols: Column<InvoiceView>[] = [
  {
    id: "inv",
    header: "Invoice",
    mobile: "title",
    sortValue: (i) => i.number,
    cell: (i) => (
      <div>
        <p className="font-medium text-primary">{i.number}</p>
        <p className="text-xs text-muted-foreground">{formatDate(i.date)}</p>
      </div>
    ),
  },
  {
    id: "customer",
    header: "Customer",
    mobile: "subtitle",
    sortValue: (i) => i.customerName,
    cell: (i) => (
      <div>
        <p>{i.customerName}</p>
        <p className="text-xs text-muted-foreground">{i.orderRef}</p>
      </div>
    ),
  },
  {
    id: "total",
    header: "Amount",
    align: "right",
    sortValue: (i) => i.total,
    cell: (i) => <span className="tabular-nums">{formatINR(i.total)}</span>,
  },
  {
    id: "flags",
    header: "Flags",
    cell: (i) =>
      i.flags.length ? (
        <div className="flex flex-wrap gap-1">
          {i.flags.map((f) => (
            <StatusBadge key={f} status={f} tone="danger" />
          ))}
        </div>
      ) : (
        <StatusBadge status="Passed" />
      ),
  },
  {
    id: "status",
    header: "Status",
    mobile: "badge",
    sortValue: (i) => i.reconStatus,
    cell: (i) => <StatusBadge status={i.reconStatus} />,
  },
  {
    id: "act",
    header: "",
    align: "right",
    mobile: "hidden",
    cell: (i) => (
      <Button
        asChild
        size="sm"
        variant={i.flags.length ? "default" : "ghost"}
        onClick={(e) => e.stopPropagation()}
      >
        <Link to="/reconciliation/$recordId" params={{ recordId: i.id }}>
          {i.flags.length ? "Verify" : "View"}
        </Link>
      </Button>
    ),
  },
];

function BillQueue({ kind }: { kind: BillKind }) {
  const [query, setQuery] = useState<TableQuery | null>(null);
  const { data, isLoading, error } = useBillsPage(kind, query);
  const { data: options } = useMasterOptions();
  const parties = kind === "Provider" ? options?.providers : options?.transporters;
  if (error) return <ErrorState error={error} />;
  return (
    <DataTable
      data={data?.rows}
      isLoading={isLoading || !query}
      server={{ total: data?.total ?? 0, onQueryChange: setQuery }}
      columns={billCols()}
      getRowId={(b) => b.id}
      rowHref={(b) => `/reconciliation/${b.id}`}
      searchText={(b) => `${b.billNo} ${b.partyName}`}
      searchPlaceholder="Search bill no., party…"
      filters={[
        {
          id: "recon",
          label: "Statuses",
          options: RECON.map((s) => ({ value: s, label: s })),
          value: (b) => b.reconStatus,
        },
        {
          id: "party",
          label: "Parties",
          options: (parties ?? []).map((p) => ({ value: p.id, label: p.name })),
          value: (b) => b.partyId,
        },
      ]}
      dateValue={(b) => b.date}
      defaultSort={{ id: "date", desc: true }}
      exportName={`${kind.toLowerCase()}-bill-reconciliation`}
    />
  );
}

function InvoiceQueue() {
  const [query, setQuery] = useState<TableQuery | null>(null);
  const { data, isLoading, error } = useInvoicesPage(query);
  if (error) return <ErrorState error={error} />;
  return (
    <DataTable
      data={data?.rows}
      isLoading={isLoading || !query}
      server={{ total: data?.total ?? 0, onQueryChange: setQuery }}
      columns={invoiceCols}
      getRowId={(i) => i.id}
      rowHref={(i) => `/reconciliation/${i.id}`}
      searchText={(i) => `${i.number} ${i.customerName} ${i.orderRef}`}
      searchPlaceholder="Search invoice, customer…"
      filters={[
        {
          id: "recon",
          label: "Checks",
          options: RECON.map((s) => ({ value: s, label: s })),
          value: (i) => i.reconStatus,
        },
      ]}
      dateValue={(i) => i.date}
      defaultSort={{ id: "date", desc: true }}
      exportName="invoice-verification"
    />
  );
}

export function ReconciliationPage() {
  const { data: totals } = useFinanceTotals();
  const [tab, setTab] = useState("provider");
  return (
    <>
      <PageHeader
        title="Bill Reconciliation"
        description="Every bill compared line by line with the trips recorded from weighbridge slips."
      />
      <InfoNote className="mb-4">
        Reconciliation never changes bills or trip records. You decide: approve a difference,
        dispute it, or ask the party for a correction.
        {totals && totals.billsNeedingAttention > 0 && (
          <strong> {totals.billsNeedingAttention} bill(s) need attention.</strong>
        )}
      </InfoNote>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="provider">Provider Bills</TabsTrigger>
          <TabsTrigger value="transporter">Transporter Bills</TabsTrigger>
          <TabsTrigger value="invoices">
            Customer Invoices{" "}
            {(totals?.invoicesFlagged ?? 0) > 0 && (
              <span className="ml-1.5 rounded-full bg-rose-500 px-1.5 text-[11px] font-bold text-white">
                {totals?.invoicesFlagged}
              </span>
            )}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="provider" className="mt-4">
          <BillQueue kind="Provider" />
        </TabsContent>
        <TabsContent value="transporter" className="mt-4">
          <BillQueue kind="Transporter" />
        </TabsContent>
        <TabsContent value="invoices" className="mt-4">
          <InvoiceQueue />
        </TabsContent>
      </Tabs>
    </>
  );
}
