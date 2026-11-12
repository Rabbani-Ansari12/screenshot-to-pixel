-- pgTAP tests for bills, reconciliation, invoicing, payments, profit and stock rules
-- (migration 20261111120000). Everything is rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(48);

-- Fixtures: business, owner, accountant (verify_bills + record_payments), viewer.
insert into public.businesses (id, name) values ('00000000-0000-4000-8000-00000000b006', 'Finance Test Business');
insert into public.app_settings (business_id) values ('00000000-0000-4000-8000-00000000b006');
insert into auth.users (id, email, raw_app_meta_data) values
  ('00000000-0000-4000-8000-0000000000e1', 'fin.owner@example.com',
   '{"role":"owner","is_active":true,"business_id":"00000000-0000-4000-8000-00000000b006"}'),
  ('00000000-0000-4000-8000-0000000000e2', 'fin.accounts@example.com',
   '{"is_active":true,"business_id":"00000000-0000-4000-8000-00000000b006"}'),
  ('00000000-0000-4000-8000-0000000000e3', 'fin.viewer@example.com',
   '{"is_active":true,"business_id":"00000000-0000-4000-8000-00000000b006"}');
insert into public.user_permissions (business_id, profile_id, permission) values
  ('00000000-0000-4000-8000-00000000b006', '00000000-0000-4000-8000-0000000000e2', 'view_records'),
  ('00000000-0000-4000-8000-00000000b006', '00000000-0000-4000-8000-0000000000e2', 'verify_bills'),
  ('00000000-0000-4000-8000-00000000b006', '00000000-0000-4000-8000-0000000000e2', 'record_payments'),
  ('00000000-0000-4000-8000-00000000b006', '00000000-0000-4000-8000-0000000000e2', 'view_financial_reports'),
  ('00000000-0000-4000-8000-00000000b006', '00000000-0000-4000-8000-0000000000e3', 'view_records');
insert into public.customers (id, business_id, name, gstin, state, credit_days) values
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-00000000b006', 'Fin Builders', '27AAAAA0000A1Z5', 'Maharashtra', 15),
  ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-00000000b006', 'Fin Karnataka', '29BBBBB0000B1Z5', 'Karnataka', 30);
insert into public.construction_sites (id, business_id, customer_id, name) values
  ('00000000-0000-4000-8000-0000000000f3', '00000000-0000-4000-8000-00000000b006', '00000000-0000-4000-8000-0000000000f1', 'Fin Site'),
  ('00000000-0000-4000-8000-0000000000f4', '00000000-0000-4000-8000-00000000b006', '00000000-0000-4000-8000-0000000000f2', 'Fin Site KA');
insert into public.materials (id, business_id, name, category, unit, selling_rate, purchase_rate, gst_rate) values
  ('00000000-0000-4000-8000-0000000000f5', '00000000-0000-4000-8000-00000000b006', 'Fin Sand', 'Sand', 'MT', 1800, 1400, 5);
insert into public.material_providers (id, business_id, name) values
  ('00000000-0000-4000-8000-0000000000f6', '00000000-0000-4000-8000-00000000b006', 'Fin Quarry');
insert into public.provider_materials (business_id, provider_id, material_id) values
  ('00000000-0000-4000-8000-00000000b006', '00000000-0000-4000-8000-0000000000f6', '00000000-0000-4000-8000-0000000000f5');
insert into public.transporters (id, business_id, name, rate_per_trip) values
  ('00000000-0000-4000-8000-0000000000f7', '00000000-0000-4000-8000-00000000b006', 'Fin Haulage', 5800);
insert into public.transporters (id, business_id, name, rate_basis, rate_per_mt) values
  ('00000000-0000-4000-8000-0000000000fa', '00000000-0000-4000-8000-00000000b006', 'Fin Tonnage', 'per_mt', 200);
