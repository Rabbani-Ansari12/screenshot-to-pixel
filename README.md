# Meridian Supply

Material supply, transport, delivery and accounts management for a construction-material
supplier in India. Weighbridge slips, bills and photos are read by AI, matched to truck trips
and recorded automatically. People only handle exceptions.

## Stack

- React 19 + TypeScript, TanStack Start / Router, TanStack Query
- Tailwind CSS v4 + shadcn/ui, Recharts, lucide-react
- Supabase (Postgres + Row Level Security, Auth, Storage, Edge Functions)
- Google Gemini (document reading, server-side only)

## Local setup

You need Node 20+, and for a fully local database Docker (used by the Supabase CLI).

### 1. Install

```sh
npm install                     # or: bun install
```

### 2. Database: local (recommended for development)

```sh
npx supabase start              # local Postgres, Auth, Storage, Studio (Docker)
npx supabase db reset           # applies supabase/migrations, then supabase/seed.sql (sample data)
npx supabase status             # prints the local API URL and anon key
```

`db reset` wipes the **local** database only. The seed is development data — never run it
against production.

### 3. Environment variables

```sh
cp .env.example .env.local
```

| File                   | Variable                                         | Value                                                                            |
| ---------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------- |
| `.env.local`           | `VITE_SUPABASE_URL`                              | API URL (`http://127.0.0.1:54321` locally, or `https://<ref>.supabase.co`)       |
| `.env.local`           | `VITE_SUPABASE_ANON_KEY`                         | anon / publishable key (public)                                                  |
| `supabase/.env`        | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`      | for `npm run create-owner` only — never in the frontend                          |
| `supabase/.env`        | `SUPABASE_ACCESS_TOKEN`                          | personal access token, for the CLI / `npm run db:api` against the hosted project |
| `supabase/secrets.env` | `OWNER_EMAIL`, `OWNER_PASSWORD`, `APP_ORIGIN`, … | Edge Function secrets, see `docs/secrets.md`                                     |

All of these files are gitignored. Only `.env.example` and `supabase/secrets.placeholder.env`
(placeholders) are committed.

### 4. First owner and employees

```sh
npm run create-owner            # creates the business, settings and the owner login
```

Sign in as the owner, then add employees under **Employees & Permissions** (invite email,
one-time sign-in link, or temporary password). Public sign-up is disabled.

For local development with the seed you can also create users in Studio
(`http://127.0.0.1:54323`) and set their `app_metadata` to
`{"role":"employee","is_active":true}`.

### 5. Run

```sh
npm run dev                     # http://localhost:5173
```

### Hosted project

```sh
npx supabase link --project-ref <ref>
npm run db:push                 # apply new migrations
npm run db:types                # regenerate src/types/database.ts
npx supabase functions deploy admin-manage-employee --use-api
npx supabase functions deploy process-document --use-api --no-verify-jwt
npx supabase functions deploy driver-upload-info --use-api --no-verify-jwt
npx supabase functions deploy driver-upload --use-api --no-verify-jwt
npx supabase functions deploy notify-digest --use-api --no-verify-jwt
npm run worker:setup            # worker secret + Vault entries for pg_net / pg_cron
```

If your network blocks the Postgres port, the same operations work over HTTPS:
`npm run db:api -- status | migrate | test | types`.

## How data flows

- Pages → `src/hooks/queries.ts` (TanStack Query) → `src/services/*` → Supabase.
- Multi-table writes (order + items, purchase + items, trip + weights, customer + site, vehicle +
  driver, material + rates) are single Postgres functions, so they succeed or fail as a whole.
- Big lists (orders, purchases, trips) are paginated, filtered, sorted and searched on the server.
- The UI hides what a user may not do (`usePermission`, `<Can>`), but **Row Level Security in the
  database is the real enforcement**.
- Corrections to quantities and weights need a reason; the audit log stores old and new values,
  the user and the reason.
- Units are never converted (no MT ↔ volume); the database rejects a unit that differs from the
  material's.

Documents come in through staff upload or a per-trip **driver upload link** (no login, `/u/<token>`,
QR code / share sheet) and are read by Gemini in the
`process-document` Edge Function — see `docs/intake.md` and `docs/ai-pipeline.md`. Clear slips are
recorded on their trip automatically; everything else goes to the Review Queue.

Modules not yet connected (dashboard, bills, reconciliation, invoices, payments, expenses, profit,
reports) still show the built-in sample data from `src/data`, with a notice on the page.

## Scripts

| Command                    | What it does                                                                      |
| -------------------------- | --------------------------------------------------------------------------------- |
| `npm run dev`              | Dev server                                                                        |
| `npm run build`            | Production build (Node server in `.output/`)                                      |
| `npm test`                 | Unit, service, auth-guard and page smoke tests (fake Supabase client, no network) |
| `npm run test:e2e`         | Playwright smoke tests — needs a test project, see `playwright.config.ts`         |
| `npm run lint`             | ESLint + Prettier                                                                 |
| `npm run db:types`         | Regenerate `src/types/database.ts` from the linked Supabase project               |
| `npm run db:push`          | Apply new migrations to the linked Supabase project                               |
| `npm run db:test`          | pgTAP tests (RLS, business rules, RPCs) against the linked project, rolled back   |
| `npm run create-owner`     | Create the first owner account                                                    |
| `npm run db:seed:generate` | Regenerate `supabase/seed.sql` (dev data) from `src/data`                         |
| `npm run db:api -- …`      | DB operations over HTTPS when the Postgres port is blocked                        |

### End-to-end tests

```sh
npx playwright install chromium
E2E_OWNER_EMAIL=… E2E_OWNER_PASSWORD=… \
E2E_EMPLOYEE_EMAIL=… E2E_EMPLOYEE_PASSWORD=… npm run test:e2e
```

Use a local or staging project with the seed loaded and an employee who has only
`view_records` + `manage_trips`. Never point them at production: they create records.

## Project layout

```
src/pages, src/routes     UI pages and file-based routes
src/components            Shared components (DataTable, ProtectedRoute, Can, …)
src/services              Data access (Supabase; src/services/supabase has mappers & helpers)
src/data                  Sample data for modules not yet connected
src/types                 Domain types + generated database types
supabase/migrations       Database schema (the only way to change it)
supabase/functions        Edge Functions (process-document, driver-upload-info, driver-upload,
                          notify-digest, admin-manage-employee, config-check)
supabase/tests            pgTAP tests
e2e/                      Playwright smoke tests
docs/                     Schema (ERD) and secrets documentation
```

See `AGENTS.md` for project rules, `docs/schema.md` for the data model and
`docs/secrets.md` for configuration.
