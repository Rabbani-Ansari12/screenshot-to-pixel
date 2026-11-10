-- =============================================================================
-- Operations: customer orders, purchases, truck trips, weight & delivery records,
-- stock movements, plus the business-rule triggers that tie them together.
-- =============================================================================

create table public.customer_orders (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null default public.current_business_id() references public.businesses (id),
  order_code text not null unique default public.generate_code('ORD', 'public.order_code_seq', 4),
  customer_id uuid not null references public.customers (id),
  site_id uuid not null,
  order_date date not null default (now() at time zone 'Asia/Kolkata')::date,
  customer_reference text,
  expected_delivery date,
  status public.order_status not null default 'confirmed',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_by uuid default auth.uid() references auth.users (id) on delete set null,
  deleted_at timestamptz,
  foreign key (site_id, customer_id) references public.construction_sites (id, customer_id),
  check (expected_delivery is null or expected_delivery >= order_date)
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null default public.current_business_id() references public.businesses (id),
  order_id uuid not null references public.customer_orders (id) on delete cascade,
  material_id uuid not null references public.materials (id),
  quantity numeric(14,3) not null check (quantity > 0),
  unit public.material_unit not null,
  selling_rate numeric(14,2) not null check (selling_rate >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_by uuid default auth.uid() references auth.users (id) on delete set null
);

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null default public.current_business_id() references public.businesses (id),
  purchase_code text not null unique default public.generate_code('PUR', 'public.purchase_code_seq', 4),
  provider_id uuid not null references public.material_providers (id),
  order_id uuid references public.customer_orders (id),
  purchase_date date not null default (now() at time zone 'Asia/Kolkata')::date,
  delivery_mode public.delivery_mode not null,
  stock_location_id uuid references public.stock_locations (id),
  status public.purchase_status not null default 'recorded',
  source public.record_source not null default 'manual',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_by uuid default auth.uid() references auth.users (id) on delete set null,
  deleted_at timestamptz,
  -- Direct-to-site goes to an order's site and never touches stock; stock-yard goes to a yard.
  constraint purchases_delivery_target check (
    (delivery_mode = 'direct_to_site' and stock_location_id is null and order_id is not null)
    or (delivery_mode = 'stock_yard' and stock_location_id is not null and order_id is null)
  )
);

create table public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null default public.current_business_id() references public.businesses (id),
  purchase_id uuid not null references public.purchases (id) on delete cascade,
  material_id uuid not null references public.materials (id),
  quantity numeric(14,3) not null check (quantity > 0),
  unit public.material_unit not null,
  rate numeric(14,2) not null check (rate >= 0),
  additional_costs numeric(14,2) not null default 0 check (additional_costs >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_by uuid default auth.uid() references auth.users (id) on delete set null
);

create table public.truck_trips (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null default public.current_business_id() references public.businesses (id),
  trip_code text not null unique default public.generate_code('TRP', 'public.trip_code_seq', 5),
  order_id uuid not null references public.customer_orders (id),
  order_item_id uuid references public.order_items (id) on delete set null,
  material_id uuid not null references public.materials (id),
  -- origin: a direct purchase, or our own stock yard (never both)
  purchase_id uuid references public.purchases (id),
  stock_location_id uuid references public.stock_locations (id),
  provider_id uuid references public.material_providers (id),
  transporter_id uuid not null references public.transporters (id),
  vehicle_id uuid not null references public.vehicles (id),
  driver_id uuid references public.drivers (id),
  site_id uuid not null references public.construction_sites (id),
  status public.trip_status not null default 'loaded',
  freight_amount numeric(14,2) not null default 0 check (freight_amount >= 0),
  source public.record_source not null default 'manual',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_by uuid default auth.uid() references auth.users (id) on delete set null,
  deleted_at timestamptz,
  constraint truck_trips_single_origin check (num_nonnulls(purchase_id, stock_location_id) <= 1),
  constraint truck_trips_code_format check (trip_code ~ '^TRP-[0-9]{4}-[0-9]{5,}$')
);

create table public.weight_records (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null default public.current_business_id() references public.businesses (id),
  trip_id uuid not null references public.truck_trips (id) on delete cascade,
  record_type public.weight_record_type not null,
  gross numeric(14,3) check (gross >= 0),
  tare numeric(14,3) check (tare >= 0),
  printed_net numeric(14,3) check (printed_net >= 0),
  -- calculated_net = gross - tare; a mismatch with the printed net is flagged, never silently fixed
  calculated_net numeric(14,3) generated always as (gross - tare) stored,
  net_quantity numeric(14,3) generated always as (coalesce(gross - tare, printed_net)) stored,
  has_net_mismatch boolean generated always as (
    gross is not null and tare is not null and printed_net is not null and abs((gross - tare) - printed_net) > 0.005
  ) stored,
  slip_number text,
  vehicle_number text,
  measured_at timestamptz not null,
  location text,
  source public.record_source not null default 'manual',
  measurement_method public.measurement_method not null default 'weighbridge',
  document_id uuid, -- FK added in the documents migration
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_by uuid default auth.uid() references auth.users (id) on delete set null,
  deleted_at timestamptz,
  constraint weight_records_gross_ge_tare check (gross is null or tare is null or gross >= tare),
  constraint weight_records_has_quantity check (printed_net is not null or (gross is not null and tare is not null))
);
create unique index weight_records_one_active_per_type on public.weight_records (trip_id, record_type) where deleted_at is null;
comment on column public.weight_records.net_quantity is 'Effective net: gross - tare when both are known, otherwise the printed / measured quantity.';

