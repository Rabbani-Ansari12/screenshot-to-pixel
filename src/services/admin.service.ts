/**
 * Employees (through the owner-only `admin-manage-employee` Edge Function), audit history,
 * app settings and exception notifications — all from Supabase.
 */
import type {
  AppNotification,
  AppSettings,
  AuditAction,
  AuditChange,
  AuditEvent,
  Employee,
  Permission,
} from "@/types";
import type { Json, Tables } from "@/lib/supabase";
import { AppError, check, rows, toAppError, unwrapMaybe } from "./supabase/errors";
import { sb } from "./supabase/fetch";
import { todayIST } from "@/lib/format";
import { unitFromDb, unitToDb } from "./supabase/mappers";

// ---------- Employees ----------
type SignInMethod = "invite" | "temp_password" | "magic_link";

async function callAdmin<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await sb().functions.invoke("admin-manage-employee", { body });
  if (error) {
    // FunctionsHttpError carries the JSON body with a readable message.
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      const payload = (await ctx.json().catch(() => null)) as { error?: string } | null;
      if (payload?.error)
        throw new AppError(payload.error, null, ctx.status === 403 ? "forbidden" : "invalid");
    }
    throw toAppError(error);
  }
  return data as T;
}

export async function listEmployees(): Promise<Employee[]> {
  const { employees } = await callAdmin<{ employees: Employee[] }>({ action: "list" });
  return employees;
}

async function employeeById(id: string): Promise<Employee> {
  const found = (await listEmployees()).find((e) => e.id === id);
  if (!found) throw new AppError("Employee not found.", null, "not_found");
  return found;
}

export async function createEmployee(
  input: Pick<Employee, "name" | "email" | "phone" | "designation" | "permissions"> & {
    method?: SignInMethod;
    password?: string;
  },
): Promise<Employee> {
  const { id } = await callAdmin<{ id: string }>({
    action: "create",
    ...input,
    method: input.method ?? "invite",
  });
  return employeeById(id);
}

export async function setEmployeeActive(id: string, active: boolean): Promise<Employee> {
  await callAdmin({ action: "set_active", profileId: id, active });
  return employeeById(id);
}

export async function setPermission(
  id: string,
  permission: Permission,
  enabled: boolean,
): Promise<Employee> {
  const current = await employeeById(id);
  const permissions = enabled
    ? [...new Set([...current.permissions, permission])]
    : current.permissions.filter((p) => p !== permission);
  await callAdmin({ action: "set_permissions", profileId: id, permissions });
  return { ...current, permissions };
}

export async function resetEmployeePassword(
  id: string,
  method: "email" | "temp_password",
  password?: string,
): Promise<{ method: "email" | "temp_password" }> {
  return callAdmin({ action: "reset_password", profileId: id, method, password });
}

// ---------- Audit history ----------
const TABLE_LABEL: Record<string, string> = {
  customer_orders: "Order",
  order_items: "Order item",
  purchases: "Purchase",
  purchase_items: "Purchase item",
  truck_trips: "Trip",
  weight_records: "Weight record",
  delivery_records: "Delivery",
  stock_movements: "Stock",
  stock_locations: "Yard",
  customers: "Customer",
  construction_sites: "Site",
  materials: "Material",
  material_rates: "Material rate",
  material_providers: "Provider",
  provider_materials: "Provider material",
  transporters: "Transporter",
  drivers: "Driver",
  vehicles: "Vehicle",
  user_permissions: "Permission",
  profiles: "User",
  employees: "Employee",
  app_settings: "Settings",
  documents: "Document",
  ai_processing_records: "AI reading",
  provider_bills: "Provider bill",
  provider_bill_items: "Provider bill line",
  transporter_bills: "Transporter bill",
  transporter_bill_trips: "Transporter bill trip",
  reconciliation_records: "Reconciliation",
  customer_invoices: "Invoice",
  invoice_items: "Invoice item",
  payments: "Payment",
  expenses: "Expense",
};
const IGNORED = new Set([
  "updated_at",
  "updated_by",
  "created_at",
  "created_by",
  "business_id",
  "id",
]);
const LABEL_KEYS = [
  "trip_code",
  "order_code",
  "purchase_code",
  "payment_code",
  "invoice_number",
  "bill_number",
  "vehicle_number",
  "name",
  "full_name",
  "permission",
  "slip_number",
];

