import type {
  DocumentRecord,
  DocumentType,
  ExtractedField,
  MatchCandidate,
  ProcessingStatus,
  ReviewItem,
  ReviewReason,
  TimelineEvent,
  Trip,
  WhatsAppMessage,
} from "@/types";
import { drivers, materials, providers, sites, transporters, vehicles } from "./masters";
import { trips } from "./operations";
import { billTotal, bills, payments } from "./finance";
import { TODAY, addDays, at, byId, createRng, must, pad, round } from "./utils";

const rng = createRng(9083);
const materialMap = byId(materials);
const vehicleMap = byId(vehicles);
const driverMap = byId(drivers);
const providerMap = byId(providers);
const siteMap = byId(sites);
const transporterMap = byId(transporters);

const plus = (iso: string, minutes: number) => {
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() + minutes);
  const ist = new Date(d.getTime() + 330 * 60_000);
  return `${ist.toISOString().slice(0, 19)}+05:30`;
};

function timeline(status: ProcessingStatus, receivedAt: string): TimelineEvent[] {
  const steps: TimelineEvent[] = [
    { label: "Received on WhatsApp", at: receivedAt, state: "done" },
    { label: "Information extracted", at: plus(receivedAt, 1), state: "done" },
    { label: "Matched to record", at: plus(receivedAt, 1), state: "done" },
    { label: "Recorded automatically", at: plus(receivedAt, 2), state: "done" },
  ];
  const mark = (from: number, state: TimelineEvent["state"], note?: string) =>
    steps.forEach((s, i) => {
      if (i === from) {
        s.state = state;
        if (note) s.note = note;
        if (state !== "done") s.at = state === "failed" ? s.at : null;
      }
      if (i > from) {
        s.state = "pending";
        s.at = null;
      }
    });
  if (status === "Received") mark(1, "current");
  if (status === "Processing") mark(1, "current", "Reading the document…");
  if (status === "Information Extracted") mark(2, "current", "Looking for a matching trip");
  if (status === "Matched") mark(3, "current", "Waiting for the remaining slip");
  if (status === "Needs Review") mark(2, "current", "Sent to review queue");
  if (status === "Failed") mark(1, "failed", "Could not read the document");
  if (status === "Duplicate") mark(2, "failed", "Same document already processed");
  return steps;
}

const f = (
  key: string,
  label: string,
  value: string | number,
  confidence: number,
): ExtractedField => ({ key, label, value: String(value), confidence });

function slipFields(
  trip: Trip,
  kind: "loading" | "delivery",
  baseConfidence: number,
): ExtractedField[] {
  const rec = kind === "loading" ? trip.loading : trip.delivery;
  if (!rec) return [];
  const m = must(materialMap.get(trip.materialId), trip.materialId);
  const v = must(vehicleMap.get(trip.vehicleId), trip.vehicleId);
  const c = () => Math.min(99, baseConfidence + rng.int(-3, 4));
  const fields = [
    f("slipNo", "Slip number", rec.slipNo, c()),
    f("vehicle", "Vehicle number", v.plate, c()),
    f("material", "Material", m.name, c()),
  ];
  if (m.unit === "MT")
    fields.push(
      f("gross", "Gross weight (MT)", rec.gross.toFixed(2), c()),
      f("tare", "Tare weight (MT)", rec.tare.toFixed(2), c()),
      f("net", "Net weight (MT)", rec.net.toFixed(2), c()),
    );
  else fields.push(f("net", `Quantity (${m.unit})`, rec.net, c()));
  fields.push(
    f("datetime", "Date & time", rec.at.slice(0, 16).replace("T", " "), c()),
    f("location", kind === "loading" ? "Weighbridge" : "Delivered at", rec.location, c()),
  );
  if (kind === "loading")
    fields.push(
      f(
        "party",
        "Supplier",
        trip.yardId ? "Own yard" : (providerMap.get(trip.providerId)?.name ?? ""),
        c(),
      ),
    );
  return fields;
}