insert into public.vehicles (id, business_id, transporter_id, vehicle_number) values
  ('00000000-0000-4000-8000-0000000000f8', '00000000-0000-4000-8000-00000000b006', '00000000-0000-4000-8000-0000000000f7', 'MH12FN0001'),
  ('00000000-0000-4000-8000-0000000000f9', '00000000-0000-4000-8000-00000000b006', '00000000-0000-4000-8000-0000000000f7', 'MH12FN0002'),
  ('00000000-0000-4000-8000-0000000000fb', '00000000-0000-4000-8000-00000000b006', '00000000-0000-4000-8000-0000000000fa', 'MH14FN0003');
insert into public.stock_locations (id, business_id, name) values
  ('00000000-0000-4000-8000-0000000000fc', '00000000-0000-4000-8000-00000000b006', 'Fin Yard');
create temporary table _f (k text primary key, id uuid, v jsonb);
grant all on _f to public;
create temporary table _profit (estimated_profit numeric);
grant all on _profit to public;

-- Operations as the owner: order, direct purchase, three delivered trips + one loaded.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e1","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000e1', true);
do $s$ declare r jsonb; begin
  r := public.create_order(
  '{"customer_id":"00000000-0000-4000-8000-0000000000f1","site_id":"00000000-0000-4000-8000-0000000000f3"}',
  '[{"material_id":"00000000-0000-4000-8000-0000000000f5","quantity":100,"unit":"MT","selling_rate":1800}]');
  insert into _f values ('order', (r ->> 'id')::uuid, r);
end $s$;
do $s$ declare r jsonb; begin
  r := public.create_purchase(
  jsonb_build_object('provider_id', '00000000-0000-4000-8000-0000000000f6', 'delivery_mode', 'direct_to_site',
                     'order_id', (select id from _f where k = 'order'), 'purchase_date', '2026-11-10'),
  '[{"material_id":"00000000-0000-4000-8000-0000000000f5","quantity":80,"unit":"MT","rate":1450}]');
  insert into _f values ('purchase', (r ->> 'id')::uuid, r);
end $s$;
do $s$ declare r jsonb; begin
  r := public.create_trip(
  jsonb_build_object('order_id', (select id from _f where k = 'order'), 'material_id', '00000000-0000-4000-8000-0000000000f5',
    'provider_id', '00000000-0000-4000-8000-0000000000f6', 'purchase_id', (select id from _f where k = 'purchase'),
    'transporter_id', '00000000-0000-4000-8000-0000000000f7', 'vehicle_id', '00000000-0000-4000-8000-0000000000f8', 'freight_amount', 5800),
  '{"gross":42.12,"tare":14,"measured_at":"2026-11-10T09:00:00+05:30"}', '{"gross":41.55,"tare":14,"measured_at":"2026-11-10T12:00:00+05:30"}');
  insert into _f values ('t1', (r ->> 'id')::uuid, r);
end $s$;
do $s$ declare r jsonb; begin
  r := public.create_trip(
  jsonb_build_object('order_id', (select id from _f where k = 'order'), 'material_id', '00000000-0000-4000-8000-0000000000f5',
    'provider_id', '00000000-0000-4000-8000-0000000000f6', 'purchase_id', (select id from _f where k = 'purchase'),
    'transporter_id', '00000000-0000-4000-8000-0000000000f7', 'vehicle_id', '00000000-0000-4000-8000-0000000000f9', 'freight_amount', 5800),
  '{"gross":40,"tare":14,"measured_at":"2026-11-11T09:00:00+05:30"}', '{"gross":39.9,"tare":14,"measured_at":"2026-11-11T12:00:00+05:30"}');
  insert into _f values ('t2', (r ->> 'id')::uuid, r);
end $s$;
do $s$ declare r jsonb; begin
  r := public.create_trip(
  jsonb_build_object('order_id', (select id from _f where k = 'order'), 'material_id', '00000000-0000-4000-8000-0000000000f5',
    'provider_id', '00000000-0000-4000-8000-0000000000f6', 'purchase_id', (select id from _f where k = 'purchase'),
    'transporter_id', '00000000-0000-4000-8000-0000000000f7', 'vehicle_id', '00000000-0000-4000-8000-0000000000f8', 'freight_amount', 5800),
  '{"gross":41,"tare":14,"measured_at":"2026-11-12T09:00:00+05:30"}', null);
  insert into _f values ('t3', (r ->> 'id')::uuid, r);
