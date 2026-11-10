-- pgTAP tests for RLS and database business rules.
-- Run: npx supabase test db --linked   (everything runs in one transaction and is rolled back;
-- only sequence counters such as trip codes advance, which is harmless).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(37);

-- ---------------------------------------------------------------------------
-- Fixtures (as the test runner / postgres). A separate test business so real data is untouched.
-- ---------------------------------------------------------------------------
insert into public.businesses (id, name) values ('00000000-0000-4000-8000-00000000b001', 'RLS Test Business');
insert into public.app_settings (business_id, next_invoice_number) values ('00000000-0000-4000-8000-00000000b001', 901);

insert into auth.users (id, email, raw_app_meta_data) values
  ('00000000-0000-4000-8000-0000000000a1', 'owner.test@example.com',
   '{"role":"owner","is_active":true,"business_id":"00000000-0000-4000-8000-00000000b001"}'),
  ('00000000-0000-4000-8000-0000000000a2', 'noperm.test@example.com',
   '{"is_active":true,"business_id":"00000000-0000-4000-8000-00000000b001"}'),
  ('00000000-0000-4000-8000-0000000000a3', 'viewer.test@example.com',
   '{"is_active":true,"business_id":"00000000-0000-4000-8000-00000000b001"}'),
  ('00000000-0000-4000-8000-0000000000a4', 'inactive.test@example.com',
   '{"business_id":"00000000-0000-4000-8000-00000000b001"}');

insert into public.user_permissions (business_id, profile_id, permission) values
  ('00000000-0000-4000-8000-00000000b001', '00000000-0000-4000-8000-0000000000a3', 'view_records'),
  ('00000000-0000-4000-8000-00000000b001', '00000000-0000-4000-8000-0000000000a4', 'view_records');

insert into public.customers (id, business_id, name) values
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-00000000b001', 'Test Builder');
insert into public.construction_sites (id, business_id, customer_id, name) values
  ('00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-00000000b001', '00000000-0000-4000-8000-0000000000c1', 'Test Site');
insert into public.materials (id, business_id, name, category, unit, shortage_tolerance, purchase_rate, selling_rate) values
  ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-00000000b001', 'Test Sand', 'Sand', 'MT', 0.3, 1480, 1860);
insert into public.material_providers (id, business_id, name) values
  ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-00000000b001', 'Test Quarry');
insert into public.transporters (id, business_id, name) values
  ('00000000-0000-4000-8000-0000000000d3', '00000000-0000-4000-8000-00000000b001', 'Test Haulage');
insert into public.vehicles (id, business_id, transporter_id, vehicle_number) values
  ('00000000-0000-4000-8000-0000000000d4', '00000000-0000-4000-8000-00000000b001', '00000000-0000-4000-8000-0000000000d3', 'MH 12 ZZ 0001');
insert into public.stock_locations (id, business_id, name) values
  ('00000000-0000-4000-8000-0000000000d5', '00000000-0000-4000-8000-00000000b001', 'Test Yard');
insert into public.customer_orders (id, business_id, customer_id, site_id) values
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-00000000b001', '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000c2');
insert into public.payments (business_id, direction, party_type, customer_id, amount, mode, reference) values
  ('00000000-0000-4000-8000-00000000b001', 'incoming', 'customer', '00000000-0000-4000-8000-0000000000c1', 1000, 'upi', 'UPI/TEST');

-- ---------------------------------------------------------------------------
-- Structure
-- ---------------------------------------------------------------------------
select is(
  (select count(*) from pg_tables where schemaname = 'public' and not rowsecurity), 0::bigint,
  'RLS is enabled on every table in public');
select ok(exists (select 1 from storage.buckets where id = 'documents' and not public), 'private documents bucket exists');
select is((select count(*) from public.profiles where id::text like '00000000-0000-4000-8000-0000000000a%'), 4::bigint,
  'new auth users get a profile');
select is((select is_active from public.profiles where id = '00000000-0000-4000-8000-0000000000a4'), false,
  'accounts are inactive unless activated via app_metadata');

-- ---------------------------------------------------------------------------
-- Business rules
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ insert into public.order_items (business_id, order_id, material_id, quantity, unit, selling_rate)
     values ('00000000-0000-4000-8000-00000000b001', '00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000d1', 10, 'CUM', 1860) $$,
  '23514', null, 'unit must match the material (no MT <-> volume conversion)');

