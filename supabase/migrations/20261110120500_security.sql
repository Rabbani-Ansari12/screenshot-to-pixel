-- =============================================================================
-- Security: updated_at triggers, audit triggers, Row Level Security on every table,
-- privileges. Owner: full access. Employees: per permission (public.has_permission).
-- Generated from one permission table so every table follows the same pattern.
-- =============================================================================

-- ---------- updated_at / updated_by ----------
create trigger businesses_set_updated_at before update on public.businesses for each row execute function public.set_updated_at();
create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger customers_set_updated_at before update on public.customers for each row execute function public.set_updated_at();
create trigger construction_sites_set_updated_at before update on public.construction_sites for each row execute function public.set_updated_at();
create trigger materials_set_updated_at before update on public.materials for each row execute function public.set_updated_at();
create trigger material_rates_set_updated_at before update on public.material_rates for each row execute function public.set_updated_at();
create trigger material_providers_set_updated_at before update on public.material_providers for each row execute function public.set_updated_at();
create trigger transporters_set_updated_at before update on public.transporters for each row execute function public.set_updated_at();
create trigger drivers_set_updated_at before update on public.drivers for each row execute function public.set_updated_at();
create trigger vehicles_set_updated_at before update on public.vehicles for each row execute function public.set_updated_at();
create trigger stock_locations_set_updated_at before update on public.stock_locations for each row execute function public.set_updated_at();
create trigger customer_orders_set_updated_at before update on public.customer_orders for each row execute function public.set_updated_at();
create trigger order_items_set_updated_at before update on public.order_items for each row execute function public.set_updated_at();
create trigger purchases_set_updated_at before update on public.purchases for each row execute function public.set_updated_at();
create trigger purchase_items_set_updated_at before update on public.purchase_items for each row execute function public.set_updated_at();
create trigger truck_trips_set_updated_at before update on public.truck_trips for each row execute function public.set_updated_at();
create trigger weight_records_set_updated_at before update on public.weight_records for each row execute function public.set_updated_at();
create trigger delivery_records_set_updated_at before update on public.delivery_records for each row execute function public.set_updated_at();
create trigger stock_movements_set_updated_at before update on public.stock_movements for each row execute function public.set_updated_at();
create trigger whatsapp_messages_set_updated_at before update on public.whatsapp_messages for each row execute function public.set_updated_at();
create trigger documents_set_updated_at before update on public.documents for each row execute function public.set_updated_at();
create trigger ai_processing_records_set_updated_at before update on public.ai_processing_records for each row execute function public.set_updated_at();
create trigger provider_bills_set_updated_at before update on public.provider_bills for each row execute function public.set_updated_at();
create trigger provider_bill_items_set_updated_at before update on public.provider_bill_items for each row execute function public.set_updated_at();
create trigger transporter_bills_set_updated_at before update on public.transporter_bills for each row execute function public.set_updated_at();
create trigger transporter_bill_trips_set_updated_at before update on public.transporter_bill_trips for each row execute function public.set_updated_at();
create trigger reconciliation_records_set_updated_at before update on public.reconciliation_records for each row execute function public.set_updated_at();
create trigger customer_invoices_set_updated_at before update on public.customer_invoices for each row execute function public.set_updated_at();
create trigger invoice_items_set_updated_at before update on public.invoice_items for each row execute function public.set_updated_at();
create trigger payments_set_updated_at before update on public.payments for each row execute function public.set_updated_at();
create trigger expenses_set_updated_at before update on public.expenses for each row execute function public.set_updated_at();
create trigger employees_set_updated_at before update on public.employees for each row execute function public.set_updated_at();
create trigger user_permissions_set_updated_at before update on public.user_permissions for each row execute function public.set_updated_at();
create trigger app_settings_set_updated_at before update on public.app_settings for each row execute function public.set_updated_at();

