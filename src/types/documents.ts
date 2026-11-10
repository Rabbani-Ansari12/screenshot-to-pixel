import type { ID, ISODate, TimelineEvent } from "./common";

export type DocumentType =
  | "Weighbridge Slip"
  | "Loading Slip"
  | "Unloading Slip"
  | "Provider Bill"
  | "Transporter Bill"
  | "Delivery Photo"
  | "Payment Receipt"
  | "Other";

export type ProcessingStatus =
  | "Received"
  | "Processing"
  | "Information Extracted"
  | "Matched"
  | "Automatically Recorded"
  | "Needs Review"
  | "Failed"
  | "Duplicate";

export type DocumentSource = "WhatsApp" | "Manual Upload";

export interface ExtractedField {
  key: string;
  label: string;
  value: string;
  confidence: number;
}

export type LinkedRecordType =
  "Trip" | "Purchase" | "Provider Bill" | "Transporter Bill" | "Payment" | "Invoice";

export interface DocumentLink {
  type: LinkedRecordType;
  id: ID;
  label: string;
}

export interface Correction {
  field: string;
  from: string;
  to: string;
  by: string;
  at: ISODate;
  reason: string;
}

export type ReviewReason =
  | "Low confidence"
  | "Missing essential info"
  | "Multiple possible matches"
  | "Conflicting weight values"
  | "Financial discrepancy";

export interface DocumentRecord {
  id: ID;
  type: DocumentType;
  fileName: string;
  pages: number;
  senderName: string;
  senderPhone: string;
  source: DocumentSource;
  receivedAt: ISODate;
  status: ProcessingStatus;
  /** Overall extraction confidence, 0–100. */
  confidence: number;
  fields: ExtractedField[];
  link: DocumentLink | null;
  timeline: TimelineEvent[];
  corrections: Correction[];
  messageId: ID | null;
  duplicateOf: ID | null;
  reviewReason: ReviewReason | null;
  note: string;
}

export interface MatchCriteria {
  vehicle: boolean;
  date: boolean;
  material: boolean;
  provider: boolean;
  destination: boolean;
}

export interface MatchCandidate {
  tripId: ID;
  score: number;
  criteria: MatchCriteria;
}

export interface WeightConflict {
  printedNet: number;
  gross: number;
  tare: number;
}

export interface FinancialDiscrepancy {
  billId: ID;
  billed: number;
  recorded: number;
}

export type ReviewStatus = "Open" | "Resolved" | "Rejected";

export interface ReviewItem {
  id: ID;
  documentId: ID | null;
  reason: ReviewReason;
  title: string;
  summary: string;
  createdAt: ISODate;
  priority: "High" | "Medium" | "Low";
  candidates: MatchCandidate[];
  weightConflict: WeightConflict | null;
  financial: FinancialDiscrepancy | null;
  status: ReviewStatus;
}

export interface WhatsAppMessage {
  id: ID;
  senderName: string;
  phone: string;
  at: ISODate;
  text: string;
  documentIds: ID[];
  status: ProcessingStatus;
}
