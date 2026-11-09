# Construction Supply Management App

## Goal
Replace the starter screen with a complete, responsive frontend for an India-based construction-material supplier. Use realistic typed mock data and async services only; do not add a backend, real authentication, WhatsApp connection, or AI processing.

## Build
- Create a cohesive light/dark visual system, responsive navigation, role switcher, global search, notifications, and app-wide feedback states.
- Add typed entities, realistic connected mock records, and async service functions for dashboard, automation, operations, finance, masters, reports, audit, employees, and settings.
- Implement every route listed in the brief, with shared searchable/filterable/sortable/paginated tables and responsive mobile alternatives.
- Make high-priority workflows usable: review exceptions, inspect documents, record corrections, examine trip weights and shortages, reconcile bills without changing records, create invoices, record payments, and configure demo settings.
- Use Indian rupee/date/time formatting and mock role-based visibility; include login and password-reset demo screens.

## Technical details
- Preserve TanStack Start file-based routing and the existing Query integration rather than replacing the framework requested in the uploaded brief.
- Keep business types under `src/types`, fixtures under `src/data`, and async access under `src/services`; pages consume services, not fixtures directly.
- Add reusable navigation, status, KPI, data-list, detail, comparison, timeline, and form components; use existing shadcn controls, Recharts, and lucide-react.
- Add content-route metadata and focused tests for key formatting and quantity/tolerance rules. Record the structural approach in `AGENTS.md`.

## Validation
- Run relevant tests, inspect current build diagnostics, and exercise the dashboard and a core review/reconciliation interaction in the preview.
