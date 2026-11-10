import type {
  InvestigationOutcome,
  Order,
  OrderItem,
  OrderStatus,
  Purchase,
  StockMovement,
  Trip,
  Unit,
} from "@/types";
import { materials, providers, sites, transporters, vehicles, yards } from "./masters";
import { TODAY, addDays, at, byId, createRng, daysBetween, must, pad, round } from "./utils";

const rng = createRng(20261110);
const materialMap = byId(materials);
const vehicleMap = byId(vehicles);
const transporterMap = byId(transporters);
const siteMap = byId(sites);

type Spec = [
  customerId: string,
  siteId: string,
  date: string,
  items: [string, number][],
  status: OrderStatus,
  customerRef: string,
];

const specs: Spec[] = [
  [
    "CUS-001",
    "SITE-01",
    "2026-06-04",
    [
      ["MAT-001", 180],
      ["MAT-004", 120],
    ],
    "Completed",
    "SBPL/PO/0412",
  ],
  [
    "CUS-002",
    "SITE-03",
    "2026-06-09",
    [
      ["MAT-004", 300],
      ["MAT-005", 40],
    ],
    "Completed",
    "AIPL-RR3-118",
  ],
  ["CUS-003", "SITE-05", "2026-06-17", [["MAT-002", 140]], "Completed", "NSD/ABP/22"],
  ["CUS-006", "SITE-09", "2026-06-25", [["MAT-008", 45]], "Completed", "VEI/CLP/PO-781"],
  [
    "CUS-004",
    "SITE-06",
    "2026-07-02",
    [
      ["MAT-003", 90],
      ["MAT-006", 30],
    ],
    "Completed",
    "RCW-BR-07",
  ],
  [
    "CUS-005",
    "SITE-08",
    "2026-07-10",
    [
      ["MAT-007", 8],
      ["MAT-001", 100],
    ],
    "Completed",
    "KHC/W2/031",
  ],
  ["CUS-002", "SITE-04", "2026-07-18", [["MAT-004", 220]], "Completed", "AIPL-HFR-044"],
  [
    "CUS-008",
    "SITE-12",
    "2026-07-26",
    [
      ["MAT-005", 60],
      ["MAT-004", 200],
    ],
    "Completed",
    "GHPL/NH48/P7/119",
  ],
  [
    "CUS-001",
    "SITE-02",
    "2026-08-04",
    [
      ["MAT-002", 160],
      ["MAT-006", 40],
    ],
    "Completed",
    "SBPL/PO/0466",
  ],
  [
    "CUS-007",
    "SITE-11",
    "2026-08-12",
    [
      ["MAT-001", 120],
      ["MAT-007", 6],
    ],
    "Completed",
    "IR/RS/PO-09",
  ],
  [
    "CUS-003",
    "SITE-13",
    "2026-08-20",
    [
      ["MAT-003", 110],
      ["MAT-004", 130],
    ],
    "Completed",
    "NSD/BTT/05",
  ],
  [
    "CUS-006",
    "SITE-10",
    "2026-08-28",
    [
      ["MAT-008", 60],
      ["MAT-006", 35],
    ],
    "Completed",
    "VEI/TPE/PO-802",
  ],
  ["CUS-004", "SITE-07", "2026-09-03", [["MAT-002", 90]], "Completed", "RCW-PRH-02"],
  [
    "CUS-002",
    "SITE-03",
    "2026-09-08",
    [
      ["MAT-004", 280],
      ["MAT-003", 120],
    ],
    "Completed",
    "AIPL-RR3-131",
  ],
  [
    "CUS-005",
    "SITE-08",
    "2026-09-15",
    [
      ["MAT-006", 45],
      ["MAT-001", 80],
    ],
    "Completed",
    "KHC/W2/038",
  ],
  ["CUS-008", "SITE-12", "2026-09-22", [["MAT-005", 50]], "In Progress", "GHPL/NH48/P7/127"],
  [
    "CUS-001",
    "SITE-01",
    "2026-09-29",
    [
      ["MAT-001", 200],
      ["MAT-003", 100],
    ],
    "In Progress",
    "SBPL/PO/0503",
  ],
  [
    "CUS-007",
    "SITE-11",
    "2026-10-03",
    [
      ["MAT-002", 120],
      ["MAT-004", 90],
    ],
    "In Progress",
    "IR/RS/PO-14",
  ],
  [
    "CUS-003",
    "SITE-05",
    "2026-10-07",
    [
      ["MAT-006", 30],
      ["MAT-008", 25],
    ],
    "In Progress",
    "NSD/ABP/31",
  ],
  ["CUS-006", "SITE-09", "2026-10-11", [["MAT-004", 180]], "In Progress", "VEI/CLP/PO-844"],
  [
    "CUS-002",
    "SITE-04",
    "2026-10-15",
    [
      ["MAT-003", 150],
      ["MAT-002", 100],
    ],
    "In Progress",
    "AIPL-HFR-052",
  ],
  ["CUS-004", "SITE-06", "2026-10-19", [["MAT-001", 90]], "Completed", "RCW-BR-11"],
  [
    "CUS-001",
    "SITE-02",
    "2026-10-22",
    [
      ["MAT-007", 10],
      ["MAT-002", 80],
    ],
    "In Progress",
    "SBPL/PO/0521",
  ],
  ["CUS-005", "SITE-08", "2026-10-26", [["MAT-003", 70]], "On Hold", "KHC/W2/044"],
  ["CUS-008", "SITE-12", "2026-10-28", [["MAT-004", 260]], "In Progress", "GHPL/NH48/P7/136"],
  [
    "CUS-003",
    "SITE-13",
    "2026-11-01",
    [
      ["MAT-001", 140],
      ["MAT-004", 100],
    ],
    "In Progress",
    "NSD/BTT/09",
  ],
  ["CUS-002", "SITE-03", "2026-11-03", [["MAT-005", 45]], "In Progress", "AIPL-RR3-140"],
  ["CUS-006", "SITE-10", "2026-11-04", [["MAT-008", 40]], "Confirmed", "VEI/TPE/PO-861"],
  [
    "CUS-007",
    "SITE-11",
    "2026-11-05",
    [
      ["MAT-001", 90],
      ["MAT-006", 25],
    ],
    "In Progress",
    "IR/RS/PO-17",
  ],
  ["CUS-004", "SITE-07", "2026-11-07", [["MAT-003", 60]], "Confirmed", "RCW-PRH-05"],
  ["CUS-001", "SITE-01", "2026-11-08", [["MAT-004", 150]], "Draft", "SBPL/PO/0534"],
  ["CUS-005", "SITE-08", "2026-11-09", [["MAT-002", 60]], "Cancelled", "KHC/W2/047"],
];

