-- =============================================================================
-- App logic for the live frontend:
--   * audit_logs.reason (why a quantity / rate was corrected)
--   * provider_materials link table, purchase cost breakdown
--   * list views used for server-side pagination, filtering, sorting and search
--   * transactional RPCs for writes that touch several tables
-- All RPCs are SECURITY INVOKER: RLS and permissions of the caller still apply.
-- =============================================================================

-- ---------- Audit: reason for a change ----------
alter table public.audit_logs add column if not exists reason text;
comment on column public.audit_logs.reason is 'Why the change was made. Set by RPCs through the app.change_reason setting (required for quantity / rate corrections).';

create or replace function public.audit_row_change()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_old jsonb;
  v_new jsonb;
begin
  if tg_op in ('UPDATE', 'DELETE') then v_old := to_jsonb(old); end if;
  if tg_op in ('INSERT', 'UPDATE') then v_new := to_jsonb(new); end if;
  if tg_op = 'UPDATE' and (v_old - 'updated_at' - 'updated_by') = (v_new - 'updated_at' - 'updated_by') then
    return new;
  end if;
  insert into public.audit_logs (business_id, table_name, record_id, action, old_data, new_data, changed_by, reason)
  values (
    coalesce((v_new ->> 'business_id')::uuid, (v_old ->> 'business_id')::uuid),
    tg_table_name,
    coalesce((v_new ->> 'id')::uuid, (v_old ->> 'id')::uuid),
    tg_op::public.audit_action,
    v_old,
    v_new,
    auth.uid(),
    nullif(current_setting('app.change_reason', true), '')
  );
  return coalesce(new, old);
end
$$;

-- Audit master-data changes too (customers, sites, parties, vehicles, drivers, yards).
create trigger customers_audit after insert or update or delete on public.customers for each row execute function public.audit_row_change();
create trigger construction_sites_audit after insert or update or delete on public.construction_sites for each row execute function public.audit_row_change();
create trigger material_providers_audit after insert or update or delete on public.material_providers for each row execute function public.audit_row_change();
create trigger transporters_audit after insert or update or delete on public.transporters for each row execute function public.audit_row_change();
create trigger drivers_audit after insert or update or delete on public.drivers for each row execute function public.audit_row_change();
create trigger vehicles_audit after insert or update or delete on public.vehicles for each row execute function public.audit_row_change();
create trigger stock_locations_audit after insert or update or delete on public.stock_locations for each row execute function public.audit_row_change();

-- ---------- Purchase cost breakdown ----------
alter table public.purchase_items
  add column if not exists cost_breakdown jsonb not null default '[]'::jsonb
  check (jsonb_typeof(cost_breakdown) = 'array');
comment on column public.purchase_items.cost_breakdown is 'Labelled additional costs, e.g. [{"label":"Loading","amount":1200}]. additional_costs is their total.';

