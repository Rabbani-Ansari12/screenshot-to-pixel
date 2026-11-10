import type {
  Expense,
  ExpenseCategory,
  ExpenseView,
  PartyBalance,
  PartyType,
  Payment,
  PaymentDirection,
  PaymentMode,
  PaymentView,
} from "@/types";
import { DEMO_TODAY } from "@/lib/format";
import { NotFoundError, actingUser, clone, db, delay, logAudit, nextId } from "./core";
import { lookup, toBillView, toExpenseView, toInvoiceView, toPaymentView } from "./views";

// TODO(backend): supabase.from("payments_view").select("*")
export async function listPayments(): Promise<PaymentView[]> {
  await delay();
  return clone(db.payments.map(toPaymentView).reverse());
}

export interface OpenDocument {
  id: string;
  label: string;
  date: string;
  total: number;
  paid: number;
  balance: number;
}

/** Invoices (customer) or bills (provider/transporter) that still have a balance. */
export async function listOpenDocuments(
  partyType: PartyType,
  partyId: string,
): Promise<OpenDocument[]> {
  await delay(150);
  if (partyType === "Customer") {
    return clone(
      db.invoices
        .filter((i) => i.customerId === partyId)
        .map(toInvoiceView)
        .filter((i) => i.balance > 0)
        .map((i) => ({
          id: i.id,
          label: i.number,
          date: i.date,
          total: i.total,
          paid: i.paid,
          balance: i.balance,
        })),
    );
  }
  return clone(
    db.bills
      .filter((b) => b.partyId === partyId && b.kind === partyType)
      .map(toBillView)
      .filter((b) => b.outstanding > 0)
      .map((b) => ({
        id: b.id,
        label: b.billNo,
        date: b.date,
        total: b.total,
        paid: b.paid,
        balance: b.outstanding,
      })),
  );
}

export interface PaymentInput {
  direction: PaymentDirection;
  partyType: PartyType;
  partyId: string;
  againstId: string;
  date: string;
  amount: number;
  mode: PaymentMode;
  reference: string;
  notes: string;
}

// TODO(backend): supabase.from("payments").insert(...)
export async function recordPayment(input: PaymentInput): Promise<Payment> {
  await delay(400);
  const isInvoice = input.partyType === "Customer";
  const target = isInvoice
    ? db.invoices.find((i) => i.id === input.againstId)
    : db.bills.find((b) => b.id === input.againstId);
  if (!target) throw new NotFoundError("Invoice or bill");
  const id = nextId("PAY-2026-", db.payments);
  const payment: Payment = {
    ...input,
    id,
    ref: id,
    againstType: isInvoice ? "Invoice" : "Bill",
    recordedBy: actingUser(),
  };
  db.payments.push(payment);
  logAudit({
    action: "Recorded",
    entityType: "Payment",
    entityId: id,
    entityLabel: `${id} · ${input.direction}`,
    changes: [
      { field: "Amount", from: "—", to: `₹${input.amount.toLocaleString("en-IN")}` },
      { field: "Mode", from: "—", to: input.mode },
    ],
  });
  return clone(payment);
}

function aging(due: string, amount: number) {
  const days = Math.round(
    (Date.parse(`${DEMO_TODAY}T00:00:00Z`) - Date.parse(`${due}T00:00:00Z`)) / 86_400_000,
  );
  return {
    current: days <= 0 ? amount : 0,
    d30: days > 0 && days <= 30 ? amount : 0,
    d60: days > 30 && days <= 60 ? amount : 0,
    d90: days > 60 ? amount : 0,
  };
}

/** Outstanding by party with aging buckets (by days past due date). */
export async function getOutstanding(): Promise<PartyBalance[]> {
  await delay();
  const rows = new Map<string, PartyBalance>();
  const add = (partyType: PartyType, partyId: string, total: number, paid: number, due: string) => {
    const key = `${partyType}|${partyId}`;
    const row = rows.get(key) ?? {
      partyId,
      partyName: lookup.partyName(partyType, partyId),
      partyType,
      total: 0,
      paid: 0,
      outstanding: 0,
      current: 0,
      d30: 0,
      d60: 0,
      d90: 0,
    };
    const out = Math.max(0, total - paid);
    const a = aging(due, out);
    row.total += total;
    row.paid += paid;
    row.outstanding += out;
    row.current += a.current;
    row.d30 += a.d30;
    row.d60 += a.d60;
    row.d90 += a.d90;
    rows.set(key, row);
  };
  db.invoices
    .map(toInvoiceView)
    .forEach((i) => add("Customer", i.customerId, i.total, i.paid, i.dueDate));
  db.bills.map(toBillView).forEach((b) => add(b.kind, b.partyId, b.total, b.paid, b.dueDate));
  return clone([...rows.values()].sort((a, b) => b.outstanding - a.outstanding));
}

// ---------- Expenses ----------
// TODO(backend): supabase.from("expenses").select("*")
export async function listExpenses(): Promise<ExpenseView[]> {
  await delay();
  return clone(db.expenses.map(toExpenseView).reverse());
}

export interface ExpenseInput {
  date: string;
  category: ExpenseCategory;
  amount: number;
  description: string;
  paidTo: string;
  mode: PaymentMode;
  orderId: string | null;
  tripId: string | null;
}

export async function addExpense(input: ExpenseInput): Promise<Expense> {
  await delay(350);
  const id = nextId("EXP-2026-", db.expenses);
  const expense: Expense = { ...input, id, recordedBy: actingUser() };
  db.expenses.push(expense);
  logAudit({
    action: "Recorded",
    entityType: "Expense",
    entityId: id,
    entityLabel: `${id} · ${input.category}`,
    changes: [{ field: "Amount", from: "—", to: `₹${input.amount.toLocaleString("en-IN")}` }],
  });
  return clone(expense);
}