const rateFor = (materialId: string, date: string, kind: "purchaseRate" | "sellingRate") => {
  const m = must(materialMap.get(materialId), materialId);
  const point = [...m.rateHistory].reverse().find((p) => p.date <= date) ?? m.rateHistory[0];
  return point ? point[kind] : m[kind];
};

export const orders: Order[] = specs.map(
  ([customerId, siteId, date, items, status, customerRef], i) => {
    const ref = `ORD-2026-${pad(101 + i, 4)}`;
    const orderItems: OrderItem[] = items.map(([materialId, quantity], j) => {
      const m = must(materialMap.get(materialId), materialId);
      return {
        id: `${ref}-${j + 1}`,
        materialId,
        quantity,
        unit: m.unit,
        sellingRate: rateFor(materialId, date, "sellingRate"),
      };
    });
    return {
      id: ref,
      ref,
      customerId,
      siteId,
      orderDate: date,
      customerRef,
      expectedDelivery: addDays(date, status === "Completed" ? 30 : 35),
      status,
      items: orderItems,
      notes: i % 5 === 0 ? "Deliver between 7 AM and 6 PM; site gate closes on Sundays." : "",
      createdBy: i % 3 === 0 ? "Aarav Mehta" : "Neha Kulkarni",
    };
  },
);

// ---------- Trips ----------
const shortageProne = new Set(["VEH-06", "VEH-03"]);
const activeVehicles = vehicles.filter((v) => v.active);

interface DraftTrip extends Omit<Trip, "id"> {
  sortKey: string;
}
const drafts: DraftTrip[] = [];

