# Document intake

Documents (weighbridge slips, loading / unloading slips, bills, delivery photos, receipts) reach
the system through two **intake channels**. Both end in the same database function, so the AI
pipeline, matching and review do not depend on where a document came from. There is no WhatsApp /
Twilio integration.

| Channel      | Who                                                                | `documents.source` | Where                                           |
| ------------ | ------------------------------------------------------------------ | ------------------ | ----------------------------------------------- |
| Staff upload | Signed-in owner / employees (`review_documents` or `manage_trips`) | `staff_upload`     | Document Inbox, Uploads & Links, top-bar upload |
| Driver link  | Drivers, **no login**, through a per-trip link                     | `driver_link`      | Public page `/u/<token>`                        |

Every document shows its source, the uploader (or the name the driver typed) and the trip it came
from. The inbox and **Uploads & Links → Recent uploads** filter by source.

## Shared hand-over

1. The original file is stored in the private `documents` bucket at
   `<business_id>/<yyyy>/<mm>/<uuid>.<ext>`. Photos are resized on the device to at most 2000 px on
   the long edge (JPEG quality 0.85); HEIC is converted to JPEG when the browser can; PDFs are stored
   unchanged.
2. The SHA-256 of the stored bytes is computed.
3. `create_document_from_upload(...)` (service role) creates the `documents` row and queues it
   (`enqueue_document`). An exact SHA-256 match with an earlier original becomes a **Duplicate**
   linked to it and is not read again.

Hints travel with the document: `trip_hint_id` (picked by staff, or the link's trip),
`document_type_hint` (the AI still classifies) and `uploaded_by_label` (free text). The matcher
treats a trip hint as a strong candidate but still checks the vehicle number on the slip; a
different vehicle sends the document to review as **vehicle mismatch**.

## Staff upload

Drag-and-drop, multiple files, or the phone camera. Each file is prepared and hashed as soon as it is
added; files already stored show **"Already uploaded as DOC-…"** before anything is sent. Optional
related trip and document type. Uploads run one by one with a status per file.

## Driver links

### Lifecycle

1. **Create** — trip page → _Driver upload link_ → **Generate**, or select trips on the trips list →
   **Generate links** (prints half-A4 trip sheets with a QR code). `create_upload_token()`
   (`manage_trips` only, audited) makes 32 random bytes (base64url, 43 characters), stores only
   `sha256(token)` in `upload_tokens` and returns the raw token once, inside the link
   `APP_ORIGIN/u/<token>`.
2. **Share** — copy, QR code (drawn in the browser, downloadable PNG) or the phone's share sheet
   (SMS, WhatsApp or any app — sent by a person; the system sends nothing).
3. **Use** — the driver sees only the trip code, vehicle number and material, picks the document type
   (only the types allowed on the link), takes photos (`capture="environment"`) or chooses files
   (up to 5 per send), optionally types a name (remembered on that phone) and sends. Each file counts
   against the link.
4. **End** — a link stops working when it **expires** (default 72 h), is **used up** (default 20
   files), or is **revoked** / **regenerated** (one active link per trip; a new one revokes the old).
   The raw token can never be shown again — regenerate instead.

### Security model

- **No secret at rest.** Only the SHA-256 of the token is stored. The raw token is not in any table,
  the audit log or the logs (functions log hash prefixes only). Tests check all three.
- **Two public Edge Functions** (`verify_jwt = false`):
  - `driver-upload-info` (GET) → trip code, vehicle number, material name, allowed types, remaining
    uploads. Nothing about customers, rates or amounts.
  - `driver-upload` (POST multipart) → validates the link again, checks each file **by its bytes**
    (JPEG, PNG, WebP, HEIC, PDF only; the name and browser type are ignored), max 10 MB per file,
    1–5 files and never more than the link has left; stores with the service role; registers each
    file with `driver_link_register_upload()`, which re-checks the link under a row lock and counts
    the upload atomically. A stored file whose registration fails is deleted again.
- **One generic answer** for unknown, malformed, expired, revoked and used-up links (HTTP 404,
  "This upload link is not valid any more…"), so a link's state cannot be probed. Hashes are compared
  in constant time.
- **The database functions behind the public channel are service-role only.** Anonymous and signed-in
  callers cannot call `driver_link_info` / `driver_link_register_upload`, cannot read
  `upload_tokens`, `documents`, `rate_limit_hits`, and cannot read or write the bucket (RLS).
  The functions return only the fields listed above; internal fields are stripped before the response.
- **Rate limits** (`rate_limit_hits`, fixed one-hour windows, hashed keys): uploads per network
  (`app_settings.upload_rate_limit_per_ip`, default 30/h — invalid tokens count too, so guessing is
  throttled), 60/h per link, 120 link checks/h per network.
- **CORS** only for `APP_ORIGIN`; responses carry `Cache-Control: no-store`,
  `Referrer-Policy: no-referrer` and `X-Content-Type-Options: nosniff`. The page has
  `noindex` / `no-referrer` meta tags and no navigation into the app.
- **Optional bot check:** when the secret `TURNSTILE_SECRET_KEY` is set (not a `REPLACE_ME`
  placeholder) and the frontend has `VITE_TURNSTILE_SITE_KEY`, uploads must pass Cloudflare Turnstile.

### Limits (Settings → Driver upload links, owner only)

| Setting                      | Default                                             | Range                 |
| ---------------------------- | --------------------------------------------------- | --------------------- |
| Link valid for               | 72 hours                                            | 1–720                 |
| Files per link               | 20                                                  | 1–200                 |
| Drivers may send             | loading slip, unloading slip, delivery photo, other | also weighbridge slip |
| Uploads per hour per network | 30                                                  | 1–1000                |
| Files per send / file size   | 5 / 10 MB                                           | fixed                 |

## Notifications

In-app, exceptions only: needs review, could not be read, delivery above tolerance, bill / invoice
mismatch, AI limit. Notices of the same kind within 10 minutes are grouped ("3 documents need
review") and delivered live (Realtime). An optional daily e-mail digest (Resend) is **off** by
default: it needs the Settings switch and real `RESEND_API_KEY` / `NOTIFY_EMAIL_FROM` secrets, and
stays silent otherwise.

## Adding a channel later

Write an adapter that stores the file under the business folder and calls
`create_document_from_upload(...)` with a new `document_intake_source` value (new migration). The
queue, AI reading, matching and review screens need no change.

See `docs/ai-pipeline.md` for what happens after intake.
