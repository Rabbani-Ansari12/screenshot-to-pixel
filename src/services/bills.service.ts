/**
 * Provider / transporter bills and three-way reconciliation, backed by Supabase.
 * Figures come from the reconcile_* functions (reconciliation_records); decisions go through
 * decide_reconciliation (verify_bills, note required, audited). Nothing here changes trips,
 * weights or purchases.
 */
import type {
  BillKind,
  BillView,
  DocumentRecord,
  InvoiceFlag,
  InvoiceView,
  PaymentView,
  TripView,
} from "@/types";
import type { Json, Tables, Views } from "@/lib/supabase";
import { lookupsFor, toDocumentRecord } from "./documents.service";
import { AppError, rows, unwrap, unwrapMaybe } from "./supabase/errors";
import { LIST_CAP, fetchTripsIn, sb } from "./supabase/fetch";
import {
  billLinesFromItems,
  flagFromDb,
  lineStateFromDb,
  reconToDb,
  toBillView,
  toInvoiceView,
  toPaymentView,
  type ReconLineJson,
} from "./supabase/finance-mappers";
import { num } from "./supabase/mappers";
import { activeFilter, ilikeTerm, type Page, type TableQuery } from "./supabase/table-query";
import type { ReconStatus } from "@/types";

export interface BillLineMatch {
  lineId: string | null;
  billedRef: string;
  date: string;
  vehicle: string;
  billed: { quantity: number; rate: number; amount: number } | null;
  recorded: { quantity: number; rate: number; amount: number } | null;
  tripId: string | null;
  state: "Matched" | "Quantity differs" | "Rate differs" | "Not in system" | "Missing on bill";
  reason: string;
}

export interface BillDetail {
  bill: BillView;
  lines: BillLineMatch[];
  trips: TripView[];
  payments: PaymentView[];
  document: DocumentRecord | null;
  /** "per_trip" | "per_mt" for transporter bills (the basis the check used). */
  rateBasis: string | null;
  checkedAt: string | null;
}

const kindToDb = (k: BillKind) => (k === "Provider" ? "provider" : "transporter");
const billType = (k: BillKind) => (k === "Provider" ? "provider_bill" : "transporter_bill");

// ---------- Lists ----------
export async function listBills(kind?: BillKind): Promise<BillView[]> {
  let q = sb().from("v_bill_list").select("*");
  if (kind) q = q.eq("kind", kindToDb(kind));
  const list = rows(await q.order("bill_date", { ascending: false }).limit(LIST_CAP));
  return list.map((r) => toBillView(r));
}

const BILL_SORT: Record<string, string> = {
  bill: "bill_number",
  billNo: "bill_number",
  ref: "bill_number",
  date: "bill_date",
  due: "due_date",
  party: "party_name",
  total: "total_amount",
  amount: "total_amount",
  billed: "subtotal",
  recorded: "recorded_amount",
  diff: "amount_difference",
  recon: "recon_status",
  status: "recon_status",
  paid: "paid_amount",
};

/** Server-side paginated bill list (search, party / reconciliation filters, date range, sort). */
export async function listBillsPage(kind: BillKind | null, q: TableQuery): Promise<Page<BillView>> {
  let query = sb().from("v_bill_list").select("*", { count: "exact" });
  if (kind) query = query.eq("kind", kindToDb(kind));
  if (q.search.trim()) {
    const t = ilikeTerm(q.search);
    query = query.or(`bill_number.ilike.${t},party_name.ilike.${t}`);
  }
  const party = activeFilter(q, "party");
  if (party) query = query.eq("party_id", party);
  const recon = activeFilter(q, "recon");
  if (recon) query = query.eq("recon_status", reconToDb(recon as ReconStatus));
  if (q.from) query = query.gte("bill_date", q.from);
  if (q.to) query = query.lte("bill_date", q.to);
  const col = (q.sort && BILL_SORT[q.sort.id]) ?? "bill_date";
  const res = await query
    .order(col as "bill_date", { ascending: q.sort ? !q.sort.desc : false })
    .order("created_at", { ascending: false })
    .range(q.page * q.pageSize, q.page * q.pageSize + q.pageSize - 1);
  return { rows: rows(res).map((r) => toBillView(r)), total: res.count ?? 0 };
}

