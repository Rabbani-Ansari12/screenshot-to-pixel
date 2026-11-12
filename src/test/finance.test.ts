/**
 * Finance services against the fake client (payloads to the finance RPCs, list mapping) and the
 * pure helpers (GST split / place of supply, payment status, bill & invoice mapping).
 * The money rules themselves are enforced and tested in the database (finance_logic.test.sql).
 */
import { afterEach, describe, expect, it } from "vitest";
import { setSupabaseClient } from "@/lib/supabase";
import { gstModeFor, gstStateCode, splitGst } from "@/lib/gst";
import * as bills from "@/services/bills.service";
import * as invoices from "@/services/invoices.service";
import * as payments from "@/services/payments.service";
import * as profit from "@/services/profit.service";
import { toBillView, toInvoiceView } from "@/services/supabase/finance-mappers";
import { defaultTableQuery } from "@/services/supabase/table-query";
import { createFakeSupabase } from "./fake-supabase";
import { FINANCE_TOTALS, ID, TRIP_CODE, fixtureTables } from "./fixtures";

afterEach(() => setSupabaseClient(undefined));

function fake(rpc: Record<string, (args: Record<string, unknown>) => unknown> = {}) {
  const f = createFakeSupabase({ tables: fixtureTables(), userId: ID.owner, rpc });
  setSupabaseClient(f.client);
  return f;
}

describe("GST", () => {
  it("reads the state code from a GSTIN, '27 · Maharashtra' or a state name", () => {
    expect(gstStateCode("29BBBBB0000B1Z5")).toBe("29");
    expect(gstStateCode("27 · Maharashtra")).toBe("27");
    expect(gstStateCode("Karnataka")).toBe("29");
    expect(gstStateCode("")).toBeNull();
  });

  it("same state → CGST + SGST, other state → IGST, unknown → default", () => {
    expect(gstModeFor("27", { gstin: "27AAAAA0000A1Z5" })).toBe("CGST+SGST");
    expect(gstModeFor("27 · Maharashtra", { state: "Karnataka" })).toBe("IGST");
    expect(gstModeFor("27", { gstin: "29BBBBB0000B1Z5", state: "Maharashtra" })).toBe("IGST");
    expect(gstModeFor("27", {}, "IGST")).toBe("IGST");
  });

  it("splits tax into halves that add back to the total (paise)", () => {
    expect(splitGst(2479.5, "CGST+SGST")).toEqual({ cgst: 1239.75, sgst: 1239.75, igst: 0 });
    const odd = splitGst(2562.15, "CGST+SGST");
    expect(odd.cgst + odd.sgst).toBeCloseTo(2562.15, 2);
    expect(splitGst(200, "IGST")).toEqual({ cgst: 0, sgst: 0, igst: 200 });
    expect(splitGst(200, "None")).toEqual({ cgst: 0, sgst: 0, igst: 0 });
  });
});

describe("mapping", () => {
  const tables = fixtureTables();
  it("bill: outstanding, payment status and overdue days come from the row", () => {
    const row = {
      ...(tables["v_bill_list"]![0] as never as Record<string, unknown>),
      paid_amount: 10000,
    };
    const b = toBillView(row as never, [], "2026-12-05");
    expect(b.outstanding).toBeCloseTo(31617.6);
    expect(b.paymentStatus).toBe("Partial");
    expect(b.overdueDays).toBe(10);
    expect(
      toBillView({ ...row, paid_amount: 41617.6 } as never, [], "2026-12-05").paymentStatus,
    ).toBe("Paid");
  });

  it("invoice: lifecycle, GST split and cancelled invoices carry no balance", () => {
    const row = tables["v_invoice_list"]![0] as never as Record<string, unknown>;
    const i = toInvoiceView(row as never);
    expect(i).toMatchObject({
      status: "Issued",
      gstMode: "CGST+SGST",
      cgst: 1281.08,
      sgst: 1281.07,
      paymentStatus: "Partial",
    });
    const c = toInvoiceView({ ...row, status: "cancelled" } as never);
    expect(c).toMatchObject({ status: "Cancelled", balance: 0, overdueDays: 0 });
  });
});