end $s$;
do $s$ declare r jsonb; begin
  r := public.create_trip(
  jsonb_build_object('order_id', (select id from _f where k = 'order'), 'material_id', '00000000-0000-4000-8000-0000000000f5',
    'provider_id', '00000000-0000-4000-8000-0000000000f6',
    'transporter_id', '00000000-0000-4000-8000-0000000000fa', 'vehicle_id', '00000000-0000-4000-8000-0000000000fb'),
  '{"gross":44,"tare":14,"measured_at":"2026-11-20T09:00:00+05:30"}', '{"gross":43.8,"tare":14,"measured_at":"2026-11-20T12:00:00+05:30"}');
  insert into _f values ('t4', (r ->> 'id')::uuid, r);
end $s$;

do $s$ declare r jsonb; begin
  r := public.create_order(
  '{"customer_id":"00000000-0000-4000-8000-0000000000f2","site_id":"00000000-0000-4000-8000-0000000000f4"}',
  '[{"material_id":"00000000-0000-4000-8000-0000000000f5","quantity":2,"unit":"MT","selling_rate":2000}]');
  insert into _f values ('order2', (r ->> 'id')::uuid, r);
end $s$;

-- Viewer: no finance actions
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e3","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000e3', true);
select throws_ok($$ select public.create_bill('provider', '{"party_id":"00000000-0000-4000-8000-0000000000f6","bill_number":"X","bill_date":"2026-11-12","total_amount":1}', '[]') $$,
  '42501', null, 'a viewer cannot enter bills');
select throws_ok($$ select public.create_invoice(jsonb_build_object('order_id', (select id from _f where k = 'order')), array[(select id from _f where k = 't1')]) $$,
  '42501', null, 'a viewer cannot create invoices');
select throws_ok($$ select public.record_payment('{"party_type":"customer","party_id":"00000000-0000-4000-8000-0000000000f1","amount":10,"mode":"cash"}') $$,
  '42501', null, 'a viewer cannot record payments');
select is((select count(*) from public.v_payment_list), 0::bigint, 'a viewer sees no payments');

-- Accountant
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e2","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000e2', true);

-- 1. Provider bill: exact match
do $s$ declare r jsonb; begin
  r := public.create_bill('provider',
  '{"party_id":"00000000-0000-4000-8000-0000000000f6","bill_number":"FQ-101","bill_date":"2026-11-13","total_amount":117450}',
  '[{"date":"2026-11-10","vehicle_number":"MH 12 FN 0001","quantity":28.12,"rate":1450,"amount":40774},
    {"date":"2026-11-11","vehicle_number":"MH12FN0002","quantity":26,"rate":1450,"amount":37700},
    {"date":"2026-11-12","vehicle_number":"MH12FN0001","quantity":27,"rate":1450,"amount":39150}]');
  insert into _f values ('pb', (r ->> 'id')::uuid, r);
end $s$;
select is((select v ->> 'recon_status' from _f where k = 'pb'), 'matched', 'exact provider bill is Matched');
select is((select billed_amount - recorded_amount from public.reconciliation_records where provider_bill_id = (select id from _f where k = 'pb')),
  0::numeric, 'billed and recorded amounts agree');
select is((select count(*) from public.provider_bill_items where bill_id = (select id from _f where k = 'pb') and trip_id is not null),
  3::bigint, 'every bill line is linked to its trip');

-- 2. Duplicate bill
select throws_ok($$ select public.create_bill('provider', '{"party_id":"00000000-0000-4000-8000-0000000000f6","bill_number":"fq 101","bill_date":"2026-11-13","total_amount":5}', '[]') $$,
  '22023', null, 'same party + bill number is rejected as a duplicate');
