/**
 * Master data (customers & sites, providers, transporters, vehicles & drivers, materials, yards)
 * from Supabase. Multi-table creates go through transactional RPCs.
 */
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
import { AppError, check, rows, unwrap, unwrapMaybe, unwrapOne } from "./supabase/errors";
import { fetchOrders, fetchPurchases, fetchTrips, indexBy, sb } from "./supabase/fetch";
import {
  num,
  toCustomer,
  toDriver,
  toMaterial,
  toProvider,
  toSite,
  toTransporter,
  toVehicle,
  toYard,
  unitToDb,
} from "./supabase/mappers";

// ---------- Customers ----------
export interface CustomerRow extends Customer {
  siteCount: number;
  activeOrders: number;
  totalInvoiced: number;
  outstanding: number;
}

async function customerRows(id?: string): Promise<CustomerRow[]> {
  let customers = sb().from("customers").select("*").is("deleted_at", null);
  let stats = sb().from("v_customer_stats").select("*");
  let money = sb().from("v_customer_outstanding").select("*");
  if (id) {
    customers = customers.eq("id", id);
    stats = stats.eq("customer_id", id);
    money = money.eq("customer_id", id);
  }
  const [c, s, m] = await Promise.all([customers.order("name"), stats, money]);
  const statsBy = indexBy(rows(s), (r) => r.customer_id);
  const moneyBy = indexBy(rows(m), (r) => r.customer_id);
  return rows(c).map((row) => ({
    ...toCustomer(row),
    siteCount: num(statsBy.get(row.id)?.site_count),
    activeOrders: num(statsBy.get(row.id)?.active_orders),
    totalInvoiced: num(moneyBy.get(row.id)?.invoiced_amount),
    outstanding: num(moneyBy.get(row.id)?.outstanding_amount),
  }));
}

export async function listCustomers(): Promise<CustomerRow[]> {
  return customerRows();
}

export async function getCustomer(id: string): Promise<{
  customer: CustomerRow;
  sites: Site[];
  orders: OrderView[];
  invoices: InvoiceView[];
  payments: PaymentView[];
  trips: TripView[];
}> {
  const [customers, sites, orders, trips] = await Promise.all([
    customerRows(id),
    sb()
      .from("construction_sites")
      .select("*")
      .eq("customer_id", id)
      .is("deleted_at", null)
      .order("name"),
    fetchOrders({ customer_id: id }),
    fetchTrips({ customer_id: id }, 200),
  ]);
  const customer = customers[0];
  if (!customer) throw new AppError("Customer not found.", null, "not_found");
  return {
    customer,
    sites: rows(sites).map(toSite),
    orders,
    // Invoices and payments move to Supabase with the finance phase.
    invoices: [],
    payments: [],
    trips,
  };
}

// ---------- Providers ----------
export interface ProviderRow extends Provider {
  materialNames: string[];
  purchaseValue: number;
  purchaseCount: number;
  payable: number;
}

async function providerRows(id?: string): Promise<ProviderRow[]> {
  let providers = sb().from("material_providers").select("*").is("deleted_at", null);
  let stats = sb().from("v_provider_stats").select("*");
  let payable = sb().from("v_provider_payable").select("*");
  if (id) {
    providers = providers.eq("id", id);
    stats = stats.eq("provider_id", id);
    payable = payable.eq("provider_id", id);
  }
  const [p, s, pay, m] = await Promise.all([
    providers.order("name"),
    stats,
    payable,
    sb().from("materials").select("id, name"),
  ]);
  const statsBy = indexBy(rows(s), (r) => r.provider_id);
  const payBy = indexBy(rows(pay), (r) => r.provider_id);
  const names = new Map(rows(m).map((x) => [x.id, x.name]));
  return rows(p).map((row) => {
    const st = statsBy.get(row.id);
    const materialIds = st?.material_ids ?? [];
    return {
      ...toProvider(row, materialIds),
      materialNames: materialIds.map((mid) => names.get(mid) ?? "—"),
      purchaseValue: num(st?.purchase_value),
      purchaseCount: num(st?.purchase_count),
      payable: num(payBy.get(row.id)?.payable_amount),
    };
  });
}

export async function listProviders(): Promise<ProviderRow[]> {
  return providerRows();
}

