-- =============================================================================
-- Enum changes for in-app document intake (own migration: new enum values cannot be
-- used in the transaction that adds them).
-- =============================================================================

-- Records created from a document (by AI or a reviewer) are 'document', not 'whatsapp'.
alter type public.record_source rename value 'whatsapp' to 'document';

-- Review reasons used by the matching engine.
alter type public.review_reason add value if not exists 'no_match';
alter type public.review_reason add value if not exists 'vehicle_mismatch';

-- A reviewer can reject a document (kept as evidence, never recorded).
alter type public.document_status add value if not exists 'rejected';

-- How a document reached us. The processing pipeline does not depend on the channel.
create type public.document_intake_source as enum ('staff_upload', 'driver_link');

create type public.document_job_status as enum ('queued', 'running', 'done', 'failed');