interface Draft extends Omit<DocumentRecord, "id" | "timeline"> {
  attach?: (id: string) => void;
  bundleWith?: number;
}
const drafts: Draft[] = [];

const recentTrips = trips.filter(
  (t) => t.createdVia === "WhatsApp" && t.loading.at >= "2026-11-01",
);
const openTrips = trips.filter((t) => !t.delivery);
const reviewTrips = new Set(openTrips.slice(0, 6).map((t) => t.id));

recentTrips.forEach((trip, i) => {
  const m = must(materialMap.get(trip.materialId), trip.materialId);
  const driver = must(driverMap.get(trip.driverId), trip.driverId);
  const isToday = trip.loading.at.startsWith(TODAY);
  const loadStatus: ProcessingStatus =
    isToday && i % 4 === 0
      ? "Processing"
      : isToday && i % 4 === 1
        ? "Information Extracted"
        : i % 7 === 3
          ? "Matched"
          : "Automatically Recorded";
  const loadConfidence = loadStatus === "Matched" ? rng.int(86, 89) : rng.int(91, 98);
  const loadType: DocumentType = m.unit === "MT" ? "Weighbridge Slip" : "Loading Slip";
  drafts.push({
    type: loadType,
    fileName: `IMG-${trip.loading.at.slice(0, 10).replaceAll("-", "")}-WA${pad(rng.int(1, 9999), 4)}.jpg`,
    pages: 1,
    senderName: driver.name,
    senderPhone: driver.phone,
    source: "WhatsApp",
    receivedAt: plus(trip.loading.at, rng.int(4, 18)),
    status: loadStatus,
    confidence: loadStatus === "Processing" ? 0 : loadConfidence,
    fields: loadStatus === "Processing" ? [] : slipFields(trip, "loading", loadConfidence),
    link:
      loadStatus === "Processing" || loadStatus === "Information Extracted"
        ? null
        : { type: "Trip", id: trip.id, label: trip.id },
    corrections: [],
    messageId: null,
    duplicateOf: null,
    reviewReason: null,
    note: "",
    attach: (id) => {
      if (loadStatus !== "Processing" && loadStatus !== "Information Extracted")
        trip.loading.documentId = id;
    },
  });
  if (trip.delivery) {
    const site = must(siteMap.get(trip.siteId), trip.siteId);
    const conf = rng.int(90, 98);
    const corrected = i % 9 === 4;
    drafts.push({
      type: "Unloading Slip",
      fileName: `IMG-${trip.delivery.at.slice(0, 10).replaceAll("-", "")}-WA${pad(rng.int(1, 9999), 4)}.jpg`,
      pages: 1,
      senderName: site.contactName,
      senderPhone: site.contactPhone,
      source: "WhatsApp",
      receivedAt: plus(trip.delivery.at, rng.int(5, 25)),
      status: "Automatically Recorded",
      confidence: conf,
      fields: slipFields(trip, "delivery", conf),
      link: { type: "Trip", id: trip.id, label: trip.id },
      corrections: corrected
        ? [
            {
              field: "Net weight (MT)",
              from: (trip.delivery.net + 1).toFixed(2),
              to: trip.delivery.net.toFixed(2),
              by: "Neha Kulkarni",
              at: plus(trip.delivery.at, 90),
              reason: "Digit misread (7 read as 1); verified with printed slip.",
            },
          ]
        : [],
      messageId: null,
      duplicateOf: null,
      reviewReason: null,
      note: "",
      attach: (id) => {
        if (trip.delivery) trip.delivery.documentId = id;
      },
    });
    if (i % 3 === 0) {
      drafts.push({
        type: "Delivery Photo",
        fileName: `IMG-${trip.delivery.at.slice(0, 10).replaceAll("-", "")}-WA${pad(rng.int(1, 9999), 4)}.jpg`,
        pages: 1,
        senderName: site.contactName,
        senderPhone: site.contactPhone,
        source: "WhatsApp",
        receivedAt: plus(trip.delivery.at, rng.int(26, 30)),
        status: "Matched",
        confidence: rng.int(88, 95),
        fields: [
          f(
            "vehicle",
            "Vehicle number (from photo)",
            vehicleMap.get(trip.vehicleId)?.plate ?? "",
            91,
          ),
          f("site", "Site", site.name, 87),
          f("capturedAt", "Captured at", trip.delivery.at.slice(0, 16).replace("T", " "), 99),
        ],
        link: { type: "Trip", id: trip.id, label: trip.id },
        corrections: [],
        messageId: null,
        duplicateOf: null,
        reviewReason: null,
        note: "",
        bundleWith: drafts.length - 1,
      });
    }
  }
});

