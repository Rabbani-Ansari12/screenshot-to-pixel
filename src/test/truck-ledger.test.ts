import { describe, expect, it } from "vitest";
import type { BillView, TripView } from "@/types";
import { buildTruckLedger, periodStart, truckLedgerTotals } from "@/services/truck-ledger";

const trip = (code: string, over: Partial<TripView> = {}): TripView =>
  ({
    id: code,
    uuid: `u-${code}`,
    status: "Delivered",
    freight: 6000,
    unit: "MT",
    loadedQty: 28,
    deliveredQty: 27.8,
    loading: { at: "2026-11-01T08:00:00+05:30" },
    ...over,
  }) as TripView;

const bill = (id: string, total: number, paid: number, date = "2026-11-10"): BillView =>
  ({ id, billNo: `B-${id}`, total, paid, date }) as BillView;

describe("truck ledger", () => {
  it("works out billed, paid share and what is still owed per trip", () => {
    const trips = [
      trip("T1", { loading: { at: "2026-11-01T08:00:00+05:30" } as TripView["loading"] }),
      trip("T2", { loading: { at: "2026-11-02T08:00:00+05:30" } as TripView["loading"] }),
      trip("T3", { loading: { at: "2026-11-03T08:00:00+05:30" } as TripView["loading"] }),
      trip("T4", { loading: { at: "2026-11-04T08:00:00+05:30" } as TripView["loading"] }),
      trip("T5", {
        status: "Cancelled",
        loading: { at: "2026-11-05T08:00:00+05:30" } as TripView["loading"],
      }),
    ];
    const lines = [
      { tripUuid: "u-T1", billId: "paid", billedAmount: 6000 },
      { tripUuid: "u-T2", billId: "half", billedAmount: 6200 },
      { tripUuid: "u-T3", billId: "open", billedAmount: 5800 },
      // A line for a bill the user cannot see (no finance access) is ignored.
      { tripUuid: "u-T4", billId: "hidden", billedAmount: 9999 },
    ];
    const bills = [bill("paid", 12000, 12000), bill("half", 12400, 6200), bill("open", 5800, 0)];
    const rows = buildTruckLedger(trips, lines, bills);

    expect(rows.map((r) => r.trip.id)).toEqual(["T5", "T4", "T3", "T2", "T1"]);
    const by = Object.fromEntries(rows.map((r) => [r.trip.id, r]));
    expect(by["T1"]).toMatchObject({ freightStatus: "Paid", billed: 6000, paid: 6000, due: 0 });
    expect(by["T2"]).toMatchObject({ freightStatus: "Part paid", paid: 3100, due: 3100 });
    expect(by["T3"]).toMatchObject({ freightStatus: "Unpaid", billNo: "B-open", due: 5800 });
    expect(by["T4"]).toMatchObject({ freightStatus: "Not billed", billed: null, due: 6000 });
    expect(by["T5"]).toMatchObject({ freightStatus: "Cancelled", freight: 0, due: 0 });

    expect(truckLedgerTotals(rows)).toEqual({
      trips: 4,
      deliveredMT: 111.2,
      freight: 24000,
      billed: 18000,
      paid: 9100,
      dueOnBills: 8900,
      notBilled: 6000,
    });
  });

  it("adds up a trip that appears on two bills and shows the latest bill", () => {
    const rows = buildTruckLedger(
      [trip("T1")],
      [
        { tripUuid: "u-T1", billId: "a", billedAmount: 3000 },
        { tripUuid: "u-T1", billId: "b", billedAmount: 3000 },
      ],
      [bill("a", 3000, 3000, "2026-11-05"), bill("b", 3000, 0, "2026-11-12")],
    );
    expect(rows[0]).toMatchObject({
      billId: "b",
      billed: 6000,
      paid: 3000,
      due: 3000,
      freightStatus: "Part paid",
    });
  });

  it("starts periods on the first of the month in IST", () => {
    expect(periodStart("all", "2026-11-16")).toBeNull();
    expect(periodStart("month", "2026-11-16")).toBe("2026-11-01");
    expect(periodStart("3m", "2026-11-16")).toBe("2026-09-01");
    expect(periodStart("3m", "2026-01-31")).toBe("2025-11-01");
  });
});
