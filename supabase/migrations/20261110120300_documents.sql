-- =============================================================================
-- WhatsApp messages, documents (files in the private `documents` bucket) and
-- AI processing records (Gemini extraction results).
-- =============================================================================

create table public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null default public.current_business_id() references public.businesses (id),
  twilio_message_sid text not null unique,
  from_phone text not null,
  to_phone text,
  sender_name text,
  body text,
  num_media integer not null default 0 check (num_media >= 0),
  received_at timestamptz not null default now(),
  processing_status public.document_status not null default 'received',
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_by uuid default auth.uid() references auth.users (id) on delete set null
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null default public.current_business_id() references public.businesses (id),
  -- <business_id>/<yyyy>/<mm>/<uuid>.<ext> inside the `documents` bucket
  storage_path text not null unique,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  file_name text,
  mime_type text,
  size_bytes bigint check (size_bytes >= 0),
  page_count integer check (page_count > 0),
  doc_type public.document_type not null default 'other',
  source public.document_source not null,
  status public.document_status not null default 'received',
  sender_phone text,
  sender_name text,
  received_at timestamptz not null default now(),
  whatsapp_message_id uuid references public.whatsapp_messages (id) on delete set null,
  overall_confidence numeric(5,4) check (overall_confidence between 0 and 1),
  review_reason public.review_reason,
  duplicate_of_document_id uuid references public.documents (id) on delete set null,
  -- linked records (FKs to bills / invoices / payments are added in the finance migration)
  purchase_id uuid references public.purchases (id) on delete set null,
  trip_id uuid references public.truck_trips (id) on delete set null,
  delivery_record_id uuid references public.delivery_records (id) on delete set null,
  provider_bill_id uuid,
  transporter_bill_id uuid,
  invoice_id uuid,
  payment_id uuid,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_by uuid default auth.uid() references auth.users (id) on delete set null,
  deleted_at timestamptz,
  -- the same file is only stored once per business
  unique (business_id, sha256),
  constraint documents_not_own_duplicate check (duplicate_of_document_id is distinct from id)
);

alter table public.weight_records
  add constraint weight_records_document_id_fkey foreign key (document_id) references public.documents (id) on delete set null;

create table public.ai_processing_records (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null default public.current_business_id() references public.businesses (id),
  document_id uuid not null references public.documents (id) on delete cascade,
  model text not null,
  raw_response jsonb,
  extracted jsonb,
  field_confidences jsonb,
  overall_confidence numeric(5,4) check (overall_confidence between 0 and 1),
  match_result jsonb,
  -- human corrections: [{field, from, to, by, at, reason}]; every change is also in audit_logs
  corrections jsonb not null default '[]'::jsonb check (jsonb_typeof(corrections) = 'array'),
  status public.ai_status not null default 'pending',
  attempts integer not null default 0 check (attempts >= 0),
  error text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_by uuid default auth.uid() references auth.users (id) on delete set null
);