-- ---------- Audit (insert-only log of every change) ----------
create trigger customer_orders_audit after insert or update or delete on public.customer_orders for each row execute function public.audit_row_change();
create trigger order_items_audit after insert or update or delete on public.order_items for each row execute function public.audit_row_change();
create trigger purchases_audit after insert or update or delete on public.purchases for each row execute function public.audit_row_change();
create trigger purchase_items_audit after insert or update or delete on public.purchase_items for each row execute function public.audit_row_change();
create trigger truck_trips_audit after insert or update or delete on public.truck_trips for each row execute function public.audit_row_change();
create trigger weight_records_audit after insert or update or delete on public.weight_records for each row execute function public.audit_row_change();
create trigger delivery_records_audit after insert or update or delete on public.delivery_records for each row execute function public.audit_row_change();
create trigger documents_audit after insert or update or delete on public.documents for each row execute function public.audit_row_change();
create trigger ai_processing_records_audit after insert or update or delete on public.ai_processing_records for each row execute function public.audit_row_change();
create trigger provider_bills_audit after insert or update or delete on public.provider_bills for each row execute function public.audit_row_change();
create trigger provider_bill_items_audit after insert or update or delete on public.provider_bill_items for each row execute function public.audit_row_change();
create trigger transporter_bills_audit after insert or update or delete on public.transporter_bills for each row execute function public.audit_row_change();
create trigger transporter_bill_trips_audit after insert or update or delete on public.transporter_bill_trips for each row execute function public.audit_row_change();
create trigger reconciliation_records_audit after insert or update or delete on public.reconciliation_records for each row execute function public.audit_row_change();
create trigger customer_invoices_audit after insert or update or delete on public.customer_invoices for each row execute function public.audit_row_change();
create trigger invoice_items_audit after insert or update or delete on public.invoice_items for each row execute function public.audit_row_change();
create trigger payments_audit after insert or update or delete on public.payments for each row execute function public.audit_row_change();
create trigger expenses_audit after insert or update or delete on public.expenses for each row execute function public.audit_row_change();
create trigger user_permissions_audit after insert or update or delete on public.user_permissions for each row execute function public.audit_row_change();
create trigger profiles_audit after insert or update or delete on public.profiles for each row execute function public.audit_row_change();
create trigger employees_audit after insert or update or delete on public.employees for each row execute function public.audit_row_change();
create trigger app_settings_audit after insert or update or delete on public.app_settings for each row execute function public.audit_row_change();
create trigger materials_audit after insert or update or delete on public.materials for each row execute function public.audit_row_change();
create trigger material_rates_audit after insert or update or delete on public.material_rates for each row execute function public.audit_row_change();
create trigger stock_movements_audit after insert or update or delete on public.stock_movements for each row execute function public.audit_row_change();

-- ---------- Row Level Security ----------
alter table public.businesses enable row level security;
alter table public.profiles enable row level security;
alter table public.customers enable row level security;
alter table public.construction_sites enable row level security;
alter table public.materials enable row level security;
alter table public.material_rates enable row level security;
alter table public.material_providers enable row level security;
alter table public.transporters enable row level security;
alter table public.drivers enable row level security;
alter table public.vehicles enable row level security;
alter table public.stock_locations enable row level security;
alter table public.customer_orders enable row level security;
alter table public.order_items enable row level security;
alter table public.purchases enable row level security;
alter table public.purchase_items enable row level security;
alter table public.truck_trips enable row level security;
alter table public.weight_records enable row level security;
alter table public.delivery_records enable row level security;
alter table public.stock_movements enable row level security;
alter table public.whatsapp_messages enable row level security;
alter table public.documents enable row level security;
alter table public.ai_processing_records enable row level security;
alter table public.provider_bills enable row level security;
alter table public.provider_bill_items enable row level security;
alter table public.transporter_bills enable row level security;
alter table public.transporter_bill_trips enable row level security;
alter table public.reconciliation_records enable row level security;
alter table public.customer_invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.payments enable row level security;
alter table public.expenses enable row level security;
alter table public.employees enable row level security;
alter table public.user_permissions enable row level security;
alter table public.app_settings enable row level security;
alter table public.audit_logs enable row level security;

-- businesses: members read their own business; owner updates it
create policy businesses_select on public.businesses for select to authenticated using (id = (select public.current_business_id()));
create policy businesses_update on public.businesses for update to authenticated using (id = (select public.current_business_id()) and (select public.is_owner())) with check (id = (select public.current_business_id()));

