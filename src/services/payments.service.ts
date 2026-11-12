/**
 * Payments (incoming / outgoing) and expenses, backed by Supabase. Balances, allocation
 * (selected or oldest-first, from settings) and the overpayment rule live in the database
 * (record_payment); both need the record_payments permission and are audited.
 */
import type {
  ExpenseCategory,
  ExpenseView,
  PartyBalance,
  PartyType,
  PaymentDirection,
  PaymentMode,
  PaymentView,
} from "@/types";
import { AppError, rows, unwrap, unwrapMaybe } from "./supabase/errors";
import { LIST_CAP, sb, tripUuid } from "./supabase/fetch";
import {
  categoryFromDb,
  categoryToDb,
  modeToDb,
  partyToDb,
  toExpenseView,
  toPartyBalance,
  toPaymentView,
} from "./supabase/finance-mappers";
import { num } from "./supabase/mappers";
import { activeFilter, ilikeTerm, type Page, type TableQuery } from "./supabase/table-query";

export async function listPayments(
  eq: { party_id?: string; against_id?: string } = {},
): Promise<PaymentView[]> {
  let q = sb().from("v_payment_list").select("*");
  if (eq.party_id) q = q.eq("party_id", eq.party_id);
  if (eq.against_id) q = q.eq("against_id", eq.against_id);
  const list = rows(
    await q
      .order("payment_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(LIST_CAP),
  );
  return list.map(toPaymentView);
}

const PAYMENT_SORT: Record<string, string> = {
  ref: "payment_code",
  date: "payment_date",
  party: "party_name",
  amount: "amount",
  mode: "mode",
  against: "against_label",
  direction: "direction",
};

/** Server-side paginated payment list. */
export async function listPaymentsPage(q: TableQuery): Promise<Page<PaymentView>> {
  let query = sb().from("v_payment_list").select("*", { count: "exact" });
  if (q.search.trim()) {
    const t = ilikeTerm(q.search);
    query = query.or(
      `payment_code.ilike.${t},party_name.ilike.${t},against_label.ilike.${t},reference.ilike.${t}`,
    );
  }
  const direction = activeFilter(q, "direction");
  if (direction) query = query.eq("direction", direction === "Outgoing" ? "outgoing" : "incoming");
  const mode = activeFilter(q, "mode");
  if (mode) query = query.eq("mode", modeToDb(mode as PaymentMode));
  const party = activeFilter(q, "partyType");
  if (party) query = query.eq("party_type", partyToDb(party as PartyType));
  if (q.from) query = query.gte("payment_date", q.from);
  if (q.to) query = query.lte("payment_date", q.to);
  const col = (q.sort && PAYMENT_SORT[q.sort.id]) ?? "payment_date";
  const res = await query
    .order(col as "payment_date", { ascending: q.sort ? !q.sort.desc : false })
    .order("created_at", { ascending: false })
    .range(q.page * q.pageSize, q.page * q.pageSize + q.pageSize - 1);
  return { rows: rows(res).map(toPaymentView), total: res.count ?? 0 };
}

export interface OpenDocument {
  id: string;
  label: string;
  date: string;
  total: number;
  paid: number;
  balance: number;
}

/** Invoices (customer) or bills (provider/transporter) that still have a balance, oldest first. */
export async function listOpenDocuments(
  partyType: PartyType,
  partyId: string,
): Promise<OpenDocument[]> {
  if (!partyId) return [];
  if (partyType === "Customer") {
    const list = rows(
      await sb()
        .from("v_invoice_list")
        .select("id, invoice_number, invoice_date, total_amount, paid_amount, balance")
        .eq("customer_id", partyId)
        .eq("status", "issued")
        .gt("balance", 0.005)
        .order("invoice_date"),
    );
    return list.map((i) => ({
      id: i.id ?? "",
      label: i.invoice_number ?? "",
      date: i.invoice_date ?? "",
      total: num(i.total_amount),
      paid: num(i.paid_amount),
      balance: num(i.balance),
    }));
  }
  const list = rows(
    await sb()
      .from("v_bill_list")
      .select("id, bill_number, bill_date, total_amount, paid_amount")
      .eq("kind", partyType === "Provider" ? "provider" : "transporter")
      .eq("party_id", partyId)
      .order("bill_date"),
  );
  return list
    .map((b) => ({
      id: b.id ?? "",
      label: b.bill_number ?? "",
      date: b.bill_date ?? "",
      total: num(b.total_amount),
      paid: num(b.paid_amount),
      balance: Math.round((num(b.total_amount) - num(b.paid_amount)) * 100) / 100,
    }))
    .filter((b) => b.balance > 0.005);
}

export interface PaymentInput {
  direction: PaymentDirection;
  partyType: PartyType;
  partyId: string;
  /** Invoice / bill id; "" lets the database allocate oldest-first (when enabled in settings). */
  againstId: string;
  date: string;
  amount: number;
  mode: PaymentMode;
  reference: string;
  notes: string;
  /** Keep the part above the balance as an advance (only when settings allow it). */
  allowExcess?: boolean;
}

export interface PaymentResult {
  ids: string[];
  /** Part kept on account (advance), 0 when fully allocated. */
  onAccount: number;
  /** Shown in toasts. */
  ref: string;
}

export async function recordPayment(input: PaymentInput): Promise<PaymentResult> {
  if ((input.partyType === "Customer") !== (input.direction === "Incoming"))
    throw new AppError("Customers pay us; we pay providers and transporters.", null, "invalid");
  const res = unwrap(
    await sb().rpc("record_payment", {
      p: {
        party_type: partyToDb(input.partyType),
        party_id: input.partyId,
        against_id: input.againstId || null,
        payment_date: input.date,
        amount: input.amount,
        mode: modeToDb(input.mode),
        reference: input.reference.trim() || null,
        notes: input.notes.trim() || null,
        allow_excess: Boolean(input.allowExcess),
      },
    }),
  ) as { payment_ids: string[]; on_account: number };
  const ids = res.payment_ids ?? [];
  const codes = ids.length
    ? rows(await sb().from("payments").select("payment_code").in("id", ids)).map(
        (p) => p.payment_code,
      )
    : [];
  return { ids, onAccount: num(res.on_account), ref: codes.join(", ") };
}

/** Outstanding by party with ageing buckets (days past due), computed by the database. */
export async function getOutstanding(): Promise<PartyBalance[]> {
  const list = rows(
    await sb()
      .from("v_party_outstanding")
      .select("*")
      .gt("outstanding", 0.005)
      .order("outstanding", { ascending: false }),
  );
  return list.map(toPartyBalance);
}

// ---------- Expenses ----------
export async function listExpenses(eq: { order_id?: string } = {}): Promise<ExpenseView[]> {
  let q = sb().from("v_expense_list").select("*");
  if (eq.order_id) q = q.eq("order_id", eq.order_id);
  const list = rows(await q.order("expense_date", { ascending: false }).limit(LIST_CAP));
  return list.map(toExpenseView);
}

const EXPENSE_SORT: Record<string, string> = {
  date: "expense_date",
  category: "category",
  amount: "amount",
  description: "description",
  paidTo: "paid_to",
  order: "order_code",
  trip: "trip_code",
};

const expenseBase = () => sb().from("v_expense_list").select("*", { count: "exact" });

function filterExpenses(query: ReturnType<typeof expenseBase>, q: TableQuery) {
  let x = query;
  if (q.search.trim()) {
    const t = ilikeTerm(q.search);
    x = x.or(
      `description.ilike.${t},paid_to.ilike.${t},order_code.ilike.${t},trip_code.ilike.${t}`,
    );
  }
  const category = activeFilter(q, "category");
  if (category) x = x.eq("category", categoryToDb(category as ExpenseCategory));
  const mode = activeFilter(q, "mode");
  if (mode) x = x.eq("mode", modeToDb(mode as PaymentMode));
  if (q.from) x = x.gte("expense_date", q.from);
  if (q.to) x = x.lte("expense_date", q.to);
  return x;
}

/** Server-side paginated expenses, with the total amount of every matching row. */
export async function listExpensesPage(
  q: TableQuery,
): Promise<Page<ExpenseView> & { sum: number }> {
  const col = (q.sort && EXPENSE_SORT[q.sort.id]) ?? "expense_date";
  const [res, all] = await Promise.all([
    filterExpenses(expenseBase(), q)
      .order(col as "expense_date", { ascending: q.sort ? !q.sort.desc : false })
      .order("created_at", { ascending: false })
      .range(q.page * q.pageSize, q.page * q.pageSize + q.pageSize - 1),
    filterExpenses(expenseBase(), q).limit(10000),
  ]);
  return {
    rows: rows(res).map(toExpenseView),
    total: res.count ?? 0,
    sum: Math.round(rows(all).reduce((s, e) => s + num(e.amount), 0) * 100) / 100,
  };
}

export interface ExpenseInput {
  date: string;
  category: ExpenseCategory;
  amount: number;
  description: string;
  paidTo: string;
  mode: PaymentMode;
  orderId: string | null;
  /** Trip code (TripView.id) or null. */
  tripId: string | null;
}

export async function addExpense(input: ExpenseInput): Promise<ExpenseView> {
  if (!(input.amount > 0)) throw new AppError("Enter an amount above zero.", null, "invalid");
  const tripId = input.tripId ? await tripUuid(input.tripId) : null;
  const row = unwrap(
    await sb()
      .from("expenses")
      .insert({
        expense_date: input.date,
        category: categoryToDb(input.category),
        amount: input.amount,
        description: input.description.trim(),
        paid_to: input.paidTo.trim() || null,
        mode: modeToDb(input.mode),
        order_id: input.orderId,
        trip_id: tripId,
      })
      .select("id")
      .single(),
  );
  const view = unwrapMaybe(
    await sb().from("v_expense_list").select("*").eq("id", row.id).maybeSingle(),
  );
  if (!view) throw new AppError("Expense saved but could not be read back.", null, "unknown");
  return toExpenseView(view);
}

export interface PaymentTarget {
  id: string;
  partyType: PartyType;
  partyId: string;
  balance: number;
}

/** Invoice or bill a "Record payment" link points at (to pre-fill the form). */
export async function paymentTarget(id: string): Promise<PaymentTarget | null> {
  if (!id) return null;
  const inv = unwrapMaybe(
    await sb().from("v_invoice_list").select("id, customer_id, balance").eq("id", id).maybeSingle(),
  );
  if (inv)
    return { id, partyType: "Customer", partyId: inv.customer_id ?? "", balance: num(inv.balance) };
  const bill = unwrapMaybe(
    await sb()
      .from("v_bill_list")
      .select("id, kind, party_id, total_amount, paid_amount")
      .eq("id", id)
      .maybeSingle(),
  );
  if (!bill) return null;
  return {
    id,
    partyType: bill.kind === "transporter" ? "Transporter" : "Provider",
    partyId: bill.party_id ?? "",
    balance: Math.round((num(bill.total_amount) - num(bill.paid_amount)) * 100) / 100,
  };
}

/** Total spent per category across all expenses the user can see. */
export async function expenseCategoryTotals(): Promise<Partial<Record<ExpenseCategory, number>>> {
  const list = rows(await sb().from("v_expense_list").select("category, amount").limit(20000));
  const out: Partial<Record<ExpenseCategory, number>> = {};
  for (const e of list) {
    const c = categoryFromDb(e.category);
    out[c] = Math.round(((out[c] ?? 0) + num(e.amount)) * 100) / 100;
  }
  return out;
}
