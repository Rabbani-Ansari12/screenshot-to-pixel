-- v_landed_cost: say which grouping a row belongs to. Per-material totals and own-stock
-- (yard) rows both have a null provider, so the page needs this to tell them apart.
create or replace view public.v_landed_cost with (security_invoker = true) as
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
  count(*) as trip_count,
  case when grouping(e.provider_id) = 1 then 'material' else 'provider' end as level
from public.v_trip_economics e
join public.materials m on m.id = e.material_id
left join public.material_providers p on p.id = e.provider_id
where e.loading_net is not null
group by grouping sets ((e.business_id, e.material_id, m.name, e.unit), (e.business_id, e.material_id, m.name, e.unit, e.provider_id, p.name));