-- Stock rule
insert into public.purchases (id, business_id, provider_id, order_id, delivery_mode) values
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-00000000b001', '00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000e1', 'direct_to_site');
insert into public.purchase_items (id, business_id, purchase_id, material_id, quantity, unit, rate) values
  ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-00000000b001', '00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000d1', 30, 'MT', 1480);
select is((select count(*) from public.stock_movements where purchase_item_id = '00000000-0000-4000-8000-0000000000f2'), 0::bigint,
  'direct-to-site purchase creates no stock movement');

insert into public.purchases (id, business_id, provider_id, delivery_mode, stock_location_id) values
  ('00000000-0000-4000-8000-0000000000f3', '00000000-0000-4000-8000-00000000b001', '00000000-0000-4000-8000-0000000000d2', 'stock_yard', '00000000-0000-4000-8000-0000000000d5');
insert into public.purchase_items (business_id, purchase_id, material_id, quantity, unit, rate) values
  ('00000000-0000-4000-8000-00000000b001', '00000000-0000-4000-8000-0000000000f3', '00000000-0000-4000-8000-0000000000d1', 150, 'MT', 1450);
select is((select sum(quantity) from public.stock_movements where stock_location_id = '00000000-0000-4000-8000-0000000000d5'), 150.000,
  'stock-yard purchase creates a received movement');
select throws_ok(
  $$ insert into public.stock_movements (business_id, stock_location_id, material_id, movement_type, quantity, movement_date, purchase_item_id)
     values ('00000000-0000-4000-8000-00000000b001', '00000000-0000-4000-8000-0000000000d5', '00000000-0000-4000-8000-0000000000d1', 'received', 5, current_date, '00000000-0000-4000-8000-0000000000f2') $$,
  '23514', null, 'a stock movement can never be recorded for a direct-to-site purchase');
select throws_ok(
  $$ update public.purchases set delivery_mode = 'stock_yard', order_id = null, stock_location_id = '00000000-0000-4000-8000-0000000000d5'
     where id = '00000000-0000-4000-8000-0000000000f1' $$,
  '23514', null, 'delivery mode cannot change once items exist');

-- Trip codes
insert into public.truck_trips (id, business_id, order_id, material_id, purchase_id, transporter_id, vehicle_id, site_id) values
  ('00000000-0000-4000-8000-0000000000a5', '00000000-0000-4000-8000-00000000b001', '00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000d3', '00000000-0000-4000-8000-0000000000d4', '00000000-0000-4000-8000-0000000000c2'),
  ('00000000-0000-4000-8000-0000000000a6', '00000000-0000-4000-8000-00000000b001', '00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000d1', null, '00000000-0000-4000-8000-0000000000d3', '00000000-0000-4000-8000-0000000000d4', '00000000-0000-4000-8000-0000000000c2');
update public.truck_trips set stock_location_id = '00000000-0000-4000-8000-0000000000d5' where id = '00000000-0000-4000-8000-0000000000a6';
select ok((select bool_and(trip_code ~ '^TRP-[0-9]{4}-[0-9]{5,}$') from public.truck_trips where business_id = '00000000-0000-4000-8000-00000000b001'),
  'trip codes look like TRP-2026-00123');
select is((select count(distinct trip_code) from public.truck_trips where business_id = '00000000-0000-4000-8000-00000000b001'), 2::bigint,
  'each trip gets a different code');
select throws_ok(
  $$ update public.truck_trips set trip_code = (select trip_code from public.truck_trips where id = '00000000-0000-4000-8000-0000000000a5')
     where id = '00000000-0000-4000-8000-0000000000a6' $$,
  '23505', null, 'trip codes are unique');

-- Weights and tolerance
insert into public.weight_records (business_id, trip_id, record_type, gross, tare, printed_net, measured_at) values
  ('00000000-0000-4000-8000-00000000b001', '00000000-0000-4000-8000-0000000000a5', 'loading', 42.18, 14.06, 27.52, now());
select is((select calculated_net from public.weight_records where trip_id = '00000000-0000-4000-8000-0000000000a5'), 28.120,
  'calculated_net = gross - tare');
select ok((select has_net_mismatch from public.weight_records where trip_id = '00000000-0000-4000-8000-0000000000a5'),
  'mismatch between printed net and gross - tare is flagged');
insert into public.weight_records (business_id, trip_id, record_type, gross, tare, measured_at) values
  ('00000000-0000-4000-8000-00000000b001', '00000000-0000-4000-8000-0000000000a5', 'delivery', 41.6, 14.05, now());
