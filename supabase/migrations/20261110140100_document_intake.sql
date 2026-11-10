-- =============================================================================
-- Document intake without WhatsApp: staff upload now, driver link next. The pipeline is
-- channel-agnostic: every source calls create_document_from_upload().
--
--   upload -> documents row (received) -> document_jobs (queued) -> process-document worker
--   -> Gemini extraction (ai_processing_records) -> matcher -> automatically recorded | needs review
--
-- Principles enforced here:
--   * AI never invents values: missing fields stay null and are flagged by the worker.
--   * Original files and original extracted values are never changed. Corrections live in
--     document_corrections and are audited with a reason.
--   * Nothing is forced silently: a document never overwrites an existing weight record.
-- =============================================================================

-- ---------- Remove WhatsApp ----------
do $$
begin
  if exists (select 1 from public.whatsapp_messages) then
    raise exception 'whatsapp_messages still has rows. Export them before applying this migration.';
  end if;
end
$$;

drop index if exists public.idx_documents_sender_phone;
alter table public.documents
  drop column whatsapp_message_id,
  drop column sender_phone,
  drop column sender_name;
drop table public.whatsapp_messages;

alter table public.documents
  alter column source type public.document_intake_source using 'staff_upload'::public.document_intake_source,
  alter column source set default 'staff_upload';
drop type public.document_source;

-- ---------- Documents: intake fields ----------
alter table public.documents
  add column trip_hint_id uuid references public.truck_trips (id) on delete set null,
  add column uploaded_by uuid default auth.uid() references auth.users (id) on delete set null,
  add column uploaded_by_label text check (uploaded_by_label is null or length(uploaded_by_label) <= 120),
  add column document_type_hint text check (
    document_type_hint is null or document_type_hint in (
      'weighbridge_slip', 'loading_slip', 'unloading_slip', 'provider_bill',
      'transporter_bill', 'delivery_photo', 'payment_receipt', 'other')),
  -- normalised extraction as returned by the AI; never edited (corrections are separate)
  add column extracted jsonb,
  -- matcher output: candidates with per-criterion scores, checks, reason details
  add column review_detail jsonb,
  add column processed_at timestamptz,
  -- loading / delivery: what the document was recorded as on its trip
  add column record_type public.weight_record_type;

comment on column public.documents.extracted is 'Original normalised AI extraction: {doc_type, doc_type_confidence, fields: {name: {value, confidence, legible}}, warnings}. Never edited.';

-- Exact duplicates are kept as their own rows (status duplicate) and point at the original.
alter table public.documents drop constraint documents_business_id_sha256_key;
create unique index documents_one_original_per_hash on public.documents (business_id, sha256)
  where duplicate_of_document_id is null and deleted_at is null;