-- profiles: active members see colleagues (names in the UI); only the owner edits. Accounts are created by the service role.
create policy profiles_select on public.profiles for select to authenticated using (id = (select auth.uid()) or business_id = (select public.current_business_id()));
create policy profiles_update on public.profiles for update to authenticated using (business_id = (select public.current_business_id()) and (select public.is_owner())) with check (business_id = (select public.current_business_id()));

-- customers
create policy customers_select on public.customers for select to authenticated using (business_id = (select public.current_business_id()) and ((select public.has_permission('view_records'))));
create policy customers_insert on public.customers for insert to authenticated with check (business_id = (select public.current_business_id()) and ((select public.has_permission('manage_orders'))));
create policy customers_update on public.customers for update to authenticated using (business_id = (select public.current_business_id()) and ((select public.has_permission('manage_orders')))) with check (business_id = (select public.current_business_id()) and ((select public.has_permission('manage_orders'))));
create policy customers_delete on public.customers for delete to authenticated using (business_id = (select public.current_business_id()) and (select public.is_owner()));

-- construction_sites
create policy construction_sites_select on public.construction_sites for select to authenticated using (business_id = (select public.current_business_id()) and ((select public.has_permission('view_records'))));
create policy construction_sites_insert on public.construction_sites for insert to authenticated with check (business_id = (select public.current_business_id()) and ((select public.has_permission('manage_orders'))));
create policy construction_sites_update on public.construction_sites for update to authenticated using (business_id = (select public.current_business_id()) and ((select public.has_permission('manage_orders')))) with check (business_id = (select public.current_business_id()) and ((select public.has_permission('manage_orders'))));
create policy construction_sites_delete on public.construction_sites for delete to authenticated using (business_id = (select public.current_business_id()) and (select public.is_owner()));

-- materials
create policy materials_select on public.materials for select to authenticated using (business_id = (select public.current_business_id()) and ((select public.has_permission('view_records'))));
create policy materials_insert on public.materials for insert to authenticated with check (business_id = (select public.current_business_id()) and ((select public.has_permission('manage_orders'))));
create policy materials_update on public.materials for update to authenticated using (business_id = (select public.current_business_id()) and ((select public.has_permission('manage_orders')))) with check (business_id = (select public.current_business_id()) and ((select public.has_permission('manage_orders'))));
create policy materials_delete on public.materials for delete to authenticated using (business_id = (select public.current_business_id()) and (select public.is_owner()));

-- material_rates
create policy material_rates_select on public.material_rates for select to authenticated using (business_id = (select public.current_business_id()) and ((select public.has_permission('view_records'))));
create policy material_rates_insert on public.material_rates for insert to authenticated with check (business_id = (select public.current_business_id()) and ((select public.has_permission('manage_orders'))));
create policy material_rates_update on public.material_rates for update to authenticated using (business_id = (select public.current_business_id()) and ((select public.has_permission('manage_orders')))) with check (business_id = (select public.current_business_id()) and ((select public.has_permission('manage_orders'))));
create policy material_rates_delete on public.material_rates for delete to authenticated using (business_id = (select public.current_business_id()) and ((select public.has_permission('manage_orders'))));

-- material_providers
create policy material_providers_select on public.material_providers for select to authenticated using (business_id = (select public.current_business_id()) and ((select public.has_permission('view_records'))));
create policy material_providers_insert on public.material_providers for insert to authenticated with check (business_id = (select public.current_business_id()) and ((select public.has_permission('manage_orders'))));
create policy material_providers_update on public.material_providers for update to authenticated using (business_id = (select public.current_business_id()) and ((select public.has_permission('manage_orders')))) with check (business_id = (select public.current_business_id()) and ((select public.has_permission('manage_orders'))));
create policy material_providers_delete on public.material_providers for delete to authenticated using (business_id = (select public.current_business_id()) and (select public.is_owner()));

