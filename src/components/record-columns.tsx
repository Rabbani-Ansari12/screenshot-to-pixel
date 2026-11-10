/** Column definitions shared by list pages and detail-page tabs. */
import { Link } from "@tanstack/react-router";
import type {
  BillView,
  InvoiceView,
  OrderView,
  PaymentView,
  PurchaseView,
  TripView,
} from "@/types";
import { formatDate, formatINR, formatQty, formatSigned } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Column } from "./data-table";
import { ProgressBar } from "./common";
import { StatusBadge } from "./status-badge";

const stop = (e: React.MouseEvent) => e.stopPropagation();

export function DifferenceValue({
  trip,
}: {
  trip: Pick<TripView, "difference" | "unit" | "shortageStatus">;
}) {
  if (trip.difference === null) return <span className="text-muted-foreground">—</span>;
  return (
    <span
      className={cn(
        "font-medium tabular-nums",
        trip.shortageStatus === "Confirmed Shortage"
          ? "text-rose-600 dark:text-rose-400"
          : trip.shortageStatus === "Needs Verification"
            ? "text-amber-700 dark:text-amber-300"
            : "text-muted-foreground",
      )}
    >
      {formatSigned(-trip.difference, trip.unit)}
    </span>
  );
}

export function tripColumns(opts: { hide?: string[] } = {}): Column<TripView>[] {
  const all: Column<TripView>[] = [
    {
      id: "id",
      header: "Trip ID",
      mobile: "title",
      sortValue: (t) => t.id,
      cell: (t) => (
        <Link
          to="/trips/$tripId"
          params={{ tripId: t.id }}
          onClick={stop}
          className="font-medium text-primary hover:underline"
        >
          {t.id}
        </Link>
      ),
    },
    {
      id: "date",
      header: "Loaded",
      sortValue: (t) => t.loading.at,
      cell: (t) => formatDate(t.loading.at),
    },
    {
      id: "order",
      header: "Order",
      hideBelow: "xl",
      sortValue: (t) => t.orderRef,
      cell: (t) => (
        <Link
          to="/orders/$orderId"
          params={{ orderId: t.orderId }}
          onClick={stop}
          className="hover:underline"
        >
          {t.orderRef}
        </Link>
      ),
    },
    {
      id: "material",
      header: "Material",
      sortValue: (t) => t.materialName,
      cell: (t) => t.materialName,
    },
    {
      id: "provider",
      header: "Provider",
      hideBelow: "xl",
      sortValue: (t) => t.yardName ?? t.providerName,
      cell: (t) =>
        t.yardName ? (
          <span>
            {t.yardName} <span className="text-xs text-muted-foreground">(yard)</span>
          </span>
        ) : (
          t.providerName
        ),
    },
    {
      id: "transporter",
      header: "Transporter",
      hideBelow: "xl",
      sortValue: (t) => t.transporterName,
      cell: (t) => t.transporterName,
    },
    {
      id: "vehicle",
      header: "Vehicle",
      mobile: "subtitle",
      sortValue: (t) => t.vehiclePlate,
      cell: (t) => <span className="whitespace-nowrap">{t.vehiclePlate}</span>,
    },
    { id: "driver", header: "Driver", hideBelow: "xl", cell: (t) => t.driverName },
    {
      id: "loaded",
      header: "Loaded qty",
      align: "right",
      sortValue: (t) => t.loadedQty,
      cell: (t) => <span className="tabular-nums">{formatQty(t.loadedQty, t.unit)}</span>,
    },
    {
      id: "delivered",
      header: "Delivered",
      align: "right",
      sortValue: (t) => t.deliveredQty,
      cell: (t) => (
        <span className="tabular-nums">
          {t.deliveredQty === null ? "—" : formatQty(t.deliveredQty, t.unit)}
        </span>
      ),
    },
    {
      id: "difference",
      header: "Difference",
      align: "right",
      sortValue: (t) => t.difference,
      cell: (t) => <DifferenceValue trip={t} />,
    },
    {
      id: "status",
      header: "Status",
      mobile: "badge",
      sortValue: (t) => t.status,
      cell: (t) => <StatusBadge status={t.status} />,
    },
    {
      id: "docs",
      header: "Docs",
      align: "right",
      hideBelow: "lg",
      sortValue: (t) => t.documentCount,
      cell: (t) => <span className="tabular-nums">{t.documentCount}</span>,
    },
  ];
  return all.filter((c) => !opts.hide?.includes(c.id));
}

