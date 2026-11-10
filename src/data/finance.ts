import type {
  Bill,
  BillLine,
  Expense,
  ExpenseCategory,
  Invoice,
  InvoiceFlag,
  InvoiceLine,
  Payment,
  PaymentMode,
  ReconStatus,
  Trip,
} from "@/types";
import { customers, materials, providers, transporters, vehicles } from "./masters";
import { orders, purchases, trips } from "./operations";
import { TODAY, addDays, byId, createRng, daysBetween, must, pad, round } from "./utils";

const rng = createRng(4471);
const materialMap = byId(materials);
const vehicleMap = byId(vehicles);
const purchaseMap = byId(purchases);
const customerMap = byId(customers);
const orderMap = byId(orders);
const providerMap = byId(providers);
const transporterMap = byId(transporters);

const monthEnd = (month: string) =>
  addDays(`${month === "2026-12" ? "2027-01" : nextMonth(month)}-01`, -1);
function nextMonth(month: string) {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return m === 12 ? `${y + 1}-01` : `${y}-${pad(m + 1, 2)}`;
}
const billMonths = ["2026-07", "2026-08", "2026-09", "2026-10"];

// ---------- Provider & transporter bills ----------
export const bills: Bill[] = [];
let providerBillSeq = 112;
let transporterBillSeq = 41;

function pushBill(kind: Bill["kind"], partyId: string, month: string, group: Trip[]) {
  const date = addDays(monthEnd(month), 3);
  const terms = kind === "Provider" ? (providerMap.get(partyId)?.paymentTermsDays ?? 30) : 21;
  const lines: BillLine[] = group.map((t, i) => {
    const plate = vehicleMap.get(t.vehicleId)?.plate ?? "";
    if (kind === "Provider") {
      const rate = purchaseMap.get(t.purchaseId ?? "")?.rate ?? 0;
      return {
        id: `L${i + 1}`,
        billedRef: t.loading.slipNo,
        date: t.loading.at.slice(0, 10),
        vehicle: plate,
        quantity: t.loading.net,
        rate,
        amount: Math.round(t.loading.net * rate),
        tripId: t.id,
      };
    }
    return {
      id: `L${i + 1}`,
      billedRef: `${t.loading.slipNo} / ${plate}`,
      date: t.loading.at.slice(0, 10),
      vehicle: plate,
      quantity: 1,
      rate: t.freight,
      amount: t.freight,
      tripId: t.id,
    };
  });
  const first = must(group[0], "bill group");
  const prefix =
    kind === "Provider"
      ? (providerMap.get(partyId)?.name ?? "PB")
          .split(" ")
          .map((w) => w[0])
          .join("")
          .slice(0, 3)
          .toUpperCase()
      : (transporterMap.get(partyId)?.name ?? "TB")
          .split(" ")
          .map((w) => w[0])
          .join("")
          .slice(0, 3)
          .toUpperCase();
  const seq = kind === "Provider" ? providerBillSeq++ : transporterBillSeq++;
  const bill: Bill = {
    id: `${kind === "Provider" ? "PB" : "TB"}-2026-${pad(seq, 3)}`,
    billNo: `${prefix}/26-${seq}`,
    kind,
    partyId,
    date,
    dueDate: addDays(date, terms),
    documentId: null,
    lines,
    expectedTripIds: group.map((t) => t.id),
    taxRate: kind === "Provider" ? (materialMap.get(first.materialId)?.gstRate ?? 5) : 12,
    reconStatus: month < "2026-10" ? "Reconciled" : "Matched",
    reconNote: month < "2026-10" ? "All lines matched to recorded trips." : "",
  };
  bills.push(bill);
  return bill;
}

const groupBy = (items: Trip[], key: (t: Trip) => string) => {
  const map = new Map<string, Trip[]>();
  items.forEach((t) => map.set(key(t), [...(map.get(key(t)) ?? []), t]));
  return map;
};

