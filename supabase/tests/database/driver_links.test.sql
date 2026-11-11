-- pgTAP tests for driver upload links, rate limiting and grouped notifications
-- (migration 20261111100000). Everything is rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(24);

-- Fixtures: business, owner, trips employee, viewer; a trip with vehicle and material.
insert into public.businesses (id, name) values ('00000000-0000-4000-8000-00000000b004', 'Links Test Business');
insert into public.app_settings (business_id, upload_link_max_uploads) values ('00000000-0000-4000-8000-00000000b004', 2);
insert into auth.users (id, email, raw_app_meta_data) values
  ('00000000-0000-4000-8000-0000000000b1', 'links.owner@example.com',
   '{"role":"owner","is_active":true,"business_id":"00000000-0000-4000-8000-00000000b004"}'),
  ('00000000-0000-4000-8000-0000000000b2', 'links.trips@example.com',
   '{"is_active":true,"business_id":"00000000-0000-4000-8000-00000000b004"}'),
  ('00000000-0000-4000-8000-0000000000b3', 'links.viewer@example.com',
   '{"is_active":true,"business_id":"00000000-0000-4000-8000-00000000b004"}');
insert into public.user_permissions (business_id, profile_id, permission) values
  ('00000000-0000-4000-8000-00000000b004', '00000000-0000-4000-8000-0000000000b2', 'view_records'),
  ('00000000-0000-4000-8000-00000000b004', '00000000-0000-4000-8000-0000000000b2', 'manage_trips'),
  ('00000000-0000-4000-8000-00000000b004', '00000000-0000-4000-8000-0000000000b3', 'view_records');
insert into public.customers (id, business_id, name) values ('00000000-0000-4000-8000-0000000000c4', '00000000-0000-4000-8000-00000000b004', 'Link Customer');
insert into public.construction_sites (id, business_id, customer_id, name) values
  ('00000000-0000-4000-8000-0000000000c5', '00000000-0000-4000-8000-00000000b004', '00000000-0000-4000-8000-0000000000c4', 'Link Site');
insert into public.materials (id, business_id, name, category, unit) values
  ('00000000-0000-4000-8000-0000000000c6', '00000000-0000-4000-8000-00000000b004', 'Link Sand', 'Sand', 'MT');
insert into public.transporters (id, business_id, name) values ('00000000-0000-4000-8000-0000000000c7', '00000000-0000-4000-8000-00000000b004', 'Link Haulage');
insert into public.vehicles (id, business_id, transporter_id, vehicle_number) values
  ('00000000-0000-4000-8000-0000000000c8', '00000000-0000-4000-8000-00000000b004', '00000000-0000-4000-8000-0000000000c7', 'MH 12 LK 0001');
insert into public.customer_orders (id, business_id, customer_id, site_id) values
  ('00000000-0000-4000-8000-0000000000c9', '00000000-0000-4000-8000-00000000b004', '00000000-0000-4000-8000-0000000000c4', '00000000-0000-4000-8000-0000000000c5');
insert into public.truck_trips (id, business_id, order_id, material_id, transporter_id, vehicle_id, site_id) values
  ('00000000-0000-4000-8000-0000000000ca', '00000000-0000-4000-8000-00000000b004', '00000000-0000-4000-8000-0000000000c9',
   '00000000-0000-4000-8000-0000000000c6', '00000000-0000-4000-8000-0000000000c7', '00000000-0000-4000-8000-0000000000c8',
   '00000000-0000-4000-8000-0000000000c5');
insert into storage.objects (bucket_id, name) values
  ('documents', '00000000-0000-4000-8000-00000000b004/2026/11/00000000-0000-4000-8000-0000000000d1.jpg'),
  ('documents', '00000000-0000-4000-8000-00000000b004/2026/11/00000000-0000-4000-8000-0000000000d2.jpg'),
  ('documents', '00000000-0000-4000-8000-00000000b004/2026/11/00000000-0000-4000-8000-0000000000d3.jpg');
create temporary table _link (token text, id uuid);
grant all on _link to public;

-- Staff
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b3","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000b3', true);
select throws_ok($$ select public.create_upload_token('00000000-0000-4000-8000-0000000000ca') $$, '42501', null,
  'a view-only user cannot create a link');
select is((select count(*) from public.upload_tokens), 0::bigint, 'a view-only user cannot list links');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000b2', true);
insert into _link select r ->> 'token', (r ->> 'id')::uuid from (select public.create_upload_token('00000000-0000-4000-8000-0000000000ca', 24) r) x;
select ok((select token ~ '^[A-Za-z0-9_-]{43}$' from _link), 'the raw token is 32 random bytes in base64url');
select is((select count(*) from public.upload_tokens), 1::bigint, 'a manage_trips user lists the link');
select throws_ok($$ update public.upload_tokens set max_uploads = 200 $$, '42501', null, 'links cannot be edited directly');

reset role;
select is((select token_hash from public.upload_tokens where id = (select id from _link)),
          encode(extensions.digest((select token from _link), 'sha256'), 'hex'), 'only sha256(token) is stored');
