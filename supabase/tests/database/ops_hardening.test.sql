-- pgTAP tests for the dashboard, reports, audit immutability, error log, job retries,
-- cost guards and the RLS review (migration 20261112100000). Everything is rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(30);

insert into public.businesses (id, name) values ('00000000-0000-4000-8000-00000000b007', 'Ops Test Business');
insert into public.app_settings (business_id, ai_daily_call_cap) values ('00000000-0000-4000-8000-00000000b007', 5);
insert into auth.users (id, email, raw_app_meta_data) values
  ('00000000-0000-4000-8000-0000000000d1', 'ops.owner@example.com',
   '{"role":"owner","is_active":true,"business_id":"00000000-0000-4000-8000-00000000b007"}'),
  ('00000000-0000-4000-8000-0000000000d2', 'ops.staff@example.com',
   '{"is_active":true,"business_id":"00000000-0000-4000-8000-00000000b007"}'),
  ('00000000-0000-4000-8000-0000000000d3', 'ops.viewer@example.com',
   '{"is_active":true,"business_id":"00000000-0000-4000-8000-00000000b007"}');
insert into public.user_permissions (business_id, profile_id, permission) values
  ('00000000-0000-4000-8000-00000000b007', '00000000-0000-4000-8000-0000000000d2', 'view_records'),
  ('00000000-0000-4000-8000-00000000b007', '00000000-0000-4000-8000-0000000000d2', 'review_documents'),
  ('00000000-0000-4000-8000-00000000b007', '00000000-0000-4000-8000-0000000000d3', 'view_records');
insert into public.customers (id, business_id, name) values
  ('00000000-0000-4000-8000-0000000000e4', '00000000-0000-4000-8000-00000000b007', 'Ops Customer');
insert into public.construction_sites (id, business_id, customer_id, name) values
  ('00000000-0000-4000-8000-0000000000e5', '00000000-0000-4000-8000-00000000b007', '00000000-0000-4000-8000-0000000000e4', 'Ops Site');
insert into public.materials (id, business_id, name, category, unit, selling_rate, purchase_rate) values
  ('00000000-0000-4000-8000-0000000000e6', '00000000-0000-4000-8000-00000000b007', 'Ops Sand', 'Sand', 'MT', 1800, 1400);
insert into public.material_providers (id, business_id, name) values
  ('00000000-0000-4000-8000-0000000000e7', '00000000-0000-4000-8000-00000000b007', 'Ops Quarry');
insert into public.provider_materials (business_id, provider_id, material_id) values
  ('00000000-0000-4000-8000-00000000b007', '00000000-0000-4000-8000-0000000000e7', '00000000-0000-4000-8000-0000000000e6');
insert into public.transporters (id, business_id, name, rate_per_trip) values
  ('00000000-0000-4000-8000-0000000000e8', '00000000-0000-4000-8000-00000000b007', 'Ops Haulage', 5000);
insert into public.vehicles (id, business_id, transporter_id, vehicle_number) values
  ('00000000-0000-4000-8000-0000000000e9', '00000000-0000-4000-8000-00000000b007', '00000000-0000-4000-8000-0000000000e8', 'MH12OP0001');
insert into public.documents (id, business_id, storage_path, sha256, file_name, mime_type, size_bytes, source, status) values
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-00000000b007', '00000000-0000-4000-8000-00000000b007/2026/11/a.jpg',
   repeat('a', 64), 'a.jpg', 'image/jpeg', 10, 'staff_upload', 'failed'),
  ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-00000000b007', '00000000-0000-4000-8000-00000000b007/2026/11/b.jpg',
   repeat('b', 64), 'b.jpg', 'image/jpeg', 10, 'driver_link', 'automatically_recorded');
insert into public.documents (id, business_id, storage_path, sha256, file_name, mime_type, size_bytes, source, status, duplicate_of_document_id) values
  ('00000000-0000-4000-8000-0000000000f3', '00000000-0000-4000-8000-00000000b007', '00000000-0000-4000-8000-00000000b007/2026/11/c.jpg',
   repeat('b', 64), 'c.jpg', 'image/jpeg', 10, 'driver_link', 'duplicate', '00000000-0000-4000-8000-0000000000f2');
insert into public.document_jobs (id, business_id, document_id, status, attempts, last_error) values
  ('00000000-0000-4000-8000-0000000000f4', '00000000-0000-4000-8000-00000000b007', '00000000-0000-4000-8000-0000000000f1', 'failed', 3, 'Gemini 503');
create temporary table _o (k text primary key, v jsonb);
grant all on _o to public;

-- Owner: operations to report on
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d1","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000d1', true);
do $s$ declare o jsonb; begin
  o := public.create_order('{"customer_id":"00000000-0000-4000-8000-0000000000e4","site_id":"00000000-0000-4000-8000-0000000000e5"}',
    '[{"material_id":"00000000-0000-4000-8000-0000000000e6","quantity":50,"unit":"MT","selling_rate":1800}]');
  perform public.create_trip(jsonb_build_object('order_id', o ->> 'id', 'material_id', '00000000-0000-4000-8000-0000000000e6',
      'provider_id', '00000000-0000-4000-8000-0000000000e7', 'transporter_id', '00000000-0000-4000-8000-0000000000e8',
      'vehicle_id', '00000000-0000-4000-8000-0000000000e9', 'freight_amount', 5000),
    jsonb_build_object('gross', 42, 'tare', 14, 'measured_at', now()), jsonb_build_object('gross', 41.5, 'tare', 14, 'measured_at', now()));