create index idx_documents_sha256 on public.documents (business_id, sha256);
create index idx_documents_trip_hint on public.documents (trip_hint_id);
create index idx_documents_uploaded_by on public.documents (uploaded_by);
create index idx_documents_slip_vehicle on public.documents (business_id, (extracted #>> '{fields,slip_number,value}'), (extracted #>> '{fields,vehicle_number,value}'));

alter table public.ai_processing_records add column usage jsonb;
comment on column public.ai_processing_records.usage is 'Token usage per call: {calls, prompt_tokens, output_tokens, total_tokens}.';

-- ---------- Corrections (originals preserved) ----------
create table public.document_corrections (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id),
  document_id uuid not null references public.documents (id) on delete cascade,
  field_key text not null check (field_key ~ '^[a-z_]{2,40}$'),
  original_value text,
  corrected_value text,
  reason text not null check (length(trim(reason)) >= 3),
  corrected_by uuid default auth.uid() references auth.users (id) on delete set null,
  corrected_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index idx_document_corrections_document on public.document_corrections (document_id, corrected_at);
create index idx_document_corrections_business on public.document_corrections (business_id);
create trigger document_corrections_audit after insert or update or delete on public.document_corrections
  for each row execute function public.audit_row_change();
create function public.prevent_correction_mutation()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  raise exception 'Corrections are append-only: add a new correction instead of changing one (%).', tg_op using errcode = '42501';
end
$$;
create trigger document_corrections_no_update_delete before update or delete on public.document_corrections
  for each row execute function public.prevent_correction_mutation();

-- ---------- Processing queue ----------
create table public.document_jobs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id),
  document_id uuid not null unique references public.documents (id) on delete cascade,
  status public.document_job_status not null default 'queued',
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 3 check (max_attempts between 1 and 10),
  next_run_at timestamptz not null default now(),
  locked_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_document_jobs_due on public.document_jobs (status, next_run_at);
create index idx_document_jobs_business on public.document_jobs (business_id);
create function public.touch_updated_at()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end
$$;
create trigger document_jobs_touch_updated_at before update on public.document_jobs
  for each row execute function public.touch_updated_at();

-- ---------- AI cost control ----------
create table public.ai_usage_daily (
  business_id uuid not null references public.businesses (id),
  day date not null,
  calls integer not null default 0 check (calls >= 0),
  prompt_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  primary key (business_id, day)
);

alter table public.app_settings
  add column ai_daily_call_cap integer not null default 300 check (ai_daily_call_cap between 0 and 100000),
  -- |printed net - (gross - tare)| above this (in MT) is a weight conflict
  add column net_weight_tolerance numeric(14,3) not null default 0.02 check (net_weight_tolerance >= 0),
  -- matcher: a candidate needs this score, and this lead over the runner-up, to be recorded automatically
  add column match_threshold numeric(4,3) not null default 0.700 check (match_threshold between 0 and 1),
  add column match_margin numeric(4,3) not null default 0.150 check (match_margin between 0 and 1),
  add column match_weights jsonb not null default
    '{"vehicle": 0.35, "slip_or_trip_code": 0.15, "time": 0.2, "material": 0.1, "provider": 0.08, "transporter": 0.04, "order": 0.04, "destination": 0.04, "existing_records": 0.05}'::jsonb,
  add column match_window_hours integer not null default 72 check (match_window_hours between 1 and 720);

-- ---------- In-app notifications (exceptions only) ----------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id),
  kind text not null check (kind in ('document_review', 'document_failed', 'shortage', 'ai_cap', 'system')),
  severity text not null default 'warning' check (severity in ('info', 'warning', 'danger')),
  title text not null,
  detail text,
  href text,
  document_id uuid references public.documents (id) on delete cascade,
  trip_id uuid references public.truck_trips (id) on delete cascade,
  -- only users with this permission see it (owner sees everything); null = everyone active
  required_permission public.permission_key,
  read_by uuid[] not null default '{}',
  created_at timestamptz not null default now()
);
create index idx_notifications_business_created on public.notifications (business_id, created_at desc);
create index idx_notifications_document on public.notifications (document_id);
create index idx_notifications_trip on public.notifications (trip_id);

-- ---------- RLS ----------
alter table public.document_corrections enable row level security;
alter table public.document_jobs enable row level security;
alter table public.ai_usage_daily enable row level security;
alter table public.notifications enable row level security;

create policy document_corrections_select on public.document_corrections for select to authenticated
  using (business_id = (select public.current_business_id())
         and ((select public.has_permission('view_records')) or (select public.has_permission('review_documents'))));
create policy document_jobs_select on public.document_jobs for select to authenticated
  using (business_id = (select public.current_business_id())
         and ((select public.has_permission('view_records')) or (select public.has_permission('review_documents'))));
create policy ai_usage_daily_select on public.ai_usage_daily for select to authenticated
  using (business_id = (select public.current_business_id()) and (select public.is_owner()));
create policy notifications_select on public.notifications for select to authenticated
  using (business_id = (select public.current_business_id())
         and (required_permission is null or (select public.has_permission(required_permission))));
-- No insert / update / delete policies: these tables change only through the functions below.

revoke all on public.document_corrections, public.document_jobs, public.ai_usage_daily, public.notifications from anon;
revoke insert, update, delete, truncate, references, trigger
  on public.document_corrections, public.document_jobs, public.ai_usage_daily, public.notifications from authenticated;

-- Uploads go through register_uploaded_document(); clients no longer insert documents directly.
drop policy documents_insert on public.documents;
-- Status, links and corrections change only through the review functions below.
drop policy documents_update on public.documents;
drop policy ai_processing_records_insert on public.ai_processing_records;
drop policy ai_processing_records_update on public.ai_processing_records;

-- =============================================================================
-- Helpers
-- =============================================================================

-- Raises unless the signed-in user is active and has the permission.
create function public.require_permission(p_key public.permission_key)
returns void
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.has_permission(p_key) then
    raise exception 'You need the % permission for this.', replace(p_key::text, '_', ' ') using errcode = '42501';
  end if;
end
$$;

-- The document, if it belongs to the signed-in user's business.
create function public.document_for_user(p_document_id uuid)
returns public.documents
language plpgsql stable security definer set search_path = ''
as $$
declare
  v public.documents;
begin
  select * into v from public.documents d
   where d.id = p_document_id and d.business_id = public.current_business_id() and d.deleted_at is null;
  if v.id is null then
    raise exception 'Document not found.' using errcode = '22023';
  end if;
  return v;
end
$$;