-- transporters
create policy transporters_select on public.transporters for select to authenticated using (business_id = (select public.current_business_id()) and ((select public.has_permission('view_records'))));
create policy transporters_insert on public.transporters for insert to authenticated with check (business_id = (select public.current_business_id()) and ((select public.has_permission('manage_trips'))));
create policy transporters_update on public.transporters for update to authenticated using (business_id = (select public.current_business_id()) and ((select public.has_permission('manage_trips')))) with check (business_id = (select public.current_business_id()) and ((select public.has_permission('manage_trips'))));
create policy transporters_delete on public.transporters for delete to authenticated using (business_id = (select public.current_business_id()) and (select public.is_owner()));

-- drivers
create policy drivers_select on public.drivers for select to authenticated using (business_id = (select public.current_business_id()) and ((select public.has_permission('view_records'))));
create policy drivers_insert on public.drivers for insert to authenticated with check (business_id = (select public.current_business_id()) and ((select public.has_permission('manage_trips'))));
create policy drivers_update on public.drivers for update to authenticated using (business_id = (select public.current_business_id()) and ((select public.has_permission('manage_trips')))) with check (business_id = (select public.current_business_id()) and ((select public.has_permission('manage_trips'))));
create policy drivers_delete on public.drivers for delete to authenticated using (business_id = (select public.current_business_id()) and (select public.is_owner()));

-- vehicles
create policy vehicles_select on public.vehicles for select to authenticated using (business_id = (select public.current_business_id()) and ((select public.has_permission('view_records'))));
create policy vehicles_insert on public.vehicles for insert to authenticated with check (business_id = (select public.current_business_id()) and ((select public.has_permission('manage_trips'))));
create policy vehicles_update on public.vehicles for update to authenticated using (business_id = (select public.current_business_id()) and ((select public.has_permission('manage_trips')))) with check (business_id = (select public.current_business_id()) and ((select public.has_permission('manage_trips'))));
create policy vehicles_delete on public.vehicles for delete to authenticated using (business_id = (select public.current_business_id()) and (select public.is_owner()));

-- stock_locations
create policy stock_locations_select on public.stock_locations for select to authenticated using (business_id = (select public.current_business_id()) and ((select public.has_permission('view_records'))));
create policy stock_locations_insert on public.stock_locations for insert to authenticated with check (business_id = (select public.current_business_id()) and (select public.is_owner()));
create policy stock_locations_update on public.stock_locations for update to authenticated using (business_id = (select public.current_business_id()) and (select public.is_owner())) with check (business_id = (select public.current_business_id()) and (select public.is_owner()));
create policy stock_locations_delete on public.stock_locations for delete to authenticated using (business_id = (select public.current_business_id()) and (select public.is_owner()));

-- customer_orders
create policy customer_orders_select on public.customer_orders for select to authenticated using (business_id = (select public.current_business_id()) and ((select public.has_permission('view_records'))));
create policy customer_orders_insert on public.customer_orders for insert to authenticated with check (business_id = (select public.current_business_id()) and ((select public.has_permission('manage_orders'))));
create policy customer_orders_update on public.customer_orders for update to authenticated using (business_id = (select public.current_business_id()) and ((select public.has_permission('manage_orders')))) with check (business_id = (select public.current_business_id()) and ((select public.has_permission('manage_orders'))));
create policy customer_orders_delete on public.customer_orders for delete to authenticated using (business_id = (select public.current_business_id()) and (select public.is_owner()));

-- order_items
create policy order_items_select on public.order_items for select to authenticated using (business_id = (select public.current_business_id()) and ((select public.has_permission('view_records'))));
create policy order_items_insert on public.order_items for insert to authenticated with check (business_id = (select public.current_business_id()) and ((select public.has_permission('manage_orders'))));
create policy order_items_update on public.order_items for update to authenticated using (business_id = (select public.current_business_id()) and ((select public.has_permission('manage_orders')))) with check (business_id = (select public.current_business_id()) and ((select public.has_permission('manage_orders'))));
create policy order_items_delete on public.order_items for delete to authenticated using (business_id = (select public.current_business_id()) and ((select public.has_permission('manage_orders'))));

