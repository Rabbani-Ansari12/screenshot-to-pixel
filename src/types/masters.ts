import type { ID, ISODate, Unit } from "./common";

export type MaterialCategory = "Sand" | "Aggregate" | "Cement" | "Masonry" | "Steel";

export interface RatePoint {
  date: ISODate;
  purchaseRate: number;
  sellingRate: number;
}

export interface Material {
  id: ID;
  name: string;
  category: MaterialCategory;
  unit: Unit;
  hsn: string;
  gstRate: number;
  purchaseRate: number;
  sellingRate: number;
  /** Allowed loading-vs-delivery difference, in the material's unit. */
  tolerance: number;
  rateHistory: RatePoint[];
  active: boolean;
}

export interface Site {
  id: ID;
  customerId: ID;
  name: string;
  address: string;
  city: string;
  contactName: string;
  contactPhone: string;
  active: boolean;
}

export type CustomerType = "Builder" | "Infrastructure" | "Contractor" | "Industrial";

export interface Customer {
  id: ID;
  name: string;
  type: CustomerType;
  gstin: string;
  contactName: string;
  phone: string;
  email: string;
  city: string;
  state: string;
  billingAddress: string;
  creditDays: number;
  active: boolean;
  createdAt: ISODate;
}

export interface Provider {
  id: ID;
  name: string;
  city: string;
  gstin: string;
  contactName: string;
  phone: string;
  materialIds: ID[];
  paymentTermsDays: number;
  active: boolean;
}

export interface Transporter {
  id: ID;
  name: string;
  city: string;
  gstin: string;
  contactName: string;
  phone: string;
  ratePerTrip: number;
  active: boolean;
}

export interface Driver {
  id: ID;
  name: string;
  phone: string;
  licenseNo: string;
  transporterId: ID;
}

export interface Vehicle {
  id: ID;
  plate: string;
  transporterId: ID;
  driverId: ID;
  type: string;
  capacity: number;
  active: boolean;
}

export interface Yard {
  id: ID;
  name: string;
  location: string;
}