// ---------- Detail ----------
async function billRow(id: string): Promise<Views<"v_bill_list">> {
  const row = unwrapMaybe(await sb().from("v_bill_list").select("*").eq("id", id).maybeSingle());
  if (!row) throw new AppError("Bill not found.", null, "not_found");
  return row;
}

async function tripCodesFor(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map();
  const list = rows(await sb().from("truck_trips").select("id, trip_code").in("id", unique));
  return new Map(list.map((t) => [t.id, t.trip_code]));
}

async function documentRecord(id: string | null): Promise<DocumentRecord | null> {
  if (!id) return null;
  const row = unwrapMaybe(
    await sb().from("documents").select("*").eq("id", id).is("deleted_at", null).maybeSingle(),
  );
  if (!row) return null;
  return toDocumentRecord(row, await lookupsFor([row]));
}

export async function paymentsAgainst(id: string): Promise<PaymentView[]> {
  const list = rows(
    await sb()
      .from("v_payment_list")
      .select("*")
      .eq("against_id", id)
      .order("payment_date", { ascending: false }),
  );
  return list.map(toPaymentView);
}

const detailLines = (detail: Json | null | undefined): ReconLineJson[] => {
  const d = (detail ?? {}) as { lines?: ReconLineJson[] };
  return Array.isArray(d.lines) ? d.lines : [];
};

export async function getBill(id: string): Promise<BillDetail> {
  const row = await billRow(id);
  const kind: BillKind = row.kind === "transporter" ? "Transporter" : "Provider";
  const [items, recon, payments] = await Promise.all([
    kind === "Provider"
      ? sb().from("provider_bill_items").select("*").eq("bill_id", id).order("line_date")
      : sb().from("transporter_bill_trips").select("*").eq("bill_id", id).order("trip_date"),
    sb()
      .from("reconciliation_records")
      .select("*")
      .eq("bill_type", billType(kind))
      .eq("bill_id", id)
      .maybeSingle(),
    paymentsAgainst(id),
  ]);
  const itemRows = rows(items) as (
    Tables<"provider_bill_items"> | Tables<"transporter_bill_trips">
  )[];
  const r = unwrapMaybe(recon);
  const json = detailLines(r?.detail);
  const tripIds = [
    ...itemRows.map((i) => i.trip_id ?? ""),
    ...json.map((l) => l.trip_id ?? ""),
  ].filter(Boolean);
  const codes = await tripCodesFor(tripIds);
  const [trips, document] = await Promise.all([
    fetchTripsIn("id", [...new Set(tripIds)]),
    documentRecord(row.document_id),
  ]);
  const bill = toBillView(row, billLinesFromItems(kind, itemRows, codes));
  const lines: BillLineMatch[] = json.map((l) => ({
    lineId: l.line_id,
    billedRef: l.billed_ref ?? l.trip_code ?? "",
    date: l.date ?? "",
    vehicle: l.vehicle ?? "",
    billed: l.billed
      ? { quantity: num(l.billed.quantity), rate: num(l.billed.rate), amount: num(l.billed.amount) }
      : null,
    recorded: l.recorded
      ? {
          quantity: num(l.recorded.quantity),
          rate: num(l.recorded.rate),
          amount: num(l.recorded.amount),
        }
      : null,
    tripId: l.trip_code ?? (l.trip_id ? (codes.get(l.trip_id) ?? null) : null),
    state: lineStateFromDb(l.state),
    reason: l.reason ?? "",
  }));
  bill.missingTripIds = lines
    .filter((l) => l.state === "Missing on bill" && l.tripId)
    .map((l) => l.tripId as string);
  bill.expectedTripIds = lines.filter((l) => l.tripId).map((l) => l.tripId as string);
  const detail = (r?.detail ?? {}) as { rate_basis?: string };
  return {
    bill,
    lines,
    trips,
    payments,
    document,
    rateBasis: detail.rate_basis ?? null,
    checkedAt: r?.checked_at ?? null,
  };
}

