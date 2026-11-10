import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  CheckCircle2,
  FileWarning,
  Gavel,
  MessageSquareWarning,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import type { ReconStatus } from "@/types";
import type { BillLineMatch, ReconAction } from "@/services/bills.service";
import { Button } from "@/components/ui/button";
import { ComparisonTable } from "@/components/comparison-table";
import { DetailList, DetailSkeleton, ErrorState, InfoNote, SectionCard } from "@/components/common";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DocumentThumbnail } from "@/components/document-viewer";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { api, useAction, useBill, useInvoiceVerification } from "@/hooks/queries";
import { useAuth } from "@/lib/auth";
import { formatDate, formatINR, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

const ACTIONS: {
  action: ReconAction;
  label: string;
  icon: typeof Gavel;
  title: string;
  description: string;
  variant: "default" | "outline";
}[] = [
  {
    action: "approve_difference",
    label: "Approve Difference",
    icon: ShieldCheck,
    title: "Approve the difference?",
    description:
      "The bill and trips stay exactly as they are. Your approval and note are recorded.",
    variant: "outline",
  },
  {
    action: "dispute",
    label: "Dispute",
    icon: Gavel,
    title: "Dispute this bill?",
    description:
      "Marks the bill as disputed. Payments can still be recorded for the undisputed part.",
    variant: "outline",
  },
  {
    action: "request_correction",
    label: "Request Correction",
    icon: MessageSquareWarning,
    title: "Request a corrected bill?",
    description: "Marks the bill as waiting for a correction from the party.",
    variant: "outline",
  },
  {
    action: "mark_reconciled",
    label: "Mark Reconciled",
    icon: CheckCircle2,
    title: "Mark as reconciled?",
    description: "Confirms you have checked this bill against the records.",
    variant: "default",
  },
];

function ActionBar({
  onAction,
  disabled,
}: {
  onAction: (a: ReconAction) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {ACTIONS.map((a) => (
        <Button
          key={a.action}
          variant={a.variant}
          onClick={() => onAction(a.action)}
          disabled={disabled}
        >
          <a.icon className="size-4" />
          {a.label}
        </Button>
      ))}
    </div>
  );
}

const lineTone = (s: BillLineMatch["state"]) =>
  s === "Matched" ? "" : s === "Missing on bill" ? "bg-amber-400/10" : "bg-rose-500/5";

function BillReconcile({ billId }: { billId: string }) {
  const { data, isLoading, error } = useBill(billId);
  const { can } = useAuth();
  const [action, setAction] = useState<ReconAction | null>(null);
  const run = useAction(
    (v: { action: ReconAction; note: string }) => api.bills.reconcileBill(billId, v.action, v.note),
    (b) => `${b.billNo}: ${b.reconStatus}`,
  );
  if (error) return <ErrorState error={error} />;
  if (isLoading || !data) return <DetailSkeleton />;
  const { bill, lines, document } = data;
  const unit = bill.kind === "Provider" ? (data.trips[0]?.unit ?? "MT") : "trips";
  const billedRate = bill.billedQuantity ? bill.billedSubtotal / bill.billedQuantity : 0;
  const recordedRate = bill.recordedQuantity ? bill.recordedSubtotal / bill.recordedQuantity : 0;
  const issues = lines.filter((l) => l.state !== "Matched");
  const current = ACTIONS.find((a) => a.action === action);

  return (
    <>
      <PageHeader
        title={`${bill.partyName} · ${bill.billNo}`}
        crumbs={[{ label: bill.billNo }]}
        badge={<StatusBadge status={bill.reconStatus} />}
        description={`${bill.kind} bill dated ${formatDate(bill.date)} · ${bill.lines.length} lines · due ${formatDate(bill.dueDate)}`}
        actions={
          <Button asChild variant="outline">
            <Link to="/bills/$billId" params={{ billId: bill.id }}>
              Bill details & payments
            </Link>
          </Button>
        }
      />
      {bill.reconNote && <InfoNote className="mb-4">{bill.reconNote}</InfoNote>}

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard
          title="Bill (as received)"
          description={document ? "Values read from the bill document" : "Entered manually"}
        >
          <DetailList
            columns={2}
            items={[
              { label: "Bill number", value: bill.billNo },
              { label: "Party", value: bill.partyName },
              {
                label: "Billed quantity",
                value: `${formatNumber(bill.billedQuantity, 2)} ${unit}`,
              },
              { label: "Lines on bill", value: bill.lines.length },
              { label: "Subtotal", value: formatINR(bill.billedSubtotal) },
              { label: `GST (${bill.taxRate}%)`, value: formatINR(bill.taxAmount) },
              {
                label: "Bill total",
                value: <span className="font-bold">{formatINR(bill.total)}</span>,
              },
            ]}
          />
          {document && (
            <Link
              to="/documents/$documentId"
              params={{ documentId: document.id }}
              className="mt-4 flex items-center gap-3 rounded-lg border p-3 hover:bg-muted/40"
            >
              <DocumentThumbnail type={document.type} />
              <div>
                <p className="text-sm font-medium">{document.fileName}</p>
                <p className="text-xs text-muted-foreground">
                  {document.id} · {document.confidence}% confidence
                </p>
              </div>
            </Link>
          )}
        </SectionCard>
        <SectionCard
          title="System records"
          description="Trips recorded from loading slips for this party and period"
        >
          <DetailList
            columns={2}
            items={[
              { label: "Trips recorded", value: bill.recordedTrips },
              {
                label: "Recorded quantity",
                value: `${formatNumber(bill.recordedQuantity, 2)} ${unit}`,
              },
              { label: "Value at agreed rate", value: formatINR(bill.recordedSubtotal) },
              {
                label: "Unmatched bill lines",
                value: (
                  <span className={cn(bill.unmatchedLineCount && "font-semibold text-rose-600")}>
                    {bill.unmatchedLineCount}
                  </span>
                ),
              },
              {
                label: "Trips missing from bill",
                value: (
                  <span
                    className={cn(bill.missingTripIds.length && "font-semibold text-amber-700")}
                  >
                    {bill.missingTripIds.length}
                  </span>
                ),
              },
              { label: "Paid so far", value: formatINR(bill.paid) },
            ]}
          />
        </SectionCard>
      </div>

      <SectionCard title="Billed vs recorded" className="mt-4">
        <ComparisonTable
          rows={[
            {
              label: "Amount (before GST)",
              billed: bill.billedSubtotal,
              recorded: bill.recordedSubtotal,
              format: "inr",
              reason: issues
                .map((i) => i.state)
                .filter((v, i, a) => a.indexOf(v) === i)
                .join(", "),
            },
            {
              label: "Quantity",
              billed: bill.billedQuantity,
              recorded: bill.recordedQuantity,
              format: "qty",
              unit,
              reason: issues.some((i) => i.state === "Quantity differs")
                ? "One or more lines billed more than the slip"
                : "Lines missing or extra",
            },
            {
              label: "Number of trips",
              billed: bill.billedTrips,
              recorded: bill.recordedTrips,
              format: "number",
              reason: `${bill.unmatchedLineCount} extra on bill · ${bill.missingTripIds.length} missing from bill`,
            },
            {
              label: `Average rate (₹ / ${unit === "trips" ? "trip" : unit})`,
              billed: Math.round(billedRate),
              recorded: Math.round(recordedRate),
              format: "inr",
              reason: issues.some((i) => i.state === "Rate differs")
                ? "Billed rate is above the agreed purchase rate"
                : "Follows from the differences above",
            },
          ]}
        />
      </SectionCard>

      <SectionCard
        title="Line-by-line matching"
        description={
          issues.length
            ? `${issues.length} line${issues.length > 1 ? "s" : ""} need attention`
            : "Every line matches a recorded trip"
        }
        className="mt-4"
        contentClassName="px-0 pb-2"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-y bg-muted/40 text-xs text-muted-foreground">
                {[
                  "Bill reference",
                  "Date",
                  "Vehicle",
                  "Billed qty",
                  "Billed amount",
                  "Recorded qty",
                  "Recorded amount",
                  "Trip",
                  "Result",
                ].map((h, i) => (
                  <th
                    key={h}
                    scope="col"
                    className={cn(
                      "whitespace-nowrap px-4 py-2 font-semibold",
                      i >= 3 && i <= 6 ? "text-right" : "text-left",
                    )}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr
                  key={`${l.billedRef}-${i}`}
                  className={cn("border-b last:border-0", lineTone(l.state))}
                >
                  <td className="px-4 py-2.5 font-medium">{l.billedRef}</td>
                  <td className="px-4 py-2.5">{formatDate(l.date)}</td>
                  <td className="whitespace-nowrap px-4 py-2.5">{l.vehicle}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {l.billed ? formatNumber(l.billed.quantity, 2) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {l.billed ? formatINR(l.billed.amount) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {l.recorded ? formatNumber(l.recorded.quantity, 2) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {l.recorded ? formatINR(l.recorded.amount) : "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    {l.tripId ? (
                      <Link
                        to="/trips/$tripId"
                        params={{ tripId: l.tripId }}
                        className="text-primary hover:underline"
                      >
                        {l.tripId}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="inline-flex items-center gap-1.5">
                      {l.state === "Matched" ? (
                        <CheckCircle2 className="size-4 text-emerald-600" />
                      ) : (
                        <XCircle className="size-4 text-rose-600" />
                      )}
                      <StatusBadge status={l.state} />
                    </span>
                    {l.reason && (
                      <p className="mt-1 max-w-xs text-xs text-muted-foreground">{l.reason}</p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {can("verify_bills") && (
        <SectionCard
          title="Decision"
          description="Choose what to do. A note is required and saved to audit history."
          className="mt-4"
        >
          <ActionBar onAction={setAction} disabled={run.isPending} />
        </SectionCard>
      )}
      <ConfirmDialog
        open={Boolean(current)}
        onOpenChange={(o) => !o && setAction(null)}
        title={current?.title ?? ""}
        description={current?.description}
        confirmLabel={current?.label ?? "Confirm"}
        requireReason
        reasonLabel="Note"
        onConfirm={(note) => (action ? run.mutateAsync({ action, note }) : undefined)}
      />
    </>
  );
}

function InvoiceVerify({ invoiceId }: { invoiceId: string }) {
  const { data, isLoading, error } = useInvoiceVerification(invoiceId);
  const { can } = useAuth();
  const [action, setAction] = useState<ReconAction | null>(null);
  const run = useAction(
    (v: { action: ReconAction; note: string }) =>
      api.bills.reconcileInvoice(invoiceId, v.action, v.note),
    (i) => `${i.number}: ${i.reconStatus as ReconStatus}`,
  );
  if (error) return <ErrorState error={error} />;
  if (isLoading || !data) return <DetailSkeleton />;
  const { invoice: inv, checks, lines } = data;
  const failed = checks.filter((c) => !c.passed);
  const current = ACTIONS.find((a) => a.action === action);
  return (
    <>
      <PageHeader
        title={`Verify ${inv.number}`}
        crumbs={[{ label: inv.number }]}
        badge={<StatusBadge status={inv.reconStatus} />}
        description={`${inv.customerName} · ${inv.orderRef} · ${formatDate(inv.date)} · ${formatINR(inv.total)}`}
        actions={
          <Button asChild variant="outline">
            <Link to="/invoices/$invoiceId" params={{ invoiceId: inv.id }}>
              Open invoice
            </Link>
          </Button>
        }
      />
      {inv.notes && (
        <InfoNote tone="warning" className="mb-4">
          {inv.notes}
        </InfoNote>
      )}
      <SectionCard
        title="Verification checks"
        description={
          failed.length
            ? `${failed.length} of ${checks.length} checks need attention`
            : "All checks passed"
        }
      >
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {checks.map((c) => (
            <li
              key={c.flag}
              className={cn(
                "rounded-xl border p-4",
                !c.passed && "border-rose-500/30 bg-rose-500/5",
              )}
            >
              <div className="flex items-center gap-2">
                {c.passed ? (
                  <CheckCircle2 className="size-5 text-emerald-600" />
                ) : (
                  <FileWarning className="size-5 text-rose-600" />
                )}
                <p className="font-medium">{c.flag}</p>
              </div>
              <p className="mt-1.5 text-sm text-muted-foreground">{c.detail}</p>
            </li>
          ))}
        </ul>
      </SectionCard>
      <SectionCard title="Invoiced vs delivered" className="mt-4">
        <ComparisonTable
          leftLabel="Invoiced"
          rightLabel="Delivery slips / order"
          rows={lines.flatMap((l) => [
            {
              label: `${l.material} · quantity`,
              billed: l.invoicedQty,
              recorded: l.deliveredQty,
              format: "qty" as const,
              unit: l.unit,
              reason: "Invoice quantity should equal delivery weight",
            },
            {
              label: `${l.material} · rate`,
              billed: l.invoicedRate,
              recorded: l.orderRate,
              format: "inr" as const,
              reason: "Rate should match the order",
            },
          ])}
        />
        <p className="mt-3 text-xs text-muted-foreground">
          Trips on this invoice:{" "}
          {lines
            .flatMap((l) => l.tripIds)
            .map((t, i) => (
              <span key={t}>
                {i > 0 && ", "}
                <Link
                  to="/trips/$tripId"
                  params={{ tripId: t }}
                  className="text-primary hover:underline"
                >
                  {t}
                </Link>
              </span>
            ))}
        </p>
      </SectionCard>
      {can("verify_bills") && (
        <SectionCard title="Decision" className="mt-4">
          <ActionBar onAction={setAction} disabled={run.isPending} />
        </SectionCard>
      )}
      <ConfirmDialog
        open={Boolean(current)}
        onOpenChange={(o) => !o && setAction(null)}
        title={current?.title ?? ""}
        description={current?.description}
        confirmLabel={current?.label ?? "Confirm"}
        requireReason
        reasonLabel="Note"
        onConfirm={(note) => (action ? run.mutateAsync({ action, note }) : undefined)}
      />
    </>
  );
}

export function ReconcileDetailPage({ recordId }: { recordId: string }) {
  return recordId.startsWith("INV-") ? (
    <InvoiceVerify invoiceId={recordId} />
  ) : (
    <BillReconcile billId={recordId} />
  );
}