select throws_ok($$ insert into public.reconciliation_records (bill_type, provider_bill_id, status) values ('provider_bill', (select id from _f where k = 'pb'), 'reconciled') $$,
  '42501', null, 'reconciliation records cannot be written directly');

-- 3. Transporter bill: extra trip billed, rate difference, unbilled trip
do $s$ declare r jsonb; begin
  r := public.create_bill('transporter',
  '{"party_id":"00000000-0000-4000-8000-0000000000f7","bill_number":"FH-9","bill_date":"2026-11-14","total_amount":17800,"period_from":"2026-11-10","period_to":"2026-11-12"}',
  '[{"date":"2026-11-10","vehicle_number":"MH12FN0001","amount":5800},
    {"date":"2026-11-11","vehicle_number":"MH12FN0002","amount":6200},
    {"date":"2026-11-12","vehicle_number":"MH12ZZ9999","amount":5800}]');
  insert into _f values ('tb', (r ->> 'id')::uuid, r);
end $s$;
select is((select v ->> 'recon_status' from _f where k = 'tb'), 'mismatch', 'transporter bill with differences is Mismatch');
select is((select string_agg(l ->> 'state', ',' order by l ->> 'state') from public.reconciliation_records r, jsonb_array_elements(r.detail -> 'lines') l
            where r.transporter_bill_id = (select id from _f where k = 'tb')),
  'matched,missing_on_bill,not_in_system,rate_differs', 'per-line detail: matched, rate differs, extra billed trip, unbilled trip');
select ok((select reason ~ '1 billed trip\(s\) not in the system' and reason ~ '1 recorded trip\(s\) not billed'
             from public.reconciliation_records where transporter_bill_id = (select id from _f where k = 'tb')),
  'the reason is readable');

-- 4. Decisions
select throws_ok($$ select public.decide_reconciliation('transporter_bill', (select id from _f where k = 'tb'), 'approve_difference', '') $$,
  '22023', null, 'approving a difference needs a note');
select throws_ok($$ select public.decide_reconciliation('transporter_bill', (select id from _f where k = 'tb'), 'mark_reconciled', null) $$,
  '22023', null, 'open differences cannot be marked reconciled');
select is(public.decide_reconciliation('transporter_bill', (select id from _f where k = 'tb'), 'approve_difference', 'Waiting charge agreed'),
  'difference_approved'::public.recon_status, 'difference approved with a note');
select is(public.reconcile_transporter_bill((select id from _f where k = 'tb')), 'difference_approved'::public.recon_status,
  're-checking unchanged figures keeps the decision');
select is(public.decide_reconciliation('transporter_bill', (select id from _f where k = 'tb'), 'mark_reconciled', null),
  'reconciled'::public.recon_status, 'then marked reconciled');
select is((select freight_amount from public.truck_trips where id = (select id from _f where k = 't2')), 5800::numeric,
  'reconciliation never changes the trip');

-- 5. Per-MT transporter
select is((public.create_bill('transporter',
  '{"party_id":"00000000-0000-4000-8000-0000000000fa","bill_number":"FT-1","bill_date":"2026-11-14","total_amount":6000}',
  '[{"date":"2026-11-20","vehicle_number":"MH14FN0003","quantity":30,"rate":200,"amount":6000}]')) ->> 'recon_status', 'matched',
  'per-MT bill: 30 MT x 200 matches');

-- 6. Invoices: GST, double invoicing, partial
select throws_ok($$ select public.create_invoice(jsonb_build_object('order_id', (select id from _f where k = 'order')), array[(select id from _f where k = 't3')]) $$,
  '22023', null, 'an undelivered trip cannot be invoiced');
do $s$ declare r jsonb; begin
  r := public.create_invoice(
  jsonb_build_object('order_id', (select id from _f where k = 'order'), 'invoice_date', '2026-11-14'),
  array[(select id from _f where k = 't1')]);
  insert into _f values ('inv1', (r ->> 'id')::uuid, r);