const humanize = (k: string) =>
  k
    .replace(/_id$/, "")
    .replace(/_/g, " ")
    .replace(/^./, (c) => c.toUpperCase());
const show = (v: unknown) =>
  v === null || v === undefined
    ? "—"
    : typeof v === "object"
      ? JSON.stringify(v).slice(0, 60)
      : String(v);

type AuditRow = Tables<"audit_logs">;
const obj = (j: Json | null) =>
  j && typeof j === "object" && !Array.isArray(j) ? (j as Record<string, Json>) : {};

export function toAuditEvent(r: AuditRow, names: Map<string, string>): AuditEvent {
  const before = obj(r.old_data);
  const after = obj(r.new_data);
  const data = Object.keys(after).length ? after : before;
  const changes: AuditChange[] =
    r.action === "UPDATE"
      ? Object.keys(after)
          .filter((k) => !IGNORED.has(k) && JSON.stringify(before[k]) !== JSON.stringify(after[k]))
          .map((k) => ({ field: humanize(k), from: show(before[k]), to: show(after[k]) }))
      : [];
  let action: AuditAction;
  if (r.table_name === "user_permissions") action = "Permission changed";
  else if (r.action === "INSERT") action = "Created";
  else if (r.action === "DELETE") action = "Deleted";
  else if (r.reason) action = "Corrected";
  else if ("is_active" in after && after["is_active"] === false && before["is_active"] === true)
    action = "Deactivated";
  else action = "Updated";
  const label = LABEL_KEYS.map((k) => data[k]).find((v) => typeof v === "string" && v) as
    string | undefined;
  return {
    id: r.id,
    at: r.changed_at,
    userName: r.changed_by ? (names.get(r.changed_by) ?? "Former user") : "System",
    action,
    entityType: TABLE_LABEL[r.table_name] ?? humanize(r.table_name),
    entityId: r.record_id ?? "",
    entityLabel: label ?? TABLE_LABEL[r.table_name] ?? r.table_name,
    changes:
      r.table_name === "user_permissions"
        ? [
            {
              field: humanize(String(data["permission"] ?? "permission")),
              from: r.action === "INSERT" ? "Off" : "On",
              to: r.action === "INSERT" ? "On" : "Off",
            },
          ]
        : changes,
    note: r.reason ?? "",
    ...(r.reason ? { reason: r.reason } : {}),
  };
}

async function profileNames(): Promise<Map<string, string>> {
  const list = rows(await sb().from("profiles").select("id, full_name, email"));
  return new Map(list.map((p) => [p.id, p.full_name || p.email || "User"]));
}

/** Latest 1000 changes (owner only — RLS returns nothing for employees). */
export async function listAuditEvents(): Promise<AuditEvent[]> {
  const [logs, names] = await Promise.all([
    sb().from("audit_logs").select("*").order("changed_at", { ascending: false }).limit(1000),
    profileNames(),
  ]);
  return rows(logs).map((r) => toAuditEvent(r, names));
}

/** Audit entries for specific records (detail page activity panels). */
export async function listEntityAudit(recordIds: string[], limit = 25): Promise<AuditEvent[]> {
  const ids = recordIds.filter(Boolean);
  if (!ids.length) return [];
  const [logs, names] = await Promise.all([
    sb()
      .from("audit_logs")
      .select("*")
      .in("record_id", ids)
      .order("changed_at", { ascending: false })
      .limit(limit),
    profileNames(),
  ]);
  return rows(logs).map((r) => toAuditEvent(r, names));
}

// ---------- Settings ----------
type SettingsRow = Tables<"app_settings">;

const formatFor = (width: number) => `{PREFIX}-{YYYY}-{SEQ:${width}}`;
const widthOf = (format: string) => {
  const m = /\{SEQ:(\d)\}/.exec(format);
  return m ? Math.min(8, Math.max(3, Number(m[1]))) : 4;
};

