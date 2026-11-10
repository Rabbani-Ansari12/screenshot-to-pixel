export type ID = string;
/** ISO date (yyyy-MM-dd) or ISO date-time with +05:30 offset. */
export type ISODate = string;

export type Unit = "MT" | "CFT" | "Brass" | "m³" | "Trips" | "Bags" | "Nos";

export type Role = "Owner" | "Employee";

export type Permission =
  | "view_records"
  | "manage_orders"
  | "review_documents"
  | "manage_trips"
  | "correct_extracted"
  | "verify_bills"
  | "record_payments"
  | "view_financial_reports";

export type PaymentMode = "UPI" | "Bank Transfer" | "Cheque" | "Cash";

export interface AdditionalCost {
  label: string;
  amount: number;
}

export interface TimelineEvent {
  label: string;
  at: ISODate | null;
  state: "done" | "current" | "pending" | "failed";
  note?: string;
}

export interface Option {
  value: string;
  label: string;
  hint?: string;
}
