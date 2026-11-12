// Bills read by the AI: normalise, validate, resolve the party and decide. Pure TypeScript
// (tested with Vitest). Values are never invented: anything unreadable stays null and the bill
// goes to review. The decision can only *record* a bill; approving differences and paying are
// left to people (the database enforces this too).
import type { DocType, Extraction, FieldValue } from "./doc-types.ts";
import { nameSimilarity } from "./matcher.ts";
import { normalizeDate, normalizeVehicleNumber, parseNumber } from "./normalize.ts";
import {
  PROVIDER_HEADER_FIELDS,
  PROVIDER_LINE_FIELDS,
  TRANSPORTER_HEADER_FIELDS,
  TRANSPORTER_LINE_FIELDS,
} from "./prompts/bills.ts";

export type BillKind = "provider" | "transporter";
export const billKindFor = (t: DocType): BillKind | null =>
  t === "provider_bill" ? "provider" : t === "transporter_bill" ? "transporter" : null;

type Fields = Record<string, FieldValue>;
export interface BillCharge {
  label: string | null;
  amount: number;
}
export interface BillExtraction extends Extraction {
  lines: Fields[];
  charges: BillCharge[];
  tax: Fields;
}

export const MATERIAL_UNITS = ["MT", "CFT", "BRASS", "CUM", "TRIP", "BAG", "NOS"] as const;
export type MaterialUnit = (typeof MATERIAL_UNITS)[number];

/** Unit as printed on a bill → our unit. KG and anything unknown stay null (never converted). */
export function normalizeBillUnit(value: unknown): MaterialUnit | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const v = value.trim().toUpperCase().replace(/[.\s]/g, "");
  if (/^(MT|T|TON|TONS|TONNE|TONNES|M\/T|METRICTON)$/.test(v)) return "MT";
  if (/^(CFT|CUFT|CUBICFEET|CUBICFOOT|FT3)$/.test(v)) return "CFT";
  if (/^BRASS$/.test(v)) return "BRASS";
  if (/^(CUM|CUMT|M3|CUBICMETER|CUBICMETRE|CBM)$/.test(v)) return "CUM";
  if (/^(TRIP|TRIPS|LOAD|LOADS)$/.test(v)) return "TRIP";
  if (/^(BAG|BAGS)$/.test(v)) return "BAG";
  if (/^(NOS|NO|NUMBERS|PCS|PIECES)$/.test(v)) return "NOS";
  return null;
}

export function normalizeRateBasis(value: unknown): "per_trip" | "per_mt" | null {
  if (typeof value !== "string") return null;
  const v = value.toLowerCase().replace(/[^a-z]/g, "");
  if (/^(pertrip|trip|perload|load)$/.test(v)) return "per_trip";
  if (/^(permt|mt|perton|pertonne|ton|tonne|pertons)$/.test(v)) return "per_mt";
  return null;
}

export function normalizeGstin(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return /^\d{2}[A-Z0-9]{13}$/.test(v) ? v : null;
}

const asField = (raw: unknown): FieldValue | undefined =>
  raw && typeof raw === "object" && "value" in (raw as object) ? (raw as FieldValue) : undefined;
const readable = (f: FieldValue | undefined) => (f && f.legible !== false ? f.value : null);
const out = <T extends string | number>(
  f: FieldValue | undefined,
  value: T | null,
): FieldValue => ({
  value,
  confidence: value === null ? 0 : Math.max(0, Math.min(1, f?.confidence ?? 0)),
  legible: Boolean(f?.legible) && value !== null,
});

const DATE_FIELDS = new Set(["bill_date", "due_date", "date", "period_from", "period_to"]);

function normalizeField(
  name: string,
  type: "string" | "number",
  raw: unknown,
  warnings: string[],
  where: string,
): FieldValue {
  const f = asField(raw);
  const v = readable(f);
  if (v === null || v === undefined || String(v).trim() === "") return out(f, null);
  if (type === "number") {
    const n = parseNumber(v as string | number);
    if (n === null) warnings.push(`${where}${name}_unreadable`);
    return out(f, n);
  }
  const text = String(v).trim();
  if (DATE_FIELDS.has(name)) {
    const d = normalizeDate(text);
    if (!d) warnings.push(`${where}${name}_unreadable`);
    return out(f, d);
  }
  if (name === "vehicle_number") return out(f, normalizeVehicleNumber(text));
  if (name === "unit") {
    const u = normalizeBillUnit(text);
    if (!u) warnings.push(`${where}unit_unknown`);
    return out(f, u);
  }
  if (name === "rate_basis") return out(f, normalizeRateBasis(text));
  if (name.endsWith("_gstin")) {
    const g = normalizeGstin(text);
    if (!g) warnings.push(`${where}${name}_invalid`);
    return out(f, g);
  }
  return out(f, text);
}