-- ---------- Which materials a provider supplies ----------
create table public.provider_materials (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null default public.current_business_id() references public.businesses (id),
  provider_id uuid not null references public.material_providers (id) on delete cascade,
  material_id uuid not null references public.materials (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_by uuid default auth.uid() references auth.users (id) on delete set null,
  unique (provider_id, material_id)
);
create index provider_materials_business_id_idx on public.provider_materials (business_id);
create index provider_materials_material_id_idx on public.provider_materials (material_id);
create trigger provider_materials_set_updated_at before update on public.provider_materials for each row execute function public.set_updated_at();
create trigger provider_materials_audit after insert or update or delete on public.provider_materials for each row execute function public.audit_row_change();
alter table public.provider_materials enable row level security;
create policy provider_materials_select on public.provider_materials for select to authenticated using (business_id = (select public.current_business_id()) and (select public.has_permission('view_records')));
create policy provider_materials_insert on public.provider_materials for insert to authenticated with check (business_id = (select public.current_business_id()) and (select public.has_permission('manage_orders')));
create policy provider_materials_update on public.provider_materials for update to authenticated using (business_id = (select public.current_business_id()) and (select public.has_permission('manage_orders'))) with check (business_id = (select public.current_business_id()) and (select public.has_permission('manage_orders')));
create policy provider_materials_delete on public.provider_materials for delete to authenticated using (business_id = (select public.current_business_id()) and (select public.has_permission('manage_orders')));
revoke all on public.provider_materials from anon;
revoke truncate, references, trigger on public.provider_materials from authenticated;

-- ---------- List views (security_invoker: the caller's RLS applies) ----------

-- One row per trip with both weights, difference, tolerance status and investigation.
create view public.v_trip_list with (security_invoker = true) as
select
  t.id,
  t.business_id,
  t.trip_code,
  t.status,
  t.source,
  t.order_id,
  o.order_code,
  o.customer_id,
  c.name as customer_name,
  t.site_id,
  s.name as site_name,
  t.order_item_id,
  t.material_id,
  m.name as material_name,
  m.unit,
  t.purchase_id,
  pu.purchase_code,
  t.stock_location_id,
  sl.name as stock_location_name,
  t.provider_id,
  p.name as provider_name,
  t.transporter_id,
  tr.name as transporter_name,
  t.vehicle_id,
  v.vehicle_number,
  t.driver_id,
  d.full_name as driver_name,
  t.freight_amount,
  lw.id as loading_weight_id,
  lw.gross as loading_gross,
  lw.tare as loading_tare,
  lw.printed_net as loading_printed_net,
  lw.net_quantity as loading_net,
  lw.has_net_mismatch as loading_net_mismatch,
  lw.slip_number as loading_slip_number,
  lw.measured_at as loaded_at,
  lw.location as loading_location,
  lw.measurement_method as loading_method,
  lw.source as loading_source,
  lw.document_id as loading_document_id,
  dw.id as delivery_weight_id,
  dw.gross as delivery_gross,
  dw.tare as delivery_tare,
  dw.printed_net as delivery_printed_net,
  dw.net_quantity as delivered_net,
  dw.has_net_mismatch as delivery_net_mismatch,
  dw.slip_number as delivery_slip_number,
  dw.measured_at as delivered_at,
  dw.location as delivery_location,
  dw.measurement_method as delivery_method,
  dw.source as delivery_source,
  dw.document_id as delivery_document_id,
  (lw.net_quantity - dw.net_quantity)::numeric(14,3) as quantity_difference,
  coalesce(dr.tolerance, m.shortage_tolerance) as tolerance,
  public.tolerance_status_for(lw.net_quantity - dw.net_quantity, coalesce(dr.tolerance, m.shortage_tolerance)) as tolerance_status,
  dr.investigation_outcome,
  dr.investigation_notes,
  dr.investigated_at,
  ip.full_name as investigated_by_name,
  (select count(*) from public.documents doc where doc.trip_id = t.id and doc.deleted_at is null)::integer as document_count,
  coalesce(lw.measured_at, t.created_at) as sort_at,
  t.created_at
from public.truck_trips t
join public.customer_orders o on o.id = t.order_id
join public.customers c on c.id = o.customer_id
join public.construction_sites s on s.id = t.site_id
join public.materials m on m.id = t.material_id
join public.transporters tr on tr.id = t.transporter_id
join public.vehicles v on v.id = t.vehicle_id
left join public.purchases pu on pu.id = t.purchase_id
left join public.stock_locations sl on sl.id = t.stock_location_id
left join public.material_providers p on p.id = t.provider_id
left join public.drivers d on d.id = t.driver_id
left join public.weight_records lw on lw.trip_id = t.id and lw.record_type = 'loading' and lw.deleted_at is null
left join public.weight_records dw on dw.trip_id = t.id and dw.record_type = 'delivery' and dw.deleted_at is null
left join public.delivery_records dr on dr.trip_id = t.id
left join public.profiles ip on ip.id = dr.investigated_by
where t.deleted_at is null;

-- One row per order with item summary, progress and estimated profit.
create view public.v_order_list with (security_invoker = true) as
select
  o.id,
  o.business_id,
  o.order_code,
  o.customer_id,
  c.name as customer_name,
  o.site_id,
  s.name as site_name,
  o.order_date,
  o.customer_reference,
  o.expected_delivery,
  o.status,
  o.notes,
  o.created_at,
  o.created_by,
  cp.full_name as created_by_name,
  coalesce(items.materials_label, '') as materials_label,
  coalesce(items.material_ids, '{}') as material_ids,
  case when items.unit_count = 1 then items.first_unit::text else 'mixed' end as unit_label,
  coalesce(items.required_qty, 0)::numeric(14,3) as required_qty,
  coalesce(items.order_value, 0)::numeric(14,2) as order_value,
  coalesce(progress.trip_count, 0)::integer as trip_count,
  coalesce(progress.dispatched_qty, 0)::numeric(14,3) as dispatched_qty,
  coalesce(progress.delivered_qty, 0)::numeric(14,3) as delivered_qty,
  coalesce(pf.estimated_profit, 0)::numeric(14,2) as estimated_profit
from public.customer_orders o
join public.customers c on c.id = o.customer_id
join public.construction_sites s on s.id = o.site_id
left join lateral (
  select string_agg(m.name, ', ' order by oi.created_at) as materials_label,
         array_agg(oi.material_id order by oi.created_at) as material_ids,
         count(distinct oi.unit) as unit_count,
         min(oi.unit::text) as first_unit,
         sum(oi.quantity) as required_qty,
         sum(round(oi.quantity * oi.selling_rate, 2)) as order_value
  from public.order_items oi join public.materials m on m.id = oi.material_id
  where oi.order_id = o.id
) items on true
left join lateral (
  select count(*) as trip_count, sum(w.loading_net) as dispatched_qty, sum(w.delivered_net) as delivered_qty
  from public.truck_trips t left join public.v_trip_weights w on w.trip_id = t.id
  where t.order_id = o.id and t.deleted_at is null and t.status <> 'cancelled'
) progress on true
left join public.v_order_profit pf on pf.order_id = o.id
left join public.profiles cp on cp.id = o.created_by
where o.deleted_at is null;

-- One row per purchase (the app records one material per purchase; extra items are summed).
create view public.v_purchase_list with (security_invoker = true) as
select
  p.id,
  p.business_id,
  p.purchase_code,
  p.provider_id,
  mp.name as provider_name,
  p.order_id,
  o.order_code,
  c.name as customer_name,
  p.purchase_date,
  p.delivery_mode,
  p.stock_location_id,
  sl.name as stock_location_name,
  p.status,
  p.source,
  p.notes,
  p.created_at,
  fi.id as purchase_item_id,
  fi.material_id,
  m.name as material_name,
  fi.unit,
  fi.rate,
  coalesce(fi.cost_breakdown, '[]'::jsonb) as cost_breakdown,
  coalesce(tot.quantity, 0)::numeric(14,3) as quantity,
  coalesce(tot.additional_costs, 0)::numeric(14,2) as additional_costs,
  coalesce(tot.base_amount, 0)::numeric(14,2) as base_amount,
  (coalesce(tot.base_amount, 0) + coalesce(tot.additional_costs, 0))::numeric(14,2) as total_amount,
  (select count(*) from public.truck_trips t where t.purchase_id = p.id and t.deleted_at is null)::integer as trip_count,
  coalesce((select array_agg(d.id) from public.documents d where d.purchase_id = p.id and d.deleted_at is null), '{}') as document_ids
from public.purchases p
join public.material_providers mp on mp.id = p.provider_id
left join public.customer_orders o on o.id = p.order_id
left join public.customers c on c.id = o.customer_id
left join public.stock_locations sl on sl.id = p.stock_location_id
left join lateral (
  select x.* from public.purchase_items x where x.purchase_id = p.id order by x.created_at, x.id limit 1
) fi on true
left join public.materials m on m.id = fi.material_id
left join lateral (
  select sum(x.quantity) as quantity, sum(x.additional_costs) as additional_costs, sum(round(x.quantity * x.rate, 2)) as base_amount
  from public.purchase_items x where x.purchase_id = p.id
) tot on true
where p.deleted_at is null;

-- Stock ledger with the running balance per yard and material.
create view public.v_stock_ledger with (security_invoker = true) as
select
  sm.id,
  sm.business_id,
  sm.stock_location_id,
  l.name as stock_location_name,
  sm.material_id,
  m.name as material_name,
  m.unit,
  sm.movement_type,
  sm.quantity,
  sm.movement_date,
  sm.notes,
  case when sm.purchase_item_id is not null then 'purchase'
       when sm.weight_record_id is not null then 'trip'
       else 'adjustment' end as reference_type,
  coalesce(pu.purchase_code, t.trip_code) as reference_code,
  coalesce(pu.id, t.id) as reference_id,
  sum(sm.quantity) over (
    partition by sm.stock_location_id, sm.material_id
    order by sm.movement_date, sm.created_at, sm.id
    rows unbounded preceding
  )::numeric(14,3) as balance_after,
  sm.created_at
from public.stock_movements sm
join public.stock_locations l on l.id = sm.stock_location_id
join public.materials m on m.id = sm.material_id
left join public.purchase_items pi on pi.id = sm.purchase_item_id
left join public.purchases pu on pu.id = pi.purchase_id
left join public.weight_records w on w.id = sm.weight_record_id
left join public.truck_trips t on t.id = w.trip_id;

create view public.v_material_stats with (security_invoker = true) as
select
  m.id as material_id,
  m.business_id,
  coalesce((select sum(sm.quantity) from public.stock_movements sm where sm.material_id = m.id), 0)::numeric(14,3) as yard_stock,
  coalesce((select sum(w.delivered_net) from public.truck_trips t join public.v_trip_weights w on w.trip_id = t.id
            where t.material_id = m.id and t.deleted_at is null and t.status <> 'cancelled'), 0)::numeric(14,3) as delivered_qty,
  (select count(distinct oi.order_id) from public.order_items oi join public.customer_orders o on o.id = oi.order_id
    where oi.material_id = m.id and o.deleted_at is null)::integer as order_count
from public.materials m
where m.deleted_at is null;

create view public.v_provider_stats with (security_invoker = true) as
select
  p.id as provider_id,
  p.business_id,
  coalesce((
    select array_agg(distinct x.material_id) from (
      select pm.material_id from public.provider_materials pm where pm.provider_id = p.id
      union
      select pi.material_id from public.purchase_items pi join public.purchases pu on pu.id = pi.purchase_id
       where pu.provider_id = p.id and pu.deleted_at is null
    ) x
  ), '{}') as material_ids,
  (select count(*) from public.purchases pu where pu.provider_id = p.id and pu.deleted_at is null)::integer as purchase_count,
  coalesce((select sum(round(pi.quantity * pi.rate, 2) + pi.additional_costs) from public.purchase_items pi
            join public.purchases pu on pu.id = pi.purchase_id
            where pu.provider_id = p.id and pu.deleted_at is null), 0)::numeric(14,2) as purchase_value
from public.material_providers p
where p.deleted_at is null;

create view public.v_customer_stats with (security_invoker = true) as
select
  c.id as customer_id,
  c.business_id,
  (select count(*) from public.construction_sites s where s.customer_id = c.id and s.deleted_at is null)::integer as site_count,
  (select count(*) from public.customer_orders o where o.customer_id = c.id and o.deleted_at is null
     and o.status in ('confirmed', 'in_progress', 'on_hold'))::integer as active_orders
from public.customers c
where c.deleted_at is null;

revoke all on public.v_trip_list, public.v_order_list, public.v_purchase_list, public.v_stock_ledger,
  public.v_material_stats, public.v_provider_stats, public.v_customer_stats from anon;
grant select on public.v_trip_list, public.v_order_list, public.v_purchase_list, public.v_stock_ledger,
  public.v_material_stats, public.v_provider_stats, public.v_customer_stats to authenticated, service_role;

-- Indexes for the new list filters / sorts.
create index if not exists truck_trips_status_idx on public.truck_trips (business_id, status) where deleted_at is null;
create index if not exists weight_records_measured_at_idx on public.weight_records (trip_id, record_type, measured_at) where deleted_at is null;
create index if not exists customer_orders_order_date_idx on public.customer_orders (business_id, order_date desc) where deleted_at is null;
create index if not exists purchases_purchase_date_idx on public.purchases (business_id, purchase_date desc) where deleted_at is null;
create index if not exists stock_movements_ledger_idx on public.stock_movements (stock_location_id, material_id, movement_date, created_at);

-- ---------- Transactional RPCs ----------

-- Helper: raise a friendly validation error.
create function public.app_fail(p_message text)
returns void
language plpgsql volatile set search_path = ''
as $$
begin
  raise exception '%', p_message using errcode = '22023';
end
$$;

-- Customer (+ optional first site).
create function public.create_customer(p_customer jsonb, p_site jsonb default null)
returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.customers (name, customer_type, gstin, contact_name, phone, email, city, state, billing_address, credit_days)
  values (
    trim(p_customer ->> 'name'),
    nullif(p_customer ->> 'customer_type', ''),
    nullif(upper(trim(coalesce(p_customer ->> 'gstin', ''))), ''),
    nullif(p_customer ->> 'contact_name', ''),
    nullif(p_customer ->> 'phone', ''),
    nullif(p_customer ->> 'email', ''),
    nullif(p_customer ->> 'city', ''),
    nullif(p_customer ->> 'state', ''),
    nullif(p_customer ->> 'billing_address', ''),
    coalesce((p_customer ->> 'credit_days')::integer, 30)
  )
  returning id into v_id;

  if p_site is not null and coalesce(trim(p_site ->> 'name'), '') <> '' then
    insert into public.construction_sites (customer_id, name, address, city, contact_name, contact_phone)
    values (v_id, trim(p_site ->> 'name'), nullif(p_site ->> 'address', ''), nullif(p_site ->> 'city', ''),
            nullif(p_site ->> 'contact_name', ''), nullif(p_site ->> 'contact_phone', ''));
  end if;
  return v_id;
end
$$;

-- Provider (+ the materials they supply).
create function public.create_provider(p_provider jsonb, p_material_ids uuid[] default '{}')
returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.material_providers (name, city, gstin, contact_name, phone, payment_terms_days)
  values (
    trim(p_provider ->> 'name'),
    nullif(p_provider ->> 'city', ''),
    nullif(upper(trim(coalesce(p_provider ->> 'gstin', ''))), ''),
    nullif(p_provider ->> 'contact_name', ''),
    nullif(p_provider ->> 'phone', ''),
    coalesce((p_provider ->> 'payment_terms_days')::integer, 30)
  )
  returning id into v_id;

  insert into public.provider_materials (provider_id, material_id)
  select v_id, x from unnest(coalesce(p_material_ids, '{}')) as x
  on conflict do nothing;
  return v_id;
end
$$;

-- Vehicle (+ its regular driver).
create function public.create_vehicle(p_vehicle jsonb, p_driver jsonb default null)
returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare
  v_driver uuid;
  v_id uuid;
  v_transporter uuid := (p_vehicle ->> 'transporter_id')::uuid;
begin
  if p_driver is not null and coalesce(trim(p_driver ->> 'full_name'), '') <> '' then
    insert into public.drivers (transporter_id, full_name, phone, license_number)
    values (v_transporter, trim(p_driver ->> 'full_name'), nullif(p_driver ->> 'phone', ''), nullif(p_driver ->> 'license_number', ''))
    returning id into v_driver;
  end if;

  insert into public.vehicles (transporter_id, default_driver_id, vehicle_number, vehicle_type, capacity_mt)
  values (v_transporter, v_driver, upper(trim(p_vehicle ->> 'vehicle_number')),
          nullif(p_vehicle ->> 'vehicle_type', ''), nullif(p_vehicle ->> 'capacity_mt', '')::numeric)
  returning id into v_id;
  return v_id;
end
$$;

-- Material (+ opening purchase / selling rates in the rate history).
create function public.create_material(p_material jsonb)
returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare
  v_id uuid;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_purchase numeric := nullif(p_material ->> 'purchase_rate', '')::numeric;
  v_selling numeric := nullif(p_material ->> 'selling_rate', '')::numeric;
begin
  insert into public.materials (name, category, unit, hsn_code, gst_rate, purchase_rate, selling_rate, shortage_tolerance)
  values (
    trim(p_material ->> 'name'),
    coalesce(nullif(p_material ->> 'category', ''), 'Other'),
    (p_material ->> 'unit')::public.material_unit,
    nullif(p_material ->> 'hsn_code', ''),
    coalesce((p_material ->> 'gst_rate')::numeric, 5),
    v_purchase,
    v_selling,
    coalesce(
      nullif(p_material ->> 'shortage_tolerance', '')::numeric,
      (select s.default_shortage_tolerance from public.app_settings s where s.business_id = public.current_business_id()),
      0
    )
  )
  returning id into v_id;

  if v_purchase is not null then
    insert into public.material_rates (material_id, rate_type, rate, effective_from, notes)
    values (v_id, 'purchase', v_purchase, v_today, 'Opening rate');
  end if;
  if v_selling is not null then
    insert into public.material_rates (material_id, rate_type, rate, effective_from, notes)
    values (v_id, 'selling', v_selling, v_today, 'Opening rate');
  end if;
  return v_id;
end
$$;

-- Customer order + items in one transaction.
create function public.create_order(p_order jsonb, p_items jsonb)
returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  v_id uuid;
  v_code text;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    perform public.app_fail('An order needs at least one item.');
  end if;
  if (select count(*) <> count(distinct i ->> 'material_id') from jsonb_array_elements(p_items) i) then
    perform public.app_fail('Each material can appear only once in an order.');
  end if;

  insert into public.customer_orders (customer_id, site_id, order_date, customer_reference, expected_delivery, status, notes)
  values (
    (p_order ->> 'customer_id')::uuid,
    (p_order ->> 'site_id')::uuid,
    coalesce(nullif(p_order ->> 'order_date', '')::date, (now() at time zone 'Asia/Kolkata')::date),
    nullif(p_order ->> 'customer_reference', ''),
    nullif(p_order ->> 'expected_delivery', '')::date,
    coalesce(nullif(p_order ->> 'status', '')::public.order_status, 'confirmed'),
    nullif(p_order ->> 'notes', '')
  )
  returning id, order_code into v_id, v_code;

  insert into public.order_items (order_id, material_id, quantity, unit, selling_rate)
  select v_id, (i ->> 'material_id')::uuid, (i ->> 'quantity')::numeric,
         (i ->> 'unit')::public.material_unit, (i ->> 'selling_rate')::numeric
  from jsonb_array_elements(p_items) with ordinality as x(i, n)
  order by n;

  return jsonb_build_object('id', v_id, 'order_code', v_code);
end
$$;

-- Update an order and its items (matched by material). Changing or removing an existing
-- quantity / rate is a correction: it needs a reason, which is stored in the audit log.
create function public.update_order(p_order_id uuid, p_order jsonb, p_items jsonb, p_reason text default null)
returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  v_code text;
  v_correction boolean;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    perform public.app_fail('An order needs at least one item.');
  end if;
  if (select count(*) <> count(distinct i ->> 'material_id') from jsonb_array_elements(p_items) i) then
    perform public.app_fail('Each material can appear only once in an order.');
  end if;
  select o.order_code into v_code from public.customer_orders o where o.id = p_order_id and o.deleted_at is null;
  if v_code is null then
    perform public.app_fail('Order not found.');
  end if;

  select exists (
    select 1 from public.order_items oi
    left join jsonb_array_elements(p_items) i on (i ->> 'material_id')::uuid = oi.material_id
    where oi.order_id = p_order_id
      and (i is null or (i ->> 'quantity')::numeric <> oi.quantity or (i ->> 'selling_rate')::numeric <> oi.selling_rate)
  ) into v_correction;
  if v_correction and length(trim(coalesce(p_reason, ''))) < 3 then
    perform public.app_fail('Give a reason for changing ordered quantities or rates.');
  end if;
  perform set_config('app.change_reason', coalesce(trim(p_reason), ''), true);

  if exists (
    select 1 from public.order_items oi
    where oi.order_id = p_order_id
      and not exists (select 1 from jsonb_array_elements(p_items) i where (i ->> 'material_id')::uuid = oi.material_id)
      and exists (select 1 from public.truck_trips t where t.order_item_id = oi.id and t.deleted_at is null)
  ) then
    perform public.app_fail('An item that already has trips cannot be removed.');
  end if;

  update public.customer_orders set
    customer_id = (p_order ->> 'customer_id')::uuid,
    site_id = (p_order ->> 'site_id')::uuid,
    order_date = coalesce(nullif(p_order ->> 'order_date', '')::date, order_date),
    customer_reference = nullif(p_order ->> 'customer_reference', ''),
    expected_delivery = nullif(p_order ->> 'expected_delivery', '')::date,
    status = coalesce(nullif(p_order ->> 'status', '')::public.order_status, status),
    notes = nullif(p_order ->> 'notes', '')
  where id = p_order_id;

  delete from public.order_items oi
  where oi.order_id = p_order_id
    and not exists (select 1 from jsonb_array_elements(p_items) i where (i ->> 'material_id')::uuid = oi.material_id);

  update public.order_items oi set
    quantity = (i ->> 'quantity')::numeric,
    unit = (i ->> 'unit')::public.material_unit,
    selling_rate = (i ->> 'selling_rate')::numeric
  from jsonb_array_elements(p_items) i
  where oi.order_id = p_order_id and oi.material_id = (i ->> 'material_id')::uuid;

  insert into public.order_items (order_id, material_id, quantity, unit, selling_rate)
  select p_order_id, (i ->> 'material_id')::uuid, (i ->> 'quantity')::numeric,
         (i ->> 'unit')::public.material_unit, (i ->> 'selling_rate')::numeric
  from jsonb_array_elements(p_items) i
  where not exists (select 1 from public.order_items oi where oi.order_id = p_order_id and oi.material_id = (i ->> 'material_id')::uuid);

  perform set_config('app.change_reason', '', true);
  return jsonb_build_object('id', p_order_id, 'order_code', v_code);
end
$$;

-- Purchase + items in one transaction. Stock-yard items create stock (trigger); direct-to-site never do.
create function public.create_purchase(p_purchase jsonb, p_items jsonb)
returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  v_id uuid;
  v_code text;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    perform public.app_fail('A purchase needs at least one item.');
  end if;

  insert into public.purchases (provider_id, order_id, purchase_date, delivery_mode, stock_location_id, source, notes)
  values (
    (p_purchase ->> 'provider_id')::uuid,
    nullif(p_purchase ->> 'order_id', '')::uuid,
    coalesce(nullif(p_purchase ->> 'purchase_date', '')::date, (now() at time zone 'Asia/Kolkata')::date),
    (p_purchase ->> 'delivery_mode')::public.delivery_mode,
    nullif(p_purchase ->> 'stock_location_id', '')::uuid,
    coalesce(nullif(p_purchase ->> 'source', '')::public.record_source, 'manual'),
    nullif(p_purchase ->> 'notes', '')
  )
  returning id, purchase_code into v_id, v_code;

  insert into public.purchase_items (purchase_id, material_id, quantity, unit, rate, additional_costs, cost_breakdown)
  select v_id, (i ->> 'material_id')::uuid, (i ->> 'quantity')::numeric, (i ->> 'unit')::public.material_unit,
         (i ->> 'rate')::numeric,
         coalesce((select sum((c ->> 'amount')::numeric) from jsonb_array_elements(coalesce(i -> 'cost_breakdown', '[]')) c), 0),
         coalesce(i -> 'cost_breakdown', '[]')
  from jsonb_array_elements(p_items) with ordinality as x(i, n)
  order by n;

  insert into public.provider_materials (provider_id, material_id)
  select distinct (p_purchase ->> 'provider_id')::uuid, (i ->> 'material_id')::uuid from jsonb_array_elements(p_items) i
  on conflict do nothing;

  return jsonb_build_object('id', v_id, 'purchase_code', v_code);
end
$$;

-- Trip + loading weight (+ delivery weight) in one transaction. Delivery records, tolerance
-- status, trip status and yard stock issues follow from the weight triggers.
create function public.create_trip(p_trip jsonb, p_loading jsonb, p_delivery jsonb default null)
returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  v_order public.customer_orders%rowtype;
  v_material uuid := (p_trip ->> 'material_id')::uuid;
  v_item uuid;
  v_yard uuid := nullif(p_trip ->> 'stock_location_id', '')::uuid;
  v_provider uuid := nullif(p_trip ->> 'provider_id', '')::uuid;
  v_purchase uuid := nullif(p_trip ->> 'purchase_id', '')::uuid;
  v_vehicle public.vehicles%rowtype;
  v_driver uuid := nullif(p_trip ->> 'driver_id', '')::uuid;
  v_id uuid;
  v_code text;
begin
  select * into v_order from public.customer_orders o where o.id = (p_trip ->> 'order_id')::uuid and o.deleted_at is null;
  if v_order.id is null then
    perform public.app_fail('Order not found.');
  end if;
  if v_order.status in ('cancelled', 'completed') then
    perform public.app_fail('Trips cannot be added to a ' || v_order.status::text || ' order.');
  end if;
  select oi.id into v_item from public.order_items oi
   where oi.order_id = v_order.id and oi.material_id = v_material order by oi.created_at limit 1;
  if v_item is null then
    perform public.app_fail('This material is not part of the order.');
  end if;
  select * into v_vehicle from public.vehicles v where v.id = (p_trip ->> 'vehicle_id')::uuid and v.deleted_at is null;
  if v_vehicle.id is null then
    perform public.app_fail('Vehicle not found.');
  end if;
  if v_vehicle.transporter_id <> (p_trip ->> 'transporter_id')::uuid then
    perform public.app_fail('The vehicle does not belong to the selected transporter.');
  end if;
  if v_yard is null and v_provider is null then
    perform public.app_fail('Choose the provider or the stock yard the material was loaded from.');
  end if;
  if v_yard is not null then
    v_provider := null;
    v_purchase := null;
  elsif v_purchase is null then
    select p.id into v_purchase
    from public.purchases p join public.purchase_items pi on pi.purchase_id = p.id
    where p.order_id = v_order.id and p.provider_id = v_provider and pi.material_id = v_material
      and p.deleted_at is null and p.delivery_mode = 'direct_to_site'
    order by p.purchase_date desc, p.created_at desc limit 1;
  end if;

  insert into public.truck_trips (order_id, order_item_id, material_id, purchase_id, stock_location_id, provider_id,
                                  transporter_id, vehicle_id, driver_id, site_id, status, freight_amount, source, notes)
  values (v_order.id, v_item, v_material, v_purchase, v_yard, v_provider,
          v_vehicle.transporter_id, v_vehicle.id, coalesce(v_driver, v_vehicle.default_driver_id), v_order.site_id,
          'in_transit', coalesce(nullif(p_trip ->> 'freight_amount', '')::numeric, 0),
          coalesce(nullif(p_trip ->> 'source', '')::public.record_source, 'manual'), nullif(p_trip ->> 'notes', ''))
  returning id, trip_code into v_id, v_code;

  insert into public.weight_records (trip_id, record_type, gross, tare, printed_net, slip_number, vehicle_number,
                                     measured_at, location, source, measurement_method)
  values (v_id, 'loading', nullif(p_loading ->> 'gross', '')::numeric, nullif(p_loading ->> 'tare', '')::numeric,
          nullif(p_loading ->> 'printed_net', '')::numeric, nullif(p_loading ->> 'slip_number', ''), v_vehicle.vehicle_number,
          coalesce(nullif(p_loading ->> 'measured_at', '')::timestamptz, now()), nullif(p_loading ->> 'location', ''),
          'manual', coalesce(nullif(p_loading ->> 'measurement_method', '')::public.measurement_method, 'weighbridge'));

  if p_delivery is not null and jsonb_typeof(p_delivery) = 'object' then
    insert into public.weight_records (trip_id, record_type, gross, tare, printed_net, slip_number, vehicle_number,
                                       measured_at, location, source, measurement_method)
    values (v_id, 'delivery', nullif(p_delivery ->> 'gross', '')::numeric, nullif(p_delivery ->> 'tare', '')::numeric,
            nullif(p_delivery ->> 'printed_net', '')::numeric, nullif(p_delivery ->> 'slip_number', ''), v_vehicle.vehicle_number,
            coalesce(nullif(p_delivery ->> 'measured_at', '')::timestamptz, now()), nullif(p_delivery ->> 'location', ''),
            'manual', coalesce(nullif(p_delivery ->> 'measurement_method', '')::public.measurement_method, 'weighbridge'));
  end if;

  if v_order.status = 'confirmed' then
    update public.customer_orders set status = 'in_progress' where id = v_order.id;
  end if;
  return jsonb_build_object('id', v_id, 'trip_code', v_code);
end
$$;

-- Add or correct a trip's loading / delivery weight. Corrections need a reason (stored in the audit log).
create function public.save_weight_record(p_trip_id uuid, p_record_type public.weight_record_type, p_values jsonb, p_reason text default null)
returns void
language plpgsql security invoker set search_path = ''
as $$
declare
  v_existing uuid;
  v_vehicle text;
begin
  select w.id into v_existing from public.weight_records w
   where w.trip_id = p_trip_id and w.record_type = p_record_type and w.deleted_at is null;

  if v_existing is not null then
    if length(trim(coalesce(p_reason, ''))) < 3 then
      perform public.app_fail('Give a reason for correcting a recorded weight.');
    end if;
    perform set_config('app.change_reason', trim(p_reason), true);
    update public.weight_records set
      gross = nullif(p_values ->> 'gross', '')::numeric,
      tare = nullif(p_values ->> 'tare', '')::numeric,
      printed_net = nullif(p_values ->> 'printed_net', '')::numeric,
      slip_number = coalesce(nullif(p_values ->> 'slip_number', ''), slip_number),
      measured_at = coalesce(nullif(p_values ->> 'measured_at', '')::timestamptz, measured_at),
      location = coalesce(nullif(p_values ->> 'location', ''), location)
    where id = v_existing;
  else
    select v.vehicle_number into v_vehicle from public.truck_trips t join public.vehicles v on v.id = t.vehicle_id
     where t.id = p_trip_id and t.deleted_at is null;
    if v_vehicle is null then
      perform public.app_fail('Trip not found.');
    end if;
    perform set_config('app.change_reason', coalesce(trim(p_reason), ''), true);
    insert into public.weight_records (trip_id, record_type, gross, tare, printed_net, slip_number, vehicle_number,
                                       measured_at, location, source, measurement_method)
    values (p_trip_id, p_record_type, nullif(p_values ->> 'gross', '')::numeric, nullif(p_values ->> 'tare', '')::numeric,
            nullif(p_values ->> 'printed_net', '')::numeric, nullif(p_values ->> 'slip_number', ''), v_vehicle,
            coalesce(nullif(p_values ->> 'measured_at', '')::timestamptz, now()), nullif(p_values ->> 'location', ''),
            'manual', coalesce(nullif(p_values ->> 'measurement_method', '')::public.measurement_method, 'weighbridge'));
  end if;
  perform set_config('app.change_reason', '', true);
end
$$;

-- Record the outcome of a shortage check. Operational wording only, never "fraud".
create function public.record_trip_investigation(
  p_trip_id uuid,
  p_outcome public.investigation_outcome,
  p_notes text,
  p_status public.trip_status default null
)
returns void
language plpgsql security invoker set search_path = ''
as $$
begin
  if p_status is not null and p_status not in ('delivered', 'needs_verification', 'confirmed_shortage') then
    perform public.app_fail('Status after a shortage check must be delivered, needs verification or confirmed shortage.');
  end if;
  perform set_config('app.change_reason', coalesce(trim(p_notes), ''), true);
  update public.delivery_records set
    investigation_outcome = p_outcome,
    investigation_notes = nullif(trim(coalesce(p_notes, '')), ''),
    investigated_by = auth.uid(),
    investigated_at = now()
  where trip_id = p_trip_id;
  if not found then
    perform public.app_fail('This trip has no delivery record yet.');
  end if;
  if p_status is not null then
    update public.truck_trips set status = p_status where id = p_trip_id and status <> 'cancelled';
  end if;
  perform set_config('app.change_reason', '', true);
end
$$;

-- Settings: shortage tolerance per material ({ "<material id>": 0.25, ... }). Owner only.
create function public.set_material_tolerances(p_values jsonb)
returns integer
language plpgsql security invoker set search_path = ''
as $$
declare
  v_count integer;
begin
  if not public.is_owner() then
    raise exception 'Only the owner can change settings.' using errcode = '42501';
  end if;
  update public.materials m set shortage_tolerance = (e.value #>> '{}')::numeric
  from jsonb_each(p_values) e
  where m.id = e.key::uuid and m.shortage_tolerance is distinct from (e.value #>> '{}')::numeric;
  get diagnostics v_count = row_count;
  return v_count;
end
$$;

revoke execute on function public.app_fail(text) from public, anon;
revoke execute on function public.create_customer(jsonb, jsonb) from public, anon;
revoke execute on function public.create_provider(jsonb, uuid[]) from public, anon;
revoke execute on function public.create_vehicle(jsonb, jsonb) from public, anon;
revoke execute on function public.create_material(jsonb) from public, anon;
revoke execute on function public.create_order(jsonb, jsonb) from public, anon;
revoke execute on function public.update_order(uuid, jsonb, jsonb, text) from public, anon;
revoke execute on function public.create_purchase(jsonb, jsonb) from public, anon;
revoke execute on function public.create_trip(jsonb, jsonb, jsonb) from public, anon;
revoke execute on function public.save_weight_record(uuid, public.weight_record_type, jsonb, text) from public, anon;
revoke execute on function public.record_trip_investigation(uuid, public.investigation_outcome, text, public.trip_status) from public, anon;
revoke execute on function public.set_material_tolerances(jsonb) from public, anon;
grant execute on function public.app_fail(text) to authenticated, service_role;
grant execute on function public.create_customer(jsonb, jsonb) to authenticated, service_role;
grant execute on function public.create_provider(jsonb, uuid[]) to authenticated, service_role;
grant execute on function public.create_vehicle(jsonb, jsonb) to authenticated, service_role;
grant execute on function public.create_material(jsonb) to authenticated, service_role;
grant execute on function public.create_order(jsonb, jsonb) to authenticated, service_role;
grant execute on function public.update_order(uuid, jsonb, jsonb, text) to authenticated, service_role;
grant execute on function public.create_purchase(jsonb, jsonb) to authenticated, service_role;
grant execute on function public.create_trip(jsonb, jsonb, jsonb) to authenticated, service_role;
grant execute on function public.save_weight_record(uuid, public.weight_record_type, jsonb, text) to authenticated, service_role;
grant execute on function public.record_trip_investigation(uuid, public.investigation_outcome, text, public.trip_status) to authenticated, service_role;
grant execute on function public.set_material_tolerances(jsonb) to authenticated, service_role;
