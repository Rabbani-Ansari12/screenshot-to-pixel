# Document intake

Documents (weighbridge slips, loading / unloading slips, bills, delivery photos, receipts)
reach the system through **intake channels**. Every channel ends in the same database
function, so the processing pipeline does not know or care where a document came from.

| Channel                                                       | `documents.source` | Status     |
| ------------------------------------------------------------- | ------------------ | ---------- |
| Staff upload from the Document Inbox (files or phone camera)  | `staff_upload`     | **Live**   |
| Driver link (a short-lived upload page for drivers, no login) | `driver_link`      | Next phase |

There is no WhatsApp / Twilio integration.

## How a channel hands over a document

1. Store the original file in the private `documents` bucket at
   `<business_id>/<yyyy>/<mm>/<uuid>.<ext>` (images are downscaled to 2000 px on the long edge,
   JPEG quality 0.85; HEIC is converted to JPEG; PDFs are stored as they are).
2. Compute the SHA-256 of the stored bytes.
3. Call **`create_document_from_upload(...)`** (service role) — or, for signed-in staff,
   `register_uploaded_document(...)`, which checks permissions and calls it:
   - exact SHA-256 match with an earlier document → new row with status **Duplicate** linked to
     the original, not processed again (no AI cost);
   - otherwise status **Received** and `enqueue_document()` adds a `document_jobs` row and wakes
     the worker through pg_net.

Optional hints from the uploader: `trip_hint_id` (a trip they picked — the matcher still checks the
vehicle number), `document_type_hint` (the AI still classifies), `uploaded_by_label` (free text such
as the driver's name).

## Adding a channel later

Write an adapter (an Edge Function or page) that does steps 1–3 with the right `source`. Nothing in
the queue, the AI extraction, the matcher or the review screens needs to change. Add the new value
to the `document_intake_source` enum in a new migration.

See `docs/ai-pipeline.md` for what happens after intake.
