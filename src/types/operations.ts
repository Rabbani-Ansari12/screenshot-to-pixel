import type { AdditionalCost, ID, ISODate, Unit } from "./common";

export type OrderStatus =
  "Draft" | "Confirmed" | "In Progress" | "Completed" | "On Hold" | "Cancelled";

export interface OrderItem {
  id: ID;
  materialId: ID;
  quantity: number;
  unit: Unit;
  sellingRate: number;
}

export interface Order {
  id: ID;
  ref: string;
  customerId: ID;
  siteId: ID;
  orderDate: ISODate;
  customerRef: string;
  expectedDelivery: ISODate;
  status: OrderStatus;
  items: OrderItem[];
  notes: string;
  createdBy: string;
}

export type DeliveryMode = "Direct-to-Site" | "Stock-Yard";
export type PurchaseStatus = "Recorded" | "Needs Verification" | "Billed" | "Cancelled";

export interface Purchase {
  id: ID;
  ref: string;
  providerId: ID;
  materialId: ID;
  orderId: ID | null;
  date: ISODate;
  quantity: number;
  unit: Unit;
  rate: number;
  additionalCosts: AdditionalCost[];
  deliveryMode: DeliveryMode;
  yardId: ID | null;
  documentIds: ID[];
  status: PurchaseStatus;
  source: "Document" | "Manual";
}

export type MeasurementSource = "Weighbridge" | "Manual Entry" | "Site Measurement";

export interface WeighRecord {
  gross: number;
  tare: number;
  net: number;
  slipNo: string;
  at: ISODate;
  location: string;
  source: MeasurementSource;
  documentId: ID | null;
  /** True when the values were filled from an uploaded document by AI. */
  autoFilled: boolean;
}

export type TripStatus =
  "Loaded" | "In Transit" | "Delivered" | "Needs Verification" | "Confirmed Shortage" | "Cancelled";
export type ShortageStatus = "Normal" | "Needs Verification" | "Confirmed Shortage";

export type InvestigationOutcome =
  | "Under investigation"
  | "Weighbridge calibration difference"
  | "Moisture / spillage loss"
  | "Site measurement difference"
  | "Recovered from transporter"
  | "Accepted as normal loss";

export interface Investigation {
  outcome: InvestigationOutcome;
  notes: string;
  by: string;
  at: ISODate;
}

export interface Trip {
  /** Trip code, e.g. TRP-2026-00123 (shown everywhere and used in URLs). */
  id: ID;
  /** Database id of the trip (live data only). */
  uuid?: ID;
  orderId: ID;
  materialId: ID;
  providerId: ID;
  purchaseId: ID | null;
  /** Set when the trip was issued from own stock yard instead of a provider. */
  yardId: ID | null;
  transporterId: ID;
  vehicleId: ID;
  driverId: ID;
  siteId: ID;
  loading: WeighRecord;
  delivery: WeighRecord | null;
  status: TripStatus;
  freight: number;
  createdVia: "Document" | "Manual";
  investigation: Investigation | null;
}

export type StockMovementType = "Received" | "Issued" | "Adjustment";

export interface StockMovement {
  id: ID;
  yardId: ID;
  materialId: ID;
  date: ISODate;
  type: StockMovementType;
  /** Positive for received, negative for issued. */
  quantity: number;
  referenceType: "Purchase" | "Trip" | "Adjustment";
  referenceId: ID;
  note: string;
}