orders.forEach((order, orderIndex) => {
  if (order.status === "Draft" || order.status === "Cancelled") return;
  const age = daysBetween(order.orderDate, TODAY);
  const fraction =
    order.status === "Completed"
      ? 1
      : order.status === "Confirmed"
        ? 0.12
        : order.status === "On Hold"
          ? 0.35
          : Math.min(0.88, 0.25 + age / 45);
  order.items.forEach((item) => {
    const m = must(materialMap.get(item.materialId), item.materialId);
    const target = item.quantity * fraction;
    const eligibleProviders = providers.filter((p) => p.materialIds.includes(m.id));
    const loads: number[] = [];
    let sum = 0;
    while (sum < target * 0.97) {
      let load: number;
      if (m.unit === "Trips") load = 1;
      else if (m.unit === "Brass") load = rng.float(5, 7.5, 1);
      else if (m.category === "Steel") load = rng.float(9, 15, 2);
      else if (m.category === "Cement") load = rng.float(10, 16, 2);
      else load = rng.float(19, 30.5, 2);
      loads.push(load);
      sum += load;
      if (loads.length > 14) break;
    }
    const start = addDays(order.orderDate, 1);
    const end =
      order.status === "Completed"
        ? addDays(start, Math.min(rng.int(18, 32), Math.max(daysBetween(start, TODAY) - 3, 1)))
        : addDays(TODAY, -(orderIndex % 3));
    const span = Math.max(daysBetween(start, end), 0);
    loads.forEach((net, k) => {
      const date = addDays(
        start,
        loads.length === 1 ? Math.min(span, 2) : Math.round((span * k) / (loads.length - 1)),
      );
      const vehicle = rng.pick(activeVehicles);
      const transporter = must(transporterMap.get(vehicle.transporterId), vehicle.transporterId);
      const provider = rng.pick(eligibleProviders);
      const hour = rng.int(6, 15);
      const minute = rng.int(0, 59);
      const tare = round(
        vehicle.capacity > 28
          ? rng.float(14.2, 15.8)
          : vehicle.capacity < 20
            ? rng.float(7.8, 9.2)
            : rng.float(12.4, 14.1),
        2,
      );
      const isWeighed = m.unit === "MT";
      const viaWhatsApp = date >= "2026-10-01" && rng.chance(0.9);
      drafts.push({
        sortKey: `${date}T${pad(hour, 2)}${pad(minute, 2)}-${order.id}-${k}`,
        orderId: order.id,
        materialId: m.id,
        providerId: provider.id,
        purchaseId: null,
        yardId: null,
        transporterId: transporter.id,
        vehicleId: vehicle.id,
        driverId: vehicle.driverId,
        siteId: order.siteId,
        loading: {
          gross: isWeighed ? round(net + tare) : 0,
          tare: isWeighed ? tare : 0,
          net,
          slipNo: `${isWeighed ? "WB" : "LS"}-${rng.int(10000, 99999)}`,
          at: at(date, hour, minute),
          location: `${provider.city} weighbridge`,
          source: isWeighed ? "Weighbridge" : "Manual Entry",
          documentId: null,
          autoFilled: viaWhatsApp,
        },
        delivery: null,
        status: "In Transit",
        freight: transporter.ratePerTrip + (rng.chance(0.15) ? 400 : 0),
        createdVia: viaWhatsApp ? "WhatsApp" : "Manual",
        investigation: null,
      });
    });
  });
});

drafts.sort((a, b) => a.sortKey.localeCompare(b.sortKey));

// Convert some trips into stock-yard issues, only when the yard has enough balance.
export const yardPurchaseSpecs: [string, string, string, number][] = [
  ["YRD-01", "MAT-001", "2026-07-06", 150],
  ["YRD-02", "MAT-004", "2026-08-03", 220],
  ["YRD-01", "MAT-002", "2026-08-10", 200],
  ["YRD-01", "MAT-004", "2026-09-04", 180],
  ["YRD-02", "MAT-002", "2026-09-12", 140],
  ["YRD-01", "MAT-006", "2026-10-02", 60],
  ["YRD-02", "MAT-003", "2026-10-06", 100],
  ["YRD-01", "MAT-001", "2026-10-14", 120],
  ["YRD-02", "MAT-006", "2026-11-02", 40],
  ["YRD-02", "MAT-001", "2026-11-03", 90],
];
const yardBalance = new Map<string, number>();
const yardEvents = yardPurchaseSpecs.map(([yardId, materialId, date, qty]) => ({
  key: `${yardId}|${materialId}`,
  date,
  qty,
}));

drafts.forEach((trip) => {
  const date = trip.loading.at.slice(0, 10);
  yardEvents
    .filter((e) => e.date <= date)
    .forEach((e) => {
      yardBalance.set(e.key, (yardBalance.get(e.key) ?? 0) + e.qty);
      e.qty = 0;
    });
  if (!rng.chance(0.2)) return;
  const yard = yards.find(
    (y) => (yardBalance.get(`${y.id}|${trip.materialId}`) ?? 0) >= trip.loading.net,
  );
  if (!yard) return;
  const key = `${yard.id}|${trip.materialId}`;
  yardBalance.set(key, (yardBalance.get(key) ?? 0) - trip.loading.net);
  trip.yardId = yard.id;
  trip.loading.location = `${yard.name} weighbridge`;
});

