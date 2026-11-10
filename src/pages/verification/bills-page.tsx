import { Link } from "@tanstack/react-router";
import { AlertTriangle, CreditCard, FileText, IndianRupee, Scale } from "lucide-react";
import type { BillKind } from "@/types";
import { Button } from "@/components/ui/button";
import { DataTable, optionsFrom } from "@/components/data-table";
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
import { useBill, useBills } from "@/hooks/queries";
import { useAuth } from "@/lib/auth";
import { formatDate, formatINR, formatINRCompact, formatNumber } from "@/lib/format";

export function BillsPage({ kind }: { kind: BillKind }) {
  const { data, isLoading, error } = useBills(kind);
  if (error) return <ErrorState error={error} />;
  const outstanding = data?.reduce((s, b) => s + b.outstanding, 0) ?? 0;
  const overdue = data?.filter((b) => b.overdueDays > 0) ?? [];
  return (
    <>
      <PageHeader
        title={`${kind} Bills`}
        description={
          kind === "Provider"
            ? "Bills from material providers, read from WhatsApp and checked against loading slips."
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
          value={formatINRCompact(outstanding)}
          icon={IndianRupee}
          tone="amber"
        />
        <KpiCard
          label="Overdue bills"
          value={overdue.length}
          hint={formatINRCompact(overdue.reduce((s, b) => s + b.outstanding, 0))}
          icon={AlertTriangle}
          tone="red"
        />
        <KpiCard
          label="Need reconciliation"
          value={
            data?.filter((b) => ["Mismatch", "Unreconciled", "Matched"].includes(b.reconStatus))
              .length ?? "—"
          }
          icon={Scale}
        />
        <KpiCard label="Bills this year" value={data?.length ?? "—"} icon={FileText} tone="blue" />
      </div>
      <DataTable
        data={data}
        isLoading={isLoading}
        columns={billColumns()}
        getRowId={(b) => b.id}
        rowHref={(b) => `/bills/${b.id}`}
        searchText={(b) => `${b.billNo} ${b.partyName} ${b.id}`}
        searchPlaceholder="Search bill no., party…"
        filters={[
          {
            id: "party",
            label: kind === "Provider" ? "Providers" : "Transporters",
            options: optionsFrom(data?.map((b) => b.partyName) ?? []),
            value: (b) => b.partyName,
          },
          {
            id: "recon",
            label: "Reconciliation",
            options: optionsFrom(data?.map((b) => b.reconStatus) ?? []),
            value: (b) => b.reconStatus,
          },
          {
            id: "payment",
            label: "Payment",
            options: ["Unpaid", "Partial", "Paid"].map((s) => ({ value: s, label: s })),
            value: (b) => b.paymentStatus,
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
              { label: "Subtotal", value: formatINR(bill.billedSubtotal) },
              { label: `GST ${bill.taxRate}%`, value: formatINR(bill.taxAmount) },
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
            <p className="text-sm text-muted-foreground">
              Bill received before WhatsApp automation (Oct 2026); entered manually.
            </p>
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
