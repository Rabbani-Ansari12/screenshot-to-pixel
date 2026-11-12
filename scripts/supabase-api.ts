/**
 * Database operations over the Supabase Management API (HTTPS) for networks where the
 * Postgres port is blocked and `supabase db push` / `supabase test db` cannot connect.
 * The normal CLI commands remain the primary path; this records the same migration history.
 *
 *   npx tsx scripts/supabase-api.ts status            # applied vs local migrations
 *   npx tsx scripts/supabase-api.ts migrate           # apply pending supabase/migrations/*.sql
 *   npx tsx scripts/supabase-api.ts seed              # run supabase/seed.sql (idempotent)
 *   npx tsx scripts/supabase-api.ts test              # run supabase/tests/database/*.test.sql (rolled back)
 *   npx tsx scripts/supabase-api.ts query "select 1"  # ad-hoc SQL
 *   npx tsx scripts/supabase-api.ts types             # regenerate src/types/database.ts
 *
 * Reads SUPABASE_ACCESS_TOKEN (and optionally SUPABASE_PROJECT_REF) from the environment or from
 * supabase/.env (gitignored); the project ref falls back to the linked project. Never prints the token.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

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

export async function query<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text}`);
  return text ? (JSON.parse(text) as T[]) : [];
}

const MIGRATIONS = "supabase/migrations";
const HISTORY_DDL = `
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text not null primary key);
alter table supabase_migrations.schema_migrations add column if not exists statements text[];
alter table supabase_migrations.schema_migrations add column if not exists name text;`;
const dollar = (s: string) => {
  let tag = "mig";
  while (s.includes(`$${tag}$`)) tag += "x";
  return `$${tag}$${s}$${tag}$`;
};

function localMigrations() {
  return readdirSync(MIGRATIONS)
    .filter((f) => /^\d{14}_.+\.sql$/.test(f))
    .sort()
    .map((file) => ({
      file,
      version: file.slice(0, 14),
      name: file.slice(15, -4),
      sql: readFileSync(join(MIGRATIONS, file), "utf8"),
    }));
}

async function applied(): Promise<Set<string>> {
  await query(HISTORY_DDL);
  const rows = await query<{ version: string }>(
    "select version from supabase_migrations.schema_migrations order by version",
  );
  return new Set(rows.map((r) => r.version));
}

async function status() {
  const done = await applied();
  for (const m of localMigrations())
    console.log(done.has(m.version) ? "applied " : "PENDING ", m.file);
  const local = new Set(localMigrations().map((m) => m.version));
  for (const v of done) if (!local.has(v)) console.log("REMOTE ONLY", v);
}

async function migrate() {
  const done = await applied();
  const pending = localMigrations().filter((m) => !done.has(m.version));
  if (!pending.length) return console.log("Database is up to date.");
  for (const m of pending) {
    // One request = one implicit transaction: the migration and its history row succeed or fail together.
    await query(
      `${m.sql}\n;\ninsert into supabase_migrations.schema_migrations (version, name, statements) values ('${m.version}', '${m.name}', array[${dollar(m.sql)}]);`,
    );
    console.log("applied", m.file);
  }
}

/** Runs pgTAP files inside one transaction that is always rolled back; returns TAP output. */
async function test() {
  const dir = "supabase/tests/database";
  let failed = 0;
  for (const file of readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    let sql = readFileSync(join(dir, file), "utf8");
    sql = sql
      .replace(/^begin;\s*$/m, "")
      .replace(/^rollback;\s*$/m, "")
      .replace(
        /^set local role authenticated;$/gm,
        "select set_config('role', 'authenticated', true);",
      )
      .replace(
        /^set local search_path = (.+);$/gm,
        (_m, p: string) => `select set_config('search_path', '${p}', true);`,
      )
      .replace(/^reset role;$/gm, "select set_config('role', 'postgres', true);")
      .replace(
        /^select (plan|is|isnt|ok|throws_ok|lives_ok|results_eq|has_table|finish)\(/gm,
        "insert into _tap (line) select * from $1(",
      )
      .replace(/^select \* from finish\(\);$/gm, "insert into _tap (line) select * from finish();");
    const wrapped =
      `create temporary table _tap (n serial, line text);\ngrant all on _tap to public;\ngrant all on sequence _tap_n_seq to public;\n${sql}\n` +
      `do $tap$ begin raise exception 'TAP_RESULT%', (select string_agg(line, E'\\n' order by n) from _tap); end $tap$;`;
    let output = "";
    try {
      await query(wrapped);
      output = "No TAP output (unexpected commit?)";
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      // HTTP 400 body: {"message":"Failed to run sql query: ERROR:  P0001: TAP_RESULT<lines>CONTEXT…"}
      let msg = raw;
      const jsonStart = raw.indexOf("{");
      if (jsonStart >= 0) {
        try {
          msg = (JSON.parse(raw.slice(jsonStart)) as { message?: string }).message ?? raw;
        } catch {
          msg = raw;
        }
      }
      const m = msg.match(/TAP_RESULT([\s\S]*?)(?:\nCONTEXT:|$)/);
      output = m ? m[1]! : msg;
    }
    console.log(`# ${file}\n${output}`);
    if (/^not ok|Looks like you failed|ERROR|HTTP \d/m.test(output)) failed++;
  }
  process.exit(failed ? 1 : 0);
}

/** Same output as `supabase gen types typescript --linked`, fetched over HTTPS. */
async function types() {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${ref}/types/typescript?included_schemas=public`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text}`);
  const body = JSON.parse(text) as { types: string };
  writeFileSync("src/types/database.ts", body.types);
  console.log("wrote src/types/database.ts");
}

const [cmd, arg] = process.argv.slice(2);
const run = async () => {
  if (cmd === "status") return status();
  if (cmd === "migrate") return migrate();
  if (cmd === "seed")
    return query(readFileSync("supabase/seed.sql", "utf8")).then(() => console.log("seed applied"));
  if (cmd === "test") return test();
  if (cmd === "query" && arg) return console.log(JSON.stringify(await query(arg), null, 2));
  if (cmd === "types") return types();
  console.error("Usage: status | migrate | seed | test | query <sql> | types");
  process.exit(1);
};
run().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
