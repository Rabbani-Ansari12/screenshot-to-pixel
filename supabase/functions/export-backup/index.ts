// Daily export of the business records to the private "backups" bucket, as gzipped JSON:
//   backups/<business_id>/<yyyy-mm-dd>/<table>.json.gz   (kept 30 days)
// An extra copy that does not depend on the database: the owner downloads it from the Supabase
// dashboard (Storage → backups; owner-only read policy). Database backups / PITR are separate
// (see docs/owner-handover.md).
// Called by pg_cron (kick_backup_export) with the x-worker-secret header.
// Deploy: npx supabase functions deploy export-backup --use-api --no-verify-jwt
import { getSecret, secretProblem } from "../_shared/env.ts";
import { SECURITY_HEADERS, logger, requestIdOf } from "../_shared/http.ts";
import { admin, errorSink } from "../_shared/server.ts";

const TABLES = [
  "businesses",
  "app_settings",
  "profiles",
  "employees",
  "user_permissions",
  "customers",
  "construction_sites",
  "materials",
  "material_rates",
  "material_providers",
  "provider_materials",
  "transporters",
  "drivers",
  "vehicles",
  "stock_locations",
  "customer_orders",
  "order_items",
  "purchases",
  "purchase_items",
  "truck_trips",
  "weight_records",
  "delivery_records",
  "stock_movements",
  "documents",
  "ai_processing_records",
  "document_corrections",
  "provider_bills",
  "provider_bill_items",
  "transporter_bills",
  "transporter_bill_trips",
  "customer_invoices",
  "invoice_items",
  "reconciliation_records",
  "payments",
  "expenses",
  "audit_logs",
];
const KEEP_DAYS = 30;
const PAGE = 1000;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...SECURITY_HEADERS, "content-type": "application/json" },
  });

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function gzip(text: string): Promise<Uint8Array> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

Deno.serve(async (req) => {
  const log = logger("export-backup", requestIdOf(req), errorSink);
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  if (
    secretProblem("WORKER_SECRET") ||
    !safeEqual(req.headers.get("x-worker-secret") ?? "", getSecret("WORKER_SECRET"))
  )
    return json({ error: "Unauthorized" }, 401);
  const db = admin();
  const day = new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);
  const { data: businesses, error } = await db.from("businesses").select("id");
  if (error) {
    log("error", "list_businesses_failed", { message: error.message });
    return json({ error: "Could not list businesses." }, 500);
  }
  const summary: Record<string, Record<string, number>> = {};
  for (const { id } of businesses ?? []) {
    const counts: Record<string, number> = {};
    for (const table of TABLES) {
      const rows: unknown[] = [];
      const column = table === "businesses" ? "id" : "business_id";
      for (let from = 0; ; from += PAGE) {
        const { data, error: e } = await db
          .from(table)
          .select("*")
          .eq(column, id)
          .range(from, from + PAGE - 1);
        if (e) {
          log("warn", "table_skipped", { table, message: e.message, businessId: id });
          break;
        }
        rows.push(...(data ?? []));
        if (!data || data.length < PAGE) break;
      }
      const { error: upErr } = await db.storage
        .from("backups")
        .upload(`${id}/${day}/${table}.json.gz`, await gzip(JSON.stringify(rows)), {
          contentType: "application/gzip",
          upsert: true,
        });
      if (upErr) log("error", "upload_failed", { table, message: upErr.message, businessId: id });
      counts[table] = rows.length;
    }
    summary[id] = counts;
    // Retention: remove daily folders older than KEEP_DAYS.
    const cutoff = new Date(Date.now() - KEEP_DAYS * 86_400_000).toISOString().slice(0, 10);
    const { data: folders } = await db.storage.from("backups").list(id, { limit: 1000 });
    for (const f of folders ?? []) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(f.name) || f.name >= cutoff) continue;
      const { data: files } = await db.storage
        .from("backups")
        .list(`${id}/${f.name}`, { limit: 1000 });
      const paths = (files ?? []).map((x) => `${id}/${f.name}/${x.name}`);
      if (paths.length) await db.storage.from("backups").remove(paths);
    }
  }
  log("info", "exported", { day, businesses: Object.keys(summary).length });
  return json({ day, businesses: summary });
});
