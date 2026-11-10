import type { Permission } from "@/types/common";

export const PERMISSION_INFO: { key: Permission; label: string; description: string }[] = [
  {
    key: "view_records",
    label: "View records",
    description: "See orders, trips, documents and masters.",
  },
  {
    key: "manage_orders",
    label: "Manage orders",
    description: "Create and edit customer orders and purchases.",
  },
  {
    key: "review_documents",
    label: "Review documents",
    description: "Work the review queue and document inbox.",
  },
  {
    key: "manage_trips",
    label: "Manage trips",
    description: "Create trips and record shortage outcomes.",
  },
  {
    key: "correct_extracted",
    label: "Correct extracted info",
    description: "Edit values read by AI from documents.",
  },
  {
    key: "verify_bills",
    label: "Verify bills",
    description: "Reconcile provider bills, transporter bills and invoices.",
  },
  {
    key: "record_payments",
    label: "Record payments",
    description: "Record payments, expenses and create invoices.",
  },
  {
    key: "view_financial_reports",
    label: "View financial reports",
    description: "See profit, reports and financial KPIs.",
  },
];

export const ALL_PERMISSIONS: Permission[] = PERMISSION_INFO.map((p) => p.key);

export const permissionLabel = (key: Permission) =>
  PERMISSION_INFO.find((p) => p.key === key)?.label ?? key;