// ---------- Exceptions that need a person ----------
const reviewDrafts: {
  draftIndex: number;
  reason: ReviewReason;
  title: string;
  summary: string;
  priority: ReviewItem["priority"];
  candidates: MatchCandidate[];
  weightConflict: ReviewItem["weightConflict"];
}[] = [];
const open = openTrips.filter((t) => reviewTrips.has(t.id));
const tripAt = (n: number) => open[n % Math.max(open.length, 1)];
const crit = (
  vehicle: boolean,
  date: boolean,
  material: boolean,
  provider: boolean,
  destination: boolean,
) => ({ vehicle, date, material, provider, destination });

function reviewSlip(
  trip: Trip | undefined,
  opts: {
    reason: ReviewReason;
    title: string;
    summary: string;
    priority: ReviewItem["priority"];
    confidence: number;
    tweak?: (fields: ExtractedField[]) => void;
    candidates: MatchCandidate[];
    weightConflict?: ReviewItem["weightConflict"];
    type?: DocumentType;
    senderSite?: boolean;
  },
) {
  if (!trip) return;
  const site = must(siteMap.get(trip.siteId), trip.siteId);
  const driver = must(driverMap.get(trip.driverId), trip.driverId);
  const m = must(materialMap.get(trip.materialId), trip.materialId);
  const diff = round(m.tolerance * 0.4, 2);
  const net = round(trip.loading.net - diff);
  const fake: Trip = {
    ...trip,
    delivery: {
      ...trip.loading,
      net,
      gross: m.unit === "MT" ? round(net + trip.loading.tare) : 0,
      slipNo: `SW-${rng.int(10000, 99999)}`,
      at: at(TODAY, rng.int(8, 11), rng.int(0, 59)),
      location: `${site.city} public weighbridge`,
    },
  };
  const fields = slipFields(fake, "delivery", opts.confidence + 10);
  opts.tweak?.(fields);
  drafts.push({
    type: opts.type ?? "Unloading Slip",
    fileName: `IMG-${TODAY.replaceAll("-", "")}-WA${pad(rng.int(1, 9999), 4)}.jpg`,
    pages: 1,
    senderName: opts.senderSite === false ? driver.name : site.contactName,
    senderPhone: opts.senderSite === false ? driver.phone : site.contactPhone,
    source: "WhatsApp",
    receivedAt: at(TODAY, rng.int(8, 11), rng.int(0, 59)),
    status: "Needs Review",
    confidence: opts.confidence,
    fields,
    link: null,
    corrections: [],
    messageId: null,
    duplicateOf: null,
    reviewReason: opts.reason,
    note: opts.summary,
  });
  reviewDrafts.push({
    draftIndex: drafts.length - 1,
    reason: opts.reason,
    title: opts.title,
    summary: opts.summary,
    priority: opts.priority,
    candidates: opts.candidates,
    weightConflict: opts.weightConflict ?? null,
  });
}

const t0 = tripAt(0),
  t1 = tripAt(1),
  t2 = tripAt(2),
  t4 = tripAt(4),
  t5 = tripAt(5);
const t3 =
  openTrips.find((t) => t.loading.gross > 0 && t !== t0 && t !== t1 && t !== t4) ?? tripAt(3);