export async function getProvider(id: string): Promise<{
  provider: ProviderRow;
  purchases: PurchaseView[];
  trips: TripView[];
  bills: BillView[];
  payments: PaymentView[];
}> {
  const [providers, purchases, trips] = await Promise.all([
    providerRows(id),
    fetchPurchases({ provider_id: id }),
    fetchTrips({ provider_id: id }, 200),
  ]);
  const provider = providers[0];
  if (!provider) throw new AppError("Provider not found.", null, "not_found");
  return { provider, purchases, trips, bills: [], payments: [] };
}

// ---------- Transporters & vehicles ----------
export interface TransporterRow extends Transporter {
  vehicleCount: number;
  tripCount: number;
  shortageTrips: number;
  payable: number;
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

async function vehicleRows(
  filter: { id?: string; transporterId?: string } = {},
): Promise<VehicleRow[]> {
  let vehicles = sb().from("vehicles").select("*").is("deleted_at", null);
  let stats = sb().from("v_vehicle_shortage_stats").select("*");
  if (filter.id) {
    vehicles = vehicles.eq("id", filter.id);
    stats = stats.eq("vehicle_id", filter.id);
  }
  if (filter.transporterId) {
    vehicles = vehicles.eq("transporter_id", filter.transporterId);
    stats = stats.eq("transporter_id", filter.transporterId);
  }
  const [v, s, t, d] = await Promise.all([
    vehicles.order("vehicle_number"),
    stats,
    sb().from("transporters").select("id, name"),
    sb().from("drivers").select("*"),
  ]);
  const statsBy = indexBy(rows(s), (r) => r.vehicle_id);
  const transporters = new Map(rows(t).map((x) => [x.id, x.name]));
  const drivers = indexBy(rows(d), (r) => r.id);
  return rows(v).map((row) => {
    const st = statsBy.get(row.id);
    const driver = row.default_driver_id ? drivers.get(row.default_driver_id) : undefined;
    return {
      ...toVehicle(row),
      transporterName: transporters.get(row.transporter_id) ?? "—",
      driverName: driver?.full_name ?? "—",
      driverPhone: driver?.phone ?? "",
      tripCount: num(st?.trip_count),
      shortageCount: num(st?.needs_verification_count) + num(st?.confirmed_shortage_count),
      avgDifference: Math.round(num(st?.avg_difference_mt) * 100) / 100,
      recurringShortage: Boolean(st?.has_recurring_shortage),
    };
  });
}

async function transporterRows(id?: string): Promise<TransporterRow[]> {
  let transporters = sb().from("transporters").select("*").is("deleted_at", null);
  let stats = sb().from("v_vehicle_shortage_stats").select("*");
  let payable = sb().from("v_transporter_payable").select("*");
  if (id) {
    transporters = transporters.eq("id", id);
    stats = stats.eq("transporter_id", id);
    payable = payable.eq("transporter_id", id);
  }
  const [t, s, pay] = await Promise.all([transporters.order("name"), stats, payable]);
  const payBy = indexBy(rows(pay), (r) => r.transporter_id);
  const statRows = rows(s);
  return rows(t).map((row) => {
    const mine = statRows.filter((x) => x.transporter_id === row.id);
    return {
      ...toTransporter(row),
      vehicleCount: mine.length,
      tripCount: mine.reduce((a, x) => a + num(x.trip_count), 0),
      shortageTrips: mine.reduce(
        (a, x) => a + num(x.needs_verification_count) + num(x.confirmed_shortage_count),
        0,
      ),
      payable: num(payBy.get(row.id)?.payable_amount),
    };
  });
}

export async function listTransporters(): Promise<TransporterRow[]> {
  return transporterRows();
}

export async function getTransporter(id: string): Promise<{
  transporter: TransporterRow;
  vehicles: VehicleRow[];
  trips: TripView[];
  bills: BillView[];
  payments: PaymentView[];
}> {
  const [transporters, vehicles, trips] = await Promise.all([
    transporterRows(id),
    vehicleRows({ transporterId: id }),
    fetchTrips({ transporter_id: id }, 200),
  ]);
  const transporter = transporters[0];
  if (!transporter) throw new AppError("Transporter not found.", null, "not_found");
  return { transporter, vehicles, trips, bills: [], payments: [] };
}

export async function listVehicles(): Promise<VehicleRow[]> {
  return vehicleRows();
}

export async function getVehicle(
  id: string,
): Promise<{ vehicle: VehicleRow; trips: TripView[]; driver: Driver | null }> {
  const [vehicles, trips] = await Promise.all([
    vehicleRows({ id }),
    fetchTrips({ vehicle_id: id }, 200),
  ]);
  const vehicle = vehicles[0];
  if (!vehicle) throw new AppError("Vehicle not found.", null, "not_found");
  const driver = vehicle.driverId
    ? unwrapMaybe(await sb().from("drivers").select("*").eq("id", vehicle.driverId).maybeSingle())
    : null;
  return { vehicle, trips, driver: driver ? toDriver(driver) : null };
}

// ---------- Materials ----------
export interface MaterialRow extends Material {
  yardStock: number;
  deliveredQty: number;
  orderCount: number;
}

async function materialRows(id?: string): Promise<MaterialRow[]> {
  let materials = sb().from("materials").select("*").is("deleted_at", null);
  let stats = sb().from("v_material_stats").select("*");
  let rates = sb()
    .from("material_rates")
    .select("material_id, rate_type, rate, effective_from, provider_id");
  if (id) {
    materials = materials.eq("id", id);
    stats = stats.eq("material_id", id);
    rates = rates.eq("material_id", id);
  }
  const [m, s, r] = await Promise.all([materials.order("name"), stats, rates]);
  const statsBy = indexBy(rows(s), (x) => x.material_id);
  const rateRows = rows(r);
  return rows(m).map((row) => {
    const st = statsBy.get(row.id);
    return {
      ...toMaterial(
        row,
        rateRows.filter((x) => x.material_id === row.id),
      ),
      yardStock: Math.round(num(st?.yard_stock) * 100) / 100,
      deliveredQty: Math.round(num(st?.delivered_qty) * 100) / 100,
      orderCount: num(st?.order_count),
    };
  });
}

export async function listMaterials(): Promise<MaterialRow[]> {
  return materialRows();
}

export async function getMaterial(id: string): Promise<{
  material: MaterialRow;
  purchases: PurchaseView[];
  orders: OrderView[];
  trips: TripView[];
}> {
  const [materials, purchases, trips, orderIds] = await Promise.all([
    materialRows(id),
    fetchPurchases({ material_id: id }),
    fetchTrips({ material_id: id }, 50),
    sb().from("order_items").select("order_id").eq("material_id", id),
  ]);
  const material = materials[0];
  if (!material) throw new AppError("Material not found.", null, "not_found");
  const ids = [...new Set(rows(orderIds).map((x) => x.order_id))];
  const orders = ids.length ? (await fetchOrders()).filter((o) => ids.includes(o.id)) : [];
  return { material, purchases, orders, trips };
}

// ---------- Picker options ----------
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
  const [c, s, p, pm, t, v, d, m, y, o] = await Promise.all([
    sb().from("customers").select("*").is("deleted_at", null).eq("is_active", true).order("name"),
    sb().from("construction_sites").select("*").is("deleted_at", null).order("name"),
    sb()
      .from("material_providers")
      .select("*")
      .is("deleted_at", null)
      .eq("is_active", true)
      .order("name"),
    sb().from("v_provider_stats").select("provider_id, material_ids"),
    sb()
      .from("transporters")
      .select("*")
      .is("deleted_at", null)
      .eq("is_active", true)
      .order("name"),
    sb()
      .from("vehicles")
      .select("*")
      .is("deleted_at", null)
      .eq("is_active", true)
      .order("vehicle_number"),
    sb()
      .from("drivers")
      .select("*")
      .is("deleted_at", null)
      .eq("is_active", true)
      .order("full_name"),
    sb().from("materials").select("*").is("deleted_at", null).eq("is_active", true).order("name"),
    sb()
      .from("stock_locations")
      .select("*")
      .is("deleted_at", null)
      .eq("is_active", true)
      .order("name"),
    sb()
      .from("v_order_list")
      .select("id, order_code, customer_id, site_id, status, material_ids")
      .order("order_date", { ascending: false })
      .limit(500),
  ]);
  const providerMaterials = indexBy(rows(pm), (x) => x.provider_id);
  const { orderStatusFromDb } = await import("./supabase/mappers");
  return {
    customers: rows(c).map(toCustomer),
    sites: rows(s).map(toSite),
    providers: rows(p).map((x) => toProvider(x, providerMaterials.get(x.id)?.material_ids ?? [])),
    transporters: rows(t).map(toTransporter),
    vehicles: rows(v).map(toVehicle),
    drivers: rows(d).map(toDriver),
    materials: rows(m).map((x) => toMaterial(x)),
    yards: rows(y).map(toYard),
    orders: rows(o).map((x) => ({
      id: x.id ?? "",
      ref: x.order_code ?? "",
      customerId: x.customer_id ?? "",
      siteId: x.site_id ?? "",
      status: orderStatusFromDb(x.status),
      materialIds: x.material_ids ?? [],
    })),
  };
}

