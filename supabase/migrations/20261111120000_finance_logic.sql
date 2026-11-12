-- =============================================================================
-- Finance logic: bills (manual + from documents), three-way reconciliation, invoicing,
-- payments with allocation, stock adjustments, profit / landed cost views.
--
-- Rules (enforced here):
--   * Reconciliation records billed vs recorded figures and a human decision. It NEVER
--     changes trips, weights or purchases to force a match.
--   * AI (service role) may create bills from documents but never approves a difference
--     and never records a payment.
--   * Customer receipts are never profit.
-- =============================================================================

-- ---------- Schema additions ----------
alter table public.transporters
  add column rate_basis text not null default 'per_trip' check (rate_basis in ('per_trip', 'per_mt')),
  add column rate_per_mt numeric(14,2) check (rate_per_mt >= 0);

alter table public.provider_bills
  add column additional_charges numeric(14,2) not null default 0 check (additional_charges >= 0),
  add column additional_charges_detail jsonb not null default '[]'::jsonb check (jsonb_typeof(additional_charges_detail) = 'array');

alter table public.transporter_bills
  add column additional_charges numeric(14,2) not null default 0 check (additional_charges >= 0),
  add column additional_charges_detail jsonb not null default '[]'::jsonb check (jsonb_typeof(additional_charges_detail) = 'array'),
  add column rate_basis text check (rate_basis is null or rate_basis in ('per_trip', 'per_mt')),
  add column billed_rate numeric(14,2) check (billed_rate >= 0);

alter table public.transporter_bill_trips
  add column quantity numeric(14,3) check (quantity >= 0),
  add column rate numeric(14,2) check (rate >= 0);

alter table public.customer_invoices
  add column place_of_supply text,
  add column cgst_amount numeric(14,2) not null default 0 check (cgst_amount >= 0),
  add column sgst_amount numeric(14,2) not null default 0 check (sgst_amount >= 0),
  add column igst_amount numeric(14,2) not null default 0 check (igst_amount >= 0),
  add column additional_charges_detail jsonb not null default '[]'::jsonb check (jsonb_typeof(additional_charges_detail) = 'array'),
  add column cancelled_reason text;

alter table public.invoice_items add column order_item_id uuid references public.order_items (id) on delete set null;
create index idx_invoice_items_trip on public.invoice_items (trip_id);
create index idx_invoice_items_order_item on public.invoice_items (order_item_id);

alter table public.reconciliation_records
  add column detail jsonb not null default '{}'::jsonb,
  add column checked_at timestamptz;
create unique index reconciliation_one_per_bill on public.reconciliation_records (bill_type, bill_id);

alter table public.app_settings
  add column payment_allocation text not null default 'selected' check (payment_allocation in ('selected', 'oldest_first')),
  add column allow_overpayment boolean not null default false,
  -- differences up to this many rupees still count as matched
  add column bill_amount_tolerance numeric(14,2) not null default 1 check (bill_amount_tolerance >= 0);

-- Decisions only through decide_reconciliation(); figures only through the reconcile_* functions.
drop policy reconciliation_records_insert on public.reconciliation_records;
drop policy reconciliation_records_update on public.reconciliation_records;
revoke insert, update, delete on public.reconciliation_records from authenticated;

-- ---------- Helpers ----------
create function public.plate_key(p text)
returns text
language sql immutable set search_path = ''
as $$ select nullif(upper(regexp_replace(coalesce(p, ''), '[^A-Za-z0-9]', '', 'g')), '') $$;

-- GST state code from a GSTIN ("27…") or a state name / "27 · Maharashtra".
create function public.gst_state_code(p text)
returns text
language sql immutable set search_path = ''
as $$
  select case
    when p is null or trim(p) = '' then null
    when trim(p) ~ '^[0-9]{2}' then substr(trim(p), 1, 2)
    else (select code from (values
      ('jammu and kashmir','01'),('himachal pradesh','02'),('punjab','03'),('chandigarh','04'),('uttarakhand','05'),
      ('haryana','06'),('delhi','07'),('rajasthan','08'),('uttar pradesh','09'),('bihar','10'),('sikkim','11'),
      ('arunachal pradesh','12'),('nagaland','13'),('manipur','14'),('mizoram','15'),('tripura','16'),('meghalaya','17'),
      ('assam','18'),('west bengal','19'),('jharkhand','20'),('odisha','21'),('chhattisgarh','22'),('madhya pradesh','23'),
      ('gujarat','24'),('dadra and nagar haveli and daman and diu','26'),('maharashtra','27'),('karnataka','29'),
      ('goa','30'),('lakshadweep','31'),('kerala','32'),('tamil nadu','33'),('puducherry','34'),
      ('andaman and nicobar islands','35'),('telangana','36'),('andhra pradesh','37'),('ladakh','38')) s(name, code)
      where s.name = lower(trim(regexp_replace(p, '^[0-9 ·-]+', ''))))
  end
$$;

-- Bill numbers compare on letters and digits only ("Q-101" = "q 101").
create function public.bill_number_key(p text)
returns text
language sql immutable set search_path = ''
as $$ select nullif(upper(regexp_replace(coalesce(p, ''), '[^A-Za-z0-9]', '', 'g')), '') $$;

-- Lets the service role (auth.uid() is null) through; signed-in users need one of the permissions.
create function public.require_any_permission(p_keys public.permission_key[])
returns void
language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.uid() is null then
    return;
  end if;
  if not exists (select 1 from unnest(p_keys) k where public.has_permission(k)) then
    raise exception 'You need the % permission for this.', replace(p_keys[1]::text, '_', ' ') using errcode = '42501';
  end if;
end
$$;

-- Keeps a human decision unless the figures changed since it was made.
create function public.store_reconciliation(
  p_business uuid, p_type public.bill_type, p_bill uuid,
  p_billed_amount numeric, p_recorded_amount numeric, p_billed_qty numeric, p_recorded_qty numeric,
  p_billed_trips integer, p_recorded_trips integer, p_ok boolean, p_reason text, p_detail jsonb
)
returns public.recon_status
language plpgsql security definer set search_path = ''
as $$
declare
  v public.reconciliation_records;
  v_status public.recon_status := case when p_ok then 'matched' else 'mismatch' end;
  v_same boolean;
begin
  select * into v from public.reconciliation_records where bill_type = p_type and bill_id = p_bill;
  if v.id is null then
    insert into public.reconciliation_records (business_id, bill_type, provider_bill_id, transporter_bill_id, invoice_id,
      billed_amount, recorded_amount, billed_quantity, recorded_quantity, billed_trips, recorded_trips, status, reason, detail, checked_at)
    values (p_business, p_type,
      case when p_type = 'provider_bill' then p_bill end,
      case when p_type = 'transporter_bill' then p_bill end,
      case when p_type = 'customer_invoice' then p_bill end,
      p_billed_amount, p_recorded_amount, p_billed_qty, p_recorded_qty, p_billed_trips, p_recorded_trips,
      v_status, p_reason, p_detail, now());
    return v_status;
  end if;
  v_same := v.billed_amount is not distinct from p_billed_amount and v.recorded_amount is not distinct from p_recorded_amount
        and v.billed_quantity is not distinct from p_billed_qty and v.recorded_quantity is not distinct from p_recorded_qty
        and v.billed_trips is not distinct from p_billed_trips and v.recorded_trips is not distinct from p_recorded_trips;
  if v_same and v.status in ('difference_approved', 'disputed', 'correction_requested', 'reconciled') then
    v_status := v.status;
  end if;
  update public.reconciliation_records
     set billed_amount = p_billed_amount, recorded_amount = p_recorded_amount,
         billed_quantity = p_billed_qty, recorded_quantity = p_recorded_qty,
         billed_trips = p_billed_trips, recorded_trips = p_recorded_trips,
         status = v_status,
         reason = case when v_same then reason else p_reason end,
         note = case when v_status = v.status then note else null end,
         detail = p_detail, checked_at = now()
   where id = v.id;
  return v_status;
end
$$;

-- =============================================================================
-- Provider bill vs purchases, loading records and trips
-- =============================================================================
create function public.reconcile_provider_bill(p_bill_id uuid)
returns public.recon_status
language plpgsql security definer set search_path = ''
as $$
declare
  b public.provider_bills;
  v_tol numeric;
  v_from date;
  v_to date;
  it record;
  t record;
  v_pu_id uuid;
  v_pu_code text;
  v_pu_qty numeric;
  v_pu_rate numeric;
  v_used uuid[] := '{}';
  v_used_purchases uuid[] := '{}';
  v_lines jsonb := '[]'::jsonb;
  v_state text;
  v_reason text;
  v_rq numeric; v_rr numeric; v_ra numeric;
  v_billed_qty numeric := 0; v_rec_qty numeric := 0; v_rec_amount numeric := 0;
  v_ok boolean := true;
  v_billed_amount numeric;
  v_count integer := 0;
  v_unmatched integer := 0;
  v_missing integer := 0;
  v_items_amount numeric;
