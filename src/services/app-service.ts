import {
  auditEvents, automationTrend, bills, customers, documents, employeeRecords, expenses,
  invoices, materials, monthlyTrend, orders, payments, providers, purchases, transporters,
  trips, vehicles, whatsappMessages,
} from "@/data/mock-data";
import type { ModuleData, TableRow } from "@/types/domain";
import { formatDate } from "@/lib/format";

export interface AppData {
  customers: typeof customers;
  providers: typeof providers;
  transporters: typeof transporters;
  vehicles: typeof vehicles;
  materials: typeof materials;
  orders: typeof orders;
  purchases: typeof purchases;
  trips: typeof trips;
  documents: typeof documents;
  bills: typeof bills;
  invoices: typeof invoices;
  payments: typeof payments;
  expenses: typeof expenses;
  whatsappMessages: typeof whatsappMessages;
  auditEvents: typeof auditEvents;
  employeeRecords: typeof employeeRecords;
  monthlyTrend: typeof monthlyTrend;
  automationTrend: typeof automationTrend;
  modules: Record<string, ModuleData>;
}
const tableRows = (records: readonly TableRow[]): TableRow[] => [...records];

// TODO: Replace these fixture reads with API/database calls while keeping page contracts unchanged.
export async function loadAppData(): Promise<AppData> {
  await Promise.resolve();
  const customerName = (id: string) => customers.find((item) => item.id === id)?.name ?? "Customer";
  const materialName = (id: string) => materials.find((item) => item.id === id)?.name ?? "Material";
  const providerName = (id: string) => providers.find((item) => item.id === id)?.name ?? "Provider";
  const transportName = (id: string) => transporters.find((item) => item.id === id)?.name ?? "Transporter";
  const modules: Record<string, ModuleData> = {};
  const module = (key: string, title: string, description: string, rows: TableRow[]) => {
    modules[key] = { title, description, rows: tableRows(rows) };
  };
  module("orders", "Customer orders", "Order fulfilment across active construction sites.", orders.map((row) => ({ id: row.id, reference: row.ref, entity: customerName(row.customerId), detail: `${row.site} · ${materialName(row.materialId)}`, date: formatDate(row.expected), status: row.status, amount: row.profit, quantity: row.required, extra: `${row.delivered} / ${row.required} MT delivered` })));
  module("purchases", "Purchases", "Material purchases, supplier rates and delivery destinations.", purchases.map((row) => ({ id: row.id, reference: row.ref, entity: providerName(row.providerId), detail: materialName(row.materialId), date: formatDate(row.date), status: row.status, amount: row.quantity * row.rate + row.extraCost, quantity: row.quantity, extra: `${row.destination} · ${row.rate.toLocaleString("en-IN")} / MT` })));
  module("trips", "Truck trips", "Loading, delivery and weighbridge records in one place.", trips.map((row) => ({ id: row.id, reference: row.ref, entity: vehicles.find((v) => v.id === row.vehicleId)?.plate ?? "Vehicle", detail: `${orders.find((o) => o.id === row.orderId)?.ref ?? "Order"} · ${transportName(row.transporterId)}`, date: formatDate(row.date), status: row.status, amount: row.delivered * 1_100, quantity: row.delivered, extra: `${row.loaded.toFixed(2)} → ${row.delivered.toFixed(2)} MT` })));
  module("shortages", "Delivery & shortages", "Weight differences measured against material tolerances.", trips.map((row) => ({ id: row.id, reference: row.ref, entity: vehicles.find((v) => v.id === row.vehicleId)?.plate ?? "Vehicle", detail: `${orders.find((o) => o.id === row.orderId)?.ref ?? "Order"} · ${materialName(orders.find((o) => o.id === row.orderId)?.materialId ?? "")}`, date: formatDate(row.date), status: row.status === "Delivered" || row.status === "In transit" ? "Normal" : row.status, amount: (row.loaded - row.delivered) * 1_100, quantity: Number((row.loaded - row.delivered).toFixed(2)), extra: `${row.loaded.toFixed(2)} loaded · ${row.delivered.toFixed(2)} delivered MT` })));
  module("documents", "Document inbox", "Incoming slips, bills and site photos from the WhatsApp line.", documents.map((row) => ({ id: row.id, reference: row.ref, entity: row.sender, detail: `${row.kind} · ${row.source}`, date: formatDate(row.received), status: row.status, amount: row.confidence, quantity: row.confidence, extra: `${row.confidence}% confidence · ${row.linked}` })));
  module("review", "Review queue", "Resolve only the items that need an owner’s attention.", documents.filter((row) => ["Needs review", "Failed"].includes(row.status)).map((row) => ({ id: row.id, reference: row.ref, entity: row.kind, detail: `${row.sender} · ${row.reason || "Essential detail needs confirmation."}`, date: formatDate(row.received), status: row.status, amount: row.confidence, quantity: row.confidence, extra: `${row.confidence}% confidence · ${row.linked}` })));
  module("whatsapp", "WhatsApp messages", "Read-only view of incoming messages and attached documents.", whatsappMessages.map((row) => ({ id: row.id, reference: `MSG-${row.id.slice(-2)}`, entity: row.sender, detail: row.text, date: formatDate(row.date), status: row.status, amount: 0, extra: `${row.attachments} attachment${row.attachments === 1 ? "" : "s"} · ${row.phone}` })));
  module("stock", "Stock ledger", "Yard inventory movements; direct-to-site deliveries are excluded.", materials.map((row) => ({ id: row.id, reference: row.id, entity: row.name, detail: `${row.category} · ${row.unit}`, date: "09 Nov 2026", status: row.stock > 0 ? "In stock" : "No stock", amount: row.stock * row.purchaseRate, quantity: row.stock, extra: `${row.stock} ${row.unit} on hand` })));
  module("reconciliation", "Bill reconciliation", "Compare bills against recorded trips. Source records are never changed automatically.", bills.map((row) => ({ id: row.id, reference: row.ref, entity: row.party, detail: `${row.kind} · ${row.trips} trips · ${row.reason}`, date: formatDate(row.date), status: row.status, amount: row.amount, extra: `${row.paid > 0 ? `${Math.round((row.paid / row.amount) * 100)}% paid` : "Unpaid"} · ${row.reason}` })));
  module("bills/provider", "Provider bills", "Supplier invoices, settlements and reconciliation status.", bills.filter((row) => row.kind === "Provider bill").map((row) => ({ id: row.id, reference: row.ref, entity: row.party, detail: `${row.trips} linked deliveries`, date: formatDate(row.date), status: row.status, amount: row.amount, extra: `${row.amount - row.paid} outstanding` })));
  module("bills/transporter", "Transporter bills", "Haulage charges and trip-by-trip verification.", bills.filter((row) => row.kind === "Transporter bill").map((row) => ({ id: row.id, reference: row.ref, entity: row.party, detail: `${row.trips} trips · ${row.reason}`, date: formatDate(row.date), status: row.status, amount: row.amount, extra: `${row.amount - row.paid} outstanding` })));
  module("invoices", "Customer invoices", "GST invoices prepared from confirmed site deliveries.", invoices.map((row) => ({ id: row.id, reference: row.ref, entity: customerName(row.customerId), detail: `${orders.find((o) => o.id === row.orderId)?.ref ?? "Order"} · ${row.tax}`, date: formatDate(row.date), status: row.status, amount: row.amount, extra: `${row.amount - row.paid} outstanding` })));
  module("payments", "Payments", "Incoming customer receipts and supplier settlements.", payments.map((row) => ({ id: row.id, reference: row.ref, entity: row.party, detail: `${row.direction} · ${row.mode} · ${row.linked}`, date: formatDate(row.date), status: row.direction, amount: row.amount, extra: row.linked })));
  module("expenses", "Expenses", "Trip and operating costs with an auditable reference.", expenses.map((row) => ({ id: row.id, reference: row.id, entity: row.category, detail: row.note, date: formatDate(row.date), status: "Recorded", amount: row.amount, extra: row.linked })));
  module("profit", "Profit & loss", "Estimated operating margin; cash received is not profit.", orders.map((row) => ({ id: row.id, reference: row.ref, entity: customerName(row.customerId), detail: `${materialName(row.materialId)} · ${row.delivered} MT delivered`, date: formatDate(row.expected), status: row.status === "Delivered" ? "Final settled" : "Estimated", amount: row.profit, quantity: row.delivered, extra: `Sales ${((row.delivered * row.rate) / 1000).toLocaleString("en-IN")}k · landed costs pending` })));
  module("customers", "Customers", "Construction companies and their active sites.", customers.map((row) => ({ id: row.id, reference: row.id, entity: row.name, detail: `${row.kind} · ${row.site}`, date: row.city, status: row.outstanding > 0 ? "Active" : "Clear", amount: row.outstanding, extra: `${row.city} · ${row.phone}` })));
  module("providers", "Material providers", "Supplier relationships, material categories and payables.", providers.map((row) => ({ id: row.id, reference: row.id, entity: row.name, detail: row.materials.join(" · "), date: row.city, status: "Active", amount: row.payable, extra: `${row.rating.toFixed(1)} rating · ${row.city}` })));
  module("transporters", "Transporters", "Haulage partners, active fleets and outstanding bills.", transporters.map((row) => ({ id: row.id, reference: row.id, entity: row.name, detail: `${row.vehicles} vehicles · ${row.ratePerTrip.toLocaleString("en-IN")} per trip`, date: row.city, status: "Active", amount: row.payable, extra: row.city })));
  module("vehicles", "Vehicles & drivers", "Assigned drivers and recurring delivery variance monitoring.", vehicles.map((row) => ({ id: row.id, reference: row.plate, entity: row.driver, detail: transportName(row.transporterId), date: row.phone, status: row.shortageCount > 2 ? "Recurring difference" : "Active", amount: row.shortageCount, quantity: row.trips, extra: `${row.trips} trips · ${row.shortageCount} checks` })));
  module("materials", "Materials", "Configurable trade materials and unit-specific rates.", materials.map((row) => ({ id: row.id, reference: row.id, entity: row.name, detail: `${row.category} · ${row.unit}`, date: "Rate history", status: "Active", amount: row.sellingRate, quantity: row.stock, extra: `${row.stock} ${row.unit} · buy ${row.purchaseRate.toLocaleString("en-IN")}` })));
  module("reports", "Reports", "Operational and financial views built from the current demo records.", ["Daily operations", "Monthly performance", "Customer-wise sales", "Material-wise margin", "Provider purchases", "Transporter expense", "Vehicle trips", "Delivery shortages", "Pending bills", "Customer outstanding", "Provider & transporter payables", "Operating expenses", "Order-wise P&L", "Monthly P&L"].map((title, i) => ({ id: `RPT-${i + 1}`, reference: `0${i + 1}`, entity: title, detail: "Last 30 days · All sites", date: "Updated just now", status: "Ready", amount: [4_86_200, 3_24_800, 1_82_500, 92_600][i % 4]!, extra: "Open report" })));
  module("employees", "Employees & permissions", "Manage the demo team's record access and responsibilities.", employeeRecords.map((row) => ({ id: row.id, reference: row.id, entity: row.name, detail: `${row.role} · ${row.permissions.length} permissions`, date: row.email, status: "Active", amount: 0, extra: row.permissions.join(", ") })));
  module("audit", "Audit history", "Read-only history of changes, reviews and system matching.", auditEvents.map((row, i) => ({ id: `AUD-${i + 1}`, reference: row.action, entity: row.user, detail: `${row.entity} · ${row.change}`, date: row.date, status: "Logged", amount: 0, extra: row.change })));
  module("settings", "Settings", "Business profile, verification thresholds and alert preferences.", [
    { id: "SET-01", reference: "Business", entity: "Meridian Materials & Supply", detail: "Pune, Maharashtra · GSTIN 27AABCM1234K1ZQ", date: "Business profile", status: "Configured", amount: 0, extra: "Update business details" },
    { id: "SET-02", reference: "GST", entity: "CGST + SGST", detail: "18% standard rate · 9% + 9%", date: "Tax settings", status: "Configured", amount: 18, extra: "Change GST treatment" },
    { id: "SET-03", reference: "Shortage tolerance", entity: "0.50 MT · most bulk aggregates", detail: "Material-specific thresholds can be applied.", date: "Trip verification", status: "Configured", amount: 0.5, extra: "Calibrated by material" },
    { id: "SET-04", reference: "Auto-processing threshold", entity: "85% confidence", detail: "Lower-confidence slips require a review.", date: "Automation", status: "Configured", amount: 85, extra: "Review queue threshold" },
    { id: "SET-05", reference: "Authoritative weight", entity: "Delivery weighbridge", detail: "Compares delivery against loading slips.", date: "Verification", status: "Configured", amount: 0, extra: "Weight setting" },
    { id: "SET-06", reference: "WhatsApp connection", entity: "Connected · display only", detail: "Inbound feed is simulated for this demo.", date: "Automation", status: "Connected", amount: 0, extra: "Display only" },
    { id: "SET-07", reference: "Backup status", entity: "Demo records available", detail: "Data is not connected to a persistent service.", date: "System", status: "Ready", amount: 0, extra: "Mock data" },
  ]);
  return { customers, providers, transporters, vehicles, materials, orders, purchases, trips, documents, bills, invoices, payments, expenses, whatsappMessages, auditEvents, employeeRecords, monthlyTrend, automationTrend, modules };
}