const isEmptyLine = (l: Fields) => Object.values(l).every((f) => f.value === null);

export function normalizeBill(
  docType: DocType,
  docTypeConfidence: number,
  raw: Record<string, unknown>,
): BillExtraction {
  const kind = billKindFor(docType);
  if (!kind) throw new Error(`${docType} is not a bill`);
  const warnings: string[] = [];
  const headerDef = kind === "provider" ? PROVIDER_HEADER_FIELDS : TRANSPORTER_HEADER_FIELDS;
  const lineDef = kind === "provider" ? PROVIDER_LINE_FIELDS : TRANSPORTER_LINE_FIELDS;
  const fields: Fields = {};
  for (const [name, type] of headerDef)
    fields[name] = normalizeField(name, type, raw[name], warnings, "");

  const rawLines = raw[kind === "provider" ? "line_items" : "trip_lines"];
  const lines = (Array.isArray(rawLines) ? rawLines : [])
    .map((r, i) => {
      const row = (r ?? {}) as Record<string, unknown>;
      const l: Fields = {};
      for (const [name, type] of lineDef)
        l[name] = normalizeField(name, type, row[name], warnings, `line${i + 1}_`);
      return l;
    })
    .filter((l) => !isEmptyLine(l));

  const charges: BillCharge[] = [];
  for (const c of Array.isArray(raw.additional_charges) ? raw.additional_charges : []) {
    const row = (c ?? {}) as Record<string, unknown>;
    const amount = parseNumber(readable(asField(row.amount)) as string | number | null);
    const label = readable(asField(row.label));
    if (amount === null) {
      warnings.push("charge_amount_unreadable");
      continue;
    }
    charges.push({ label: label === null ? null : String(label).trim() || null, amount });
  }

  const tax: Fields = {};
  const rawTax = (raw.tax ?? {}) as Record<string, unknown>;
  for (const name of ["taxable_amount", "gst_rate", "cgst", "sgst", "igst", "tax_total"])
    tax[name] = normalizeField(name, "number", rawTax[name], warnings, "tax_");

  if (kind === "transporter") {
    const vehicles = (Array.isArray(raw.vehicle_numbers) ? raw.vehicle_numbers : []).map(asField);
    const plates = vehicles
      .map((v) => normalizeVehicleNumber(readable(v) as string | null))
      .filter((v): v is string => Boolean(v));
    const minConf = Math.min(1, ...vehicles.map((v) => v?.confidence ?? 0));
    fields.vehicle_numbers = {
      value: plates.join(", ") || null,
      confidence: plates.length ? minConf : 0,
      legible: plates.length > 0,
    };
  }

  return {
    doc_type: docType,
    doc_type_confidence: docTypeConfidence,
    fields,
    lines,
    charges,
    tax,
    warnings,
  };
}

export interface BillValidation {
  problems: string[];
  missing: string[];
  overallConfidence: number;
  lineTotal: number;
  chargeTotal: number;
  taxTotal: number;
  computedTotal: number;
  printedTotal: number | null;
  totalsConsistent: boolean;
  computedLineAmounts: number;
}

const num = (f: FieldValue | undefined) => (typeof f?.value === "number" ? f.value : null);
const r2 = (n: number) => Math.round(n * 100) / 100;