begin
  perform public.require_any_permission(array['verify_bills']::public.permission_key[]);
  select * into b from public.provider_bills where id = p_bill_id and deleted_at is null;
  if b.id is null or (auth.uid() is not null and b.business_id <> public.current_business_id()) then
    raise exception 'Bill not found.' using errcode = '22023';
  end if;
  select coalesce(s.bill_amount_tolerance, 1) into v_tol from public.app_settings s where s.business_id = b.business_id;
  select coalesce(min(line_date), b.bill_date - 45) - 1, coalesce(max(line_date), b.bill_date) + 1
    into v_from, v_to from public.provider_bill_items where bill_id = b.id;

  for it in select * from public.provider_bill_items where bill_id = b.id order by line_date nulls last, created_at loop
    v_count := v_count + 1;
    v_billed_qty := v_billed_qty + coalesce(it.quantity, 0);
    v_pu_id := null; v_pu_code := null;
    -- 1) trip: already linked, or same vehicle within a day (closest quantity), or slip / trip code
    select tr.id, tr.trip_code, tr.material_id, w.loading_net, w.loaded_at,
           coalesce(pi.rate, m.purchase_rate, 0) as rate, tr.purchase_id
      into t
      from public.truck_trips tr
      join public.vehicles v on v.id = tr.vehicle_id
      join public.materials m on m.id = tr.material_id
      left join public.v_trip_weights w on w.trip_id = tr.id
      left join lateral (select x.rate from public.purchase_items x where x.purchase_id = tr.purchase_id and x.material_id = tr.material_id limit 1) pi on true
     where tr.business_id = b.business_id and tr.deleted_at is null and tr.status <> 'cancelled'
       and tr.stock_location_id is null and tr.provider_id = b.provider_id
       and not (tr.id = any (v_used))
       and not exists (select 1 from public.provider_bill_items o join public.provider_bills ob on ob.id = o.bill_id
                        where o.trip_id = tr.id and o.bill_id <> b.id and ob.deleted_at is null)
       and (
         tr.id = it.trip_id
         or (public.plate_key(it.vehicle_number) is not null and public.plate_key(v.vehicle_number) = public.plate_key(it.vehicle_number)
             and (it.line_date is null or abs((w.loaded_at at time zone 'Asia/Kolkata')::date - it.line_date) <= 1))
         or (it.billed_reference is not null and upper(regexp_replace(it.billed_reference, '[^A-Za-z0-9]', '', 'g'))
               in (upper(regexp_replace(coalesce(w.loading_slip_number, ''), '[^A-Za-z0-9]', '', 'g')), upper(replace(tr.trip_code, '-', ''))))
       )
       and (it.material_id is null or it.material_id = tr.material_id)
     order by (tr.id = it.trip_id) desc, abs(coalesce(w.loading_net, 0) - coalesce(it.quantity, 0))
     limit 1;

    if t.id is not null then
      v_used := v_used || t.id;
      v_rq := coalesce(t.loading_net, 0); v_rr := t.rate; v_ra := round(v_rq * v_rr, 2);
      update public.provider_bill_items set trip_id = t.id, purchase_id = coalesce(purchase_id, t.purchase_id) where id = it.id;
    else
      -- 2) purchase without trips (stock-yard purchases): code in the reference, or same material, date and quantity
      select p.id, p.purchase_code, x.quantity, x.rate into v_pu_id, v_pu_code, v_pu_qty, v_pu_rate
        from public.purchases p join public.purchase_items x on x.purchase_id = p.id
       where p.business_id = b.business_id and p.provider_id = b.provider_id and p.deleted_at is null
         and not (p.id = any (v_used_purchases))
         and (p.id = it.purchase_id
              or (it.billed_reference is not null and upper(replace(it.billed_reference, ' ', '')) like '%' || replace(p.purchase_code, '-', '') || '%')
              or (it.material_id = x.material_id and (it.line_date is null or abs(p.purchase_date - it.line_date) <= 1)
                  and abs(x.quantity - coalesce(it.quantity, 0)) <= greatest(0.01, x.quantity * 0.005)))
         and not exists (select 1 from public.truck_trips tt where tt.purchase_id = p.id and tt.deleted_at is null)
       order by (p.id = it.purchase_id) desc, abs(x.quantity - coalesce(it.quantity, 0))
       limit 1;
      if v_pu_id is not null then
        v_used_purchases := v_used_purchases || v_pu_id;
        v_rq := v_pu_qty; v_rr := v_pu_rate; v_ra := round(v_rq * v_rr, 2);
        update public.provider_bill_items set purchase_id = v_pu_id where id = it.id;
      end if;
    end if;

    if t.id is null and v_pu_id is null then
      v_unmatched := v_unmatched + 1;
      v_state := 'not_in_system';
      v_reason := 'No trip or purchase in the system matches this bill line (vehicle, date, slip and quantity checked).';
      v_rq := null; v_rr := null; v_ra := null;
      v_ok := false;
    elsif abs(coalesce(it.quantity, 0) - v_rq) > 0.01 then
      v_state := 'quantity_differs';
      v_reason := format('Billed %s versus %s recorded on the loading slip (%s%s).', it.quantity, v_rq,
                         case when it.quantity > v_rq then '+' else '' end, round(it.quantity - v_rq, 3));
      v_ok := false;
    elsif it.rate is not null and abs(it.rate - v_rr) > 0.5 then
      v_state := 'rate_differs';
      v_reason := format('Billed rate ₹%s versus agreed ₹%s.', it.rate, v_rr);
      v_ok := false;
    else
      v_state := 'matched';
      v_reason := '';
    end if;
    v_rec_qty := v_rec_qty + coalesce(v_rq, 0);
    v_rec_amount := v_rec_amount + coalesce(v_ra, 0);
    v_lines := v_lines || jsonb_build_object(
      'line_id', it.id, 'billed_ref', it.billed_reference, 'date', it.line_date, 'vehicle', it.vehicle_number,
      'billed', jsonb_build_object('quantity', it.quantity, 'rate', it.rate, 'amount', it.amount),
      'recorded', case when v_rq is null then null else jsonb_build_object('quantity', v_rq, 'rate', v_rr, 'amount', v_ra) end,
      'trip_id', t.id, 'trip_code', t.trip_code, 'purchase_id', coalesce(v_pu_id, t.purchase_id), 'purchase_code', v_pu_code,
      'state', v_state, 'reason', v_reason);
  end loop;

  -- 3) recorded trips of this provider in the period that no provider bill covers
  for t in
    select tr.id, tr.trip_code, w.loading_net, w.loaded_at, w.loading_slip_number, v.vehicle_number,
           coalesce(pi.rate, m.purchase_rate, 0) as rate
      from public.truck_trips tr
      join public.vehicles v on v.id = tr.vehicle_id
      join public.materials m on m.id = tr.material_id
      left join public.v_trip_weights w on w.trip_id = tr.id
      left join lateral (select x.rate from public.purchase_items x where x.purchase_id = tr.purchase_id and x.material_id = tr.material_id limit 1) pi on true
     where tr.business_id = b.business_id and tr.provider_id = b.provider_id and tr.stock_location_id is null
       and tr.deleted_at is null and tr.status <> 'cancelled'
       and (w.loaded_at at time zone 'Asia/Kolkata')::date between v_from and v_to
       and not (tr.id = any (v_used))
       and not exists (select 1 from public.provider_bill_items o join public.provider_bills ob on ob.id = o.bill_id
                        where o.trip_id = tr.id and ob.deleted_at is null)
     order by w.loaded_at
  loop
    v_missing := v_missing + 1;
    v_ok := false;
    v_rec_qty := v_rec_qty + coalesce(t.loading_net, 0);
    v_rec_amount := v_rec_amount + round(coalesce(t.loading_net, 0) * t.rate, 2);
    v_lines := v_lines || jsonb_build_object(
      'line_id', null, 'billed_ref', t.loading_slip_number, 'date', (t.loaded_at at time zone 'Asia/Kolkata')::date,
      'vehicle', t.vehicle_number, 'billed', null,
      'recorded', jsonb_build_object('quantity', t.loading_net, 'rate', t.rate, 'amount', round(coalesce(t.loading_net, 0) * t.rate, 2)),
      'trip_id', t.id, 'trip_code', t.trip_code, 'state', 'missing_on_bill',
      'reason', 'Trip is recorded in the system but not included in this bill.');
  end loop;

  v_items_amount := coalesce((select sum(amount) from public.provider_bill_items where bill_id = b.id), 0);
  v_billed_amount := v_items_amount + b.additional_charges;
  if abs(v_items_amount - v_rec_amount) > v_tol then
    v_ok := false;
  end if;
  return public.store_reconciliation(b.business_id, 'provider_bill', b.id,
    v_billed_amount, v_rec_amount + b.additional_charges, v_billed_qty, v_rec_qty,
    v_count, v_count - v_unmatched + v_missing, v_ok,
    case when v_ok then 'Bill matches purchases and loading records.'
         else concat_ws('; ',
           case when v_unmatched > 0 then format('%s line(s) not in the system', v_unmatched) end,
           case when exists (select 1 from jsonb_array_elements(v_lines) l where l ->> 'state' = 'quantity_differs')
                then format('%s quantity difference(s)', (select count(*) from jsonb_array_elements(v_lines) l where l ->> 'state' = 'quantity_differs')) end,
           case when exists (select 1 from jsonb_array_elements(v_lines) l where l ->> 'state' = 'rate_differs')
                then format('%s rate difference(s)', (select count(*) from jsonb_array_elements(v_lines) l where l ->> 'state' = 'rate_differs')) end,
           case when v_missing > 0 then format('%s recorded trip(s) missing on the bill', v_missing) end,
           case when abs(v_items_amount - v_rec_amount) > v_tol
                then format('amount differs by ₹%s', round(v_items_amount - v_rec_amount, 2)) end)
    end,
    jsonb_build_object('lines', v_lines, 'period', jsonb_build_object('from', v_from, 'to', v_to)));
end
$$;

-- =============================================================================
-- Transporter bill vs trips, quantities and the agreed rate (per trip or per MT)
-- =============================================================================
create function public.reconcile_transporter_bill(p_bill_id uuid)
returns public.recon_status
language plpgsql security definer set search_path = ''
as $$
declare
  b public.transporter_bills;
  tr_ public.transporters;
  v_basis text;
  v_tol numeric;
  v_from date;
  v_to date;
  it record;
  t record;
  v_used uuid[] := '{}';
  v_lines jsonb := '[]'::jsonb;
  v_state text; v_reason text;
  v_rq numeric; v_ra numeric; v_rr numeric;
  v_billed_qty numeric := 0; v_rec_qty numeric := 0; v_rec_amount numeric := 0; v_billed_amount numeric := 0;
  v_ok boolean := true;
  v_count integer := 0; v_matched integer := 0; v_missing integer := 0;
