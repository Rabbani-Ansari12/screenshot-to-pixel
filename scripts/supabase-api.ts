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
 *
 * Needs SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF in the environment. Never prints the token.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const token = process.env["SUPABASE_ACCESS_TOKEN"];
const ref = process.env["SUPABASE_PROJECT_REF"];
if (!token || !ref) {
  console.error("Set SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF first.");
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
      const msg = e instanceof Error ? e.message : String(e);
      const m = msg.match(/TAP_RESULT([\s\S]*?)(?:"|$)/);
      output = m ? JSON.parse(`"${m[1]}"`) : msg;
    }
    console.log(`# ${file}\n${output}`);
    if (/^not ok|Looks like you failed|ERROR|HTTP \d/m.test(output)) failed++;
  }
  process.exit(failed ? 1 : 0);
}

const [cmd, arg] = process.argv.slice(2);
const run = async () => {
  if (cmd === "status") return status();
  if (cmd === "migrate") return migrate();
  if (cmd === "seed")
    return query(readFileSync("supabase/seed.sql", "utf8")).then(() => console.log("seed applied"));
  if (cmd === "test") return test();
  if (cmd === "query" && arg) return console.log(JSON.stringify(await query(arg), null, 2));
  console.error("Usage: status | migrate | seed | test | query <sql>");
  process.exit(1);
};
run().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