reviewSlip(t0, {
  reason: "Low confidence",
  title: "Net weight is hard to read",
  summary: "The net weight on this unloading slip was read at 61% confidence (smudged print).",
  priority: "Medium",
  confidence: 68,
  candidates: t0
    ? [{ tripId: t0.id, score: 92, criteria: crit(true, true, true, true, true) }]
    : [],
  tweak: (fields) => {
    const net = fields.find((x) => x.key === "net");
    if (net) net.confidence = 61;
  },
});
reviewSlip(t1, {
  reason: "Multiple possible matches",
  title: "Vehicle number partly unreadable",
  summary:
    "Only the last four digits of the vehicle number were readable. Three open trips could match.",
  priority: "High",
  confidence: 74,
  candidates: [t1, t2, t5]
    .filter((t): t is Trip => Boolean(t))
    .map((t, i) => ({
      tripId: t.id,
      score: [81, 74, 52][i] ?? 50,
      criteria: crit(i === 0, true, i < 2, i !== 2, i === 0),
    })),
  tweak: (fields) => {
    const v = fields.find((x) => x.key === "vehicle");
    if (v) {
      v.value = `MH ?? ?? ${v.value.slice(-4)}`;
      v.confidence = 48;
    }
  },
});
if (t3 && t3.loading.gross) {
  const printed = round(t3.loading.gross - t3.loading.tare - 0.6);
  reviewSlip(t3, {
    reason: "Conflicting weight values",
    title: "Printed net differs from gross − tare",
    summary: `Printed net is ${printed.toFixed(2)} MT but gross − tare gives ${(t3.loading.gross - t3.loading.tare).toFixed(2)} MT.`,
    priority: "High",
    confidence: 88,
    type: "Weighbridge Slip",
    senderSite: false,
    candidates: [{ tripId: t3.id, score: 95, criteria: crit(true, true, true, true, true) }],
    weightConflict: { printedNet: printed, gross: t3.loading.gross, tare: t3.loading.tare },
    tweak: (fields) => {
      const net = fields.find((x) => x.key === "net");
      const gross = fields.find((x) => x.key === "gross");
      const tare = fields.find((x) => x.key === "tare");
      if (net) {
        net.value = printed.toFixed(2);
        net.confidence = 93;
      }
      if (gross) gross.value = t3.loading.gross.toFixed(2);
      if (tare) tare.value = t3.loading.tare.toFixed(2);
    },
  });
}
reviewSlip(t4, {
  reason: "Missing essential info",
  title: "Slip number and weight missing",
  summary: "The photo shows the truck at site but no slip number or quantity is visible.",
  priority: "Medium",
  confidence: 57,
  type: "Delivery Photo",
  candidates: [t4, t0]
    .filter((t): t is Trip => Boolean(t))
    .map((t, i) => ({
      tripId: t.id,
      score: [66, 41][i] ?? 40,
      criteria: crit(i === 0, true, false, false, true),
    })),
  tweak: (fields) => {
    fields.splice(
      0,
      fields.length,
      f(
        "vehicle",
        "Vehicle number (from photo)",
        t4 ? (vehicleMap.get(t4.vehicleId)?.plate ?? "") : "",
        79,
      ),
      f("site", "Site", t4 ? (siteMap.get(t4.siteId)?.name ?? "") : "", 72),
      f("slipNo", "Slip number", "—", 0),
      f("net", "Quantity", "—", 0),
    );
  },
});

// Duplicates, failures and fresh arrivals
const recorded = drafts
  .filter((d) => d.status === "Automatically Recorded" && d.type === "Weighbridge Slip")
  .slice(0, 3);