// ---------- Actions ----------
export type ReconAction =
  "approve_difference" | "dispute" | "request_correction" | "mark_reconciled";

/** Records the decision only. Bill lines and trip records are never modified. */
export async function reconcileBill(
  id: string,
  action: ReconAction,
  note: string,
): Promise<BillView> {
  const row = await billRow(id);
  const kind: BillKind = row.kind === "transporter" ? "Transporter" : "Provider";
  unwrap(
    await sb().rpc("decide_reconciliation", {
      p_bill_type: billType(kind),
      p_bill_id: id,
      p_action: action,
      p_note: note,
    }),
  );
  return toBillView(await billRow(id));
}

/** Runs the comparison again (e.g. after a missing trip or slip was recorded). */
export async function recheckBill(id: string): Promise<BillView> {
  const row = await billRow(id);
  unwrap(
    await sb().rpc(
      row.kind === "transporter" ? "reconcile_transporter_bill" : "reconcile_provider_bill",
      {
        p_bill_id: id,
      },
    ),
  );
  return toBillView(await billRow(id));
}

export interface BillLineInput {
  date: string | null;
  reference: string | null;
  vehicleNumber: string | null;
  materialId?: string | null;
  quantity: number | null;
  unit?: string | null;
  rate: number | null;
  amount: number | null;
}

export interface BillInput {
  kind: BillKind;
  partyId: string;
  billNumber: string;
  billDate: string;
  dueDate: string | null;
  totalAmount: number;
  taxAmount: number;
  additionalCharges: { label: string; amount: number }[];
  lines: BillLineInput[];
  documentId?: string | null;
  notes?: string;
  periodFrom?: string | null;
  periodTo?: string | null;
}

/** Manual bill entry (verify_bills). Duplicate party + bill number is rejected; checked at once. */
export async function createBill(input: BillInput): Promise<{ id: string; reconStatus: string }> {
  const res = unwrap(
    await sb().rpc("create_bill", {
      p_kind: kindToDb(input.kind),
      p_bill: {
        party_id: input.partyId,
        bill_number: input.billNumber,
        bill_date: input.billDate,
        due_date: input.dueDate,
        total_amount: input.totalAmount,
        tax_amount: input.taxAmount,
        additional_charges: input.additionalCharges,
        document_id: input.documentId ?? null,
        notes: input.notes ?? null,
        period_from: input.periodFrom ?? null,
        period_to: input.periodTo ?? null,
      },
      p_items: input.lines.map((l) => ({
        date: l.date,
        reference: l.reference,
        vehicle_number: l.vehicleNumber,
        material_id: l.materialId ?? null,
        quantity: l.quantity,
        unit: l.unit ?? null,
        rate: l.rate,
        amount: l.amount,
      })),
    }),
  ) as { id: string; recon_status: string };
  return { id: res.id, reconStatus: res.recon_status };
}

/** Bill or invoice? Reconciliation links use the record's id for both. */
export async function reconTargetKind(id: string): Promise<"invoice" | "bill"> {
  const inv = unwrapMaybe(
    await sb().from("customer_invoices").select("id").eq("id", id).maybeSingle(),
  );
  return inv ? "invoice" : "bill";
}

// ---------- Customer invoice verification ----------
export interface InvoiceCheck {
  flag: InvoiceFlag;
  passed: boolean;
  detail: string;
}