-- Effective field values: original extraction, overridden by the latest correction per field.
create function public.document_effective_fields(p_document_id uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select jsonb_object_agg(f.key, f.value -> 'value') from public.documents d,
            jsonb_each(coalesce(d.extracted -> 'fields', '{}'::jsonb)) f
      where d.id = p_document_id), '{}'::jsonb)
  || coalesce(
    (select jsonb_object_agg(c.field_key, to_jsonb(c.corrected_value)) from (
       select distinct on (field_key) field_key, corrected_value
         from public.document_corrections where document_id = p_document_id
        order by field_key, corrected_at desc) c), '{}'::jsonb)
$$;

-- Wakes the worker through pg_net. Does nothing until the URL and secret are in Vault
-- (scripts/setup-document-worker.ts) or when nothing is due. Never fails the caller.
create function public.kick_document_worker()
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  if not exists (
    select 1 from public.document_jobs j
     where (j.status = 'queued' and j.next_run_at <= now())
        or (j.status = 'running' and j.locked_at < now() - interval '10 minutes')
  ) then
    return;
  end if;
  begin
    execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into v_url using 'process_document_url';
    execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into v_secret using 'document_worker_secret';
  exception when others then
    return;
  end;
  if v_url is null or v_secret is null then
    return;
  end if;
  begin
    execute 'select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 5000)'
      using v_url, '{}'::jsonb,
            jsonb_build_object('Content-Type', 'application/json', 'x-worker-secret', v_secret);
  exception when others then
    null; -- the cron run retries
  end;
end
$$;

