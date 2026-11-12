# Owner handover

Everything the owner needs to run the system without the developer: where things live, how to
get at the data, routine tasks, backups and restore, environments, and how to cut off the access
used during development.

## 1. What you own

| Piece | Where | What it holds |
|---|---|---|
| Supabase project **LoadLedger** (`lvkvfikhaeiblakwvegd`, region ap-southeast-2) | supabase.com → your organisation | Database, user accounts, document files, Edge Functions, scheduled jobs, secrets |
| Source code | GitHub repository (move it to an account or organisation you own — see §7) | App, database migrations, functions, tests, these docs |
| Web hosting | Vercel (or Netlify) under your account | The app people open in the browser |
| Google AI Studio key | aistudio.google.com under your Google account | Reads slips and bills (`GEMINI_API_KEY`) |
| Optional: Resend, Cloudflare Turnstile | your accounts | Daily e-mail digest, bot check on the driver page |

The app's owner login is created with `npm run create-owner` (reads `OWNER_EMAIL` / `OWNER_PASSWORD`
from `supabase/secrets.env`). The owner has every permission and is the only one who sees Audit
History, System Health, Employees and Settings.

## 2. Getting at your data (no developer needed)

- **In the app** — every list has *Export CSV*; Reports export **Excel** and **PDF** (built on the
  server, so large reports work); invoices print / save as PDF.
- **Daily backup files** — every night at 02:30 IST the `export-backup` function writes every
  business table as gzipped JSON to Storage → bucket **backups** →
  `<business id>/<yyyy-mm-dd>/<table>.json.gz` (kept 30 days). Download them from the Supabase
  dashboard (Storage → backups). Only the owner can read this bucket.
- **Documents (photos, PDFs)** — Storage → bucket **documents** (`<business id>/<yyyy>/<mm>/…`,
  previews end in `.thumb.jpg`). Originals are never changed or deleted automatically; they are
  the evidence behind every recorded weight and bill.
- **The whole database** — Supabase dashboard → Database → Backups (see §4), or with the CLI and
  your database password: `npx supabase db dump --db-url "<connection string>" -f backup.sql`
  (connection string: dashboard → Connect).
- **Read-only browsing** — dashboard → Table Editor. Do not change the schema there: every schema
  change is a migration file (see `AGENTS.md`).

## 3. Routine tasks

| Task | Where |
|---|---|
| Add / deactivate employees, set permissions, reset passwords | App → Employees & Permissions |
| Business details, GST, invoice numbering, bank details on invoices | App → Settings |
| Payment rules (oldest-first, advances), match tolerance | App → Settings → Payments & reconciliation |
| AI daily limit (warning at 80 %, stop at 100 %) | App → Settings → AI; usage on System Health |
| Driver link expiry, upload limits | App → Settings → Driver upload links |
| Failed documents: see why, retry one or all | App → System Health |
| Errors from the server or the app (with request ids) | App → System Health → Error log (kept 90 days) |
| Who changed what (read-only, cannot be edited by anyone) | App → Audit History (click a row for the full before / after) |
| Yard stock corrections after a physical count | App → Stock Ledger → Adjust stock (reason required) |
| Rotate the document worker secret | `npm run worker:setup` |
| Change an API key (Gemini, Resend, Turnstile) | edit `supabase/secrets.env`, then `npx supabase secrets set --env-file supabase/secrets.env` |

Scheduled jobs (pg_cron, visible in dashboard → Integrations → Cron): `process-documents` every
minute, `notify-digest` 18:00 IST (only if switched on), `housekeeping` 02:00 IST (removes driver
links 30 days after they expired or were revoked, rate-limit counters older than 2 days, error
log entries older than 90 days — never documents or business records), `backup-export` 02:30 IST.

## 4. Backups and restore

**Current state (checked 12 Nov 2026):** point-in-time recovery (PITR) is **off** and the project
has no platform backups listed. Until that changes, the nightly JSON export (§2) is the only copy
outside the live database.

**To do (owner, in the Supabase dashboard — billing is on your account):**

1. Organisation → Billing: move the organisation to the **Pro** plan (daily backups, 7-day
   retention).
2. Project → Database → Backups → enable **Point in Time Recovery** (add-on; restore to any second
   in the retention window). Recommended for production.
