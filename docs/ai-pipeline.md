# AI document pipeline

```
upload ─► documents (Received) ─► document_jobs (queued)
                                   │  pg_net right after enqueue, pg_cron every minute
                                   ▼
            process-document Edge Function (claims jobs with FOR UPDATE SKIP LOCKED)
                                   │
   classify (Gemini) ─► extract (Gemini, JSON schema, temperature 0) ─► normalise ─► validate
                                   │
                    duplicate check (slip number + vehicle) ─► matcher ─► decision
                                   │
        Automatically Recorded  |  Needs Review (reason + ranked candidates)  |  Duplicate
```

Statuses: Received → Processing → Information Extracted → Matched / Automatically Recorded |
Needs Review | Failed | Duplicate (and Rejected, set by a reviewer).

## Principles

- **The AI never invents values.** Prompts tell the model to return `null` (with `legible: false`)
  for anything missing or unreadable; normalisers turn anything unparseable into `null` and add a
  warning. Essential fields that are null send the document to review.
- **Originals are kept.** The file stays in Storage, the raw model response and normalised
  extraction stay in `ai_processing_records` and `documents.extracted`. Corrections are rows in
  `document_corrections` (reason required, audited); the effective value is the latest correction.
- **Nothing is forced.** A document never overwrites an existing weight. If a hand-typed weight
  agrees with the slip (within the net tolerance) the slip is linked as evidence; otherwise the
  document goes to review.
- **AI never approves financial discrepancies.** Bills are read (classified) but not recorded; the
  reconciliation module decides with a person.

## Code

| Piece                                                        | File                                                     |
| ------------------------------------------------------------ | -------------------------------------------------------- |
| Worker entry (auth, queue, retries, deferral)                | `supabase/functions/process-document/index.ts`           |
| Pipeline (pure, injected I/O)                                | `supabase/functions/process-document/pipeline.ts`        |
| Gemini client (official `@google/genai` SDK)                 | `supabase/functions/_shared/gemini.ts`                   |
| Prompts                                                      | `supabase/functions/_shared/prompts/`                    |
| Extractor registry (by document type)                        | `supabase/functions/_shared/extractors.ts`               |
| Normalisers (vehicle, dates, times, weights / units)         | `supabase/functions/_shared/normalize.ts`                |
| Validators (net check, plausibility, essentials, confidence) | `supabase/functions/_shared/validate.ts`                 |
| Matching engine                                              | `supabase/functions/_shared/matcher.ts`                  |
| Database side (queue, intake, decisions, review RPCs)        | `supabase/migrations/20261110140100_document_intake.sql` |

Weight documents (weighbridge, loading, unloading slips, delivery photos) have an extractor. Other
types are classified and stored as _Information Extracted_; add an extractor to the registry to
automate them.

## Gemini

- Model: secret `GEMINI_MODEL`. Recommended default **`gemini-3.6-flash`** (stable). For lower cost
  try **`gemini-3.5-flash-lite`** (stable, "simple data processing") and compare the review rate on
  your own slips. `gemini-2.0-flash` is shut down and `gemini-2.5-flash` shuts down on
  1 Dec 2026, so do not use them. (Checked against Google's model and deprecation pages on
  10 Nov 2026.)