export function orderColumns(
  opts: { showProfit?: boolean; hide?: string[] } = {},
): Column<OrderView>[] {
  const all: Column<OrderView>[] = [
    {
      id: "ref",
      header: "Order",
      mobile: "title",
      sortValue: (o) => o.ref,
      cell: (o) => (
        <div>
          <Link
            to="/orders/$orderId"
            params={{ orderId: o.id }}
            onClick={stop}
            className="font-medium text-primary hover:underline"
          >
            {o.ref}
          </Link>
          <p className="text-xs text-muted-foreground">PO {o.customerRef}</p>
        </div>
      ),
    },
    {
      id: "customer",
      header: "Customer",
      mobile: "subtitle",
      sortValue: (o) => o.customerName,
      cell: (o) => (
        <div>
          <p>{o.customerName}</p>
          <p className="text-xs text-muted-foreground">{o.siteName}</p>
        </div>
      ),
    },
    {
      id: "materials",
      header: "Material(s)",
      hideBelow: "lg",
      cell: (o) => <span className="line-clamp-2 max-w-[220px]">{o.materialsLabel}</span>,
    },
    {
      id: "progress",
      header: "Required · Dispatched · Delivered",
      sortValue: (o) => (o.requiredQty ? o.deliveredQty / o.requiredQty : 0),
      cell: (o) => (
        <div className="min-w-[180px]">
          <div className="mb-1 flex justify-between text-xs tabular-nums">
            <span>{formatQty(o.requiredQty, o.unitLabel === "mixed" ? "" : o.unitLabel, 0)}</span>
            <span className="text-muted-foreground">
              {Math.round(o.dispatchedQty)} · {Math.round(o.deliveredQty)}
            </span>
          </div>
          <div
            className="relative h-2 overflow-hidden rounded-full bg-muted"
            role="img"
            aria-label={`Dispatched ${Math.round((o.dispatchedQty / (o.requiredQty || 1)) * 100)}%, delivered ${Math.round((o.deliveredQty / (o.requiredQty || 1)) * 100)}%`}
          >
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-primary/30"
              style={{ width: `${Math.min(100, (o.dispatchedQty / (o.requiredQty || 1)) * 100)}%` }}
            />
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-primary"
              style={{ width: `${Math.min(100, (o.deliveredQty / (o.requiredQty || 1)) * 100)}%` }}
            />
          </div>
        </div>
      ),
    },
    {
      id: "status",
      header: "Status",
      mobile: "badge",
      sortValue: (o) => o.status,
      cell: (o) => <StatusBadge status={o.status} />,
    },
    {
      id: "date",
      header: "Order date",
      hideBelow: "xl",
      sortValue: (o) => o.orderDate,
      cell: (o) => formatDate(o.orderDate),
    },
    ...(opts.showProfit
      ? [
          {
            id: "profit",
            header: "Est. profit",
            align: "right" as const,
            sortValue: (o: OrderView) => o.estimatedProfit,
            cell: (o: OrderView) => (
              <span className={cn("tabular-nums", o.estimatedProfit < 0 && "text-rose-600")}>
                {formatINR(o.estimatedProfit)}
              </span>
            ),
          },
        ]
      : []),
  ];
  return all.filter((c) => !opts.hide?.includes(c.id));
}