describe("bills", () => {
  it("getBill maps the reconciliation detail to line states with trip codes", async () => {
    fake();
    const d = await bills.getBill(ID.transporterBill);
    expect(d.bill.kind).toBe("Transporter");
    expect(d.lines[0]).toMatchObject({ state: "Rate differs", tripId: TRIP_CODE });
    expect(d.rateBasis).toBe("per_trip");
    expect(d.bill.lines[0]?.tripId).toBe(TRIP_CODE);
  });

  it("decisions go to decide_reconciliation with the bill type and note", async () => {
    const f = fake({ decide_reconciliation: () => "difference_approved" });
    await bills.reconcileBill(ID.transporterBill, "approve_difference", "Waiting charge agreed");
    expect(f.calls.find((c) => c.name === "decide_reconciliation")?.args).toEqual({
      p_bill_type: "transporter_bill",
      p_bill_id: ID.transporterBill,
      p_action: "approve_difference",
      p_note: "Waiting charge agreed",
    });
  });

  it("reconTargetKind tells invoices from bills", async () => {
    fake();
    expect(await bills.reconTargetKind(ID.invoice)).toBe("invoice");
    expect(await bills.reconTargetKind(ID.providerBill)).toBe("bill");
  });

  it("listBillsPage filters by kind on the server", async () => {
    fake();
    const page = await bills.listBillsPage("Provider", defaultTableQuery());
    expect(page.total).toBe(1);
    expect(page.rows[0]?.billNo).toBe("BRS-112");
  });

  it("finance totals come from finance_totals()", async () => {
    fake({ finance_totals: () => FINANCE_TOTALS });
    const t = await bills.getFinanceTotals();
    expect(t).toMatchObject({
      receivable: 33805.15,
      billsNeedingAttention: 1,
      payableTransporter: 6200,
    });
  });
});

describe("invoices", () => {
  it("createInvoice sends trip ids (not codes), charges and GST on/off", async () => {
    const f = fake({
      create_invoice: () => ({ id: "new", invoice_number: "INV-2026-0002", gst_mode: "igst" }),
    });
    const res = await invoices.createInvoice({
      customerId: ID.customer,
      orderId: ID.order,
      date: "2026-11-12",
      tripIds: [TRIP_CODE],
      gstMode: "CGST+SGST",
      additionalCharges: [
        { label: "Unloading", amount: 1000 },
        { label: "", amount: 50 },
      ],
      notes: "",
    });
    expect(res).toEqual({ id: "new", number: "INV-2026-0002", gstMode: "IGST" });
    const args = f.calls.find((c) => c.name === "create_invoice")?.args as Record<string, unknown>;
    expect(args["p_trip_ids"]).toEqual([ID.trip]);
    expect(args["p_charges"]).toEqual([{ label: "Unloading", amount: 1000 }]);
    expect(args["p_invoice"]).toMatchObject({ order_id: ID.order, gst: "auto" });
  });

  it("invoiceable trips exclude deliveries already on a live invoice", async () => {
    fake();
    expect(await invoices.getInvoiceableTrips(ID.order)).toEqual([]);
  });
});

describe("payments", () => {
  it("recordPayment sends one RPC; empty againstId lets the database allocate", async () => {
    const f = fake({ record_payment: () => ({ payment_ids: [ID.payment], on_account: 0 }) });
    const r = await payments.recordPayment({
      direction: "Incoming",
      partyType: "Customer",
      partyId: ID.customer,
      againstId: "",
      date: "2026-11-12",
      amount: 5000,
      mode: "Bank Transfer",
      reference: " NEFT9 ",
      notes: "",
    });
    expect(r).toEqual({ ids: [ID.payment], onAccount: 0, ref: "PAY-2026-0001" });
    expect(f.calls[0]?.args["p"]).toMatchObject({
      party_type: "customer",
      against_id: null,
      mode: "bank_transfer",
      reference: "NEFT9",
      allow_excess: false,
    });
  });

  it("rejects a customer payment marked outgoing before calling the server", async () => {
    const f = fake();
    await expect(
      payments.recordPayment({
        direction: "Outgoing",
        partyType: "Customer",
        partyId: ID.customer,
        againstId: ID.invoice,
        date: "2026-11-12",
        amount: 1,
        mode: "Cash",
        reference: "",
        notes: "",
      }),
    ).rejects.toThrow(/Customers pay us/);
    expect(f.calls).toHaveLength(0);
  });

  it("open documents list the invoice balance computed by the database", async () => {
    fake();
    const docs = await payments.listOpenDocuments("Customer", ID.customer);
    expect(docs).toEqual([
      {
        id: ID.invoice,
        label: "INV-2026-0001",
        date: "2026-11-11",
        total: 53805.15,
        paid: 20000,
        balance: 33805.15,
      },
    ]);
  });

  it("expenses page returns the total of every matching row", async () => {
    fake();
    const page = await payments.listExpensesPage(defaultTableQuery());
    expect(page).toMatchObject({ total: 1, sum: 900 });
    expect(page.rows[0]).toMatchObject({ category: "Unloading", orderRef: "ORD-2026-0101" });
  });
});

describe("profit", () => {
  it("order profit and landed cost come from the views", async () => {
    fake();
    const [orders, landed] = await Promise.all([profit.getOrderProfits(), profit.getLandedCosts()]);
    expect(orders[0]).toMatchObject({
      profit: 3825.4,
      status: "Estimated",
      customerName: "Shivneri Buildcon",
    });
    expect(landed.byMaterial).toHaveLength(1);
    expect(landed.byProvider[0]).toMatchObject({
      label: "Bhima River Sands · River Sand",
      landedCost: 1686.26,
    });
  });
});
