/**
 * View models returned by the service layer. They add display names and
 * computed totals on top of the stored records so components never join data.
 */
import type { ID, Unit } from "./common";
import type { Bill, Expense, Invoice, Payment, PaymentStatus } from "./finance";
import type { DocumentRecord, MatchCandidate, ReviewItem } from "./documents";
import type { Order, Purchase, ShortageStatus, StockMovement, Trip } from "./operations";

export interface OrderView extends Order {
  customerName: string;
  siteName: string;
  materialsLabel: string;
  unitLabel: string;
  requiredQty: number;
  dispatchedQty: number;
  deliveredQty: number;
  orderValue: number;
  estimatedProfit: number;
  tripCount: number;
}

export interface TripView extends Trip {
  orderRef: string;
  customerId: ID;
  customerName: string;
  siteName: string;
  materialName: string;
  unit: Unit;
  providerName: string;
  yardName: string | null;
  transporterName: string;
  vehiclePlate: string;
  driverName: string;
  loadedQty: number;
  deliveredQty: number | null;
  difference: number | null;
  tolerance: number;
  shortageStatus: ShortageStatus | null;
  documentCount: number;
}

export interface PurchaseView extends Purchase {
  providerName: string;
  materialName: string;
  orderRef: string | null;
  customerName: string | null;
  yardName: string | null;
  baseAmount: number;
  additionalTotal: number;
  totalAmount: number;
  landedRate: number;
  tripCount: number;
}

export interface BillView extends Bill {
  partyName: string;
  billedQuantity: number;
  billedTrips: number;
  billedSubtotal: number;
  taxAmount: number;
  total: number;
  paid: number;
  outstanding: number;
  paymentStatus: PaymentStatus;
  recordedQuantity: number;
  recordedSubtotal: number;
  recordedTrips: number;
  difference: number;
  unmatchedLineCount: number;
  missingTripIds: ID[];
  overdueDays: number;
}

export interface InvoiceView extends Invoice {
  customerName: string;
  siteName: string;
  orderRef: string;
  quantity: number;
  subtotal: number;
  additionalTotal: number;
  taxAmount: number;
  total: number;
  paid: number;
  balance: number;
  paymentStatus: PaymentStatus;
  overdueDays: number;
  /** Lifecycle: draft invoices can still be issued, cancelled ones carry no balance. */
  status?: "Draft" | "Issued" | "Cancelled";
  cgst?: number;
  sgst?: number;
  igst?: number;
  /** GST state code of the place of supply (e.g. "27"). */
  placeOfSupply?: string;
}

export interface PaymentView extends Payment {
  partyName: string;
  againstLabel: string;
}

export interface ExpenseView extends Expense {
  orderRef: string | null;
  tripRef: string | null;
}

export interface StockMovementView extends StockMovement {
  /** Human-readable reference (purchase / trip code) when referenceId is a database id. */
  referenceLabel?: string;
  materialName: string;
  unit: Unit;
  yardName: string;
  balance: number;
}

export interface CandidateView extends MatchCandidate {
  trip: TripView;
}

export interface ReviewItemView extends ReviewItem {
  document: DocumentRecord | null;
  candidateTrips: CandidateView[];
}

export interface ProfitBreakdown {
  salesValue: number;
  purchaseCost: number;
  transportCost: number;
  loadingUnloading: number;
  labour: number;
  other: number;
  profit: number;
  marginPct: number;
}

export interface OrderProfitView extends ProfitBreakdown {
  orderId: ID;
  orderRef: string;
  customerName: string;
  status: "Estimated" | "Final Settled";
  deliveredQty: number;
  unitLabel: string;
}

export interface MonthlyProfitView extends ProfitBreakdown {
  month: string;
  label: string;
  status: "Estimated" | "Final Settled";
}

export interface PartyBalance {
  partyId: ID;
  partyName: string;
  partyType: "Customer" | "Provider" | "Transporter";
  total: number;
  paid: number;
  outstanding: number;
  current: number;
  d30: number;
  d60: number;
  d90: number;
}