billMonths.forEach((month) => {
  const monthTrips = trips.filter((t) => t.loading.at.startsWith(month));
  groupBy(
    monthTrips.filter((t) => !t.yardId),
    (t) => t.providerId,
  ).forEach((group, partyId) => pushBill("Provider", partyId, month, group));
  groupBy(monthTrips, (t) => t.transporterId).forEach((group, partyId) =>
    pushBill("Transporter", partyId, month, group),
  );
});

function setRecon(bill: Bill | undefined, status: ReconStatus, note: string) {
  if (!bill) return;
  bill.reconStatus = status;
  bill.reconNote = note;
}
const octBill = (kind: Bill["kind"], partyId: string) =>
  bills.find((b) => b.kind === kind && b.partyId === partyId && b.date.startsWith("2026-11"));
const sepBill = (kind: Bill["kind"], partyId: string) =>
  bills.find((b) => b.kind === kind && b.partyId === partyId && b.date.startsWith("2026-10"));

// Sahyadri: one line billed 2.4 MT more than the slip.
const sahyadri = octBill("Provider", "PRV-001");
if (sahyadri?.lines[1]) {
  const line = sahyadri.lines[1];
  line.quantity = round(line.quantity + 2.4);
  line.amount = Math.round(line.quantity * line.rate);
  setRecon(sahyadri, "Mismatch", "");
}
// BlueRock: rate billed above agreed purchase rate.
const bluerock = octBill("Provider", "PRV-002");
if (bluerock) {
  bluerock.lines.forEach((l) => {
    l.rate += 35;
    l.amount = Math.round(l.quantity * l.rate);
  });
  setRecon(bluerock, "Mismatch", "");
}
// Bhima: one recorded trip is missing from the bill.
const bhima = octBill("Provider", "PRV-003");
if (bhima && bhima.lines.length > 2) {
  bhima.lines.splice(2, 1);
  setRecon(bhima, "Unreconciled", "");
}
setRecon(
  sepBill("Provider", "PRV-006"),
  "Disputed",
  "Disputed: provider billed full 15 MT for a trip where the slip shows 12.84 MT. Awaiting credit note.",
);
const metroSep = sepBill("Provider", "PRV-006");
if (metroSep?.lines[0]) {
  metroSep.lines[0].quantity = 15;
  metroSep.lines[0].amount = Math.round(15 * metroSep.lines[0].rate);
}

// Western Haulage: one unknown trip billed, one recorded trip not billed.
const western = octBill("Transporter", "TRN-002");
if (western && western.lines.length > 3) {
  const removed = western.lines.splice(3, 1)[0];
  western.lines.push({
    id: "LX",
    billedRef: "WB-55102 / MH 14 GH 3168",
    date: removed?.date ?? "2026-10-19",
    vehicle: "MH 14 GH 3168",
    quantity: 1,
    rate: 6200,
    amount: 6200,
    tripId: null,
  });
  setRecon(western, "Mismatch", "");
}
const omsai = octBill("Transporter", "TRN-001");
if (omsai) {
  omsai.lines.push({
    id: "LW",
    billedRef: "Waiting charges · Ring Road site",
    date: "2026-10-24",
    vehicle: "MH 12 AB 4821",
    quantity: 1,
    rate: 1800,
    amount: 1800,
    tripId: null,
  });
  setRecon(omsai, "Unreconciled", "");
}
setRecon(
  sepBill("Transporter", "TRN-003"),
  "Difference Approved",
  "Approved ₹1,200 extra for a diversion via Talegaon on 18 Sep (owner approved).",
);
setRecon(
  octBill("Transporter", "TRN-004"),
  "Correction Requested",
  "Asked Morya Transport to remove a trip billed twice (same slip number).",
);