create table public.delivery_records (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null default public.current_business_id() references public.businesses (id),
  trip_id uuid not null unique references public.truck_trips (id) on delete cascade,
  loading_weight_id uuid references public.weight_records (id) on delete set null,
  delivery_weight_id uuid references public.weight_records (id) on delete set null,
  site_id uuid references public.construction_sites (id),
  delivered_at timestamptz,
  received_by_name text,
  loading_net numeric(14,3),
  delivered_net numeric(14,3),
  tolerance numeric(14,3) not null default 0 check (tolerance >= 0),
  -- quantity difference = loading net - delivered net
  quantity_difference numeric(14,3) generated always as (loading_net - delivered_net) stored,
  tolerance_status public.tolerance_status generated always as (
    case
      when loading_net is null or delivered_net is null then null
      when loading_net - delivered_net <= tolerance then 'normal'::public.tolerance_status
      when loading_net - delivered_net <= tolerance * 2 then 'needs_verification'::public.tolerance_status
      else 'confirmed_shortage'::public.tolerance_status
    end
  ) stored,
  investigation_outcome public.investigation_outcome,
  investigation_notes text,
  investigated_by uuid references auth.users (id) on delete set null,
  investigated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_by uuid default auth.uid() references auth.users (id) on delete set null
);
comment on table public.delivery_records is 'One per delivered trip. Differences are operational checks (weighbridge, moisture, spillage, measurement) and are never labelled as fraud.';

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null default public.current_business_id() references public.businesses (id),
  stock_location_id uuid not null references public.stock_locations (id),
  material_id uuid not null references public.materials (id),
  movement_type public.stock_movement_type not null,
  -- signed: + received, - issued, +/- adjustment
  quantity numeric(14,3) not null check (quantity <> 0),
  movement_date date not null,
  purchase_item_id uuid unique references public.purchase_items (id) on delete cascade,
  weight_record_id uuid unique references public.weight_records (id) on delete cascade,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_by uuid default auth.uid() references auth.users (id) on delete set null,
  constraint stock_movements_sign check (
    (movement_type = 'received' and quantity > 0)
    or (movement_type = 'issued' and quantity < 0)
    or movement_type = 'adjustment'
  ),
  constraint stock_movements_source check (
    (movement_type = 'received' and purchase_item_id is not null and weight_record_id is null)
    or (movement_type = 'issued' and weight_record_id is not null and purchase_item_id is null)
    or (movement_type = 'adjustment' and purchase_item_id is null and weight_record_id is null)
  )
);

-- ---------- Rule: units always match the material (no conversion) ----------
create function public.enforce_material_unit()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_unit public.material_unit;
begin
  select m.unit into v_unit from public.materials m where m.id = new.material_id;
  if new.unit is distinct from v_unit then
    raise exception 'Unit % does not match the material unit %. Quantities are never converted between units.', new.unit, v_unit
      using errcode = '23514';
  end if;
  return new;
end
$$;

create trigger order_items_unit before insert or update of material_id, unit on public.order_items
  for each row execute function public.enforce_material_unit();
create trigger purchase_items_unit before insert or update of material_id, unit on public.purchase_items
  for each row execute function public.enforce_material_unit();

-- ---------- Rule: a purchase's delivery mode is fixed once it has items ----------
create function public.lock_purchase_delivery_mode()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if (new.delivery_mode, new.stock_location_id) is distinct from (old.delivery_mode, old.stock_location_id)
     and exists (select 1 from public.purchase_items pi where pi.purchase_id = new.id) then
    raise exception 'Delivery mode / yard cannot change after items are recorded (stock would no longer match).'
      using errcode = '23514';
  end if;
  return new;
end
$$;
create trigger purchases_lock_delivery_mode before update of delivery_mode, stock_location_id on public.purchases
  for each row execute function public.lock_purchase_delivery_mode();

-- ---------- Rule: stock-yard purchases create stock; direct-to-site never does ----------
create function public.sync_purchase_stock()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_purchase public.purchases%rowtype;
begin
  select * into v_purchase from public.purchases p where p.id = new.purchase_id;
  if v_purchase.delivery_mode = 'stock_yard' then
    insert into public.stock_movements (business_id, stock_location_id, material_id, movement_type, quantity, movement_date, purchase_item_id, notes)
    values (new.business_id, v_purchase.stock_location_id, new.material_id, 'received', new.quantity,
            v_purchase.purchase_date, new.id, 'Received from purchase ' || v_purchase.purchase_code)
    on conflict (purchase_item_id) do update
      set quantity = excluded.quantity, material_id = excluded.material_id,
          movement_date = excluded.movement_date, stock_location_id = excluded.stock_location_id;
  end if;
  -- direct_to_site: intentionally no stock movement
  return new;
