import type { AdditionalCost, ID, ISODate, PaymentMode, Unit } from "./common";

export type BillKind = "Provider" | "Transporter";

export type ReconStatus =
  | "Unreconciled"
  | "Matched"
  | "Mismatch"
  | "Disputed"
  | "Correction Requested"
  | "Difference Approved"
  | "Reconciled";

export interface BillLine {
  id: ID;
  /** Trip / challan reference exactly as printed on the bill. */
  billedRef: string;
  date: ISODate;
  vehicle: string;
  quantity: number;
  rate: number;
  amount: number;
  /** System trip this line was matched to, or null when unmatched. */
  tripId: ID | null;
}

export interface Bill {
  id: ID;
  billNo: string;
  kind: BillKind;
  partyId: ID;
  date: ISODate;
  dueDate: ISODate;
  documentId: ID | null;
  lines: BillLine[];
  /** Trips the system expects on this bill (same party, same period). */
  expectedTripIds: ID[];
  taxRate: number;
  reconStatus: ReconStatus;
  reconNote: string;
}

export type GstMode = "CGST+SGST" | "IGST" | "None";

export type InvoiceFlag =
  | "Excess quantity"
  | "Missing delivery records"
  | "Wrong rate"
  | "Duplicate invoice"
  | "Amount difference"
  | "Order mismatch";

export interface InvoiceLine {
  id: ID;
  materialId: ID;
  description: string;
  tripIds: ID[];
  quantity: number;
  unit: Unit;
  rate: number;
  gstRate: number;
}

export interface Invoice {
  id: ID;
  number: string;
  customerId: ID;
  orderId: ID;
  siteId: ID;
  date: ISODate;
  dueDate: ISODate;
  lines: InvoiceLine[];
  gstMode: GstMode;
  additionalCharges: AdditionalCost[];
  flags: InvoiceFlag[];
  reconStatus: ReconStatus;
  notes: string;
}

export type PaymentStatus = "Unpaid" | "Partial" | "Paid";
export type PartyType = "Customer" | "Provider" | "Transporter";
export type PaymentDirection = "Incoming" | "Outgoing";

export interface Payment {
  id: ID;
  ref: string;
  direction: PaymentDirection;
  partyType: PartyType;
  partyId: ID;
  againstType: "Invoice" | "Bill";
  againstId: ID;
  date: ISODate;
  amount: number;
  mode: PaymentMode;
  reference: string;
  notes: string;
  recordedBy: string;
}

export type ExpenseCategory =
  "Labour" | "Loading" | "Unloading" | "Fuel" | "Toll" | "Waiting Charges" | "Other";

export interface Expense {
  id: ID;
  date: ISODate;
  category: ExpenseCategory;
  amount: number;
  description: string;
  paidTo: string;
  mode: PaymentMode;
  orderId: ID | null;
  tripId: ID | null;
  recordedBy: string;
}
