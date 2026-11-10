/**
 * In-memory "database" for the demo. Every service reads and writes through
 * this module so swapping to Supabase only touches src/services/*.
 *
 * TODO(backend): replace `db` reads/writes with Supabase queries
 * (e.g. supabase.from("trips").select(...)). Keep function signatures.
 */
import * as masters from "@/data/masters";
import * as ops from "@/data/operations";
import * as fin from "@/data/finance";
import * as docs from "@/data/documents";
import * as admin from "@/data/admin";
import type { AuditChange, AuditEvent } from "@/types";
import { DEMO_NOW } from "@/lib/format";

export const db = {
  materials: masters.materials,
  customers: masters.customers,
  sites: masters.sites,
  providers: masters.providers,
  transporters: masters.transporters,
  drivers: masters.drivers,
  vehicles: masters.vehicles,
  yards: masters.yards,
  orders: ops.orders,
  purchases: ops.purchases,
  trips: ops.trips,
  stockMovements: ops.stockMovements,
  bills: fin.bills,
  invoices: fin.invoices,
  payments: fin.payments,
  expenses: fin.expenses,
  documents: docs.documents,
  reviewItems: docs.reviewItems,
  employees: admin.employees,
  auditEvents: admin.auditEvents,
  settings: admin.settings,
};

/** Simulated network latency so loading states are visible. */
export function delay(ms = 220 + Math.round(Math.random() * 260)) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/** Deep-ish copy so React Query consumers never mutate the store. */
export function clone<T>(value: T): T {
  return structuredClone(value);
}

let currentUser = "Aarav Mehta";
export function setActingUser(name: string) {
  currentUser = name;
}
export function actingUser() {
  return currentUser;
}

export function nowIso() {
  // Demo clock: anchored date, real wall-clock minutes so new records sort on top.
  const d = new Date();
  return `${DEMO_NOW.slice(0, 10)}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:00+05:30`;
}

export function logAudit(entry: {
  action: AuditEvent["action"];
  entityType: string;
  entityId: string;
  entityLabel: string;
  changes?: AuditChange[];
  note?: string;
}) {
  const id = `AUD-${String(db.auditEvents.length + 1).padStart(5, "0")}`;
  db.auditEvents.unshift({
    id,
    at: nowIso(),
    userName: currentUser,
    changes: [],
    note: "",
    ...entry,
  });
}

export function nextId(prefix: string, existing: { id: string }[], width = 4) {
  const max = existing.reduce((m, item) => {
    const n = Number(item.id.split("-").pop());
    return Number.isFinite(n) ? Math.max(m, n) : m;
  }, 0);
  return `${prefix}${String(max + 1).padStart(width, "0")}`;
}

export class NotFoundError extends Error {
  constructor(what: string) {
    super(`${what} not found`);
  }
}
