-- =============================================================================
-- Private storage bucket for documents.
-- Path: <business_id>/<yyyy>/<mm>/<uuid>.<ext>
-- Read: active users of that business with view_records or review_documents.
-- Write: authenticated upload by users with review_documents or manage_trips
-- (the WhatsApp webhook uploads with the service role, which bypasses RLS).
-- Objects are never updated in place (evidence); only the owner may delete.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 20971520,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy documents_bucket_read on storage.objects for select to authenticated
using (
  bucket_id = 'documents'
  and (storage.foldername(name))[1] = (select public.current_business_id())::text
  and ((select public.has_permission('view_records')) or (select public.has_permission('review_documents')))
);

create policy documents_bucket_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'documents'
  and (storage.foldername(name))[1] = (select public.current_business_id())::text
  and name ~ '^[0-9a-f-]{36}/[0-9]{4}/(0[1-9]|1[0-2])/[0-9a-f-]{36}\.[A-Za-z0-9]{2,5}$'
  and ((select public.has_permission('review_documents')) or (select public.has_permission('manage_trips')))
);

create policy documents_bucket_delete on storage.objects for delete to authenticated
using (
  bucket_id = 'documents'
  and (storage.foldername(name))[1] = (select public.current_business_id())::text
  and (select public.is_owner())
);
