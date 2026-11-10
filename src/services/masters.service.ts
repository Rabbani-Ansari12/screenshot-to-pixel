import type {
  BillView,
  Customer,
  Driver,
  InvoiceView,
  Material,
  OrderView,
  PaymentView,
  Provider,
  PurchaseView,
  Site,
  Transporter,
  TripView,
  Vehicle,
  Yard,
} from "@/types";
import { NotFoundError, clone, db, delay, logAudit, nextId } from "./core";
import {
  toBillView,
  toInvoiceView,
  toOrderView,
  toPaymentView,
  toPurchaseView,
  toTripView,
} from "./views";

const ACTIVE_ORDER = ["Confirmed", "In Progress", "On Hold"];

export interface CustomerRow extends Customer {
  siteCount: number;
  activeOrders: number;
  totalInvoiced: number;
  outstanding: number;
}

// TODO(backend): supabase.from("customers_view").select("*")
export async function listCustomers(): Promise<CustomerRow[]> {
  await delay();
  return clone(
    db.customers.map((c) => {
      const invoices = db.invoices.filter((i) => i.customerId === c.id).map(toInvoiceView);
      return {
        ...c,
        siteCount: db.sites.filter((s) => s.customerId === c.id).length,
        activeOrders: db.orders.filter(
          (o) => o.customerId === c.id && ACTIVE_ORDER.includes(o.status),
        ).length,
        totalInvoiced: invoices.reduce((s, i) => s + i.total, 0),
        outstanding: invoices.reduce((s, i) => s + i.balance, 0),
      };
    }),
  );
}

export async function getCustomer(id: string): Promise<{
  customer: CustomerRow;
  sites: Site[];
  orders: OrderView[];
  invoices: InvoiceView[];
  payments: PaymentView[];
  trips: TripView[];
}> {
  await delay();
  const c = db.customers.find((x) => x.id === id);
  if (!c) throw new NotFoundError(`Customer ${id}`);
  const orders = db.orders.filter((o) => o.customerId === id);
  const orderIds = new Set(orders.map((o) => o.id));
  const invoices = db.invoices.filter((i) => i.customerId === id).map(toInvoiceView);
  return clone({
    customer: {
      ...c,
      siteCount: 0,
      activeOrders: orders.filter((o) => ACTIVE_ORDER.includes(o.status)).length,
      totalInvoiced: invoices.reduce((s, i) => s + i.total, 0),
      outstanding: invoices.reduce((s, i) => s + i.balance, 0),
    },
    sites: db.sites.filter((s) => s.customerId === id),
    orders: orders.map(toOrderView).reverse(),
    invoices: invoices.reverse(),
    payments: db.payments
      .filter((p) => p.partyType === "Customer" && p.partyId === id)
      .map(toPaymentView)
      .reverse(),
    trips: db.trips
      .filter((t) => orderIds.has(t.orderId))
      .map(toTripView)
      .reverse(),
  });
}

export interface ProviderRow extends Provider {
  materialNames: string[];
  purchaseValue: number;
  purchaseCount: number;
  payable: number;
}

export async function listProviders(): Promise<ProviderRow[]> {
  await delay();
  return clone(
    db.providers.map((p) => {
      const purchases = db.purchases.filter((x) => x.providerId === p.id).map(toPurchaseView);
      return {
        ...p,
        materialNames: p.materialIds.map((m) => db.materials.find((x) => x.id === m)?.name ?? m),
        purchaseValue: purchases.reduce((s, x) => s + x.totalAmount, 0),
        purchaseCount: purchases.length,
        payable: db.bills
          .filter((b) => b.kind === "Provider" && b.partyId === p.id)
          .map(toBillView)
          .reduce((s, b) => s + b.outstanding, 0),
      };
    }),
  );
}

export async function getProvider(id: string): Promise<{
  provider: ProviderRow;
  purchases: PurchaseView[];
  trips: TripView[];
  bills: BillView[];
  payments: PaymentView[];
}> {
  const rows = await listProviders();
  const provider = rows.find((p) => p.id === id);
  if (!provider) throw new NotFoundError(`Provider ${id}`);
  return clone({
    provider,
    purchases: db.purchases
      .filter((p) => p.providerId === id)
      .map(toPurchaseView)
      .reverse(),
    trips: db.trips
      .filter((t) => t.providerId === id && !t.yardId)
      .map(toTripView)
      .reverse(),
    bills: db.bills
      .filter((b) => b.kind === "Provider" && b.partyId === id)
      .map(toBillView)
      .reverse(),
    payments: db.payments
      .filter((p) => p.partyType === "Provider" && p.partyId === id)
      .map(toPaymentView)
      .reverse(),
  });
}

export interface TransporterRow extends Transporter {
  vehicleCount: number;
  tripCount: number;
  shortageTrips: number;
  payable: number;
}

