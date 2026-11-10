# Secrets and configuration

Nothing secret is committed. Committed files only contain placeholders:
`supabase/secrets.placeholder.env` and `.env.example`. Real values live in gitignored files
(`supabase/secrets.env`, `supabase/.env`, `.env.local`) and in the Supabase project.

## Edge Function secrets (Supabase project)

Edge Functions read these only through `getSecret()` in `supabase/functions/_shared/env.ts`,
which throws an error naming the secret if it is missing or still starts with `REPLACE_ME`.
The `config-check` function (owner only) reports which are still pending, without values.

| Secret | What it is | Where to get it | Update |
| --- | --- | --- | --- |
| `GEMINI_API_KEY` | API key for reading documents with Google Gemini | Google AI Studio → Get API key | `npx supabase secrets set GEMINI_API_KEY=...` |
| `GEMINI_MODEL` | Gemini model id used for extraction (e.g. a current Gemini Flash / Pro model) | Google AI Studio model list | `npx supabase secrets set GEMINI_MODEL=...` |
| `TWILIO_ACCOUNT_SID` | Twilio account identifier (starts with `AC`) | Twilio Console → Account info | `npx supabase secrets set TWILIO_ACCOUNT_SID=...` |
| `TWILIO_AUTH_TOKEN` | Twilio auth token; also used to verify webhook signatures | Twilio Console → Account info | `npx supabase secrets set TWILIO_AUTH_TOKEN=...` |
| `TWILIO_WHATSAPP_NUMBER` | Business WhatsApp sender, format `whatsapp:+91XXXXXXXXXX` | Twilio Console → Messaging → WhatsApp senders | `npx supabase secrets set TWILIO_WHATSAPP_NUMBER=whatsapp:+91...` |
| `OWNER_WHATSAPP_NUMBER` | Owner's WhatsApp for exception alerts, `whatsapp:+91XXXXXXXXXX` | Owner's phone number | `npx supabase secrets set OWNER_WHATSAPP_NUMBER=whatsapp:+91...` |
| `APP_ORIGIN` | Public URL of the web app (links in alerts, CORS) | Your hosting URL; `http://localhost:5173` in dev | `npx supabase secrets set APP_ORIGIN=https://...` |
| `WEBHOOK_BASE_URL` | Public base URL of Edge Functions, used as the Twilio webhook | `https://<project-ref>.supabase.co/functions/v1` | `npx supabase secrets set WEBHOOK_BASE_URL=https://...` |
| `OWNER_EMAIL` | Login email of the first owner account | Your choice | edit `supabase/secrets.env`, then `npm run create-owner` (and `secrets set` if functions need it) |
| `OWNER_PASSWORD` | Initial password of the owner account (min 10 characters) | Your choice; change after first login | edit `supabase/secrets.env`, then `npm run create-owner` |

Set them all at once after editing `supabase/secrets.env`:

```sh
npx supabase secrets set --env-file supabase/secrets.env
npx supabase secrets list            # names only
```

Supabase also injects `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` into
every Edge Function automatically; do not set those yourself.

## Frontend (`.env.local`)

| Variable | What it is | Where to get it |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Project API URL (public) | Dashboard → Project Settings → API |
| `VITE_SUPABASE_ANON_KEY` | Publishable / anon key (public, RLS applies) | Dashboard → Project Settings → API Keys |

## Local scripts (`supabase/.env`)

Used by `scripts/create-owner.ts` only. Never expose these to the browser.

| Variable | What it is |
| --- | --- |
| `SUPABASE_URL` | Project API URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret / service-role key (bypasses RLS) |

## CLI access

`SUPABASE_ACCESS_TOKEN` (personal access token) and `SUPABASE_PROJECT_REF` are read from your
shell environment by the Supabase CLI and `scripts/supabase-api.ts`. Keep them out of files in
the repo. Revoke tokens you no longer need under Account → Access Tokens.