-- purchases
create policy purchases_select on public.purchases for select to authenticated using (business_id = (select public.current_business_id()) and ((select public.has_permission('view_records'))));
create policy purchases_insert on public.purchases for insert to authenticated with check (business_id = (select public.current_business_id()) and ((select public.has_permission('manage_orders'))));
create policy purchases_update on public.purchases for update to authenticated using (business_id = (select public.current_business_id()) and ((select public.has_permission('manage_orders')))) with check (business_id = (select public.current_business_id()) and ((select public.has_permission('manage_orders'))));
create policy purchases_delete on public.purchases for delete to authenticated using (business_id = (select public.current_business_id()) and (select public.is_owner()));

-- purchase_items
create policy purchase_items_select on public.purchase_items for select to authenticated using (business_id = (select public.current_business_id()) and ((select public.has_permission('view_records'))));
create policy purchase_items_insert on public.purchase_items for insert to authenticated with check (business_id = (select public.current_business_id()) and ((select public.has_permission('manage_orders'))));
create policy purchase_items_update on public.purchase_items for update to authenticated using (business_id = (select public.current_business_id()) and ((select public.has_permission('manage_orders')))) with check (business_id = (select public.current_business_id()) and ((select public.has_permission('manage_orders'))));
create policy purchase_items_delete on public.purchase_items for delete to authenticated using (business_id = (select public.current_business_id()) and ((select public.has_permission('manage_orders'))));

-- truck_trips
create policy truck_trips_select on public.truck_trips for select to authenticated using (business_id = (select public.current_business_id()) and ((select public.has_permission('view_records'))));
create policy truck_trips_insert on public.truck_trips for insert to authenticated with check (business_id = (select public.current_business_id()) and ((select public.has_permission('manage_trips'))));
create policy truck_trips_update on public.truck_trips for update to authenticated using (business_id = (select public.current_business_id()) and ((select public.has_permission('manage_trips')))) with check (business_id = (select public.current_business_id()) and ((select public.has_permission('manage_trips'))));
create policy truck_trips_delete on public.truck_trips for delete to authenticated using (business_id = (select public.current_business_id()) and (select public.is_owner()));

-- weight_records
create policy weight_records_select on public.weight_records for select to authenticated using (business_id = (select public.current_business_id()) and ((select public.has_permission('view_records'))));
create policy weight_records_insert on public.weight_records for insert to authenticated with check (business_id = (select public.current_business_id()) and ((select public.has_permission('manage_trips')) or (select public.has_permission('review_documents'))));
create policy weight_records_update on public.weight_records for update to authenticated using (business_id = (select public.current_business_id()) and ((select public.has_permission('manage_trips')) or (select public.has_permission('correct_extracted')))) with check (business_id = (select public.current_business_id()) and ((select public.has_permission('manage_trips')) or (select public.has_permission('correct_extracted'))));
create policy weight_records_delete on public.weight_records for delete to authenticated using (business_id = (select public.current_business_id()) and (select public.is_owner()));

-- delivery_records
create policy delivery_records_select on public.delivery_records for select to authenticated using (business_id = (select public.current_business_id()) and ((select public.has_permission('view_records'))));
create policy delivery_records_insert on public.delivery_records for insert to authenticated with check (business_id = (select public.current_business_id()) and ((select public.has_permission('manage_trips'))));
create policy delivery_records_update on public.delivery_records for update to authenticated using (business_id = (select public.current_business_id()) and ((select public.has_permission('manage_trips')))) with check (business_id = (select public.current_business_id()) and ((select public.has_permission('manage_trips'))));
create policy delivery_records_delete on public.delivery_records for delete to authenticated using (business_id = (select public.current_business_id()) and (select public.is_owner()));

-- stock_movements
create policy stock_movements_select on public.stock_movements for select to authenticated using (business_id = (select public.current_business_id()) and ((select public.has_permission('view_records'))));
create policy stock_movements_insert on public.stock_movements for insert to authenticated with check (business_id = (select public.current_business_id()) and ((select public.has_permission('manage_trips'))));
create policy stock_movements_update on public.stock_movements for update to authenticated using (business_id = (select public.current_business_id()) and (select public.is_owner())) with check (business_id = (select public.current_business_id()) and (select public.is_owner()));
create policy stock_movements_delete on public.stock_movements for delete to authenticated using (business_id = (select public.current_business_id()) and (select public.is_owner()));