3. Optional: Storage has no automatic versioning — the documents bucket is protected by policy
   (no updates, only the owner may delete); keep the nightly export for records.

**Restore procedures**

- *Whole database, platform backup / PITR*: dashboard → Database → Backups → choose the backup or
  time → Restore. The project is unavailable for a few minutes; files in Storage are not affected.
  Afterwards open the app, check the latest orders / trips, then run `npm run db:api -- test`
  (database tests, rolled back) to confirm the rules are intact.
- *A few records from the nightly export*: download the day's `<table>.json.gz`, unzip, find the
  rows, and re-enter them through the app (so the audit log records who restored what). For a
  bulk restore ask a developer to load them into a scratch table first; never delete live data
  without a backup taken the same day.
- *Practice*: once a quarter restore the latest platform backup into a **new** project (dashboard
  → Database → Backups → Restore to new project) and open the app against it.

## 5. Environments and deployment

| Environment | Supabase project | Web | Deployed by |
|---|---|---|---|
| Local | `npx supabase start` (Docker) — throw-away | `npm run dev` | the developer |
| Staging | a second project you create (e.g. *LoadLedger Staging*), no real customer data | Vercel preview | push to branch `staging` |
| Production | LoadLedger | Vercel production | push to branch `main` (after approval) |

To create staging: new Supabase project → `npx supabase link --project-ref <ref>` →
`npx supabase db push` → `npx supabase functions deploy <each function>` → set its secrets
(`supabase secrets set --env-file …`) → `npm run worker:setup` → `npm run create-owner` with test
credentials.

GitHub Actions (`.github/workflows`):

- **CI** (every push / pull request): typecheck, lint, unit tests, build + check that no secret is
  in the browser bundle, Edge Function typecheck, all migrations + SQL tests on a local Supabase,
  and the Playwright smoke test. It never touches staging or production.
- **Deploy** (push to `staging` / `main`): migrations, Edge Functions, web app. It stays **off**
  until you set the repository variable `DEPLOY_ENABLED=true` and create the GitHub environments
  `staging` and `production` with the secrets listed at the top of `deploy.yml`. Add *required
  reviewers* to `production`.

## 6. Security notes

- Every table has row-level security; employees only see what their permissions allow; money is
  hidden without *view financial reports*. Tests in `supabase/tests/database` prove this and run in
  CI.
- The browser only ever has the public URL and anon / publishable key. Service-role key, Gemini
  key, worker secret and others live only in Supabase function secrets / Vault.
- Edge Functions answer browsers only from `APP_ORIGIN` (set it to the real app URL when hosting),
  add security headers and a request id to every response, validate input, and rate-limit.
- Document links shown in the app expire after 5 minutes.
- The audit log cannot be changed or deleted by anyone, including the owner (database trigger +
  revoked privileges; tested).

## 7. Removing the developer's access (do this when the build is accepted)

1. **Supabase access token used during development** — dashboard → Account → Access Tokens →
   revoke the developer's token. If CI deploys are on, create a new token **under your own
   account** and put it in the GitHub environments as `SUPABASE_ACCESS_TOKEN`. On the developer's
   machine the token lives in `supabase/.env` (never committed) — ask for it to be deleted.
2. **Supabase organisation members** — Organisation → Team: remove developer accounts, or reduce
   them to *Read-only*.
3. **Database password** — Project → Database → Settings → Reset database password (anything that
   connected directly, e.g. CI secrets, must get the new one).
4. **API keys** — Project → Settings → API Keys: create new secret / publishable keys (or rotate
   the JWT secret on legacy keys), update `VITE_SUPABASE_ANON_KEY` in hosting, delete the old ones.
5. **Function secrets** — rotate `WORKER_SECRET` (`npm run worker:setup`), and create a new Gemini
   key in your Google account, then `npx supabase secrets set GEMINI_API_KEY=…` and delete the old
   key in Google AI Studio.
6. **App accounts** — App → Employees: deactivate any developer or test logins.
7. **GitHub / Vercel** — transfer the repository to your account or organisation (Settings →
   Transfer), make it **private**, remove collaborators; same for the Vercel project.

After these steps nobody but you can reach the data, deploy, or read the secrets.
