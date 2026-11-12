-- Indexes for the joins and filters used by the dashboard, the 14 reports, reconciliation and
-- the paged lists (found by reviewing their query plans). Foreign keys without an index make
-- every join a full scan once the tables grow.
create index if not exists idx_truck_trips_order on public.truck_trips (order_id);
create index if not exists idx_truck_trips_vehicle on public.truck_trips (vehicle_id);
create index if not exists idx_truck_trips_transporter on public.truck_trips (transporter_id);
create index if not exists idx_truck_trips_provider on public.truck_trips (provider_id);
create index if not exists idx_truck_trips_purchase on public.truck_trips (purchase_id);
create index if not exists idx_truck_trips_material on public.truck_trips (material_id);
create index if not exists idx_order_items_order on public.order_items (order_id);
create index if not exists idx_purchase_items_purchase on public.purchase_items (purchase_id);
create index if not exists idx_payments_invoice on public.payments (invoice_id) where invoice_id is not null;
create index if not exists idx_payments_provider_bill on public.payments (provider_bill_id) where provider_bill_id is not null;
create index if not exists idx_payments_transporter_bill on public.payments (transporter_bill_id) where transporter_bill_id is not null;
create index if not exists idx_payments_customer on public.payments (customer_id) where customer_id is not null;
create index if not exists idx_payments_provider on public.payments (provider_id) where provider_id is not null;
create index if not exists idx_payments_transporter on public.payments (transporter_id) where transporter_id is not null;
create index if not exists idx_provider_bill_items_bill on public.provider_bill_items (bill_id);
create index if not exists idx_provider_bill_items_trip on public.provider_bill_items (trip_id) where trip_id is not null;
create index if not exists idx_transporter_bill_trips_trip on public.transporter_bill_trips (trip_id) where trip_id is not null;
create index if not exists idx_invoice_items_invoice on public.invoice_items (invoice_id);
create index if not exists idx_customer_invoices_customer on public.customer_invoices (customer_id);
create index if not exists idx_customer_invoices_order on public.customer_invoices (order_id);
create index if not exists idx_expenses_order on public.expenses (order_id) where order_id is not null;
create index if not exists idx_expenses_trip on public.expenses (trip_id) where trip_id is not null;
create index if not exists idx_audit_logs_user on public.audit_logs (business_id, changed_by, changed_at desc);
create index if not exists idx_audit_logs_table on public.audit_logs (business_id, table_name, changed_at desc);
create index if not exists idx_documents_source on public.documents (business_id, source, received_at desc);
create index if not exists idx_upload_tokens_expiry on public.upload_tokens (expires_at);
create index if not exists idx_rate_limit_hits_window on public.rate_limit_hits (window_start);