export interface InvoiceVerification {
  invoice: InvoiceView;
  checks: InvoiceCheck[];
  lines: {
    lineId: string;
    material: string;
    invoicedQty: number;
    deliveredQty: number;
    invoicedRate: number;
    orderRate: number;
    unit: string;
    tripIds: string[];
  }[];
}

interface InvoiceLineJson {
  line_id: string;
  material: string;
  unit: string;
  trip_id: string | null;
  trip_code: string | null;
  invoiced_qty: number;
  delivered_qty: number | null;
  invoiced_rate: number;
  order_rate: number | null;
}

async function invoiceRow(id: string) {
  const row = unwrapMaybe(await sb().from("v_invoice_list").select("*").eq("id", id).maybeSingle());
  if (!row) throw new AppError("Invoice not found.", null, "not_found");
  return row;
}

export async function getInvoiceVerification(id: string): Promise<InvoiceVerification> {
  const row = await invoiceRow(id);
  const r = unwrapMaybe(
    await sb()
      .from("reconciliation_records")
      .select("*")
      .eq("bill_type", "customer_invoice")
      .eq("bill_id", id)
      .maybeSingle(),
  );
  const detail = (r?.detail ?? {}) as {
    checks?: { flag: string; passed: boolean; detail: string }[];
    lines?: InvoiceLineJson[];
  };
  const checks = (detail.checks ?? [])
    .map((c) => ({ flag: flagFromDb(c.flag), passed: c.passed, detail: c.detail }))
    .filter((c): c is InvoiceCheck => c.flag !== null);
  const lines = (detail.lines ?? []).map((l) => ({
    lineId: l.line_id,
    material: l.material,
    unit: l.unit,
    invoicedQty: num(l.invoiced_qty),
    deliveredQty: num(l.delivered_qty ?? l.invoiced_qty),
    invoicedRate: num(l.invoiced_rate),
    orderRate: num(l.order_rate ?? l.invoiced_rate),
    tripIds: l.trip_code ? [l.trip_code] : [],
  }));
  return { invoice: toInvoiceView(row), checks, lines };
}

export async function reconcileInvoice(
  id: string,
  action: ReconAction,
  note: string,
): Promise<InvoiceView> {
  unwrap(
    await sb().rpc("decide_reconciliation", {
      p_bill_type: "customer_invoice",
      p_bill_id: id,
      p_action: action,
      p_note: note,
    }),
  );
  return toInvoiceView(await invoiceRow(id));
}

export async function recheckInvoice(id: string): Promise<InvoiceView> {
  unwrap(await sb().rpc("reconcile_invoice", { p_invoice_id: id }));
  return toInvoiceView(await invoiceRow(id));
}

// ---------- Totals ----------
export interface FinanceTotals {
  receivable: number;
  overdue: number;
  payableProvider: number;
  payableTransporter: number;
  invoicedMonth: number;
  receivedMonth: number;
  paidMonth: number;
  expensesMonth: number;
  billsNeedingAttention: number;
  invoicesFlagged: number;
}

/** Totals computed by the database across all rows the user can see (not just one page). */
export async function getFinanceTotals(): Promise<FinanceTotals> {
  const t = unwrap(await sb().rpc("finance_totals")) as {
    receivable: number;
    overdue: number;
    payable_provider: number;
    payable_transporter: number;
    invoiced_month: number;
    received_month: number;
    paid_month: number;
    expenses_month: number;
    bills_needing_attention: number;
    invoices_flagged: number;
  };
  return {
    receivable: num(t.receivable),
    overdue: num(t.overdue),
    payableProvider: num(t.payable_provider),
    payableTransporter: num(t.payable_transporter),
    invoicedMonth: num(t.invoiced_month),
    receivedMonth: num(t.received_month),
    paidMonth: num(t.paid_month),
    expensesMonth: num(t.expenses_month),
    billsNeedingAttention: num(t.bills_needing_attention),
    invoicesFlagged: num(t.invoices_flagged),
  };
}
