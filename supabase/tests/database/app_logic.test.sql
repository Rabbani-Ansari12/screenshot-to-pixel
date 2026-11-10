-- pgTAP tests for the app RPCs and list views (migration 20261110130100_app_logic).
-- Run: npx supabase test db --linked   (or: npx tsx scripts/supabase-api.ts test)
-- Everything runs in one transaction and is rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(30);

-- Fixtures: a separate test business, an owner and an employee with view_records + manage_trips.
insert into public.businesses (id, name) values ('00000000-0000-4000-8000-00000000b002', 'RPC Test Business');
insert into public.app_settings (business_id) values ('00000000-0000-4000-8000-00000000b002');
insert into auth.users (id, email, raw_app_meta_data) values
  ('00000000-0000-4000-8000-0000000000a5', 'rpc.owner@example.com',
   '{"role":"owner","is_active":true,"business_id":"00000000-0000-4000-8000-00000000b002"}'),
  ('00000000-0000-4000-8000-0000000000a6', 'rpc.trips@example.com',
   '{"is_active":true,"business_id":"00000000-0000-4000-8000-00000000b002"}');
insert into public.user_permissions (business_id, profile_id, permission) values
  ('00000000-0000-4000-8000-00000000b002', '00000000-0000-4000-8000-0000000000a6', 'view_records'),
  ('00000000-0000-4000-8000-00000000b002', '00000000-0000-4000-8000-0000000000a6', 'manage_trips');

-- ---------------------------------------------------------------------------
-- Owner: masters
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a5","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a5', true);

select lives_ok(
  $$ select public.create_customer('{"name":"TAP Customer","city":"Pune"}'::jsonb, '{"name":"TAP Site"}'::jsonb) $$,
  'create_customer creates customer + site');
select is((select count(*) from public.construction_sites s join public.customers c on c.id = s.customer_id where c.name = 'TAP Customer'),
  1::bigint, 'the first site was created with the customer');
select lives_ok(
  $$ select public.create_material('{"name":"TAP Sand","category":"Sand","unit":"MT","purchase_rate":1480,"selling_rate":1860}'::jsonb) $$,
  'create_material creates the material');
select is((select shortage_tolerance from public.materials where name = 'TAP Sand'), 0.250::numeric(14,3),
  'new material takes the default tolerance from settings');
select is((select count(*) from public.material_rates r join public.materials m on m.id = r.material_id where m.name = 'TAP Sand'),
  2::bigint, 'opening purchase and selling rates are in the rate history');
select lives_ok(
  $$ select public.create_provider('{"name":"TAP Quarry"}'::jsonb, array[(select id from public.materials where name = 'TAP Sand')]) $$,
  'create_provider links supplied materials');
insert into public.transporters (name) values ('TAP Haulage');
insert into public.stock_locations (name) values ('TAP Yard');
select lives_ok(
  $$ select public.create_vehicle(
       jsonb_build_object('transporter_id', (select id from public.transporters where name = 'TAP Haulage'), 'vehicle_number', 'mh 12 tp 0001'),
       '{"full_name":"TAP Driver"}'::jsonb) $$,
  'create_vehicle creates vehicle + driver');
select ok((select default_driver_id is not null from public.vehicles where vehicle_number = 'MH 12 TP 0001'),
  'vehicle number is upper-cased and linked to its driver');

-- ---------------------------------------------------------------------------
-- Owner: orders and purchases (transactional)
-- ---------------------------------------------------------------------------
select lives_ok(
  $$ select public.create_order(
       jsonb_build_object('customer_id', (select id from public.customers where name = 'TAP Customer'),
                          'site_id', (select id from public.construction_sites where name = 'TAP Site'),
                          'customer_reference', 'TAP-PO-1'),
       jsonb_build_array(jsonb_build_object('material_id', (select id from public.materials where name = 'TAP Sand'),
                                            'quantity', 100, 'unit', 'MT', 'selling_rate', 1860))) $$,
  'create_order creates header + items');