export function purchaseColumns(opts: { hide?: string[] } = {}): Column<PurchaseView>[] {
  const all: Column<PurchaseView>[] = [
    {
      id: "ref",
      header: "Purchase",
      mobile: "title",
      sortValue: (p) => p.ref,
      cell: (p) => (
        <Link
          to="/purchases/$purchaseId"
          params={{ purchaseId: p.id }}
          onClick={stop}
          className="font-medium text-primary hover:underline"
        >
          {p.ref}
        </Link>
      ),
    },
    { id: "date", header: "Date", sortValue: (p) => p.date, cell: (p) => formatDate(p.date) },
    {
      id: "provider",
      header: "Provider",
      mobile: "subtitle",
      sortValue: (p) => p.providerName,
      cell: (p) => p.providerName,
    },
    {
      id: "material",
      header: "Material",
      sortValue: (p) => p.materialName,
      cell: (p) => p.materialName,
    },
    {
      id: "qty",
      header: "Quantity",
      align: "right",
      sortValue: (p) => p.quantity,
      cell: (p) => <span className="tabular-nums">{formatQty(p.quantity, p.unit)}</span>,
    },
    {
      id: "rate",
      header: "Rate",
      align: "right",
      hideBelow: "lg",
      sortValue: (p) => p.rate,
      cell: (p) => (
        <span className="tabular-nums">
          {formatINR(p.rate)}/{p.unit}
        </span>
      ),
    },
    {
      id: "total",
      header: "Total cost",
      align: "right",
      sortValue: (p) => p.totalAmount,
      cell: (p) => <span className="tabular-nums">{formatINR(p.totalAmount)}</span>,
    },
    {
      id: "mode",
      header: "Delivery mode",
      hideBelow: "xl",
      sortValue: (p) => p.deliveryMode,
      cell: (p) => (
        <span>
          {p.deliveryMode}
          {p.yardName && <span className="block text-xs text-muted-foreground">{p.yardName}</span>}
        </span>
      ),
    },
    {
      id: "order",
      header: "Linked order",
      hideBelow: "xl",
      cell: (p) =>
        p.orderId ? (
          <Link
            to="/orders/$orderId"
            params={{ orderId: p.orderId }}
            onClick={stop}
            className="hover:underline"
          >
            {p.orderRef}
          </Link>
        ) : (
          <span className="text-muted-foreground">Stock</span>
        ),
    },
    {
      id: "status",
      header: "Status",
      mobile: "badge",
      sortValue: (p) => p.status,
      cell: (p) => <StatusBadge status={p.status} />,
    },
  ];
  return all.filter((c) => !opts.hide?.includes(c.id));
}

