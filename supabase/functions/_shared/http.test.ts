import { describe, expect, it, vi } from "vitest";
import {
  HttpError,
  SECURITY_HEADERS,
  appCors,
  context,
  errorResponse,
  logger,
  parseJson,
  redact,
  requestIdOf,
} from "./http.ts";
import {
  ExportRequest,
  fileName,
  formatCell,
  groupIndian,
  pdfSafe,
  periodLabel,
  rawCell,
} from "./report-format.ts";
import { z } from "./zod.ts";

const req = (headers: Record<string, string> = {}, body?: string) =>
  new Request("https://x.supabase.co/functions/v1/f", {
    method: "POST",
    headers,
    ...(body !== undefined ? { body } : {}),
  });

describe("request plumbing", () => {
  it("keeps a safe incoming request id, otherwise makes one", () => {
    expect(requestIdOf(req({ "x-request-id": "abc12345-ok" }))).toBe("abc12345-ok");
    expect(requestIdOf(req({ "x-request-id": "<script>" }))).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("allows CORS only for APP_ORIGIN", () => {
    expect(
      appCors("https://app.example.in", "https://app.example.in/")["Access-Control-Allow-Origin"],
    ).toBe("https://app.example.in");
    expect(
      appCors("https://evil.example", "https://app.example.in")["Access-Control-Allow-Origin"],
    ).toBeUndefined();
    expect(appCors("https://app.example.in", null)["Access-Control-Allow-Origin"]).toBeUndefined();
  });

  it("every response carries security headers and the request id", () => {
    const ctx = context(req({ "x-request-id": "req-12345678" }), null);
    expect(ctx.headers["x-request-id"]).toBe("req-12345678");
    for (const k of Object.keys(SECURITY_HEADERS)) expect(ctx.headers[k]).toBe(SECURITY_HEADERS[k]);
  });

  it("validates JSON bodies with zod and explains the first problem", async () => {
    const schema = z.object({ id: z.string().uuid(), n: z.number().int() });
    await expect(parseJson(req({}, "not json"), schema)).rejects.toMatchObject({ status: 400 });
    await expect(parseJson(req({}, JSON.stringify({ id: "x", n: 1 })), schema)).rejects.toThrow(
      /id: Invalid uuid/,
    );
    await expect(parseJson(req({}, "x".repeat(70_000)), schema)).rejects.toMatchObject({
      status: 413,
    });
    const ok = await parseJson(
      req({}, JSON.stringify({ id: "11111111-1111-4111-8111-111111111111", n: 2 })),
      schema,
    );
    expect(ok.n).toBe(2);
  });

  it("redacts credentials and only sends warnings / errors to the error log", async () => {
    expect(redact({ token: "abc", password: "p", message: "ok" })).toEqual({
      token: "[redacted]",
      password: "[redacted]",
      message: "ok",
    });
    const sink = vi.fn(async () => undefined);
    const log = logger("fn", "req-1", sink);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    log("info", "fine");
    log("error", "broke", { message: "boom", apiKey: "secret" });
    expect(sink).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(sink.mock.calls[0])).not.toContain("secret");
  });

  it("hides unexpected errors but passes HttpError messages", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const ctx = context(req(), null);
    const log = logger("fn", ctx.requestId, null);
    const known = errorResponse(ctx, new HttpError(403, "Owner access required"), log);
    expect(known.status).toBe(403);
    expect((await known.json()).error).toBe("Owner access required");
    const unknown = errorResponse(ctx, new Error("db password=hunter2"), log);
    expect(unknown.status).toBe(500);
    expect(JSON.stringify(await unknown.json())).not.toContain("hunter2");
  });
});

describe("report export formatting", () => {
  it("groups money the Indian way", () => {
    expect(groupIndian(1234567.891)).toBe("12,34,567.89");
    expect(groupIndian(-999)).toBe("-999.00");
    expect(formatCell(51243, "inr")).toBe("₹51,243.00");
    expect(formatCell(51243, "inr", "Rs ")).toBe("Rs 51,243.00");
    expect(formatCell("2026-11-09", "date")).toBe("09 Nov 2026");
    expect(formatCell(7.456, "percent")).toBe("7.5%");
    expect(formatCell(null, "number")).toBe("—");
  });

  it("keeps numbers numeric for Excel", () => {
    expect(rawCell("51243.50", "inr")).toBe(51243.5);
    expect(rawCell("2026-11-09T00:00:00", "date")).toBe("2026-11-09");
  });

  it("validates export requests strictly", () => {
    expect(ExportRequest.safeParse({ report: "order-pl", format: "pdf" }).success).toBe(true);
    expect(ExportRequest.safeParse({ report: "drop table", format: "pdf" }).success).toBe(false);
    expect(ExportRequest.safeParse({ report: "daily", format: "csv" }).success).toBe(false);
    expect(
      ExportRequest.safeParse({ report: "daily", format: "pdf", filters: { vehicle_id: "x" } })
        .success,
    ).toBe(false);
    expect(
      ExportRequest.safeParse({ report: "daily", format: "pdf", filters: { other: "1" } }).success,
    ).toBe(false);
    expect(
      ExportRequest.safeParse({ report: "daily", format: "pdf", from: "12/11/2026" }).success,
    ).toBe(false);
  });

  it("names files and periods, and keeps PDF text in the standard font", () => {
    expect(fileName({ id: "daily", from: "2026-11-01", to: "2026-11-30" }, "xlsx")).toBe(
      "daily_2026-11-01_2026-11-30.xlsx",
    );
    expect(periodLabel({ from: null, to: null })).toBe("All dates");
    expect(pdfSafe("₹1,000 – Shivneri ✓")).toBe("Rs 1,000 - Shivneri ?");
  });
});
