/**
 * Pure mappers for the finance views (bills, invoices, payments, expenses, profit).
 * Money and quantities arrive as numbers or numeric strings; everything is computed by the
 * database and only reshaped here.
 */
import type {
  AdditionalCost,
  BillKind,
  BillLine,
  BillView,
  ExpenseCategory,
  ExpenseView,
  GstMode,
  InvoiceFlag,
  InvoiceLine,
  InvoiceView,
  MonthlyProfitView,
  OrderProfitView,
  PartyBalance,
  PartyType,
  PaymentMode,
  PaymentStatus,
  PaymentView,
  ReconStatus,
} from "@/types";
import type { Enums, Tables, Views } from "@/lib/supabase";
import { formatMonth, todayIST } from "@/lib/format";
import { num, unitFromDb } from "./mappers";

const r2 = (n: number) => Math.round(n * 100) / 100;
const invert = <K extends string, V extends string>(m: Record<K, V>) =>
  Object.fromEntries(Object.entries(m).map(([k, v]) => [v, k])) as Record<V, K>;

// ---------- Enums ----------
const RECON: Record<Enums<"recon_status">, ReconStatus> = {
  unreconciled: "Unreconciled",
  matched: "Matched",
  mismatch: "Mismatch",
  disputed: "Disputed",
  correction_requested: "Correction Requested",
  difference_approved: "Difference Approved",
  reconciled: "Reconciled",
};
export const reconFromDb = (s: Enums<"recon_status"> | null | undefined): ReconStatus =>
  RECON[s ?? "unreconciled"];
export const reconToDb = (s: ReconStatus) => invert(RECON)[s];

const GST: Record<Enums<"gst_mode">, GstMode> = {
  cgst_sgst: "CGST+SGST",
  igst: "IGST",
  none: "None",
};
export const gstFromDb = (g: Enums<"gst_mode"> | null | undefined): GstMode =>
  GST[g ?? "cgst_sgst"];

const MODE: Record<Enums<"payment_mode">, PaymentMode> = {
  upi: "UPI",
  bank_transfer: "Bank Transfer",
  cheque: "Cheque",
  cash: "Cash",
};
export const modeFromDb = (m: Enums<"payment_mode"> | null | undefined): PaymentMode =>
  MODE[m ?? "cash"];
export const modeToDb = (m: PaymentMode) => invert(MODE)[m];

const CATEGORY: Record<Enums<"expense_category">, ExpenseCategory> = {
  labour: "Labour",
  loading: "Loading",
  unloading: "Unloading",
  fuel: "Fuel",
  toll: "Toll",
  waiting: "Waiting Charges",
  other: "Other",
};
export const categoryFromDb = (c: Enums<"expense_category"> | null | undefined): ExpenseCategory =>
  CATEGORY[c ?? "other"];
export const categoryToDb = (c: ExpenseCategory) => invert(CATEGORY)[c];

const PARTY: Record<Enums<"party_type">, PartyType> = {
  customer: "Customer",
  provider: "Provider",
  transporter: "Transporter",
};
export const partyFromDb = (p: string | null | undefined): PartyType =>
  PARTY[(p ?? "customer") as Enums<"party_type">] ?? "Customer";
export const partyToDb = (p: PartyType) => invert(PARTY)[p];

const FLAGS: Record<string, InvoiceFlag> = {
  excess_quantity: "Excess quantity",
  missing_delivery_records: "Missing delivery records",
  wrong_rate: "Wrong rate",
  duplicate_invoice: "Duplicate invoice",
  amount_difference: "Amount difference",
  order_mismatch: "Order mismatch",
};
export const flagFromDb = (f: string): InvoiceFlag | null => FLAGS[f] ?? null;

export const billKindFromDb = (k: string | null | undefined): BillKind =>
  k === "transporter" ? "Transporter" : "Provider";

const payStatus = (total: number, paid: number): PaymentStatus =>
  paid <= 0 ? "Unpaid" : paid + 1 >= total ? "Paid" : "Partial";

