export type Role = "Owner" | "Employee";
export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";

export interface Material {
  id: string;
  name: string;
  category: string;
  unit: "MT" | "CFT" | "Brass" | "m³" | "Trips";
  purchaseRate: number;
  sellingRate: number;
  stock: number;
}
export interface Customer {
  id: string;
  name: string;
  kind: string;
  site: string;
  city: string;
  phone: string;
  outstanding: number;
}
export interface Provider {
  id: string;
  name: string;
  city: string;
  rating: number;
  materials: string[];
  payable: number;
}
export interface Transporter {
  id: string;
  name: string;
  city: string;
  vehicles: number;
  payable: number;
  ratePerTrip: number;
}
export interface Vehicle {
  id: string;
  plate: string;
  transporterId: string;
  driver: string;
  phone: string;
  trips: number;
  shortageCount: number;
}
export interface Order {
  id: string;
  ref: string;
  customerId: string;
  site: string;
  materialId: string;
  required: number;
  dispatched: number;
  delivered: number;
  rate: number;
  status: string;
  expected: string;
  profit: number;
}
export interface Purchase {
  id: string;
  ref: string;
  providerId: string;
  materialId: string;
  orderId: string;
  date: string;
  quantity: number;
  rate: number;
  extraCost: number;
  destination: "Direct to site" | "Stock yard";
  status: string;
}
export interface Trip {
  id: string;
  ref: string;
  orderId: string;
  purchaseId: string;
  transporterId: string;
  vehicleId: string;
  loaded: number;
  delivered: number;
  gross: number;
  tare: number;
  slip: string;
  date: string;
  status: string;
  docs: number;
  source: "WhatsApp AI" | "Manual";
}
export interface DocumentRecord {
  id: string;
  ref: string;
  kind: string;
  sender: string;
  phone: string;
  source: "WhatsApp" | "Manual upload";
  received: string;
  status: string;
  confidence: number;
  linked: string;
  reason: string;
  tripId: string;
}
export interface Bill {
  id: string;
  ref: string;
  party: string;
  kind: "Provider bill" | "Transporter bill";
  date: string;
  amount: number;
  paid: number;
  status: string;
  trips: number;
  reason: string;
}
export interface Invoice {
  id: string;
  ref: string;
  customerId: string;
  orderId: string;
  date: string;
  amount: number;
  paid: number;
  status: string;
  tax: string;
}
export interface Payment {
  id: string;
  ref: string;
  party: string;
  direction: "Incoming" | "Outgoing";
  date: string;
  amount: number;
  mode: string;
  linked: string;
}
export interface Expense {
  id: string;
  category: string;
  note: string;
  date: string;
  amount: number;
  linked: string;
}
export interface TableRow {
  id: string;
  reference: string;
  entity: string;
  detail: string;
  date: string;
  status: string;
  amount: number;
  quantity?: number;
  extra?: string;
}
export interface ModuleData {
  title: string;
  description: string;
  rows: TableRow[];
}
