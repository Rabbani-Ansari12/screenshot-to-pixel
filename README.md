# Meridian Supply

Material supply, transport, delivery and accounts management for a construction-material
supplier in India. Weighbridge slips, bills and photos arrive on WhatsApp, are read by AI,
matched to truck trips and recorded automatically. People only handle exceptions.

## Stack

- React 19 + TypeScript, TanStack Start / Router, TanStack Query
- Tailwind CSS v4 + shadcn/ui, Recharts, lucide-react
- Supabase (Postgres, Auth, Storage, Edge Functions)
- Google Gemini (document reading), Twilio (WhatsApp)

## Getting started

```sh
bun install                  # or: npm install
cp .env.example .env.local   # fill VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm run dev                  # http://localhost:5173
```

The frontend currently runs on typed mock data behind `src/services/*`. Sign in with any
email and a 4+ character password, and pick the Owner or Employee demo role.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Production build (Node server in `.output/`) |
| `npm test` | Unit and page smoke tests |
| `npm run lint` | ESLint + Prettier |
| `npm run db:types` | Regenerate `src/types/database.ts` from the linked Supabase project |
| `npm run db:push` | Apply new migrations to the linked Supabase project |
| `npm run create-owner` | Create the first owner account (reads `supabase/secrets.env`) |

## Project layout

```
src/pages, src/routes     UI pages and file-based routes
src/components            Shared components (DataTable, StatusBadge, DocumentViewer, ...)
src/services              Data access (mock today, Supabase later)
src/data                  Typed mock data
src/types                 Domain types + generated database types
supabase/migrations       Database schema (the only way to change it)
supabase/functions        Edge Functions
supabase/tests            SQL tests for RLS and business rules
docs/                     Schema (ERD) and secrets documentation
```

See `AGENTS.md` for project rules, `docs/schema.md` for the data model and
`docs/secrets.md` for configuration.