recorded.forEach((orig, i) => {
  const { attach: _a, ...copy } = orig;
  drafts.push({
    ...copy,
    fileName: orig.fileName.replace(".jpg", "-1.jpg"),
    receivedAt: plus(orig.receivedAt, 35 + i * 50),
    status: "Duplicate",
    confidence: 97,
    link: null,
    duplicateOf: `__${drafts.indexOf(orig)}`,
    note: "Same slip number, vehicle and weights as an already processed slip.",
  });
});
const lastTrip = must(trips[trips.length - 1], "trip");
drafts.push(
  {
    type: "Delivery Photo",
    fileName: `IMG-${TODAY.replaceAll("-", "")}-WA0912.jpg`,
    pages: 1,
    senderName: "Amol Shinde",
    senderPhone: "+91 98220 44120",
    source: "WhatsApp",
    receivedAt: at(addDays(TODAY, -1), 18, 42),
    status: "Failed",
    confidence: 0,
    fields: [],
    link: null,
    corrections: [],
    messageId: null,
    duplicateOf: null,
    reviewReason: null,
    note: "Image too dark and blurred to read. Ask the sender for a clearer photo or upload manually.",
  },
  {
    type: "Other",
    fileName: "Statement_Oct_2026.pdf",
    pages: 3,
    senderName: "Harpreet Singh",
    senderPhone: "+91 98231 80550",
    source: "WhatsApp",
    receivedAt: at(addDays(TODAY, -2), 20, 5),
    status: "Failed",
    confidence: 0,
    fields: [],
    link: null,
    corrections: [],
    messageId: null,
    duplicateOf: null,
    reviewReason: null,
    note: "PDF is password-protected.",
  },
  {
    type: "Payment Receipt",
    fileName: `IMG-${TODAY.replaceAll("-", "")}-WA1288.jpg`,
    pages: 1,
    senderName: "Sunita Iyer",
    senderPhone: "+91 98231 40782",
    source: "WhatsApp",
    receivedAt: at(TODAY, 11, 52),
    status: "Received",
    confidence: 0,
    fields: [],
    link: null,
    corrections: [],
    messageId: null,
    duplicateOf: null,
    reviewReason: null,
    note: "",
  },
  {
    type: "Weighbridge Slip",
    fileName: `IMG-${TODAY.replaceAll("-", "")}-WA1301.jpg`,
    pages: 1,
    senderName: "Dattatray Kale",
    senderPhone: "+91 98224 70215",
    source: "WhatsApp",
    receivedAt: at(TODAY, 12, 18),
    status: "Information Extracted",
    confidence: 90,
    fields: [
      f("slipNo", "Slip number", "WB-60418", 96),
      f("vehicle", "Vehicle number", "MH 42 UV 1756", 93),
      f("material", "Material", "20 mm Aggregate", 91),
      f("gross", "Gross weight (MT)", "41.86", 92),
      f("tare", "Tare weight (MT)", "13.22", 90),
      f("net", "Net weight (MT)", "28.64", 92),
      f("datetime", "Date & time", `${TODAY} 12:02`, 97),
      f("location", "Weighbridge", "Khed weighbridge", 88),
    ],
    link: null,
    corrections: [],
    messageId: null,
    duplicateOf: null,
    reviewReason: null,
    note: "Looking for a matching trip…",
  },
  {
    type: "Loading Slip",
    fileName: `IMG-${TODAY.replaceAll("-", "")}-WA1290.jpg`,
    pages: 1,
    senderName: driverMap.get(lastTrip.driverId)?.name ?? "Driver",
    senderPhone: driverMap.get(lastTrip.driverId)?.phone ?? "",
    source: "WhatsApp",
    receivedAt: at(TODAY, 12, 6),
    status: "Received",
    confidence: 0,
    fields: [],
    link: null,
    corrections: [],
    messageId: null,
    duplicateOf: null,
    reviewReason: null,
    note: "",
  },
);