export async function listTransporters(): Promise<TransporterRow[]> {
  await delay();
  return clone(
    db.transporters.map((t) => {
      const trips = db.trips.filter((x) => x.transporterId === t.id).map(toTripView);
      return {
        ...t,
        vehicleCount: db.vehicles.filter((v) => v.transporterId === t.id).length,
        tripCount: trips.length,
        shortageTrips: trips.filter((x) => x.shortageStatus && x.shortageStatus !== "Normal")
          .length,
        payable: db.bills
          .filter((b) => b.kind === "Transporter" && b.partyId === t.id)
          .map(toBillView)
          .reduce((s, b) => s + b.outstanding, 0),
      };
    }),
  );
}

export async function getTransporter(id: string): Promise<{
  transporter: TransporterRow;
  vehicles: VehicleRow[];
  trips: TripView[];
  bills: BillView[];
  payments: PaymentView[];
}> {
  const rows = await listTransporters();
  const transporter = rows.find((t) => t.id === id);
  if (!transporter) throw new NotFoundError(`Transporter ${id}`);
  return clone({
    transporter,
    vehicles: db.vehicles.filter((v) => v.transporterId === id).map(vehicleRow),
    trips: db.trips
      .filter((t) => t.transporterId === id)
      .map(toTripView)
      .reverse(),
    bills: db.bills
      .filter((b) => b.kind === "Transporter" && b.partyId === id)
      .map(toBillView)
      .reverse(),
    payments: db.payments
      .filter((p) => p.partyType === "Transporter" && p.partyId === id)
      .map(toPaymentView)
      .reverse(),
  });
}

export interface VehicleRow extends Vehicle {
  transporterName: string;
  driverName: string;
  driverPhone: string;
  tripCount: number;
  shortageCount: number;
  avgDifference: number;
  recurringShortage: boolean;
}

function vehicleRow(v: Vehicle): VehicleRow {
  const trips = db.trips.filter((t) => t.vehicleId === v.id).map(toTripView);
  const delivered = trips.filter((t) => t.difference !== null);
  const shortageCount = delivered.filter((t) => t.shortageStatus !== "Normal").length;
  const driver = db.drivers.find((d) => d.id === v.driverId);
  return {
    ...v,
    transporterName: db.transporters.find((t) => t.id === v.transporterId)?.name ?? "—",
    driverName: driver?.name ?? "—",
    driverPhone: driver?.phone ?? "",
    tripCount: trips.length,
    shortageCount,
    avgDifference: delivered.length
      ? Math.round(
          (delivered.reduce((s, t) => s + (t.difference ?? 0), 0) / delivered.length) * 100,
        ) / 100
      : 0,
    recurringShortage: shortageCount >= 3,
  };
}

export async function listVehicles(): Promise<VehicleRow[]> {
  await delay();
  return clone(db.vehicles.map(vehicleRow));
}

export async function getVehicle(
  id: string,
): Promise<{ vehicle: VehicleRow; trips: TripView[]; driver: Driver | null }> {
  await delay();
  const v = db.vehicles.find((x) => x.id === id);
  if (!v) throw new NotFoundError(`Vehicle ${id}`);
  return clone({
    vehicle: vehicleRow(v),
    trips: db.trips
      .filter((t) => t.vehicleId === id)
      .map(toTripView)
      .reverse(),
    driver: db.drivers.find((d) => d.id === v.driverId) ?? null,
  });
}

export interface MaterialRow extends Material {
  yardStock: number;
  deliveredQty: number;
  orderCount: number;
}

function materialRow(m: Material): MaterialRow {
  return {
    ...m,
    yardStock:
      Math.round(
        db.stockMovements.filter((s) => s.materialId === m.id).reduce((a, s) => a + s.quantity, 0) *
          100,
      ) / 100,
    deliveredQty:
      Math.round(
        db.trips
          .filter((t) => t.materialId === m.id)
          .reduce((a, t) => a + (t.delivery?.net ?? 0), 0) * 100,
      ) / 100,
    orderCount: db.orders.filter((o) => o.items.some((i) => i.materialId === m.id)).length,
  };
}

export async function listMaterials(): Promise<MaterialRow[]> {
  await delay();
  return clone(db.materials.map(materialRow));
}

export async function getMaterial(id: string): Promise<{
  material: MaterialRow;
  purchases: PurchaseView[];
  orders: OrderView[];
  trips: TripView[];
}> {
  await delay();
  const m = db.materials.find((x) => x.id === id);
  if (!m) throw new NotFoundError(`Material ${id}`);
  return clone({
    material: materialRow(m),
    purchases: db.purchases
      .filter((p) => p.materialId === id)
      .map(toPurchaseView)
      .reverse(),
    orders: db.orders
      .filter((o) => o.items.some((i) => i.materialId === id))
      .map(toOrderView)
      .reverse(),
    trips: db.trips
      .filter((t) => t.materialId === id)
      .map(toTripView)
      .reverse()
      .slice(0, 50),
  });
}

/** Lightweight option lists for pickers in forms. */
export interface MasterOptions {
  customers: Customer[];
  sites: Site[];
  providers: Provider[];
  transporters: Transporter[];
  vehicles: Vehicle[];
  drivers: Driver[];
  materials: Material[];
  yards: Yard[];
  orders: {
    id: string;
    ref: string;
    customerId: string;
    siteId: string;
    status: string;
    materialIds: string[];
  }[];
}

