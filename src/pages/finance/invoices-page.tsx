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
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DataTable, optionsFrom } from "@/components/data-table";
import { DetailSkeleton, ErrorState, InfoNote, KpiCard, SectionCard } from "@/components/common";
import { PageHeader } from "@/components/page-header";
import { invoiceColumns, paymentColumns, tripColumns } from "@/components/record-columns";
import { SimpleTable } from "@/components/simple-table";
import { StatusBadge } from "@/components/status-badge";
import { useInvoice, useInvoices, useMaterials, useSettings } from "@/hooks/queries";
import { useAuth } from "@/lib/auth";
import { formatINR, formatINRCompact } from "@/lib/format";
import { InvoiceDocument } from "./invoice-document";

export function InvoicesPage() {
  const { data, isLoading, error } = useInvoices();
  if (error) return <ErrorState error={error} />;
  const total = data?.reduce((s, i) => s + i.total, 0) ?? 0;
  const balance = data?.reduce((s, i) => s + i.balance, 0) ?? 0;
  const overdue = data?.filter((i) => i.overdueDays > 0) ?? [];
  return (
    <>
      <PageHeader
        title="Invoices"
        description="GST invoices created from confirmed deliveries. Quantities come from delivery slips, never typed."
        actions={
          <Button asChild>
            <Link to="/invoices/new">
              <FilePlus2 className="size-4" /> Create from deliveries
            </Link>
          </Button>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Invoiced (all time)"
          value={formatINRCompact(total)}
          icon={ReceiptIndianRupee}
        />
        <KpiCard
          label="Balance to collect"
          value={formatINRCompact(balance)}
          icon={Wallet}
          tone="amber"
        />
        <KpiCard
          label="Overdue"
          value={overdue.length}
          hint={formatINRCompact(overdue.reduce((s, i) => s + i.balance, 0))}
          icon={AlertTriangle}
          tone="red"
        />
        <KpiCard
          label="Flagged by checks"
          value={data?.filter((i) => i.flags.length).length ?? "—"}
          icon={Scale}
          href="/reconciliation"
        />
      </div>
      <DataTable
        data={data}
        isLoading={isLoading}
        columns={invoiceColumns()}
        getRowId={(i) => i.id}
        rowHref={(i) => `/invoices/${i.id}`}
        searchText={(i) => `${i.number} ${i.customerName} ${i.orderRef} ${i.siteName}`}
        searchPlaceholder="Search invoice, customer, order…"
        filters={[
          {
            id: "status",
            label: "Payment",
            options: ["Unpaid", "Partial", "Paid"].map((s) => ({ value: s, label: s })),
            value: (i) => i.paymentStatus,
          },
          {
            id: "customer",
            label: "Customers",
            options: optionsFrom(data?.map((i) => i.customerName) ?? []),
            value: (i) => i.customerName,
          },
          {
            id: "gst",
            label: "GST",
            options: ["CGST+SGST", "IGST", "None"].map((s) => ({ value: s, label: s })),
            value: (i) => i.gstMode,
          },
        ]}
        dateValue={(i) => i.date}
        defaultSort={{ id: "date", desc: true }}
        exportName="invoices"
      />
    </>
  );
}

export function InvoiceDetailPage({ invoiceId }: { invoiceId: string }) {
  const { data, isLoading, error } = useInvoice(invoiceId);
  const { data: settings } = useSettings();
  const { data: materials } = useMaterials();
  const { can } = useAuth();
  if (error) return <ErrorState error={error} />;
  if (isLoading || !data) return <DetailSkeleton />;
  const { invoice: inv, payments, trips, customer } = data;
  return (
    <>
      <PageHeader
        title={inv.number}
        crumbs={[{ label: inv.number }]}
        badge={
          <>
            <StatusBadge status={inv.paymentStatus} />
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
            <Button
              variant="outline"
              onClick={() =>
                toast.success("PDF export queued", { description: `${inv.number}.pdf (demo)` })
              }
            >
              <Download className="size-4" /> PDF
            </Button>
            {can("verify_bills") && (
              <Button variant="outline" asChild>
                <Link to="/reconciliation/$recordId" params={{ recordId: inv.id }}>
                  <Scale className="size-4" /> Verify
                </Link>
              </Button>
            )}
            {inv.balance > 0 && (
              <Button asChild>
                <Link to="/payments" search={{ record: inv.id }}>
                  <CreditCard className="size-4" /> Record payment
                </Link>
              </Button>
            )}
          </>
        }
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
