// Server-side report export (Excel / PDF) for large reports.
//   POST { report, format: "xlsx" | "pdf", from?, to?, filters? }  (Authorization: user JWT)
// The report is produced by public.report_run with the caller's session, so RLS and the
// view_financial_reports check apply exactly as on the Reports page. Rate limited per user.
// Deploy: npx supabase functions deploy report-export --use-api
import * as XLSX from "npm:xlsx@0.18.5";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "npm:pdf-lib@1.17.1";
import { HttpError, context, errorResponse, logger, parseJson } from "../_shared/http.ts";
import {
  ExportRequest,
  fileName,
  formatCell,
  pdfSafe,
  periodLabel,
  rawCell,
  type ReportResult,
} from "../_shared/report-format.ts";
import { appOrigin, asCaller, errorSink, rateLimit } from "../_shared/server.ts";

function toXlsx(r: ReportResult, businessName: string): Uint8Array {
  const aoa: (string | number | null)[][] = [
    [r.title],
    [
      `${businessName} · ${periodLabel(r)} · generated ${r.generatedAt.slice(0, 16).replace("T", " ")} UTC`,
    ],
    [],
    r.columns.map((c) => c.label),
    ...r.rows.map((row) => r.columns.map((c) => rawCell(row[c.key], c.format))),
    [],
    ...r.summary.map((s) => [s.label, s.value]),
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = r.columns.map((c) => ({ wch: Math.max(12, Math.min(40, c.label.length + 4)) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, r.title.slice(0, 31).replace(/[\\/?*[\]:]/g, " "));
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
}

async function toPdf(r: ReportResult, businessName: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const [W, H] = [842, 595]; // A4 landscape
  const margin = 36;
  const size = 8.5;
  const rowH = 14;
  const usable = W - margin * 2;
  const weights = r.columns.map((c) => (c.format === "text" ? 2 : 1.2));
  const total = weights.reduce((a, b) => a + b, 0);
  const widths = weights.map((w) => (w / total) * usable);
  const fit = (text: string, f: PDFFont, max: number) => {
    let t = pdfSafe(text);
    while (t.length > 1 && f.widthOfTextAtSize(t, size) > max - 4) t = t.slice(0, -2) + ".";
    return t;
  };
  let page: PDFPage = doc.addPage([W, H]);
  let y = H - margin;
  let pageNo = 1;
  const header = () => {
    page.drawText(pdfSafe(r.title), { x: margin, y, size: 14, font: bold });
    y -= 16;
    page.drawText(pdfSafe(`${businessName} · ${periodLabel(r)}`), {
      x: margin,
      y,
      size: 9,
      font,
      color: rgb(0.35, 0.35, 0.35),
    });
    y -= 20;
    let x = margin;
    r.columns.forEach((c, i) => {
      const t = fit(c.label, bold, widths[i]!);
      const right = c.format !== "text" && c.format !== "date";
      page.drawText(t, {
        x: right ? x + widths[i]! - 2 - bold.widthOfTextAtSize(t, size) : x + 2,
        y,
        size,
        font: bold,
      });
      x += widths[i]!;
    });
    y -= 4;
    page.drawLine({ start: { x: margin, y }, end: { x: W - margin, y }, thickness: 0.7 });
    y -= rowH - 3;
  };
  const footer = () =>
    page.drawText(`Page ${pageNo}`, {
      x: W - margin - 40,
      y: margin / 2,
      size: 8,
      font,
      color: rgb(0.5, 0.5, 0.5),
    });
  header();
  for (const row of r.rows) {
    if (y < margin + rowH) {
      footer();
      page = doc.addPage([W, H]);
      pageNo++;
      y = H - margin;
      header();
    }
    let x = margin;
    r.columns.forEach((c, i) => {
      const t = fit(formatCell(row[c.key], c.format, "Rs "), font, widths[i]!);
      const right = c.format !== "text" && c.format !== "date";
      page.drawText(t, {
        x: right ? x + widths[i]! - 2 - font.widthOfTextAtSize(t, size) : x + 2,
        y,
        size,
        font,
      });
      x += widths[i]!;
    });
    y -= rowH;
  }
  y -= 6;
  for (const s of r.summary) {
    if (y < margin + rowH) {
      footer();
      page = doc.addPage([W, H]);
      pageNo++;
      y = H - margin;
    }
    page.drawText(pdfSafe(`${s.label}: ${formatCell(s.value, s.format, "Rs ")}`), {
      x: margin,
      y,
      size: 9.5,
      font: bold,
    });
    y -= rowH;
  }
  footer();
  return await doc.save();
}

Deno.serve(async (req) => {
  const ctx = context(req, appOrigin());
  const log = logger("report-export", ctx.requestId, errorSink);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: ctx.headers });
  try {
    if (req.method !== "POST") throw new HttpError(405, "Use POST.");
    const db = asCaller(req);
    const { data: user, error: authError } = await db.auth.getUser();
    if (authError || !user.user) throw new HttpError(401, "Sign in first.");
    if (!(await rateLimit(`report:${user.user.id}`, 60)))
      throw new HttpError(429, "Too many exports. Please wait a few minutes.");
    const body = await parseJson(req, ExportRequest);
    const { data, error } = await db.rpc("report_run", {
      p_report: body.report,
      p_from: body.from ?? null,
      p_to: body.to ?? null,
      p_filters: body.filters,
    });
    if (error) throw new HttpError(error.code === "42501" ? 403 : 400, error.message);
    const report = data as ReportResult;
    const { data: biz } = await db.from("businesses").select("name").maybeSingle();
    const businessName = (biz?.name as string | undefined) ?? "Business";
    const bytes =
      body.format === "xlsx" ? toXlsx(report, businessName) : await toPdf(report, businessName);
    log("info", "exported", { report: body.report, format: body.format, rows: report.rows.length });
    return new Response(bytes, {
      headers: {
        ...ctx.headers,
        "content-type": "application/octet-stream",
        "content-disposition": `attachment; filename="${fileName(report, body.format)}"`,
      },
    });
  } catch (e) {
    return errorResponse(ctx, e, log);
  }
});
