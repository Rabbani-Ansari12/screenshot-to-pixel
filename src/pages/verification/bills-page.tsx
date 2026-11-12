import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, CreditCard, FileText, IndianRupee, RefreshCw, Scale } from "lucide-react";
import type { BillKind } from "@/types";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/data-table";
import {
  DetailList,
  DetailSkeleton,
  ErrorState,
  InfoNote,
  KpiCard,
  SectionCard,
} from "@/components/common";
import { DocumentThumbnail } from "@/components/document-viewer";
import { PageHeader } from "@/components/page-header";
import { billColumns, paymentColumns } from "@/components/record-columns";
import { SimpleTable } from "@/components/simple-table";
import { StatusBadge } from "@/components/status-badge";
import {
  api,
  useAction,
  useBill,
  useBillsPage,
  useFinanceTotals,
  useMasterOptions,
} from "@/hooks/queries";
import type { TableQuery } from "@/services/supabase/table-query";
import { useAuth } from "@/lib/auth";
import { formatDate, formatINR, formatINRCompact, formatNumber } from "@/lib/format";

const RECON = [
  "Unreconciled",
  "Matched",
  "Mismatch",
  "Disputed",
  "Correction Requested",
  "Difference Approved",
  "Reconciled",
];

export function BillsPage({ kind }: { kind: BillKind }) {
  const [query, setQuery] = useState<TableQuery | null>(null);
  const { data, isLoading, error } = useBillsPage(kind, query);
  const { data: totals } = useFinanceTotals();
  const { data: options } = useMasterOptions();
  if (error) return <ErrorState error={error} />;
  const outstanding = kind === "Provider" ? totals?.payableProvider : totals?.payableTransporter;
  const parties = kind === "Provider" ? options?.providers : options?.transporters;
  return (
    <>
      <PageHeader
        title={`${kind} Bills`}
        description={
          kind === "Provider"
            ? "Bills from material providers, read from uploaded documents and checked against loading slips."
            : "Freight bills from transporters, checked trip by trip."
        }
        actions={
          <Button asChild variant="outline">
            <Link to="/reconciliation">
              <Scale className="size-4" /> Reconciliation
            </Link>
          </Button>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Outstanding"
          value={outstanding === undefined ? "—" : formatINRCompact(outstanding)}
          icon={IndianRupee}
          tone="amber"
        />
        <KpiCard
          label="Paid out this month"
          value={totals ? formatINRCompact(totals.paidMonth) : "—"}
          hint="Providers and transporters"
          icon={AlertTriangle}
          tone="red"
        />
        <KpiCard
          label="Need attention"
          value={totals?.billsNeedingAttention ?? "—"}
          hint="All bills"
          icon={Scale}
          href="/reconciliation"
        />
        <KpiCard label="Bills shown" value={data?.total ?? "—"} icon={FileText} tone="blue" />
      </div>
      <DataTable
        data={data?.rows}
        isLoading={isLoading || !query}
        server={{ total: data?.total ?? 0, onQueryChange: setQuery }}
        columns={billColumns()}
        getRowId={(b) => b.id}
        rowHref={(b) => `/bills/${b.id}`}
        searchText={(b) => `${b.billNo} ${b.partyName} ${b.id}`}
        searchPlaceholder="Search bill no., party…"
        filters={[
          {
            id: "party",
            label: kind === "Provider" ? "Providers" : "Transporters",
            options: (parties ?? []).map((p) => ({ value: p.id, label: p.name })),
            value: (b) => b.partyId,
          },
          {
            id: "recon",
            label: "Reconciliation",
            options: RECON.map((r) => ({ value: r, label: r })),
            value: (b) => b.reconStatus,
          },
        ]}
        dateValue={(b) => b.date}
        defaultSort={{ id: "date", desc: true }}
        exportName={`${kind.toLowerCase()}-bills`}
      />
    </>
  );
}

export function BillDetailPage({ billId }: { billId: string }) {
  const { data, isLoading, error } = useBill(billId);
  const { can } = useAuth();
  const recheck = useAction(
    () => api.bills.recheckBill(billId),
    (b) => `${b.billNo} checked again: ${b.reconStatus}`,
  );
  if (error) return <ErrorState error={error} />;
  if (isLoading || !data) return <DetailSkeleton />;
  const { bill, payments, document } = data;
  const unit = bill.kind === "Provider" ? (data.trips[0]?.unit ?? "MT") : "trip";
  return (
    <>
      <PageHeader
        title={bill.billNo}
        crumbs={[{ label: bill.billNo }]}
        badge={
          <>
            <StatusBadge status={bill.reconStatus} />
            <StatusBadge status={bill.paymentStatus} />
          </>
        }
        description={`${bill.partyName} · ${bill.kind} bill · ${formatDate(bill.date)}`}
        actions={
          <>
            {can("verify_bills") && (
              <Button
                variant="outline"
                onClick={() => recheck.mutate(undefined)}
                disabled={recheck.isPending}
              >
                <RefreshCw className="size-4" /> Check again
              </Button>
            )}
            {can("verify_bills") && (
              <Button asChild variant="outline">
                <Link to="/reconciliation/$recordId" params={{ recordId: bill.id }}>
                  <Scale className="size-4" /> Reconcile
                </Link>
              </Button>
            )}
            {can("record_payments") && bill.outstanding > 0 && (
              <Button asChild>
                <Link to="/payments" search={{ record: bill.id }}>
                  <CreditCard className="size-4" /> Record payment
                </Link>
              </Button>
            )}
          </>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <SectionCard title="Bill summary">
          <DetailList
            columns={3}
            items={[
              {
                label: "Party",
                value:
                  bill.kind === "Provider" ? (
                    <Link
                      to="/providers/$providerId"
                      params={{ providerId: bill.partyId }}
                      className="text-primary hover:underline"
                    >
                      {bill.partyName}
                    </Link>
                  ) : (
                    <Link
                      to="/transporters/$transporterId"
                      params={{ transporterId: bill.partyId }}
                      className="text-primary hover:underline"
                    >
                      {bill.partyName}
                    </Link>
                  ),
              },
              { label: "Bill date", value: formatDate(bill.date) },
              {
                label: "Due date",
                value: formatDate(bill.dueDate),
                hint: bill.overdueDays ? `${bill.overdueDays} days overdue` : undefined,
              },
              {
                label: "Quantity billed",
                value: `${formatNumber(bill.billedQuantity, 2)} ${unit}`,
              },
              { label: "Subtotal + charges", value: formatINR(bill.billedSubtotal) },
              { label: `Tax (${bill.taxRate}%)`, value: formatINR(bill.taxAmount) },
              { label: "Total", value: <span className="font-bold">{formatINR(bill.total)}</span> },
              { label: "Paid", value: formatINR(bill.paid) },
              {
                label: "Outstanding",
                value: (
                  <span
                    className={
                      bill.outstanding ? "font-bold text-amber-700 dark:text-amber-300" : ""
                    }
                  >
                    {formatINR(bill.outstanding)}
                  </span>
                ),
              },
            ]}
          />
          {bill.reconNote && <InfoNote className="mt-4">{bill.reconNote}</InfoNote>}
        </SectionCard>
        <SectionCard title="Linked document">
          {document ? (
            <Link
              to="/documents/$documentId"
              params={{ documentId: document.id }}
              className="flex items-center gap-3 rounded-lg border p-3 hover:bg-muted/40"
            >
              <DocumentThumbnail type={document.type} className="size-12" />
              <div className="min-w-0">
                <p className="truncate font-medium">{document.fileName}</p>
                <p className="text-xs text-muted-foreground">
                  {document.id} · received via {document.source}
                </p>
                <StatusBadge status={document.status} className="mt-1" />
              </div>
            </Link>
          ) : (
            <p className="text-sm text-muted-foreground">Entered manually; no document attached.</p>
          )}
        </SectionCard>
      </div>
      <SectionCard title={`Bill lines (${bill.lines.length})`} className="mt-4">
        <SimpleTable
          rows={bill.lines}
          getRowId={(l) => l.id}
          columns={[
            {
              id: "ref",
              header: "Reference",
              mobile: "title",
              cell: (l) => <span className="font-medium">{l.billedRef}</span>,
            },
            { id: "date", header: "Date", cell: (l) => formatDate(l.date) },
            { id: "veh", header: "Vehicle", cell: (l) => l.vehicle },
            { id: "qty", header: "Qty", align: "right", cell: (l) => formatNumber(l.quantity, 2) },
            { id: "rate", header: "Rate", align: "right", cell: (l) => formatINR(l.rate) },
            { id: "amt", header: "Amount", align: "right", cell: (l) => formatINR(l.amount) },
            {
              id: "trip",
              header: "Matched trip",
              mobile: "badge",
              cell: (l) =>
                l.tripId ? (
                  <Link
                    to="/trips/$tripId"
                    params={{ tripId: l.tripId }}
                    onClick={(e) => e.stopPropagation()}
                    className="text-primary hover:underline"
                  >
                    {l.tripId}
                  </Link>
                ) : (
                  <StatusBadge status="Not in system" />
                ),
            },
          ]}
        />
      </SectionCard>
      <SectionCard title="Payments" className="mt-4">
        <SimpleTable
          rows={payments}
          getRowId={(p) => p.id}
          columns={paymentColumns({ hide: ["party", "against"] })}
          empty="No payments yet"
        />
      </SectionCard>
    </>
  );
}
