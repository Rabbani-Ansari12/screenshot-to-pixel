-- =============================================================================
-- Dashboard, reports, error log, job retries, housekeeping, backups and cost guards.
--   * dashboard_summary(): every KPI / chart / insight from SQL (security invoker: RLS applies,
--     so people without finance access see zeros for money, never other businesses' data).
--   * report_run(): the 14 reports with date + entity filters; finance reports need
--     view_financial_reports. Used by the Reports page and the report-export Edge Function.
--   * error_logs + v_failed_jobs + retry RPCs for the admin "System health" page.
--   * pg_cron: daily housekeeping (expired links, rate-limit rows, old error logs) and a daily
--     export of critical tables to the private "backups" bucket.
-- =============================================================================

-- ---------- Realtime: dashboard refreshes when trips or payments change ----------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.truck_trips, public.payments;
  end if;
exception when duplicate_object then null;
end
$$;

-- ---------- Error log ----------
create table public.error_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  business_id uuid references public.businesses (id) on delete cascade,
  source text not null check (length(source) between 1 and 60),       -- edge function name or 'client'
  request_id text check (request_id is null or length(request_id) <= 64),
  level text not null default 'error' check (level in ('warn', 'error')),
  message text not null check (length(message) <= 2000),
  context jsonb not null default '{}'::jsonb,
  user_id uuid
);
create index idx_error_logs_created on public.error_logs (created_at desc);
create index idx_error_logs_business on public.error_logs (business_id, created_at desc);
alter table public.error_logs enable row level security;
create policy error_logs_select on public.error_logs for select to authenticated
  using ((business_id is null or business_id = (select public.current_business_id())) and (select public.is_owner()));
revoke all on public.error_logs from anon, authenticated;
grant select on public.error_logs to authenticated;
grant all on public.error_logs to service_role;