begin
  perform public.require_any_permission(array['verify_bills']::public.permission_key[]);
  select * into b from public.transporter_bills where id = p_bill_id and deleted_at is null;
  if b.id is null or (auth.uid() is not null and b.business_id <> public.current_business_id()) then
    raise exception 'Bill not found.' using errcode = '22023';
  end if;
  select * into tr_ from public.transporters where id = b.transporter_id;
  v_basis := coalesce(b.rate_basis, tr_.rate_basis, 'per_trip');
  select coalesce(s.bill_amount_tolerance, 1) into v_tol from public.app_settings s where s.business_id = b.business_id;
  select coalesce(b.period_from, min(trip_date), b.bill_date - 45) - 1, coalesce(b.period_to, max(trip_date), b.bill_date) + 1
    into v_from, v_to from public.transporter_bill_trips where bill_id = b.id;

  for it in select * from public.transporter_bill_trips where bill_id = b.id order by trip_date nulls last, created_at loop
    v_count := v_count + 1;
    v_billed_qty := v_billed_qty + coalesce(it.quantity, 0);
    v_billed_amount := v_billed_amount + it.billed_amount;
    t := null;
    select x.id, x.trip_code, x.freight_amount, w.loading_net, w.loaded_at, v.vehicle_number into t
      from public.truck_trips x
      join public.vehicles v on v.id = x.vehicle_id
      left join public.v_trip_weights w on w.trip_id = x.id
     where x.business_id = b.business_id and x.transporter_id = b.transporter_id and x.deleted_at is null and x.status <> 'cancelled'
       and not (x.id = any (v_used))
       and not exists (select 1 from public.transporter_bill_trips o join public.transporter_bills ob on ob.id = o.bill_id
                        where o.trip_id = x.id and o.bill_id <> b.id and ob.deleted_at is null)
       and (x.id = it.trip_id
            or (public.plate_key(it.vehicle_number) is not null and public.plate_key(v.vehicle_number) = public.plate_key(it.vehicle_number)
                and (it.trip_date is null or abs((w.loaded_at at time zone 'Asia/Kolkata')::date - it.trip_date) <= 1))
            or (it.billed_reference is not null and upper(regexp_replace(it.billed_reference, '[^A-Za-z0-9]', '', 'g')) = upper(replace(x.trip_code, '-', ''))))
     order by (x.id = it.trip_id) desc, abs(coalesce(w.loading_net, 0) - coalesce(it.quantity, w.loading_net, 0)), w.loaded_at
     limit 1;

    if t.id is null then
      v_state := 'not_in_system';
      v_reason := 'Billed trip not found in the system (vehicle and date checked).';
      v_rq := null; v_rr := null; v_ra := null; v_ok := false;
    else
      v_used := v_used || t.id;
      v_matched := v_matched + 1;
      begin
        update public.transporter_bill_trips set trip_id = t.id where id = it.id;
      exception when unique_violation then null;
      end;
      v_rq := coalesce(t.loading_net, 0);
      if v_basis = 'per_mt' then
        v_rr := coalesce(tr_.rate_per_mt, 0);
        v_ra := round(v_rq * v_rr, 2);
      else
        v_rr := coalesce(t.freight_amount, tr_.rate_per_trip, 0);
        v_ra := v_rr;
      end if;
      if v_basis = 'per_mt' and it.quantity is not null and abs(it.quantity - v_rq) > 0.01 then
        v_state := 'quantity_differs';
        v_reason := format('Billed %s MT versus %s MT loaded.', it.quantity, v_rq);
        v_ok := false;
      elsif abs(it.billed_amount - v_ra) > v_tol then
        v_state := 'rate_differs';
        v_reason := format('Billed ₹%s versus ₹%s at the agreed %s rate.', it.billed_amount, v_ra,
                           case v_basis when 'per_mt' then 'per-MT' else 'per-trip' end);
        v_ok := false;
      else
        v_state := 'matched'; v_reason := '';
      end if;
    end if;
    v_rec_qty := v_rec_qty + coalesce(v_rq, 0);
    v_rec_amount := v_rec_amount + coalesce(v_ra, 0);
    v_lines := v_lines || jsonb_build_object(
      'line_id', it.id, 'billed_ref', it.billed_reference, 'date', it.trip_date, 'vehicle', it.vehicle_number,
      'billed', jsonb_build_object('quantity', coalesce(it.quantity, 1), 'rate', coalesce(it.rate, it.billed_amount), 'amount', it.billed_amount),
      'recorded', case when v_ra is null then null else jsonb_build_object('quantity', case when v_basis = 'per_mt' then v_rq else 1 end, 'rate', v_rr, 'amount', v_ra) end,
      'trip_id', t.id, 'trip_code', t.trip_code, 'state', v_state, 'reason', v_reason);
  end loop;

  for t in
    select x.id, x.trip_code, x.freight_amount, w.loading_net, w.loaded_at, v.vehicle_number
      from public.truck_trips x
      join public.vehicles v on v.id = x.vehicle_id
      left join public.v_trip_weights w on w.trip_id = x.id
     where x.business_id = b.business_id and x.transporter_id = b.transporter_id and x.deleted_at is null and x.status <> 'cancelled'
       and (w.loaded_at at time zone 'Asia/Kolkata')::date between v_from and v_to
       and not (x.id = any (v_used))
       and not exists (select 1 from public.transporter_bill_trips o join public.transporter_bills ob on ob.id = o.bill_id
                        where o.trip_id = x.id and ob.deleted_at is null)
     order by w.loaded_at
  loop
    v_missing := v_missing + 1;
    v_ok := false;
    v_rq := coalesce(t.loading_net, 0);
    v_ra := case when v_basis = 'per_mt' then round(v_rq * coalesce(tr_.rate_per_mt, 0), 2) else coalesce(t.freight_amount, tr_.rate_per_trip, 0) end;
    v_rec_qty := v_rec_qty + v_rq;
    v_rec_amount := v_rec_amount + v_ra;
    v_lines := v_lines || jsonb_build_object(
      'line_id', null, 'billed_ref', t.trip_code, 'date', (t.loaded_at at time zone 'Asia/Kolkata')::date, 'vehicle', t.vehicle_number,
      'billed', null, 'recorded', jsonb_build_object('quantity', case when v_basis = 'per_mt' then v_rq else 1 end,
                                                     'rate', case when v_basis = 'per_mt' then tr_.rate_per_mt else v_ra end, 'amount', v_ra),
      'trip_id', t.id, 'trip_code', t.trip_code, 'state', 'missing_on_bill',
      'reason', 'Trip is recorded in the system but not on this bill.');
  end loop;

  if abs(v_billed_amount - v_rec_amount) > v_tol then v_ok := false; end if;
  return public.store_reconciliation(b.business_id, 'transporter_bill', b.id,
    v_billed_amount + b.additional_charges, v_rec_amount + b.additional_charges, v_billed_qty, v_rec_qty,
    v_count, v_matched + v_missing, v_ok,
    case when v_ok then 'Bill matches recorded trips and the agreed rate.'
         else concat_ws('; ',
           case when v_count - v_matched > 0 then format('%s billed trip(s) not in the system', v_count - v_matched) end,
           case when v_missing > 0 then format('%s recorded trip(s) not billed', v_missing) end,
           case when exists (select 1 from jsonb_array_elements(v_lines) l where l ->> 'state' in ('rate_differs', 'quantity_differs'))
                then format('%s line(s) differ from the agreed rate', (select count(*) from jsonb_array_elements(v_lines) l where l ->> 'state' in ('rate_differs', 'quantity_differs'))) end,
           case when abs(v_billed_amount - v_rec_amount) > v_tol then format('amount differs by ₹%s', round(v_billed_amount - v_rec_amount, 2)) end)
    end,
    jsonb_build_object('lines', v_lines, 'rate_basis', v_basis, 'period', jsonb_build_object('from', v_from, 'to', v_to)));
end
$$;

-- =============================================================================
-- Customer invoice vs confirmed deliveries and the order's selling rates
-- =============================================================================
create function public.reconcile_invoice(p_invoice_id uuid)
returns public.recon_status
language plpgsql security definer set search_path = ''
as $$
declare
  i public.customer_invoices;
  v_tol numeric;
  v_auth text;
  v_checks jsonb := '[]'::jsonb;
  v_lines jsonb;
  v_flags text[] := '{}';
  v_text text;
  v_expected numeric;
  v_qty_inv numeric; v_qty_del numeric;
  v_trips integer;
begin
  perform public.require_any_permission(array['verify_bills', 'record_payments']::public.permission_key[]);
  select * into i from public.customer_invoices where id = p_invoice_id and deleted_at is null;
  if i.id is null or (auth.uid() is not null and i.business_id <> public.current_business_id()) then
    raise exception 'Invoice not found.' using errcode = '22023';
  end if;
  select coalesce(s.bill_amount_tolerance, 1), coalesce(s.authoritative_weight::text, 'delivery') into v_tol, v_auth
    from public.app_settings s where s.business_id = i.business_id;

  -- per line: invoiced vs delivered quantity and invoiced vs order rate
  select coalesce(jsonb_agg(jsonb_build_object(
           'line_id', ii.id, 'material', m.name, 'unit', ii.unit, 'trip_id', ii.trip_id, 'trip_code', t.trip_code,
           'invoiced_qty', ii.quantity, 'delivered_qty',
             case when ii.trip_id is null then null
                  when v_auth = 'loading' then w.loading_net else w.delivered_net end,
           'invoiced_rate', ii.rate, 'order_rate', coalesce(oi.selling_rate, m.selling_rate),
           'trip_order_id', t.order_id) order by ii.created_at), '[]'::jsonb),
         count(ii.trip_id)
    into v_lines, v_trips
    from public.invoice_items ii
    join public.materials m on m.id = ii.material_id
    left join public.truck_trips t on t.id = ii.trip_id
    left join public.v_trip_weights w on w.trip_id = ii.trip_id
    left join lateral (select x.selling_rate from public.order_items x
                        where x.order_id = i.order_id and (x.id = ii.order_item_id or x.material_id = ii.material_id)
                        order by (x.id = ii.order_item_id) desc limit 1) oi on true
   where ii.invoice_id = i.id;

  -- Excess quantity
  select string_agg(format('%s: invoiced %s vs delivered %s %s', coalesce(l ->> 'trip_code', l ->> 'material'),
                           l ->> 'invoiced_qty', l ->> 'delivered_qty', l ->> 'unit'), '; ')
    into v_text from jsonb_array_elements(v_lines) l
   where l ->> 'delivered_qty' is not null and (l ->> 'invoiced_qty')::numeric - (l ->> 'delivered_qty')::numeric > 0.01;
  v_checks := v_checks || jsonb_build_object('flag', 'excess_quantity', 'passed', v_text is null,
    'detail', coalesce(v_text, 'Invoiced quantity is within the confirmed deliveries.'));
  if v_text is not null then v_flags := array_append(v_flags, 'excess_quantity'); end if;

  -- Missing delivery records
  select string_agg(l ->> 'trip_code', ', ') into v_text from jsonb_array_elements(v_lines) l
   where l ->> 'trip_id' is not null and l ->> 'delivered_qty' is null;
  v_checks := v_checks || jsonb_build_object('flag', 'missing_delivery_records', 'passed', v_text is null,
    'detail', coalesce(v_text || ' has no confirmed delivery yet.', 'Every invoiced trip has a delivery record.'));
  if v_text is not null then v_flags := array_append(v_flags, 'missing_delivery_records'); end if;

  -- Wrong rate
  select string_agg(distinct format('%s: ₹%s vs order ₹%s', l ->> 'material', l ->> 'invoiced_rate', l ->> 'order_rate'), '; ')
    into v_text from jsonb_array_elements(v_lines) l
   where (l ->> 'order_rate') is not null and abs((l ->> 'invoiced_rate')::numeric - (l ->> 'order_rate')::numeric) > 0.005;
  v_checks := v_checks || jsonb_build_object('flag', 'wrong_rate', 'passed', v_text is null,
    'detail', coalesce(v_text, 'Rates match the order.'));
  if v_text is not null then v_flags := array_append(v_flags, 'wrong_rate'); end if;

  -- Duplicate invoice (same trip on another live invoice)
  select string_agg(distinct format('%s already on %s', t.trip_code, o.invoice_number), '; ') into v_text
    from public.invoice_items ii
    join public.truck_trips t on t.id = ii.trip_id
    join public.invoice_items oi2 on oi2.trip_id = ii.trip_id and oi2.invoice_id <> ii.invoice_id
    join public.customer_invoices o on o.id = oi2.invoice_id and o.status <> 'cancelled' and o.deleted_at is null
   where ii.invoice_id = i.id;
  v_checks := v_checks || jsonb_build_object('flag', 'duplicate_invoice', 'passed', v_text is null,
    'detail', coalesce(v_text, 'No other invoice contains these deliveries.'));
  if v_text is not null then v_flags := array_append(v_flags, 'duplicate_invoice'); end if;

  -- Order mismatch
  select string_agg(l ->> 'trip_code', ', ') into v_text from jsonb_array_elements(v_lines) l
   where l ->> 'trip_order_id' is not null and (l ->> 'trip_order_id')::uuid <> i.order_id;
  v_checks := v_checks || jsonb_build_object('flag', 'order_mismatch', 'passed', v_text is null,
    'detail', coalesce(v_text || ' belong(s) to another order.', 'All deliveries belong to this order.'));
  if v_text is not null then v_flags := array_append(v_flags, 'order_mismatch'); end if;

  -- Amount difference: invoiced subtotal vs delivered quantity × order rate
  select coalesce(sum(coalesce((l ->> 'delivered_qty')::numeric, (l ->> 'invoiced_qty')::numeric) * coalesce((l ->> 'order_rate')::numeric, (l ->> 'invoiced_rate')::numeric)), 0),
         coalesce(sum((l ->> 'invoiced_qty')::numeric), 0),
         coalesce(sum(coalesce((l ->> 'delivered_qty')::numeric, (l ->> 'invoiced_qty')::numeric)), 0)
    into v_expected, v_qty_inv, v_qty_del from jsonb_array_elements(v_lines) l;
  v_expected := round(v_expected, 2);
  v_text := case when abs(i.subtotal - v_expected) > v_tol
                 then format('Invoice value ₹%s differs from delivered value ₹%s by ₹%s.', i.subtotal, v_expected, round(i.subtotal - v_expected, 2)) end;
  v_checks := v_checks || jsonb_build_object('flag', 'amount_difference', 'passed', v_text is null,
    'detail', coalesce(v_text, 'Amount matches the delivered value.'));
  if v_text is not null then v_flags := array_append(v_flags, 'amount_difference'); end if;

  update public.customer_invoices set verification_flags = v_flags where id = i.id;
  return public.store_reconciliation(i.business_id, 'customer_invoice', i.id,
    i.subtotal, v_expected, v_qty_inv, v_qty_del, v_trips, v_trips, cardinality(v_flags) = 0,
    case when cardinality(v_flags) = 0 then 'Invoice matches confirmed deliveries and order rates.'
         else replace(array_to_string(v_flags, ', '), '_', ' ') end,
    jsonb_build_object('checks', v_checks, 'lines', v_lines));
