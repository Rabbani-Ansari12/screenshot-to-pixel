import type { MonthlyProfitView, ProcessingStatus } from "@/types";
import { DEMO_TODAY, formatINRCompact, formatQty } from "@/lib/format";
import { clone, db, delay } from "./core";
import {
  lookup,
  profitOf,
  toBillView,
  toInvoiceView,
  toTripView,
  tripPurchaseCost,
  tripSalesValue,
} from "./views";
import { getMonthlyProfits } from "./profit.service";

export interface AttentionItem {
  id: string;
  kind: "review" | "bill" | "shortage" | "invoice";
  title: string;
  detail: string;
  status: string;
  href: string;
  action: string;
}

export interface DashboardData {
  monthLabel: string;
  kpis: {
    activeOrders: number;
    purchasedMT: number;
    dispatchedMT: number;
    deliveredMT: number;
    activeTrips: number;
    tripsToVerify: number;
    customerOutstanding: number;
    providerPayable: number;
    transporterPayable: number;
    estimatedProfit: number;
    overdueInvoices: number;
  };
  automation: {
    today: number;
    week: number;
    autoProcessedPct: number;
    awaitingReview: number;
    failed: number;
    duplicates: number;
    breakdown: { status: ProcessingStatus; count: number }[];
    daily: { date: string; automatic: number; review: number; failed: number }[];
  };
  monthly: MonthlyProfitView[];
  materialProfit: { name: string; profit: number }[];
  vehicleDifference: { plate: string; vehicleId: string; avgDifference: number; flagged: number }[];
  topCustomers: { name: string; customerId: string; sales: number }[];
  transporterCost: { name: string; transporterId: string; perMT: number; trips: number }[];
  attention: AttentionItem[];
  insights: { label: string; value: string; detail: string; href: string }[];
}

const MONTH = DEMO_TODAY.slice(0, 7);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const isMT = (materialId: string) => lookup.material(materialId)?.unit === "MT";