end $s$;
select is((select gst_mode::text || ' ' || subtotal || ' ' || cgst_amount || ' ' || sgst_amount || ' ' || igst_amount || ' ' || total_amount
             from public.customer_invoices where id = (select id from _f where k = 'inv1')),
  'cgst_sgst 49590.00 1239.75 1239.75 0.00 52069.50', 'intra-state: 27.55 MT x 1800 + 2.5% CGST + 2.5% SGST');
select ok((select invoice_number ~ '^INV-2026-[0-9]{4}$' from public.customer_invoices where id = (select id from _f where k = 'inv1')),
  'invoice numbered from settings');
select throws_ok($$ select public.create_invoice(jsonb_build_object('order_id', (select id from _f where k = 'order')), array[(select id from _f where k = 't1')]) $$,
  '23505', null, 'the same delivery cannot be invoiced twice');
do $s$ declare r jsonb; begin
  r := public.create_invoice(
  jsonb_build_object('order_id', (select id from _f where k = 'order'), 'invoice_date', '2026-11-15'),
  array[(select id from _f where k = 't2')], '[]', '[{"label":"Unloading","amount":1000}]');
  insert into _f values ('inv2', (r ->> 'id')::uuid, r);
end $s$;
select is((select total_amount from public.customer_invoices where id = (select id from _f where k = 'inv2')),
  (25.9 * 1800 * 1.05 + 1000)::numeric(14,2), 'partial invoice with an additional charge');
select is((select recon_status::text from public.customer_invoices where id = (select id from _f where k = 'inv1')), 'matched',
  'invoice matches confirmed deliveries');
select throws_ok($$ select public.create_invoice(jsonb_build_object('order_id', (select id from _f where k = 'order2')), '{}',
  jsonb_build_array(jsonb_build_object('order_item_id', (select id from public.order_items where order_id = (select id from _f where k = 'order2')), 'quantity', 3))) $$,
  '22023', null, 'cannot invoice more than ordered');
do $s$ declare r jsonb; begin
  r := public.create_invoice(
  jsonb_build_object('order_id', (select id from _f where k = 'order2')), '{}',
  jsonb_build_array(jsonb_build_object('order_item_id', (select id from public.order_items where order_id = (select id from _f where k = 'order2')), 'quantity', 2)));
  insert into _f values ('inv3', (r ->> 'id')::uuid, r);
end $s$;
select is((select gst_mode::text || ' ' || igst_amount || ' ' || total_amount from public.customer_invoices where id = (select id from _f where k = 'inv3')),
  'igst 200.00 4200.00', 'inter-state: IGST');

-- 7. Payments
insert into _profit select estimated_profit from public.v_order_profit where order_id = (select id from _f where k = 'order');
select lives_ok($$ select public.record_payment(jsonb_build_object('party_type', 'customer', 'party_id', '00000000-0000-4000-8000-0000000000f1',
  'against_id', (select id from _f where k = 'inv1'), 'amount', 20000, 'mode', 'upi', 'reference', 'UTR-1')) $$, 'partial payment recorded');
select is((select paid_amount || ' ' || balance || ' ' || payment_status from public.v_invoice_list where id = (select id from _f where k = 'inv1')),
  '20000.00 32069.50 partial', 'remaining balance computed by the database');
select throws_ok($$ select public.record_payment(jsonb_build_object('party_type', 'customer', 'party_id', '00000000-0000-4000-8000-0000000000f1',
  'against_id', (select id from _f where k = 'inv1'), 'amount', 40000, 'mode', 'upi', 'reference', 'UTR-2')) $$,
  '22023', null, 'overpayment beyond the outstanding balance is rejected');
reset role;
update public.app_settings set payment_allocation = 'oldest_first' where business_id = '00000000-0000-4000-8000-00000000b006';
set local role authenticated;
select is(jsonb_array_length(public.record_payment('{"party_type":"customer","party_id":"00000000-0000-4000-8000-0000000000f1","amount":40000,"mode":"bank_transfer","reference":"NEFT-1"}') -> 'payment_ids'),
  2, 'oldest-first allocation splits across two invoices');
