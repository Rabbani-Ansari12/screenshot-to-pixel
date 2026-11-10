-- pgTAP tests for document intake, the processing queue, review actions and notifications
-- (migrations 20261110140000 / 20261110140100). Everything is rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(22);

insert into public.businesses (id, name) values ('00000000-0000-4000-8000-00000000b003', 'Intake Test Business');
insert into public.app_settings (business_id, ai_daily_call_cap) values ('00000000-0000-4000-8000-00000000b003', 2);
insert into auth.users (id, email, raw_app_meta_data) values
  ('00000000-0000-4000-8000-0000000000a7', 'intake.owner@example.com',
   '{"role":"owner","is_active":true,"business_id":"00000000-0000-4000-8000-00000000b003"}'),
  ('00000000-0000-4000-8000-0000000000a8', 'intake.reviewer@example.com',
   '{"is_active":true,"business_id":"00000000-0000-4000-8000-00000000b003"}'),
  ('00000000-0000-4000-8000-0000000000a9', 'intake.viewer@example.com',
   '{"is_active":true,"business_id":"00000000-0000-4000-8000-00000000b003"}');
insert into public.user_permissions (business_id, profile_id, permission) values
  ('00000000-0000-4000-8000-00000000b003', '00000000-0000-4000-8000-0000000000a8', 'view_records'),
  ('00000000-0000-4000-8000-00000000b003', '00000000-0000-4000-8000-0000000000a8', 'review_documents'),
  ('00000000-0000-4000-8000-00000000b003', '00000000-0000-4000-8000-0000000000a9', 'view_records');
insert into storage.objects (bucket_id, name) values
  ('documents', '00000000-0000-4000-8000-00000000b003/2026/11/00000000-0000-4000-8000-0000000000f1.jpg'),
  ('documents', '00000000-0000-4000-8000-00000000b003/2026/11/00000000-0000-4000-8000-0000000000f2.jpg');

-- Structure
select is((select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'whatsapp_messages'),
  0::bigint, 'whatsapp_messages is gone');
select is((select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'documents'
             and column_name in ('whatsapp_message_id', 'sender_phone')), 0::bigint, 'WhatsApp columns are gone');
select ok((select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'documents'
             and column_name in ('trip_hint_id', 'uploaded_by_label', 'document_type_hint')) = 3, 'intake columns exist');

-- Upload as users
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a9","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a9', true);
select throws_ok(
  $$ select public.register_uploaded_document('00000000-0000-4000-8000-00000000b003/2026/11/00000000-0000-4000-8000-0000000000f1.jpg',
       repeat('a', 64), 'a.jpg', 'image/jpeg', 100) $$,
  '42501', null, 'a view-only user cannot upload');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a8","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a8', true);
select is((public.register_uploaded_document('00000000-0000-4000-8000-00000000b003/2026/11/00000000-0000-4000-8000-0000000000f1.jpg',
       repeat('a', 64), 'a.jpg', 'image/jpeg', 100, null, 'unloading_slip', 'Ramesh (driver)') ->> 'status'),
  'received', 'a reviewer uploads a document');
select is((public.register_uploaded_document('00000000-0000-4000-8000-00000000b003/2026/11/00000000-0000-4000-8000-0000000000f2.jpg',
       repeat('a', 64), 'a-copy.jpg', 'image/jpeg', 100) ->> 'status'),
  'duplicate', 'the same sha256 again is a duplicate');
select throws_ok(
  $$ select public.claim_document_jobs(5) $$, '42501', null, 'users cannot run worker functions');
select is((select count(*) from public.document_jobs), 1::bigint, 'one job queued (none for the duplicate)');

-- Worker (as the test runner, like the service role)
reset role;
select is((select attempts from public.claim_document_jobs(5) limit 1), 1, 'worker claims the job');
select is((select status::text from public.documents where file_name = 'a.jpg'), 'processing', 'document shows processing');
select is(public.finish_document_job((select id from public.document_jobs limit 1), 'timeout')::text, 'queued',
  'a failed attempt is retried later');
select ok((select next_run_at > now() + interval '1 minute' from public.document_jobs limit 1), 'with backoff');
select ok(public.ai_reserve_call('00000000-0000-4000-8000-00000000b003') and public.ai_reserve_call('00000000-0000-4000-8000-00000000b003')
          and not public.ai_reserve_call('00000000-0000-4000-8000-00000000b003'), 'the daily AI cap stops the third call');

select lives_ok($$ select public.record_document_extraction((select id from public.documents where file_name = 'a.jpg'),
  '{"model":"test","overall_confidence":0.93,"extracted":{"doc_type":"unloading_slip","doc_type_confidence":0.96,"warnings":[],
    "fields":{"vehicle_number":{"value":"MH12AB4821","confidence":0.97,"legible":true},
              "net_weight":{"value":27.55,"confidence":0.95,"legible":true},
              "date":{"value":"2026-11-10","confidence":0.9,"legible":true}}}}'::jsonb) $$,
  'extraction is stored');
select is(public.apply_document_decision((select id from public.documents where file_name = 'a.jpg'),
  '{"action":"needs_review","review_reason":"no_match","detail":{"candidates":[]}}'::jsonb), 'needs_review',
  'a needs-review decision is applied');
select is((select count(*) from public.notifications where kind = 'document_review'
             and business_id = '00000000-0000-4000-8000-00000000b003'), 1::bigint, 'reviewers are notified');

-- Review actions
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a8","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a8', true);
select throws_ok(
  $$ select public.correct_document_field((select id from public.documents where file_name = 'a.jpg'), 'net_weight', '27.50', 'typo') $$,
  '42501', null, 'correcting needs correct_extracted');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a7","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a7', true);
select lives_ok(
  $$ select public.correct_document_field((select id from public.documents where file_name = 'a.jpg'), 'net_weight', '27.50', 'Slip shows 27.50') $$,
  'the owner corrects a field with a reason');
select is((public.document_effective_fields((select id from public.documents where file_name = 'a.jpg')) ->> 'net_weight'),
  '27.50', 'the corrected value is used');
select is((select extracted #>> '{fields,net_weight,value}' from public.documents where file_name = 'a.jpg'),
  '27.55', 'the original extracted value is kept');
select lives_ok($$ select public.reject_document((select id from public.documents where file_name = 'a.jpg'), 'Photo of the wrong slip') $$,
  'the document can be rejected with a reason');

reset role;
select is((select reason from public.audit_logs where table_name = 'document_corrections'
             and business_id = '00000000-0000-4000-8000-00000000b003'), 'Slip shows 27.50', 'the correction is audited with its reason');

select * from finish();
rollback;
