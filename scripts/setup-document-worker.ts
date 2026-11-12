/**
 * One-time (or rotation) setup for the document worker:
 *   - generates a random WORKER_SECRET,
 *   - stores it as an Edge Function secret (process-document checks the x-worker-secret header),
 *   - stores the same value and the worker URL in Supabase Vault, where pg_net / pg_cron read them.
 * The secret is never printed or written to disk.
 *
 *   npm run worker:setup
 *
 * Needs SUPABASE_ACCESS_TOKEN (environment or supabase/.env) and the linked project ref.
 */
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

function envFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#") && l.includes("="))
      .map((l) => [
        l.slice(0, l.indexOf("=")).trim(),
        l
          .slice(l.indexOf("=") + 1)
          .trim()
          .replace(/^["']|["']$/g, ""),
      ]),
  );
}

const fileEnv = envFile("supabase/.env");
const token = process.env["SUPABASE_ACCESS_TOKEN"] ?? fileEnv["SUPABASE_ACCESS_TOKEN"];
const ref =
  process.env["SUPABASE_PROJECT_REF"] ??
  fileEnv["SUPABASE_PROJECT_REF"] ??
  (existsSync("supabase/.temp/project-ref")
    ? readFileSync("supabase/.temp/project-ref", "utf8").trim()
    : undefined);
if (!token || !ref) {
  console.error(
    "Set SUPABASE_ACCESS_TOKEN (environment or supabase/.env) and link the project first.",
  );
  process.exit(1);
}

const api = async (path: string, init: RequestInit) => {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status} ${text.slice(0, 200)}`);
  return text;
};

const sqlString = (s: string) => `'${s.replace(/'/g, "''")}'`;

async function main() {
  const secret = randomBytes(32).toString("hex");
  const url = `https://${ref}.supabase.co/functions/v1/process-document`;

  await api("/secrets", {
    method: "POST",
    body: JSON.stringify([{ name: "WORKER_SECRET", value: secret }]),
  });
  console.log("✓ Edge Function secret WORKER_SECRET set");

  const upsert = (name: string, value: string) => `
    do $$
    declare v_id uuid;
    begin
      select id into v_id from vault.secrets where name = ${sqlString(name)};
      if v_id is null then
        perform vault.create_secret(${sqlString(value)}, ${sqlString(name)});
      else
        perform vault.update_secret(v_id, ${sqlString(value)});
      end if;
    end $$;`;
  await api("/database/query", {
    method: "POST",
    body: JSON.stringify({
      query:
        upsert("document_worker_secret", secret) +
        upsert("process_document_url", url) +
        upsert("notify_digest_url", `https://${ref}.supabase.co/functions/v1/notify-digest`) +
        upsert("export_backup_url", `https://${ref}.supabase.co/functions/v1/export-backup`),
    }),
  });
  console.log(
    "✓ Vault secrets document_worker_secret, process_document_url, notify_digest_url and export_backup_url set",
  );

  const check = JSON.parse(
    await api("/database/query", {
      method: "POST",
      body: JSON.stringify({
        query:
          "select (select count(*) from vault.decrypted_secrets where name in ('document_worker_secret','process_document_url','notify_digest_url','export_backup_url')) as vault_entries, " +
          "(select count(*) from cron.job where jobname in ('process-documents','notify-digest')) as cron_jobs",
      }),
    }),
  ) as { vault_entries: number; cron_jobs: number }[];
  console.log(
    `✓ check: ${check[0]?.vault_entries ?? 0}/3 vault entries, ${check[0]?.cron_jobs ?? 0}/2 cron jobs`,
  );
}

main().catch((e) => {
  console.error("worker setup failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