const outcomesResolved: InvestigationOutcome[] = [
  "Weighbridge calibration difference",
  "Moisture / spillage loss",
  "Site measurement difference",
];

export const trips: Trip[] = drafts.map(({ sortKey: _sortKey, ...trip }, i) => {
  const id = `TRP-2026-${pad(101 + i, 5)}`;
  const m = must(materialMap.get(trip.materialId), trip.materialId);
  const vehicle = must(vehicleMap.get(trip.vehicleId), trip.vehicleId);
  const loadDate = trip.loading.at.slice(0, 10);
  const age = daysBetween(loadDate, TODAY);
  const result: Trip = { ...trip, id };
  if (age <= 0 || (age === 1 && rng.chance(0.4))) {
    result.status = age <= 0 && rng.chance(0.35) ? "Loaded" : "In Transit";
    return result;
  }
  // Delivery
  const prone = shortageProne.has(vehicle.id);
  const roll = rng.next();
  let factor: number;
  if (m.unit === "Trips") factor = 0;
  else if (roll < (prone ? 0.1 : 0.02)) factor = rng.float(2.3, 3.6);
  else if (roll < (prone ? 0.38 : 0.12)) factor = rng.float(1.15, 1.9);
  else factor = rng.float(-0.4, 0.85);
  const diff = round(m.tolerance * factor, m.unit === "Brass" ? 2 : 2);
  const net = round(trip.loading.net - diff, 2);
  const deliveryTare = round(trip.loading.tare + (m.unit === "MT" ? rng.float(-0.04, 0.04) : 0), 2);
  const deliveryDate = addDays(loadDate, trip.loading.at.slice(11, 13) >= "13" ? 1 : 0);
  const site = must(siteMap.get(trip.siteId), trip.siteId);
  result.delivery = {
    gross: m.unit === "MT" ? round(net + deliveryTare) : 0,
    tare: m.unit === "MT" ? deliveryTare : 0,
    net,
    slipNo: m.unit === "MT" ? `SW-${rng.int(10000, 99999)}` : `DC-${rng.int(1000, 9999)}`,
    at: at(deliveryDate, rng.int(9, 19), rng.int(0, 59)),
    location: m.unit === "MT" ? `${site.city} public weighbridge` : site.name,
    source:
      m.unit === "MT" ? "Weighbridge" : m.unit === "Brass" ? "Site Measurement" : "Manual Entry",
    documentId: null,
    autoFilled: trip.createdVia === "WhatsApp",
  };
  const status =
    diff <= m.tolerance
      ? "Normal"
      : diff <= m.tolerance * 2
        ? "Needs Verification"
        : "Confirmed Shortage";
  if (status === "Normal") result.status = "Delivered";
  else if (status === "Needs Verification") {
    if (loadDate < "2026-10-08") {
      result.status = "Delivered";
      result.investigation = {
        outcome: rng.pick(outcomesResolved),
        notes:
          "Cross-checked with site receiver and weighbridge operator. Difference within acceptable handling loss.",
        by: "Neha Kulkarni",
        at: at(addDays(deliveryDate, 2), 11, 20),
      };
    } else result.status = "Needs Verification";
  } else {
    result.status = "Confirmed Shortage";
    result.investigation =
      loadDate < "2026-10-01"
        ? {
            outcome: "Recovered from transporter",
            notes:
              "Shortage value deducted from the transporter's monthly bill after a joint check.",
            by: "Aarav Mehta",
            at: at(addDays(deliveryDate, 4), 16, 5),
          }
        : {
            outcome: "Under investigation",
            notes: "Asked transporter for the driver's statement; site weighbridge slip requested.",
            by: "Neha Kulkarni",
            at: at(addDays(deliveryDate, 1), 12, 40),
          };
  }
  return result;
});

// ---------- Purchases ----------
const providerRateFactor: Record<string, number> = {
  "PRV-001": 1,
  "PRV-002": 0.975,
  "PRV-003": 1,
  "PRV-004": 1,
  "PRV-005": 1,
  "PRV-006": 1.01,
};

export const purchases: Purchase[] = [];
const tripKey = (t: Trip) =>
  `${t.orderId}|${t.materialId}|${t.providerId}|${t.loading.at.slice(0, 7)}`;
const purchaseKey = new Map<Purchase, string>();
const purchaseGroups = new Map<string, Trip[]>();
trips
  .filter((t) => !t.yardId)
  .forEach((t) => {
    purchaseGroups.set(tripKey(t), [...(purchaseGroups.get(tripKey(t)) ?? []), t]);
  });