-- Errors from the browser (error boundaries). Rate limited per user; context is trimmed.
create function public.log_client_error(p_message text, p_context jsonb default '{}'::jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null or public.current_business_id() is null then
    return;
  end if;
  if not public.rate_limit_hit('client-error:' || auth.uid()::text, 30) then
    return;
  end if;
  insert into public.error_logs (business_id, source, level, message, context, user_id)
  values (public.current_business_id(), 'client', 'error', left(coalesce(p_message, ''), 2000),
          coalesce(jsonb_strip_nulls(p_context), '{}'::jsonb) - 'token' - 'password', auth.uid());
end
$$;

-- ---------- Failed jobs: view + retry (review_documents) ----------
create view public.v_failed_jobs with (security_invoker = true) as
select j.id as job_id, j.business_id, j.document_id, j.status, j.attempts, j.max_attempts, j.last_error,
       j.next_run_at, j.updated_at, d.file_name, d.source, d.status as document_status, d.received_at
  from public.document_jobs j
  join public.documents d on d.id = j.document_id
 where j.status = 'failed' or (j.last_error is not null and j.status = 'queued');
grant select on public.v_failed_jobs to authenticated, service_role;
revoke all on public.v_failed_jobs from anon;

create function public.retry_document_job(p_job_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v public.document_jobs;
begin
  perform public.require_permission('review_documents');
  select * into v from public.document_jobs where id = p_job_id and business_id = public.current_business_id();
  if v.id is null then raise exception 'Job not found.' using errcode = '22023'; end if;
  if v.status = 'running' then raise exception 'This job is running right now.' using errcode = '22023'; end if;
  update public.document_jobs set status = 'queued', attempts = 0, next_run_at = now(), locked_at = null where id = v.id;
  update public.documents set status = 'received', review_reason = null
   where id = v.document_id and status in ('failed', 'processing', 'received');
end
$$;

create function public.retry_failed_jobs()
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_count integer;
begin
  perform public.require_permission('review_documents');
  with j as (
    update public.document_jobs set status = 'queued', attempts = 0, next_run_at = now(), locked_at = null
     where business_id = public.current_business_id() and status = 'failed'
    returning document_id
  ), d as (
    update public.documents set status = 'received', review_reason = null
     where id in (select document_id from j) and status = 'failed'
    returning id
  )
  select count(*) into v_count from j;
  return v_count;
end
$$;

-- ---------- Cost guard: never send a hash duplicate to the AI again ----------
create or replace function public.reprocess_document(p_document_id uuid)
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
  if v.duplicate_of_document_id is not null and exists (
       select 1 from public.documents o where o.id = v.duplicate_of_document_id and o.sha256 = v.sha256) then
    raise exception 'This file is identical to an earlier upload, so it is not read again. Open the original instead.'
      using errcode = '22023';
  end if;
  update public.documents set status = 'received', review_reason = null where id = p_document_id;
  perform public.enqueue_document(p_document_id);
end
$$;

-- AI daily cap: warn at 80 %, stop at 100 % (one notice of each per day).
create or replace function public.ai_reserve_call(p_business_id uuid)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_day date := (now() at time zone 'Asia/Kolkata')::date;
  v_cap integer;
  v_calls integer;
begin
  select coalesce(s.ai_daily_call_cap, 300) into v_cap from public.app_settings s where s.business_id = p_business_id;
  v_cap := coalesce(v_cap, 300);
  insert into public.ai_usage_daily (business_id, day) values (p_business_id, v_day) on conflict do nothing;
  select u.calls into v_calls from public.ai_usage_daily u where u.business_id = p_business_id and u.day = v_day for update;
  if v_calls >= v_cap then
    if not exists (select 1 from public.notifications n where n.business_id = p_business_id and n.kind = 'ai_cap'
                    and n.severity = 'danger' and (n.created_at at time zone 'Asia/Kolkata')::date = v_day) then
      insert into public.notifications (business_id, kind, severity, title, detail, href, required_permission)
      values (p_business_id, 'ai_cap', 'danger', 'Daily AI limit reached',
              format('%s document readings today. New documents wait until tomorrow or until the limit is raised in Settings.', v_calls),
              '/settings', null);
    end if;
    return false;
  end if;
  if v_calls + 1 >= ceil(v_cap * 0.8) and not exists (
       select 1 from public.notifications n where n.business_id = p_business_id and n.kind = 'ai_cap'
          and n.severity = 'warning' and (n.created_at at time zone 'Asia/Kolkata')::date = v_day) then
    insert into public.notifications (business_id, kind, severity, title, detail, href, required_permission)
    values (p_business_id, 'ai_cap', 'warning', 'AI limit almost reached',
            format('%s of %s document readings used today.', v_calls + 1, v_cap), '/settings', null);
  end if;
  update public.ai_usage_daily set calls = calls + 1 where business_id = p_business_id and day = v_day;
  return true;
end
$$;

-- ---------- Thumbnails next to the original: <original path>.thumb.jpg ----------
create policy documents_bucket_insert_thumb on storage.objects for insert to authenticated
with check (
  bucket_id = 'documents'
  and (storage.foldername(name))[1] = (select public.current_business_id())::text
  and name ~ '^[0-9a-f-]{36}/[0-9]{4}/(0[1-9]|1[0-2])/[0-9a-f-]{36}\.[A-Za-z0-9]{2,5}\.thumb\.jpg$'
  and ((select public.has_permission('review_documents')) or (select public.has_permission('manage_trips')))
);

-- ---------- Backups bucket (daily JSON export of critical tables; owner can download) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('backups', 'backups', false, 524288000, array['application/json', 'application/gzip'])
on conflict (id) do update set public = false;
create policy backups_bucket_read on storage.objects for select to authenticated
using (
  bucket_id = 'backups'
  and (storage.foldername(name))[1] = (select public.current_business_id())::text
  and (select public.is_owner())
);

-- =============================================================================
-- Dashboard
-- =============================================================================
create function public.dashboard_summary(p_month date default null)
returns jsonb
language plpgsql stable security invoker set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_from date := date_trunc('month', coalesce(p_month, (now() at time zone 'Asia/Kolkata')::date))::date;
  v_to date := (date_trunc('month', coalesce(p_month, (now() at time zone 'Asia/Kolkata')::date)) + interval '1 month')::date;
  v_kpis jsonb;
  v_automation jsonb;
  v_result jsonb;
begin
  with
  docs as (
    select d.status, d.source, (d.received_at at time zone 'Asia/Kolkata')::date as day
      from public.documents d where d.deleted_at is null
  ),
  month_docs as (select * from docs where day >= v_from and day < v_to),
  trips as (select * from public.v_trip_list),
  bills as (select * from public.v_bill_list),
  inv as (select * from public.v_invoice_list where status = 'issued')
  select jsonb_build_object(
    'activeOrders', (select count(*) from public.customer_orders o
                      where o.deleted_at is null and o.status in ('confirmed', 'in_progress', 'on_hold')),
    'purchasedMT', coalesce((select round(sum(p.quantity), 2) from public.v_purchase_list p
                              where p.unit = 'MT' and p.purchase_date >= v_from and p.purchase_date < v_to and p.status <> 'cancelled'), 0),
    'dispatchedMT', coalesce((select round(sum(t.loading_net), 2) from trips t
                               where t.unit = 'MT' and (t.loaded_at at time zone 'Asia/Kolkata')::date >= v_from
                                 and (t.loaded_at at time zone 'Asia/Kolkata')::date < v_to and t.status <> 'cancelled'), 0),
    'deliveredMT', coalesce((select round(sum(t.delivered_net), 2) from trips t
                              where t.unit = 'MT' and (t.delivered_at at time zone 'Asia/Kolkata')::date >= v_from
                                and (t.delivered_at at time zone 'Asia/Kolkata')::date < v_to and t.status <> 'cancelled'), 0),
    'activeTrips', (select count(*) from trips t where t.status in ('loaded', 'in_transit')),
    'tripsToVerify', (select count(*) from trips t where t.status = 'needs_verification'),
    'documentsReceived', (select count(*) from month_docs),
    'documentsStaff', (select count(*) from month_docs where source = 'staff_upload'),
    'documentsDriver', (select count(*) from month_docs where source = 'driver_link'),
    'autoProcessedPct', coalesce((select round(100.0 * count(*) filter (where status in ('automatically_recorded', 'matched'))
                                               / nullif(count(*) filter (where status not in ('received', 'processing')), 0))
                                    from month_docs), 0),
    'needsAttention', (select count(*) from docs where status = 'needs_review')
                      + (select count(*) from trips where status = 'needs_verification')
                      + (select count(*) from bills where recon_status in ('unreconciled', 'mismatch', 'disputed', 'correction_requested')),
    'pendingProviderBills', (select count(*) from bills where kind = 'provider'
                              and (recon_status in ('unreconciled', 'mismatch', 'disputed', 'correction_requested') or total_amount - paid_amount > 1)),
    'pendingTransporterBills', (select count(*) from bills where kind = 'transporter'
                              and (recon_status in ('unreconciled', 'mismatch', 'disputed', 'correction_requested') or total_amount - paid_amount > 1)),
    'customerOutstanding', coalesce((select sum(balance) from inv), 0),
    'providerPayable', coalesce((select sum(greatest(total_amount - paid_amount, 0)) from bills where kind = 'provider'), 0),
    'transporterPayable', coalesce((select sum(greatest(total_amount - paid_amount, 0)) from bills where kind = 'transporter'), 0),
    'estimatedProfit', coalesce((select estimated_profit from public.v_monthly_profit where month = to_char(v_from, 'YYYY-MM')), 0),
    'overdueInvoices', (select count(*) from inv where overdue_days > 0)
  ) into v_kpis;

  with docs as (
    select d.status, d.source, (d.received_at at time zone 'Asia/Kolkata')::date as day
      from public.documents d where d.deleted_at is null
  ), month_docs as (select * from docs where day >= v_from and day < v_to),
  days as (select generate_series(v_today - 13, v_today, interval '1 day')::date as day)
  select jsonb_build_object(
    'received', (select count(*) from month_docs),
    'success', (select count(*) from month_docs where status in ('automatically_recorded', 'matched')),
    'autoUpdated', (select count(*) from month_docs where status = 'automatically_recorded'),
    'awaitingReview', (select count(*) from docs where status = 'needs_review'),
    'failed', (select count(*) from docs where status = 'failed'),
    'duplicates', (select count(*) from month_docs where status = 'duplicate'),
    'today', (select count(*) from docs where day = v_today),
    'week', (select count(*) from docs where day > v_today - 7),
    'bySource', jsonb_build_object(
      'staff', (select count(*) from month_docs where source = 'staff_upload'),
      'driver', (select count(*) from month_docs where source = 'driver_link')),
    'breakdown', coalesce((select jsonb_agg(jsonb_build_object('status', status, 'count', n) order by n desc)
                             from (select status, count(*) n from month_docs group by status) s), '[]'::jsonb),
    'daily', (select jsonb_agg(jsonb_build_object(
                 'date', ds.day,
                 'automatic', (select count(*) from docs d where d.day = ds.day and d.status in ('automatically_recorded', 'matched')),
                 'review', (select count(*) from docs d where d.day = ds.day
                             and d.status in ('needs_review', 'information_extracted', 'processing', 'received')),
                 'failed', (select count(*) from docs d where d.day = ds.day and d.status in ('failed', 'duplicate'))) order by ds.day)
                from days ds)
  ) into v_automation;

  with econ as (select * from public.v_trip_economics),
  mat as (
    select e.material_id, m.name, round(sum(e.sales_value - e.purchase_cost - e.transport_cost), 2) as profit
      from econ e join public.materials m on m.id = e.material_id group by e.material_id, m.name
  ),
  veh as (
    select t.vehicle_id, t.vehicle_number as plate, round(avg(t.quantity_difference), 2) as avg_diff,
           count(*) filter (where t.tolerance_status in ('needs_verification', 'confirmed_shortage')) as flagged
      from public.v_trip_list t
     where t.unit = 'MT' and t.quantity_difference is not null
     group by t.vehicle_id, t.vehicle_number
  ),
  cust as (
    select customer_id, customer_name, round(sum(subtotal), 2) as sales
      from public.v_invoice_list where status = 'issued' group by customer_id, customer_name
  ),
  trans as (
    select e.transporter_id, tr.name, count(*) as trips,
           round(sum(e.transport_cost) / nullif(sum(e.loading_net), 0), 2) as per_mt
      from econ e join public.transporters tr on tr.id = e.transporter_id
     where e.unit = 'MT' and e.loading_net > 0 group by e.transporter_id, tr.name
  ),
  landed as (
    select provider_id, provider_name, material_name, landed_per_unit, quantity
      from public.v_landed_cost where level = 'provider' and provider_id is not null and quantity > 0
  ),
  attention as (
    select * from (
      select d.id::text as id, 'review' as kind,
             coalesce(d.file_name, 'Document') || ' needs review' as title,
             replace(coalesce(d.review_reason::text, 'check'), '_', ' ') as detail,
             'Needs Review' as status, '/review/' || d.id as href, 'Resolve' as action, d.received_at as at
        from public.documents d where d.status = 'needs_review' and d.deleted_at is null
      union all
      select b.id::text, 'bill', b.party_name || ' bill ' ||
             case when b.recon_status = 'mismatch' then 'differs from records' else 'awaits a decision' end,
             b.bill_number || ' · ₹' || to_char(b.total_amount, 'FM99,99,99,990'),
             case when b.recon_status = 'mismatch' then 'Needs Review' else 'Pending' end,
             '/reconciliation/' || b.id, 'Compare', b.created_at
        from public.v_bill_list b where b.recon_status in ('mismatch', 'unreconciled', 'disputed', 'correction_requested')
      union all
      select t.trip_code, 'shortage', 'Delivery short by ' || round(t.quantity_difference, 2) || ' ' || t.unit,
             t.trip_code || ' · ' || coalesce(t.vehicle_number, '') || ' · ' || coalesce(t.site_name, ''),
             'Needs Verification', '/trips/' || t.trip_code, 'Investigate', t.delivered_at
        from public.v_trip_list t where t.status = 'needs_verification'
      union all
      select i.id::text, 'invoice', i.customer_name || ' invoice overdue',
             i.invoice_number || ' · ' || i.overdue_days || ' days', 'Overdue', '/invoices/' || i.id, 'View',
             i.due_date::timestamptz
        from public.v_invoice_list i where i.status = 'issued' and i.overdue_days > 15
    ) a order by at desc nulls last limit 15
  )
  select jsonb_build_object(
    'month', to_char(v_from, 'YYYY-MM'),
    'kpis', v_kpis,
    'automation', v_automation,
    'monthly', coalesce((select jsonb_agg(to_jsonb(m) order by m.month) from (
                  select * from public.v_monthly_profit order by month desc limit 6) m), '[]'::jsonb),
    'materialProfit', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'profit', profit) order by profit desc)
                                  from mat where profit <> 0), '[]'::jsonb),
    'vehicleDifference', coalesce((select jsonb_agg(jsonb_build_object('plate', plate, 'vehicleId', vehicle_id,
                                     'avgDifference', avg_diff, 'flagged', flagged) order by avg_diff desc)
                                     from (select * from veh where avg_diff <> 0 order by avg_diff desc limit 8) v), '[]'::jsonb),
    'topCustomers', coalesce((select jsonb_agg(jsonb_build_object('name', customer_name, 'customerId', customer_id, 'sales', sales)
                                order by sales desc) from (select * from cust order by sales desc limit 6) c), '[]'::jsonb),
    'transporterCost', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'transporterId', transporter_id,
                                   'perMT', per_mt, 'trips', trips) order by per_mt) from trans), '[]'::jsonb),
    'attention', coalesce((select jsonb_agg(to_jsonb(a) - 'at') from attention a), '[]'::jsonb),
    'insights', jsonb_build_object(
      'bestMaterial', (select jsonb_build_object('name', name, 'profit', profit) from mat order by profit desc limit 1),
      'topCustomer', (select jsonb_build_object('name', customer_name, 'id', customer_id, 'sales', sales) from cust order by sales desc limit 1),
      'costliestTransporter', (select jsonb_build_object('name', name, 'id', transporter_id, 'perMT', per_mt, 'trips', trips)
                                 from trans where per_mt is not null order by per_mt desc limit 1),
      'cheapestProvider', (select jsonb_build_object('name', provider_name, 'id', provider_id, 'material', material_name,
                             'landed', landed_per_unit) from landed order by landed_per_unit limit 1),
      'monthSuppliedMT', (v_kpis ->> 'deliveredMT')::numeric,
      'recurringShortages', coalesce((select jsonb_agg(jsonb_build_object('plate', plate, 'vehicleId', vehicle_id, 'flagged', flagged))
                                        from veh where flagged >= 3), '[]'::jsonb)
    )
  ) into v_result;
  return v_result;
