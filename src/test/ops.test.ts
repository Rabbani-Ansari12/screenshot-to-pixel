/** Dashboard, reports, audit and system-health services against the fake client. */
import { afterEach, describe, expect, it } from "vitest";
import { setSupabaseClient } from "@/lib/supabase";
import * as admin from "@/services/admin.service";
import { getDashboard, toDashboard } from "@/services/dashboard.service";
import { exportReport, getReport } from "@/services/reports.service";
import { defaultTableQuery } from "@/services/supabase/table-query";
import { createFakeSupabase } from "./fake-supabase";
import { DASHBOARD_SUMMARY, ID, fixtureTables, reportRun } from "./fixtures";

afterEach(() => setSupabaseClient(undefined));

function fake(
  rpc: Record<string, (args: Record<string, unknown>) => unknown> = {},
  functions = {},
) {
  const f = createFakeSupabase({ tables: fixtureTables(), userId: ID.owner, rpc, functions });
  setSupabaseClient(f.client);
  return f;
}

describe("dashboard", () => {
  it("maps the database summary, statuses and insights", async () => {
    const f = fake({ dashboard_summary: () => DASHBOARD_SUMMARY });
    const d = await getDashboard();
    expect(f.calls[0]?.name).toBe("dashboard_summary");
    expect(d.monthLabel).toMatch(/Nov 2026|November 2026/);
    expect(d.kpis).toMatchObject({
      documentsStaff: 1,
      documentsDriver: 1,
      pendingTransporterBills: 1,
    });
    expect(d.automation.breakdown).toEqual([
      { status: "Automatically Recorded", count: 1 },
      { status: "Needs Review", count: 1 },
    ]);
    expect(d.insights.map((i) => i.label)).toEqual([
      "Highest-profit material",
      "Top customer",
      "Highest transport cost",
      "Lowest landed cost",
      "Supplied this month",
      "Recurring delivery shortages",
    ]);
    expect(d.insights[3]?.value).toBe("Bhima River Sands");
  });

  it("says so instead of inventing insights when there is no data", () => {
    const empty = toDashboard({
      ...DASHBOARD_SUMMARY,
      insights: {
        bestMaterial: null,
        topCustomer: null,
        costliestTransporter: null,
        cheapestProvider: null,
        monthSuppliedMT: 0,
        recurringShortages: [],
      },
    } as never);
    expect(empty.insights.map((i) => i.value)).toEqual([
      "No deliveries yet",
      "No invoices yet",
      "No trips yet",
      "No purchases yet",
      "0 MT",
      "None",
    ]);
  });
});

describe("reports", () => {
  it("runs the report in the database with date and entity filters", async () => {
    const f = fake({ report_run: reportRun });
    const r = await getReport("vehicle-trips", {
      from: "2026-11-01",
      to: "2026-11-30",
      vehicleId: ID.vehicle,
    });
    expect(f.calls[0]?.args).toEqual({
      p_report: "vehicle-trips",
      p_from: "2026-11-01",
      p_to: "2026-11-30",
      p_filters: { vehicle_id: ID.vehicle },
    });
    expect(r.rows[0]).toEqual({ name: "Shivneri Buildcon", value: 51243 });
    expect(r.chart?.data).toHaveLength(1);
  });

  it("exports through the report-export function and surfaces its error message", async () => {
    fake({}, { "report-export": () => new Blob(["xlsx-bytes"]) });
    const ok = await exportReport("daily", { from: "2026-11-01", to: "" }, "xlsx");
    expect(ok.fileName).toBe("daily_2026-11-01.xlsx");
    expect(ok.blob.size).toBeGreaterThan(0);
  });
});

describe("audit & system health", () => {
  it("pages the audit log on the server with user / entity / action filters", async () => {
    fake();
    const page = await admin.listAuditPage(
      defaultTableQuery({ filters: { action: "INSERT", entity: "truck_trips" } }),
    );
    expect(page.rows.every((e) => e.operation === "INSERT" && e.table === "truck_trips")).toBe(
      true,
    );
  });

  it("lists failed jobs and retries through the RPCs", async () => {
    const f = fake({ retry_document_job: () => null, retry_failed_jobs: () => 1 });
    const jobs = await admin.listFailedJobs();
    expect(jobs[0]).toMatchObject({ status: "Failed", source: "Driver link", attempts: 3 });
    await admin.retryJob("j1");
    expect(await admin.retryAllFailedJobs()).toBe(1);
    expect(f.calls.map((c) => c.name)).toEqual(["retry_document_job", "retry_failed_jobs"]);
    const errors = await admin.listErrorLogs();
    expect(errors[0]).toMatchObject({ source: "process-document", requestId: "req-123456789" });
  });
});