-- whatsapp_messages
create policy whatsapp_messages_select on public.whatsapp_messages for select to authenticated using (business_id = (select public.current_business_id()) and ((select public.has_permission('view_records')) or (select public.has_permission('review_documents'))));
create policy whatsapp_messages_delete on public.whatsapp_messages for delete to authenticated using (business_id = (select public.current_business_id()) and (select public.is_owner()));

-- documents
create policy documents_select on public.documents for select to authenticated using (business_id = (select public.current_business_id()) and ((select public.has_permission('view_records')) or (select public.has_permission('review_documents'))));
create policy documents_insert on public.documents for insert to authenticated with check (business_id = (select public.current_business_id()) and ((select public.has_permission('review_documents')) or (select public.has_permission('manage_trips'))));
create policy documents_update on public.documents for update to authenticated using (business_id = (select public.current_business_id()) and ((select public.has_permission('review_documents')) or (select public.has_permission('correct_extracted')))) with check (business_id = (select public.current_business_id()) and ((select public.has_permission('review_documents')) or (select public.has_permission('correct_extracted'))));
create policy documents_delete on public.documents for delete to authenticated using (business_id = (select public.current_business_id()) and (select public.is_owner()));

-- ai_processing_records
create policy ai_processing_records_select on public.ai_processing_records for select to authenticated using (business_id = (select public.current_business_id()) and ((select public.has_permission('review_documents')) or (select public.has_permission('correct_extracted'))));
create policy ai_processing_records_insert on public.ai_processing_records for insert to authenticated with check (business_id = (select public.current_business_id()) and ((select public.has_permission('review_documents'))));
create policy ai_processing_records_update on public.ai_processing_records for update to authenticated using (business_id = (select public.current_business_id()) and ((select public.has_permission('correct_extracted')))) with check (business_id = (select public.current_business_id()) and ((select public.has_permission('correct_extracted'))));
create policy ai_processing_records_delete on public.ai_processing_records for delete to authenticated using (business_id = (select public.current_business_id()) and (select public.is_owner()));

-- provider_bills
create policy provider_bills_select on public.provider_bills for select to authenticated using (business_id = (select public.current_business_id()) and ((select public.has_permission('verify_bills')) or (select public.has_permission('view_financial_reports')) or (select public.has_permission('record_payments'))));
create policy provider_bills_insert on public.provider_bills for insert to authenticated with check (business_id = (select public.current_business_id()) and ((select public.has_permission('verify_bills'))));
create policy provider_bills_update on public.provider_bills for update to authenticated using (business_id = (select public.current_business_id()) and ((select public.has_permission('verify_bills')))) with check (business_id = (select public.current_business_id()) and ((select public.has_permission('verify_bills'))));
create policy provider_bills_delete on public.provider_bills for delete to authenticated using (business_id = (select public.current_business_id()) and (select public.is_owner()));

-- provider_bill_items
create policy provider_bill_items_select on public.provider_bill_items for select to authenticated using (business_id = (select public.current_business_id()) and ((select public.has_permission('verify_bills')) or (select public.has_permission('view_financial_reports'))));
create policy provider_bill_items_insert on public.provider_bill_items for insert to authenticated with check (business_id = (select public.current_business_id()) and ((select public.has_permission('verify_bills'))));
create policy provider_bill_items_update on public.provider_bill_items for update to authenticated using (business_id = (select public.current_business_id()) and ((select public.has_permission('verify_bills')))) with check (business_id = (select public.current_business_id()) and ((select public.has_permission('verify_bills'))));
create policy provider_bill_items_delete on public.provider_bill_items for delete to authenticated using (business_id = (select public.current_business_id()) and ((select public.has_permission('verify_bills'))));

-- transporter_bills
create policy transporter_bills_select on public.transporter_bills for select to authenticated using (business_id = (select public.current_business_id()) and ((select public.has_permission('verify_bills')) or (select public.has_permission('view_financial_reports')) or (select public.has_permission('record_payments'))));
create policy transporter_bills_insert on public.transporter_bills for insert to authenticated with check (business_id = (select public.current_business_id()) and ((select public.has_permission('verify_bills'))));
create policy transporter_bills_update on public.transporter_bills for update to authenticated using (business_id = (select public.current_business_id()) and ((select public.has_permission('verify_bills')))) with check (business_id = (select public.current_business_id()) and ((select public.has_permission('verify_bills'))));
create policy transporter_bills_delete on public.transporter_bills for delete to authenticated using (business_id = (select public.current_business_id()) and (select public.is_owner()));