select is((select quantity_difference from public.delivery_records where trip_id = '00000000-0000-4000-8000-0000000000a5'), 0.570,
  'quantity difference = loading net - delivered net');
select is((select tolerance_status::text from public.delivery_records where trip_id = '00000000-0000-4000-8000-0000000000a5'), 'needs_verification',
  'difference between 1x and 2x tolerance needs verification');
select is((select status::text from public.truck_trips where id = '00000000-0000-4000-8000-0000000000a5'), 'needs_verification',
  'trip status follows the tolerance check');
select is(public.tolerance_status_for(0.2, 0.3)::text, 'normal', 'within tolerance is normal');
select is(public.tolerance_status_for(0.7, 0.3)::text, 'confirmed_shortage', 'above 2x tolerance is a confirmed shortage');

insert into public.weight_records (business_id, trip_id, record_type, gross, tare, measured_at) values
  ('00000000-0000-4000-8000-00000000b001', '00000000-0000-4000-8000-0000000000a6', 'loading', 40, 14, now());
select is((select balance_qty from public.v_stock_balance where stock_location_id = '00000000-0000-4000-8000-0000000000d5'), 124.000,
  'yard trip issues stock (150 - 26)');

-- Bills never touch trips
insert into public.provider_bills (id, business_id, provider_id, bill_number, bill_date, total_amount) values
  ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-00000000b001', '00000000-0000-4000-8000-0000000000d2', 'TEST/1', current_date, 50000);
create temporary table _trip_before as select * from public.truck_trips where id = '00000000-0000-4000-8000-0000000000a5';
insert into public.reconciliation_records (business_id, bill_type, provider_bill_id, billed_amount, recorded_amount, status, note) values
  ('00000000-0000-4000-8000-00000000b001', 'provider_bill', '00000000-0000-4000-8000-0000000000b2', 50000, 41617.60, 'disputed', 'Rate above agreed');
select is((select recon_status::text from public.provider_bills where id = '00000000-0000-4000-8000-0000000000b2'), 'disputed',
  'reconciliation decision is mirrored on the bill');
select ok((select t.updated_at = b.updated_at and t.status = b.status from public.truck_trips t, _trip_before b where t.id = b.id),
  'reconciliation does not modify trips');

-- Audit immutability (even for the database owner)
select ok((select count(*) from public.audit_logs where business_id = '00000000-0000-4000-8000-00000000b001') > 5, 'changes are audited');
select throws_ok($$ update public.audit_logs set table_name = 'x' $$, '42501', null, 'audit_logs cannot be updated');
select throws_ok($$ delete from public.audit_logs $$, '42501', null, 'audit_logs cannot be deleted');

-- ---------------------------------------------------------------------------
-- RLS as different users
-- ---------------------------------------------------------------------------
-- Owner
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true);
select is((select count(*) from public.customers), 1::bigint, 'owner sees customers');
select is((select count(*) from public.payments), 1::bigint, 'owner sees payments');
select ok((select count(*) from public.audit_logs) > 0, 'owner reads the audit log');
select throws_ok($$ update public.audit_logs set table_name = 'x' $$, '42501', null, 'owner cannot update the audit log');
select lives_ok(
  $$ insert into public.customer_orders (customer_id, site_id) values ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000c2') $$,
  'owner can create orders (business_id filled automatically)');

-- Employee with no permissions
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a2","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a2', true);
select is((select count(*) from public.customers), 0::bigint, 'employee without view_records sees no customers');
select is((select count(*) from public.v_trip_summary), 0::bigint, 'views also hide data from that employee');
select throws_ok(
  $$ insert into public.customer_orders (customer_id, site_id) values ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000c2') $$,
  '42501', null, 'employee without manage_orders cannot create orders');

-- Employee with view_records only
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a3","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a3', true);
select is((select count(*) from public.customers), 1::bigint, 'employee with view_records sees customers');
select is((select count(*) from public.payments), 0::bigint, 'view_records does not reveal payments (financial permission needed)');
select is((select count(*) from public.audit_logs), 0::bigint, 'employees cannot read the audit log');

-- Inactive account with a permission row
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a4","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a4', true);
select is((select count(*) from public.customers), 0::bigint, 'inactive accounts see nothing even with permissions');

reset role;
select * from finish();
rollback;
