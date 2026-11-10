import type { ID, ISODate, Permission, Role } from "./common";

export interface Employee {
  id: ID;
  name: string;
  email: string;
  phone: string;
  designation: string;
  role: Role;
  active: boolean;
  permissions: Permission[];
  lastActiveAt: ISODate;
  joinedAt: ISODate;
}

export type AuditAction =
  | "Created"
  | "Updated"
  | "Corrected"
  | "Approved"
  | "Matched"
  | "Auto-recorded"
  | "Reconciled"
  | "Disputed"
  | "Recorded"
  | "Deactivated"
  | "Deleted"
  | "Permission changed";

export interface AuditChange {
  field: string;
  from: string;
  to: string;
}

export interface AuditEvent {
  id: ID;
  at: ISODate;
  userName: string;
  action: AuditAction;
  entityType: string;
  entityId: ID;
  entityLabel: string;
  changes: AuditChange[];
  note: string;
  /** Why the change was made (required for quantity / rate corrections). */
  reason?: string;
}

export interface AppSettings {
  business: {
    name: string;
    legalName: string;
    address: string;
    phone: string;
    email: string;
  };
  gst: {
    gstin: string;
    pan: string;
    stateCode: string;
    defaultMode: "CGST+SGST" | "IGST";
    defaultRate: number;
  };
  invoiceNumbering: {
    prefix: string;
    format: string;
    nextNumber: number;
  };
  autoProcessThreshold: number;
  authoritativeWeight: "Loading" | "Delivery";
  enabledUnits: string[];
  whatsapp: {
    connected: boolean;
    provider: string;
    number: string;
    lastMessageAt: ISODate;
  };
  notifications: {
    reviewQueue: boolean;
    shortages: boolean;
    billMismatch: boolean;
    overduePayments: boolean;
    failedDocuments: boolean;
    dailySummary: boolean;
  };
  backup: {
    lastBackupAt: ISODate;
    destination: string;
    status: "Healthy" | "Delayed";
    sizeMb: number;
  };
}

export interface AppNotification {
  id: ID;
  at: ISODate;
  title: string;
  detail: string;
  href: string;
  severity: "warning" | "danger" | "info";
  read: boolean;
}
