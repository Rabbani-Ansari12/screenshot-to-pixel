/**
 * Customer invoices, backed by Supabase. Numbering, GST split (by place of supply), totals and
 * the "one delivery on one invoice" rule are enforced in the database (create_invoice).
 */
import type {
  AdditionalCost,
  GstMode,
  InvoiceView,
  PaymentStatus,
  PaymentView,
  ReconStatus,
  TripView,
} from "@/types";
import { AppError, check, rows, unwrap, unwrapMaybe } from "./supabase/errors";
import { LIST_CAP, fetchTrips, fetchTripsIn, sb } from "./supabase/fetch";
import { reconToDb, toInvoiceView, withCharges } from "./supabase/finance-mappers";
import { activeFilter, ilikeTerm, type Page, type TableQuery } from "./supabase/table-query";
import { paymentsAgainst } from "./bills.service";

export async function listInvoices(
  eq: { customer_id?: string; order_id?: string } = {},
): Promise<InvoiceView[]> {
  let q = sb().from("v_invoice_list").select("*");
  if (eq.customer_id) q = q.eq("customer_id", eq.customer_id);
  if (eq.order_id) q = q.eq("order_id", eq.order_id);
  const list = rows(await q.order("invoice_date", { ascending: false }).limit(LIST_CAP));
  return list.map((r) => toInvoiceView(r));
}

const INVOICE_SORT: Record<string, string> = {
  number: "invoice_number",
  invoice: "invoice_number",
  ref: "invoice_number",
  date: "invoice_date",
  due: "due_date",
  customer: "customer_name",
  order: "order_code",
  total: "total_amount",
  amount: "total_amount",
  balance: "balance",
  paid: "paid_amount",
  status: "payment_status",
  overdue: "overdue_days",
};

const PAYMENT_STATUS: Record<PaymentStatus, string> = {
  Unpaid: "unpaid",
  Partial: "partial",
  Paid: "paid",
};

/** Server-side paginated invoice list. */
export async function listInvoicesPage(q: TableQuery): Promise<Page<InvoiceView>> {
  let query = sb().from("v_invoice_list").select("*", { count: "exact" });
  if (q.search.trim()) {
    const t = ilikeTerm(q.search);
    query = query.or(
      `invoice_number.ilike.${t},customer_name.ilike.${t},order_code.ilike.${t},site_name.ilike.${t}`,
    );
  }
  const customer = activeFilter(q, "customer");
  if (customer) query = query.eq("customer_id", customer);
  const status = activeFilter(q, "status");
  if (status === "Overdue") query = query.gt("overdue_days", 0);
  else if (status === "Cancelled") query = query.eq("status", "cancelled");
  else if (status === "Draft") query = query.eq("status", "draft");
  else if (status)
    query = query.eq("payment_status", PAYMENT_STATUS[status as PaymentStatus] ?? status);
  const recon = activeFilter(q, "recon");
  if (recon) query = query.eq("recon_status", reconToDb(recon as ReconStatus));
  if (q.from) query = query.gte("invoice_date", q.from);
  if (q.to) query = query.lte("invoice_date", q.to);
  const col = (q.sort && INVOICE_SORT[q.sort.id]) ?? "invoice_date";
  const res = await query
    .order(col as "invoice_date", { ascending: q.sort ? !q.sort.desc : false })
    .order("created_at", { ascending: false })
    .range(q.page * q.pageSize, q.page * q.pageSize + q.pageSize - 1);
  return { rows: rows(res).map((r) => toInvoiceView(r)), total: res.count ?? 0 };
}

export interface InvoiceDetail {
  invoice: InvoiceView;
  payments: PaymentView[];
  trips: TripView[];
  customer: { name: string; gstin: string; billingAddress: string; state: string };
}