end
$$;
revoke execute on function public.dashboard_summary(date) from public, anon;
grant execute on function public.dashboard_summary(date) to authenticated;

-- =============================================================================
-- Reports: report_run(report, from, to, filters) → {title, columns, rows, chart, summary}
-- Filters: customer_id, material_id, provider_id, transporter_id, vehicle_id (uuids).
-- =============================================================================
create function public.report_run(p_report text, p_from date default null, p_to date default null, p_filters jsonb default '{}')
returns jsonb
language plpgsql stable security invoker set search_path = ''
as $$
declare
  f_customer uuid := nullif(p_filters ->> 'customer_id', '')::uuid;
  f_material uuid := nullif(p_filters ->> 'material_id', '')::uuid;
  f_provider uuid := nullif(p_filters ->> 'provider_id', '')::uuid;
  f_transporter uuid := nullif(p_filters ->> 'transporter_id', '')::uuid;
  f_vehicle uuid := nullif(p_filters ->> 'vehicle_id', '')::uuid;
  v_from date := coalesce(p_from, '1900-01-01');
  v_to date := coalesce(p_to, '2999-12-31');
  v_title text;
  v_cols jsonb;
  v_rows jsonb;
  v_chart jsonb;
  v_summary jsonb;
  v_financial boolean := p_report in ('customer', 'material', 'provider-purchase', 'transporter-expense', 'pending-bills',
                                      'customer-outstanding', 'payables', 'expense', 'order-pl', 'monthly-pl');