// ---------- Add dialogs ----------
const blank = (v: string | undefined) => (v && v.trim() ? v.trim() : null);

export async function addCustomer(
  input: Omit<Customer, "id" | "active" | "createdAt"> & { siteName: string; siteAddress: string },
): Promise<Customer> {
  const id = unwrap(
    await sb().rpc("create_customer", {
      p_customer: {
        name: input.name,
        customer_type: input.type,
        gstin: blank(input.gstin),
        contact_name: input.contactName,
        phone: input.phone,
        email: input.email,
        city: input.city,
        state: input.state,
        billing_address: input.billingAddress,
        credit_days: input.creditDays,
      },
      p_site: input.siteName
        ? {
            name: input.siteName,
            address: input.siteAddress,
            city: input.city,
            contact_name: input.contactName,
            contact_phone: input.phone,
          }
        : null,
    } as never),
  );
  return toCustomer(
    unwrapOne(await sb().from("customers").select("*").eq("id", id).maybeSingle(), "Customer"),
  );
}

export async function addSite(input: Omit<Site, "id" | "active">): Promise<Site> {
  const row = unwrap(
    await sb()
      .from("construction_sites")
      .insert({
        customer_id: input.customerId,
        name: input.name,
        address: blank(input.address),
        city: blank(input.city),
        contact_name: blank(input.contactName),
        contact_phone: blank(input.contactPhone),
      })
      .select("*")
      .single(),
  );
  return toSite(row);
}

