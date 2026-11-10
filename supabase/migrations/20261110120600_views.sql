-- =============================================================================
-- Reporting views. All use security_invoker so the caller's RLS applies.
-- Customer receipts are never treated as profit.
-- =============================================================================

-- Latest active loading / delivery weight per trip.
create view public.v_trip_weights with (security_invoker = true) as
select
  t.id as trip_id,
  t.business_id,
  lw.id as loading_weight_id,
  lw.measured_at as loaded_at,
  lw.slip_number as loading_slip_number,
  lw.net_quantity as loading_net,
  lw.has_net_mismatch as loading_net_mismatch,
  dw.id as delivery_weight_id,
  dw.measured_at as delivered_at,
  dw.slip_number as delivery_slip_number,
  dw.net_quantity as delivered_net,
  dw.has_net_mismatch as delivery_net_mismatch
from public.truck_trips t
left join public.weight_records lw on lw.trip_id = t.id and lw.record_type = 'loading' and lw.deleted_at is null
left join public.weight_records dw on dw.trip_id = t.id and dw.record_type = 'delivery' and dw.deleted_at is null;

create view public.v_trip_summary with (security_invoker = true) as
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
  t.material_id,
  m.name as material_name,
  m.unit,
  t.purchase_id,
  t.stock_location_id,
  t.provider_id,
  p.name as provider_name,
  t.transporter_id,
  tr.name as transporter_name,
  t.vehicle_id,
  v.vehicle_number,
  t.driver_id,
  d.full_name as driver_name,
  t.freight_amount,
  w.loaded_at,
  w.loading_slip_number,
  w.loading_net,
  w.loading_net_mismatch,
  w.delivered_at,
  w.delivery_slip_number,
  w.delivered_net,
  w.delivery_net_mismatch,
  (w.loading_net - w.delivered_net)::numeric(14,3) as quantity_difference,
  m.shortage_tolerance as tolerance,
  public.tolerance_status_for(w.loading_net - w.delivered_net, m.shortage_tolerance) as tolerance_status,
  dr.investigation_outcome,
  (select count(*) from public.documents doc where doc.trip_id = t.id and doc.deleted_at is null) as document_count,
  t.created_at
from public.truck_trips t
join public.customer_orders o on o.id = t.order_id
join public.customers c on c.id = o.customer_id
join public.construction_sites s on s.id = t.site_id
join public.materials m on m.id = t.material_id
join public.transporters tr on tr.id = t.transporter_id
join public.vehicles v on v.id = t.vehicle_id
left join public.material_providers p on p.id = t.provider_id
left join public.drivers d on d.id = t.driver_id
left join public.v_trip_weights w on w.trip_id = t.id
left join public.delivery_records dr on dr.trip_id = t.id
where t.deleted_at is null;

-- Ordered vs dispatched vs delivered, per order item (units are never mixed).
create view public.v_order_progress with (security_invoker = true) as
select
  oi.id as order_item_id,
  oi.business_id,
  o.id as order_id,
  o.order_code,
  o.status as order_status,
  o.order_date,
  o.expected_delivery,
  o.customer_id,
  c.name as customer_name,
  o.site_id,
  s.name as site_name,
  oi.material_id,
  m.name as material_name,
  oi.unit,
  oi.quantity as ordered_qty,
  oi.selling_rate,
  round(oi.quantity * oi.selling_rate, 2) as order_value,
  count(t.id) as trip_count,
  coalesce(sum(w.loading_net), 0)::numeric(14,3) as dispatched_qty,
  coalesce(sum(w.delivered_net), 0)::numeric(14,3) as delivered_qty,
  greatest(oi.quantity - coalesce(sum(w.delivered_net), 0), 0)::numeric(14,3) as pending_qty,
  round(100 * coalesce(sum(w.delivered_net), 0) / oi.quantity, 1) as delivered_pct
from public.order_items oi
join public.customer_orders o on o.id = oi.order_id and o.deleted_at is null
join public.customers c on c.id = o.customer_id
join public.construction_sites s on s.id = o.site_id
join public.materials m on m.id = oi.material_id
left join public.truck_trips t
  on t.order_id = o.id and t.deleted_at is null and t.status <> 'cancelled'
 and (t.order_item_id = oi.id or (t.order_item_id is null and t.material_id = oi.material_id))
left join public.v_trip_weights w on w.trip_id = t.id
group by oi.id, o.id, c.name, s.name, m.name;