-- Queue a document for (re)processing.
create function public.enqueue_document(p_document_id uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_job uuid;
begin
  insert into public.document_jobs (business_id, document_id)
  select d.business_id, d.id from public.documents d where d.id = p_document_id
  on conflict (document_id) do update
    set status = 'queued', attempts = 0, next_run_at = now(), locked_at = null, last_error = null
  returning id into v_job;
  if v_job is null then
    raise exception 'Document not found.' using errcode = '22023';
  end if;
  perform public.kick_document_worker();
  return v_job;
end
$$;

-- =============================================================================
-- Intake (shared by every channel)
-- =============================================================================
create function public.create_document_from_upload(
  p_business_id uuid,
  p_storage_path text,
  p_sha256 text,
  p_file_name text,
  p_mime_type text,
  p_size_bytes bigint,
  p_source public.document_intake_source,
  p_trip_hint_id uuid default null,
  p_document_type_hint text default null,
  p_uploaded_by_label text default null,
  p_uploaded_by uuid default null
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_original uuid;
  v_id uuid;
  v_hint uuid := p_trip_hint_id;
begin
  if p_storage_path is null or split_part(p_storage_path, '/', 1) <> p_business_id::text then
    raise exception 'The file must be stored under the business folder.' using errcode = '22023';
  end if;
  if v_hint is not null and not exists (
    select 1 from public.truck_trips t where t.id = v_hint and t.business_id = p_business_id and t.deleted_at is null
  ) then
    v_hint := null;
  end if;

  -- Exact duplicate of a file we already have: keep it as evidence, do not process it again.
  select d.id into v_original from public.documents d
   where d.business_id = p_business_id and d.sha256 = lower(p_sha256)
     and d.duplicate_of_document_id is null and d.deleted_at is null
   limit 1;

  insert into public.documents (business_id, storage_path, sha256, file_name, mime_type, size_bytes, source,
                                status, duplicate_of_document_id, trip_hint_id, document_type_hint,
                                uploaded_by_label, uploaded_by, created_by)
  values (p_business_id, p_storage_path, lower(p_sha256), p_file_name, p_mime_type, p_size_bytes, p_source,
          case when v_original is null then 'received'::public.document_status else 'duplicate'::public.document_status end,
          v_original, v_hint, nullif(p_document_type_hint, ''), nullif(trim(coalesce(p_uploaded_by_label, '')), ''),
          p_uploaded_by, p_uploaded_by)
  returning id into v_id;

  if v_original is null then
    perform public.enqueue_document(v_id);
  end if;
  return jsonb_build_object(
    'id', v_id,
    'status', case when v_original is null then 'received' else 'duplicate' end,
    'duplicate_of', v_original);
end
$$;

-- Staff upload from the app (after the file is in Storage under <business>/<yyyy>/<mm>/<uuid>.<ext>).
create function public.register_uploaded_document(
  p_storage_path text,
  p_sha256 text,
  p_file_name text,
  p_mime_type text,
  p_size_bytes bigint,
  p_trip_hint_id uuid default null,
  p_document_type_hint text default null,
  p_uploaded_by_label text default null
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  if not (public.has_permission('review_documents') or public.has_permission('manage_trips')) then
    raise exception 'You need the review documents or manage trips permission to upload.' using errcode = '42501';
  end if;
  if p_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid file hash.' using errcode = '22023';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'documents' and o.name = p_storage_path) then
    raise exception 'Upload the file before registering it.' using errcode = '22023';
  end if;
  return public.create_document_from_upload(
    public.current_business_id(), p_storage_path, p_sha256, p_file_name, p_mime_type, p_size_bytes,
    'staff_upload', p_trip_hint_id, p_document_type_hint, p_uploaded_by_label, auth.uid());
end
$$;

-- =============================================================================
-- Worker (service role only)
-- =============================================================================

-- Claims due jobs. FOR UPDATE SKIP LOCKED lets several workers run without taking the same job;
-- jobs stuck in 'running' for 10 minutes are picked up again.
create function public.claim_document_jobs(p_limit integer default 5)
returns setof public.document_jobs
language plpgsql security definer set search_path = ''
as $$
begin
  return query
  with due as (
    select j.id from public.document_jobs j
     where (j.status = 'queued' and j.next_run_at <= now())
        or (j.status = 'running' and j.locked_at < now() - interval '10 minutes')
     order by j.next_run_at
     limit greatest(1, least(p_limit, 20))
     for update skip locked
  )
  update public.document_jobs j
     set status = 'running', locked_at = now(), attempts = j.attempts + 1
    from due where j.id = due.id
  returning j.*;
  update public.documents d set status = 'processing'
   where d.id in (select j.document_id from public.document_jobs j where j.status = 'running' and j.locked_at = now())
     and d.status in ('received', 'processing', 'failed');
end
$$;

-- Done, or retry with exponential backoff (2, 4, 8 … minutes); permanent failure after max_attempts.
create function public.finish_document_job(p_job_id uuid, p_error text default null)
returns public.document_job_status
language plpgsql security definer set search_path = ''
as $$
declare
  v public.document_jobs;
  v_status public.document_job_status;
begin
  select * into v from public.document_jobs where id = p_job_id for update;
  if v.id is null then
    raise exception 'Job not found.' using errcode = '22023';
  end if;
  if p_error is null then
    v_status := 'done';
    update public.document_jobs set status = 'done', locked_at = null, last_error = null where id = p_job_id;
  elsif v.attempts >= v.max_attempts then
    v_status := 'failed';
    update public.document_jobs set status = 'failed', locked_at = null, last_error = left(p_error, 2000) where id = p_job_id;
    update public.documents
       set status = 'failed',
           review_detail = coalesce(review_detail, '{}'::jsonb) || jsonb_build_object('error', left(p_error, 500)),
           processed_at = now()
     where id = v.document_id;
  else
    v_status := 'queued';
    update public.document_jobs
       set status = 'queued', locked_at = null, last_error = left(p_error, 2000),
           next_run_at = now() + make_interval(mins => power(2, v.attempts)::integer)
     where id = p_job_id;
  end if;
  return v_status;
end
$$;

-- Puts a job back without using an attempt (daily AI cap reached, AI key not configured yet).
create function public.defer_document_job(p_job_id uuid, p_until timestamptz, p_note text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v public.document_jobs;
begin
  select * into v from public.document_jobs where id = p_job_id for update;
  if v.id is null then
    raise exception 'Job not found.' using errcode = '22023';
  end if;
  update public.document_jobs
     set status = 'queued', locked_at = null, attempts = greatest(v.attempts - 1, 0),
         next_run_at = p_until, last_error = left(p_note, 2000)
   where id = p_job_id;
  update public.documents
     set status = 'received',
         review_detail = coalesce(review_detail, '{}'::jsonb) || jsonb_build_object('waiting', left(p_note, 500))
   where id = v.document_id;
end
$$;

-- Reserves one Gemini call against the daily cap. False when the cap is reached (and tells the owner once a day).
create function public.ai_reserve_call(p_business_id uuid)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_day date := (now() at time zone 'Asia/Kolkata')::date;
  v_cap integer;
  v_calls integer;
begin
  select s.ai_daily_call_cap into v_cap from public.app_settings s where s.business_id = p_business_id;
  insert into public.ai_usage_daily (business_id, day) values (p_business_id, v_day) on conflict do nothing;
  select u.calls into v_calls from public.ai_usage_daily u where u.business_id = p_business_id and u.day = v_day for update;
  if v_calls >= coalesce(v_cap, 300) then
    if not exists (select 1 from public.notifications n where n.business_id = p_business_id and n.kind = 'ai_cap'
                    and (n.created_at at time zone 'Asia/Kolkata')::date = v_day) then
      insert into public.notifications (business_id, kind, severity, title, detail, href, required_permission)
      values (p_business_id, 'ai_cap', 'danger', 'Daily AI limit reached',
              format('%s document readings today. New documents wait until tomorrow or until the limit is raised in Settings.', v_calls),
              '/settings', null);
    end if;
    return false;
  end if;
  update public.ai_usage_daily set calls = calls + 1 where business_id = p_business_id and day = v_day;
  return true;
end
$$;

-- Stores the AI result (raw response, normalised extraction, confidences, token usage).
create function public.record_document_extraction(p_document_id uuid, p_result jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_doc public.documents;
  v_day date := (now() at time zone 'Asia/Kolkata')::date;
begin
  select * into v_doc from public.documents where id = p_document_id;
  if v_doc.id is null then
    raise exception 'Document not found.' using errcode = '22023';
  end if;
  insert into public.ai_processing_records (business_id, document_id, model, raw_response, extracted, field_confidences,
                                            overall_confidence, status, attempts, error, processed_at, usage)
  values (v_doc.business_id, v_doc.id, coalesce(p_result ->> 'model', 'unknown'), p_result -> 'raw_response',
          p_result -> 'extracted', p_result -> 'field_confidences', (p_result ->> 'overall_confidence')::numeric,
          coalesce((p_result ->> 'ai_status')::public.ai_status, 'succeeded'),
          coalesce((p_result ->> 'attempt')::integer, 1), p_result ->> 'error', now(), p_result -> 'usage');
  update public.ai_usage_daily
     set prompt_tokens = prompt_tokens + coalesce((p_result #>> '{usage,prompt_tokens}')::bigint, 0),
         output_tokens = output_tokens + coalesce((p_result #>> '{usage,output_tokens}')::bigint, 0)
   where business_id = v_doc.business_id and day = v_day;
  if p_result ? 'extracted' and p_result -> 'extracted' is not null and jsonb_typeof(p_result -> 'extracted') = 'object' then
    update public.documents
       set extracted = p_result -> 'extracted',
           doc_type = coalesce((p_result #>> '{extracted,doc_type}')::public.document_type, doc_type),
           overall_confidence = (p_result ->> 'overall_confidence')::numeric,
           status = 'information_extracted',
           processed_at = now()
     where id = p_document_id;
  end if;
end
$$;

-- Writes a document's weight onto a trip. Never overwrites an existing weight (no silent forcing).
create function public.record_document_weight(
  p_document_id uuid,
  p_trip_id uuid,
  p_record_type public.weight_record_type,
  p_reason text
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_doc public.documents;
  v_trip public.truck_trips;
  v_unit public.material_unit;
  v_vals jsonb := public.document_effective_fields(p_document_id);
  v_existing public.weight_records;
  v_id uuid;
  v_at timestamptz;
  v_gross numeric := nullif(v_vals ->> 'gross_weight', '')::numeric;
  v_tare numeric := nullif(v_vals ->> 'tare_weight', '')::numeric;
  v_net numeric := nullif(v_vals ->> 'net_weight', '')::numeric;
begin
  select * into v_doc from public.documents where id = p_document_id;
  select * into v_trip from public.truck_trips where id = p_trip_id and deleted_at is null;
  if v_trip.id is null or v_trip.business_id <> v_doc.business_id then
    raise exception 'Trip not found.' using errcode = '22023';
  end if;
  if v_trip.status = 'cancelled' then
    raise exception 'Trip % is cancelled.', v_trip.trip_code using errcode = '22023';
  end if;
  select m.unit into v_unit from public.materials m where m.id = v_trip.material_id;
  if v_unit <> 'MT' then
    raise exception 'Trip % is measured in %, a weighbridge weight (MT) cannot be recorded on it. Units are never converted.', v_trip.trip_code, v_unit
      using errcode = '22023';
  end if;
  if v_net is null and (v_gross is null or v_tare is null) then
    raise exception 'The document has no usable weight (net, or gross and tare).' using errcode = '22023';
  end if;
  -- A truck carries well under 100 MT; anything bigger is almost certainly kg read as MT.
  if coalesce(v_gross, 0) > 100 or coalesce(v_tare, 0) > 100 or coalesce(v_net, 0) > 100
     or coalesce(v_gross, 1) <= 0 or coalesce(v_net, 1) <= 0 then
    raise exception 'Weight values are not plausible in MT (check the unit on the slip).' using errcode = '22023';
  end if;

  select * into v_existing from public.weight_records w
   where w.trip_id = p_trip_id and w.record_type = p_record_type and w.deleted_at is null;
  if v_existing.id is not null then
    if v_existing.document_id = p_document_id then
      return v_existing.id;
    end if;
    -- Typed in by hand earlier and the slip agrees: link the slip as evidence, change nothing else.
    if v_existing.document_id is null
       and abs(v_existing.net_quantity - coalesce(v_gross - v_tare, v_net)) <= coalesce(
             (select s.net_weight_tolerance from public.app_settings s where s.business_id = v_trip.business_id), 0.02) then
      perform set_config('app.change_reason', coalesce(p_reason, '') || ' (slip linked as evidence)', true);
      update public.weight_records set document_id = p_document_id where id = v_existing.id;
      return v_existing.id;
    end if;
    raise exception 'Trip % already has a % weight (slip %). Correct it on the trip page instead of attaching another document.',
      v_trip.trip_code, p_record_type, coalesce(v_existing.slip_number, '—') using errcode = '22023';
  end if;

  begin
    v_at := ((v_vals ->> 'date') || ' ' || coalesce(nullif(v_vals ->> 'time', ''), '12:00'))::timestamp at time zone 'Asia/Kolkata';
  exception when others then
    v_at := null;
  end;

  perform set_config('app.change_reason', coalesce(p_reason, ''), true);
  insert into public.weight_records (business_id, trip_id, record_type, gross, tare, printed_net, slip_number, vehicle_number,
                                     measured_at, location, source, measurement_method, document_id)
  values (v_trip.business_id, p_trip_id, p_record_type, v_gross, v_tare, v_net, v_vals ->> 'slip_number',
          v_vals ->> 'vehicle_number', coalesce(v_at, v_doc.received_at), v_vals ->> 'weighbridge_name',
          'document', 'weighbridge', p_document_id)
  returning id into v_id;
  return v_id;
end
$$;

-- Applies the worker's decision: auto_record | needs_review | duplicate.
create function public.apply_document_decision(p_document_id uuid, p_decision jsonb)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_action text := p_decision ->> 'action';
  v_trip uuid := nullif(p_decision ->> 'trip_id', '')::uuid;
  v_type public.weight_record_type := nullif(p_decision ->> 'record_type', '')::public.weight_record_type;
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
      -- e.g. the trip already has that weight: never force it, ask a person.
      update public.documents
         set status = 'needs_review', review_reason = 'conflicting_weight_values',
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
    -- Read, but no automatic recording exists for this document type yet (e.g. bills).
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

-- =============================================================================
-- Review actions (signed-in users, permission-checked)
-- =============================================================================

create function public.review_attach_document(
  p_document_id uuid, p_trip_id uuid, p_record_type public.weight_record_type, p_reason text
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v public.documents := public.document_for_user(p_document_id);
begin
  perform public.require_permission('review_documents');
  if v.status in ('duplicate', 'rejected') then
    raise exception 'A % document cannot be attached.', v.status using errcode = '22023';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Give a short reason for this decision.' using errcode = '22023';
  end if;
  perform public.record_document_weight(p_document_id, p_trip_id, p_record_type, 'Review: ' || trim(p_reason));
  update public.documents
     set status = 'matched', trip_id = p_trip_id, record_type = p_record_type, review_reason = null,
         notes = 'Attached in review: ' || trim(p_reason)
   where id = p_document_id;
  perform set_config('app.change_reason', '', true);
end
$$;

-- New trip from a loading / weighbridge slip (delivery slips need an existing trip with a loading weight).
create function public.review_create_trip_from_document(p_document_id uuid, p_trip jsonb, p_reason text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v public.documents := public.document_for_user(p_document_id);
  v_vals jsonb := public.document_effective_fields(p_document_id);
  v_trip jsonb;
  v_trip_id uuid;
  v_weight uuid;
begin
  perform public.require_permission('review_documents');
  perform public.require_permission('manage_trips');
  if v.doc_type in ('unloading_slip', 'delivery_photo') then
    raise exception 'Create the trip with its loading weight first, then attach this delivery document to it.' using errcode = '22023';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Give a short reason for this decision.' using errcode = '22023';
  end if;
  perform set_config('app.change_reason', 'Review: ' || trim(p_reason), true);
  v_trip := public.create_trip(
    p_trip || jsonb_build_object('source', 'document'),
    jsonb_build_object(
      'gross', v_vals ->> 'gross_weight', 'tare', v_vals ->> 'tare_weight', 'printed_net', v_vals ->> 'net_weight',
      'slip_number', v_vals ->> 'slip_number', 'location', v_vals ->> 'weighbridge_name',
      'measured_at', case when v_vals ->> 'date' is not null
                          then (v_vals ->> 'date') || 'T' || coalesce(nullif(v_vals ->> 'time', ''), '12:00') || ':00+05:30' end),
    null);
  v_trip_id := (v_trip ->> 'id')::uuid;
  select w.id into v_weight from public.weight_records w where w.trip_id = v_trip_id and w.record_type = 'loading';
  update public.weight_records set document_id = p_document_id, source = 'document' where id = v_weight;
  update public.documents
     set status = 'matched', trip_id = v_trip_id, record_type = 'loading', review_reason = null,
         notes = 'New trip created in review: ' || trim(p_reason)
   where id = p_document_id;
  perform set_config('app.change_reason', '', true);
  return v_trip;
end
$$;

-- Correct one extracted field. The original stays in documents.extracted and ai_processing_records.
create function public.correct_document_field(p_document_id uuid, p_field text, p_value text, p_reason text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v public.documents := public.document_for_user(p_document_id);
begin
  perform public.require_permission('correct_extracted');
  if length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Give a reason for the correction.' using errcode = '22023';
  end if;
  if p_field !~ '^[a-z_]{2,40}$' then
    raise exception 'Unknown field.' using errcode = '22023';
  end if;
  if v.status in ('automatically_recorded', 'matched') then
    raise exception 'This document is already recorded on a trip. Correct the weight on the trip page instead.' using errcode = '22023';
  end if;
  perform set_config('app.change_reason', trim(p_reason), true);
  insert into public.document_corrections (business_id, document_id, field_key, original_value, corrected_value, reason)
  values (v.business_id, v.id, p_field, public.document_effective_fields(v.id) ->> p_field, nullif(trim(p_value), ''), trim(p_reason));
  perform set_config('app.change_reason', '', true);
end
$$;

create function public.mark_document_duplicate(p_document_id uuid, p_original_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v public.documents := public.document_for_user(p_document_id);
begin
  perform public.require_permission('review_documents');
  if p_original_id is not null then
    perform public.document_for_user(p_original_id);
  end if;
  if v.status in ('automatically_recorded', 'matched') then
    raise exception 'This document is already recorded on a trip.' using errcode = '22023';
  end if;
  perform set_config('app.change_reason', coalesce(trim(p_reason), ''), true);
  update public.documents
     set status = 'duplicate', duplicate_of_document_id = p_original_id, notes = 'Marked duplicate: ' || coalesce(trim(p_reason), '')
   where id = p_document_id;
  perform set_config('app.change_reason', '', true);
end
$$;

create function public.reject_document(p_document_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v public.documents := public.document_for_user(p_document_id);
begin
  perform public.require_permission('review_documents');
  if length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Give a reason for rejecting the document.' using errcode = '22023';
  end if;
  if v.status in ('automatically_recorded', 'matched') then
    raise exception 'This document is already recorded on a trip.' using errcode = '22023';
  end if;
  perform set_config('app.change_reason', trim(p_reason), true);
  update public.documents set status = 'rejected', notes = 'Rejected: ' || trim(p_reason) where id = p_document_id;
  perform set_config('app.change_reason', '', true);
end
$$;

create function public.reprocess_document(p_document_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v public.documents := public.document_for_user(p_document_id);
begin
  perform public.require_permission('review_documents');
  if v.status in ('automatically_recorded', 'matched') then
    raise exception 'This document is already recorded on a trip.' using errcode = '22023';
  end if;
  update public.documents set status = 'received', review_reason = null where id = p_document_id;
  perform public.enqueue_document(p_document_id);
end
$$;

create function public.mark_notifications_read(p_ids uuid[])
returns void
language sql security definer set search_path = ''
as $$
  update public.notifications n
     set read_by = array_append(n.read_by, auth.uid())
   where n.id = any (p_ids)
     and n.business_id = public.current_business_id()
     and not (auth.uid() = any (n.read_by))
$$;

-- =============================================================================
-- Notifications from status changes (exceptions only)
-- =============================================================================
create function public.notify_document_status()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'needs_review' then
      insert into public.notifications (business_id, kind, severity, title, detail, href, document_id, required_permission)
      values (new.business_id, 'document_review', 'warning', 'Document needs review',
              replace(coalesce(new.review_reason::text, 'check'), '_', ' ') || ' · ' || coalesce(new.file_name, 'document'),
              '/review/' || new.id, new.id, 'review_documents');
    elsif new.status = 'failed' then
      insert into public.notifications (business_id, kind, severity, title, detail, href, document_id, required_permission)
      values (new.business_id, 'document_failed', 'danger', 'Document could not be read',
              coalesce(new.file_name, 'document') || ' · retry from the document page',
              '/documents/' || new.id, new.id, 'review_documents');
    end if;
  end if;
  return new;
end
$$;
create trigger documents_notify after update of status on public.documents
  for each row execute function public.notify_document_status();

create function public.notify_trip_shortage()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.status is distinct from old.status and new.status in ('needs_verification', 'confirmed_shortage') then
    insert into public.notifications (business_id, kind, severity, title, detail, href, trip_id, required_permission)
    values (new.business_id, 'shortage', case when new.status = 'confirmed_shortage' then 'danger' else 'warning' end,
            case when new.status = 'confirmed_shortage' then 'Delivery difference above 2× tolerance'
                 else 'Delivery difference above tolerance' end,
            new.trip_code, '/trips/' || new.trip_code, new.id, 'view_records');
  end if;
  return new;
end
$$;
create trigger truck_trips_notify after update of status on public.truck_trips
  for each row execute function public.notify_trip_shortage();

-- =============================================================================
-- Privileges
-- =============================================================================
revoke execute on function public.require_permission(public.permission_key) from public, anon;
revoke execute on function public.document_for_user(uuid) from public, anon;
revoke execute on function public.document_effective_fields(uuid) from public, anon;
revoke execute on function public.kick_document_worker() from public, anon, authenticated;
revoke execute on function public.enqueue_document(uuid) from public, anon, authenticated;
revoke execute on function public.create_document_from_upload(uuid, text, text, text, text, bigint, public.document_intake_source, uuid, text, text, uuid) from public, anon, authenticated;
revoke execute on function public.claim_document_jobs(integer) from public, anon, authenticated;
revoke execute on function public.finish_document_job(uuid, text) from public, anon, authenticated;
revoke execute on function public.ai_reserve_call(uuid) from public, anon, authenticated;
revoke execute on function public.defer_document_job(uuid, timestamptz, text) from public, anon, authenticated;
revoke execute on function public.record_document_extraction(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.record_document_weight(uuid, uuid, public.weight_record_type, text) from public, anon, authenticated;
revoke execute on function public.apply_document_decision(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.register_uploaded_document(text, text, text, text, bigint, uuid, text, text) from public, anon;
revoke execute on function public.review_attach_document(uuid, uuid, public.weight_record_type, text) from public, anon;
revoke execute on function public.review_create_trip_from_document(uuid, jsonb, text) from public, anon;
revoke execute on function public.correct_document_field(uuid, text, text, text) from public, anon;
revoke execute on function public.mark_document_duplicate(uuid, uuid, text) from public, anon;
revoke execute on function public.reject_document(uuid, text) from public, anon;
revoke execute on function public.reprocess_document(uuid) from public, anon;
revoke execute on function public.mark_notifications_read(uuid[]) from public, anon;
revoke execute on function public.notify_document_status() from public, anon, authenticated;
revoke execute on function public.notify_trip_shortage() from public, anon, authenticated;

grant execute on function public.require_permission(public.permission_key) to authenticated, service_role;
grant execute on function public.document_for_user(uuid) to authenticated, service_role;
grant execute on function public.document_effective_fields(uuid) to authenticated, service_role;
grant execute on function public.kick_document_worker() to service_role;
grant execute on function public.enqueue_document(uuid) to service_role;
grant execute on function public.create_document_from_upload(uuid, text, text, text, text, bigint, public.document_intake_source, uuid, text, text, uuid) to service_role;
grant execute on function public.claim_document_jobs(integer) to service_role;
grant execute on function public.finish_document_job(uuid, text) to service_role;
grant execute on function public.ai_reserve_call(uuid) to service_role;
grant execute on function public.defer_document_job(uuid, timestamptz, text) to service_role;
grant execute on function public.record_document_extraction(uuid, jsonb) to service_role;
grant execute on function public.record_document_weight(uuid, uuid, public.weight_record_type, text) to service_role;
grant execute on function public.apply_document_decision(uuid, jsonb) to service_role;
grant execute on function public.register_uploaded_document(text, text, text, text, bigint, uuid, text, text) to authenticated, service_role;
grant execute on function public.review_attach_document(uuid, uuid, public.weight_record_type, text) to authenticated, service_role;
grant execute on function public.review_create_trip_from_document(uuid, jsonb, text) to authenticated, service_role;
grant execute on function public.correct_document_field(uuid, text, text, text) to authenticated, service_role;
grant execute on function public.mark_document_duplicate(uuid, uuid, text) to authenticated, service_role;
grant execute on function public.reject_document(uuid, text) to authenticated, service_role;
grant execute on function public.reprocess_document(uuid) to authenticated, service_role;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated, service_role;

grant select on public.document_corrections, public.document_jobs, public.ai_usage_daily, public.notifications to authenticated, service_role;
grant all on public.document_corrections, public.document_jobs, public.ai_usage_daily, public.notifications to service_role;
revoke update, delete, truncate on public.document_corrections from service_role;

-- =============================================================================
-- Realtime, scheduler and HTTP (Supabase extensions; skipped where unavailable)
-- =============================================================================
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.documents, public.notifications, public.document_jobs;
  end if;
end
$$;

do $$
begin
  create extension if not exists pg_net with schema extensions;
exception when others then
  raise notice 'pg_net not available: %', sqlerrm;
end
$$;

do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('process-documents', '* * * * *', 'select public.kick_document_worker()');
exception when others then
  raise notice 'pg_cron not available: %', sqlerrm;
end
$$;