select throws_ok(
  $$ select public.create_order(
       jsonb_build_object('customer_id', (select id from public.customers where name = 'TAP Customer'),
                          'site_id', (select id from public.construction_sites where name = 'TAP Site'),
                          'customer_reference', 'TAP-PO-2'),
       jsonb_build_array(jsonb_build_object('material_id', (select id from public.materials where name = 'TAP Sand'),
                                            'quantity', 10, 'unit', 'CUM', 'selling_rate', 1))) $$,
  '23514', null, 'an item in the wrong unit is rejected');
select is((select count(*) from public.customer_orders where customer_reference = 'TAP-PO-2'), 0::bigint,
  'the rejected order left no header row behind');
select lives_ok(
  $$ select public.create_purchase(
       jsonb_build_object('provider_id', (select id from public.material_providers where name = 'TAP Quarry'),
                          'delivery_mode', 'stock_yard',
                          'stock_location_id', (select id from public.stock_locations where name = 'TAP Yard')),
       jsonb_build_array(jsonb_build_object('material_id', (select id from public.materials where name = 'TAP Sand'),
                                            'quantity', 150, 'unit', 'MT', 'rate', 1450,
                                            'cost_breakdown', '[{"label":"Loading","amount":1200},{"label":"Toll","amount":300}]'::jsonb))) $$,
  'create_purchase records a stock-yard purchase');
select is((select pi.additional_costs from public.purchase_items pi join public.purchases p on p.id = pi.purchase_id
           where p.delivery_mode = 'stock_yard' and p.provider_id = (select id from public.material_providers where name = 'TAP Quarry')),
  1500.00::numeric(14,2), 'additional costs are the sum of the labelled breakdown');
select lives_ok(
  $$ select public.create_purchase(
       jsonb_build_object('provider_id', (select id from public.material_providers where name = 'TAP Quarry'),
                          'delivery_mode', 'direct_to_site',
                          'order_id', (select id from public.customer_orders where customer_reference = 'TAP-PO-1')),
       jsonb_build_array(jsonb_build_object('material_id', (select id from public.materials where name = 'TAP Sand'),
                                            'quantity', 30, 'unit', 'MT', 'rate', 1480))) $$,
  'create_purchase records a direct-to-site purchase');
select is((select count(*) from public.stock_movements where material_id = (select id from public.materials where name = 'TAP Sand')),
  1::bigint, 'only the stock-yard purchase created a stock movement');
select is((select total_amount from public.v_purchase_list where delivery_mode = 'stock_yard'
           and provider_id = (select id from public.material_providers where name = 'TAP Quarry')),
  219000.00::numeric(14,2), 'v_purchase_list total = quantity × rate + costs');

-- ---------------------------------------------------------------------------
-- Employee with manage_trips only
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a6","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a6', true);

select throws_ok(
  $$ select public.create_order(
       jsonb_build_object('customer_id', (select id from public.customers where name = 'TAP Customer'),
                          'site_id', (select id from public.construction_sites where name = 'TAP Site')),
       jsonb_build_array(jsonb_build_object('material_id', (select id from public.materials where name = 'TAP Sand'),
                                            'quantity', 1, 'unit', 'MT', 'selling_rate', 1))) $$,
  '42501', null, 'an employee without manage_orders cannot create orders');
select lives_ok(
  $$ select public.create_trip(
       jsonb_build_object('order_id', (select id from public.customer_orders where customer_reference = 'TAP-PO-1'),
                          'material_id', (select id from public.materials where name = 'TAP Sand'),
                          'provider_id', (select id from public.material_providers where name = 'TAP Quarry'),
                          'transporter_id', (select id from public.transporters where name = 'TAP Haulage'),
                          'vehicle_id', (select id from public.vehicles where vehicle_number = 'MH 12 TP 0001'),
                          'freight_amount', 5800),
       '{"gross":42.18,"tare":14.06,"slip_number":"TAP-WB-1"}'::jsonb,
       '{"gross":41.6,"tare":14.05,"slip_number":"TAP-SITE-1"}'::jsonb) $$,
  'an employee with manage_trips creates a trip with both weights');