// Bills and receipts
const octBills = bills.filter((b) => b.date >= "2026-11-01");
octBills.forEach((bill, i) => {
  const party =
    bill.kind === "Provider" ? providerMap.get(bill.partyId) : transporterMap.get(bill.partyId);
  const manual = i % 4 === 3;
  const qty = round(bill.lines.reduce((s, l) => s + l.quantity, 0));
  drafts.push({
    type: bill.kind === "Provider" ? "Provider Bill" : "Transporter Bill",
    fileName: `${bill.billNo.replaceAll("/", "_")}.pdf`,
    pages: bill.lines.length > 12 ? 2 : 1,
    senderName: party?.contactName ?? "",
    senderPhone: party?.phone ?? "",
    source: manual ? "Manual Upload" : "WhatsApp",
    receivedAt: at(bill.date, 10 + (i % 6), 15 + i),
    status: "Automatically Recorded",
    confidence: rng.int(90, 97),
    fields: [
      f("billNo", "Bill number", bill.billNo, 97),
      f("party", bill.kind === "Provider" ? "Provider" : "Transporter", party?.name ?? "", 95),
      f("date", "Bill date", bill.date, 96),
      f(
        bill.kind === "Provider" ? "quantity" : "trips",
        bill.kind === "Provider" ? "Billed quantity" : "Trips billed",
        bill.kind === "Provider" ? qty : bill.lines.length,
        92,
      ),
      f("total", "Bill total (₹)", billTotal(bill), 94),
      f("gst", "GST rate", `${bill.taxRate}%`, 90),
    ],
    link: {
      type: bill.kind === "Provider" ? "Provider Bill" : "Transporter Bill",
      id: bill.id,
      label: bill.billNo,
    },
    corrections: [],
    messageId: null,
    duplicateOf: null,
    reviewReason: null,
    note: "",
    attach: (id) => {
      bill.documentId = id;
    },
  });
});
payments
  .filter((p) => p.direction === "Incoming" && p.date >= "2026-11-01")
  .slice(0, 3)
  .forEach((p) => {
    drafts.push({
      type: "Payment Receipt",
      fileName: `Receipt_${p.reference.replaceAll(" ", "_").replaceAll("/", "_")}.jpg`,
      pages: 1,
      senderName: "Accounts team",
      senderPhone: "+91 98220 41031",
      source: "WhatsApp",
      receivedAt: at(p.date, 15, 10),
      status: "Automatically Recorded",
      confidence: 95,
      fields: [
        f("amount", "Amount (₹)", p.amount, 97),
        f("mode", "Mode", p.mode, 94),
        f("reference", "Reference", p.reference, 92),
        f("date", "Payment date", p.date, 96),
      ],
      link: { type: "Payment", id: p.id, label: p.id },
      corrections: [],
      messageId: null,
      duplicateOf: null,
      reviewReason: null,
      note: "",
    });
  });

// ---------- Finalise ids ----------
const order = drafts
  .map((d, i) => ({ d, i }))
  .sort((a, b) => a.d.receivedAt.localeCompare(b.d.receivedAt));
const idOf = new Map<number, string>();
order.forEach(({ i }, n) => idOf.set(i, `DOC-2026-${pad(1201 + n, 4)}`));

export const documents: DocumentRecord[] = order
  .map(({ d, i }) => {
    const id = idOf.get(i) ?? "";
    d.attach?.(id);
    const { attach: _attach, bundleWith: _bundle, ...rest } = d;
    const duplicateOf = rest.duplicateOf?.startsWith("__")
      ? (idOf.get(Number(rest.duplicateOf.slice(2))) ?? null)
      : rest.duplicateOf;
    return { ...rest, id, duplicateOf, timeline: timeline(rest.status, rest.receivedAt) };
  })
  .reverse();