export function toAppSettings(
  row: SettingsRow,
  business: Tables<"businesses"> | null,
  callsToday = 0,
): AppSettings {
  const gst = obj(row.gst_config);
  const profile = obj(row.business_profile);
  const notif = obj(row.notification_preferences);
  const flag = (k: string, d: boolean) =>
    typeof notif[k] === "boolean" ? (notif[k] as boolean) : d;
  return {
    business: {
      name: business?.name ?? "",
      legalName: business?.legal_name ?? "",
      address: String(profile["address"] ?? ""),
      phone: String(profile["phone"] ?? ""),
      email: String(profile["email"] ?? ""),
      bankDetails: String(profile["bank_details"] ?? ""),
    },
    gst: {
      gstin: String(gst["gstin"] ?? business?.gstin ?? ""),
      pan: String(gst["pan"] ?? ""),
      stateCode: String(gst["state_code"] ?? ""),
      defaultMode: gst["default_mode"] === "igst" ? "IGST" : "CGST+SGST",
      defaultRate: Number(gst["default_rate"] ?? 5),
    },
    invoiceNumbering: {
      prefix: row.invoice_prefix,
      format: formatFor(row.invoice_number_width),
      nextNumber: row.next_invoice_number,
    },
    payments: {
      allocation: row.payment_allocation === "oldest_first" ? "oldest_first" : "selected",
      allowOverpayment: row.allow_overpayment,
      billTolerance: Number(row.bill_amount_tolerance),
    },
    autoProcessThreshold: Math.round(Number(row.auto_process_confidence_threshold) * 100),
    authoritativeWeight: row.authoritative_weight === "loading" ? "Loading" : "Delivery",
    enabledUnits: row.enabled_units.map(unitFromDb),
    driverLinks: {
      expiryHours: row.upload_link_expiry_hours,
      maxUploads: row.upload_link_max_uploads,
      allowedDocTypes: row.upload_link_doc_types,
      rateLimitPerIp: row.upload_rate_limit_per_ip,
    },
    emailDigest: row.email_digest_enabled,
    ai: {
      dailyCallCap: row.ai_daily_call_cap,
      callsToday,
      netWeightTolerance: Number(row.net_weight_tolerance),
      matchThreshold: Math.round(Number(row.match_threshold) * 100),
      matchMargin: Math.round(Number(row.match_margin) * 100),
      matchWindowHours: row.match_window_hours,
    },
    notifications: {
      reviewQueue: flag("review_queue", true),
      shortages: flag("shortages", true),
      billMismatch: flag("bill_mismatch", true),
      overduePayments: flag("overdue_payments", true),
      failedDocuments: flag("failed_documents", true),
      dailySummary: flag("daily_summary", false),
    },
    backup: {
      lastBackupAt: "",
      destination: "Supabase managed daily backups",
      status: "Healthy",
      sizeMb: 0,
    },
  };
}

async function settingsRow() {
  const row = unwrapMaybe(await sb().from("app_settings").select("*").maybeSingle());
  if (!row)
    throw new AppError("Settings are not set up yet. Run npm run create-owner.", null, "not_found");
  return row;
}

export async function getSettings(): Promise<AppSettings> {
  const [row, business, usage] = await Promise.all([
    settingsRow(),
    sb().from("businesses").select("*").maybeSingle(),
    sb().from("ai_usage_daily").select("calls").eq("day", todayIST()).maybeSingle(),
  ]);
  return toAppSettings(row, unwrapMaybe(business), unwrapMaybe(usage)?.calls ?? 0);
}

