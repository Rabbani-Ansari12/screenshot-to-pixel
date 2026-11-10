-- =============================================================================
-- Foundation: enums, tenant (business), profiles, employees, permissions,
-- audit log, shared trigger functions, security helpers, code generators.
-- Conventions for every table:
--   id uuid pk, business_id uuid not null, created_at/updated_at (trigger),
--   created_by/updated_by, deleted_at (soft delete) where appropriate.
--   Money numeric(14,2); quantities/weights numeric(14,3). Never float.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------- Enums ----------
create type public.user_role as enum ('owner', 'employee');
create type public.permission_key as enum (
  'view_records', 'manage_orders', 'review_documents', 'manage_trips',
  'correct_extracted', 'verify_bills', 'record_payments', 'view_financial_reports'
);
-- Units are never converted into each other (no MT <-> volume conversion anywhere).
create type public.material_unit as enum ('MT', 'CFT', 'BRASS', 'CUM', 'TRIP');
create type public.order_status as enum ('draft', 'confirmed', 'in_progress', 'completed', 'on_hold', 'cancelled');
create type public.delivery_mode as enum ('direct_to_site', 'stock_yard');
create type public.purchase_status as enum ('recorded', 'needs_verification', 'billed', 'cancelled');
create type public.trip_status as enum ('loaded', 'in_transit', 'delivered', 'needs_verification', 'confirmed_shortage', 'cancelled');
-- Quantity difference checks. These are operational checks, never labelled as fraud.
create type public.tolerance_status as enum ('normal', 'needs_verification', 'confirmed_shortage');
create type public.investigation_outcome as enum (
  'under_investigation', 'weighbridge_calibration_difference', 'moisture_or_spillage_loss',
  'site_measurement_difference', 'recovered_from_transporter', 'accepted_as_normal_loss'
);
create type public.weight_record_type as enum ('loading', 'delivery');
create type public.record_source as enum ('whatsapp', 'manual');
create type public.measurement_method as enum ('weighbridge', 'site_measurement', 'count');
create type public.document_type as enum (
  'weighbridge_slip', 'loading_slip', 'unloading_slip', 'provider_bill',
  'transporter_bill', 'delivery_photo', 'payment_receipt', 'other'
);
create type public.document_source as enum ('whatsapp', 'manual');
create type public.document_status as enum (
  'received', 'processing', 'information_extracted', 'matched',
  'automatically_recorded', 'needs_review', 'failed', 'duplicate'
);
create type public.review_reason as enum (
  'low_confidence', 'missing_essential_info', 'multiple_possible_matches',
  'conflicting_weight_values', 'financial_discrepancy'
);
create type public.ai_status as enum ('pending', 'processing', 'succeeded', 'needs_review', 'failed');
create type public.recon_status as enum (
  'unreconciled', 'matched', 'mismatch', 'disputed', 'correction_requested', 'difference_approved', 'reconciled'
);
create type public.bill_type as enum ('provider_bill', 'transporter_bill', 'customer_invoice');
create type public.invoice_status as enum ('draft', 'issued', 'cancelled');
create type public.gst_mode as enum ('cgst_sgst', 'igst', 'none');
create type public.payment_direction as enum ('incoming', 'outgoing');
create type public.party_type as enum ('customer', 'provider', 'transporter');
create type public.payment_mode as enum ('upi', 'bank_transfer', 'cheque', 'cash');
create type public.expense_category as enum ('labour', 'loading', 'unloading', 'fuel', 'toll', 'waiting', 'other');
create type public.stock_movement_type as enum ('received', 'issued', 'adjustment');
create type public.audit_action as enum ('INSERT', 'UPDATE', 'DELETE');

-- ---------- Tenant ----------
-- One business today; every table carries business_id so more can be added later.
create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  legal_name text,
  gstin text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_by uuid default auth.uid() references auth.users (id) on delete set null
);

-- ---------- People ----------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  business_id uuid not null references public.businesses (id),
  full_name text not null default '',
  email text,
  phone text,
  role public.user_role not null default 'employee',
  -- New accounts start inactive unless the owner (service role) activates them.
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_by uuid default auth.uid() references auth.users (id) on delete set null
);