select is((select tolerance_status::text || ' / ' || status::text || ' / ' || quantity_difference::text
           from public.v_trip_list where loading_slip_number = 'TAP-WB-1'),
  'confirmed_shortage / confirmed_shortage / 0.570',
  'difference 0.57 is above 2× the 0.25 tolerance: confirmed shortage');
select throws_ok(
  $$ select public.save_weight_record((select id from public.v_trip_list where loading_slip_number = 'TAP-WB-1'),
                                     'delivery', '{"gross":41.9,"tare":14.05}'::jsonb, null) $$,
  '22023', null, 'correcting a weight without a reason is rejected');
select lives_ok(
  $$ select public.save_weight_record((select id from public.v_trip_list where loading_slip_number = 'TAP-WB-1'),
                                     'delivery', '{"gross":41.9,"tare":14.05}'::jsonb, 'Site slip re-read') $$,
  'correcting a weight with a reason works');
select is((select tolerance_status::text from public.v_trip_list where loading_slip_number = 'TAP-WB-1'),
  'needs_verification', 'the delivery check is recalculated after the correction (0.27)');
select lives_ok(
  $$ select public.record_trip_investigation((select id from public.v_trip_list where loading_slip_number = 'TAP-WB-1'),
                                            'moisture_or_spillage_loss', 'Wet sand', 'delivered') $$,
  'record_trip_investigation stores the outcome');
select throws_ok(
  $$ select public.set_material_tolerances(jsonb_build_object((select id from public.materials where name = 'TAP Sand')::text, 0.5)) $$,
  '42501', null, 'only the owner changes tolerances');

-- ---------------------------------------------------------------------------
-- Owner again: corrections need a reason; audit captures old/new/user/reason
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a5","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a5', true);

select throws_ok(
  $$ select public.update_order((select id from public.customer_orders where customer_reference = 'TAP-PO-1'),
       jsonb_build_object('customer_id', (select id from public.customers where name = 'TAP Customer'),
                          'site_id', (select id from public.construction_sites where name = 'TAP Site'),
                          'customer_reference', 'TAP-PO-1'),
       jsonb_build_array(jsonb_build_object('material_id', (select id from public.materials where name = 'TAP Sand'),
                                            'quantity', 120, 'unit', 'MT', 'selling_rate', 1860)), null) $$,
  '22023', null, 'changing an ordered quantity without a reason is rejected');
select lives_ok(
  $$ select public.update_order((select id from public.customer_orders where customer_reference = 'TAP-PO-1'),
       jsonb_build_object('customer_id', (select id from public.customers where name = 'TAP Customer'),
                          'site_id', (select id from public.construction_sites where name = 'TAP Site'),
                          'customer_reference', 'TAP-PO-1'),
       jsonb_build_array(jsonb_build_object('material_id', (select id from public.materials where name = 'TAP Sand'),
                                            'quantity', 120, 'unit', 'MT', 'selling_rate', 1860)), 'Customer revised PO') $$,
  'changing an ordered quantity with a reason works');
select is((select required_qty from public.v_order_list where customer_reference = 'TAP-PO-1'), 120.000::numeric(14,3),
  'v_order_list shows the new quantity');
select is(public.set_material_tolerances(jsonb_build_object((select id from public.materials where name = 'TAP Sand')::text, 0.5)),
  1, 'the owner changes a tolerance');

reset role;
select is((select reason || ' / ' || (old_data ->> 'gross') || ' → ' || (new_data ->> 'gross') from public.audit_logs
           where table_name = 'weight_records' and action = 'UPDATE' and changed_by = '00000000-0000-4000-8000-0000000000a6'),
  'Site slip re-read / 41.600 → 41.900', 'audit keeps old and new weight, the employee and the reason');
select is((select reason from public.audit_logs a join public.order_items oi on oi.id = a.record_id
           where a.table_name = 'order_items' and a.action = 'UPDATE' and a.business_id = '00000000-0000-4000-8000-00000000b002'),
  'Customer revised PO', 'the order quantity change is audited with its reason');

select * from finish();
rollback;
