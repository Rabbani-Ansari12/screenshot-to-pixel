import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  CreditCard,
  Download,
  FilePlus2,
  IndianRupee,
  Printer,
  ReceiptIndianRupee,
  Scale,
  Send,
  Wallet,
  XCircle,
} from "lucide-react";
import type { TableQuery } from "@/services/supabase/table-query";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/data-table";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DetailSkeleton, ErrorState, InfoNote, KpiCard, SectionCard } from "@/components/common";
import { PageHeader } from "@/components/page-header";
import { invoiceColumns, paymentColumns, tripColumns } from "@/components/record-columns";
import { SimpleTable } from "@/components/simple-table";
import { StatusBadge } from "@/components/status-badge";
import {
  api,
  useAction,
  useFinanceTotals,
  useInvoice,
  useInvoicesPage,
  useMasterOptions,
  useMaterials,
  useSettings,
} from "@/hooks/queries";
import { useAuth } from "@/lib/auth";
import { formatINR, formatINRCompact } from "@/lib/format";
import { InvoiceDocument } from "./invoice-document";

export function InvoicesPage() {
  const [query, setQuery] = useState<TableQuery | null>(null);
  const { data, isLoading, error } = useInvoicesPage(query);
  const { data: totals } = useFinanceTotals();
  const { data: options } = useMasterOptions();
  const { can } = useAuth();
  if (error) return <ErrorState error={error} />;
  return (
    <>
      <PageHeader
        title="Invoices"
        description="GST invoices created from confirmed deliveries. Quantities come from delivery slips, never typed."
        actions={
          can("record_payments") && (
            <Button asChild>
              <Link to="/invoices/new">
                <FilePlus2 className="size-4" /> Create from deliveries
              </Link>
            </Button>
          )
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Invoiced this month"
          value={totals ? formatINRCompact(totals.invoicedMonth) : "—"}
          icon={ReceiptIndianRupee}
        />
        <KpiCard
          label="Balance to collect"
          value={totals ? formatINRCompact(totals.receivable) : "—"}
          icon={Wallet}
          tone="amber"
        />
        <KpiCard
          label="Overdue"
          value={totals ? formatINRCompact(totals.overdue) : "—"}
          icon={AlertTriangle}
          tone="red"
        />
        <KpiCard
          label="Flagged by checks"
          value={totals?.invoicesFlagged ?? "—"}
          icon={Scale}
          href="/reconciliation"
        />
      </div>
      <DataTable
        data={data?.rows}
        isLoading={isLoading || !query}
        server={{ total: data?.total ?? 0, onQueryChange: setQuery }}
        columns={invoiceColumns()}
        getRowId={(i) => i.id}
        rowHref={(i) => `/invoices/${i.id}`}
        searchText={(i) => `${i.number} ${i.customerName} ${i.orderRef} ${i.siteName}`}
        searchPlaceholder="Search invoice, customer, order…"
        filters={[
          {
            id: "status",
            label: "Status",
            options: ["Unpaid", "Partial", "Paid", "Overdue", "Draft", "Cancelled"].map((s) => ({
              value: s,
              label: s,
            })),
            value: (i) => i.paymentStatus,
          },
          {
            id: "customer",
            label: "Customers",
            options: (options?.customers ?? []).map((c) => ({ value: c.id, label: c.name })),
            value: (i) => i.customerId,
          },
          {
            id: "recon",
            label: "Checks",
            options: RECON_OPTIONS,
            value: (i) => i.reconStatus,
          },
        ]}
        dateValue={(i) => i.date}
        defaultSort={{ id: "date", desc: true }}
        exportName="invoices"
      />
    </>
  );
}

const RECON_OPTIONS = [
  "Matched",
  "Mismatch",
  "Disputed",
  "Correction Requested",
  "Difference Approved",
  "Reconciled",
].map((s) => ({ value: s, label: s }));

/** Browser print → "Save as PDF"; the document title becomes the file name. */
function printInvoice(number: string) {
  const previous = document.title;
  document.title = number;
  window.print();
  document.title = previous;
}

export function InvoiceDetailPage({ invoiceId }: { invoiceId: string }) {
  const { data, isLoading, error } = useInvoice(invoiceId);
  const { data: settings } = useSettings();
  const { data: materials } = useMaterials();
  const { can } = useAuth();
  const [cancelling, setCancelling] = useState(false);
  const issue = useAction(() => api.invoices.issueInvoice(invoiceId), "Invoice issued");
  const cancel = useAction(
    (reason: string) => api.invoices.cancelInvoice(invoiceId, reason),
    "Invoice cancelled",
  );
  if (error) return <ErrorState error={error} />;
  if (isLoading || !data) return <DetailSkeleton />;
  const { invoice: inv, payments, trips, customer } = data;
  const live = inv.status !== "Cancelled";
  return (
    <>
      <PageHeader
        title={inv.number}
        crumbs={[{ label: inv.number }]}
        badge={
          <>
            {inv.status === "Draft" || inv.status === "Cancelled" ? (
              <StatusBadge status={inv.status} />
            ) : (
              <StatusBadge status={inv.paymentStatus} />
            )}
            {inv.flags.length > 0 && (
              <StatusBadge
                status={`${inv.flags.length} flag${inv.flags.length > 1 ? "s" : ""}`}
                tone="danger"
              />
            )}
          </>
        }
        description={`${inv.customerName} · ${inv.orderRef} · ${inv.siteName}`}
        actions={
          <>
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="size-4" /> Print
            </Button>
            <Button variant="outline" onClick={() => printInvoice(inv.number)}>
              <Download className="size-4" /> PDF
            </Button>
            {can("record_payments") && inv.status === "Draft" && (
              <Button
                variant="outline"
                onClick={() => issue.mutate(undefined)}
                disabled={issue.isPending}
              >
                <Send className="size-4" /> Issue
              </Button>
            )}
            {can("record_payments") && live && payments.length === 0 && (
              <Button variant="outline" onClick={() => setCancelling(true)}>
                <XCircle className="size-4" /> Cancel invoice
              </Button>
            )}
            {can("verify_bills") && (
              <Button variant="outline" asChild>
                <Link to="/reconciliation/$recordId" params={{ recordId: inv.id }}>
                  <Scale className="size-4" /> Verify
                </Link>
              </Button>
            )}
            {can("record_payments") && live && inv.status !== "Draft" && inv.balance > 0 && (
              <Button asChild>
                <Link to="/payments" search={{ record: inv.id }}>
                  <CreditCard className="size-4" /> Record payment
                </Link>
              </Button>
            )}
          </>
        }
      />
      <ConfirmDialog
        open={cancelling}
        onOpenChange={setCancelling}
        title={`Cancel ${inv.number}?`}
        description="The invoice stays on record as cancelled and its deliveries can be invoiced again."
        confirmLabel="Cancel invoice"
        destructive
        requireReason
        onConfirm={(reason) => cancel.mutateAsync(reason)}
      />
      {inv.flags.length > 0 && (
        <InfoNote tone="warning" className="mb-4">
          Checks flagged: {inv.flags.join(", ")}. {inv.notes}
        </InfoNote>
      )}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <InvoiceDocument
          settings={settings}
          number={inv.number}
          date={inv.date}
          dueDate={inv.dueDate}
          customer={customer}
          siteName={inv.siteName}
          orderRef={inv.orderRef}
          gstMode={inv.gstMode}
          additionalCharges={inv.additionalCharges}
          notes={inv.notes}
          placeOfSupply={inv.placeOfSupply ?? ""}
          totals={{
            subtotal: inv.subtotal,
            extras: inv.additionalTotal,
            cgst: inv.cgst ?? 0,
            sgst: inv.sgst ?? 0,
            igst: inv.igst ?? 0,
            total: inv.total,
          }}
          lines={inv.lines.map((l) => ({
            description: l.description.split(" · ")[0] ?? l.description,
            hsn: materials?.find((m) => m.id === l.materialId)?.hsn ?? "",
            quantity: l.quantity,
            unit: l.unit,
            rate: l.rate,
            gstRate: l.gstRate,
            trips: l.tripIds.length,
          }))}
        />
        <div className="space-y-4">
          <SectionCard title="Payment status">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="font-semibold tabular-nums">{formatINR(inv.total)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Received</p>
                <p className="font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
                  {formatINR(inv.paid)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Balance</p>
                <p className="font-semibold tabular-nums">{formatINR(inv.balance)}</p>
              </div>
            </div>
            {inv.overdueDays > 0 && (
              <p className="mt-3 rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">
                {inv.overdueDays} days past due
              </p>
            )}
            <div className="mt-4">
              <SimpleTable
                rows={payments}
                getRowId={(p) => p.id}
                columns={paymentColumns({ hide: ["party", "against", "by"] })}
                empty="No payments yet"
              />
            </div>
          </SectionCard>
          <SectionCard title={`Trips on this invoice (${trips.length})`}>
            <SimpleTable
              rows={trips}
              getRowId={(t) => t.id}
              rowHref={(t) => `/trips/${t.id}`}
              maxRows={8}
              columns={tripColumns({
                hide: [
                  "order",
                  "provider",
                  "transporter",
                  "driver",
                  "loaded",
                  "difference",
                  "docs",
                  "material",
                ],
              })}
            />
          </SectionCard>
          <InfoNote>
            <IndianRupee className="mr-1 inline size-3.5" />
            Customer cash received is not profit — see Profit & Loss for margins.
          </InfoNote>
        </div>
      </div>
    </>
  );
}
