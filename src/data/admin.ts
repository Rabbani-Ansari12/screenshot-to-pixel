import type { AppSettings, AuditEvent, Employee } from "@/types";
import { ALL_PERMISSIONS } from "@/lib/permissions";
import { documents, reviewItems } from "./documents";
import { bills, invoices, payments } from "./finance";
import { orders, trips } from "./operations";
import { TODAY, addDays, at, createRng, pad } from "./utils";

const rng = createRng(3141);

export const employees: Employee[] = [
  {
    id: "EMP-001",
    name: "Aarav Mehta",
    email: "aarav@meridiansupply.in",
    phone: "+91 98220 10001",
    designation: "Owner",
    role: "Owner",
    active: true,
    permissions: [...ALL_PERMISSIONS],
    lastActiveAt: at(TODAY, 9, 52),
    joinedAt: "2019-04-01",
  },
  {
    id: "EMP-002",
    name: "Neha Kulkarni",
    email: "neha@meridiansupply.in",
    phone: "+91 98220 10002",
    designation: "Operations Manager",
    role: "Employee",
    active: true,
    permissions: [
      "view_records",
      "manage_orders",
      "review_documents",
      "manage_trips",
      "correct_extracted",
    ],
    lastActiveAt: at(TODAY, 9, 31),
    joinedAt: "2021-06-14",
  },
  {
    id: "EMP-003",
    name: "Rohit Deshmukh",
    email: "rohit@meridiansupply.in",
    phone: "+91 98220 10003",
    designation: "Accountant",
    role: "Employee",
    active: true,
    permissions: ["view_records", "verify_bills", "record_payments", "view_financial_reports"],
    lastActiveAt: at(TODAY, 8, 47),
    joinedAt: "2022-01-10",
  },
  {
    id: "EMP-004",
    name: "Priya Nair",
    email: "priya@meridiansupply.in",
    phone: "+91 98220 10004",
    designation: "Dispatch Coordinator",
    role: "Employee",
    active: true,
    permissions: ["view_records", "manage_orders", "manage_trips"],
    lastActiveAt: at(addDays(TODAY, -1), 18, 12),
    joinedAt: "2023-03-20",
  },
  {
    id: "EMP-005",
    name: "Sameer Joshi",
    email: "sameer@meridiansupply.in",
    phone: "+91 98220 10005",
    designation: "Document Reviewer",
    role: "Employee",
    active: true,
    permissions: ["view_records", "review_documents", "correct_extracted"],
    lastActiveAt: at(TODAY, 10, 4),
    joinedAt: "2024-08-05",
  },
  {
    id: "EMP-006",
    name: "Kavita Rao",
    email: "kavita@meridiansupply.in",
    phone: "+91 98220 10006",
    designation: "Accounts Assistant",
    role: "Employee",
    active: false,
    permissions: ["view_records", "record_payments"],
    lastActiveAt: "2026-08-29T17:40:00+05:30",
    joinedAt: "2023-11-01",
  },
];

const events: Omit<AuditEvent, "id">[] = [];
documents
  .filter((d) => d.status === "Automatically Recorded" && d.link)
  .slice(0, 18)
  .forEach((d) => {
    events.push({
      at: d.timeline[3]?.at ?? d.receivedAt,
      userName: "System",
      action: "Auto-recorded",
      entityType: d.link?.type ?? "Trip",
      entityId: d.link?.id ?? "",
      entityLabel: d.link?.label ?? "",
      changes: d.fields
        .filter((x) => ["net", "slipNo", "total"].includes(x.key))
        .map((x) => ({ field: x.label, from: "—", to: x.value })),
      note: `From ${d.type.toLowerCase()} ${d.id} (${d.confidence}% confidence)`,
    });
  });
documents
  .flatMap((d) => d.corrections.map((c) => ({ d, c })))
  .forEach(({ d, c }) => {
    events.push({
      at: c.at,
      userName: c.by,
      action: "Corrected",
      entityType: "Document",
      entityId: d.id,
      entityLabel: `${d.id} · ${d.type}`,
      changes: [{ field: c.field, from: c.from, to: c.to }],
      note: c.reason,
    });
  });
payments.slice(-12).forEach((p) => {
  events.push({
    at: at(p.date, rng.int(10, 18), rng.int(0, 59)),
    userName: p.recordedBy,
    action: "Recorded",
    entityType: "Payment",
    entityId: p.id,
    entityLabel: `${p.id} · ${p.direction}`,
    changes: [
      { field: "Amount", from: "—", to: `₹${p.amount.toLocaleString("en-IN")}` },
      { field: "Mode", from: "—", to: p.mode },
    ],
    note: "",
  });
});
orders.slice(-8).forEach((o) => {
  events.push({
    at: at(o.orderDate, rng.int(10, 17), rng.int(0, 59)),
    userName: o.createdBy,
    action: "Created",
    entityType: "Order",
    entityId: o.id,
    entityLabel: o.ref,
    changes: [{ field: "Status", from: "—", to: o.status === "Draft" ? "Draft" : "Confirmed" }],
    note: "",
  });
});
const edited = orders[16];
if (edited)
  events.push({
    at: at("2026-10-12", 15, 32),
    userName: "Aarav Mehta",
    action: "Updated",
    entityType: "Order",
    entityId: edited.id,
    entityLabel: edited.ref,
    changes: [
      { field: "Required quantity (River Sand)", from: "165 MT", to: "200 MT" },
      { field: "Expected delivery", from: "28 Oct 2026", to: "03 Nov 2026" },
    ],
    note: "Customer increased quantity by phone; PO revision to follow.",
  });
