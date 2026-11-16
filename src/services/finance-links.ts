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

/**
 * Transporter bill lines matched to the given trips (database ids), with their bills.
 * Asked for in chunks so the request URL stays short.
 */
export async function transporterBillLinesForTrips(tripUuids: string[]): Promise<{
  lines: { tripUuid: string; billId: string; billedAmount: number }[];
  bills: BillView[];
}> {
  const ids = [...new Set(tripUuids.filter(Boolean))];
  if (!ids.length) return { lines: [], bills: [] };
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 80) chunks.push(ids.slice(i, i + 80));
  const results = await Promise.all(
    chunks.map((c) =>
      sb()
        .from("transporter_bill_trips")
        .select("trip_id, bill_id, billed_amount")
        .in("trip_id", c),
    ),
  );
  const lines = results.flatMap((r) =>
    rows(r).map((x) => ({
      tripUuid: x.trip_id ?? "",
      billId: x.bill_id,
      billedAmount: Number(x.billed_amount) || 0,
    })),
  );
  const billIds = [...new Set(lines.map((l) => l.billId))];
  const bills = billIds.length
    ? rows(await sb().from("v_bill_list").select("*").in("id", billIds)).map((r) => toBillView(r))
    : [];
  return { lines, bills };
}
