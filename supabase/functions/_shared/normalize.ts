// Normalisers: turn what the model read into consistent values. They never invent a value:
// anything that cannot be parsed becomes null and is reported in `warnings`.
import type { DocType, Extraction, FieldValue, RawFields } from "./doc-types.ts";

/** "MH 12-AB 4821" → "MH12AB4821". */
export function normalizeVehicleNumber(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = String(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  return v.length >= 4 ? v : null;
}

/** "Site / 77" → "SITE77": slips are compared without spaces or separators. */
export function normalizeSlipNumber(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = String(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  return v.length ? v : null;
}

/** Indian registration like MH12AB4821 / KA01C1234 / 22BH1234AA. */
export function looksLikeIndianPlate(v: string): boolean {
  return /^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{1,4}$/.test(v) || /^\d{2}BH\d{4}[A-Z]{1,2}$/.test(v);
}

const MONTHS: Record<string, number> = {
  JAN: 1,
  FEB: 2,
  MAR: 3,
  APR: 4,
  MAY: 5,
  JUN: 6,
  JUL: 7,
  AUG: 8,
  SEP: 9,
  SEPT: 9,
  OCT: 10,
  NOV: 11,
  DEC: 12,
};

const iso = (y: number, m: number, d: number): string | null => {
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCMonth() !== m - 1) return null; // 31 Feb etc.
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
};

/** Dates on Indian slips are day-first. Returns yyyy-MM-dd or null. */
export function normalizeDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = String(value).trim().toUpperCase();
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(v);
  if (m) return iso(+m[1]!, +m[2]!, +m[3]!);
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/.exec(v);
  if (m) return iso(+m[3]!, +m[2]!, +m[1]!);
  m = /^(\d{1,2})[\s\-/.]*([A-Z]{3,4})[A-Z]*[\s\-/.,]*(\d{2,4})/.exec(v);
  if (m && MONTHS[m[2]!]) return iso(+m[3]!, MONTHS[m[2]!]!, +m[1]!);
  return null;
}

/** "1:05 PM" → "13:05"; "13.05.22" → "13:05". */
export function normalizeTime(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = /(\d{1,2})[:.](\d{2})(?:[:.]\d{2})?\s*(AM|PM|A\.M\.|P\.M\.)?/i.exec(
    String(value).trim(),
  );
  if (!m) return null;
  let h = +m[1]!;
  const min = +m[2]!;
  const ampm = m[3]?.toUpperCase().replace(/\./g, "");
  if (ampm === "PM" && h < 12) h += 12;
  if (ampm === "AM" && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/** "42,180" → 42180; "42.18 MT" → 42.18. */
export function parseNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const cleaned = String(value)
    .replace(/,/g, "")
    .match(/-?\d+(?:\.\d+)?/);
  if (!cleaned) return null;
  const n = Number(cleaned[0]);
  return Number.isFinite(n) ? n : null;
}

export type WeightUnit = "MT" | "KG" | "QUINTAL";

/** Unit as printed. null when not printed or unknown — the weights are then left unconverted. */
export function normalizeWeightUnit(value: string | null | undefined): WeightUnit | null {
  if (!value) return null;
  const v = String(value).trim().toUpperCase().replace(/\./g, "");
  if (/^(KG|KGS|KILO|KILOGRAM|KILOGRAMS)$/.test(v)) return "KG";
  if (/^(MT|T|TON|TONS|TONNE|TONNES|M\/T|METRIC TON)$/.test(v)) return "MT";
  if (/^(Q|QTL|QUINTAL|QUINTALS)$/.test(v)) return "QUINTAL";
  return null;
}

const FACTOR: Record<WeightUnit, number> = { MT: 1, KG: 0.001, QUINTAL: 0.1 };
const round3 = (n: number) => Math.round(n * 1000) / 1000;

const field = <T>(
  f: FieldValue | undefined,
  value: T | null,
  extraConfidence = 1,
): FieldValue<T> => ({
  value,
  confidence: value === null ? 0 : Math.max(0, Math.min(1, (f?.confidence ?? 0) * extraConfidence)),
  legible: Boolean(f?.legible) && value !== null,
});

/**
 * Normalises the raw fields of a weight document. Weights are converted to MT only when the
 * unit is printed (kg / quintal / MT); otherwise they are kept as read and flagged.
 */
export function normalizeExtraction(
  docType: DocType,
  docTypeConfidence: number,
  raw: RawFields,
): Extraction {
  const warnings: string[] = [];
  const readable = (f: FieldValue | undefined) => (f && f.legible !== false ? f.value : null);

  const vehicle = normalizeVehicleNumber(readable(raw.vehicle_number) as string | null);
  if (vehicle && !looksLikeIndianPlate(vehicle)) warnings.push("vehicle_number_unusual_format");
  const date = normalizeDate(readable(raw.date) as string | null);
  if (readable(raw.date) && !date) warnings.push("date_unreadable");
  const time = normalizeTime(readable(raw.time) as string | null);

  const unit = normalizeWeightUnit(readable(raw.weight_unit) as string | null);
  const toMt = (f: FieldValue | undefined): number | null => {
    const n = parseNumber(readable(f) as string | number | null);
    if (n === null) return null;
    return unit ? round3(n * FACTOR[unit]) : n;
  };
  const gross = toMt(raw.gross_weight);
  const tare = toMt(raw.tare_weight);
  const net = toMt(raw.net_weight);
  if (!unit && [gross, tare, net].some((v) => v !== null)) warnings.push("weight_unit_unknown");

  const text = (f: FieldValue | undefined) => {
    const v = readable(f);
    return v === null || v === undefined || String(v).trim() === "" ? null : String(v).trim();
  };

  return {
    doc_type: docType,
    doc_type_confidence: docTypeConfidence,
    fields: {
      vehicle_number: field(raw.vehicle_number, vehicle),
      slip_number: field(raw.slip_number, normalizeSlipNumber(text(raw.slip_number))),
      date: field(raw.date, date),
      time: field(raw.time, time),
      gross_weight: field(raw.gross_weight, gross),
      tare_weight: field(raw.tare_weight, tare),
      net_weight: field(raw.net_weight, net),
      weight_unit: field(raw.weight_unit, unit ? "MT" : null),
      material_name: field(raw.material_name, text(raw.material_name)),
      provider: field(raw.provider, text(raw.provider)),
      weighbridge_name: field(raw.weighbridge_name, text(raw.weighbridge_name)),
    },
    warnings,
  };
}