// ---------- Invoices ----------
export const invoices: Invoice[] = [];
const delivered = trips.filter((t) => t.delivery);
const invoiceGroups = new Map<string, Trip[]>();
delivered.forEach((t) => {
  const month = t.delivery?.at.slice(0, 7) ?? "";
  if (month === "2026-11" && (t.delivery?.at.slice(0, 10) ?? "") > "2026-11-07") return;
  const key = `${t.orderId}|${month}`;
  invoiceGroups.set(key, [...(invoiceGroups.get(key) ?? []), t]);
});

[...invoiceGroups.entries()]
  .map(([key, group]) => ({ key, group, month: key.split("|")[1] ?? "" }))
  .sort((a, b) => a.month.localeCompare(b.month) || a.key.localeCompare(b.key))
  .forEach(({ group, month }) => {
    const first = must(group[0], "invoice group");
    const order = must(orderMap.get(first.orderId), first.orderId);
    const customer = must(customerMap.get(order.customerId), order.customerId);
    const date = month === "2026-11" ? "2026-11-08" : addDays(monthEnd(month), 1);
    const lines: InvoiceLine[] = [];
    groupBy(group, (t) => t.materialId).forEach((mTrips, materialId) => {
      const m = must(materialMap.get(materialId), materialId);
      const item = order.items.find((it) => it.materialId === materialId);
      lines.push({
        id: `L${lines.length + 1}`,
        materialId,
        description: `${m.name} · ${mTrips.length} trip${mTrips.length > 1 ? "s" : ""}`,
        tripIds: mTrips.map((t) => t.id),
        quantity: round(mTrips.reduce((s, t) => s + (t.delivery?.net ?? 0), 0)),
        unit: m.unit,
        rate: item?.sellingRate ?? m.sellingRate,
        gstRate: m.gstRate,
      });
    });
    invoices.push({
      id: "",
      number: "",
      customerId: customer.id,
      orderId: order.id,
      siteId: order.siteId,
      date,
      dueDate: addDays(date, customer.creditDays),
      lines,
      gstMode: customer.state === "Maharashtra" ? "CGST+SGST" : "IGST",
      additionalCharges: rng.chance(0.25)
        ? [{ label: "Unloading charges", amount: 500 * group.length }]
        : [],
      flags: [],
      reconStatus: month < "2026-10" ? "Reconciled" : "Matched",
      notes: "",
    });
  });

invoices.sort((a, b) => a.date.localeCompare(b.date));
invoices.forEach((inv, i) => {
  inv.number = `INV-2026-${pad(301 + i, 4)}`;
  inv.id = inv.number;
});

function flag(inv: Invoice | undefined, flags: InvoiceFlag[], note: string) {
  if (!inv) return;
  inv.flags = flags;
  inv.reconStatus = "Mismatch";
  inv.notes = note;
}
const novInvoices = invoices.filter((i) => i.date.startsWith("2026-11"));
const excess = novInvoices[0];
if (excess?.lines[0]) {
  excess.lines[0].quantity = round(excess.lines[0].quantity + 3.2);
  flag(
    excess,
    ["Excess quantity", "Amount difference"],
    "Invoiced quantity is 3.2 above delivery slips.",
  );
}
const wrongRate = novInvoices[1];
if (wrongRate?.lines[0]) {
  wrongRate.lines[0].rate += 40;
  flag(wrongRate, ["Wrong rate"], "Rate differs from the order's agreed rate.");
}
const missing = novInvoices[2];
const inTransit =
  trips.find((t) => !t.delivery && t.orderId === missing?.orderId) ??
  trips.find((t) => !t.delivery);