-- Receivables per customer: invoiced minus everything received (incl. on-account receipts).
create view public.v_customer_outstanding with (security_invoker = true) as
with inv as (
  select customer_id, count(*) as invoice_count, sum(total_amount) as invoiced
  from public.customer_invoices where deleted_at is null and status = 'issued'
  group by customer_id
), paid as (
  select customer_id, sum(amount) as received
  from public.payments where deleted_at is null and direction = 'incoming'
  group by customer_id
), overdue as (
  select i.customer_id,
         sum(greatest(i.total_amount - coalesce(p.paid, 0), 0)) as overdue_amount
  from public.customer_invoices i
  left join (select invoice_id, sum(amount) as paid from public.payments where deleted_at is null group by invoice_id) p
    on p.invoice_id = i.id
  where i.deleted_at is null and i.status = 'issued' and i.due_date < (now() at time zone 'Asia/Kolkata')::date
  group by i.customer_id
)
select
  c.id as customer_id,
  c.business_id,
  c.name as customer_name,
  coalesce(inv.invoice_count, 0) as invoice_count,
  coalesce(inv.invoiced, 0)::numeric(14,2) as invoiced_amount,
  coalesce(paid.received, 0)::numeric(14,2) as received_amount,
  (coalesce(inv.invoiced, 0) - coalesce(paid.received, 0))::numeric(14,2) as outstanding_amount,
  coalesce(overdue.overdue_amount, 0)::numeric(14,2) as overdue_amount
from public.customers c
left join inv on inv.customer_id = c.id
left join paid on paid.customer_id = c.id
left join overdue on overdue.customer_id = c.id
where c.deleted_at is null;

create view public.v_provider_payable with (security_invoker = true) as
with billed as (
  select provider_id, count(*) as bill_count, sum(total_amount) as billed,
         count(*) filter (where recon_status in ('mismatch', 'disputed', 'unreconciled')) as bills_needing_attention
  from public.provider_bills where deleted_at is null group by provider_id
), paid as (
  select provider_id, sum(amount) as paid
  from public.payments where deleted_at is null and direction = 'outgoing' and party_type = 'provider'
  group by provider_id
)
select
  p.id as provider_id,
  p.business_id,
  p.name as provider_name,
  coalesce(billed.bill_count, 0) as bill_count,
  coalesce(billed.bills_needing_attention, 0) as bills_needing_attention,
  coalesce(billed.billed, 0)::numeric(14,2) as billed_amount,
  coalesce(paid.paid, 0)::numeric(14,2) as paid_amount,
  (coalesce(billed.billed, 0) - coalesce(paid.paid, 0))::numeric(14,2) as payable_amount
from public.material_providers p
left join billed on billed.provider_id = p.id
left join paid on paid.provider_id = p.id
where p.deleted_at is null;

create view public.v_transporter_payable with (security_invoker = true) as
with billed as (
  select transporter_id, count(*) as bill_count, sum(total_amount) as billed,
         count(*) filter (where recon_status in ('mismatch', 'disputed', 'unreconciled')) as bills_needing_attention
  from public.transporter_bills where deleted_at is null group by transporter_id
), paid as (
  select transporter_id, sum(amount) as paid
  from public.payments where deleted_at is null and direction = 'outgoing' and party_type = 'transporter'
  group by transporter_id
)
select
  t.id as transporter_id,
  t.business_id,
  t.name as transporter_name,
  coalesce(billed.bill_count, 0) as bill_count,
  coalesce(billed.bills_needing_attention, 0) as bills_needing_attention,
  coalesce(billed.billed, 0)::numeric(14,2) as billed_amount,
  coalesce(paid.paid, 0)::numeric(14,2) as paid_amount,
  (coalesce(billed.billed, 0) - coalesce(paid.paid, 0))::numeric(14,2) as payable_amount
from public.transporters t
left join billed on billed.transporter_id = t.id
left join paid on paid.transporter_id = t.id
where t.deleted_at is null;