export async function getInvoice(id: string): Promise<InvoiceDetail> {
  const row = unwrapMaybe(await sb().from("v_invoice_list").select("*").eq("id", id).maybeSingle());
  if (!row) throw new AppError("Invoice not found.", null, "not_found");
  const [items, header, customer, payments] = await Promise.all([
    sb().from("invoice_items").select("*").eq("invoice_id", id).order("created_at"),
    sb().from("customer_invoices").select("additional_charges_detail").eq("id", id).maybeSingle(),
    sb()
      .from("customers")
      .select("name, gstin, billing_address, state")
      .eq("id", row.customer_id ?? "")
      .maybeSingle(),
    paymentsAgainst(id),
  ]);
  const itemRows = rows(items);
  const tripIds = itemRows.map((i) => i.trip_id).filter((x): x is string => Boolean(x));
  const trips = await fetchTripsIn("id", tripIds);
  const codes = new Map(trips.map((t) => [t.uuid ?? "", t.id]));
  const c = unwrapMaybe(customer);
  return {
    invoice: withCharges(
      toInvoiceView(row, itemRows, codes),
      unwrapMaybe(header)?.additional_charges_detail,
    ),
    payments,
    trips,
    customer: {
      name: c?.name ?? row.customer_name ?? "",
      gstin: c?.gstin ?? "",
      billingAddress: c?.billing_address ?? "",
      state: c?.state ?? "",
    },
  };
}

/** Delivered trips of an order that are not on any live (non-cancelled) invoice yet. */
export async function getInvoiceableTrips(orderId: string): Promise<TripView[]> {
  const trips = (await fetchTrips({ order_id: orderId })).filter(
    (t) => t.delivery && t.status !== "Cancelled",
  );
  const uuids = trips.map((t) => t.uuid ?? "").filter(Boolean);
  if (!uuids.length) return [];
  const items = rows(
    await sb()
      .from("invoice_items")
      .select("trip_id, customer_invoices!inner(status, deleted_at)")
      .in("trip_id", uuids)
      .neq("customer_invoices.status", "cancelled")
      .is("customer_invoices.deleted_at", null),
  );
  const invoiced = new Set(items.map((i) => i.trip_id));
  return trips.filter((t) => !invoiced.has(t.uuid ?? ""));
}

export interface InvoiceInput {
  customerId: string;
  orderId: string;
  date: string;
  /** Trip codes (TripView.id) of confirmed deliveries. */
  tripIds: string[];
  /** "None" turns GST off; otherwise CGST+SGST vs IGST follows the place of supply. */
  gstMode: GstMode;
  additionalCharges: AdditionalCost[];
  notes: string;
  /** Order lines billed directly (e.g. per trip / per bag), not from deliveries. */
  orderLines?: { orderItemId: string; quantity: number; description?: string }[];
  /** false = save as draft. */
  issue?: boolean;
}

export async function createInvoice(
  input: InvoiceInput,
): Promise<{ id: string; number: string; gstMode: GstMode }> {
  let tripUuids: string[] = [];
  if (input.tripIds.length) {
    const found = rows(
      await sb().from("truck_trips").select("id, trip_code").in("trip_code", input.tripIds),
    );
    if (found.length !== input.tripIds.length)
      throw new AppError(
        "Some selected trips were not found. Refresh and try again.",
        null,
        "invalid",
      );
    tripUuids = found.map((t) => t.id);
  }
  const res = unwrap(
    await sb().rpc("create_invoice", {
      p_invoice: {
        order_id: input.orderId,
        customer_id: input.customerId,
        invoice_date: input.date,
        notes: input.notes,
        gst: input.gstMode === "None" ? "none" : "auto",
      },
      p_trip_ids: tripUuids,
      p_lines: (input.orderLines ?? []).map((l) => ({
        order_item_id: l.orderItemId,
        quantity: l.quantity,
        description: l.description ?? null,
      })),
      p_charges: input.additionalCharges
        .filter((c) => c.label && c.amount > 0)
        .map((c) => ({ label: c.label, amount: c.amount })),
      p_issue: input.issue ?? true,
    }),
  ) as { id: string; invoice_number: string; gst_mode: string };
  return {
    id: res.id,
    number: res.invoice_number,
    gstMode: res.gst_mode === "igst" ? "IGST" : res.gst_mode === "none" ? "None" : "CGST+SGST",
  };
}

export async function issueInvoice(id: string): Promise<void> {
  check(await sb().rpc("issue_invoice", { p_invoice_id: id }));
}

/** Cancels an invoice without payments (reason required, audited). Its deliveries become invoiceable again. */
export async function cancelInvoice(id: string, reason: string): Promise<void> {
  check(await sb().rpc("cancel_invoice", { p_invoice_id: id, p_reason: reason }));
}