export function validateBill(e: BillExtraction): BillValidation {
  const kind = billKindFor(e.doc_type)!;
  const problems: string[] = [];
  const nameKey = kind === "provider" ? "provider_name" : "transporter_name";
  const gstinKey = kind === "provider" ? "provider_gstin" : "transporter_gstin";
  const missing = ["bill_number", "bill_date", "total_amount"].filter(
    (k) => e.fields[k]?.value === null,
  );
  if (e.fields[nameKey]?.value === null && e.fields[gstinKey]?.value === null)
    missing.push(nameKey);

  const essential = ["bill_number", "bill_date", "total_amount", nameKey]
    .map((k) => e.fields[k])
    .filter((f): f is FieldValue => Boolean(f && f.value !== null));
  const lineConf = e.lines.flatMap((l) =>
    [l.amount, l.quantity].filter((f): f is FieldValue => Boolean(f && f.value !== null)),
  );
  const confs = [
    e.doc_type_confidence,
    ...essential.map((f) => f.confidence),
    ...lineConf.map((f) => f.confidence),
  ];
  const overallConfidence = confs.length ? Math.min(...confs) : 0;

  let computedLineAmounts = 0;
  const lineTotal = r2(
    e.lines.reduce((s, l) => {
      const a = num(l.amount);
      if (a !== null) return s + a;
      const q = num(l.quantity);
      const r = num(l.rate);
      if (q !== null && r !== null) {
        computedLineAmounts++;
        return s + q * r;
      }
      return s;
    }, 0),
  );
  const linesWithoutAmount = e.lines.filter(
    (l) => num(l.amount) === null && (num(l.quantity) === null || num(l.rate) === null),
  ).length;
  if (linesWithoutAmount) problems.push(`${linesWithoutAmount} line(s) have no readable amount`);
  if (kind === "transporter" && e.lines.length === 0)
    problems.push("the bill has no trip-wise lines");

  const chargeTotal = r2(e.charges.reduce((s, c) => s + c.amount, 0));
  const tf = e.tax;
  const taxTotal = r2(
    num(tf.tax_total) ?? (num(tf.cgst) ?? 0) + (num(tf.sgst) ?? 0) + (num(tf.igst) ?? 0),
  );
  const printedTotal = num(e.fields.total_amount);
  const computedTotal = r2(lineTotal + chargeTotal + taxTotal);
  // Single-material bills may print only header quantity × rate without a table.
  const headerOnly = kind === "provider" && e.lines.length === 0;
  const headerAmount = headerOnly ? num(e.fields.subtotal) : null;
  const effectiveComputed =
    headerOnly && headerAmount !== null ? r2(headerAmount + chargeTotal + taxTotal) : computedTotal;
  const totalsConsistent =
    printedTotal !== null &&
    Math.abs(effectiveComputed - printedTotal) <= Math.max(1, printedTotal * 0.005);
  if (printedTotal !== null && !totalsConsistent)
    problems.push(
      `lines + charges + tax = ₹${effectiveComputed} but the bill total is ₹${printedTotal}`,
    );
  if (kind === "transporter") {
    const trips = num(e.fields.number_of_trips);
    if (trips !== null && e.lines.length && trips !== e.lines.length)
      problems.push(`the bill says ${trips} trips but lists ${e.lines.length}`);
  }
  if (headerOnly && (num(e.fields.quantity) === null || headerAmount === null))
    problems.push("the bill has no line items and no readable quantity / amount");

  return {
    problems,
    missing,
    overallConfidence,
    lineTotal,
    chargeTotal,
    taxTotal,
    computedTotal: effectiveComputed,
    printedTotal,
    totalsConsistent,
    computedLineAmounts,
  };
}

export interface Party {
  id: string;
  name: string;
  gstin: string | null;
}
export type PartyMatch =
  | { status: "resolved"; party: Party; by: "gstin" | "name" }
  | { status: "none" }
  | { status: "ambiguous"; parties: Party[] };

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** GSTIN first, then a clearly best name match. Never picks between close candidates. */
export function resolveParty(
  name: string | null,
  gstin: string | null,
  parties: Party[],
): PartyMatch {
  if (gstin) {
    const byGstin = parties.filter((p) => p.gstin && p.gstin.toUpperCase() === gstin);
    if (byGstin.length === 1) return { status: "resolved", party: byGstin[0]!, by: "gstin" };
  }
  if (!name) return { status: "none" };
  const scored = parties
    .map((p) => ({
      p,
      s: squash(p.name) === squash(name) ? 1 : (nameSimilarity(name, p.name) ?? 0),
    }))
    .filter((x) => x.s >= 0.75)
    .sort((a, b) => b.s - a.s);
  if (!scored.length) return { status: "none" };
  if (scored.length === 1 || scored[0]!.s - scored[1]!.s >= 0.2)
    return { status: "resolved", party: scored[0]!.p, by: "name" };
  return { status: "ambiguous", parties: scored.slice(0, 5).map((x) => x.p) };
}

export interface MaterialRef {
  id: string;
  name: string;
}
export function resolveMaterial(name: unknown, materials: MaterialRef[]): string | null {
  if (typeof name !== "string" || !name.trim()) return null;
  const scored = materials
    .map((m) => ({
      m,
      s: squash(m.name) === squash(name) ? 1 : (nameSimilarity(name, m.name) ?? 0),
    }))
    .filter((x) => x.s >= 0.75)
    .sort((a, b) => b.s - a.s);
  if (!scored.length) return null;
  if (scored.length > 1 && scored[0]!.s - scored[1]!.s < 0.2) return null;
  return scored[0]!.m.id;
}

