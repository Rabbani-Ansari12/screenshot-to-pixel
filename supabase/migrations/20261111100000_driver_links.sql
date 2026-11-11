-- =============================================================================
-- Driver upload links (no login), rate limiting, debounced notifications,
-- financial-discrepancy notifications and an optional e-mail digest switch.
--
-- Token lifecycle: create_upload_token() makes 32 random bytes (base64url), stores only
-- sha256(token) and returns the raw token once inside the link. It can never be read back;
-- staff regenerate instead. Public Edge Functions (driver-upload-info, driver-upload) hash the
-- token and call the service-role-only functions below, which return minimal trip data.
-- =============================================================================

-- ---------- Settings ----------
alter table public.app_settings
  add column upload_link_expiry_hours integer not null default 72 check (upload_link_expiry_hours between 1 and 720),
  add column upload_link_max_uploads integer not null default 20 check (upload_link_max_uploads between 1 and 200),
  add column upload_link_doc_types text[] not null default '{loading_slip,unloading_slip,delivery_photo,other}'
    check (upload_link_doc_types <@ array['weighbridge_slip','loading_slip','unloading_slip','delivery_photo','other']::text[]
           and cardinality(upload_link_doc_types) > 0),
  add column upload_rate_limit_per_ip integer not null default 30 check (upload_rate_limit_per_ip between 1 and 1000),
  -- E-mail digest of exceptions through Resend. Off by default; also skipped while secrets are placeholders.
  add column email_digest_enabled boolean not null default false,
  add column email_digest_last_sent_at timestamptz;

-- ---------- Upload tokens ----------
create table public.upload_tokens (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id),
  trip_id uuid not null references public.truck_trips (id) on delete cascade,
  -- sha256 (hex) of the raw token. The raw token is never stored or logged.
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  max_uploads integer not null default 20 check (max_uploads between 1 and 200),
  upload_count integer not null default 0 check (upload_count >= 0),
  allowed_doc_types text[] not null check (cardinality(allowed_doc_types) > 0),
  revoked_at timestamptz,
  revoked_by uuid references auth.users (id) on delete set null,
  last_used_at timestamptz,
  constraint upload_tokens_count_within_max check (upload_count <= max_uploads)
);
create index idx_upload_tokens_trip on public.upload_tokens (trip_id, created_at desc);
create index idx_upload_tokens_business on public.upload_tokens (business_id, created_at desc);
create trigger upload_tokens_audit after insert or update or delete on public.upload_tokens
  for each row execute function public.audit_row_change();

alter table public.upload_tokens enable row level security;
create policy upload_tokens_select on public.upload_tokens for select to authenticated
  using (business_id = (select public.current_business_id()) and (select public.has_permission('manage_trips')));
-- No insert / update / delete policies: create_upload_token() and revoke_upload_token() only.
revoke all on public.upload_tokens from anon;
revoke insert, update, delete, truncate, references, trigger on public.upload_tokens from authenticated;
grant select on public.upload_tokens to authenticated;
grant all on public.upload_tokens to service_role;

-- Which link a document came through (history per link / per trip).
alter table public.documents add column upload_token_id uuid references public.upload_tokens (id) on delete set null;
create index idx_documents_upload_token on public.documents (upload_token_id);

-- ---------- Rate limiting (fixed windows) ----------
create table public.rate_limit_hits (
  bucket text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (bucket, window_start)
);
alter table public.rate_limit_hits enable row level security;
revoke all on public.rate_limit_hits from anon, authenticated;
grant all on public.rate_limit_hits to service_role;

-- Counts one hit; true while the bucket is within p_limit for the current window.
-- Buckets hold hashes (of IPs / tokens), never raw values.
create function public.rate_limit_hit(p_bucket text, p_limit integer, p_window_seconds integer default 3600)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_hits integer;
begin
  insert into public.rate_limit_hits (bucket, window_start, hits) values (p_bucket, v_window, 1)
  on conflict (bucket, window_start) do update set hits = public.rate_limit_hits.hits + 1
  returning hits into v_hits;
  if random() < 0.01 then
    delete from public.rate_limit_hits where window_start < now() - interval '2 days';
  end if;
  return v_hits <= p_limit;