end
$$;

-- ---------- Decisions (people only; AI never approves) ----------
create function public.decide_reconciliation(p_bill_type public.bill_type, p_bill_id uuid, p_action text, p_note text)
returns public.recon_status
language plpgsql security definer set search_path = ''
as $$
declare
  r public.reconciliation_records;
  v_status public.recon_status;
begin
  if auth.uid() is null then
    raise exception 'Only a person can decide on a reconciliation.' using errcode = '42501';
  end if;
  perform public.require_permission('verify_bills');
  select * into r from public.reconciliation_records
   where bill_type = p_bill_type and bill_id = p_bill_id and business_id = public.current_business_id();
  if r.id is null then
    raise exception 'Run the reconciliation first.' using errcode = '22023';
  end if;
  v_status := case p_action
    when 'approve_difference' then 'difference_approved'
    when 'dispute' then 'disputed'
    when 'request_correction' then 'correction_requested'
    when 'mark_reconciled' then 'reconciled'
  end::public.recon_status;
  if v_status is null then
    raise exception 'Unknown action.' using errcode = '22023';
  end if;
  if p_action <> 'mark_reconciled' and length(trim(coalesce(p_note, ''))) < 3 then
    raise exception 'Add a note explaining the decision.' using errcode = '22023';
  end if;
  if p_action = 'mark_reconciled' and r.status not in ('matched', 'difference_approved') then
    raise exception 'There are open differences. Approve the difference (with a note) or request a correction first.' using errcode = '22023';
  end if;
  perform set_config('app.change_reason', coalesce(nullif(trim(p_note), ''), 'Marked reconciled'), true);
  update public.reconciliation_records
     set status = v_status, note = nullif(trim(coalesce(p_note, '')), ''), resolved_by = auth.uid(), resolved_at = now()
   where id = r.id;
  perform set_config('app.change_reason', '', true);
  return v_status;
end
$$;