purchaseGroups.forEach((group, key) => {
  const first = must(group[0], "purchase group");
  const m = must(materialMap.get(first.materialId), first.materialId);
  const date = first.loading.at.slice(0, 10);
  const qty = round(
    group.reduce((s, t) => s + t.loading.net, 0),
    2,
  );
  const factor = providerRateFactor[first.providerId] ?? 1;
  const purchase: Purchase = {
    id: "",
    ref: "",
    providerId: first.providerId,
    materialId: m.id,
    orderId: first.orderId,
    date,
    quantity: qty,
    unit: m.unit,
    rate: Math.round(rateFor(m.id, date, "purchaseRate") * factor),
    additionalCosts: [
      { label: "Loading charges", amount: group.length * 450 },
      ...(m.category === "Sand"
        ? [{ label: "Royalty / transit pass", amount: group.length * 650 }]
        : []),
    ],
    deliveryMode: "Direct-to-Site",
    yardId: null,
    documentIds: [],
    status: date >= "2026-11-01" ? "Recorded" : "Billed",
    source: first.createdVia,
  };
  purchases.push(purchase);
  purchaseKey.set(purchase, key);
});

yardPurchaseSpecs.forEach(([yardId, materialId, date, quantity]) => {
  const m = must(materialMap.get(materialId), materialId);
  const provider = must(
    providers.find((p) => p.materialIds.includes(materialId)),
    materialId,
  );
  purchases.push({
    id: "",
    ref: "",
    providerId: provider.id,
    materialId,
    orderId: null,
    date,
    quantity,
    unit: m.unit,
    rate: Math.round(rateFor(materialId, date, "purchaseRate") * 0.985),
    additionalCosts: [{ label: "Yard unloading", amount: Math.round(quantity * 35) }],
    deliveryMode: "Stock-Yard",
    yardId,
    documentIds: [],
    status: date >= "2026-11-01" ? "Recorded" : "Billed",
    source: "Manual",
  });
});

purchases.sort((a, b) => a.date.localeCompare(b.date));
const keyToId = new Map<string, string>();
purchases.forEach((p, i) => {
  p.id = `PUR-2026-${pad(146 + i, 4)}`;
  p.ref = p.id;
  const key = purchaseKey.get(p);
  if (key) keyToId.set(key, p.id);
});
trips.forEach((t) => {
  t.purchaseId = t.yardId ? null : (keyToId.get(tripKey(t)) ?? null);
});
// One recent purchase still awaits a matching slip.
const awaiting = [...purchases].reverse().find((p) => p.deliveryMode === "Direct-to-Site");
if (awaiting) awaiting.status = "Needs Verification";

// ---------- Stock ledger ----------
export const stockMovements: StockMovement[] = [
  ...purchases
    .filter((p) => p.deliveryMode === "Stock-Yard" && p.yardId)
    .map((p): StockMovement => ({
      id: `STK-${p.id}`,
      yardId: p.yardId ?? "",
      materialId: p.materialId,
      date: p.date,
      type: "Received",
      quantity: p.quantity,
      referenceType: "Purchase",
      referenceId: p.id,
      note: "Received at yard from provider",
    })),
  ...trips
    .filter((t) => t.yardId)
    .map((t): StockMovement => ({
      id: `STK-${t.id}`,
      yardId: t.yardId ?? "",
      materialId: t.materialId,
      date: t.loading.at.slice(0, 10),
      type: "Issued",
      quantity: -t.loading.net,
      referenceType: "Trip",
      referenceId: t.id,
      note: "Issued to site",
    })),
  ...([
    {
      id: "STK-ADJ-01",
      yardId: "YRD-01",
      materialId: "MAT-001",
      date: "2026-09-30",
      type: "Adjustment",
      quantity: -1.8,
      referenceType: "Adjustment",
      referenceId: "ADJ-2026-01",
      note: "Quarterly physical count · moisture loss",
    },
    {
      id: "STK-ADJ-02",
      yardId: "YRD-02",
      materialId: "MAT-004",
      date: "2026-10-31",
      type: "Adjustment",
      quantity: -0.9,
      referenceType: "Adjustment",
      referenceId: "ADJ-2026-02",
      note: "Monthly physical count",
    },
  ] satisfies StockMovement[]),
].sort((a, b) => a.date.localeCompare(b.date));

export function unitOf(materialId: string): Unit {
  return materialMap.get(materialId)?.unit ?? "MT";
}