// TODO(backend): supabase.rpc("dashboard_summary") — one round trip for all tiles.
export async function getDashboard(): Promise<DashboardData> {
  await delay();
  const trips = db.trips.map(toTripView);
  const invoices = db.invoices.map(toInvoiceView);
  const bills = db.bills.map(toBillView);
  const monthTrips = db.trips.filter((t) => t.loading.at.startsWith(MONTH));
  const monthly = await getMonthlyProfits();

  const processed = db.documents.filter((d) => !["Received", "Processing"].includes(d.status));
  const auto = processed.filter(
    (d) => d.status === "Automatically Recorded" || d.status === "Matched",
  ).length;
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(`${DEMO_TODAY}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - (13 - i));
    return d.toISOString().slice(0, 10);
  });
  const weekStart = days[7] ?? DEMO_TODAY;
  const statuses: ProcessingStatus[] = [
    "Automatically Recorded",
    "Matched",
    "Information Extracted",
    "Processing",
    "Received",
    "Needs Review",
    "Duplicate",
    "Failed",
  ];

  const materialProfit = db.materials
    .map((m) => {
      const ts = db.trips.filter((t) => t.materialId === m.id);
      return {
        name: m.name.replace(" (Granular Sub-base)", "").replace(" (4,000 nos)", ""),
        profit: Math.round(sum(ts.map((t) => tripSalesValue(t) - tripPurchaseCost(t) - t.freight))),
      };
    })
    .filter((m) => m.profit !== 0)
    .sort((a, b) => b.profit - a.profit);

  const vehicleDifference = db.vehicles
    .map((v) => {
      const ts = trips.filter(
        (t) => t.vehicleId === v.id && t.difference !== null && t.unit === "MT",
      );
      return {
        plate: v.plate,
        vehicleId: v.id,
        avgDifference: ts.length
          ? Math.round((sum(ts.map((t) => t.difference ?? 0)) / ts.length) * 100) / 100
          : 0,
        flagged: ts.filter((t) => t.shortageStatus !== "Normal").length,
      };
    })
    .filter((v) => v.avgDifference !== 0)
    .sort((a, b) => b.avgDifference - a.avgDifference)
    .slice(0, 8);

  const topCustomers = db.customers
    .map((c) => ({
      name: c.name,
      customerId: c.id,
      sales: sum(invoices.filter((i) => i.customerId === c.id).map((i) => i.subtotal)),
    }))
    .sort((a, b) => b.sales - a.sales)
    .slice(0, 6);

  const transporterCost = db.transporters
    .map((t) => {
      const ts = db.trips.filter((x) => x.transporterId === t.id && isMT(x.materialId));
      return {
        name: t.name,
        transporterId: t.id,
        perMT: ts.length
          ? Math.round(sum(ts.map((x) => x.freight)) / sum(ts.map((x) => x.loading.net)))
          : 0,
        trips: ts.length,
      };
    })
    .sort((a, b) => a.perMT - b.perMT);

  const attention: AttentionItem[] = [
    ...db.reviewItems
      .filter((r) => r.status === "Open")
      .map((r) => ({
        id: r.id,
        kind: "review" as const,
        title: r.title,
        detail: `${r.reason} · ${r.id}`,
        status: "Needs Review",
        href: `/review/${r.id}`,
        action: "Resolve",
      })),
    ...bills
      .filter((b) => ["Mismatch", "Unreconciled"].includes(b.reconStatus))
      .map((b) => ({
        id: b.id,
        kind: "bill" as const,
        title: `${b.partyName} bill ${b.reconStatus === "Mismatch" ? "differs from records" : "awaits reconciliation"}`,
        detail: `${b.billNo} · ${formatINRCompact(b.total)}`,
        status: b.reconStatus === "Mismatch" ? "Needs Review" : "Pending",
        href: `/reconciliation/${b.id}`,
        action: "Compare",
      })),
    ...trips
      .filter((t) => t.status === "Needs Verification")
      .map((t) => ({
        id: t.id,
        kind: "shortage" as const,
        title: `Delivery short by ${formatQty(t.difference ?? 0, t.unit)}`,
        detail: `${t.id} · ${t.vehiclePlate} · ${t.siteName}`,
        status: "Needs Verification",
        href: `/trips/${t.id}`,
        action: "Investigate",
      })),
    ...invoices
      .filter((i) => i.overdueDays > 15)
      .sort((a, b) => b.overdueDays - a.overdueDays)
      .slice(0, 3)
      .map((i) => ({
        id: i.id,
        kind: "invoice" as const,
        title: `${i.customerName} invoice overdue`,
        detail: `${i.number} · ${formatINRCompact(i.balance)} · ${i.overdueDays} days`,
        status: "Overdue",
        href: `/invoices/${i.id}`,
        action: "View",
      })),
  ];

  const top = topCustomers[0];
  const bestMaterial = materialProfit[0];
  const providerRates = db.providers
    .flatMap((p) =>
      db.materials.map((m) => {
        const ts = db.trips.filter(
          (t) => t.providerId === p.id && t.materialId === m.id && !t.yardId,
        );
        const qty = sum(ts.map((t) => t.loading.net));
        return {
          p,
          m,
          qty,
          landed: qty ? (sum(ts.map(tripPurchaseCost)) + sum(ts.map((t) => t.freight))) / qty : 0,
        };
      }),
    )
    .filter((x) => x.qty > 50 && x.m.unit === "MT");
  const aggregateRates = providerRates
    .filter((x) => x.m.id === "MAT-004")
    .sort((a, b) => a.landed - b.landed);
  const cheapest = aggregateRates[0];
  const recurring = vehicleDifference.filter((v) => v.flagged >= 3);
  const insights = [
    {
      label: "Highest-profit material",
      value: bestMaterial?.name ?? "—",
      detail: `${formatINRCompact(bestMaterial?.profit ?? 0)} gross margin since June`,
      href: "/profit",
    },
    {
      label: "Top customer",
      value: top?.name ?? "—",
      detail: `${formatINRCompact(top?.sales ?? 0)} invoiced (before GST)`,
      href: top ? `/customers/${top.customerId}` : "/customers",
    },
    {
      label: "Lowest landed cost · 20 mm aggregate",
      value: cheapest?.p.name ?? "—",
      detail: cheapest
        ? `₹${Math.round(cheapest.landed).toLocaleString("en-IN")} / MT incl. transport`
        : "",
      href: "/profit",
    },
    {
      label: "Recurring delivery differences",
      value: recurring.length ? recurring.map((v) => v.plate).join(", ") : "None",
      detail: recurring.length
        ? `${sum(recurring.map((v) => v.flagged))} trips above tolerance — worth a check`
        : "No vehicle above tolerance 3+ times",
      href: "/shortages",
    },
  ];

  const deliveredThisMonth = db.trips.filter((t) => t.delivery?.at.startsWith(MONTH));
  const monthExpenses = db.expenses.filter((e) => e.date.startsWith(MONTH));

  return clone({
    monthLabel: "November 2026",
    kpis: {
      activeOrders: db.orders.filter((o) =>
        ["Confirmed", "In Progress", "On Hold"].includes(o.status),
      ).length,
      purchasedMT: Math.round(
        sum(
          db.purchases
            .filter((p) => p.date.startsWith(MONTH) && p.unit === "MT")
            .map((p) => p.quantity),
        ),
      ),
      dispatchedMT: Math.round(
        sum(monthTrips.filter((t) => isMT(t.materialId)).map((t) => t.loading.net)),
      ),
      deliveredMT: Math.round(
        sum(deliveredThisMonth.filter((t) => isMT(t.materialId)).map((t) => t.delivery?.net ?? 0)),
      ),
      activeTrips: db.trips.filter((t) => t.status === "Loaded" || t.status === "In Transit")
        .length,
      tripsToVerify: db.trips.filter((t) => t.status === "Needs Verification").length,
      customerOutstanding: sum(invoices.map((i) => i.balance)),
      providerPayable: sum(bills.filter((b) => b.kind === "Provider").map((b) => b.outstanding)),
      transporterPayable: sum(
        bills.filter((b) => b.kind === "Transporter").map((b) => b.outstanding),
      ),
      estimatedProfit: profitOf(deliveredThisMonth, monthExpenses).profit,
      overdueInvoices: invoices.filter((i) => i.overdueDays > 0).length,
    },
    automation: {
      today: db.documents.filter((d) => d.receivedAt.startsWith(DEMO_TODAY)).length,
      week: db.documents.filter((d) => d.receivedAt.slice(0, 10) >= weekStart).length,
      autoProcessedPct: processed.length ? Math.round((auto / processed.length) * 100) : 0,
      awaitingReview: db.reviewItems.filter((r) => r.status === "Open").length,
      failed: db.documents.filter((d) => d.status === "Failed").length,
      duplicates: db.documents.filter((d) => d.status === "Duplicate").length,
      breakdown: statuses
        .map((status) => ({
          status,
          count: db.documents.filter((d) => d.status === status).length,
        }))
        .filter((s) => s.count > 0),
      daily: days.map((date) => {
        const ds = db.documents.filter((d) => d.receivedAt.startsWith(date));
        return {
          date,
          automatic: ds.filter(
            (d) => d.status === "Automatically Recorded" || d.status === "Matched",
          ).length,
          review: ds.filter(
            (d) =>
              d.status === "Needs Review" ||
              d.status === "Information Extracted" ||
              d.status === "Processing" ||
              d.status === "Received",
          ).length,
          failed: ds.filter((d) => d.status === "Failed" || d.status === "Duplicate").length,
        };
      }),
    },
    monthly,
    materialProfit,
    vehicleDifference,
    topCustomers,
    transporterCost,
    attention,
    insights,
  });
}