begin
  if auth.uid() is not null and v_financial and not public.has_permission('view_financial_reports') then
    raise exception 'You need the view financial reports permission for this report.' using errcode = '42501';
  end if;

  if p_report = 'daily' then
    v_title := 'Daily Report';
    select coalesce(jsonb_agg(jsonb_build_object('date', day, 'trips', trips, 'loaded', loaded, 'delivered', delivered, 'value', value)
                              order by day desc), '[]') into v_rows
      from (select (t.loaded_at at time zone 'Asia/Kolkata')::date as day, count(*) as trips,
                   round(sum(coalesce(t.loading_net, 0)), 2) as loaded, round(sum(coalesce(t.delivered_net, 0)), 2) as delivered,
                   round(sum(coalesce(e.sales_value, 0)), 2) as value
              from public.v_trip_list t left join public.v_trip_economics e on e.trip_id = t.id
             where t.status <> 'cancelled' and (t.loaded_at at time zone 'Asia/Kolkata')::date between v_from and v_to
               and (f_customer is null or t.customer_id = f_customer) and (f_material is null or t.material_id = f_material)
               and (f_transporter is null or t.transporter_id = f_transporter) and (f_vehicle is null or t.vehicle_id = f_vehicle)
             group by 1) x;
    v_cols := '[{"key":"date","label":"Date","format":"date"},{"key":"trips","label":"Trips","format":"number"},
                {"key":"loaded","label":"Loaded qty","format":"number"},{"key":"delivered","label":"Delivered qty","format":"number"},
                {"key":"value","label":"Sales value","format":"inr"}]';
    v_chart := '{"type":"bar","xKey":"date","series":[{"key":"trips","label":"Trips"}],"valueFormat":"number"}';
    v_summary := jsonb_build_array(
      jsonb_build_object('label', 'Trips', 'value', coalesce((select sum((r ->> 'trips')::numeric) from jsonb_array_elements(v_rows) r), 0), 'format', 'number'),
      jsonb_build_object('label', 'Sales value', 'value', coalesce((select sum((r ->> 'value')::numeric) from jsonb_array_elements(v_rows) r), 0), 'format', 'inr'));

  elsif p_report = 'monthly' then
    v_title := 'Monthly Report';
    select coalesce(jsonb_agg(jsonb_build_object('month', month, 'trips', trips, 'loaded', loaded, 'delivered', delivered, 'sales', sales)
                              order by month), '[]') into v_rows
      from (select to_char(t.loaded_at at time zone 'Asia/Kolkata', 'YYYY-MM') as month, count(*) as trips,
                   round(sum(coalesce(t.loading_net, 0)), 2) as loaded, round(sum(coalesce(t.delivered_net, 0)), 2) as delivered,
                   round(sum(coalesce(e.sales_value, 0)), 2) as sales
              from public.v_trip_list t left join public.v_trip_economics e on e.trip_id = t.id
             where t.status <> 'cancelled' and (t.loaded_at at time zone 'Asia/Kolkata')::date between v_from and v_to
               and (f_customer is null or t.customer_id = f_customer) and (f_material is null or t.material_id = f_material)
               and (f_transporter is null or t.transporter_id = f_transporter) and (f_vehicle is null or t.vehicle_id = f_vehicle)
             group by 1) x;
    v_cols := '[{"key":"month","label":"Month","format":"text"},{"key":"trips","label":"Trips","format":"number"},
                {"key":"loaded","label":"Dispatched qty","format":"number"},{"key":"delivered","label":"Delivered qty","format":"number"},
                {"key":"sales","label":"Sales value","format":"inr"}]';
    v_chart := '{"type":"bar","xKey":"month","series":[{"key":"trips","label":"Trips"}],"valueFormat":"number"}';
    v_summary := jsonb_build_array(
      jsonb_build_object('label', 'Trips', 'value', coalesce((select sum((r ->> 'trips')::numeric) from jsonb_array_elements(v_rows) r), 0), 'format', 'number'),
      jsonb_build_object('label', 'Sales value', 'value', coalesce((select sum((r ->> 'sales')::numeric) from jsonb_array_elements(v_rows) r), 0), 'format', 'inr'));

  elsif p_report = 'monthly-pl' then
    v_title := 'Monthly P&L';
    select coalesce(jsonb_agg(jsonb_build_object('month', month, 'sales', sales_value,
                     'cost', purchase_cost + transport_cost + loading_unloading_cost + labour_cost + other_expenses,
                     'profit', estimated_profit,
                     'margin', case when sales_value > 0 then round(100 * estimated_profit / sales_value, 1) else 0 end,
                     'status', profit_status) order by month), '[]') into v_rows
      from public.v_monthly_profit where month between to_char(v_from, 'YYYY-MM') and to_char(v_to, 'YYYY-MM');
    v_cols := '[{"key":"month","label":"Month","format":"text"},{"key":"sales","label":"Sales value","format":"inr"},
                {"key":"cost","label":"Total cost","format":"inr"},{"key":"profit","label":"Estimated profit","format":"inr"},
                {"key":"margin","label":"Margin","format":"percent"},{"key":"status","label":"Status","format":"text"}]';
    v_chart := '{"type":"line","xKey":"month","series":[{"key":"sales","label":"Sales"},{"key":"cost","label":"Cost"},{"key":"profit","label":"Profit"}],"valueFormat":"inr"}';
    v_summary := jsonb_build_array(
      jsonb_build_object('label', 'Sales value', 'value', coalesce((select sum((r ->> 'sales')::numeric) from jsonb_array_elements(v_rows) r), 0), 'format', 'inr'),
      jsonb_build_object('label', 'Estimated profit', 'value', coalesce((select sum((r ->> 'profit')::numeric) from jsonb_array_elements(v_rows) r), 0), 'format', 'inr'));

  elsif p_report = 'customer' then
    v_title := 'Customer-wise Report';
    select coalesce(jsonb_agg(to_jsonb(x) order by x.invoiced desc), '[]') into v_rows from (
      select c.name as customer,
             (select count(*) from public.v_trip_list t where t.customer_id = c.id and t.status <> 'cancelled'
                and (t.loaded_at at time zone 'Asia/Kolkata')::date between v_from and v_to) as trips,
             coalesce((select round(sum(t.delivered_net), 2) from public.v_trip_list t where t.customer_id = c.id
                and (t.delivered_at at time zone 'Asia/Kolkata')::date between v_from and v_to), 0) as quantity,
             coalesce((select round(sum(i.subtotal), 2) from public.v_invoice_list i where i.customer_id = c.id
                and i.status = 'issued' and i.invoice_date between v_from and v_to), 0) as invoiced,
             coalesce((select round(sum(i.balance), 2) from public.v_invoice_list i where i.customer_id = c.id and i.status = 'issued'), 0) as outstanding
        from public.customers c where c.deleted_at is null and (f_customer is null or c.id = f_customer)) x
     where x.trips > 0 or x.invoiced > 0 or x.outstanding > 0;
    v_cols := '[{"key":"customer","label":"Customer","format":"text"},{"key":"trips","label":"Trips","format":"number"},
                {"key":"quantity","label":"Delivered qty","format":"number"},{"key":"invoiced","label":"Invoiced","format":"inr"},
                {"key":"outstanding","label":"Outstanding","format":"inr"}]';
    v_chart := '{"type":"bar","xKey":"customer","series":[{"key":"invoiced","label":"Invoiced"}],"valueFormat":"inr"}';
    v_summary := jsonb_build_array(
      jsonb_build_object('label', 'Invoiced', 'value', coalesce((select sum((r ->> 'invoiced')::numeric) from jsonb_array_elements(v_rows) r), 0), 'format', 'inr'),
      jsonb_build_object('label', 'Outstanding', 'value', coalesce((select sum((r ->> 'outstanding')::numeric) from jsonb_array_elements(v_rows) r), 0), 'format', 'inr'));

  elsif p_report = 'customer-outstanding' then
    v_title := 'Customer Outstanding Report';
    select coalesce(jsonb_agg(to_jsonb(x) order by x.outstanding desc), '[]') into v_rows from (
      select i.customer_name as customer, round(sum(i.total_amount), 2) as invoiced, round(sum(i.paid_amount), 2) as received,
             round(sum(i.balance), 2) as outstanding, round(sum(i.balance) filter (where i.overdue_days > 0), 2) as overdue
        from public.v_invoice_list i
       where i.status = 'issued' and i.invoice_date between v_from and v_to and (f_customer is null or i.customer_id = f_customer)
       group by i.customer_name having sum(i.balance) > 0.005) x;
    v_cols := '[{"key":"customer","label":"Customer","format":"text"},{"key":"invoiced","label":"Invoiced","format":"inr"},
                {"key":"received","label":"Received","format":"inr"},{"key":"outstanding","label":"Outstanding","format":"inr"},
                {"key":"overdue","label":"Overdue","format":"inr"}]';
    v_chart := '{"type":"bar","xKey":"customer","series":[{"key":"outstanding","label":"Outstanding"}],"valueFormat":"inr"}';
    v_summary := jsonb_build_array(
      jsonb_build_object('label', 'Outstanding', 'value', coalesce((select sum((r ->> 'outstanding')::numeric) from jsonb_array_elements(v_rows) r), 0), 'format', 'inr'),
      jsonb_build_object('label', 'Overdue', 'value', coalesce((select sum((r ->> 'overdue')::numeric) from jsonb_array_elements(v_rows) r), 0), 'format', 'inr'));

  elsif p_report = 'material' then
    v_title := 'Material-wise Report';
    select coalesce(jsonb_agg(to_jsonb(x) order by x.sales desc), '[]') into v_rows from (
      select m.name as material, e.unit::text as unit, round(sum(e.billable_qty), 2) as quantity, round(sum(e.sales_value), 2) as sales,
             round(sum(e.sales_value - e.purchase_cost - e.transport_cost), 2) as margin,
             case when sum(e.sales_value) > 0 then round(100 * sum(e.sales_value - e.purchase_cost - e.transport_cost) / sum(e.sales_value), 1) else 0 end as "marginPct"
        from public.v_trip_economics e join public.materials m on m.id = e.material_id
       where e.economic_date between v_from and v_to and (f_material is null or e.material_id = f_material)
         and (f_provider is null or e.provider_id = f_provider)
       group by m.name, e.unit) x;
    v_cols := '[{"key":"material","label":"Material","format":"text"},{"key":"unit","label":"Unit","format":"text"},
                {"key":"quantity","label":"Quantity","format":"number"},{"key":"sales","label":"Sales value","format":"inr"},
                {"key":"margin","label":"Gross margin","format":"inr"},{"key":"marginPct","label":"Margin %","format":"percent"}]';
    v_chart := '{"type":"bar","xKey":"material","series":[{"key":"margin","label":"Gross margin"}],"valueFormat":"inr"}';
    v_summary := jsonb_build_array(
      jsonb_build_object('label', 'Sales value', 'value', coalesce((select sum((r ->> 'sales')::numeric) from jsonb_array_elements(v_rows) r), 0), 'format', 'inr'),
      jsonb_build_object('label', 'Gross margin', 'value', coalesce((select sum((r ->> 'margin')::numeric) from jsonb_array_elements(v_rows) r), 0), 'format', 'inr'));

  elsif p_report = 'provider-purchase' then
    v_title := 'Provider Purchase Report';
    select coalesce(jsonb_agg(to_jsonb(x) order by x.value desc), '[]') into v_rows from (
      select pr.name as provider,
             (select count(distinct p.id) from public.v_purchase_list p where p.provider_id = pr.id and p.status <> 'cancelled'
                and p.purchase_date between v_from and v_to and (f_material is null or p.material_id = f_material)) as purchases,
             coalesce((select round(sum(p.quantity), 2) from public.v_purchase_list p where p.provider_id = pr.id and p.status <> 'cancelled'
                and p.purchase_date between v_from and v_to and (f_material is null or p.material_id = f_material)), 0) as quantity,
             coalesce((select round(sum(p.total_amount), 2) from public.v_purchase_list p where p.provider_id = pr.id and p.status <> 'cancelled'
                and p.purchase_date between v_from and v_to and (f_material is null or p.material_id = f_material)), 0) as value,
             coalesce((select round(sum(b.total_amount), 2) from public.v_bill_list b where b.kind = 'provider' and b.party_id = pr.id
                and b.bill_date between v_from and v_to), 0) as billed,
             coalesce((select round(sum(greatest(b.total_amount - b.paid_amount, 0)), 2) from public.v_bill_list b
                where b.kind = 'provider' and b.party_id = pr.id), 0) as payable
        from public.material_providers pr where pr.deleted_at is null and (f_provider is null or pr.id = f_provider)) x
     where x.purchases > 0 or x.billed > 0 or x.payable > 0;
    v_cols := '[{"key":"provider","label":"Provider","format":"text"},{"key":"purchases","label":"Purchases","format":"number"},
                {"key":"quantity","label":"Quantity","format":"number"},{"key":"value","label":"Purchase value","format":"inr"},
                {"key":"billed","label":"Billed (incl. GST)","format":"inr"},{"key":"payable","label":"Payable","format":"inr"}]';
    v_chart := '{"type":"bar","xKey":"provider","series":[{"key":"value","label":"Purchase value"}],"valueFormat":"inr"}';
    v_summary := jsonb_build_array(
      jsonb_build_object('label', 'Purchase value', 'value', coalesce((select sum((r ->> 'value')::numeric) from jsonb_array_elements(v_rows) r), 0), 'format', 'inr'),
      jsonb_build_object('label', 'Payable', 'value', coalesce((select sum((r ->> 'payable')::numeric) from jsonb_array_elements(v_rows) r), 0), 'format', 'inr'));

  elsif p_report = 'transporter-expense' then
    v_title := 'Transporter Expense Report';
    select coalesce(jsonb_agg(to_jsonb(x) order by x.freight desc), '[]') into v_rows from (
      select tr.name as transporter, count(*) as trips, round(sum(e.transport_cost), 2) as freight,
             round(sum(e.transport_cost) / nullif(count(*), 0), 2) as "perTrip",
             round(sum(e.transport_cost) filter (where e.unit = 'MT') / nullif(sum(e.loading_net) filter (where e.unit = 'MT'), 0), 2) as "perMT"
        from public.v_trip_economics e join public.transporters tr on tr.id = e.transporter_id
        join public.truck_trips t on t.id = e.trip_id
       where coalesce(e.economic_date, v_from) between v_from and v_to and (f_transporter is null or e.transporter_id = f_transporter)
         and (f_vehicle is null or t.vehicle_id = f_vehicle)
       group by tr.name) x;
    v_cols := '[{"key":"transporter","label":"Transporter","format":"text"},{"key":"trips","label":"Trips","format":"number"},
                {"key":"freight","label":"Total freight","format":"inr"},{"key":"perTrip","label":"Avg per trip","format":"inr"},
                {"key":"perMT","label":"Avg per MT","format":"inr"}]';
    v_chart := '{"type":"bar","xKey":"transporter","series":[{"key":"perMT","label":"Cost per MT"}],"valueFormat":"inr"}';
    v_summary := jsonb_build_array(
      jsonb_build_object('label', 'Total freight', 'value', coalesce((select sum((r ->> 'freight')::numeric) from jsonb_array_elements(v_rows) r), 0), 'format', 'inr'),
      jsonb_build_object('label', 'Trips', 'value', coalesce((select sum((r ->> 'trips')::numeric) from jsonb_array_elements(v_rows) r), 0), 'format', 'number'));

  elsif p_report = 'vehicle-trips' then
    v_title := 'Vehicle-wise Trip Report';
    select coalesce(jsonb_agg(to_jsonb(x) order by x.trips desc), '[]') into v_rows from (
      select t.vehicle_number as vehicle, t.transporter_name as transporter, count(*) as trips,
             round(sum(coalesce(t.loading_net, 0)), 2) as loaded, round(avg(t.quantity_difference), 2) as "avgDiff",
             count(*) filter (where t.tolerance_status in ('needs_verification', 'confirmed_shortage')) as "aboveTolerance"
        from public.v_trip_list t
       where t.status <> 'cancelled' and (t.loaded_at at time zone 'Asia/Kolkata')::date between v_from and v_to
         and (f_vehicle is null or t.vehicle_id = f_vehicle) and (f_transporter is null or t.transporter_id = f_transporter)
         and (f_material is null or t.material_id = f_material)
       group by t.vehicle_number, t.transporter_name) x;
    v_cols := '[{"key":"vehicle","label":"Vehicle","format":"text"},{"key":"transporter","label":"Transporter","format":"text"},
                {"key":"trips","label":"Trips","format":"number"},{"key":"loaded","label":"Loaded qty","format":"number"},
                {"key":"avgDiff","label":"Avg difference","format":"number"},{"key":"aboveTolerance","label":"Above tolerance","format":"number"}]';
    v_chart := '{"type":"bar","xKey":"vehicle","series":[{"key":"trips","label":"Trips"}],"valueFormat":"number"}';
    v_summary := jsonb_build_array(
      jsonb_build_object('label', 'Vehicles', 'value', jsonb_array_length(v_rows), 'format', 'number'),
      jsonb_build_object('label', 'Trips', 'value', coalesce((select sum((r ->> 'trips')::numeric) from jsonb_array_elements(v_rows) r), 0), 'format', 'number'));

  elsif p_report = 'shortage' then
    v_title := 'Shortage Report';
    select coalesce(jsonb_agg(to_jsonb(x) order by x.date desc), '[]') into v_rows from (
      select t.trip_code as trip, (t.delivered_at at time zone 'Asia/Kolkata')::date as date, t.vehicle_number as vehicle,
             t.material_name as material, round(t.quantity_difference, 3) as difference,
             initcap(replace(t.tolerance_status::text, '_', ' ')) as status,
             coalesce(initcap(replace(t.investigation_outcome::text, '_', ' ')), 'Open') as outcome
        from public.v_trip_list t
       where t.tolerance_status in ('needs_verification', 'confirmed_shortage')
         and (t.delivered_at at time zone 'Asia/Kolkata')::date between v_from and v_to
         and (f_vehicle is null or t.vehicle_id = f_vehicle) and (f_transporter is null or t.transporter_id = f_transporter)
         and (f_material is null or t.material_id = f_material) and (f_customer is null or t.customer_id = f_customer)) x;
    v_cols := '[{"key":"trip","label":"Trip","format":"text"},{"key":"date","label":"Date","format":"date"},
                {"key":"vehicle","label":"Vehicle","format":"text"},{"key":"material","label":"Material","format":"text"},
                {"key":"difference","label":"Difference","format":"number"},{"key":"status","label":"Status","format":"text"},
                {"key":"outcome","label":"Outcome","format":"text"}]';
    v_chart := '{"type":"bar","xKey":"vehicle","series":[{"key":"difference","label":"Difference"}],"valueFormat":"number"}';
    v_summary := jsonb_build_array(
      jsonb_build_object('label', 'Trips above tolerance', 'value', jsonb_array_length(v_rows), 'format', 'number'),
      jsonb_build_object('label', 'Total difference', 'value', coalesce((select sum((r ->> 'difference')::numeric) from jsonb_array_elements(v_rows) r), 0), 'format', 'number'));

  elsif p_report in ('pending-bills', 'payables') then
    v_title := case p_report when 'payables' then 'Provider & Transporter Payable Report' else 'Pending Bills Report' end;
    select coalesce(jsonb_agg(to_jsonb(x) order by x.date), '[]') into v_rows from (
      select b.bill_number as bill, b.party_name as party, initcap(b.kind) as kind, b.bill_date as date, b.due_date as due,
             b.total_amount as total, round(greatest(b.total_amount - b.paid_amount, 0), 2) as outstanding,
             initcap(replace(b.recon_status::text, '_', ' ')) as status
        from public.v_bill_list b
       where b.bill_date between v_from and v_to
         and (f_provider is null or (b.kind = 'provider' and b.party_id = f_provider))
         and (f_transporter is null or (b.kind = 'transporter' and b.party_id = f_transporter))
         and case when p_report = 'payables' then b.total_amount - b.paid_amount > 1
                  else b.recon_status in ('unreconciled', 'mismatch', 'disputed', 'correction_requested') or b.total_amount - b.paid_amount > 1 end) x;
    v_cols := '[{"key":"bill","label":"Bill no.","format":"text"},{"key":"party","label":"Party","format":"text"},
                {"key":"kind","label":"Type","format":"text"},{"key":"date","label":"Date","format":"date"},
                {"key":"due","label":"Due","format":"date"},{"key":"total","label":"Total","format":"inr"},
                {"key":"outstanding","label":"Outstanding","format":"inr"},{"key":"status","label":"Reconciliation","format":"text"}]';
    v_chart := '{"type":"bar","xKey":"party","series":[{"key":"outstanding","label":"Outstanding"}],"valueFormat":"inr"}';
    v_summary := jsonb_build_array(
      jsonb_build_object('label', 'Bills', 'value', jsonb_array_length(v_rows), 'format', 'number'),
      jsonb_build_object('label', 'Outstanding', 'value', coalesce((select sum((r ->> 'outstanding')::numeric) from jsonb_array_elements(v_rows) r), 0), 'format', 'inr'));

  elsif p_report = 'expense' then
    v_title := 'Expense Report';
    select coalesce(jsonb_agg(to_jsonb(x) order by x.date desc), '[]') into v_rows from (
      select e.expense_date as date, initcap(replace(e.category::text, 'waiting', 'waiting charges')) as category, e.description,
             coalesce(e.paid_to, '') as "paidTo", coalesce(e.trip_code, e.order_code, 'General') as linked, e.amount
        from public.v_expense_list e where e.expense_date between v_from and v_to) x;
    v_cols := '[{"key":"date","label":"Date","format":"date"},{"key":"category","label":"Category","format":"text"},
                {"key":"description","label":"Description","format":"text"},{"key":"paidTo","label":"Paid to","format":"text"},
                {"key":"linked","label":"Linked to","format":"text"},{"key":"amount","label":"Amount","format":"inr"}]';
    v_chart := '{"type":"bar","xKey":"category","series":[{"key":"amount","label":"Amount"}],"valueFormat":"inr"}';
    v_summary := jsonb_build_array(
      jsonb_build_object('label', 'Expenses', 'value', jsonb_array_length(v_rows), 'format', 'number'),
      jsonb_build_object('label', 'Total', 'value', coalesce((select sum((r ->> 'amount')::numeric) from jsonb_array_elements(v_rows) r), 0), 'format', 'inr'));

  elsif p_report = 'order-pl' then
    v_title := 'Order-wise P&L';
    select coalesce(jsonb_agg(to_jsonb(x) order by x."order" desc), '[]') into v_rows from (
      select o.order_code as "order", o.customer_name as customer, o.sales_value as sales, o.purchase_cost as purchase,
             o.transport_cost as transport, o.loading_unloading_cost + o.labour_cost + o.other_expenses as other,
             o.estimated_profit as profit, coalesce(o.margin_pct, 0) as margin,
             case o.profit_status when 'settled' then 'Final Settled' else 'Estimated' end as status
        from public.v_order_profit o join public.customer_orders co on co.id = o.order_id
       where o.trip_count > 0 and co.order_date between v_from and v_to and (f_customer is null or o.customer_id = f_customer)) x;
    v_cols := '[{"key":"order","label":"Order","format":"text"},{"key":"customer","label":"Customer","format":"text"},
                {"key":"sales","label":"Sales","format":"inr"},{"key":"purchase","label":"Purchase","format":"inr"},
                {"key":"transport","label":"Transport","format":"inr"},{"key":"other","label":"Other costs","format":"inr"},
                {"key":"profit","label":"Est. profit","format":"inr"},{"key":"margin","label":"Margin","format":"percent"},
                {"key":"status","label":"Status","format":"text"}]';
    v_chart := '{"type":"bar","xKey":"order","series":[{"key":"profit","label":"Estimated profit"}],"valueFormat":"inr"}';
    v_summary := jsonb_build_array(
      jsonb_build_object('label', 'Sales', 'value', coalesce((select sum((r ->> 'sales')::numeric) from jsonb_array_elements(v_rows) r), 0), 'format', 'inr'),
      jsonb_build_object('label', 'Estimated profit', 'value', coalesce((select sum((r ->> 'profit')::numeric) from jsonb_array_elements(v_rows) r), 0), 'format', 'inr'));
  else
    raise exception 'Unknown report %.', p_report using errcode = '22023';
  end if;

  return jsonb_build_object('id', p_report, 'title', v_title, 'from', p_from, 'to', p_to, 'filters', coalesce(p_filters, '{}'::jsonb),
                            'columns', v_cols, 'rows', v_rows, 'chart', v_chart, 'summary', v_summary,
                            'generatedAt', now());