bills
  .filter((b) => b.reconStatus !== "Matched" && b.reconStatus !== "Unreconciled")
  .slice(-8)
  .forEach((b) => {
    events.push({
      at: at(addDays(b.date, 2), rng.int(11, 18), rng.int(0, 59)),
      userName: b.reconStatus === "Difference Approved" ? "Aarav Mehta" : "Rohit Deshmukh",
      action:
        b.reconStatus === "Disputed"
          ? "Disputed"
          : b.reconStatus === "Difference Approved"
            ? "Approved"
            : "Reconciled",
      entityType: b.kind === "Provider" ? "Provider Bill" : "Transporter Bill",
      entityId: b.id,
      entityLabel: b.billNo,
      changes: [{ field: "Reconciliation status", from: "Unreconciled", to: b.reconStatus }],
      note: b.reconNote,
    });
  });
trips
  .filter((t) => t.investigation && t.investigation.outcome !== "Under investigation")
  .slice(-6)
  .forEach((t) => {
    events.push({
      at: t.investigation?.at ?? t.loading.at,
      userName: t.investigation?.by ?? "Neha Kulkarni",
      action: "Updated",
      entityType: "Trip",
      entityId: t.id,
      entityLabel: t.id,
      changes: [
        {
          field: "Shortage outcome",
          from: "Needs verification",
          to: t.investigation?.outcome ?? "",
        },
      ],
      note: t.investigation?.notes ?? "",
    });
  });
invoices.slice(-5).forEach((inv) => {
  events.push({
    at: at(inv.date, 11, rng.int(0, 59)),
    userName: "Rohit Deshmukh",
    action: "Created",
    entityType: "Invoice",
    entityId: inv.id,
    entityLabel: inv.number,
    changes: [{ field: "Status", from: "—", to: "Issued" }],
    note: inv.flags.length ? `Flags: ${inv.flags.join(", ")}` : "",
  });
});
reviewItems.slice(0, 3).forEach((r) => {
  events.push({
    at: r.createdAt,
    userName: "System",
    action: "Matched",
    entityType: "Review Item",
    entityId: r.id,
    entityLabel: r.id,
    changes: [{ field: "Queue", from: "—", to: r.reason }],
    note: r.summary,
  });
});
events.push(
  {
    at: at("2026-10-28", 12, 14),
    userName: "Aarav Mehta",
    action: "Permission changed",
    entityType: "Employee",
    entityId: "EMP-005",
    entityLabel: "Sameer Joshi",
    changes: [{ field: "Correct extracted info", from: "Off", to: "On" }],
    note: "",
  },
  {
    at: at("2026-08-30", 10, 2),
    userName: "Aarav Mehta",
    action: "Deactivated",
    entityType: "Employee",
    entityId: "EMP-006",
    entityLabel: "Kavita Rao",
    changes: [{ field: "Status", from: "Active", to: "Inactive" }],
    note: "Left the company.",
  },
  {
    at: at("2026-10-01", 9, 0),
    userName: "Aarav Mehta",
    action: "Updated",
    entityType: "Settings",
    entityId: "SETTINGS",
    entityLabel: "Auto-processing threshold",
    changes: [{ field: "Confidence threshold", from: "90%", to: "85%" }],
    note: "WhatsApp automation go-live.",
  },
);

export const auditEvents: AuditEvent[] = events
  .sort((a, b) => b.at.localeCompare(a.at))
  .map((e, i, all) => ({ ...e, id: `AUD-${pad(all.length - i, 5)}` }));

export const settings: AppSettings = {
  business: {
    name: "Meridian Supply",
    legalName: "Meridian Materials & Supply Pvt Ltd",
    address: "Gat 214, Hadapsar Industrial Estate, Pune, Maharashtra 411013",
    phone: "+91 20 2681 4400",
    email: "accounts@meridiansupply.in",
  },
  gst: {
    gstin: "27AABCM1234K1ZQ",
    pan: "AABCM1234K",
    stateCode: "27 · Maharashtra",
    defaultMode: "CGST+SGST",
    defaultRate: 5,
  },
  invoiceNumbering: {
    prefix: "INV",
    format: "{PREFIX}-{YYYY}-{SEQ:4}",
    nextNumber: 301 + invoices.length,
  },
  autoProcessThreshold: 85,
  authoritativeWeight: "Delivery",
  enabledUnits: ["MT", "Brass", "Trips", "CFT", "m³"],
  ai: {
    dailyCallCap: 300,
    callsToday: 0,
    netWeightTolerance: 0.02,
    matchThreshold: 70,
    matchMargin: 15,
    matchWindowHours: 72,
  },
  notifications: {
    reviewQueue: true,
    shortages: true,
    billMismatch: true,
    overduePayments: true,
    failedDocuments: true,
    dailySummary: false,
  },
  backup: {
    lastBackupAt: at(TODAY, 2, 0),
    destination: "Encrypted email backup · daily 2:00 AM",
    status: "Healthy",
    sizeMb: 48.6,
  },
};