const daysPast = (due: string | null | undefined, today = todayIST()) =>
  due
    ? Math.max(
        0,
        Math.round(
          (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${due}T00:00:00Z`)) / 86_400_000,
        ),
      )
    : 0;

const charges = (v: unknown): AdditionalCost[] =>
  Array.isArray(v)
    ? v
        .map((c) => c as { label?: unknown; amount?: unknown })
        .filter((c) => c && c.amount !== undefined)
        .map((c) => ({ label: String(c.label ?? "Charge"), amount: num(c.amount as number) }))
    : [];

// ---------- Bills ----------
export function toBillView(
  r: Views<"v_bill_list">,
  lines: BillLine[] = [],
  today = todayIST(),
): BillView {
  const total = num(r.total_amount);
  const paid = num(r.paid_amount);
  const subtotal = num(r.subtotal);
  const tax = num(r.tax_amount);
  const outstanding = r2(Math.max(0, total - paid));
  const due = r.due_date ?? r.bill_date ?? "";
  return {
    id: r.id ?? "",
    billNo: r.bill_number ?? "",
    kind: billKindFromDb(r.kind),
    partyId: r.party_id ?? "",
    date: r.bill_date ?? "",
    dueDate: due,
    documentId: r.document_id ?? null,
    lines,
    expectedTripIds: [],
    taxRate: subtotal > 0 ? Math.round((tax / subtotal) * 1000) / 10 : 0,
    reconStatus: reconFromDb(r.recon_status),
    reconNote: r.recon_note ?? (r.recon_status === "matched" ? "" : (r.recon_reason ?? "")),
    partyName: r.party_name ?? "",
    billedQuantity: num(r.billed_quantity),
    billedTrips: num(r.line_count),
    billedSubtotal: r2(subtotal + num(r.additional_charges)),
    taxAmount: tax,
    total,
    paid,
    outstanding,
    paymentStatus: payStatus(total, paid),
    recordedQuantity: num(r.recorded_quantity),
    recordedSubtotal: num(r.recorded_amount),
    recordedTrips: num(r.recorded_trips),
    difference: num(r.amount_difference),
    unmatchedLineCount: num(r.unmatched_lines),
    missingTripIds: [],
    overdueDays: outstanding > 1 ? daysPast(due, today) : 0,
  };
}

/** One line of the reconciliation detail (reconciliation_records.detail.lines[]). */
export interface ReconLineJson {
  line_id: string | null;
  billed_ref: string | null;
  date: string | null;
  vehicle: string | null;
  billed: { quantity: number; rate: number; amount: number } | null;
  recorded: { quantity: number; rate: number; amount: number } | null;
  trip_id: string | null;
  trip_code: string | null;
  state: "matched" | "quantity_differs" | "rate_differs" | "not_in_system" | "missing_on_bill";
  reason: string;
}

const LINE_STATE = {
  matched: "Matched",
  quantity_differs: "Quantity differs",
  rate_differs: "Rate differs",
  not_in_system: "Not in system",
  missing_on_bill: "Missing on bill",
} as const;
export const lineStateFromDb = (s: ReconLineJson["state"]) => LINE_STATE[s] ?? "Not in system";

export function billLinesFromItems(
  kind: BillKind,
  items: (Tables<"provider_bill_items"> | Tables<"transporter_bill_trips">)[],
  tripCodes: Map<string, string>,
): BillLine[] {
  return items.map((it) => {
    const p = it as Tables<"provider_bill_items">;
    const t = it as Tables<"transporter_bill_trips">;
    const quantity = kind === "Provider" ? num(p.quantity) : num(t.quantity ?? 1);
    const amount = kind === "Provider" ? num(p.amount) : num(t.billed_amount);
    return {
      id: it.id,
      billedRef: it.billed_reference ?? "",
      date: (kind === "Provider" ? p.line_date : t.trip_date) ?? "",
      vehicle: it.vehicle_number ?? "",
      quantity,
      rate: kind === "Provider" ? num(p.rate) : num(t.rate ?? t.billed_amount),
      amount,
      tripId: it.trip_id ? (tripCodes.get(it.trip_id) ?? it.trip_id) : null,
    };
  });
}

// ---------- Invoices ----------
export function toInvoiceView(
  r: Views<"v_invoice_list">,
  items: Tables<"invoice_items">[] = [],
  tripCodes: Map<string, string> = new Map(),
  today = todayIST(),
): InvoiceView {
  const total = num(r.total_amount);
  const paid = num(r.paid_amount);
  const cancelled = r.status === "cancelled";
  const lines: InvoiceLine[] = items.map((i) => ({
    id: i.id,
    materialId: i.material_id,
    description: i.description ?? "",
    tripIds: i.trip_id ? [tripCodes.get(i.trip_id) ?? i.trip_id] : [],
    quantity: num(i.quantity),
    unit: unitFromDb(i.unit),
    rate: num(i.rate),
    gstRate: num(i.gst_rate),
  }));
  return {
    id: r.id ?? "",
    number: r.invoice_number ?? "",
    customerId: r.customer_id ?? "",
    orderId: r.order_id ?? "",
    siteId: r.site_id ?? "",
    date: r.invoice_date ?? "",
    dueDate: r.due_date ?? "",
    lines,
    gstMode: gstFromDb(r.gst_mode),
    additionalCharges: [],
    flags: (r.verification_flags ?? []).map(flagFromDb).filter((f): f is InvoiceFlag => Boolean(f)),
    reconStatus: reconFromDb(r.recon_status),
    notes: r.notes ?? "",
    customerName: r.customer_name ?? "",
    siteName: r.site_name ?? "",
    orderRef: r.order_code ?? "",
    quantity: num(r.quantity),
    subtotal: num(r.subtotal),
    additionalTotal: num(r.additional_charges),
    taxAmount: num(r.tax_amount),
    total,
    paid,
    balance: cancelled ? 0 : num(r.balance),
    paymentStatus: cancelled ? "Unpaid" : payStatus(total, paid),
    overdueDays: cancelled
      ? 0
      : (r.overdue_days ?? (num(r.balance) > 1 ? daysPast(r.due_date, today) : 0)),
    status: r.status === "draft" ? "Draft" : cancelled ? "Cancelled" : "Issued",
    cgst: num(r.cgst_amount),
    sgst: num(r.sgst_amount),
    igst: num(r.igst_amount),
    placeOfSupply: r.place_of_supply ?? "",
  };
}

export const withCharges = (v: InvoiceView, detail: unknown): InvoiceView => ({
  ...v,
  additionalCharges: charges(detail),
});

// ---------- Payments & expenses ----------
export function toPaymentView(r: Views<"v_payment_list">): PaymentView {
  return {
    id: r.id ?? "",
    ref: r.payment_code ?? "",
    direction: r.direction === "outgoing" ? "Outgoing" : "Incoming",
    partyType: partyFromDb(r.party_type),
    partyId: r.party_id ?? "",
    againstType: r.against_type === "invoice" ? "Invoice" : "Bill",
    againstId: r.against_id ?? "",
    date: r.payment_date ?? "",
    amount: num(r.amount),
    mode: modeFromDb(r.mode),
    reference: r.reference ?? "",
    notes: r.notes ?? "",
    recordedBy: r.recorded_by ?? "",
    partyName: r.party_name ?? "",
    againstLabel: r.against_label ?? "On account",
  };
}

export function toExpenseView(r: Views<"v_expense_list">): ExpenseView {
  return {
    id: r.id ?? "",
    date: r.expense_date ?? "",
    category: categoryFromDb(r.category),
    amount: num(r.amount),
    description: r.description ?? "",
    paidTo: r.paid_to ?? "",
    mode: modeFromDb(r.mode),
    orderId: r.order_id ?? null,
    tripId: r.trip_code ?? null,
    recordedBy: r.recorded_by ?? "",
    orderRef: r.order_code ?? null,
    tripRef: r.trip_code ?? null,
  };
}

export function toPartyBalance(r: Views<"v_party_outstanding">): PartyBalance {
  return {
    partyId: r.party_id ?? "",
    partyName: r.party_name ?? "",
    partyType: partyFromDb(r.party_type),
    total: num(r.total),
    paid: num(r.paid),
    outstanding: num(r.outstanding),
    current: num(r.current_amount),
    d30: num(r.d30),
    d60: num(r.d60),
    d90: num(r.d90),
  };
}

// ---------- Profit ----------
const breakdown = (r: {
  sales_value: number | null;
  purchase_cost: number | null;
  transport_cost: number | null;
  loading_unloading_cost: number | null;
  labour_cost: number | null;
  other_expenses: number | null;
  estimated_profit: number | null;
}) => {
  const sales = num(r.sales_value);
  const profit = num(r.estimated_profit);
  return {
    salesValue: sales,
    purchaseCost: num(r.purchase_cost),
    transportCost: num(r.transport_cost),
    loadingUnloading: num(r.loading_unloading_cost),
    labour: num(r.labour_cost),
    other: num(r.other_expenses),
    profit,
    marginPct: sales > 0 ? Math.round((profit / sales) * 1000) / 10 : 0,
  };
};

export function toOrderProfitView(r: Views<"v_order_profit">, unitLabel = "MT"): OrderProfitView {
  return {
    ...breakdown(r),
    orderId: r.order_id ?? "",
    orderRef: r.order_code ?? "",
    customerName: r.customer_name ?? "",
    status: r.profit_status === "settled" ? "Final Settled" : "Estimated",
    deliveredQty: num(r.delivered_qty),
    unitLabel,
  };
}

export function toMonthlyProfitView(r: Views<"v_monthly_profit">): MonthlyProfitView {
  return {
    ...breakdown(r),
    month: r.month ?? "",
    label: r.month ? formatMonth(r.month) : "",
    status: r.profit_status === "settled" ? "Final Settled" : "Estimated",
  };
}