// ---------- Review queue ----------
export const reviewItems: ReviewItem[] = [
  ...reviewDrafts.map((r, n): ReviewItem => ({
    id: `RV-${pad(41 + n, 3)}`,
    documentId: idOf.get(r.draftIndex) ?? null,
    reason: r.reason,
    title: r.title,
    summary: r.summary,
    createdAt: drafts[r.draftIndex]?.receivedAt ?? at(TODAY, 9, 0),
    priority: r.priority,
    candidates: r.candidates,
    weightConflict: r.weightConflict,
    financial: null,
    status: "Open",
  })),
  ...octBills
    .filter((b) => b.reconStatus === "Mismatch")
    .map((b, n): ReviewItem => {
      const billed = b.lines.reduce((s, l) => s + l.amount, 0);
      const recorded = b.lines
        .filter((l) => l.tripId)
        .reduce((s, l) => {
          const t = trips.find((x) => x.id === l.tripId);
          return (
            s +
            (b.kind === "Provider"
              ? Math.round((t?.loading.net ?? 0) * (l.rate - (b.partyId === "PRV-002" ? 35 : 0)))
              : (t?.freight ?? 0))
          );
        }, 0);
      const party =
        b.kind === "Provider"
          ? providerMap.get(b.partyId)?.name
          : transporterMap.get(b.partyId)?.name;
      return {
        id: `RV-${pad(61 + n, 3)}`,
        documentId: b.documentId,
        reason: "Financial discrepancy",
        title: `${party ?? "Party"} bill differs from records`,
        summary: `Bill ${b.billNo} is ₹${Math.abs(billed - recorded).toLocaleString("en-IN")} ${billed > recorded ? "higher" : "lower"} than the trips recorded in the system.`,
        createdAt: at(b.date, 12, 30),
        priority: "High",
        candidates: [],
        weightConflict: null,
        financial: { billId: b.id, billed, recorded },
        status: "Open",
      };
    }),
];

// ---------- WhatsApp messages ----------
const texts: Record<DocumentType, string[]> = {
  "Weighbridge Slip": [
    "Loading done, slip attached.",
    "Kata slip bhej raha hoon.",
    "Truck loaded, weighbridge slip.",
  ],
  "Loading Slip": ["Loading slip for today's trip.", "Challan attached."],
  "Unloading Slip": [
    "Material received at site. Unloading slip attached.",
    "Site weighbridge slip.",
    "Received ok, slip attached.",
  ],
  "Delivery Photo": ["Photo of truck at site.", "Unloading photo."],
  "Provider Bill": ["Bill for last month's supply.", "Please find our invoice attached."],
  "Transporter Bill": ["Monthly transport bill.", "Trip bill for October."],
  "Payment Receipt": ["Payment done, receipt attached.", "NEFT done today."],
  Other: ["Statement attached."],
};
const docsAsc = [...documents].reverse().filter((d) => d.source === "WhatsApp");
export const whatsappMessages: WhatsAppMessage[] = [];
docsAsc.forEach((doc) => {
  const prev = whatsappMessages[whatsappMessages.length - 1];
  if (
    prev &&
    prev.phone === doc.senderPhone &&
    Math.abs(Date.parse(doc.receivedAt) - Date.parse(prev.at)) < 10 * 60_000
  ) {
    prev.documentIds.push(doc.id);
    doc.messageId = prev.id;
    return;
  }
  const id = `MSG-${pad(8801 + whatsappMessages.length, 5)}`;
  doc.messageId = id;
  whatsappMessages.push({
    id,
    senderName: doc.senderName,
    phone: doc.senderPhone,
    at: doc.receivedAt,
    text: rng.pick(texts[doc.type]),
    documentIds: [doc.id],
    status: doc.status,
  });
});
[
  {
    senderName: "Ramesh Jadhav",
    phone: "+91 98221 47018",
    at: at(TODAY, 7, 41),
    text: "Truck left the quarry, reaching site by 10.",
  },
  {
    senderName: "Hemant Ghule",
    phone: "+91 98811 23409",
    at: at(addDays(TODAY, -1), 17, 20),
    text: "Rate revision from 1st Dec, will share letter.",
  },
  {
    senderName: "Sunil Wagh",
    phone: "+91 98221 10450",
    at: at(addDays(TODAY, -2), 9, 5),
    text: "Two trucks available tomorrow for Wagholi.",
  },
].forEach((m, i) =>
  whatsappMessages.push({
    id: `MSG-${pad(9901 + i, 5)}`,
    ...m,
    documentIds: [],
    status: "Received",
  }),
);
whatsappMessages.sort((a, b) => b.at.localeCompare(a.at));