if (missing?.lines[0] && inTransit) {
  missing.lines[0].tripIds.push(inTransit.id);
  flag(
    missing,
    ["Missing delivery records"],
    `${inTransit.id} is included but has no delivery slip yet.`,
  );
}
const mismatchSource = novInvoices[3];
if (mismatchSource?.lines[0]) {
  const foreign = delivered.find(
    (t) =>
      t.orderId !== mismatchSource.orderId &&
      t.delivery?.at.startsWith("2026-11") &&
      t.materialId === mismatchSource.lines[0]?.materialId,
  );
  if (foreign) {
    mismatchSource.lines[0].tripIds.push(foreign.id);
    flag(
      mismatchSource,
      ["Order mismatch"],
      `${foreign.id} belongs to ${foreign.orderId}, not this order.`,
    );
  }
}
const dupSource = novInvoices[4];
if (dupSource) {
  const dup: Invoice = {
    ...dupSource,
    id: `INV-2026-${pad(301 + invoices.length, 4)}`,
    number: `INV-2026-${pad(301 + invoices.length, 4)}`,
    date: "2026-11-09",
    dueDate: addDays("2026-11-09", 30),
    lines: dupSource.lines.map((l) => ({ ...l, tripIds: [...l.tripIds] })),
  };
  flag(dup, ["Duplicate invoice"], `Same trips already invoiced on ${dupSource.number}.`);
  invoices.push(dup);
}

export const invoiceTotal = (inv: Invoice) => {
  const sub =
    inv.lines.reduce((s, l) => s + l.quantity * l.rate, 0) +
    inv.additionalCharges.reduce((s, c) => s + c.amount, 0);
  const tax = inv.lines.reduce((s, l) => s + (l.quantity * l.rate * l.gstRate) / 100, 0);
  return Math.round(sub + tax);
};
export const billTotal = (bill: Bill) =>
  Math.round(bill.lines.reduce((s, l) => s + l.amount, 0) * (1 + bill.taxRate / 100));

// ---------- Payments ----------
export const payments: Payment[] = [];
const modes: PaymentMode[] = ["Bank Transfer", "Bank Transfer", "UPI", "Cheque", "Cash"];
const refFor = (mode: PaymentMode) =>
  mode === "UPI"
    ? `UPI/${rng.int(400000000, 499999999)}`
    : mode === "Cheque"
      ? `CHQ ${rng.int(100000, 999999)}`
      : mode === "Cash"
        ? "Cash voucher"
        : `UTR ${rng.int(10000000000, 99999999999)}`;

function addPayment(
  p: Omit<Payment, "id" | "ref" | "reference" | "mode" | "recordedBy" | "notes"> & {
    mode?: PaymentMode;
  },
) {
  if (p.date > TODAY || p.amount <= 0) return;
  const mode = p.mode ?? rng.pick(modes);
  payments.push({
    ...p,
    mode,
    id: "",
    ref: "",
    reference: refFor(mode),
    notes: "",
    recordedBy: rng.pick(["Rohit Deshmukh", "Rohit Deshmukh", "Aarav Mehta"]),
  });
}

invoices.forEach((inv) => {
  if (inv.flags.length) return;
  const total = invoiceTotal(inv);
  const age = daysBetween(inv.date, TODAY);
  const base = {
    direction: "Incoming" as const,
    partyType: "Customer" as const,
    partyId: inv.customerId,
    againstType: "Invoice" as const,
    againstId: inv.id,
  };
  if (inv.date < "2026-09-01" || (inv.date < "2026-10-01" && rng.chance(0.85))) {
    if (rng.chance(0.4)) {
      const part = Math.round((total * 0.5) / 1000) * 1000;
      addPayment({ ...base, date: addDays(inv.date, rng.int(8, 20)), amount: part });
      addPayment({ ...base, date: addDays(inv.date, rng.int(25, 45)), amount: total - part });
    } else addPayment({ ...base, date: addDays(inv.date, rng.int(10, 40)), amount: total });
  } else if (age > 5) {
    const roll = rng.next();
    if (roll < 0.35)
      addPayment({
        ...base,
        date: addDays(inv.date, rng.int(4, Math.min(age, 30))),
        amount: total,
      });
    else if (roll < 0.75)
      addPayment({
        ...base,
        date: addDays(inv.date, rng.int(3, Math.min(age, 25))),
        amount: Math.round((total * rng.float(0.3, 0.7)) / 1000) * 1000,
      });
  }
});

