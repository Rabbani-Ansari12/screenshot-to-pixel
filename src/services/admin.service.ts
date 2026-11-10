import type { AppNotification, AppSettings, AuditEvent, Employee, Permission } from "@/types";
import { permissionLabel } from "@/lib/permissions";
import { DEMO_TODAY } from "@/lib/format";
import { NotFoundError, clone, db, delay, logAudit, nextId } from "./core";
import { toBillView, toInvoiceView } from "./views";

// TODO(backend): supabase.from("employees").select("*") — permissions live in a role_permissions table.
export async function listEmployees(): Promise<Employee[]> {
  await delay(150);
  return clone(db.employees);
}

export async function createEmployee(
  input: Pick<Employee, "name" | "email" | "phone" | "designation" | "permissions">,
): Promise<Employee> {
  await delay(400);
  const employee: Employee = {
    ...input,
    id: nextId("EMP-", db.employees, 3),
    role: "Employee",
    active: true,
    lastActiveAt: "",
    joinedAt: DEMO_TODAY,
  };
  db.employees.push(employee);
  logAudit({
    action: "Created",
    entityType: "Employee",
    entityId: employee.id,
    entityLabel: employee.name,
    changes: [
      { field: "Permissions", from: "—", to: input.permissions.map(permissionLabel).join(", ") },
    ],
  });
  return clone(employee);
}

export async function setEmployeeActive(id: string, active: boolean): Promise<Employee> {
  await delay(300);
  const e = db.employees.find((x) => x.id === id);
  if (!e) throw new NotFoundError(`Employee ${id}`);
  e.active = active;
  logAudit({
    action: active ? "Updated" : "Deactivated",
    entityType: "Employee",
    entityId: id,
    entityLabel: e.name,
    changes: [
      { field: "Status", from: active ? "Inactive" : "Active", to: active ? "Active" : "Inactive" },
    ],
  });
  return clone(e);
}

export async function setPermission(
  id: string,
  permission: Permission,
  enabled: boolean,
): Promise<Employee> {
  await delay(200);
  const e = db.employees.find((x) => x.id === id);
  if (!e) throw new NotFoundError(`Employee ${id}`);
  e.permissions = enabled
    ? [...new Set([...e.permissions, permission])]
    : e.permissions.filter((p) => p !== permission);
  logAudit({
    action: "Permission changed",
    entityType: "Employee",
    entityId: id,
    entityLabel: e.name,
    changes: [
      {
        field: permissionLabel(permission),
        from: enabled ? "Off" : "On",
        to: enabled ? "On" : "Off",
      },
    ],
  });
  return clone(e);
}

// TODO(backend): supabase.from("audit_log").select("*").order("at", { ascending: false }) — read-only, no update/delete policy.
export async function listAuditEvents(): Promise<AuditEvent[]> {
  await delay();
  return clone(db.auditEvents);
}

export async function getSettings(): Promise<AppSettings> {
  await delay(150);
  return clone(db.settings);
}

export async function updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  await delay(400);
  const before = clone(db.settings);
  Object.assign(db.settings, patch);
  const changes = (Object.keys(patch) as (keyof AppSettings)[]).map((k) => ({
    field: k,
    from: JSON.stringify(before[k]).slice(0, 60),
    to: JSON.stringify(db.settings[k]).slice(0, 60),
  }));
  logAudit({
    action: "Updated",
    entityType: "Settings",
    entityId: "SETTINGS",
    entityLabel: "Settings",
    changes,
  });
  return clone(db.settings);
}

/** Exceptions only — never routine events. */
export async function listNotifications(): Promise<AppNotification[]> {
  await delay(150);
  const n: AppNotification[] = [];
  db.reviewItems
    .filter((r) => r.status === "Open")
    .forEach((r) =>
      n.push({
        id: `N-${r.id}`,
        at: r.createdAt,
        title: r.title,
        detail: `${r.reason} · ${r.id}`,
        href: `/review/${r.id}`,
        severity: r.priority === "High" ? "danger" : "warning",
        read: false,
      }),
    );
  db.trips
    .filter((t) => t.status === "Needs Verification")
    .slice(-4)
    .forEach((t) =>
      n.push({
        id: `N-${t.id}`,
        at: t.delivery?.at ?? t.loading.at,
        title: "Delivery difference above tolerance",
        detail: `${t.id} needs verification`,
        href: `/shortages`,
        severity: "warning",
        read: false,
      }),
    );
  db.bills
    .map(toBillView)
    .filter((b) => b.reconStatus === "Mismatch")
    .forEach((b) =>
      n.push({
        id: `N-${b.id}`,
        at: `${b.date}T12:00:00+05:30`,
        title: `${b.partyName} bill mismatch`,
        detail: `${b.billNo} differs by ₹${Math.abs(b.difference).toLocaleString("en-IN")}`,
        href: `/reconciliation/${b.id}`,
        severity: "danger",
        read: false,
      }),
    );
  db.documents
    .filter((d) => d.status === "Failed")
    .forEach((d) =>
      n.push({
        id: `N-${d.id}`,
        at: d.receivedAt,
        title: "Document could not be read",
        detail: `${d.id} · ${d.senderName}`,
        href: `/documents/${d.id}`,
        severity: "danger",
        read: true,
      }),
    );
  db.invoices
    .map(toInvoiceView)
    .filter((i) => i.overdueDays > 20)
    .slice(0, 3)
    .forEach((i) =>
      n.push({
        id: `N-${i.id}`,
        at: `${i.dueDate}T09:00:00+05:30`,
        title: `Invoice overdue ${i.overdueDays} days`,
        detail: `${i.number} · ${i.customerName}`,
        href: `/invoices/${i.id}`,
        severity: "warning",
        read: true,
      }),
    );
  return clone(n.sort((a, b) => b.at.localeCompare(a.at)));
}