end
$$;
revoke execute on function public.report_run(text, date, date, jsonb) from public, anon;
grant execute on function public.report_run(text, date, date, jsonb) to authenticated;

-- =============================================================================
-- Housekeeping (daily): expired / revoked driver links (30 days after they stopped working),
-- rate-limit rows older than 2 days, error logs older than 90 days.
-- Documents keep their link reference as null (on delete set null); evidence is never deleted.
-- =============================================================================
create function public.run_housekeeping()
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_tokens integer;
  v_hits integer;
  v_errors integer;
begin
  delete from public.upload_tokens
   where (revoked_at is not null and revoked_at < now() - interval '30 days')
      or (expires_at < now() - interval '30 days');
  get diagnostics v_tokens = row_count;
  delete from public.rate_limit_hits where window_start < now() - interval '2 days';
  get diagnostics v_hits = row_count;
  delete from public.error_logs where created_at < now() - interval '90 days';
  get diagnostics v_errors = row_count;
  return jsonb_build_object('upload_tokens', v_tokens, 'rate_limit_hits', v_hits, 'error_logs', v_errors);
end
$$;

-- Daily export of critical tables to the backups bucket (Edge Function export-backup).
create function public.kick_backup_export()
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  begin
    execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into v_url using 'export_backup_url';
    execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into v_secret using 'document_worker_secret';
  exception when others then
    return;
  end;
  if v_url is null or v_secret is null then
    return;
  end if;
  begin
    execute 'select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 60000)'
      using v_url, '{}'::jsonb, jsonb_build_object('Content-Type', 'application/json', 'x-worker-secret', v_secret);
  exception when others then
    null;
  end;
end
$$;

do $$
begin
  perform cron.schedule('housekeeping', '30 20 * * *', 'select public.run_housekeeping()');      -- 02:00 IST
  perform cron.schedule('backup-export', '0 21 * * *', 'select public.kick_backup_export()');   -- 02:30 IST
exception when others then
  raise notice 'pg_cron not available: %', sqlerrm;
end
$$;

-- ---------- Privileges ----------
revoke execute on function public.log_client_error(text, jsonb) from public, anon;
grant execute on function public.log_client_error(text, jsonb) to authenticated;
revoke execute on function public.retry_document_job(uuid) from public, anon;
grant execute on function public.retry_document_job(uuid) to authenticated;
revoke execute on function public.retry_failed_jobs() from public, anon;
grant execute on function public.retry_failed_jobs() to authenticated;
revoke execute on function public.run_housekeeping() from public, anon, authenticated;
grant execute on function public.run_housekeeping() to service_role;
revoke execute on function public.kick_backup_export() from public, anon, authenticated;
grant execute on function public.kick_backup_export() to service_role;
