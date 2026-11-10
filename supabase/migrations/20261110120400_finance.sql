-- =============================================================================
-- Finance: provider bills, transporter bills, customer invoices, reconciliation,
-- payments, expenses, app settings.
-- Rule: bills, invoices and reconciliation NEVER modify trips or purchases to force
-- a match. Reconciliation only records billed-vs-recorded figures and a decision.
-- =============================================================================

create table public.provider_bills (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null default public.current_business_id() references public.businesses (id),
  provider_id uuid not null references public.material_providers (id),
  bill_number text not null,
  bill_date date not null,
  due_date date,
  -- figures exactly as printed on the bill
  subtotal numeric(14,2) not null default 0 check (subtotal >= 0),
  tax_amount numeric(14,2) not null default 0 check (tax_amount >= 0),
  total_amount numeric(14,2) not null default 0 check (total_amount >= 0),
  recon_status public.recon_status not null default 'unreconciled',
  document_id uuid references public.documents (id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_by uuid default auth.uid() references auth.users (id) on delete set null,
  deleted_at timestamptz,
  unique (business_id, provider_id, bill_number),
  check (due_date is null or due_date >= bill_date)
);

create table public.provider_bill_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null default public.current_business_id() references public.businesses (id),
  bill_id uuid not null references public.provider_bills (id) on delete cascade,
  billed_reference text,
  line_date date,
  vehicle_number text,
  material_id uuid references public.materials (id),
  quantity numeric(14,3) check (quantity >= 0),
  unit public.material_unit,
  rate numeric(14,2) check (rate >= 0),
  amount numeric(14,2) not null check (amount >= 0),
  -- matched system records (null = not found in the system)
  purchase_id uuid references public.purchases (id) on delete set null,
  trip_id uuid references public.truck_trips (id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_by uuid default auth.uid() references auth.users (id) on delete set null
);

create table public.transporter_bills (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null default public.current_business_id() references public.businesses (id),
  transporter_id uuid not null references public.transporters (id),
  bill_number text not null,
  bill_date date not null,
  due_date date,
  period_from date,
  period_to date,
  subtotal numeric(14,2) not null default 0 check (subtotal >= 0),
  tax_amount numeric(14,2) not null default 0 check (tax_amount >= 0),
  total_amount numeric(14,2) not null default 0 check (total_amount >= 0),
  recon_status public.recon_status not null default 'unreconciled',
  document_id uuid references public.documents (id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_by uuid default auth.uid() references auth.users (id) on delete set null,
  deleted_at timestamptz,
  unique (business_id, transporter_id, bill_number),
  check (due_date is null or due_date >= bill_date),
  check (period_from is null or period_to is null or period_to >= period_from)
);

-- A transporter bill covers many trips. trip_id null = billed trip not found in the system.
create table public.transporter_bill_trips (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null default public.current_business_id() references public.businesses (id),
  bill_id uuid not null references public.transporter_bills (id) on delete cascade,
  trip_id uuid references public.truck_trips (id) on delete set null,
  billed_reference text,
  vehicle_number text,
  trip_date date,
  billed_amount numeric(14,2) not null check (billed_amount >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_by uuid default auth.uid() references auth.users (id) on delete set null,
  unique (bill_id, trip_id)
);

create table public.customer_invoices (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null default public.current_business_id() references public.businesses (id),
  -- assigned from app_settings numbering when left empty
  invoice_number text not null,
  customer_id uuid not null references public.customers (id),
  order_id uuid not null references public.customer_orders (id),
  site_id uuid references public.construction_sites (id),
  invoice_date date not null default (now() at time zone 'Asia/Kolkata')::date,
  due_date date,
  gst_mode public.gst_mode not null default 'cgst_sgst',
  -- subtotal / tax / total are recalculated from invoice_items
  subtotal numeric(14,2) not null default 0 check (subtotal >= 0),
  additional_charges numeric(14,2) not null default 0 check (additional_charges >= 0),
  tax_amount numeric(14,2) not null default 0 check (tax_amount >= 0),
  total_amount numeric(14,2) not null default 0 check (total_amount >= 0),
  status public.invoice_status not null default 'issued',
  recon_status public.recon_status not null default 'unreconciled',
  -- verification flags: excess_quantity, missing_delivery_records, wrong_rate, duplicate_invoice, amount_difference, order_mismatch
  verification_flags text[] not null default '{}',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_by uuid default auth.uid() references auth.users (id) on delete set null,
  deleted_at timestamptz,
  unique (business_id, invoice_number),
  check (due_date is null or due_date >= invoice_date)
);

-- A customer invoice covers many delivered trips (one item per trip, or an aggregated line).
create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null default public.current_business_id() references public.businesses (id),
  invoice_id uuid not null references public.customer_invoices (id) on delete cascade,
  material_id uuid not null references public.materials (id),
  description text,
  trip_id uuid references public.truck_trips (id) on delete set null,
  delivery_record_id uuid references public.delivery_records (id) on delete set null,
  quantity numeric(14,3) not null check (quantity > 0),
  unit public.material_unit not null,
  rate numeric(14,2) not null check (rate >= 0),
  gst_rate numeric(5,2) not null default 0 check (gst_rate between 0 and 28),
  amount numeric(14,2) generated always as (round(quantity * rate, 2)) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_by uuid default auth.uid() references auth.users (id) on delete set null
);

create table public.reconciliation_records (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null default public.current_business_id() references public.businesses (id),
  bill_type public.bill_type not null,
  provider_bill_id uuid references public.provider_bills (id) on delete cascade,
  transporter_bill_id uuid references public.transporter_bills (id) on delete cascade,
  invoice_id uuid references public.customer_invoices (id) on delete cascade,
  bill_id uuid generated always as (coalesce(provider_bill_id, transporter_bill_id, invoice_id)) stored,
  billed_amount numeric(14,2),
  recorded_amount numeric(14,2),
  amount_difference numeric(14,2) generated always as (billed_amount - recorded_amount) stored,
  billed_quantity numeric(14,3),
  recorded_quantity numeric(14,3),
  quantity_difference numeric(14,3) generated always as (billed_quantity - recorded_quantity) stored,
  billed_trips integer,
  recorded_trips integer,
  trip_difference integer generated always as (billed_trips - recorded_trips) stored,
  status public.recon_status not null default 'unreconciled',
  reason text,
  note text,
  resolved_by uuid references auth.users (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_by uuid default auth.uid() references auth.users (id) on delete set null,
  constraint reconciliation_one_bill check (
    (bill_type = 'provider_bill' and provider_bill_id is not null and transporter_bill_id is null and invoice_id is null)
    or (bill_type = 'transporter_bill' and transporter_bill_id is not null and provider_bill_id is null and invoice_id is null)
    or (bill_type = 'customer_invoice' and invoice_id is not null and provider_bill_id is null and transporter_bill_id is null)
  ),
  constraint reconciliation_resolution_needs_note check (
    status not in ('difference_approved', 'disputed', 'correction_requested') or length(trim(coalesce(note, ''))) > 0
  )
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null default public.current_business_id() references public.businesses (id),
  payment_code text not null unique default public.generate_code('PAY', 'public.payment_code_seq', 4),
  direction public.payment_direction not null,
  party_type public.party_type not null,
  customer_id uuid references public.customers (id),
  provider_id uuid references public.material_providers (id),
  transporter_id uuid references public.transporters (id),
  invoice_id uuid references public.customer_invoices (id),
  provider_bill_id uuid references public.provider_bills (id),
  transporter_bill_id uuid references public.transporter_bills (id),
  payment_date date not null default (now() at time zone 'Asia/Kolkata')::date,
  amount numeric(14,2) not null check (amount > 0),
  mode public.payment_mode not null,
  reference text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_by uuid default auth.uid() references auth.users (id) on delete set null,
  deleted_at timestamptz,
  constraint payments_party check (
    (party_type = 'customer' and direction = 'incoming' and customer_id is not null
      and provider_id is null and transporter_id is null and provider_bill_id is null and transporter_bill_id is null)
    or (party_type = 'provider' and direction = 'outgoing' and provider_id is not null
      and customer_id is null and transporter_id is null and invoice_id is null and transporter_bill_id is null)
    or (party_type = 'transporter' and direction = 'outgoing' and transporter_id is not null
      and customer_id is null and provider_id is null and invoice_id is null and provider_bill_id is null)
  ),
  constraint payments_reference check (mode = 'cash' or length(trim(coalesce(reference, ''))) > 0)
);
comment on table public.payments is 'Cash movements. Customer receipts are never counted as profit.';

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null default public.current_business_id() references public.businesses (id),
  expense_date date not null default (now() at time zone 'Asia/Kolkata')::date,
  category public.expense_category not null,
  amount numeric(14,2) not null check (amount > 0),
  description text not null check (length(trim(description)) > 0),
  paid_to text,
  mode public.payment_mode not null default 'cash',
  order_id uuid references public.customer_orders (id) on delete set null,
  trip_id uuid references public.truck_trips (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_by uuid default auth.uid() references auth.users (id) on delete set null,
  deleted_at timestamptz
);

create table public.app_settings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null default public.current_business_id() references public.businesses (id) unique,
  auto_process_confidence_threshold numeric(4,3) not null default 0.85
    check (auto_process_confidence_threshold between 0 and 1),
  -- which weight invoices and profit use
  authoritative_weight public.weight_record_type not null default 'delivery',
  -- used for new materials; each material keeps its own shortage_tolerance
  default_shortage_tolerance numeric(14,3) not null default 0.25 check (default_shortage_tolerance >= 0),
  gst_config jsonb not null default '{"gstin": null, "pan": null, "state_code": "27", "default_mode": "cgst_sgst", "default_rate": 5}'::jsonb,
  invoice_prefix text not null default 'INV' check (invoice_prefix ~ '^[A-Z]{2,6}$'),
  invoice_number_width integer not null default 4 check (invoice_number_width between 3 and 8),
  next_invoice_number integer not null default 1 check (next_invoice_number > 0),
  business_profile jsonb not null default '{}'::jsonb,
  notification_preferences jsonb not null default '{"review_queue": true, "shortages": true, "bill_mismatch": true, "overdue_payments": true, "failed_documents": true, "daily_summary": false}'::jsonb,
  enabled_units public.material_unit[] not null default '{MT,CFT,BRASS,CUM,TRIP}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_by uuid default auth.uid() references auth.users (id) on delete set null
);

-- ---------- Document links to finance records ----------
alter table public.documents
  add constraint documents_provider_bill_id_fkey foreign key (provider_bill_id) references public.provider_bills (id) on delete set null,
  add constraint documents_transporter_bill_id_fkey foreign key (transporter_bill_id) references public.transporter_bills (id) on delete set null,
  add constraint documents_invoice_id_fkey foreign key (invoice_id) references public.customer_invoices (id) on delete set null,
  add constraint documents_payment_id_fkey foreign key (payment_id) references public.payments (id) on delete set null;

-- ---------- Invoice numbering from app_settings ----------
create function public.assign_invoice_number()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.invoice_number is null or length(trim(new.invoice_number)) = 0 then
    update public.app_settings s
       set next_invoice_number = s.next_invoice_number + 1
     where s.business_id = new.business_id
    returning s.invoice_prefix || '-' || to_char(new.invoice_date, 'YYYY') || '-'
              || lpad((s.next_invoice_number - 1)::text, s.invoice_number_width, '0')
      into new.invoice_number;
    if new.invoice_number is null then
      raise exception 'No app_settings row for business %; cannot number the invoice.', new.business_id;
    end if;
  end if;
  return new;
end
$$;
create trigger customer_invoices_number before insert on public.customer_invoices
  for each row execute function public.assign_invoice_number();

-- ---------- Invoice totals always follow the items ----------
create function public.recalculate_invoice_totals(p_invoice_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update public.customer_invoices i
     set subtotal = coalesce(x.subtotal, 0),
         tax_amount = case when i.gst_mode = 'none' then 0 else coalesce(x.tax, 0) end,
         total_amount = coalesce(x.subtotal, 0) + i.additional_charges
                        + case when i.gst_mode = 'none' then 0 else coalesce(x.tax, 0) end
    from (
      select sum(ii.amount) as subtotal, round(sum(ii.amount * ii.gst_rate / 100), 2) as tax
      from public.invoice_items ii where ii.invoice_id = p_invoice_id
    ) x
   where i.id = p_invoice_id;
end
$$;

create function public.invoice_items_changed()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.recalculate_invoice_totals(coalesce(new.invoice_id, old.invoice_id));
  if tg_op = 'UPDATE' and new.invoice_id is distinct from old.invoice_id then
    perform public.recalculate_invoice_totals(old.invoice_id);
  end if;
  return null;
end
$$;
create trigger invoice_items_totals after insert or update or delete on public.invoice_items
  for each row execute function public.invoice_items_changed();

create function public.customer_invoice_header_changed()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.recalculate_invoice_totals(new.id);
  return null;
end
$$;
create trigger customer_invoices_totals after update of gst_mode, additional_charges on public.customer_invoices
  for each row execute function public.customer_invoice_header_changed();

-- ---------- Reconciliation decision is mirrored on the bill (bill figures untouched) ----------
create function public.apply_reconciliation_status()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.provider_bill_id is not null then
    update public.provider_bills set recon_status = new.status where id = new.provider_bill_id;
  elsif new.transporter_bill_id is not null then
    update public.transporter_bills set recon_status = new.status where id = new.transporter_bill_id;
  elsif new.invoice_id is not null then
    update public.customer_invoices set recon_status = new.status where id = new.invoice_id;
  end if;
  return null;
end
$$;
create trigger reconciliation_records_apply after insert or update of status on public.reconciliation_records
  for each row execute function public.apply_reconciliation_status();

-- ---------- Payments must match their invoice / bill and not overpay ----------
create function public.validate_payment()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_total numeric(14,2);
  v_paid numeric(14,2);
begin
  if new.invoice_id is not null then
    select total_amount into v_total from public.customer_invoices
     where id = new.invoice_id and customer_id = new.customer_id;
    if v_total is null then raise exception 'Invoice does not belong to this customer.' using errcode = '23514'; end if;
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
  if new.deleted_at is null and v_paid + new.amount > v_total + 1 then
    raise exception 'Payment of % exceeds the remaining balance of %.', new.amount, v_total - v_paid using errcode = '23514';
  end if;
  return new;
end
$$;
create trigger payments_validate before insert or update on public.payments
  for each row execute function public.validate_payment();