-- transporter_bill_trips
create policy transporter_bill_trips_select on public.transporter_bill_trips for select to authenticated using (business_id = (select public.current_business_id()) and ((select public.has_permission('verify_bills')) or (select public.has_permission('view_financial_reports'))));
create policy transporter_bill_trips_insert on public.transporter_bill_trips for insert to authenticated with check (business_id = (select public.current_business_id()) and ((select public.has_permission('verify_bills'))));
create policy transporter_bill_trips_update on public.transporter_bill_trips for update to authenticated using (business_id = (select public.current_business_id()) and ((select public.has_permission('verify_bills')))) with check (business_id = (select public.current_business_id()) and ((select public.has_permission('verify_bills'))));
create policy transporter_bill_trips_delete on public.transporter_bill_trips for delete to authenticated using (business_id = (select public.current_business_id()) and ((select public.has_permission('verify_bills'))));

-- reconciliation_records
create policy reconciliation_records_select on public.reconciliation_records for select to authenticated using (business_id = (select public.current_business_id()) and ((select public.has_permission('verify_bills')) or (select public.has_permission('view_financial_reports'))));
create policy reconciliation_records_insert on public.reconciliation_records for insert to authenticated with check (business_id = (select public.current_business_id()) and ((select public.has_permission('verify_bills'))));
create policy reconciliation_records_update on public.reconciliation_records for update to authenticated using (business_id = (select public.current_business_id()) and ((select public.has_permission('verify_bills')))) with check (business_id = (select public.current_business_id()) and ((select public.has_permission('verify_bills'))));
create policy reconciliation_records_delete on public.reconciliation_records for delete to authenticated using (business_id = (select public.current_business_id()) and (select public.is_owner()));

-- customer_invoices
create policy customer_invoices_select on public.customer_invoices for select to authenticated using (business_id = (select public.current_business_id()) and ((select public.has_permission('record_payments')) or (select public.has_permission('verify_bills')) or (select public.has_permission('view_financial_reports'))));
create policy customer_invoices_insert on public.customer_invoices for insert to authenticated with check (business_id = (select public.current_business_id()) and ((select public.has_permission('record_payments'))));
create policy customer_invoices_update on public.customer_invoices for update to authenticated using (business_id = (select public.current_business_id()) and ((select public.has_permission('record_payments')) or (select public.has_permission('verify_bills')))) with check (business_id = (select public.current_business_id()) and ((select public.has_permission('record_payments')) or (select public.has_permission('verify_bills'))));
create policy customer_invoices_delete on public.customer_invoices for delete to authenticated using (business_id = (select public.current_business_id()) and (select public.is_owner()));

-- invoice_items
create policy invoice_items_select on public.invoice_items for select to authenticated using (business_id = (select public.current_business_id()) and ((select public.has_permission('record_payments')) or (select public.has_permission('verify_bills')) or (select public.has_permission('view_financial_reports'))));
create policy invoice_items_insert on public.invoice_items for insert to authenticated with check (business_id = (select public.current_business_id()) and ((select public.has_permission('record_payments'))));
create policy invoice_items_update on public.invoice_items for update to authenticated using (business_id = (select public.current_business_id()) and ((select public.has_permission('record_payments')))) with check (business_id = (select public.current_business_id()) and ((select public.has_permission('record_payments'))));
create policy invoice_items_delete on public.invoice_items for delete to authenticated using (business_id = (select public.current_business_id()) and ((select public.has_permission('record_payments'))));