-- =============================================================================
-- Bills: manual entry and creation from documents (same insert path)
-- =============================================================================
create function public.insert_bill(p_business uuid, p_kind text, p_bill jsonb, p_items jsonb, p_document_id uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_charges jsonb := coalesce(p_bill -> 'additional_charges', '[]'::jsonb);
  v_charge_total numeric := coalesce((select sum((c ->> 'amount')::numeric) from jsonb_array_elements(v_charges) c), 0);
  v_subtotal numeric := coalesce(nullif(p_bill ->> 'subtotal', '')::numeric,
                                 (select sum(coalesce(nullif(x ->> 'amount', '')::numeric, 0)) from jsonb_array_elements(coalesce(p_items, '[]')) x), 0);
begin
  if p_kind not in ('provider', 'transporter') then
    raise exception 'Unknown bill kind.' using errcode = '22023';
  end if;
  if nullif(p_bill ->> 'party_id', '') is null then
    raise exception 'Choose the % for this bill.', p_kind using errcode = '22023';
  end if;
  if public.bill_number_key(p_bill ->> 'bill_number') is null or nullif(p_bill ->> 'bill_date', '') is null
     or nullif(p_bill ->> 'total_amount', '') is null then
    raise exception 'Bill number, bill date and total amount are required.' using errcode = '22023';
  end if;
  if p_kind = 'provider' then
    insert into public.provider_bills (business_id, provider_id, bill_number, bill_date, due_date, subtotal, tax_amount, total_amount,
                                       additional_charges, additional_charges_detail, document_id, notes)
    values (p_business, (p_bill ->> 'party_id')::uuid, trim(p_bill ->> 'bill_number'), (p_bill ->> 'bill_date')::date,
            nullif(p_bill ->> 'due_date', '')::date, v_subtotal, coalesce(nullif(p_bill ->> 'tax_amount', '')::numeric, 0),
            (p_bill ->> 'total_amount')::numeric, v_charge_total, v_charges, p_document_id, nullif(p_bill ->> 'notes', ''))
    returning id into v_id;
    insert into public.provider_bill_items (business_id, bill_id, billed_reference, line_date, vehicle_number, material_id, quantity, unit, rate, amount)
    select p_business, v_id, nullif(x ->> 'reference', ''), nullif(x ->> 'date', '')::date, nullif(x ->> 'vehicle_number', ''),
           nullif(x ->> 'material_id', '')::uuid, nullif(x ->> 'quantity', '')::numeric, nullif(x ->> 'unit', '')::public.material_unit,
           nullif(x ->> 'rate', '')::numeric,
           coalesce(nullif(x ->> 'amount', '')::numeric, round(nullif(x ->> 'quantity', '')::numeric * nullif(x ->> 'rate', '')::numeric, 2), 0)
      from jsonb_array_elements(coalesce(p_items, '[]')) x;
  else
    insert into public.transporter_bills (business_id, transporter_id, bill_number, bill_date, due_date, period_from, period_to,
                                          subtotal, tax_amount, total_amount, additional_charges, additional_charges_detail,
                                          rate_basis, billed_rate, document_id, notes)
    values (p_business, (p_bill ->> 'party_id')::uuid, trim(p_bill ->> 'bill_number'), (p_bill ->> 'bill_date')::date,
            nullif(p_bill ->> 'due_date', '')::date, nullif(p_bill ->> 'period_from', '')::date, nullif(p_bill ->> 'period_to', '')::date,
            v_subtotal, coalesce(nullif(p_bill ->> 'tax_amount', '')::numeric, 0), (p_bill ->> 'total_amount')::numeric,
            v_charge_total, v_charges, nullif(p_bill ->> 'rate_basis', ''), nullif(p_bill ->> 'rate', '')::numeric, p_document_id,
            nullif(p_bill ->> 'notes', ''))
    returning id into v_id;
    insert into public.transporter_bill_trips (business_id, bill_id, billed_reference, vehicle_number, trip_date, quantity, rate, billed_amount)
    select p_business, v_id, nullif(x ->> 'reference', ''), nullif(x ->> 'vehicle_number', ''), nullif(x ->> 'date', '')::date,
           nullif(x ->> 'quantity', '')::numeric, nullif(x ->> 'rate', '')::numeric,
           coalesce(nullif(x ->> 'amount', '')::numeric, nullif(x ->> 'rate', '')::numeric * coalesce(nullif(x ->> 'quantity', '')::numeric, 1), 0)
      from jsonb_array_elements(coalesce(p_items, '[]')) x;
  end if;
  return v_id;
end
$$;

-- Manual entry (verify_bills). Duplicate party + bill number is rejected.
create function public.create_bill(p_kind text, p_bill jsonb, p_items jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_status public.recon_status;
begin
  perform public.require_permission('verify_bills');
  if p_kind not in ('provider', 'transporter') then raise exception 'Unknown bill kind.' using errcode = '22023'; end if;
  if (p_kind = 'provider' and exists (select 1 from public.provider_bills where business_id = public.current_business_id()
        and provider_id = (p_bill ->> 'party_id')::uuid and public.bill_number_key(bill_number) = public.bill_number_key(p_bill ->> 'bill_number') and deleted_at is null))
     or (p_kind = 'transporter' and exists (select 1 from public.transporter_bills where business_id = public.current_business_id()
        and transporter_id = (p_bill ->> 'party_id')::uuid and public.bill_number_key(bill_number) = public.bill_number_key(p_bill ->> 'bill_number') and deleted_at is null)) then
    raise exception 'Bill % from this party is already recorded.', p_bill ->> 'bill_number' using errcode = '22023';
  end if;
  v_id := public.insert_bill(public.current_business_id(), p_kind, p_bill, p_items, nullif(p_bill ->> 'document_id', '')::uuid);
  v_status := case p_kind when 'provider' then public.reconcile_provider_bill(v_id) else public.reconcile_transporter_bill(v_id) end;
  return jsonb_build_object('id', v_id, 'recon_status', v_status);
end
$$;

-- From the AI pipeline (service role). Same party + bill number: same amount = duplicate document,
-- different amount = review (financial discrepancy). Never approves or pays anything.
create function public.create_bill_from_document(p_document_id uuid, p_kind text, p_bill jsonb, p_items jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  d public.documents;
  v_existing record;
  v_id uuid;
  v_status public.recon_status;
begin
  select * into d from public.documents where id = p_document_id;
  if d.id is null then raise exception 'Document not found.' using errcode = '22023'; end if;
  if nullif(p_bill ->> 'party_id', '') is null or public.bill_number_key(p_bill ->> 'bill_number') is null
     or nullif(p_bill ->> 'total_amount', '') is null or nullif(p_bill ->> 'bill_date', '') is null then
    raise exception 'The % or bill number, date or total could not be identified.', p_kind using errcode = '22023';
  end if;
  if p_kind = 'provider' then
    select id, total_amount, document_id into v_existing from public.provider_bills
     where business_id = d.business_id and provider_id = (p_bill ->> 'party_id')::uuid
       and public.bill_number_key(bill_number) = public.bill_number_key(p_bill ->> 'bill_number') and deleted_at is null;
  else
    select id, total_amount, document_id into v_existing from public.transporter_bills
     where business_id = d.business_id and transporter_id = (p_bill ->> 'party_id')::uuid
       and public.bill_number_key(bill_number) = public.bill_number_key(p_bill ->> 'bill_number') and deleted_at is null;
  end if;
  if v_existing.id is not null then
    if abs(v_existing.total_amount - (p_bill ->> 'total_amount')::numeric) <= 1 then
      update public.documents set status = 'duplicate', duplicate_of_document_id = v_existing.document_id,
             review_detail = jsonb_build_object('reason', 'Same party, bill number and amount as a recorded bill.', 'bill_id', v_existing.id),
             processed_at = now()
       where id = d.id;
      return jsonb_build_object('status', 'duplicate', 'bill_id', v_existing.id);
    end if;
    update public.documents set status = 'needs_review', review_reason = 'financial_discrepancy',
           review_detail = jsonb_build_object('explanation',
             format('Bill %s is already recorded with total ₹%s; this copy shows ₹%s.', p_bill ->> 'bill_number', v_existing.total_amount, p_bill ->> 'total_amount'),
             'bill_id', v_existing.id), processed_at = now()
     where id = d.id;
    return jsonb_build_object('status', 'needs_review', 'bill_id', v_existing.id);
  end if;
  v_id := public.insert_bill(d.business_id, p_kind, p_bill, p_items, d.id);
  v_status := case p_kind when 'provider' then public.reconcile_provider_bill(v_id) else public.reconcile_transporter_bill(v_id) end;
  update public.documents
     set status = 'automatically_recorded',
         provider_bill_id = case when p_kind = 'provider' then v_id end,
         transporter_bill_id = case when p_kind = 'transporter' then v_id end,
         review_reason = null,
         review_detail = jsonb_build_object('bill_id', v_id, 'recon_status', v_status), processed_at = now()
   where id = d.id;
  return jsonb_build_object('status', 'created', 'bill_id', v_id, 'recon_status', v_status);
end
$$;

-- Review: record a bill document after a person checked it (verify_bills).
create function public.review_create_bill_from_document(p_document_id uuid, p_kind text, p_bill jsonb, p_items jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  d public.documents := public.document_for_user(p_document_id);
  r jsonb;
begin
  perform public.require_permission('verify_bills');
  r := public.create_bill(p_kind, p_bill || jsonb_build_object('document_id', d.id), p_items);
  update public.documents
     set status = 'matched', review_reason = null,
         provider_bill_id = case when p_kind = 'provider' then (r ->> 'id')::uuid end,
         transporter_bill_id = case when p_kind = 'transporter' then (r ->> 'id')::uuid end
   where id = d.id;
  return r;
end
$$;

-- =============================================================================
-- Invoicing
-- =============================================================================
create or replace function public.recalculate_invoice_totals(p_invoice_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update public.customer_invoices i
     set subtotal = coalesce(x.subtotal, 0),
         tax_amount = case when i.gst_mode = 'none' then 0 else coalesce(x.tax, 0) end,
         igst_amount = case when i.gst_mode = 'igst' then coalesce(x.tax, 0) else 0 end,
         cgst_amount = case when i.gst_mode = 'cgst_sgst' then round(coalesce(x.tax, 0) / 2, 2) else 0 end,
         sgst_amount = case when i.gst_mode = 'cgst_sgst' then coalesce(x.tax, 0) - round(coalesce(x.tax, 0) / 2, 2) else 0 end,
         total_amount = coalesce(x.subtotal, 0) + i.additional_charges
                        + case when i.gst_mode = 'none' then 0 else coalesce(x.tax, 0) end
    from (
      select sum(ii.amount) as subtotal, round(sum(ii.amount * ii.gst_rate / 100), 2) as tax
      from public.invoice_items ii where ii.invoice_id = p_invoice_id
    ) x
   where i.id = p_invoice_id;
end
$$;

-- A delivery (trip) can be on one live invoice only.
create function public.guard_invoice_trip()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_other text;
begin
  if new.trip_id is not null then
    select ci.invoice_number into v_other from public.invoice_items ii
      join public.customer_invoices ci on ci.id = ii.invoice_id
     where ii.trip_id = new.trip_id and ii.id <> new.id and ii.invoice_id <> new.invoice_id
       and ci.status <> 'cancelled' and ci.deleted_at is null
     limit 1;
    if v_other is not null then
      raise exception 'This delivery is already invoiced on %.', v_other using errcode = '23505';
    end if;
  end if;
  return new;
end
$$;
create trigger invoice_items_one_invoice_per_trip before insert or update of trip_id on public.invoice_items
  for each row execute function public.guard_invoice_trip();

-- Creates an invoice from confirmed deliveries (trips) and / or order lines, numbered from
-- app_settings under a row lock (concurrency-safe). GST split by place of supply.
create function public.create_invoice(
  p_invoice jsonb,
  p_trip_ids uuid[] default '{}',
  p_lines jsonb default '[]',
  p_charges jsonb default '[]',
  p_issue boolean default true
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  o public.customer_orders;
  c public.customers;
  s public.app_settings;
  v_id uuid;
  v_number text;
  v_mode public.gst_mode;
  v_place text;
  v_home text;
  v_date date := coalesce(nullif(p_invoice ->> 'invoice_date', '')::date, (now() at time zone 'Asia/Kolkata')::date);
  t record;
  l jsonb;
  v_oi public.order_items;
  v_left numeric;
  v_charge_total numeric := coalesce((select sum((x ->> 'amount')::numeric) from jsonb_array_elements(coalesce(p_charges, '[]')) x), 0);
begin
  perform public.require_permission('record_payments');
  select * into o from public.customer_orders where id = (p_invoice ->> 'order_id')::uuid
     and business_id = public.current_business_id() and deleted_at is null;
  if o.id is null then raise exception 'Order not found.' using errcode = '22023'; end if;
  if p_invoice ? 'customer_id' and (p_invoice ->> 'customer_id')::uuid <> o.customer_id then
    raise exception 'The order belongs to another customer.' using errcode = '22023';
  end if;
  if coalesce(cardinality(p_trip_ids), 0) = 0 and jsonb_array_length(coalesce(p_lines, '[]')) = 0 then
    raise exception 'Choose at least one delivery or order line.' using errcode = '22023';
  end if;
  select * into c from public.customers where id = o.customer_id;
  select * into s from public.app_settings where business_id = o.business_id for update; -- numbering lock

  v_home := public.gst_state_code(coalesce(s.gst_config ->> 'state_code', ''));
  v_place := coalesce(public.gst_state_code(c.gstin), public.gst_state_code(c.state));
  v_mode := case
    when p_invoice ->> 'gst' = 'none' then 'none'
    when v_place is not null and v_home is not null then case when v_place = v_home then 'cgst_sgst' else 'igst' end
    else coalesce(nullif(s.gst_config ->> 'default_mode', ''), 'cgst_sgst')
  end::public.gst_mode;

  insert into public.customer_invoices (business_id, invoice_number, customer_id, order_id, site_id, invoice_date, due_date,
                                        gst_mode, status, notes, place_of_supply, additional_charges, additional_charges_detail)
  values (o.business_id, '', o.customer_id, o.id, o.site_id, v_date, v_date + coalesce(c.credit_days, 30), v_mode,
          (case when p_issue then 'issued' else 'draft' end)::public.invoice_status, nullif(p_invoice ->> 'notes', ''), v_place,
          v_charge_total, coalesce(p_charges, '[]'))
  returning id, invoice_number into v_id, v_number;

  -- deliveries: lock the trips so two invoices cannot take the same one
  for t in
    select tr.id, tr.trip_code, tr.order_id, tr.status, tr.material_id, m.unit, m.name, m.gst_rate, tr.order_item_id,
           case when s.authoritative_weight = 'loading' then w.loading_net else coalesce(w.delivered_net, null) end as qty,
           w.delivered_net, v.vehicle_number, w.delivery_slip_number
      from public.truck_trips tr
      join public.materials m on m.id = tr.material_id
      join public.vehicles v on v.id = tr.vehicle_id
      left join public.v_trip_weights w on w.trip_id = tr.id
     where tr.id = any (p_trip_ids)
     for update of tr
  loop
    if t.order_id <> o.id then raise exception 'Trip % belongs to another order.', t.trip_code using errcode = '22023'; end if;
    if t.status = 'cancelled' then raise exception 'Trip % is cancelled.', t.trip_code using errcode = '22023'; end if;
    if t.delivered_net is null then raise exception 'Trip % has no confirmed delivery yet.', t.trip_code using errcode = '22023'; end if;
    insert into public.invoice_items (business_id, invoice_id, material_id, description, trip_id, delivery_record_id, quantity, unit, rate, gst_rate, order_item_id)
    select o.business_id, v_id, t.material_id,
           format('%s · %s · %s', t.name, t.trip_code, coalesce(t.vehicle_number, '')),
           t.id, (select dr.id from public.delivery_records dr where dr.trip_id = t.id), t.qty, t.unit,
           coalesce((select x.selling_rate from public.order_items x where x.order_id = o.id
                     and (x.id = t.order_item_id or x.material_id = t.material_id) order by (x.id = t.order_item_id) desc limit 1), 0),
           t.gst_rate,
           coalesce(t.order_item_id, (select x.id from public.order_items x where x.order_id = o.id and x.material_id = t.material_id limit 1));
  end loop;
  if (select count(*) from public.invoice_items where invoice_id = v_id) < coalesce(cardinality(p_trip_ids), 0) then
    raise exception 'Some deliveries were not found.' using errcode = '22023';
  end if;

  -- order lines (e.g. items billed per trip / bag): never more than ordered and not yet invoiced
  for l in select * from jsonb_array_elements(coalesce(p_lines, '[]')) loop
    select * into v_oi from public.order_items where id = (l ->> 'order_item_id')::uuid and order_id = o.id for update;
    if v_oi.id is null then raise exception 'Order line not found.' using errcode = '22023'; end if;
    select v_oi.quantity - coalesce(sum(ii.quantity), 0) into v_left from public.invoice_items ii
      join public.customer_invoices ci on ci.id = ii.invoice_id and ci.status <> 'cancelled' and ci.deleted_at is null
     where ii.order_item_id = v_oi.id;
    if (l ->> 'quantity')::numeric > v_left + 0.0005 then
      raise exception 'Only % left to invoice on that order line.', round(v_left, 3) using errcode = '22023';
    end if;
    insert into public.invoice_items (business_id, invoice_id, material_id, description, quantity, unit, rate, gst_rate, order_item_id)
    select o.business_id, v_id, v_oi.material_id, coalesce(nullif(l ->> 'description', ''), m.name), (l ->> 'quantity')::numeric,
           v_oi.unit, v_oi.selling_rate, m.gst_rate, v_oi.id
      from public.materials m where m.id = v_oi.material_id;
  end loop;

  perform public.reconcile_invoice(v_id);
  return jsonb_build_object('id', v_id, 'invoice_number', v_number, 'gst_mode', v_mode);
end
$$;

create function public.issue_invoice(p_invoice_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.require_permission('record_payments');
  update public.customer_invoices set status = 'issued'
   where id = p_invoice_id and business_id = public.current_business_id() and status = 'draft';
  if not found then raise exception 'Only draft invoices can be issued.' using errcode = '22023'; end if;
end
$$;

create function public.cancel_invoice(p_invoice_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.require_permission('record_payments');
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Give a reason for cancelling.' using errcode = '22023'; end if;
  if exists (select 1 from public.payments where invoice_id = p_invoice_id and deleted_at is null) then
    raise exception 'This invoice has payments. Record a credit note instead of cancelling.' using errcode = '22023';
  end if;
  perform set_config('app.change_reason', trim(p_reason), true);
  update public.customer_invoices set status = 'cancelled', cancelled_reason = trim(p_reason)
   where id = p_invoice_id and business_id = public.current_business_id() and status <> 'cancelled';
  if not found then raise exception 'Invoice not found or already cancelled.' using errcode = '22023'; end if;
  perform set_config('app.change_reason', '', true);
end
$$;

-- =============================================================================
-- Payments: one RPC for incoming / outgoing, with allocation and overpayment control
-- =============================================================================
create or replace function public.validate_payment()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_total numeric(14,2);
  v_paid numeric(14,2);
  v_allow boolean;
begin
  select coalesce(s.allow_overpayment, false) into v_allow from public.app_settings s where s.business_id = new.business_id;
  if new.invoice_id is not null then
    select total_amount into v_total from public.customer_invoices
     where id = new.invoice_id and customer_id = new.customer_id and status <> 'cancelled';
    if v_total is null then raise exception 'Invoice does not belong to this customer (or is cancelled).' using errcode = '23514'; end if;
    select coalesce(sum(amount), 0) into v_paid from public.payments
     where invoice_id = new.invoice_id and deleted_at is null and id <> new.id;
  elsif new.provider_bill_id is not null then
    select total_amount into v_total from public.provider_bills
     where id = new.provider_bill_id and provider_id = new.provider_id;
    if v_total is null then raise exception 'Bill does not belong to this provider.' using errcode = '23514'; end if;
    select coalesce(sum(amount), 0) into v_paid from public.payments
     where provider_bill_id = new.provider_bill_id and deleted_at is null and id <> new.id;
  elsif new.transporter_bill_id is not null then
    select total_amount into v_total from public.transporter_bills
     where id = new.transporter_bill_id and transporter_id = new.transporter_id;
    if v_total is null then raise exception 'Bill does not belong to this transporter.' using errcode = '23514'; end if;
    select coalesce(sum(amount), 0) into v_paid from public.payments
     where transporter_bill_id = new.transporter_bill_id and deleted_at is null and id <> new.id;
  else
    return new; -- on-account payment
  end if;
  if new.deleted_at is null and v_paid + new.amount > v_total + 1 and not v_allow then
    raise exception 'Payment of % exceeds the remaining balance of %.', new.amount, v_total - v_paid using errcode = '23514';
  end if;
  return new;
end
$$;

create function public.record_payment(p jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  s public.app_settings;
  v_party text := p ->> 'party_type';
  v_party_id uuid := (p ->> 'party_id')::uuid;
  v_amount numeric := (p ->> 'amount')::numeric;
  v_left numeric;
  v_allow boolean := coalesce((p ->> 'allow_excess')::boolean, false);
  v_doc uuid := nullif(p ->> 'against_id', '')::uuid;
  v_ids uuid[] := '{}';
  v_id uuid;
  d record;
  v_part numeric;
  v_mode public.payment_mode := (p ->> 'mode')::public.payment_mode;
  v_date date := coalesce(nullif(p ->> 'payment_date', '')::date, (now() at time zone 'Asia/Kolkata')::date);
begin
  if auth.uid() is null then raise exception 'Only a person can record a payment.' using errcode = '42501'; end if;
  perform public.require_permission('record_payments');
  if v_amount is null or v_amount <= 0 then raise exception 'Enter an amount above zero.' using errcode = '22023'; end if;
  select * into s from public.app_settings where business_id = public.current_business_id();
  v_allow := v_allow and coalesce(s.allow_overpayment, false);
  v_left := v_amount;

  for d in
    select * from (
      select i.id, i.invoice_date as doc_date, i.total_amount - coalesce((select sum(amount) from public.payments x where x.invoice_id = i.id and x.deleted_at is null), 0) as balance
        from public.customer_invoices i
       where v_party = 'customer' and i.customer_id = v_party_id and i.status = 'issued' and i.deleted_at is null
         and (v_doc is null or i.id = v_doc)
      union all
      select b.id, b.bill_date, b.total_amount - coalesce((select sum(amount) from public.payments x where x.provider_bill_id = b.id and x.deleted_at is null), 0)
        from public.provider_bills b
       where v_party = 'provider' and b.provider_id = v_party_id and b.deleted_at is null and (v_doc is null or b.id = v_doc)
      union all
      select b.id, b.bill_date, b.total_amount - coalesce((select sum(amount) from public.payments x where x.transporter_bill_id = b.id and x.deleted_at is null), 0)
        from public.transporter_bills b
       where v_party = 'transporter' and b.transporter_id = v_party_id and b.deleted_at is null and (v_doc is null or b.id = v_doc)
    ) docs
    where balance > 0.005 and (v_doc is not null or s.payment_allocation = 'oldest_first')
    order by doc_date, id
  loop
    exit when v_left <= 0;
    v_part := least(v_left, d.balance);
    if v_doc is not null and v_allow then v_part := v_left; end if;
    insert into public.payments (business_id, direction, party_type, customer_id, provider_id, transporter_id,
                                 invoice_id, provider_bill_id, transporter_bill_id, payment_date, amount, mode, reference, notes)
    values (s.business_id, case when v_party = 'customer' then 'incoming' else 'outgoing' end::public.payment_direction,
            v_party::public.party_type,
            case when v_party = 'customer' then v_party_id end, case when v_party = 'provider' then v_party_id end,
            case when v_party = 'transporter' then v_party_id end,
            case when v_party = 'customer' then d.id end, case when v_party = 'provider' then d.id end,
            case when v_party = 'transporter' then d.id end,
            v_date, v_part, v_mode, nullif(p ->> 'reference', ''), nullif(p ->> 'notes', ''))
    returning id into v_id;
    v_ids := v_ids || v_id;
    v_left := v_left - v_part;
  end loop;

  if v_doc is not null and cardinality(v_ids) = 0 then
    raise exception 'That invoice / bill has no balance left (or belongs to another party).' using errcode = '22023';
  end if;
  if v_left > 0.005 then
    if not v_allow then
      raise exception 'Payment is ₹% more than the outstanding balance. Allow advances in Settings to record it on account.', round(v_left, 2)
        using errcode = '22023';
    end if;
    insert into public.payments (business_id, direction, party_type, customer_id, provider_id, transporter_id, payment_date, amount, mode, reference, notes)
    values (s.business_id, case when v_party = 'customer' then 'incoming' else 'outgoing' end::public.payment_direction,
            v_party::public.party_type,
            case when v_party = 'customer' then v_party_id end, case when v_party = 'provider' then v_party_id end,
            case when v_party = 'transporter' then v_party_id end,
            v_date, round(v_left, 2), v_mode, nullif(p ->> 'reference', ''), coalesce(nullif(p ->> 'notes', ''), 'On account (advance)'))
    returning id into v_id;
    v_ids := v_ids || v_id;
  end if;
  return jsonb_build_object('payment_ids', to_jsonb(v_ids), 'on_account', greatest(round(v_left, 2), 0));
end
$$;

-- ---------- Stock adjustments (yard counts); receipts / issues stay trigger-driven ----------
create function public.adjust_stock(p_location_id uuid, p_material_id uuid, p_quantity numeric, p_date date, p_reason text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.is_owner() then raise exception 'Only the owner can adjust stock.' using errcode = '42501'; end if;
  if p_quantity is null or p_quantity = 0 then raise exception 'Enter a quantity other than zero.' using errcode = '22023'; end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Give a reason for the adjustment.' using errcode = '22023'; end if;
  if not exists (select 1 from public.stock_locations where id = p_location_id and business_id = public.current_business_id()) then
    raise exception 'Yard not found.' using errcode = '22023';
  end if;
  perform set_config('app.change_reason', trim(p_reason), true);
  insert into public.stock_movements (business_id, stock_location_id, material_id, movement_type, quantity, movement_date, notes)
  values (public.current_business_id(), p_location_id, p_material_id, 'adjustment', p_quantity,
          coalesce(p_date, (now() at time zone 'Asia/Kolkata')::date), 'Adjustment: ' || trim(p_reason))
  returning id into v_id;
  perform set_config('app.change_reason', '', true);
  return v_id;
end
$$;

-- =============================================================================
-- Views (security_invoker: the caller's RLS applies)
-- =============================================================================

-- Per trip: sales value (authoritative weight × order rate), purchase cost, transport cost.
-- Transport uses the transporter's bill line when billed, otherwise the agreed freight.
create view public.v_trip_economics with (security_invoker = true) as
select
  t.id as trip_id,
  t.business_id,
  t.order_id,
  t.material_id,
  t.provider_id,
  t.transporter_id,
  t.stock_location_id,
  m.unit,
  (coalesce(w.delivered_at, w.loaded_at) at time zone 'Asia/Kolkata')::date as economic_date,
  w.loading_net,
  w.delivered_net,
  case when coalesce(st.authoritative_weight, 'delivery') = 'loading' then w.loading_net
       else coalesce(w.delivered_net, w.loading_net) end as billable_qty,
  coalesce(oi.selling_rate, m.selling_rate, 0) as selling_rate,
  round(case when coalesce(st.authoritative_weight, 'delivery') = 'loading' then coalesce(w.loading_net, 0)
             else coalesce(w.delivered_net, w.loading_net, 0) end * coalesce(oi.selling_rate, m.selling_rate, 0), 2) as sales_value,
  round(case
    when pi.id is not null then coalesce(w.loading_net, 0) * pi.rate + pi.additional_costs * coalesce(w.loading_net, 0) / nullif(pi.quantity, 0)
    when t.stock_location_id is not null then coalesce(w.loading_net, 0) * coalesce(yard.landed_rate, m.purchase_rate, 0)
    else coalesce(w.loading_net, 0) * coalesce(m.purchase_rate, 0)
  end, 2) as purchase_cost,
  coalesce(tb.billed_amount, t.freight_amount, 0)::numeric(14,2) as transport_cost,
  (pb.trip_id is not null or t.stock_location_id is not null) as provider_billed,
  tb.trip_id is not null as transport_billed
from public.truck_trips t
join public.materials m on m.id = t.material_id
left join public.app_settings st on st.business_id = t.business_id
left join public.v_trip_weights w on w.trip_id = t.id
left join lateral (
  select x.selling_rate from public.order_items x
   where x.order_id = t.order_id and (x.id = t.order_item_id or (t.order_item_id is null and x.material_id = t.material_id))
   order by x.created_at limit 1
) oi on true
left join lateral (
  select x.id, x.rate, x.quantity, x.additional_costs from public.purchase_items x
   where x.purchase_id = t.purchase_id and x.material_id = t.material_id order by x.created_at limit 1
) pi on true
left join lateral (
  select sum(x.quantity * x.rate + x.additional_costs) / nullif(sum(x.quantity), 0) as landed_rate
    from public.purchase_items x join public.purchases y on y.id = x.purchase_id
   where y.stock_location_id = t.stock_location_id and x.material_id = t.material_id and y.deleted_at is null
) yard on true
left join lateral (
  select o.trip_id, o.billed_amount from public.transporter_bill_trips o
    join public.transporter_bills b on b.id = o.bill_id and b.deleted_at is null
   where o.trip_id = t.id limit 1
) tb on true
left join lateral (
  select o.trip_id from public.provider_bill_items o
    join public.provider_bills b on b.id = o.bill_id and b.deleted_at is null
   where o.trip_id = t.id limit 1
) pb on true
where t.deleted_at is null and t.status <> 'cancelled'
  and (auth.uid() is null or (select public.has_permission('view_financial_reports')));

-- Profit per order. Final Settled only when the order is completed, every trip is delivered,
-- provider and transporter bills cover every trip, those bills are reconciled and paid, and
-- every invoice is paid. Customer receipts are never profit.
create or replace view public.v_order_profit with (security_invoker = true) as
with trips as (
  select order_id, sum(sales_value) as sales_value, sum(purchase_cost) as purchase_cost, sum(transport_cost) as transport_cost,
         count(*) as trip_count, count(*) filter (where delivered_net is null) as undelivered_trips,
         count(*) filter (where not provider_billed or not transport_billed) as unbilled_trips,
         sum(billable_qty) as delivered_qty
    from public.v_trip_economics group by order_id
), exp as (
  select order_id,
         sum(amount) filter (where category in ('loading', 'unloading')) as loading_unloading,
         sum(amount) filter (where category = 'labour') as labour,
         sum(amount) filter (where category in ('fuel', 'toll', 'waiting', 'other')) as other_expenses
    from public.expenses where deleted_at is null and order_id is not null group by order_id
), inv as (
  select i.order_id, count(*) as invoice_count,
         bool_and(coalesce(p.paid, 0) + 1 >= i.total_amount) as all_paid
    from public.customer_invoices i
    left join (select invoice_id, sum(amount) as paid from public.payments where deleted_at is null group by invoice_id) p on p.invoice_id = i.id
   where i.deleted_at is null and i.status = 'issued'
   group by i.order_id
), bills as (
  select t.order_id,
         bool_and(b.settled) as all_settled
    from public.truck_trips t
    join lateral (
      select pb.recon_status in ('matched', 'reconciled', 'difference_approved')
             and coalesce((select sum(amount) from public.payments x where x.provider_bill_id = pb.id and x.deleted_at is null), 0) + 1 >= pb.total_amount as settled
        from public.provider_bill_items o join public.provider_bills pb on pb.id = o.bill_id and pb.deleted_at is null
       where o.trip_id = t.id
      union all
      select tb.recon_status in ('matched', 'reconciled', 'difference_approved')
             and coalesce((select sum(amount) from public.payments x where x.transporter_bill_id = tb.id and x.deleted_at is null), 0) + 1 >= tb.total_amount
        from public.transporter_bill_trips o join public.transporter_bills tb on tb.id = o.bill_id and tb.deleted_at is null
       where o.trip_id = t.id
    ) b on true
   where t.deleted_at is null and t.status <> 'cancelled'
   group by t.order_id
)
select
  o.id as order_id,
  o.business_id,
  o.order_code,
  o.customer_id,
  c.name as customer_name,
  o.status as order_status,
  coalesce(trips.trip_count, 0) as trip_count,
  round(coalesce(trips.sales_value, 0), 2) as sales_value,
  round(coalesce(trips.purchase_cost, 0), 2) as purchase_cost,
  round(coalesce(trips.transport_cost, 0), 2) as transport_cost,
  coalesce(exp.loading_unloading, 0)::numeric(14,2) as loading_unloading_cost,
  coalesce(exp.labour, 0)::numeric(14,2) as labour_cost,
  coalesce(exp.other_expenses, 0)::numeric(14,2) as other_expenses,
  round(coalesce(trips.sales_value, 0) - coalesce(trips.purchase_cost, 0) - coalesce(trips.transport_cost, 0)
        - coalesce(exp.loading_unloading, 0) - coalesce(exp.labour, 0) - coalesce(exp.other_expenses, 0), 2) as estimated_profit,
  case when coalesce(trips.sales_value, 0) > 0 then
    round(100 * (coalesce(trips.sales_value, 0) - coalesce(trips.purchase_cost, 0) - coalesce(trips.transport_cost, 0)
          - coalesce(exp.loading_unloading, 0) - coalesce(exp.labour, 0) - coalesce(exp.other_expenses, 0)) / trips.sales_value, 1)
  end as margin_pct,
  case when o.status = 'completed' and coalesce(trips.trip_count, 0) > 0 and coalesce(trips.undelivered_trips, 0) = 0
            and coalesce(trips.unbilled_trips, 0) = 0 and coalesce(bills.all_settled, false)
            and coalesce(inv.invoice_count, 0) > 0 and inv.all_paid
       then 'settled' else 'estimated' end as profit_status,
  coalesce(trips.delivered_qty, 0)::numeric(14,3) as delivered_qty
from public.customer_orders o
join public.customers c on c.id = o.customer_id
left join trips on trips.order_id = o.id
left join exp on exp.order_id = o.id
left join inv on inv.order_id = o.id
left join bills on bills.order_id = o.id
where o.deleted_at is null
  and (auth.uid() is null or (select public.has_permission('view_financial_reports')));

-- Profit by month (trips by delivery date, expenses by expense date). A month is settled when
-- every order with trips in it is settled.
create view public.v_monthly_profit with (security_invoker = true) as
with tm as (
  select e.business_id, to_char(e.economic_date, 'YYYY-MM') as month,
         sum(e.sales_value) as sales_value, sum(e.purchase_cost) as purchase_cost, sum(e.transport_cost) as transport_cost,
         bool_and(op.profit_status = 'settled') as settled
    from public.v_trip_economics e
    left join public.v_order_profit op on op.order_id = e.order_id
   where e.economic_date is not null
   group by e.business_id, to_char(e.economic_date, 'YYYY-MM')
), em as (
  select business_id, to_char(expense_date, 'YYYY-MM') as month,
         sum(amount) filter (where category in ('loading', 'unloading')) as loading_unloading,
         sum(amount) filter (where category = 'labour') as labour,
         sum(amount) filter (where category in ('fuel', 'toll', 'waiting', 'other')) as other_expenses
    from public.expenses where deleted_at is null group by business_id, to_char(expense_date, 'YYYY-MM')
)
select
  coalesce(tm.business_id, em.business_id) as business_id,
  coalesce(tm.month, em.month) as month,
  round(coalesce(tm.sales_value, 0), 2) as sales_value,
  round(coalesce(tm.purchase_cost, 0), 2) as purchase_cost,
  round(coalesce(tm.transport_cost, 0), 2) as transport_cost,
  coalesce(em.loading_unloading, 0)::numeric(14,2) as loading_unloading_cost,
  coalesce(em.labour, 0)::numeric(14,2) as labour_cost,
  coalesce(em.other_expenses, 0)::numeric(14,2) as other_expenses,
  round(coalesce(tm.sales_value, 0) - coalesce(tm.purchase_cost, 0) - coalesce(tm.transport_cost, 0)
        - coalesce(em.loading_unloading, 0) - coalesce(em.labour, 0) - coalesce(em.other_expenses, 0), 2) as estimated_profit,
  case when coalesce(tm.settled, false) then 'settled' else 'estimated' end as profit_status
from tm full join em on em.business_id = tm.business_id and em.month = tm.month;

-- Landed cost per unit: (purchase + transport) / quantity, by material and by provider + material.
create view public.v_landed_cost with (security_invoker = true) as
select
  e.business_id,
  e.material_id,
  m.name as material_name,
  e.provider_id,
  p.name as provider_name,
  e.unit,
  sum(e.loading_net)::numeric(14,3) as quantity,
  round(sum(e.purchase_cost) / nullif(sum(e.loading_net), 0), 2) as purchase_per_unit,
  round(sum(e.transport_cost) / nullif(sum(e.loading_net), 0), 2) as transport_per_unit,
  round((sum(e.purchase_cost) + sum(e.transport_cost)) / nullif(sum(e.loading_net), 0), 2) as landed_per_unit,
  round(sum(e.sales_value) / nullif(sum(e.billable_qty), 0), 2) as selling_per_unit,
  count(*) as trip_count
from public.v_trip_economics e
join public.materials m on m.id = e.material_id
left join public.material_providers p on p.id = e.provider_id
where e.loading_net is not null
group by grouping sets ((e.business_id, e.material_id, m.name, e.unit), (e.business_id, e.material_id, m.name, e.unit, e.provider_id, p.name));

-- Bills (provider + transporter) with payment and reconciliation figures.
create view public.v_bill_list with (security_invoker = true) as
select b.id, b.business_id, 'provider'::text as kind, b.bill_number, b.provider_id as party_id, p.name as party_name,
       b.bill_date, b.due_date, b.subtotal, b.tax_amount, b.total_amount, b.additional_charges, b.recon_status,
       b.document_id, b.notes, b.created_at,
       coalesce((select sum(quantity) from public.provider_bill_items x where x.bill_id = b.id), 0)::numeric(14,3) as billed_quantity,
       (select count(*) from public.provider_bill_items x where x.bill_id = b.id)::integer as line_count,
       coalesce((select sum(amount) from public.payments x where x.provider_bill_id = b.id and x.deleted_at is null), 0)::numeric(14,2) as paid_amount,
       r.recorded_amount, r.recorded_quantity, r.recorded_trips, r.amount_difference, r.reason as recon_reason, r.note as recon_note,
       (select count(*) from jsonb_array_elements(coalesce(r.detail -> 'lines', '[]')) l where l ->> 'state' = 'not_in_system')::integer as unmatched_lines,
       (select count(*) from jsonb_array_elements(coalesce(r.detail -> 'lines', '[]')) l where l ->> 'state' = 'missing_on_bill')::integer as missing_trips
  from public.provider_bills b
  join public.material_providers p on p.id = b.provider_id
  left join public.reconciliation_records r on r.provider_bill_id = b.id
 where b.deleted_at is null
union all
select b.id, b.business_id, 'transporter', b.bill_number, b.transporter_id, t.name,
       b.bill_date, b.due_date, b.subtotal, b.tax_amount, b.total_amount, b.additional_charges, b.recon_status,
       b.document_id, b.notes, b.created_at,
       coalesce((select sum(quantity) from public.transporter_bill_trips x where x.bill_id = b.id), 0)::numeric(14,3),
       (select count(*) from public.transporter_bill_trips x where x.bill_id = b.id)::integer,
       coalesce((select sum(amount) from public.payments x where x.transporter_bill_id = b.id and x.deleted_at is null), 0)::numeric(14,2),
       r.recorded_amount, r.recorded_quantity, r.recorded_trips, r.amount_difference, r.reason, r.note,
       (select count(*) from jsonb_array_elements(coalesce(r.detail -> 'lines', '[]')) l where l ->> 'state' = 'not_in_system')::integer,
       (select count(*) from jsonb_array_elements(coalesce(r.detail -> 'lines', '[]')) l where l ->> 'state' = 'missing_on_bill')::integer
  from public.transporter_bills b
  join public.transporters t on t.id = b.transporter_id
  left join public.reconciliation_records r on r.transporter_bill_id = b.id
 where b.deleted_at is null;

create view public.v_invoice_list with (security_invoker = true) as
select i.id, i.business_id, i.invoice_number, i.customer_id, c.name as customer_name, i.order_id, o.order_code,
       i.site_id, s.name as site_name, i.invoice_date, i.due_date, i.gst_mode, i.place_of_supply,
       i.subtotal, i.additional_charges, i.tax_amount, i.cgst_amount, i.sgst_amount, i.igst_amount, i.total_amount,
       i.status, i.recon_status, i.verification_flags, i.notes, i.created_at,
       coalesce((select sum(quantity) from public.invoice_items x where x.invoice_id = i.id), 0)::numeric(14,3) as quantity,
       coalesce(p.paid, 0)::numeric(14,2) as paid_amount,
       greatest(i.total_amount - coalesce(p.paid, 0), 0)::numeric(14,2) as balance,
       case when i.status = 'cancelled' then 'cancelled'
            when coalesce(p.paid, 0) <= 0 then 'unpaid'
            when coalesce(p.paid, 0) + 1 >= i.total_amount then 'paid'
            else 'partial' end as payment_status,
       case when i.status = 'issued' and i.total_amount - coalesce(p.paid, 0) > 1 and i.due_date < (now() at time zone 'Asia/Kolkata')::date
            then (now() at time zone 'Asia/Kolkata')::date - i.due_date else 0 end as overdue_days
  from public.customer_invoices i
  join public.customers c on c.id = i.customer_id
  join public.customer_orders o on o.id = i.order_id
  left join public.construction_sites s on s.id = i.site_id
  left join (select invoice_id, sum(amount) as paid from public.payments where deleted_at is null group by invoice_id) p on p.invoice_id = i.id
 where i.deleted_at is null;

create view public.v_payment_list with (security_invoker = true) as
select p.id, p.business_id, p.payment_code, p.direction, p.party_type,
       coalesce(p.customer_id, p.provider_id, p.transporter_id) as party_id,
       coalesce(c.name, mp.name, t.name) as party_name,
       coalesce(p.invoice_id, p.provider_bill_id, p.transporter_bill_id) as against_id,
       case when p.invoice_id is not null then 'invoice' when p.provider_bill_id is not null or p.transporter_bill_id is not null then 'bill' else 'on_account' end as against_type,
       coalesce(ci.invoice_number, pb.bill_number, tb.bill_number, 'On account') as against_label,
       p.payment_date, p.amount, p.mode, p.reference, p.notes, p.created_at, pr.full_name as recorded_by
  from public.payments p
  left join public.customers c on c.id = p.customer_id
  left join public.material_providers mp on mp.id = p.provider_id
  left join public.transporters t on t.id = p.transporter_id
  left join public.customer_invoices ci on ci.id = p.invoice_id
  left join public.provider_bills pb on pb.id = p.provider_bill_id
  left join public.transporter_bills tb on tb.id = p.transporter_bill_id
  left join public.profiles pr on pr.id = p.created_by
 where p.deleted_at is null;

create view public.v_expense_list with (security_invoker = true) as
select e.id, e.business_id, e.expense_date, e.category, e.amount, e.description, e.paid_to, e.mode,
       e.order_id, o.order_code, e.trip_id, t.trip_code, e.created_at, pr.full_name as recorded_by
  from public.expenses e
  left join public.customer_orders o on o.id = e.order_id
  left join public.truck_trips t on t.id = e.trip_id
  left join public.profiles pr on pr.id = e.created_by
 where e.deleted_at is null;

-- Outstanding by party with ageing (days past due), receivables and payables together.
create view public.v_party_outstanding with (security_invoker = true) as
with docs as (
  select 'customer'::text as party_type, customer_id as party_id, business_id, total_amount as total, paid_amount as paid,
         balance, due_date from public.v_invoice_list where status = 'issued'
  union all
  select kind, party_id, business_id, total_amount, paid_amount, greatest(total_amount - paid_amount, 0), coalesce(due_date, bill_date)
    from public.v_bill_list
), aged as (
  select *, (now() at time zone 'Asia/Kolkata')::date - due_date as days from docs
)
select a.party_type, a.party_id, a.business_id,
       coalesce(c.name, p.name, t.name) as party_name,
       sum(a.total)::numeric(14,2) as total, sum(a.paid)::numeric(14,2) as paid, sum(a.balance)::numeric(14,2) as outstanding,
       sum(a.balance) filter (where a.days <= 0)::numeric(14,2) as current_amount,
       sum(a.balance) filter (where a.days between 1 and 30)::numeric(14,2) as d30,
       sum(a.balance) filter (where a.days between 31 and 60)::numeric(14,2) as d60,
       sum(a.balance) filter (where a.days > 60)::numeric(14,2) as d90
  from aged a
  left join public.customers c on a.party_type = 'customer' and c.id = a.party_id
  left join public.material_providers p on a.party_type = 'provider' and p.id = a.party_id
  left join public.transporters t on a.party_type = 'transporter' and t.id = a.party_id
 group by a.party_type, a.party_id, a.business_id, coalesce(c.name, p.name, t.name);

-- Server-side totals for the finance pages (RLS applies through the views).
create function public.finance_totals()
returns jsonb
language sql stable security invoker set search_path = ''
as $$
  select jsonb_build_object(
    'receivable', coalesce((select sum(balance) from public.v_invoice_list where status = 'issued'), 0),
    'overdue', coalesce((select sum(balance) from public.v_invoice_list where status = 'issued' and overdue_days > 0), 0),
    'payable_provider', coalesce((select sum(greatest(total_amount - paid_amount, 0)) from public.v_bill_list where kind = 'provider'), 0),
    'payable_transporter', coalesce((select sum(greatest(total_amount - paid_amount, 0)) from public.v_bill_list where kind = 'transporter'), 0),
    'invoiced_month', coalesce((select sum(total_amount) from public.v_invoice_list where status = 'issued'
                                 and date_trunc('month', invoice_date) = date_trunc('month', (now() at time zone 'Asia/Kolkata')::date)), 0),
    'received_month', coalesce((select sum(amount) from public.v_payment_list where direction = 'incoming'
                                 and date_trunc('month', payment_date) = date_trunc('month', (now() at time zone 'Asia/Kolkata')::date)), 0),
    'paid_month', coalesce((select sum(amount) from public.v_payment_list where direction = 'outgoing'
                             and date_trunc('month', payment_date) = date_trunc('month', (now() at time zone 'Asia/Kolkata')::date)), 0),
    'expenses_month', coalesce((select sum(amount) from public.v_expense_list
                                 where date_trunc('month', expense_date) = date_trunc('month', (now() at time zone 'Asia/Kolkata')::date)), 0),
    'bills_needing_attention', (select count(*) from public.v_bill_list where recon_status in ('unreconciled', 'mismatch', 'disputed', 'correction_requested')),
    'invoices_flagged', (select count(*) from public.v_invoice_list where status <> 'cancelled' and cardinality(verification_flags) > 0)
  )
$$;

-- ---------- Privileges ----------
revoke all on public.v_trip_economics, public.v_monthly_profit, public.v_landed_cost, public.v_bill_list, public.v_invoice_list,
  public.v_payment_list, public.v_expense_list, public.v_party_outstanding from anon;
grant select on public.v_trip_economics, public.v_monthly_profit, public.v_landed_cost, public.v_bill_list, public.v_invoice_list,
  public.v_payment_list, public.v_expense_list, public.v_party_outstanding to authenticated, service_role;

revoke execute on function public.plate_key(text) from anon;
revoke execute on function public.gst_state_code(text) from anon;
revoke execute on function public.bill_number_key(text) from anon;
revoke execute on function public.require_any_permission(public.permission_key[]) from public, anon;
revoke execute on function public.store_reconciliation(uuid, public.bill_type, uuid, numeric, numeric, numeric, numeric, integer, integer, boolean, text, jsonb) from public, anon, authenticated;
revoke execute on function public.insert_bill(uuid, text, jsonb, jsonb, uuid) from public, anon, authenticated;
revoke execute on function public.create_bill_from_document(uuid, text, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.reconcile_provider_bill(uuid) from public, anon;
revoke execute on function public.reconcile_transporter_bill(uuid) from public, anon;
revoke execute on function public.reconcile_invoice(uuid) from public, anon;
revoke execute on function public.decide_reconciliation(public.bill_type, uuid, text, text) from public, anon;
revoke execute on function public.create_bill(text, jsonb, jsonb) from public, anon;
revoke execute on function public.review_create_bill_from_document(uuid, text, jsonb, jsonb) from public, anon;
revoke execute on function public.create_invoice(jsonb, uuid[], jsonb, jsonb, boolean) from public, anon;
revoke execute on function public.issue_invoice(uuid) from public, anon;
revoke execute on function public.cancel_invoice(uuid, text) from public, anon;
revoke execute on function public.record_payment(jsonb) from public, anon;
revoke execute on function public.adjust_stock(uuid, uuid, numeric, date, text) from public, anon;
revoke execute on function public.finance_totals() from public, anon;
revoke execute on function public.guard_invoice_trip() from public, anon, authenticated;

grant execute on function public.require_any_permission(public.permission_key[]) to authenticated, service_role;
grant execute on function public.store_reconciliation(uuid, public.bill_type, uuid, numeric, numeric, numeric, numeric, integer, integer, boolean, text, jsonb) to service_role;
grant execute on function public.insert_bill(uuid, text, jsonb, jsonb, uuid) to service_role;
grant execute on function public.create_bill_from_document(uuid, text, jsonb, jsonb) to service_role;
grant execute on function public.reconcile_provider_bill(uuid) to authenticated, service_role;
grant execute on function public.reconcile_transporter_bill(uuid) to authenticated, service_role;
grant execute on function public.reconcile_invoice(uuid) to authenticated, service_role;
grant execute on function public.decide_reconciliation(public.bill_type, uuid, text, text) to authenticated;
grant execute on function public.create_bill(text, jsonb, jsonb) to authenticated;
grant execute on function public.review_create_bill_from_document(uuid, text, jsonb, jsonb) to authenticated;
grant execute on function public.create_invoice(jsonb, uuid[], jsonb, jsonb, boolean) to authenticated;
grant execute on function public.issue_invoice(uuid) to authenticated;
grant execute on function public.cancel_invoice(uuid, text) to authenticated;
grant execute on function public.record_payment(jsonb) to authenticated;
grant execute on function public.adjust_stock(uuid, uuid, numeric, date, text) to authenticated;
grant execute on function public.finance_totals() to authenticated, service_role;

-- ---------- Pipeline: bills go through the same decision entry point ----------
-- New action 'record_bill' (p_decision: {action, kind, bill, items, detail}); everything else unchanged.
create or replace function public.apply_document_decision(p_document_id uuid, p_decision jsonb)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_action text := p_decision ->> 'action';
  v_trip uuid := nullif(p_decision ->> 'trip_id', '')::uuid;
  v_type public.weight_record_type := nullif(p_decision ->> 'record_type', '')::public.weight_record_type;
  v_result jsonb;
begin
  if v_action = 'auto_record' then
    begin
      perform public.record_document_weight(p_document_id, v_trip, v_type,
        'Recorded automatically by AI from document ' || p_document_id::text);
      update public.documents
         set status = 'automatically_recorded', trip_id = v_trip, record_type = v_type,
             review_reason = null, review_detail = p_decision -> 'detail', processed_at = now()
       where id = p_document_id;
      perform set_config('app.change_reason', '', true);
      return 'automatically_recorded';
    exception when sqlstate '22023' then
      update public.documents
         set status = 'needs_review', review_reason = 'conflicting_weight_values',
             review_detail = coalesce(p_decision -> 'detail', '{}'::jsonb) || jsonb_build_object('record_error', sqlerrm),
             processed_at = now()
       where id = p_document_id;
      return 'needs_review';
    end;
  elsif v_action = 'record_bill' then
    begin
      perform set_config('app.change_reason', 'Recorded automatically by AI from document ' || p_document_id::text, true);
      v_result := public.create_bill_from_document(p_document_id, p_decision ->> 'kind', p_decision -> 'bill', p_decision -> 'items');
      perform set_config('app.change_reason', '', true);
      update public.documents set review_detail = coalesce(p_decision -> 'detail', '{}'::jsonb) || coalesce(review_detail, '{}'::jsonb)
       where id = p_document_id;
      return case v_result ->> 'status' when 'created' then 'automatically_recorded' else v_result ->> 'status' end;
    exception when sqlstate '22023' or sqlstate '23502' or sqlstate '23503' or sqlstate '23505' or sqlstate '23514' or sqlstate '22P02' or sqlstate '22007' or sqlstate '22008' then
      update public.documents
         set status = 'needs_review', review_reason = 'missing_essential_info',
             review_detail = coalesce(p_decision -> 'detail', '{}'::jsonb) || jsonb_build_object('record_error', sqlerrm),
             processed_at = now()
       where id = p_document_id;
      return 'needs_review';
    end;
  elsif v_action = 'duplicate' then
    update public.documents
       set status = 'duplicate', duplicate_of_document_id = nullif(p_decision ->> 'duplicate_of', '')::uuid,
           review_detail = p_decision -> 'detail', processed_at = now()
     where id = p_document_id;
    return 'duplicate';
  elsif v_action = 'extracted_only' then
    update public.documents set status = 'information_extracted', review_detail = p_decision -> 'detail', processed_at = now()
     where id = p_document_id;
    return 'information_extracted';
  elsif v_action = 'needs_review' then
    update public.documents
       set status = 'needs_review',
           review_reason = (p_decision ->> 'review_reason')::public.review_reason,
           review_detail = p_decision -> 'detail', processed_at = now()
     where id = p_document_id;
    return 'needs_review';
  end if;
  raise exception 'Unknown decision %.', v_action using errcode = '22023';
end
$$;