export async function addProvider(input: Omit<Provider, "id" | "active">): Promise<Provider> {
  const id = unwrap(
    await sb().rpc("create_provider", {
      p_provider: {
        name: input.name,
        city: input.city,
        gstin: blank(input.gstin),
        contact_name: input.contactName,
        phone: input.phone,
        payment_terms_days: input.paymentTermsDays,
      },
      p_material_ids: input.materialIds,
    }),
  );
  const row = unwrapOne(
    await sb().from("material_providers").select("*").eq("id", id).maybeSingle(),
    "Provider",
  );
  return toProvider(row, input.materialIds);
}

export async function addTransporter(
  input: Omit<Transporter, "id" | "active">,
): Promise<Transporter> {
  const row = unwrap(
    await sb()
      .from("transporters")
      .insert({
        name: input.name,
        city: blank(input.city),
        gstin: blank(input.gstin),
        contact_name: blank(input.contactName),
        phone: blank(input.phone),
        rate_per_trip: input.ratePerTrip,
      })
      .select("*")
      .single(),
  );
  return toTransporter(row);
}

export async function addVehicle(
  input: Omit<Vehicle, "id" | "active" | "driverId"> & {
    driverName: string;
    driverPhone: string;
    licenseNo: string;
  },
): Promise<Vehicle> {
  const id = unwrap(
    await sb().rpc("create_vehicle", {
      p_vehicle: {
        transporter_id: input.transporterId,
        vehicle_number: input.plate,
        vehicle_type: input.type,
        capacity_mt: input.capacity || null,
      },
      p_driver: input.driverName
        ? { full_name: input.driverName, phone: input.driverPhone, license_number: input.licenseNo }
        : null,
    } as never),
  );
  return toVehicle(
    unwrapOne(await sb().from("vehicles").select("*").eq("id", id).maybeSingle(), "Vehicle"),
  );
}

export async function addMaterial(
  input: Omit<Material, "id" | "active" | "rateHistory">,
): Promise<Material> {
  const id = unwrap(
    await sb().rpc("create_material", {
      p_material: {
        name: input.name,
        category: input.category,
        unit: unitToDb(input.unit),
        hsn_code: input.hsn,
        gst_rate: input.gstRate,
        purchase_rate: input.purchaseRate,
        selling_rate: input.sellingRate,
        shortage_tolerance: input.tolerance,
      },
    }),
  );
  const [m] = await materialRows(id);
  if (!m) throw new AppError("Material not found.", null, "not_found");
  return m;
}

/** New stock yard (owner only, enforced by RLS). */
export async function addYard(input: { name: string; location: string }): Promise<Yard> {
  const row = unwrap(
    await sb()
      .from("stock_locations")
      .insert({ name: input.name, address: blank(input.location) })
      .select("*")
      .single(),
  );
  return toYard(row);
}

/** Shortage tolerance per material (Settings page, owner only). */
export async function updateTolerances(values: Record<string, number>): Promise<void> {
  check(await sb().rpc("set_material_tolerances", { p_values: values }));
}