-- payments
create policy payments_select on public.payments for select to authenticated using (business_id = (select public.current_business_id()) and ((select public.has_permission('record_payments')) or (select public.has_permission('view_financial_reports'))));
create policy payments_insert on public.payments for insert to authenticated with check (business_id = (select public.current_business_id()) and ((select public.has_permission('record_payments'))));
create policy payments_update on public.payments for update to authenticated using (business_id = (select public.current_business_id()) and ((select public.has_permission('record_payments')))) with check (business_id = (select public.current_business_id()) and ((select public.has_permission('record_payments'))));
create policy payments_delete on public.payments for delete to authenticated using (business_id = (select public.current_business_id()) and (select public.is_owner()));

-- expenses
create policy expenses_select on public.expenses for select to authenticated using (business_id = (select public.current_business_id()) and ((select public.has_permission('record_payments')) or (select public.has_permission('view_financial_reports'))));
create policy expenses_insert on public.expenses for insert to authenticated with check (business_id = (select public.current_business_id()) and ((select public.has_permission('record_payments'))));
create policy expenses_update on public.expenses for update to authenticated using (business_id = (select public.current_business_id()) and ((select public.has_permission('record_payments')))) with check (business_id = (select public.current_business_id()) and ((select public.has_permission('record_payments'))));
create policy expenses_delete on public.expenses for delete to authenticated using (business_id = (select public.current_business_id()) and (select public.is_owner()));

-- employees
create policy employees_select on public.employees for select to authenticated using (business_id = (select public.current_business_id()) and ((select public.is_owner()) or profile_id = (select auth.uid())));
create policy employees_insert on public.employees for insert to authenticated with check (business_id = (select public.current_business_id()) and (select public.is_owner()));
create policy employees_update on public.employees for update to authenticated using (business_id = (select public.current_business_id()) and (select public.is_owner())) with check (business_id = (select public.current_business_id()) and (select public.is_owner()));
create policy employees_delete on public.employees for delete to authenticated using (business_id = (select public.current_business_id()) and (select public.is_owner()));

-- user_permissions
create policy user_permissions_select on public.user_permissions for select to authenticated using (business_id = (select public.current_business_id()) and ((select public.is_owner()) or profile_id = (select auth.uid())));
create policy user_permissions_insert on public.user_permissions for insert to authenticated with check (business_id = (select public.current_business_id()) and (select public.is_owner()));
create policy user_permissions_update on public.user_permissions for update to authenticated using (business_id = (select public.current_business_id()) and (select public.is_owner())) with check (business_id = (select public.current_business_id()) and (select public.is_owner()));
create policy user_permissions_delete on public.user_permissions for delete to authenticated using (business_id = (select public.current_business_id()) and (select public.is_owner()));

-- app_settings
create policy app_settings_select on public.app_settings for select to authenticated using (business_id = (select public.current_business_id()));
create policy app_settings_insert on public.app_settings for insert to authenticated with check (business_id = (select public.current_business_id()) and (select public.is_owner()));
create policy app_settings_update on public.app_settings for update to authenticated using (business_id = (select public.current_business_id()) and (select public.is_owner())) with check (business_id = (select public.current_business_id()) and (select public.is_owner()));

-- audit_logs
create policy audit_logs_select on public.audit_logs for select to authenticated using (business_id = (select public.current_business_id()) and (select public.is_owner()));

-- ---------- Privileges ----------
-- Anonymous users get nothing. RLS does not cover TRUNCATE, so revoke it.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke truncate, references, trigger on all tables in schema public from authenticated;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;

-- Audit log: insert only through the SECURITY DEFINER trigger; nobody updates or deletes.
revoke insert, update, delete, truncate on public.audit_logs from authenticated, service_role;
revoke all on public.audit_logs from anon;

-- Helper functions are for signed-in users (RLS) only.
revoke execute on function public.current_business_id() from public, anon;
revoke execute on function public.is_active_user() from public, anon;
revoke execute on function public.is_owner() from public, anon;
revoke execute on function public.has_permission(public.permission_key) from public, anon;
revoke execute on function public.generate_code(text, regclass, integer) from public, anon;
grant execute on function public.current_business_id() to authenticated, service_role;
grant execute on function public.is_active_user() to authenticated, service_role;
grant execute on function public.is_owner() to authenticated, service_role;
grant execute on function public.has_permission(public.permission_key) to authenticated, service_role;
grant execute on function public.generate_code(text, regclass, integer) to authenticated, service_role;

