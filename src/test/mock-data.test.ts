import { describe, expect, it } from "vitest";
import { orders, purchases, stockMovements, trips } from "@/data/operations";
import { bills, expenses, invoices, payments } from "@/data/finance";
import { documents, reviewItems, whatsappMessages } from "@/data/documents";
import { auditEvents } from "@/data/admin";

const countBy = <T>(items: T[], key: (item: T) => string) =>
  items.reduce<Record<string, number>>(
    (acc, item) => ({ ...acc, [key(item)]: (acc[key(item)] ?? 0) + 1 }),
    {},
  );

describe("mock data", () => {
  it("has realistic volumes and every status represented", () => {
    const summary = {
      orders: orders.length,
      trips: trips.length,
      purchases: purchases.length,
      bills: bills.length,
      invoices: invoices.length,
      payments: payments.length,
      expenses: expenses.length,
      documents: documents.length,
      review: reviewItems.length,
      messages: whatsappMessages.length,
      audit: auditEvents.length,
      stock: stockMovements.length,
      tripStatus: countBy(trips, (t) => t.status),
      docStatus: countBy(documents, (d) => d.status),
      billStatus: countBy(bills, (b) => b.reconStatus),
      reviewReasons: countBy(reviewItems, (r) => r.reason),
    };
    if (process.env["PRINT_COUNTS"]) expect(summary).toBe("print");
    expect(orders.length).toBeGreaterThanOrEqual(30);
    expect(documents.length).toBeGreaterThanOrEqual(30);
    expect(reviewItems.length).toBeGreaterThanOrEqual(5);
    expect(Object.keys(summary.docStatus).length).toBe(8);
  });

  it("is internally consistent", () => {
    const orderIds = new Set(orders.map((o) => o.id));
    const tripIds = new Set(trips.map((t) => t.id));
    const purchaseIds = new Set(purchases.map((p) => p.id));
    trips.forEach((t) => {
      expect(orderIds.has(t.orderId)).toBe(true);
      if (!t.yardId) expect(purchaseIds.has(t.purchaseId ?? "")).toBe(true);
    });
    bills.forEach((b) =>
      b.lines.forEach((l) => {
        if (l.tripId) expect(tripIds.has(l.tripId)).toBe(true);
      }),
    );
    invoices.forEach((i) => expect(orderIds.has(i.orderId)).toBe(true));
    const docIds = new Set(documents.map((d) => d.id));
    reviewItems.forEach((r) => {
      if (r.documentId) expect(docIds.has(r.documentId)).toBe(true);
    });
    expect(new Set(documents.map((d) => d.id)).size).toBe(documents.length);
    expect(new Set(trips.map((t) => t.id)).size).toBe(trips.length);
  });
});