export type BillDecision =
  | {
      action: "record_bill";
      kind: BillKind;
      bill: Record<string, unknown>;
      items: Record<string, unknown>[];
      detail: unknown;
    }
  | { action: "needs_review"; review_reason: string; detail: unknown };

export function decideBill(input: {
  extraction: BillExtraction;
  validation: BillValidation;
  party: PartyMatch;
  materials: MaterialRef[];
  confidenceThreshold: number;
}): BillDecision {
  const { extraction: e, validation: v, party } = input;
  const kind = billKindFor(e.doc_type)!;
  const label = kind === "provider" ? "provider" : "transporter";
  const nameKey = kind === "provider" ? "provider_name" : "transporter_name";
  const printedName = (e.fields[nameKey]?.value as string | null) ?? null;
  const detail = {
    checks: {
      problems: v.problems,
      missing: v.missing,
      line_total: v.lineTotal,
      charges: v.chargeTotal,
      tax: v.taxTotal,
      computed_total: v.computedTotal,
      printed_total: v.printedTotal,
      warnings: e.warnings,
    },
    overall_confidence: v.overallConfidence,
    party:
      party.status === "resolved"
        ? { id: party.party.id, name: party.party.name, by: party.by }
        : party,
  };
  const review = (review_reason: string, explanation: string): BillDecision => ({
    action: "needs_review",
    review_reason,
    detail: { ...detail, explanation },
  });

  if (v.missing.length)
    return review(
      "missing_essential_info",
      `Could not read: ${v.missing.map((m) => m.replace(/_/g, " ")).join(", ")}.`,
    );
  if (party.status === "none")
    return review(
      "no_match",
      `No ${label} named "${printedName ?? "?"}" in your masters. Add or pick the ${label} in review.`,
    );
  if (party.status === "ambiguous")
    return review(
      "multiple_possible_matches",
      `"${printedName}" could be ${party.parties.map((p) => p.name).join(" or ")}.`,
    );
  if (v.overallConfidence < input.confidenceThreshold)
    return review(
      "low_confidence",
      `Some values were hard to read (confidence ${Math.round(v.overallConfidence * 100)}%).`,
    );
  if (v.problems.length) return review("financial_discrepancy", v.problems.join("; ") + ".");

  const f = (k: string) => e.fields[k]?.value ?? null;
  const bill: Record<string, unknown> = {
    party_id: party.party.id,
    bill_number: f("bill_number"),
    bill_date: f("bill_date"),
    due_date: f("due_date"),
    total_amount: f("total_amount"),
    tax_amount: v.taxTotal,
    additional_charges: e.charges
      .filter((c) => c.amount > 0)
      .map((c) => ({ label: c.label ?? "Charge", amount: c.amount })),
  };
  if (kind === "transporter") {
    bill.period_from = f("period_from");
    bill.period_to = f("period_to");
    bill.rate_basis = f("rate_basis");
    bill.rate = f("rate");
  }
  const lineValue = (l: Fields, k: string) => l[k]?.value ?? null;
  let items: Record<string, unknown>[] = e.lines.map((l) => ({
    date: lineValue(l, "date"),
    reference: lineValue(l, "reference"),
    vehicle_number: lineValue(l, "vehicle_number"),
    ...(kind === "provider"
      ? {
          material_id: resolveMaterial(
            lineValue(l, "material_name") ?? f("material_name"),
            input.materials,
          ),
          unit: lineValue(l, "unit") ?? f("unit"),
        }
      : {}),
    quantity: lineValue(l, "quantity"),
    rate: lineValue(l, "rate"),
    amount: lineValue(l, "amount"),
  }));
  if (kind === "provider" && items.length === 0) {
    // Header-only bill: one line from the printed header values.
    items = [
      {
        date: f("bill_date"),
        reference: null,
        vehicle_number: null,
        material_id: resolveMaterial(f("material_name"), input.materials),
        unit: f("unit"),
        quantity: f("quantity"),
        rate: f("rate"),
        amount: f("subtotal"),
      },
    ];
  }
  return {
    action: "record_bill",
    kind,
    bill,
    items,
    detail: { ...detail, explanation: `recorded for ${party.party.name}` },
  };
}