end $s$;

-- 1. Dashboard
insert into _o select 'dash', public.dashboard_summary();
select is((select (v -> 'kpis' ->> 'activeOrders')::int from _o where k = 'dash'), 1, 'dashboard: active orders');
select is((select (v -> 'kpis' ->> 'dispatchedMT')::numeric from _o where k = 'dash'), 28.00, 'dashboard: dispatched MT this month');
select is((select (v -> 'kpis' ->> 'documentsStaff')::int + (v -> 'kpis' ->> 'documentsDriver')::int from _o where k = 'dash'), 3,
  'dashboard: documents split by staff upload / driver link');
select is((select jsonb_array_length(v -> 'automation' -> 'daily') from _o where k = 'dash'), 14, 'dashboard: 14-day automation chart');
select is((select (v -> 'automation' ->> 'failed')::int from _o where k = 'dash'), 1, 'dashboard: failed documents');
select ok((select v -> 'insights' ->> 'topCustomer' is null from _o where k = 'dash'), 'insights come only from records (no invoices yet → none)');

-- 2. Reports
select is((public.report_run('daily') -> 'rows' -> 0 ->> 'trips')::int, 1, 'daily report counts the trip');
select is((public.report_run('vehicle-trips', null, null, '{"vehicle_id":"00000000-0000-4000-8000-0000000000e9"}') -> 'rows' -> 0 ->> 'vehicle'),
  'MH12OP0001', 'vehicle filter applied');
select is(jsonb_array_length(public.report_run('order-pl') -> 'rows'), 1, 'order-wise P&L for the owner');
select throws_ok($$ select public.report_run('nope') $$, '22023', null, 'unknown report rejected');

-- 3. Audit log is read-only, even for the owner through the API
select ok((select count(*) > 0 from public.audit_logs where business_id = '00000000-0000-4000-8000-00000000b007'), 'owner reads the audit log');
select throws_ok($$ update public.audit_logs set reason = 'x' where business_id = '00000000-0000-4000-8000-00000000b007' $$,
  '42501', null, 'owner cannot update audit entries');
select throws_ok($$ delete from public.audit_logs where business_id = '00000000-0000-4000-8000-00000000b007' $$,
  '42501', null, 'owner cannot delete audit entries');

-- 4. Jobs and cost guards
select is((select count(*) from public.v_failed_jobs), 1::bigint, 'failed job visible to the owner');
select is(public.retry_failed_jobs(), 1, 'retry all failed');
select is((select status::text from public.document_jobs where id = '00000000-0000-4000-8000-0000000000f4'), 'queued', 'job queued again');
select throws_ok($$ select public.reprocess_document('00000000-0000-4000-8000-0000000000f3') $$, '22023', null,
  'a hash duplicate is never sent to the AI again');

-- 5. Error log
select lives_ok($$ select public.log_client_error('TypeError: x is undefined', '{"route":"/trips","token":"abc"}') $$, 'client error logged');
select is((select count(*) from public.error_logs where business_id = '00000000-0000-4000-8000-00000000b007'), 1::bigint, 'owner reads error log');
select ok((select not (context ? 'token') from public.error_logs where business_id = '00000000-0000-4000-8000-00000000b007'), 'token stripped from context');
select throws_ok($$ insert into public.error_logs (source, message) values ('x', 'y') $$, '42501', null, 'no direct writes to error_logs');

-- Viewer (view_records only)
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d3","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000d3', true);
select throws_ok($$ select public.report_run('order-pl') $$, '42501', null, 'finance reports need view_financial_reports');
select is((public.report_run('shortage') ->> 'title'), 'Shortage Report', 'operations reports open to view_records');
select is((public.dashboard_summary() -> 'kpis' ->> 'customerOutstanding')::numeric, 0::numeric, 'money hidden on the dashboard without finance access');
select is((select count(*) from public.audit_logs), 0::bigint, 'employees cannot read the audit log');
select is((select count(*) from public.error_logs), 0::bigint, 'employees cannot read the error log');
select throws_ok($$ select public.retry_failed_jobs() $$, '42501', null, 'retry needs review_documents');
select throws_ok($$ select public.run_housekeeping() $$, '42501', null, 'housekeeping is not callable by users');

-- 6. RLS review
reset role;
select is((select count(*) from pg_tables where schemaname = 'public' and not rowsecurity), 0::bigint,
  'every public table has row level security');
select is((select count(*) from information_schema.role_table_grants
            where grantee = 'anon' and table_schema = 'public' and privilege_type in ('INSERT', 'UPDATE', 'DELETE')), 0::bigint,
  'anonymous role cannot write any public table');

select * from finish();
rollback;