export function billColumns(opts: { hide?: string[] } = {}): Column<BillView>[] {
  const all: Column<BillView>[] = [
    {
      id: "billNo",
      header: "Bill no.",
      mobile: "title",
      sortValue: (b) => b.billNo,
      cell: (b) => (
        <div>
          <Link
            to="/bills/$billId"
            params={{ billId: b.id }}
            onClick={stop}
            className="font-medium text-primary hover:underline"
          >
            {b.billNo}
          </Link>
          <p className="text-xs text-muted-foreground">{b.id}</p>
        </div>
      ),
    },
    { id: "date", header: "Date", sortValue: (b) => b.date, cell: (b) => formatDate(b.date) },
    {
      id: "party",
      header: "Party",
      mobile: "subtitle",
      sortValue: (b) => b.partyName,
      cell: (b) => b.partyName,
    },
    {
      id: "amount",
      header: "Amount",
      align: "right",
      sortValue: (b) => b.total,
      cell: (b) => <span className="tabular-nums">{formatINR(b.total)}</span>,
    },
    {
      id: "recon",
      header: "Reconciliation",
      mobile: "badge",
      sortValue: (b) => b.reconStatus,
      cell: (b) => <StatusBadge status={b.reconStatus} />,
    },
    {
      id: "paid",
      header: "Paid",
      align: "right",
      hideBelow: "lg",
      sortValue: (b) => b.paid,
      cell: (b) => <span className="tabular-nums">{formatINR(b.paid)}</span>,
    },
    {
      id: "outstanding",
      header: "Outstanding",
      align: "right",
      sortValue: (b) => b.outstanding,
      cell: (b) => (
        <span
          className={cn(
            "tabular-nums",
            b.overdueDays > 0 && "font-semibold text-rose-600 dark:text-rose-400",
          )}
        >
          {formatINR(b.outstanding)}
        </span>
      ),
    },
    {
      id: "payment",
      header: "Payment",
      hideBelow: "xl",
      sortValue: (b) => b.paymentStatus,
      cell: (b) => <StatusBadge status={b.paymentStatus} />,
    },
    {
      id: "doc",
      header: "Document",
      hideBelow: "xl",
      cell: (b) =>
        b.documentId ? (
          <Link
            to="/documents/$documentId"
            params={{ documentId: b.documentId }}
            onClick={stop}
            className="text-primary hover:underline"
          >
            {b.documentId}
          </Link>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
  ];
  return all.filter((c) => !opts.hide?.includes(c.id));
}

export function invoiceColumns(opts: { hide?: string[] } = {}): Column<InvoiceView>[] {
  const all: Column<InvoiceView>[] = [
    {
      id: "number",
      header: "Invoice",
      mobile: "title",
      sortValue: (i) => i.number,
      cell: (i) => (
        <Link
          to="/invoices/$invoiceId"
          params={{ invoiceId: i.id }}
          onClick={stop}
          className="font-medium text-primary hover:underline"
        >
          {i.number}
        </Link>
      ),
    },
    { id: "date", header: "Date", sortValue: (i) => i.date, cell: (i) => formatDate(i.date) },
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
      id: "paid",
      header: "Received",
      align: "right",
      hideBelow: "lg",
      sortValue: (i) => i.paid,
      cell: (i) => <span className="tabular-nums">{formatINR(i.paid)}</span>,
    },
    {
      id: "balance",
      header: "Balance",
      align: "right",
      sortValue: (i) => i.balance,
      cell: (i) => (
        <span
          className={cn(
            "tabular-nums",
            i.overdueDays > 0 && "font-semibold text-rose-600 dark:text-rose-400",
          )}
        >
          {formatINR(i.balance)}
        </span>
      ),
    },
    {
      id: "due",
      header: "Due",
      hideBelow: "xl",
      sortValue: (i) => i.dueDate,
      cell: (i) => (
        <span>
          {formatDate(i.dueDate)}
          {i.overdueDays > 0 && (
            <span className="block text-xs text-rose-600">{i.overdueDays} days overdue</span>
          )}
        </span>
      ),
    },
    {
      id: "status",
      header: "Payment",
      mobile: "badge",
      sortValue: (i) => i.paymentStatus,
      cell: (i) => <StatusBadge status={i.paymentStatus} />,
    },
    {
      id: "flags",
      header: "Checks",
      hideBelow: "lg",
      cell: (i) =>
        i.flags.length ? (
          <StatusBadge
            status={`${i.flags.length} flag${i.flags.length > 1 ? "s" : ""}`}
            tone="danger"
          />
        ) : (
          <StatusBadge status="Passed" />
        ),
    },
  ];
  return all.filter((c) => !opts.hide?.includes(c.id));
}

export function paymentColumns(opts: { hide?: string[] } = {}): Column<PaymentView>[] {
  const all: Column<PaymentView>[] = [
    {
      id: "ref",
      header: "Payment",
      mobile: "title",
      sortValue: (p) => p.ref,
      cell: (p) => <span className="font-medium">{p.ref}</span>,
    },
    { id: "date", header: "Date", sortValue: (p) => p.date, cell: (p) => formatDate(p.date) },
    {
      id: "party",
      header: "Party",
      mobile: "subtitle",
      sortValue: (p) => p.partyName,
      cell: (p) => (
        <div>
          <p>{p.partyName}</p>
          <p className="text-xs text-muted-foreground">{p.partyType}</p>
        </div>
      ),
    },
    {
      id: "against",
      header: "Against",
      cell: (p) =>
        p.againstType === "Invoice" ? (
          <Link
            to="/invoices/$invoiceId"
            params={{ invoiceId: p.againstId }}
            onClick={stop}
            className="text-primary hover:underline"
          >
            {p.againstLabel}
          </Link>
        ) : (
          <Link
            to="/bills/$billId"
            params={{ billId: p.againstId }}
            onClick={stop}
            className="text-primary hover:underline"
          >
            {p.againstLabel}
          </Link>
        ),
    },
    {
      id: "mode",
      header: "Mode",
      sortValue: (p) => p.mode,
      cell: (p) => (
        <div>
          <p>{p.mode}</p>
          <p className="text-xs text-muted-foreground">{p.reference}</p>
        </div>
      ),
    },
    {
      id: "amount",
      header: "Amount",
      align: "right",
      mobile: "badge",
      sortValue: (p) => p.amount,
      cell: (p) => (
        <span
          className={cn(
            "font-semibold tabular-nums",
            p.direction === "Incoming" ? "text-emerald-700 dark:text-emerald-300" : "",
          )}
        >
          {p.direction === "Incoming" ? "+" : "−"}
          {formatINR(p.amount)}
        </span>
      ),
    },
    { id: "by", header: "Recorded by", hideBelow: "xl", cell: (p) => p.recordedBy },
  ];
  return all.filter((c) => !opts.hide?.includes(c.id));
}

export { ProgressBar };
