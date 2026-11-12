/**
 * Finance records shown on other detail pages (customer, provider, transporter, order, trip).
 * Small, dependency-free reads so the master / order / trip services can use them without
 * import cycles. RLS decides what each user sees (empty lists without finance access).
 */
import type { BillView, InvoiceView, PaymentView } from "@/types";
import { rows } from "./supabase/errors";
import { sb } from "./supabase/fetch";
import { toBillView, toInvoiceView, toPaymentView } from "./supabase/finance-mappers";

const CAP = 200;

export async function invoicesWhere(eq: {
  customer_id?: string;
  order_id?: string;
}): Promise<InvoiceView[]> {
  let q = sb().from("v_invoice_list").select("*");
  if (eq.customer_id) q = q.eq("customer_id", eq.customer_id);
  if (eq.order_id) q = q.eq("order_id", eq.order_id);
  return rows(await q.order("invoice_date", { ascending: false }).limit(CAP)).map((r) =>
    toInvoiceView(r),
  );
}

export async function billsForParty(
  kind: "provider" | "transporter",
  partyId: string,
): Promise<BillView[]> {
  const list = rows(
    await sb()
      .from("v_bill_list")
      .select("*")
      .eq("kind", kind)
      .eq("party_id", partyId)
      .order("bill_date", { ascending: false })
      .limit(CAP),
  );
  return list.map((r) => toBillView(r));
}

export async function paymentsForParty(partyId: string): Promise<PaymentView[]> {
  const list = rows(
    await sb()
      .from("v_payment_list")
      .select("*")
      .eq("party_id", partyId)
      .order("payment_date", { ascending: false })
      .limit(CAP),
  );
  return list.map(toPaymentView);
}

export async function paymentsAgainstAny(ids: string[]): Promise<PaymentView[]> {
  if (!ids.length) return [];
  const list = rows(
    await sb()
      .from("v_payment_list")
      .select("*")
      .in("against_id", ids)
      .order("payment_date", { ascending: false }),
  );
  return list.map(toPaymentView);
}

/** Bills and invoices that include a trip (by its database id). */
export async function financeForTrip(
  tripUuid: string,
): Promise<{ bills: BillView[]; invoices: InvoiceView[] }> {
  if (!tripUuid) return { bills: [], invoices: [] };
  const [pItems, tItems, iItems] = await Promise.all([
    sb().from("provider_bill_items").select("bill_id").eq("trip_id", tripUuid),
    sb().from("transporter_bill_trips").select("bill_id").eq("trip_id", tripUuid),
    sb().from("invoice_items").select("invoice_id").eq("trip_id", tripUuid),
  ]);
  const billIds = [...new Set([...rows(pItems), ...rows(tItems)].map((x) => x.bill_id))];
  const invoiceIds = [...new Set(rows(iItems).map((x) => x.invoice_id))];
  const [bills, invoices] = await Promise.all([
    billIds.length
      ? sb().from("v_bill_list").select("*").in("id", billIds)
      : Promise.resolve({ data: [], error: null }),
    invoiceIds.length
      ? sb().from("v_invoice_list").select("*").in("id", invoiceIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  return {
    bills: rows(bills).map((r) => toBillView(r)),
    invoices: rows(invoices).map((r) => toInvoiceView(r)),
  };
}
