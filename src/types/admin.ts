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
  /** Database table, operation and the full row before / after (for the diff view). */
  table?: string;
  operation?: "INSERT" | "UPDATE" | "DELETE";
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

export interface AppSettings {
  business: {
    name: string;
    legalName: string;
    address: string;
    phone: string;
    email: string;
    /** Printed on invoices, e.g. "HDFC Bank · A/c … · IFSC …". */
    bankDetails: string;
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
  /** How payments are applied and checked. */
  payments: {
    /** "selected": against the chosen invoice / bill; "oldest_first": spread over open ones. */
    allocation: "selected" | "oldest_first";
    /** Allow amounts above the outstanding balance (kept on account as an advance). */
    allowOverpayment: boolean;
    /** Bill / invoice differences up to this many rupees still count as matched. */
    billTolerance: number;
  };
  autoProcessThreshold: number;
  authoritativeWeight: "Loading" | "Delivery";
  enabledUnits: string[];
  /** Driver upload links (no login). */
  driverLinks: {
    expiryHours: number;
    maxUploads: number;
    allowedDocTypes: string[];
    rateLimitPerIp: number;
  };
  /** Daily e-mail digest of exceptions (Resend). Off by default. */
  emailDigest: boolean;
  /** AI document reading: cost cap and matching thresholds. */
  ai: {
    dailyCallCap: number;
    callsToday: number;
    /** MT; printed net vs gross − tare. */
    netWeightTolerance: number;
    /** 0–100 */
    matchThreshold: number;
    /** 0–100 */
    matchMargin: number;
    matchWindowHours: number;
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