end
$$;
create trigger purchase_items_stock after insert or update on public.purchase_items
  for each row execute function public.sync_purchase_stock();

create function public.guard_stock_movement()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.purchase_item_id is not null and exists (
    select 1 from public.purchase_items pi join public.purchases p on p.id = pi.purchase_id
    where pi.id = new.purchase_item_id and p.delivery_mode <> 'stock_yard'
  ) then
    raise exception 'Direct-to-site purchases never create yard stock movements.' using errcode = '23514';
  end if;
  if new.weight_record_id is not null and not exists (
    select 1 from public.weight_records w join public.truck_trips t on t.id = w.trip_id
    where w.id = new.weight_record_id and w.record_type = 'loading' and t.stock_location_id is not null
  ) then
    raise exception 'Only loading weights of trips issued from a stock yard can issue stock.' using errcode = '23514';
  end if;
  return new;
end
$$;
create trigger stock_movements_guard before insert or update on public.stock_movements
  for each row execute function public.guard_stock_movement();

-- ---------- Rule: weights drive delivery records, tolerance status and yard issues ----------
create function public.sync_trip_measurements()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_trip_id uuid := coalesce(new.trip_id, old.trip_id);
  v_trip public.truck_trips%rowtype;
  v_load public.weight_records%rowtype;
  v_del public.weight_records%rowtype;
  v_tolerance numeric(14,3);
  v_status public.tolerance_status;
  v_trip_status public.trip_status;
begin
  select * into v_trip from public.truck_trips t where t.id = v_trip_id;
  if not found then return null; end if;

  select * into v_load from public.weight_records w
   where w.trip_id = v_trip_id and w.record_type = 'loading' and w.deleted_at is null;
  select * into v_del from public.weight_records w
   where w.trip_id = v_trip_id and w.record_type = 'delivery' and w.deleted_at is null;
  select m.shortage_tolerance into v_tolerance from public.materials m where m.id = v_trip.material_id;

  -- Trips loaded from our yard issue stock (direct-to-site trips never touch stock).
  delete from public.stock_movements sm
   using public.weight_records w
   where sm.weight_record_id = w.id and w.trip_id = v_trip_id
     and (w.deleted_at is not null or v_trip.stock_location_id is null);
  if v_trip.stock_location_id is not null and v_load.id is not null then
    insert into public.stock_movements (business_id, stock_location_id, material_id, movement_type, quantity, movement_date, weight_record_id, notes)
    values (v_trip.business_id, v_trip.stock_location_id, v_trip.material_id, 'issued', -v_load.net_quantity,
            (v_load.measured_at at time zone 'Asia/Kolkata')::date, v_load.id, 'Issued to site on ' || v_trip.trip_code)
    on conflict (weight_record_id) do update
      set quantity = excluded.quantity, movement_date = excluded.movement_date;
  end if;

  if v_del.id is not null then
    insert into public.delivery_records (business_id, trip_id, loading_weight_id, delivery_weight_id, site_id, delivered_at, loading_net, delivered_net, tolerance)
    values (v_trip.business_id, v_trip_id, v_load.id, v_del.id, v_trip.site_id, v_del.measured_at,
            v_load.net_quantity, v_del.net_quantity, coalesce(v_tolerance, 0))
    on conflict (trip_id) do update
      set loading_weight_id = excluded.loading_weight_id, delivery_weight_id = excluded.delivery_weight_id,
          delivered_at = excluded.delivered_at, loading_net = excluded.loading_net,
          delivered_net = excluded.delivered_net, tolerance = excluded.tolerance;
    select d.tolerance_status into v_status from public.delivery_records d where d.trip_id = v_trip_id;
    v_trip_status := case v_status
      when 'needs_verification' then 'needs_verification'
      when 'confirmed_shortage' then 'confirmed_shortage'
      else 'delivered' end;
  elsif v_load.id is not null then
    delete from public.delivery_records d where d.trip_id = v_trip_id and d.investigation_outcome is null;
    v_trip_status := case when v_trip.status in ('delivered', 'needs_verification', 'confirmed_shortage') then 'in_transit' else v_trip.status end;
  else
    v_trip_status := v_trip.status;
  end if;

  if v_trip.status <> 'cancelled' and v_trip.status is distinct from v_trip_status then
    update public.truck_trips set status = v_trip_status where id = v_trip_id;
  end if;
  return null;
end
$$;
create trigger weight_records_sync after insert or update or delete on public.weight_records
  for each row execute function public.sync_trip_measurements();

create function public.tolerance_status_for(p_difference numeric, p_tolerance numeric)
returns public.tolerance_status
language sql immutable set search_path = ''
as $$
  select case
    when p_difference is null then null
    when p_difference <= p_tolerance then 'normal'::public.tolerance_status
    when p_difference <= p_tolerance * 2 then 'needs_verification'::public.tolerance_status
    else 'confirmed_shortage'::public.tolerance_status
  end
$$;