-- ---------- Security helpers ----------
-- All are SECURITY DEFINER so RLS policies can call them without recursion.
create function public.current_business_id()
returns uuid
language sql stable security definer set search_path = ''
as $$
  select p.business_id from public.profiles p where p.id = auth.uid() and p.is_active
$$;

create function public.is_active_user()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_active)
$$;

create function public.is_owner()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_active and p.role = 'owner')
$$;

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null default public.current_business_id() references public.businesses (id),
  profile_id uuid unique references public.profiles (id) on delete set null,
  full_name text not null check (length(trim(full_name)) > 0),
  email text,
  phone text,
  designation text,
  joined_on date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_by uuid default auth.uid() references auth.users (id) on delete set null,
  deleted_at timestamptz
);

create table public.user_permissions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null default public.current_business_id() references public.businesses (id),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  permission public.permission_key not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_by uuid default auth.uid() references auth.users (id) on delete set null,
  unique (profile_id, permission)
);

-- ---------- Audit log (append-only) ----------
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id),
  table_name text not null,
  record_id uuid,
  action public.audit_action not null,
  old_data jsonb,
  new_data jsonb,
  -- No FK: audit rows must survive user deletion.
  changed_by uuid,
  changed_at timestamptz not null default now()
);

-- ---------- Security helpers (continued) ----------
create function public.has_permission(p_key public.permission_key)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.is_owner()
      or exists (
        select 1
        from public.user_permissions up
        join public.profiles p on p.id = up.profile_id
        where up.profile_id = auth.uid() and p.is_active and up.permission = p_key
      )
$$;

comment on function public.has_permission is 'Owner has every permission; employees need an explicit user_permissions row and an active profile.';

-- ---------- Shared trigger functions ----------
create function public.set_updated_at()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  new.created_at := old.created_at;
  new.created_by := old.created_by;
  return new;
end
$$;

create function public.audit_row_change()
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
  insert into public.audit_logs (business_id, table_name, record_id, action, old_data, new_data, changed_by)
  values (
    coalesce((v_new ->> 'business_id')::uuid, (v_old ->> 'business_id')::uuid),
    tg_table_name,
    coalesce((v_new ->> 'id')::uuid, (v_old ->> 'id')::uuid),
    tg_op::public.audit_action,
    v_old,
    v_new,
    auth.uid()
  );
  return coalesce(new, old);
end
$$;

create function public.prevent_audit_mutation()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  raise exception 'audit_logs is append-only: % is not allowed', tg_op using errcode = '42501';
end
$$;

create trigger audit_logs_no_update_delete
  before update or delete on public.audit_logs
  for each row execute function public.prevent_audit_mutation();
create trigger audit_logs_no_truncate
  before truncate on public.audit_logs
  for each statement execute function public.prevent_audit_mutation();

-- ---------- Human-readable codes ----------
create sequence public.trip_code_seq start 101;
create sequence public.order_code_seq start 101;
create sequence public.purchase_code_seq start 101;
create sequence public.payment_code_seq start 101;

-- e.g. generate_code('TRP', 'public.trip_code_seq', 5) -> TRP-2026-00123 (year in IST)
create function public.generate_code(p_prefix text, p_seq regclass, p_width integer)
returns text
language sql volatile security definer set search_path = ''
as $$
  select p_prefix || '-' || to_char(now() at time zone 'Asia/Kolkata', 'YYYY') || '-'
         || lpad(nextval(p_seq)::text, p_width, '0')
$$;

-- ---------- New auth users get a profile (inactive unless activated) ----------
-- Role / activation / business only come from app_metadata, which users cannot edit.
create function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_business uuid := nullif(new.raw_app_meta_data ->> 'business_id', '')::uuid;
begin
  if v_business is null then
    select b.id into v_business from public.businesses b order by b.created_at limit 1;
  end if;
  if v_business is null then
    return new; -- no business yet; scripts/create-owner.ts creates it and the profile
  end if;
  insert into public.profiles (id, business_id, full_name, email, role, is_active)
  values (
    new.id,
    v_business,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.email,
    coalesce(nullif(new.raw_app_meta_data ->> 'role', ''), 'employee')::public.user_role,
    coalesce((new.raw_app_meta_data ->> 'is_active')::boolean, false)
  )
  on conflict (id) do nothing;
  return new;
end
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
