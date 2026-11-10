import type { AdditionalCost, GstMode, Invoice, InvoiceView, PaymentView, TripView } from "@/types";
import { NotFoundError, clone, db, delay, logAudit, nowIso } from "./core";
import { lookup, toInvoiceView, toPaymentView, toTripView } from "./views";

// TODO(backend): supabase.from("invoices_view").select("*")
export async function listInvoices(): Promise<InvoiceView[]> {
  await delay();
  return clone(db.invoices.map(toInvoiceView).reverse());
}

export async function getInvoice(id: string): Promise<{
  invoice: InvoiceView;
  payments: PaymentView[];
  trips: TripView[];
  customer: { name: string; gstin: string; billingAddress: string; state: string };
}> {
  await delay();
  const inv = db.invoices.find((i) => i.id === id);
  if (!inv) throw new NotFoundError(`Invoice ${id}`);
  const customer = lookup.customer(inv.customerId);
  const tripIds = [...new Set(inv.lines.flatMap((l) => l.tripIds))];
  return clone({
    invoice: toInvoiceView(inv),
    payments: db.payments
      .filter((p) => p.againstType === "Invoice" && p.againstId === id)
      .map(toPaymentView),
    trips: tripIds
      .map((t) => lookup.trip(t))
      .filter((t): t is NonNullable<typeof t> => Boolean(t))
      .map(toTripView),
    customer: {
      name: customer?.name ?? "",
      gstin: customer?.gstin ?? "",
      billingAddress: customer?.billingAddress ?? "",
      state: customer?.state ?? "",
    },
  });
}

/** Delivered trips of an order that are not on any invoice yet. */
export async function getInvoiceableTrips(orderId: string): Promise<TripView[]> {
  await delay(200);
  const invoiced = new Set(db.invoices.flatMap((i) => i.lines.flatMap((l) => l.tripIds)));
  return clone(
    db.trips
      .filter((t) => t.orderId === orderId && t.delivery && !invoiced.has(t.id))
      .map(toTripView),
  );
}

export interface InvoiceInput {
  customerId: string;
  orderId: string;
  date: string;
  tripIds: string[];
  gstMode: GstMode;
  additionalCharges: AdditionalCost[];
  notes: string;
}

// TODO(backend): supabase.rpc("create_invoice_from_trips", {...}) so numbering is atomic.
export async function createInvoice(input: InvoiceInput): Promise<Invoice> {
  await delay(500);
  const order = lookup.order(input.orderId);
  if (!order) throw new NotFoundError(`Order ${input.orderId}`);
  const customer = lookup.customer(input.customerId);
  const trips = input.tripIds
    .map((t) => lookup.trip(t))
    .filter((t): t is NonNullable<typeof t> => Boolean(t));
  const byMaterial = new Map<string, typeof trips>();
  trips.forEach((t) => byMaterial.set(t.materialId, [...(byMaterial.get(t.materialId) ?? []), t]));
  const seq = db.settings.invoiceNumbering.nextNumber++;
  const number = `${db.settings.invoiceNumbering.prefix}-2026-${String(seq).padStart(4, "0")}`;
  const due = new Date(`${input.date}T00:00:00Z`);
  due.setUTCDate(due.getUTCDate() + (customer?.creditDays ?? 30));
  const invoice: Invoice = {
    id: number,
    number,
    customerId: input.customerId,
    orderId: input.orderId,
    siteId: order.siteId,
    date: input.date,
    dueDate: due.toISOString().slice(0, 10),
    gstMode: input.gstMode,
    additionalCharges: input.additionalCharges,
    flags: [],
    reconStatus: "Matched",
    notes: input.notes,
    lines: [...byMaterial.entries()].map(([materialId, ts], i) => {
      const m = lookup.material(materialId);
      return {
        id: `L${i + 1}`,
        materialId,
        description: `${m?.name ?? materialId} · ${ts.length} trip${ts.length > 1 ? "s" : ""}`,
        tripIds: ts.map((t) => t.id),
        quantity: Math.round(ts.reduce((s, t) => s + (t.delivery?.net ?? 0), 0) * 100) / 100,
        unit: m?.unit ?? "MT",
        rate:
          order.items.find((it) => it.materialId === materialId)?.sellingRate ??
          m?.sellingRate ??
          0,
        gstRate: m?.gstRate ?? 5,
      };
    }),
  };
  db.invoices.push(invoice);
  logAudit({
    action: "Created",
    entityType: "Invoice",
    entityId: number,
    entityLabel: number,
    changes: [{ field: "Trips", from: "—", to: String(trips.length) }],
    note: `Created ${nowIso().slice(0, 10)} from confirmed deliveries`,
  });
  return clone(invoice);
}