select is((select count(*) from public.upload_tokens u where to_jsonb(u)::text like '%' || (select token from _link) || '%'),
          0::bigint, 'the raw token is in no column');
select is((select count(*) from public.audit_logs a where coalesce(a.new_data::text, '') || coalesce(a.old_data::text, '') like '%' || (select token from _link) || '%'),
          0::bigint, 'the raw token is not in the audit log');
select is((select count(*) from public.audit_logs where table_name = 'upload_tokens' and reason = 'Driver upload link created'
             and business_id = '00000000-0000-4000-8000-00000000b004'), 1::bigint, 'link creation is audited');

-- Public functions (service role)
select is((select array_to_string(array(select jsonb_object_keys(public.driver_link_info(encode(extensions.digest((select token from _link), 'sha256'), 'hex'))) order by 1), ',')),
  '_business_id,_rate_limit_per_ip,allowed_doc_types,material_name,remaining_uploads,token_hash,trip_code,vehicle_number',
  'link info holds only trip code, vehicle, material, types and remaining uploads (+ internal fields)');
select is(public.driver_link_info(repeat('0', 64)), null, 'an unknown link returns nothing');
select is((public.driver_link_register_upload(encode(extensions.digest((select token from _link), 'sha256'), 'hex'),
  '00000000-0000-4000-8000-00000000b004/2026/11/00000000-0000-4000-8000-0000000000d1.jpg', repeat('a', 64), 'a.jpg', 'image/jpeg', 100,
  'unloading_slip', 'Ramesh') ->> 'status'), 'received', 'a driver upload is registered');
select is((select source::text || ' / ' || document_type_hint || ' / ' || uploaded_by_label from public.documents where file_name = 'a.jpg'),
  'driver_link / unloading_slip / Ramesh', 'it is a driver_link document with type hint and driver name');
select is((select trip_hint_id from public.documents where file_name = 'a.jpg'), '00000000-0000-4000-8000-0000000000ca'::uuid,
  'the link''s trip becomes the trip hint');
select throws_ok($$ select public.driver_link_register_upload(encode(extensions.digest((select token from _link), 'sha256'), 'hex'),
  '00000000-0000-4000-8000-00000000b004/2026/11/00000000-0000-4000-8000-0000000000d2.jpg', repeat('b', 64), 'b.jpg', 'image/jpeg', 100,
  'provider_bill', null) $$, '22023', 'invalid_doc_type', 'a type not allowed on the link is rejected');
select lives_ok($$ select public.driver_link_register_upload(encode(extensions.digest((select token from _link), 'sha256'), 'hex'),
  '00000000-0000-4000-8000-00000000b004/2026/11/00000000-0000-4000-8000-0000000000d2.jpg', repeat('b', 64), 'b.jpg', 'image/jpeg', 100,
  'delivery_photo', null) $$, 'the second upload uses the last allowance');
select throws_ok($$ select public.driver_link_register_upload(encode(extensions.digest((select token from _link), 'sha256'), 'hex'),
  '00000000-0000-4000-8000-00000000b004/2026/11/00000000-0000-4000-8000-0000000000d3.jpg', repeat('c', 64), 'c.jpg', 'image/jpeg', 100,
  'other', null) $$, '22023', 'invalid_link', 'a used-up link is rejected');
select is(public.driver_link_info(encode(extensions.digest((select token from _link), 'sha256'), 'hex')), null,
  'a used-up link looks exactly like an unknown one');

update public.upload_tokens set upload_count = 0 where id = (select id from _link);
update public.upload_tokens set expires_at = now() - interval '1 minute' where id = (select id from _link);
select is(public.driver_link_info(encode(extensions.digest((select token from _link), 'sha256'), 'hex')), null, 'an expired link returns nothing');
update public.upload_tokens set expires_at = now() + interval '1 hour', revoked_at = now() where id = (select id from _link);
select is(public.driver_link_info(encode(extensions.digest((select token from _link), 'sha256'), 'hex')), null, 'a revoked link returns nothing');

select ok(public.rate_limit_hit('test:links', 2, 3600) and public.rate_limit_hit('test:links', 2, 3600)
          and not public.rate_limit_hit('test:links', 2, 3600), 'the rate limit stops the third request');

-- Anonymous callers
set local role anon;
select throws_ok($$ select public.driver_link_info(repeat('0', 64)) $$, '42501', null, 'anon cannot call the link functions');
select throws_ok($$ select count(*) from public.documents $$, '42501', null, 'anon cannot read documents');
reset role;

-- Grouped notifications
update public.documents set status = 'needs_review', review_reason = 'vehicle_mismatch' where file_name in ('a.jpg', 'b.jpg');
select is((select title || ' / ' || occurrences from public.notifications where kind = 'document_review'
             and business_id = '00000000-0000-4000-8000-00000000b004'), '2 documents need review / 2',
  'review notices within 10 minutes are grouped');

select * from finish();
rollback;