- Calls go through the official SDK (`npm:@google/genai`), `temperature: 0`,
  `responseMimeType: application/json` with a JSON schema. Images are sent inline (already ≤ 2000 px
  from upload; Gemini's inline limit is 20 MB per request).
- While `GEMINI_API_KEY` / `GEMINI_MODEL` are `REPLACE_ME_*` placeholders, `getSecret()` throws a
  clear error; the worker then **defers** jobs by an hour (no attempts used) and the document shows
  "Waiting: Secret GEMINI_API_KEY still has its placeholder value…".

## Matching

Each candidate trip (same business, loaded within the window around the slip's date/time, plus the
uploader's hinted trip) gets a score from weighted criteria. Criteria without data on the document
are skipped (they neither help nor hurt):

| Criterion                                           | Score                                                                              | Default weight                   |
| --------------------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------- |
| vehicle                                             | exact plate 1, one character off 0.5                                               | 0.35                             |
| time                                                | delivery 0–12 h after loading = 1, then falls to 0 at the window; loading ±1 h = 1 | 0.20                             |
| slip_or_trip_code                                   | slip already on the trip / trip code printed                                       | 0.15                             |
| material, provider, transporter, order, destination | name similarity                                                                    | 0.10 / 0.08 / 0.04 / 0.04 / 0.04 |
| existing_records                                    | trip has no such weight yet, or the typed-in one agrees                            | 0.05                             |

Trips already recorded from another document, cancelled trips, and trips whose material is not in
MT are excluded. Weighbridge slips become a loading or delivery weight depending on the trip.

**Automatic recording only when all hold:** essentials present, weights consistent, overall
confidence ≥ `app_settings.auto_process_confidence_threshold` (default 0.85), and either a verified
trip hint (vehicle matches) or exactly one candidate ≥ `match_threshold` (0.70) leading the
runner-up by ≥ `match_margin` (0.15). Otherwise **Needs Review** with one reason:
`missing_essential_info`, `conflicting_weight_values`, `low_confidence`, `vehicle_mismatch`,
`multiple_possible_matches`, `no_match` — plus the stored candidate list with per-criterion scores.

## Queue, retries and cost control

- `claim_document_jobs` uses `FOR UPDATE SKIP LOCKED`; jobs stuck in `running` for 10 minutes are
  picked up again. Errors retry after 2, 4, 8 … minutes; after `max_attempts` (3) the document is
  **Failed** and the inbox shows **Retry**.
- Exact duplicates (same SHA-256) are never sent to the model.
- `app_settings.ai_daily_call_cap` (default 300 calls ≈ 150 documents/day). When reached, jobs are
  deferred to the next IST midnight and the owner gets one in-app notification.
- Usage per document is stored in `ai_processing_records.usage`; daily totals in `ai_usage_daily`.

### Cost per document (estimate)

Two calls per document (classify + extract). A 2000 × 1500 photo is ~6 tiles × 258 ≈ 1,550 input
tokens per call, plus ~600 prompt/schema tokens; output ~50 (classify) and ~400 (extract) tokens.

| Model (paid tier, prices from Google's pricing page, Nov 2026) | ≈ USD / document | ≈ ₹ / document |
| -------------------------------------------------------------- | ---------------- | -------------- |
| `gemini-3.5-flash-lite` ($0.30 in / $2.50 out per 1M)          | $0.0025          | ₹0.21          |
| `gemini-3.6-flash` ($0.75 / $3.75 until 31 Dec 2026)           | $0.005           | ₹0.42          |
| `gemini-3.6-flash` ($1.50 / $7.50 from 1 Jan 2027)             | $0.010           | ₹0.85          |

1,000 slips a month cost roughly ₹200–₹850. Re-check prices before relying on them; thinking tokens
(if the model uses them) are billed as output.

## Tuning the thresholds

Settings → AI document reading (owner only):

- **Too many reviews for good slips?** Look at the reasons in the review queue. `low_confidence` on
  readable slips → lower the confidence threshold a little (e.g. 85 → 80). `multiple_possible_matches`
  for the same vehicle on back-to-back trips → lower the margin (15 → 10) only if the times are
  clearly different; otherwise ask uploaders to pick the trip.
- **Wrong automatic matches?** Raise the match score (70 → 80) and the margin. Never lower the
  vehicle weight below the time weight.
- **Late paperwork** (slips uploaded days later) → raise the window (72 h → 120 h).
- **Net mismatches from rounding** on slips printed in kg → the default 0.02 MT (20 kg) is usually
  right; raise only if your weighbridges round to 50 kg.

## Running it

```sh
npx supabase functions deploy process-document --use-api --no-verify-jwt
npm run worker:setup                  # WORKER_SECRET + Vault entries (once, or to rotate)
npx supabase secrets set GEMINI_API_KEY=... GEMINI_MODEL=gemini-3.6-flash
```

Tests: `npx vitest run supabase/functions` (unit tests, fixture pipeline with a mocked model).
Optional live test, skipped while the key is a placeholder:
`GEMINI_API_KEY=... npx vitest run supabase/functions/process-document/gemini.live.test.ts`.
