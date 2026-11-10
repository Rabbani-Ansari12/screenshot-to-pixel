-- =============================================================================
-- Master data: customers & sites, materials & rates, providers, transporters,
-- drivers, vehicles, stock locations.
-- =============================================================================

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null default public.current_business_id() references public.businesses (id),
  name text not null check (length(trim(name)) > 0),
  customer_type text,
  gstin text check (gstin is null or gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9]Z[A-Z0-9]$'),
  contact_name text,
  phone text,
  email text,
  city text,
  state text,
  billing_address text,
  credit_days integer not null default 30 check (credit_days between 0 and 365),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_by uuid default auth.uid() references auth.users (id) on delete set null,
  deleted_at timestamptz
);

create table public.construction_sites (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null default public.current_business_id() references public.businesses (id),
  customer_id uuid not null references public.customers (id),
  name text not null check (length(trim(name)) > 0),
  address text,
  city text,
  contact_name text,
  contact_phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_by uuid default auth.uid() references auth.users (id) on delete set null,
  deleted_at timestamptz,
  -- lets orders reference (site, customer) together so a site always belongs to the order's customer
  unique (id, customer_id)
);

create table public.materials (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null default public.current_business_id() references public.businesses (id),
  name text not null check (length(trim(name)) > 0),
  -- configurable free-text category (Sand, Aggregate, Cement, ...)
  category text not null,
  unit public.material_unit not null,
  hsn_code text,
  gst_rate numeric(5,2) not null default 5 check (gst_rate between 0 and 28),
  purchase_rate numeric(14,2) check (purchase_rate >= 0),
  selling_rate numeric(14,2) check (selling_rate >= 0),
  -- allowed loading-vs-delivery difference, in the material's own unit
  shortage_tolerance numeric(14,3) not null default 0 check (shortage_tolerance >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_by uuid default auth.uid() references auth.users (id) on delete set null,
  deleted_at timestamptz
);
comment on column public.materials.unit is 'Unit the material is traded in. Quantities are never converted between MT and volume units.';
comment on column public.materials.shortage_tolerance is 'Difference up to 1x is normal, up to 2x needs verification, above is a confirmed shortage.';
create unique index materials_business_name_key on public.materials (business_id, lower(name)) where deleted_at is null;

create table public.material_providers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null default public.current_business_id() references public.businesses (id),
  name text not null check (length(trim(name)) > 0),
  city text,
  gstin text check (gstin is null or gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9]Z[A-Z0-9]$'),
  contact_name text,
  -- WhatsApp number documents from this provider arrive from
  phone text,
  payment_terms_days integer not null default 30 check (payment_terms_days between 0 and 365),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_by uuid default auth.uid() references auth.users (id) on delete set null,
  deleted_at timestamptz
);

-- Purchase rates (per provider) and selling rates over time.
create table public.material_rates (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null default public.current_business_id() references public.businesses (id),
  material_id uuid not null references public.materials (id) on delete cascade,
  provider_id uuid references public.material_providers (id) on delete cascade,
  rate_type text not null check (rate_type in ('purchase', 'selling')),
  rate numeric(14,2) not null check (rate >= 0),
  effective_from date not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_by uuid default auth.uid() references auth.users (id) on delete set null,
  constraint material_rates_selling_has_no_provider check (rate_type = 'purchase' or provider_id is null)
);

create table public.transporters (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null default public.current_business_id() references public.businesses (id),
  name text not null check (length(trim(name)) > 0),
  city text,
  gstin text check (gstin is null or gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9]Z[A-Z0-9]$'),
  contact_name text,
  phone text,
  rate_per_trip numeric(14,2) check (rate_per_trip >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_by uuid default auth.uid() references auth.users (id) on delete set null,
  deleted_at timestamptz
);

create table public.drivers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null default public.current_business_id() references public.businesses (id),
  transporter_id uuid not null references public.transporters (id),
  full_name text not null check (length(trim(full_name)) > 0),
  phone text,
  license_number text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_by uuid default auth.uid() references auth.users (id) on delete set null,
  deleted_at timestamptz
);

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null default public.current_business_id() references public.businesses (id),
  transporter_id uuid not null references public.transporters (id),
  default_driver_id uuid references public.drivers (id) on delete set null,
  vehicle_number text not null,
  -- 'MH 12 AB 1234' and 'mh12ab1234' are the same vehicle
  vehicle_number_normalized text generated always as (upper(regexp_replace(vehicle_number, '[^A-Za-z0-9]', '', 'g'))) stored,
  vehicle_type text,
  capacity_mt numeric(14,3) check (capacity_mt > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_by uuid default auth.uid() references auth.users (id) on delete set null,
  deleted_at timestamptz
);
create unique index vehicles_business_number_key on public.vehicles (business_id, vehicle_number_normalized) where deleted_at is null;

create table public.stock_locations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null default public.current_business_id() references public.businesses (id),
  name text not null check (length(trim(name)) > 0),
  address text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_by uuid default auth.uid() references auth.users (id) on delete set null,
  deleted_at timestamptz
);
