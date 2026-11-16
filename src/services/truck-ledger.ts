/**
 * Truck ledger: every trip of one vehicle with its freight, the transporter bill line it was
 * billed on and how much of that bill is paid. Pure functions so they can be tested without a
 * database. Payments are recorded against whole bills, so a trip's paid amount is its share of
 * the bill (bill paid ÷ bill total × billed for the trip).
 */
import type { BillView, FreightStatus, TripView, TruckLedgerRow, TruckLedgerTotals } from "@/types";
import { todayIST } from "@/lib/format";

export interface LedgerBillLine {
  /** Database id of the trip the bill line was matched to. */
  tripUuid: string;
  billId: string;
  billedAmount: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function buildTruckLedger(
  trips: TripView[],
  lines: LedgerBillLine[],
  bills: BillView[],
): TruckLedgerRow[] {
  const billsById = new Map(bills.map((b) => [b.id, b]));
  const linesByTrip = new Map<string, LedgerBillLine[]>();
  for (const l of lines) {
    const list = linesByTrip.get(l.tripUuid) ?? [];
    list.push(l);
    linesByTrip.set(l.tripUuid, list);
  }
  return [...trips]
    .sort((a, b) => (b.loading.at ?? "").localeCompare(a.loading.at ?? ""))
    .map((trip) => {
      const cancelled = trip.status === "Cancelled";
      const freight = cancelled ? 0 : trip.freight;
      // A trip is normally on one transporter bill; if it shows up on more (a re-billed trip),
      // the amounts add up and the latest bill is the one shown.
      const tripLines = (trip.uuid ? linesByTrip.get(trip.uuid) : undefined) ?? [];
      const billed = tripLines.filter((l) => billsById.has(l.billId));
      if (!billed.length) {
        return {
          trip,
          freight,
          billId: null,
          billNo: null,
          billed: null,
          paid: 0,
          due: cancelled ? 0 : freight,
          freightStatus: (cancelled ? "Cancelled" : "Not billed") as FreightStatus,
        };
      }
      let amount = 0;
      let paid = 0;
      for (const l of billed) {
        const bill = billsById.get(l.billId)!;
        const share = bill.total > 0 ? Math.min(1, bill.paid / bill.total) : 0;
        amount += l.billedAmount;
        paid += l.billedAmount * share;
      }
      const latest = billed
        .map((l) => billsById.get(l.billId)!)
        .sort((a, b) => b.date.localeCompare(a.date))[0]!;
      amount = r2(amount);
      paid = r2(paid);
      const due = r2(Math.max(0, amount - paid));
      const freightStatus: FreightStatus = due <= 0.5 ? "Paid" : paid > 0 ? "Part paid" : "Unpaid";
      return {
        trip,
        freight,
        billId: latest.id,
        billNo: latest.billNo,
        billed: amount,
        paid,
        due,
        freightStatus,
      };
    });
}

export function truckLedgerTotals(rows: TruckLedgerRow[]): TruckLedgerTotals {
  const live = rows.filter((r) => r.freightStatus !== "Cancelled");
  const sum = (f: (r: TruckLedgerRow) => number) => r2(live.reduce((s, r) => s + f(r), 0));
  return {
    trips: live.length,
    deliveredMT: sum((r) => (r.trip.unit === "MT" ? (r.trip.deliveredQty ?? 0) : 0)),
    freight: sum((r) => r.freight),
    billed: sum((r) => r.billed ?? 0),
    paid: sum((r) => r.paid),
    dueOnBills: sum((r) => (r.billed === null ? 0 : r.due)),
    notBilled: sum((r) => (r.billed === null ? r.due : 0)),
  };
}

export type LedgerPeriod = "month" | "3m" | "all";

/** First day (yyyy-MM-dd, IST) of the period, or null for all time. */
export function periodStart(period: LedgerPeriod, today = todayIST()): string | null {
  if (period === "all") return null;
  const [y, m] = today.split("-").map(Number) as [number, number];
  const back = period === "month" ? 0 : 2;
  return new Date(Date.UTC(y, m - 1 - back, 1)).toISOString().slice(0, 10);
}