-- Estimated profit per order: sales - purchase - transport - other expenses.
-- Sales use the authoritative weight from app_settings and the order's selling rate.
-- Yard trips are costed at the yard's weighted average landed rate.
-- 'settled' only when the order is completed, every trip is delivered and every invoice is fully paid.
create view public.v_order_profit with (security_invoker = true) as
with trip_lines as (
  select
    t.id as trip_id,
    t.business_id,
    t.order_id,
    w.loading_net,
    w.delivered_net,
    t.freight_amount,
    coalesce(oi.selling_rate, m.selling_rate, 0) as selling_rate,
    case when coalesce(st.authoritative_weight, 'delivery') = 'loading' then w.loading_net
         else coalesce(w.delivered_net, w.loading_net) end as billable_qty,
    case
      when pi.id is not null then
        coalesce(w.loading_net, 0) * pi.rate + pi.additional_costs * coalesce(w.loading_net, 0) / nullif(pi.quantity, 0)
      when t.stock_location_id is not null then coalesce(w.loading_net, 0) * coalesce(yard.landed_rate, m.purchase_rate, 0)
      else coalesce(w.loading_net, 0) * coalesce(m.purchase_rate, 0)
    end as purchase_cost
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
    where x.purchase_id = t.purchase_id and x.material_id = t.material_id
    order by x.created_at limit 1
  ) pi on true
  left join lateral (
    select sum(x.quantity * x.rate + x.additional_costs) / nullif(sum(x.quantity), 0) as landed_rate
    from public.purchase_items x join public.purchases y on y.id = x.purchase_id
    where y.stock_location_id = t.stock_location_id and x.material_id = t.material_id and y.deleted_at is null
  ) yard on true
  where t.deleted_at is null and t.status <> 'cancelled'
), trips as (
  select order_id,
         sum(billable_qty * selling_rate) as sales_value,
         sum(purchase_cost) as purchase_cost,
         sum(freight_amount) as transport_cost,
         count(*) as trip_count,
         count(*) filter (where delivered_net is null) as undelivered_trips
  from trip_lines group by order_id
), exp as (
  select order_id,
         sum(amount) filter (where category in ('loading', 'unloading')) as loading_unloading,
         sum(amount) filter (where category = 'labour') as labour,
         sum(amount) filter (where category in ('fuel', 'toll', 'waiting', 'other')) as other_expenses
  from public.expenses where deleted_at is null and order_id is not null group by order_id
), inv as (
  select i.order_id,
         count(*) as invoice_count,
         bool_and(coalesce(p.paid, 0) + 1 >= i.total_amount) as all_paid
  from public.customer_invoices i
  left join (select invoice_id, sum(amount) as paid from public.payments where deleted_at is null group by invoice_id) p
    on p.invoice_id = i.id
  where i.deleted_at is null and i.status = 'issued'
  group by i.order_id
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
  case when o.status = 'completed' and coalesce(trips.undelivered_trips, 0) = 0
            and coalesce(inv.invoice_count, 0) > 0 and inv.all_paid
       then 'settled' else 'estimated' end as profit_status
from public.customer_orders o
join public.customers c on c.id = o.customer_id
left join trips on trips.order_id = o.id
left join exp on exp.order_id = o.id
left join inv on inv.order_id = o.id
where o.deleted_at is null;

create view public.v_stock_balance with (security_invoker = true) as
select
  sm.business_id,
  sm.stock_location_id,
  l.name as stock_location_name,
  sm.material_id,
  m.name as material_name,
  m.unit,
  coalesce(sum(sm.quantity) filter (where sm.movement_type = 'received'), 0)::numeric(14,3) as received_qty,
  coalesce(-sum(sm.quantity) filter (where sm.movement_type = 'issued'), 0)::numeric(14,3) as issued_qty,
  coalesce(sum(sm.quantity) filter (where sm.movement_type = 'adjustment'), 0)::numeric(14,3) as adjusted_qty,
  sum(sm.quantity)::numeric(14,3) as balance_qty,
  max(sm.movement_date) as last_movement_date
from public.stock_movements sm
join public.stock_locations l on l.id = sm.stock_location_id
join public.materials m on m.id = sm.material_id
group by sm.business_id, sm.stock_location_id, l.name, sm.material_id, m.name, m.unit;

-- Delivery differences per vehicle. "Recurring" = 3+ trips above tolerance in 90 days.
create view public.v_vehicle_shortage_stats with (security_invoker = true) as
select
  v.id as vehicle_id,
  v.business_id,
  v.vehicle_number,
  v.transporter_id,
  tr.name as transporter_name,
  count(ts.id) as trip_count,
  count(ts.delivered_net) as delivered_trip_count,
  round(avg(ts.quantity_difference) filter (where ts.unit = 'MT'), 3) as avg_difference_mt,
  coalesce(sum(ts.quantity_difference) filter (where ts.unit = 'MT' and ts.quantity_difference > 0), 0)::numeric(14,3) as total_shortfall_mt,
  count(*) filter (where ts.tolerance_status = 'needs_verification') as needs_verification_count,
  count(*) filter (where ts.tolerance_status = 'confirmed_shortage') as confirmed_shortage_count,
  count(*) filter (where ts.tolerance_status in ('needs_verification', 'confirmed_shortage')
                   and ts.delivered_at >= now() - interval '90 days') >= 3 as has_recurring_shortage
from public.vehicles v
join public.transporters tr on tr.id = v.transporter_id
left join public.v_trip_summary ts on ts.vehicle_id = v.id
where v.deleted_at is null
group by v.id, tr.name;

revoke all on public.v_trip_weights, public.v_trip_summary, public.v_order_progress, public.v_customer_outstanding,
  public.v_provider_payable, public.v_transporter_payable, public.v_order_profit, public.v_stock_balance,
  public.v_vehicle_shortage_stats from anon;
grant select on public.v_trip_weights, public.v_trip_summary, public.v_order_progress, public.v_customer_outstanding,
  public.v_provider_payable, public.v_transporter_payable, public.v_order_profit, public.v_stock_balance,
  public.v_vehicle_shortage_stats to authenticated, service_role;
