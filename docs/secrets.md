# Secrets and configuration

Nothing secret is committed. Committed files only contain placeholders:
`supabase/secrets.placeholder.env` and `.env.example`. Real values live in gitignored files
(`supabase/secrets.env`, `supabase/.env`, `.env.local`) and in the Supabase project.

## Edge Function secrets (Supabase project)

Edge Functions read these only through `getSecret()` in `supabase/functions/_shared/env.ts`,
which throws an error naming the secret if it is missing or still starts with `REPLACE_ME`.
The `config-check` function (owner only) reports which are still pending, without values.

| Secret                 | What it is                                                                                                             | Where to get it                                  | Update                                                                                            |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `GEMINI_API_KEY`       | API key for reading documents with Google Gemini                                                                       | Google AI Studio → Get API key                   | `npx supabase secrets set GEMINI_API_KEY=...`                                                     |
| `GEMINI_MODEL`         | Gemini model id. Recommended: `gemini-3.6-flash` (stable); cheaper: `gemini-3.5-flash-lite`. See `docs/ai-pipeline.md` | Google AI Studio → Models                        | `npx supabase secrets set GEMINI_MODEL=gemini-3.6-flash`                                          |
| `APP_ORIGIN`           | Public URL of the web app (password-reset / invite links)                                                              | Your hosting URL; `http://localhost:5173` in dev | `npx supabase secrets set APP_ORIGIN=https://...`                                                 |
| `OWNER_EMAIL`          | Login email of the first owner account                                                                                 | Your choice                                      | edit `supabase/secrets.env`, then `npm run create-owner` (and `secrets set` if functions need it) |
| `OWNER_PASSWORD`       | Initial password of the owner account (min 10 characters)                                                              | Your choice; change after first login            | edit `supabase/secrets.env`, then `npm run create-owner`                                          |
| `WORKER_SECRET`        | Shared secret between pg_net / pg_cron and the `process-document` worker                                               | Generated — never typed by hand                  | `npm run worker:setup` (also stores it in Vault)                                                  |
| `RESEND_API_KEY`       | Optional. Resend API key for the daily e-mail digest of exceptions (also needs the Settings switch)                    | resend.com → API Keys                            | `npx supabase secrets set RESEND_API_KEY=...`                                                     |
| `NOTIFY_EMAIL_FROM`    | Optional. Digest sender, e.g. `Meridian <alerts@yourdomain.in>` (domain verified in Resend)                            | Resend → Domains                                 | `npx supabase secrets set NOTIFY_EMAIL_FROM=...`                                                  |
| `TURNSTILE_SECRET_KEY` | Optional. Cloudflare Turnstile secret for the public driver upload page (pair with `VITE_TURNSTILE_SITE_KEY`)          | Cloudflare → Turnstile                           | `npx supabase secrets set TURNSTILE_SECRET_KEY=...`                                               |

Set them all at once after editing `supabase/secrets.env`:

```sh
npx supabase secrets set --env-file supabase/secrets.env
npx supabase secrets list            # names only
```

Supabase also injects `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` into
every Edge Function automatically; do not set those yourself.

There is no WhatsApp / Twilio integration: documents arrive by in-app upload (`docs/intake.md`).

### Vault (database)

Optional secrets left as `REPLACE_ME_*` simply keep their feature off (no errors).

pg_net and pg_cron wake the document worker and the digest using three Vault entries, written by
`npm run worker:setup`: `process_document_url`, `notify_digest_url` and `document_worker_secret`
(same value as `WORKER_SECRET`). Rotate by running the script again.

## Frontend (`.env.local`)

| Variable                  | What it is                                               | Where to get it                         |
| ------------------------- | -------------------------------------------------------- | --------------------------------------- |
| `VITE_SUPABASE_URL`       | Project API URL (public)                                 | Dashboard → Project Settings → API      |
| `VITE_SUPABASE_ANON_KEY`  | Publishable / anon key (public, RLS applies)             | Dashboard → Project Settings → API Keys |
| `VITE_TURNSTILE_SITE_KEY` | Optional Turnstile site key (public) for the driver page | Cloudflare → Turnstile                  |

## Local scripts (`supabase/.env`)

Used by `scripts/create-owner.ts` only. Never expose these to the browser.

| Variable                    | What it is                               |
| --------------------------- | ---------------------------------------- |
| `SUPABASE_URL`              | Project API URL                          |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret / service-role key (bypasses RLS) |

## CLI access

`SUPABASE_ACCESS_TOKEN` (personal access token) is read from your shell environment or from
`supabase/.env` (gitignored) by `scripts/supabase-api.ts` and `scripts/setup-document-worker.ts`;
the project ref comes from `supabase link`. Never commit it. Revoke tokens you no longer need under Account → Access Tokens.