/** Owner only (RLS). Only the fields present in the patch are written. */
export async function updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const row = await settingsRow();
  const update: Partial<SettingsRow> = {};
  if (patch.invoiceNumbering) {
    update.invoice_prefix = patch.invoiceNumbering.prefix;
    update.next_invoice_number = patch.invoiceNumbering.nextNumber;
    update.invoice_number_width = widthOf(patch.invoiceNumbering.format);
  }
  if (patch.gst)
    update.gst_config = {
      gstin: patch.gst.gstin || null,
      pan: patch.gst.pan || null,
      state_code: patch.gst.stateCode,
      default_mode: patch.gst.defaultMode === "IGST" ? "igst" : "cgst_sgst",
      default_rate: patch.gst.defaultRate,
    };
  if (patch.business)
    update.business_profile = {
      ...obj(row.business_profile),
      address: patch.business.address,
      phone: patch.business.phone,
      email: patch.business.email,
      bank_details: patch.business.bankDetails,
    };
  if (patch.payments) {
    update.payment_allocation = patch.payments.allocation;
    update.allow_overpayment = patch.payments.allowOverpayment;
    update.bill_amount_tolerance = patch.payments.billTolerance;
  }
  if (patch.autoProcessThreshold !== undefined)
    update.auto_process_confidence_threshold = Math.round(patch.autoProcessThreshold) / 100;
  if (patch.authoritativeWeight)
    update.authoritative_weight = patch.authoritativeWeight === "Loading" ? "loading" : "delivery";
  if (patch.driverLinks) {
    update.upload_link_expiry_hours = Math.round(patch.driverLinks.expiryHours);
    update.upload_link_max_uploads = Math.round(patch.driverLinks.maxUploads);
    update.upload_link_doc_types = patch.driverLinks.allowedDocTypes;
    update.upload_rate_limit_per_ip = Math.round(patch.driverLinks.rateLimitPerIp);
  }
  if (patch.emailDigest !== undefined) update.email_digest_enabled = patch.emailDigest;
  if (patch.ai) {
    update.ai_daily_call_cap = Math.round(patch.ai.dailyCallCap);
    update.net_weight_tolerance = patch.ai.netWeightTolerance;
    update.match_threshold = patch.ai.matchThreshold / 100;
    update.match_margin = patch.ai.matchMargin / 100;
    update.match_window_hours = Math.round(patch.ai.matchWindowHours);
  }
  if (patch.enabledUnits)
    update.enabled_units = patch.enabledUnits.map((u) => unitToDb(u as never));
  if (patch.notifications)
    update.notification_preferences = {
      review_queue: patch.notifications.reviewQueue,
      shortages: patch.notifications.shortages,
      bill_mismatch: patch.notifications.billMismatch,
      overdue_payments: patch.notifications.overduePayments,
      failed_documents: patch.notifications.failedDocuments,
      daily_summary: patch.notifications.dailySummary,
    };
  if (Object.keys(update).length)
    check(await sb().from("app_settings").update(update).eq("id", row.id).select("id").single());
  if (patch.business || patch.gst) {
    const businessPatch: Partial<Tables<"businesses">> = {};
    if (patch.business) {
      businessPatch.name = patch.business.name;
      businessPatch.legal_name = patch.business.legalName || null;
    }
    if (patch.gst) businessPatch.gstin = patch.gst.gstin || null;
    check(
      await sb()
        .from("businesses")
        .update(businessPatch)
        .eq("id", row.business_id)
        .select("id")
        .single(),
    );
  }
  return getSettings();
}

// ---------- Notifications (exceptions only) ----------
/** Exceptions for the signed-in user (RLS filters by permission). */
export async function listNotifications(): Promise<AppNotification[]> {
  const [{ data: session }, list] = await Promise.all([
    sb().auth.getSession(),
    sb().from("notifications").select("*").order("updated_at", { ascending: false }).limit(50),
  ]);
  const uid = session.session?.user.id ?? "";
  return rows(list).map((n) => ({
    id: n.id,
    at: n.updated_at,
    title: n.title,
    detail: n.detail ?? "",
    href: n.href ?? "/",
    severity: n.severity === "danger" ? "danger" : n.severity === "info" ? "info" : "warning",
    read: n.read_by.includes(uid),
  }));
}

export async function markNotificationsRead(ids: string[]): Promise<void> {
  if (ids.length) check(await sb().rpc("mark_notifications_read", { p_ids: ids }));
}
