-- =============================================================================
-- Indexes: every foreign key column, plus lookups used by matching and lists
-- (vehicle numbers, slip numbers, trip codes, hashes, statuses, dates).
-- =============================================================================

-- Every single-column foreign key in public gets an index (named idx_<table>_<column>).
do $$
declare
  r record;
begin
  for r in
    select c.conrelid::regclass as tbl, cls.relname as table_name, a.attname as column_name
    from pg_constraint c
    join pg_class cls on cls.oid = c.conrelid
    join pg_namespace n on n.oid = cls.relnamespace
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f' and n.nspname = 'public' and array_length(c.conkey, 1) = 1
      and not exists (
        select 1 from pg_index i
        where i.indrelid = c.conrelid and i.indkey[0] = c.conkey[1]
      )
    order by 2, 3
  loop
    execute format('create index if not exists %I on %s (%I)', 'idx_' || r.table_name || '_' || r.column_name, r.tbl, r.column_name);
  end loop;
end
$$;

-- Composite FK customer_orders(site_id, customer_id)
create index if not exists idx_customer_orders_site_customer on public.customer_orders (site_id, customer_id);

-- Matching lookups
create index idx_vehicles_number on public.vehicles (vehicle_number);
create index idx_weight_records_vehicle_number on public.weight_records (upper(regexp_replace(vehicle_number, '[^A-Za-z0-9]', '', 'g')));
create index idx_weight_records_slip_number on public.weight_records (slip_number);
create index idx_provider_bill_items_vehicle on public.provider_bill_items (vehicle_number);
create index idx_transporter_bill_trips_vehicle on public.transporter_bill_trips (vehicle_number);
create index idx_whatsapp_messages_from_phone on public.whatsapp_messages (from_phone);
create index idx_documents_sender_phone on public.documents (sender_phone);
-- trip_code, order_code, purchase_code, payment_code, documents (business_id, sha256),
-- whatsapp_messages.twilio_message_sid already have unique indexes.

-- Status columns
create index idx_customer_orders_status on public.customer_orders (business_id, status);
create index idx_purchases_status on public.purchases (business_id, status);
create index idx_truck_trips_status on public.truck_trips (business_id, status);
create index idx_delivery_records_tolerance_status on public.delivery_records (business_id, tolerance_status);
create index idx_documents_status on public.documents (business_id, status);
create index idx_whatsapp_messages_status on public.whatsapp_messages (business_id, processing_status);
create index idx_ai_processing_records_status on public.ai_processing_records (business_id, status);
create index idx_provider_bills_recon on public.provider_bills (business_id, recon_status);
create index idx_transporter_bills_recon on public.transporter_bills (business_id, recon_status);
create index idx_customer_invoices_status on public.customer_invoices (business_id, status, recon_status);
create index idx_reconciliation_records_status on public.reconciliation_records (business_id, status);

-- Dates
create index idx_customer_orders_order_date on public.customer_orders (business_id, order_date desc);
create index idx_purchases_purchase_date on public.purchases (business_id, purchase_date desc);
create index idx_truck_trips_created_at on public.truck_trips (business_id, created_at desc);
create index idx_weight_records_measured_at on public.weight_records (business_id, measured_at desc);
create index idx_delivery_records_delivered_at on public.delivery_records (business_id, delivered_at desc);
create index idx_documents_received_at on public.documents (business_id, received_at desc);
create index idx_whatsapp_messages_received_at on public.whatsapp_messages (business_id, received_at desc);
create index idx_provider_bills_bill_date on public.provider_bills (business_id, bill_date desc);
create index idx_transporter_bills_bill_date on public.transporter_bills (business_id, bill_date desc);
create index idx_customer_invoices_invoice_date on public.customer_invoices (business_id, invoice_date desc);
create index idx_customer_invoices_due_date on public.customer_invoices (business_id, due_date);
create index idx_payments_payment_date on public.payments (business_id, payment_date desc);
create index idx_expenses_expense_date on public.expenses (business_id, expense_date desc);
create index idx_stock_movements_date on public.stock_movements (business_id, movement_date desc);
create index idx_audit_logs_changed_at on public.audit_logs (business_id, changed_at desc);
create index idx_audit_logs_record on public.audit_logs (table_name, record_id);
