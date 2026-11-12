# Finance logic

Bills, three-way reconciliation, invoicing, payments, expenses, stock and profit. All money
rules live in Postgres (migrations `20261111120000_finance_logic.sql` and
`20261111130000_finance_views_fix.sql`); the frontend only calls RPCs and reads views.

**Ground rules (enforced in the database)**

- Reconciliation records figures and a person's decision. It never changes trips, weights or
  purchases to force a match.
- The AI (service role) may *record* a bill read from a document. It can never approve a
  difference (`decide_reconciliation` refuses callers without a user) or record a payment
  (`record_payment` refuses the same).
- Customer cash received is never profit.
- Every decision, payment, cancellation and stock adjustment is audited, with the note or reason
  stored in `audit_logs.reason`.

## 1. Bills from documents

Bills come in through staff upload (or a driver link with doc type "other") and go through the
same pipeline as slips (`process-document`): classify → extract → normalise → validate → decide.

| Step | Where | What happens |
|---|---|---|
| Extract | `_shared/prompts/bills.ts`, registry in `_shared/extractors.ts` | Gemini structured output. Provider bill: bill number/date, provider name + GSTIN, material, quantity, unit, rate, totals, line items, additional charges, tax (CGST/SGST/IGST). Transporter bill: number/date, transporter, period, vehicle numbers, trip lines (date, vehicle, quantity, rate, amount), number of trips, quantity, rate, rate basis, totals, charges, tax. Every field is `{value \| null, confidence, legible}`; the prompt forbids guessing or calculating. |
| Normalise | `_shared/bills.ts` `normalizeBill` | Dates day-first → `yyyy-MM-dd`; numbers without ₹/commas; units to our units (KG is **not** converted, it becomes null + warning); GSTIN validated; empty table rows dropped. Unreadable values stay null and are listed in `warnings`. The original model output is kept in `ai_extractions.raw_response`. |
| Validate | `validateBill` | Essentials (bill number, date, total, party name or GSTIN); lowest confidence of essential fields; lines + charges + tax must equal the printed total (± ₹1 or 0.5%); transporter bills need trip-wise lines and a matching trip count. |
| Party | `resolveParty` | Exact GSTIN first, then a clearly best name match (never picks between close names). |
| Decide | `decideBill` | Clear → `record_bill`; otherwise the review queue with a reason: `missing_essential_info`, `no_match`, `multiple_possible_matches`, `low_confidence` or `financial_discrepancy`. |
| Record | `apply_document_decision` → `create_bill_from_document` | Duplicate check: same party + bill number (letters/digits only) + same amount → document marked **Duplicate**; same number but a different amount → review (`financial_discrepancy`). Otherwise the bill is inserted and reconciled immediately. |

People can also enter a bill by hand: `create_bill(kind, bill, items)` (verify_bills), or record a
bill from a document in review: `review_create_bill_from_document`.

## 2. Reconciliation (`reconciliation_records`, one per bill / invoice)

Each check stores billed vs recorded amount, quantity and trips (differences are generated
columns), a per-line `detail` jsonb, a readable `reason` and the status
`matched | mismatch | difference_approved | disputed | correction_requested | reconciled`
(mirrored onto the bill / invoice, and a mismatch raises a grouped notification).
Differences up to `app_settings.bill_amount_tolerance` (₹1 by default) count as matched.

**Provider bill** — `reconcile_provider_bill(bill_id)`. Each line is matched to a trip of that
provider by: link already made → same vehicle (spacing ignored) within ±1 day, closest quantity →
slip or trip code in the line reference. Lines without a trip are matched to purchases without
trips (yard purchases) by code, or material + date + quantity. Line states:
`matched`, `quantity_differs` (billed vs loading-slip net), `rate_differs` (billed vs the
purchase rate), `not_in_system`. Recorded trips of the provider in the bill period that no bill
covers are added as `missing_on_bill`.

**Transporter bill** — `reconcile_transporter_bill(bill_id)`. Rate basis comes from the bill, else
the transporter (`transporters.rate_basis` = `per_trip` | `per_mt`, `rate_per_mt`). Lines are
matched to that transporter's trips by vehicle + date (±1 day) or trip code. Recorded amount =
the trip's agreed freight (per trip) or loaded MT × rate per MT. States as above; unbilled trips
in the period are `missing_on_bill`, extra billed trips are `not_in_system`.