bills.forEach((bill) => {
  const total = billTotal(bill);
  const base = {
    direction: "Outgoing" as const,
    partyType: bill.kind === "Provider" ? ("Provider" as const) : ("Transporter" as const),
    partyId: bill.partyId,
    againstType: "Bill" as const,
    againstId: bill.id,
  };
  if (bill.reconStatus === "Reconciled" || bill.reconStatus === "Difference Approved")
    addPayment({ ...base, date: addDays(bill.date, rng.int(7, 25)), amount: total });
  else if (bill.reconStatus === "Disputed")
    addPayment({
      ...base,
      date: addDays(bill.date, 10),
      amount: Math.round((total * 0.6) / 1000) * 1000,
    });
  else if (bill.reconStatus === "Matched" && rng.chance(0.6))
    addPayment({
      ...base,
      date: addDays(bill.date, rng.int(2, 6)),
      amount: Math.round((total * 0.5) / 1000) * 1000,
    });
  else if (rng.chance(0.4)) addPayment({ ...base, date: addDays(bill.date, 3), amount: 50000 });
});

payments.sort((a, b) => a.date.localeCompare(b.date));
payments.forEach((p, i) => {
  p.id = `PAY-2026-${pad(501 + i, 4)}`;
  p.ref = p.id;
});

// ---------- Expenses ----------
const categories: [ExpenseCategory, number, number, string][] = [
  ["Loading", 2000, 9000, "Loading labour at quarry"],
  ["Unloading", 1500, 7000, "Unloading crew at site"],
  ["Labour", 8000, 22000, "Yard handling team · weekly"],
  ["Fuel", 3000, 12000, "Diesel advance to driver"],
  ["Toll", 600, 2400, "Highway toll"],
  ["Waiting Charges", 800, 3600, "Queue delay at site gate"],
  ["Other", 500, 4000, "Weighbridge fees & sundries"],
];
const paidTo: Record<ExpenseCategory, string[]> = {
  Loading: ["Khed loading gang", "Talegaon crusher labour"],
  Unloading: ["Site unloading crew", "Bhosale labour contractor"],
  Labour: ["Hadapsar yard team", "Chakan yard team"],
  Fuel: ["HP petrol pump, Chakan", "Indian Oil, Wagholi"],
  Toll: ["FASTag recharge", "Khed–Shivapur toll plaza"],
  "Waiting Charges": ["Om Sai Logistics", "Western Haulage Co."],
  Other: ["Public weighbridge", "Office sundries"],
};
const expenseTrips = trips.filter((t) => t.loading.at < "2026-11-10");
export const expenses: Expense[] = Array.from({ length: 48 }, (_, i) => {
  const [category, min, max, description] = categories[i % categories.length] ?? categories[0]!;
  const trip = rng.pick(expenseTrips);
  const linkTrip = ["Fuel", "Toll", "Waiting Charges"].includes(category);
  const linkOrder = ["Loading", "Unloading"].includes(category);
  const date =
    linkTrip || linkOrder
      ? trip.loading.at.slice(0, 10)
      : addDays("2026-06-06", Math.round((157 * i) / 48));
  return {
    id: "",
    date,
    category,
    amount: Math.round(rng.int(min, max) / 50) * 50,
    description,
    paidTo: rng.pick(paidTo[category]),
    mode: rng.pick(["Cash", "UPI", "UPI", "Bank Transfer"] as PaymentMode[]),
    orderId: linkOrder || linkTrip ? trip.orderId : null,
    tripId: linkTrip ? trip.id : null,
    recordedBy: rng.pick(["Neha Kulkarni", "Priya Nair", "Rohit Deshmukh"]),
  };
})
  .sort((a, b) => a.date.localeCompare(b.date))
  .map((e, i) => ({ ...e, id: `EXP-2026-${pad(201 + i, 4)}` }));
