/**
 * Dashboard: one database call (dashboard_summary) computes every KPI, chart and insight with
 * the signed-in user's permissions (RLS). Nothing large is aggregated in the browser.
 * Insights only use actual records; with no data they say so.
 */
import type { MonthlyProfitView, ProcessingStatus } from "@/types";
import { formatINRCompact, formatMonth, formatNumber } from "@/lib/format";
import { unwrap } from "./supabase/errors";
import { sb } from "./supabase/fetch";
import { num } from "./supabase/mappers";
import { toMonthlyProfitView } from "./supabase/finance-mappers";
import type { Views } from "@/lib/supabase";

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
    documentsReceived: number;
    documentsStaff: number;
    documentsDriver: number;
    autoProcessedPct: number;
    needsAttention: number;
    pendingProviderBills: number;
    pendingTransporterBills: number;
    customerOutstanding: number;
    providerPayable: number;
    transporterPayable: number;
    estimatedProfit: number;
    overdueInvoices: number;
  };
  automation: {
    received: number;
    success: number;
    autoUpdated: number;
    today: number;
    week: number;
    autoProcessedPct: number;
    awaitingReview: number;
    failed: number;
    duplicates: number;
    bySource: { staff: number; driver: number };
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

const STATUS: Record<string, ProcessingStatus> = {
  received: "Received",
  processing: "Processing",
  information_extracted: "Information Extracted",
  matched: "Matched",
  automatically_recorded: "Automatically Recorded",
  needs_review: "Needs Review",
  failed: "Failed",
  duplicate: "Duplicate",
  rejected: "Failed",
};

interface Raw {
  month: string;
  kpis: Record<string, number | string>;
  automation: Record<string, unknown> & {
    bySource: { staff: number; driver: number };
    breakdown: { status: string; count: number }[];
    daily: { date: string; automatic: number; review: number; failed: number }[] | null;
  };
  monthly: Views<"v_monthly_profit">[];
  materialProfit: { name: string; profit: number }[];
  vehicleDifference: { plate: string; vehicleId: string; avgDifference: number; flagged: number }[];
  topCustomers: { name: string; customerId: string; sales: number }[];
  transporterCost: { name: string; transporterId: string; perMT: number | null; trips: number }[];
  attention: AttentionItem[];
  insights: {
    bestMaterial: { name: string; profit: number } | null;
    topCustomer: { name: string; id: string; sales: number } | null;
    costliestTransporter: { name: string; id: string; perMT: number; trips: number } | null;
    cheapestProvider: { name: string; id: string; material: string; landed: number } | null;
    monthSuppliedMT: number | null;
    recurringShortages: { plate: string; vehicleId: string; flagged: number }[];
  };
}

export function toDashboard(raw: Raw): DashboardData {
  const k = (key: string) => num(raw.kpis[key] as number);
  const a = (key: string) => num(raw.automation[key] as number);
  const breakdown = new Map<ProcessingStatus, number>();
  for (const b of raw.automation.breakdown ?? []) {
    const s = STATUS[b.status] ?? "Received";
    breakdown.set(s, (breakdown.get(s) ?? 0) + num(b.count));
  }
  const i = raw.insights;
  const monthLabel = formatMonth(raw.month);
  const recurring = i.recurringShortages ?? [];
  return {
    monthLabel,
    kpis: {
      activeOrders: k("activeOrders"),
      purchasedMT: k("purchasedMT"),
      dispatchedMT: k("dispatchedMT"),
      deliveredMT: k("deliveredMT"),
      activeTrips: k("activeTrips"),
      tripsToVerify: k("tripsToVerify"),
      documentsReceived: k("documentsReceived"),
      documentsStaff: k("documentsStaff"),
      documentsDriver: k("documentsDriver"),
      autoProcessedPct: k("autoProcessedPct"),
      needsAttention: k("needsAttention"),
      pendingProviderBills: k("pendingProviderBills"),
      pendingTransporterBills: k("pendingTransporterBills"),
      customerOutstanding: k("customerOutstanding"),
      providerPayable: k("providerPayable"),
      transporterPayable: k("transporterPayable"),
      estimatedProfit: k("estimatedProfit"),
      overdueInvoices: k("overdueInvoices"),
    },
    automation: {
      received: a("received"),
      success: a("success"),
      autoUpdated: a("autoUpdated"),
      today: a("today"),
      week: a("week"),
      autoProcessedPct: k("autoProcessedPct"),
      awaitingReview: a("awaitingReview"),
      failed: a("failed"),
      duplicates: a("duplicates"),
      bySource: {
        staff: num(raw.automation.bySource?.staff),
        driver: num(raw.automation.bySource?.driver),
      },
      breakdown: [...breakdown.entries()].map(([status, count]) => ({ status, count })),
      daily: (raw.automation.daily ?? []).map((d) => ({
        date: String(d.date),
        automatic: num(d.automatic),
        review: num(d.review),
        failed: num(d.failed),
      })),
    },
    monthly: (raw.monthly ?? []).map(toMonthlyProfitView),
    materialProfit: (raw.materialProfit ?? []).map((m) => ({
      name: m.name,
      profit: num(m.profit),
    })),
    vehicleDifference: (raw.vehicleDifference ?? []).map((v) => ({
      ...v,
      avgDifference: num(v.avgDifference),
      flagged: num(v.flagged),
    })),
    topCustomers: (raw.topCustomers ?? []).map((c) => ({ ...c, sales: num(c.sales) })),
    transporterCost: (raw.transporterCost ?? []).map((t) => ({
      ...t,
      perMT: num(t.perMT),
      trips: num(t.trips),
    })),
    attention: raw.attention ?? [],
    insights: [
      {
        label: "Highest-profit material",
        value: i.bestMaterial?.name ?? "No deliveries yet",
        detail: i.bestMaterial
          ? `${formatINRCompact(num(i.bestMaterial.profit))} gross margin`
          : "",
        href: "/profit",
      },
      {
        label: "Top customer",
        value: i.topCustomer?.name ?? "No invoices yet",
        detail: i.topCustomer
          ? `${formatINRCompact(num(i.topCustomer.sales))} invoiced (before GST)`
          : "",
        href: i.topCustomer ? `/customers/${i.topCustomer.id}` : "/customers",
      },
      {
        label: "Highest transport cost",
        value: i.costliestTransporter?.name ?? "No trips yet",
        detail: i.costliestTransporter
          ? `₹${formatNumber(num(i.costliestTransporter.perMT))} / MT over ${i.costliestTransporter.trips} trips`
          : "",
        href: i.costliestTransporter
          ? `/transporters/${i.costliestTransporter.id}`
          : "/transporters",
      },
      {
        label: "Lowest landed cost",
        value: i.cheapestProvider?.name ?? "No purchases yet",
        detail: i.cheapestProvider
          ? `${i.cheapestProvider.material} · ₹${formatNumber(num(i.cheapestProvider.landed))} / unit incl. transport`
          : "",
        href: "/profit",
      },
      {
        label: "Supplied this month",
        value: `${formatNumber(num(i.monthSuppliedMT))} MT`,
        detail: `Delivered in ${monthLabel}`,
        href: "/trips",
      },
      {
        label: "Recurring delivery shortages",
        value: recurring.length ? recurring.map((v) => v.plate).join(", ") : "None",
        detail: recurring.length
          ? `${recurring.reduce((s, v) => s + num(v.flagged), 0)} trips above tolerance — worth a check`
          : "No vehicle above tolerance 3+ times",
        href: "/shortages",
      },
    ],
  };
}

/** `month` is "yyyy-MM" or "yyyy-MM-dd"; anything else means the current month. */
export async function getDashboard(month?: string): Promise<DashboardData> {
  const valid = typeof month === "string" && /^\d{4}-\d{2}(-\d{2})?$/.test(month);
  const raw = unwrap(
    await sb().rpc(
      "dashboard_summary",
      valid ? { p_month: month.length === 7 ? `${month}-01` : month } : {},
    ),
  ) as unknown as Raw;
  return toDashboard(raw);
}