export async function getMasterOptions(): Promise<MasterOptions> {
  await delay(120);
  return clone({
    customers: db.customers,
    sites: db.sites,
    providers: db.providers,
    transporters: db.transporters,
    vehicles: db.vehicles.filter((v) => v.active),
    drivers: db.drivers,
    materials: db.materials.filter((m) => m.active),
    yards: db.yards,
    orders: db.orders
      .map((o) => ({
        id: o.id,
        ref: o.ref,
        customerId: o.customerId,
        siteId: o.siteId,
        status: o.status,
        materialIds: o.items.map((i) => i.materialId),
      }))
      .reverse(),
  });
}

// ---------- Add dialogs ----------
// TODO(backend): supabase.from("<table>").insert(...)
export async function addCustomer(
  input: Omit<Customer, "id" | "active" | "createdAt"> & { siteName: string; siteAddress: string },
): Promise<Customer> {
  await delay(350);
  const id = nextId("CUS-", db.customers, 3);
  const { siteName, siteAddress, ...rest } = input;
  const customer: Customer = { ...rest, id, active: true, createdAt: "2026-11-10" };
  db.customers.push(customer);
  if (siteName)
    db.sites.push({
      id: nextId("SITE-", db.sites, 2),
      customerId: id,
      name: siteName,
      address: siteAddress,
      city: input.city,
      contactName: input.contactName,
      contactPhone: input.phone,
      active: true,
    });
  logAudit({ action: "Created", entityType: "Customer", entityId: id, entityLabel: customer.name });
  return clone(customer);
}

export async function addSite(input: Omit<Site, "id" | "active">): Promise<Site> {
  await delay(300);
  const site: Site = { ...input, id: nextId("SITE-", db.sites, 2), active: true };
  db.sites.push(site);
  logAudit({ action: "Created", entityType: "Site", entityId: site.id, entityLabel: site.name });
  return clone(site);
}

export async function addProvider(input: Omit<Provider, "id" | "active">): Promise<Provider> {
  await delay(350);
  const provider: Provider = { ...input, id: nextId("PRV-", db.providers, 3), active: true };
  db.providers.push(provider);
  logAudit({
    action: "Created",
    entityType: "Provider",
    entityId: provider.id,
    entityLabel: provider.name,
  });
  return clone(provider);
}

export async function addTransporter(
  input: Omit<Transporter, "id" | "active">,
): Promise<Transporter> {
  await delay(350);
  const transporter: Transporter = {
    ...input,
    id: nextId("TRN-", db.transporters, 3),
    active: true,
  };
  db.transporters.push(transporter);
  logAudit({
    action: "Created",
    entityType: "Transporter",
    entityId: transporter.id,
    entityLabel: transporter.name,
  });
  return clone(transporter);
}

export async function addVehicle(
  input: Omit<Vehicle, "id" | "active" | "driverId"> & {
    driverName: string;
    driverPhone: string;
    licenseNo: string;
  },
): Promise<Vehicle> {
  await delay(350);
  const driver: Driver = {
    id: nextId("DRV-", db.drivers, 2),
    name: input.driverName,
    phone: input.driverPhone,
    licenseNo: input.licenseNo,
    transporterId: input.transporterId,
  };
  db.drivers.push(driver);
  const vehicle: Vehicle = {
    id: nextId("VEH-", db.vehicles, 2),
    plate: input.plate.toUpperCase(),
    transporterId: input.transporterId,
    driverId: driver.id,
    type: input.type,
    capacity: input.capacity,
    active: true,
  };
  db.vehicles.push(vehicle);
  logAudit({
    action: "Created",
    entityType: "Vehicle",
    entityId: vehicle.id,
    entityLabel: vehicle.plate,
  });
  return clone(vehicle);
}

export async function addMaterial(
  input: Omit<Material, "id" | "active" | "rateHistory">,
): Promise<Material> {
  await delay(350);
  const material: Material = {
    ...input,
    id: nextId("MAT-", db.materials, 3),
    active: true,
    rateHistory: [
      { date: "2026-11-10", purchaseRate: input.purchaseRate, sellingRate: input.sellingRate },
    ],
  };
  db.materials.push(material);
  logAudit({
    action: "Created",
    entityType: "Material",
    entityId: material.id,
    entityLabel: material.name,
  });
  return clone(material);
}

/** Shortage tolerance per material (Settings page). */
// TODO(backend): supabase.from("materials").update({ tolerance }).in("id", ids)
export async function updateTolerances(values: Record<string, number>): Promise<void> {
  await delay(350);
  Object.entries(values).forEach(([id, tolerance]) => {
    const m = db.materials.find((x) => x.id === id);
    if (!m || m.tolerance === tolerance) return;
    logAudit({
      action: "Updated",
      entityType: "Material",
      entityId: id,
      entityLabel: m.name,
      changes: [
        {
          field: "Shortage tolerance",
          from: `${m.tolerance} ${m.unit}`,
          to: `${tolerance} ${m.unit}`,
        },
      ],
    });
    m.tolerance = tolerance;
  });
}