end
$$;

-- ---------- Staff: create / revoke links ----------
create function public.create_upload_token(
  p_trip_id uuid,
  p_expires_in_hours integer default null,
  p_allowed_doc_types text[] default null
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_trip public.truck_trips;
  v_settings public.app_settings;
  v_raw text;
  v_id uuid;
  v_expires timestamptz;
  v_types text[];
begin
  perform public.require_permission('manage_trips');
  select * into v_trip from public.truck_trips t
   where t.id = p_trip_id and t.business_id = public.current_business_id() and t.deleted_at is null;
  if v_trip.id is null then
    raise exception 'Trip not found.' using errcode = '22023';
  end if;
  if v_trip.status = 'cancelled' then
    raise exception 'Trip % is cancelled.', v_trip.trip_code using errcode = '22023';
  end if;
  select * into v_settings from public.app_settings s where s.business_id = v_trip.business_id;
  v_types := coalesce(p_allowed_doc_types, v_settings.upload_link_doc_types,
                      '{loading_slip,unloading_slip,delivery_photo,other}');
  if not (v_types <@ array['weighbridge_slip','loading_slip','unloading_slip','delivery_photo','other']::text[])
     or cardinality(v_types) = 0 then
    raise exception 'Unknown document type for a driver link.' using errcode = '22023';
  end if;
  v_expires := now() + make_interval(hours => least(greatest(coalesce(p_expires_in_hours, v_settings.upload_link_expiry_hours, 72), 1), 720));

  -- One active link per trip: a new link replaces the previous one.
  perform set_config('app.change_reason', 'Replaced by a new driver link', true);
  update public.upload_tokens set revoked_at = now(), revoked_by = auth.uid()
   where trip_id = p_trip_id and revoked_at is null and expires_at > now();
  perform set_config('app.change_reason', 'Driver upload link created', true);

  v_raw := rtrim(translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/', '-_'), '=');
  insert into public.upload_tokens (business_id, trip_id, token_hash, expires_at, max_uploads, allowed_doc_types)
  values (v_trip.business_id, p_trip_id, encode(extensions.digest(v_raw, 'sha256'), 'hex'), v_expires,
          coalesce(v_settings.upload_link_max_uploads, 20), v_types)
  returning id into v_id;
  perform set_config('app.change_reason', '', true);
  -- The only time the raw token exists outside the driver's link.
  return jsonb_build_object('id', v_id, 'token', v_raw, 'expires_at', v_expires, 'trip_code', v_trip.trip_code);
end
$$;

create function public.revoke_upload_token(p_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.require_permission('manage_trips');
  perform set_config('app.change_reason', 'Driver upload link revoked', true);
  update public.upload_tokens set revoked_at = now(), revoked_by = auth.uid()
   where id = p_id and business_id = public.current_business_id() and revoked_at is null;
  if not found then
    raise exception 'Link not found or already revoked.' using errcode = '22023';
  end if;
  perform set_config('app.change_reason', '', true);
end
$$;

-- ---------- Public channel (service role only, called by Edge Functions) ----------

-- Minimal data for a valid link, or null for anything invalid (no reason given).
-- Internal fields (_business_id, _rate_limit_per_ip) are for the Edge Function, never sent to the browser.
create function public.driver_link_info(p_token_hash text)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'token_hash', u.token_hash,
    'trip_code', t.trip_code,
    'vehicle_number', v.vehicle_number,
    'material_name', m.name,
    'allowed_doc_types', to_jsonb(u.allowed_doc_types),
    'remaining_uploads', u.max_uploads - u.upload_count,
    '_business_id', u.business_id,
    '_rate_limit_per_ip', coalesce(s.upload_rate_limit_per_ip, 30))
  from public.upload_tokens u
  join public.truck_trips t on t.id = u.trip_id and t.deleted_at is null and t.status <> 'cancelled'
  join public.vehicles v on v.id = t.vehicle_id
  join public.materials m on m.id = t.material_id
  left join public.app_settings s on s.business_id = u.business_id
  where u.token_hash = p_token_hash
    and u.revoked_at is null
    and u.expires_at > now()
    and u.upload_count < u.max_uploads
$$;

-- Registers one stored file for a link: re-validates under a row lock, counts it atomically and
-- hands it to the shared intake (create_document_from_upload). Errors are generic on purpose.
create function public.driver_link_register_upload(
  p_token_hash text,
  p_storage_path text,
  p_sha256 text,
  p_file_name text,
  p_mime_type text,
  p_size_bytes bigint,
  p_doc_type text,
  p_driver_name text default null
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v public.upload_tokens;
  v_doc jsonb;
begin
  select * into v from public.upload_tokens where token_hash = p_token_hash for update;
  if v.id is null or v.revoked_at is not null or v.expires_at <= now() or v.upload_count >= v.max_uploads then
    raise exception 'invalid_link' using errcode = '22023';
  end if;
  if not (p_doc_type = any (v.allowed_doc_types)) then
    raise exception 'invalid_doc_type' using errcode = '22023';
  end if;
  if split_part(p_storage_path, '/', 1) <> v.business_id::text then
    raise exception 'invalid_path' using errcode = '22023';
  end if;
  update public.upload_tokens set upload_count = upload_count + 1, last_used_at = now() where id = v.id;
  v_doc := public.create_document_from_upload(
    v.business_id, p_storage_path, p_sha256, p_file_name, p_mime_type, p_size_bytes, 'driver_link',
    v.trip_id, p_doc_type, nullif(left(regexp_replace(coalesce(p_driver_name, ''), '[[:cntrl:]]', '', 'g'), 60), ''), null);
  update public.documents set upload_token_id = v.id where id = (v_doc ->> 'id')::uuid;
  return v_doc || jsonb_build_object('remaining_uploads', v.max_uploads - v.upload_count - 1);
end
$$;

revoke execute on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
revoke execute on function public.create_upload_token(uuid, integer, text[]) from public, anon;
revoke execute on function public.revoke_upload_token(uuid) from public, anon;
revoke execute on function public.driver_link_info(text) from public, anon, authenticated;
revoke execute on function public.driver_link_register_upload(text, text, text, text, text, bigint, text, text) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;
grant execute on function public.create_upload_token(uuid, integer, text[]) to authenticated, service_role;
grant execute on function public.revoke_upload_token(uuid) to authenticated, service_role;
grant execute on function public.driver_link_info(text) to service_role;
grant execute on function public.driver_link_register_upload(text, text, text, text, text, bigint, text, text) to service_role;

-- =============================================================================
-- Notifications: debounced (one grouped notice per kind for 10 minutes), plus
-- financial discrepancies. Exceptions only.
-- =============================================================================
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('document_review', 'document_failed', 'shortage', 'financial', 'ai_cap', 'system'));
alter table public.notifications
  add column occurrences integer not null default 1 check (occurrences >= 1),
  add column updated_at timestamptz not null default now();

-- Adds a notification, or folds it into an unread one of the same kind from the last 10 minutes.
create function public.push_notification(
  p_business_id uuid, p_kind text, p_severity text, p_title text, p_detail text, p_href text,
  p_group_title text, p_group_href text, p_document_id uuid, p_trip_id uuid,
  p_permission public.permission_key
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  select n.id into v_id from public.notifications n
   where n.business_id = p_business_id and n.kind = p_kind and n.read_by = '{}'
     and n.updated_at > now() - interval '10 minutes'
   order by n.updated_at desc limit 1
   for update;
  if v_id is not null then
    update public.notifications
       set occurrences = occurrences + 1,
           title = replace(p_group_title, '{n}', (occurrences + 1)::text),
           detail = p_detail,
           href = p_group_href,
           document_id = null,
           trip_id = null,
           severity = case when p_severity = 'danger' then 'danger' else severity end,
           updated_at = now()
     where id = v_id;
  else
    insert into public.notifications (business_id, kind, severity, title, detail, href, document_id, trip_id, required_permission)
    values (p_business_id, p_kind, p_severity, p_title, p_detail, p_href, p_document_id, p_trip_id, p_permission);
  end if;
end
$$;
revoke execute on function public.push_notification(uuid, text, text, text, text, text, text, text, uuid, uuid, public.permission_key) from public, anon, authenticated;
grant execute on function public.push_notification(uuid, text, text, text, text, text, text, text, uuid, uuid, public.permission_key) to service_role;

create or replace function public.notify_document_status()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'needs_review' then
      perform public.push_notification(new.business_id, 'document_review', 'warning', 'Document needs review',
        replace(coalesce(new.review_reason::text, 'check'), '_', ' ') || ' · ' || coalesce(new.file_name, 'document'),
        '/review/' || new.id, '{n} documents need review', '/review', new.id, null, 'review_documents');
    elsif new.status = 'failed' then
      perform public.push_notification(new.business_id, 'document_failed', 'danger', 'Document could not be read',
        coalesce(new.file_name, 'document') || ' · retry from the document page',
        '/documents/' || new.id, '{n} documents could not be read', '/documents', new.id, null, 'review_documents');
    end if;
  end if;
  return new;
end
$$;

create or replace function public.notify_trip_shortage()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.status is distinct from old.status and new.status in ('needs_verification', 'confirmed_shortage') then
    perform public.push_notification(new.business_id, 'shortage',
      case when new.status = 'confirmed_shortage' then 'danger' else 'warning' end,
      case when new.status = 'confirmed_shortage' then 'Delivery difference above 2× tolerance'
           else 'Delivery difference above tolerance' end,
      new.trip_code, '/trips/' || new.trip_code, '{n} deliveries above tolerance', '/shortages',
      null, new.id, 'view_records');
  end if;
  return new;
end
$$;

-- Bills and invoices whose check found a difference. AI never approves these; a person decides.
create function public.notify_financial_discrepancy()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.recon_status is distinct from old.recon_status and new.recon_status in ('mismatch', 'disputed') then
    perform public.push_notification(new.business_id, 'financial', 'danger',
      case tg_table_name when 'customer_invoices' then 'Invoice needs checking' else 'Bill does not match records' end,
      coalesce(to_jsonb(new) ->> 'bill_number', to_jsonb(new) ->> 'invoice_number', 'document') || ' · ' || new.recon_status::text,
      '/reconciliation/' || new.id, '{n} bills / invoices need checking', '/reconciliation',
      null, null, 'verify_bills');
  end if;
  return new;
end
$$;
create trigger provider_bills_notify after update of recon_status on public.provider_bills
  for each row execute function public.notify_financial_discrepancy();
create trigger transporter_bills_notify after update of recon_status on public.transporter_bills
  for each row execute function public.notify_financial_discrepancy();
create trigger customer_invoices_notify after update of recon_status on public.customer_invoices
  for each row execute function public.notify_financial_discrepancy();
revoke execute on function public.notify_financial_discrepancy() from public, anon, authenticated;

-- =============================================================================
-- E-mail digest (Resend), scheduled daily at 18:00 IST. The notify-digest function skips
-- silently unless email_digest_enabled is on and RESEND_API_KEY / NOTIFY_EMAIL_FROM are real.
-- =============================================================================
create function public.kick_notify_digest()
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  if not exists (select 1 from public.app_settings where email_digest_enabled) then
    return;
  end if;
  begin
    execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into v_url using 'notify_digest_url';
    execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into v_secret using 'document_worker_secret';
  exception when others then
    return;
  end;
  if v_url is null or v_secret is null then
    return;
  end if;
  begin
    execute 'select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 10000)'
      using v_url, '{}'::jsonb, jsonb_build_object('Content-Type', 'application/json', 'x-worker-secret', v_secret);
  exception when others then
    null;
  end;
end
$$;
revoke execute on function public.kick_notify_digest() from public, anon, authenticated;
grant execute on function public.kick_notify_digest() to service_role;

do $$
begin
  perform cron.schedule('notify-digest', '30 12 * * *', 'select public.kick_notify_digest()');
exception when others then
  raise notice 'pg_cron not available: %', sqlerrm;
end
$$;