**Customer invoice** — `reconcile_invoice(invoice_id)`, run on creation. Six checks, each with a
readable detail: excess quantity (invoiced vs confirmed delivery), missing delivery records,
wrong rate (vs the order's selling rate), duplicate invoice (trip on another live invoice),
amount difference (subtotal vs delivered × order rate), order mismatch.

**Decisions** — `decide_reconciliation(bill_type, bill_id, action, note)`, verify_bills only:
`approve_difference`, `dispute`, `request_correction` (note required), `mark_reconciled` (only
when matched or the difference was approved). Re-running a check keeps a decision while the
figures are unchanged; if the figures change the decision is cleared. Nobody can write
`reconciliation_records` directly (RLS + revoked privileges).

## 3. Customer invoicing

`create_invoice(invoice, trip_ids, order_lines, charges, issue)` (record_payments):

- Lines from confirmed deliveries (one line per trip, quantity = the authoritative weight from
  settings, rate = the order's selling rate) and/or order lines (never more than ordered and not
  yet invoiced).
- A trip can be on only one live (non-cancelled) invoice — trigger `guard_invoice_trip`, and the
  trips are locked while the invoice is created.
- Number from `app_settings` (`PREFIX-YYYY-0001`) under a row lock: concurrency-safe.
- GST: on/off. When on, the place of supply (customer GSTIN state, else customer state) is
  compared with the business state (`gst_config.state_code`): same → CGST + SGST (tax split in
  halves, paise to SGST), different → IGST. Tax = Σ(line amount × material GST rate), rounded to
  paise; additional charges are listed separately (`additional_charges_detail`).
- Status: `draft` → `issued` (`issue_invoice`) → `cancelled` (`cancel_invoice`, reason required,
  only without payments). Payment status Unpaid / Partial / Paid is computed in `v_invoice_list`.
- PDF: the invoice page prints an A4 tax invoice (business details, bank details from Settings,
  GSTINs, place of supply, CGST/SGST/IGST as stored). "PDF" opens the browser's save-as-PDF with
  the invoice number as the file name.

## 4. Payments and expenses

`record_payment(p)` (record_payments, people only) for both directions:

- Against a chosen invoice / bill, or — when Settings → Payments says "oldest open first" —
  spread over the party's open documents, oldest first.
- Balance = total − Σ payments, computed by the database (`v_invoice_list.balance`,
  `v_bill_list`). Anything above the outstanding balance is refused, unless Settings allows
  advances *and* the user ticks "keep the extra as an advance" (stored on account).
- A non-cash payment needs a reference (UTR / UPI / cheque no.).

Expenses (`expenses`): labour, loading, unloading, fuel, toll, waiting charges, other; optional
order / trip link; insert needs record_payments (RLS). Both are audited.

## 5. Stock

- Yard purchases add stock (`sync_purchase_stock`), trips loaded from a yard issue stock
  (`sync_trip_measurements`). Direct-to-site purchases and trips never touch yard stock
  (`guard_stock_movement` rejects it).
- Several yards (`stock_locations`); balances per yard and material in `v_stock_balance`,
  history in `v_stock_ledger`.
- `adjust_stock(yard, material, ±qty, date, reason)` — owner only, reason required and audited
  (for physical counts). Purchases and trips are never edited to fix stock.

## 6. Profit and landed cost

`v_trip_economics` (per trip):

- sales value = billable quantity (authoritative weight) × order selling rate
- purchase cost = loaded net × purchase rate + prorated purchase additional costs; yard trips use
  the yard's landed rate
- transport cost = the transporter's billed amount once a bill covers the trip, otherwise the
  agreed freight

`v_order_profit`: estimated profit = sales − purchase − transport − loading/unloading − labour −
other expenses linked to the order. **Final Settled** only when the order is completed, every
trip is delivered and covered by provider and transporter bills, those bills are matched /
approved / reconciled and fully paid, and every issued invoice is paid. Otherwise **Estimated**.
Receipts never change profit.

`v_monthly_profit` (by delivery month, expenses by expense date), `v_landed_cost` (landed cost per
unit = (purchase + transport) / loaded quantity, by material and by provider + material,
`level` column). All profit views need view_financial_reports.

## 7. Frontend

| Page | Service | Data |
|---|---|---|
| Provider / Transporter Bills, bill detail | `bills.service` | `v_bill_list` (server paging, search, party / status filters), reconciliation detail, payments, document; "Check again" re-runs the check |
| Bill Reconciliation, decision page | `bills.service` | queues per kind + invoice checks; decisions via `decide_reconciliation` |
| Invoices, create, detail / print | `invoices.service` | `v_invoice_list`, `create_invoice`, `issue_invoice`, `cancel_invoice` |
| Payments | `payments.service` | `v_payment_list` (paged per direction), `v_party_outstanding` (ageing), `record_payment` |
| Expenses | `payments.service` | `v_expense_list` (paged, total of all matching rows) |
| Profit & Loss | `profit.service` | `v_order_profit`, `v_monthly_profit`, `v_landed_cost` |
| Stock Ledger | `stock.service` | `v_stock_balance`, `v_stock_ledger`, `adjust_stock` |

Page KPIs use `finance_totals()` (receivable, overdue, payables, month totals, items needing
attention) — totals over every row the user may see, not just the visible page. Buttons follow
permissions (`record_payments`, `verify_bills`, owner) and RLS enforces the same server-side.
Customer, provider, transporter, order and trip pages show their invoices, bills and payments.

## 8. Tests

- `supabase/tests/database/finance_logic.test.sql` (pgTAP, rolled back): exact match, duplicate
  bill, extra trip billed, rate difference, unbilled trip, decisions and notes, per-MT rates,
  GST split (intra / inter state), double invoicing, partial invoice, over-ordering, payment
  balance, overpayment, oldest-first allocation, receipts ≠ profit, trip economics, landed cost,
  Estimated status while bills / invoices are open, yard stock and adjustments, permissions.
- `supabase/functions/_shared/bills.test.ts`: bill normalisation, validation, party matching,
  decisions, pipeline branch.
- `src/test/finance.test.ts`: services and mappers; `pages-smoke.test.tsx` renders every finance page.
- `e2e/finance-flow.spec.ts`: the full flow in a browser (test project only; see its header).
