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
  | "Duplicate"
  | "Rejected";

export type DocumentSource = "Staff Upload" | "Driver Link";

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
  | "Financial discrepancy"
  | "No match"
  | "Vehicle mismatch";

export interface DocumentRecord {
  id: ID;
  /** Short display reference (live documents have uuid ids). */
  ref?: string;
  /** Path in the private documents bucket (previews live at <path>.thumb.jpg). */
  storagePath?: string;
  type: DocumentType;
  fileName: string;
  pages: number;
  /** Who uploaded it (or the name typed on the upload page, e.g. a driver). */
  senderName: string;
  source: DocumentSource;
  receivedAt: ISODate;
  status: ProcessingStatus;
  /** Overall extraction confidence, 0–100. */
  confidence: number;
  fields: ExtractedField[];
  link: DocumentLink | null;
  timeline: TimelineEvent[];
  corrections: Correction[];
  duplicateOf: ID | null;
  reviewReason: ReviewReason | null;
  note: string;
  /** Signed URL of the original file (live documents). */
  fileUrl?: string | null;
  mimeType?: string | null;
  /** Trip the uploader said this belongs to (verified by the matcher). */
  tripHint?: { id: ID; label: string } | null;
  /** Why processing is waiting or failed (AI limit, AI not configured, error). */
  processingNote?: string | null;
}

export interface MatchCriteria {
  vehicle: boolean;
  date: boolean;
  material: boolean;
  provider: boolean;
  destination: boolean;
}

export interface CriterionScore {
  criterion: string;
  score: number;
  weight: number;
  applicable: boolean;
  detail: string;
}

export interface MatchCandidate {
  tripId: ID;
  score: number;
  criteria: MatchCriteria;
  /** Per-criterion breakdown from the matching engine (live data). */
  breakdown?: CriterionScore[];
  recordType?: "loading" | "delivery";
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