select is((select payment_status from public.v_invoice_list where id = (select id from _f where k = 'inv1')), 'paid', 'oldest invoice paid first');
select is((select paid_amount from public.v_invoice_list where id = (select id from _f where k = 'inv2')), 7930.50::numeric, 'the rest goes to the next invoice');
select is((select estimated_profit from public.v_order_profit where order_id = (select id from _f where k = 'order')),
  (select estimated_profit from _profit), 'customer cash received is never profit');
select throws_ok($$ select public.cancel_invoice((select id from _f where k = 'inv1'), 'mistake') $$, '22023', null,
  'an invoice with payments cannot be cancelled');

-- 8. Profit
insert into public.expenses (expense_date, category, amount, description, mode, order_id)
values ('2026-11-12', 'unloading', 900, 'Unloading crew', 'cash', (select id from _f where k = 'order'));
select is((select sales_value || ' ' || purchase_cost || ' ' || transport_cost from public.v_trip_economics where trip_id = (select id from _f where k = 't1')),
  '49590.00 40774.00 5800.00', 'trip economics: sales, purchase and transport');
select is((select transport_cost from public.v_trip_economics where trip_id = (select id from _f where k = 't2')), 6200.00::numeric(14,2),
  'billed freight is used once the bill covers the trip');
select is((select estimated_profit from public.v_order_profit where order_id = (select id from _f where k = 'order')),
  (select round(sum(sales_value) - sum(purchase_cost) - sum(transport_cost) - 900, 2) from public.v_trip_economics where order_id = (select id from _f where k = 'order')),
  'estimated profit = sales - purchase - transport - expenses');
select is((select profit_status from public.v_order_profit where order_id = (select id from _f where k = 'order')), 'estimated',
  'open order is Estimated');
select ok((select landed_per_unit > purchase_per_unit from public.v_landed_cost
            where material_id = '00000000-0000-4000-8000-0000000000f5' and provider_id = '00000000-0000-4000-8000-0000000000f6'),
  'landed cost includes transport');
select ok((select count(*) = 1 from public.v_monthly_profit where business_id = '00000000-0000-4000-8000-00000000b006' and month = '2026-11'),
  'monthly profit row');

-- 9. Settled profit: order fully billed, reconciled and paid
select is(public.decide_reconciliation('provider_bill', (select id from _f where k = 'pb'), 'mark_reconciled', null),
  'reconciled'::public.recon_status, 'provider bill reconciled');
select ok((select profit_status = 'estimated' from public.v_order_profit where order_id = (select id from _f where k = 'order')),
  'still Estimated while bills and invoices are unpaid');

-- 10. Stock
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e1","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000e1', true);
set local role authenticated;
select lives_ok($$ select public.create_purchase('{"provider_id":"00000000-0000-4000-8000-0000000000f6","delivery_mode":"stock_yard","stock_location_id":"00000000-0000-4000-8000-0000000000fc"}',
  '[{"material_id":"00000000-0000-4000-8000-0000000000f5","quantity":100,"unit":"MT","rate":1400}]') $$, 'yard purchase');
select is((select balance_qty from public.v_stock_balance where stock_location_id = '00000000-0000-4000-8000-0000000000fc'), 100.000::numeric(14,3),
  'yard purchase adds stock');
select is((select count(*) from public.stock_movements sm join public.stock_locations l on l.id = sm.stock_location_id
            where l.business_id = '00000000-0000-4000-8000-00000000b006' and sm.stock_location_id <> '00000000-0000-4000-8000-0000000000fc'),
  0::bigint, 'direct-to-site never changes yard stock');
select lives_ok($$ select public.adjust_stock('00000000-0000-4000-8000-0000000000fc', '00000000-0000-4000-8000-0000000000f5', -2, '2026-11-30', 'Monthly count') $$,
  'owner adjusts stock with a reason');
select is((select balance_qty from public.v_stock_balance where stock_location_id = '00000000-0000-4000-8000-0000000000fc'), 98.000::numeric(14,3),
  'adjustment applied');

reset role;
select * from finish();
rollback;
