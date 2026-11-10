// Checks on a normalised extraction before anything is recorded.
import type { DocType, Extraction, ReviewReason } from "./doc-types.ts";
import { WEIGHT_DOC_TYPES } from "./doc-types.ts";

export interface ValidationResult {
  ok: boolean;
  /** First blocking problem, in priority order. */
  reason: ReviewReason | null;
  problems: string[];
  /** min(doc-type confidence, confidence of every essential field that was read). */
  overallConfidence: number;
  calculatedNet: number | null;
  effectiveNet: number | null;
  recordTypeHint: "loading" | "delivery" | null;
}

export const LIMITS = { maxGross: 80, maxTare: 40, minTare: 1, maxNet: 70, minNet: 0.05 };

const num = (e: Extraction, k: string) => {
  const v = e.fields[k]?.value;
  return typeof v === "number" ? v : null;
};

export function recordTypeFor(docType: DocType): "loading" | "delivery" | null {
  if (docType === "loading_slip") return "loading";
  if (docType === "unloading_slip" || docType === "delivery_photo") return "delivery";
  return null; // weighbridge_slip: decided by the matcher from the trip's state
}

/** Validates a weight document. `netTolerance` is the allowed |printed − (gross − tare)| in MT. */
export function validateWeightExtraction(e: Extraction, netTolerance: number): ValidationResult {
  const problems: string[] = [];
  const gross = num(e, "gross_weight");
  const tare = num(e, "tare_weight");
  const printed = num(e, "net_weight");
  const calculatedNet =
    gross !== null && tare !== null ? Math.round((gross - tare) * 1000) / 1000 : null;
  const effectiveNet = calculatedNet ?? printed;

  // Essential: vehicle number, a usable net weight, the date, and a known unit.
  const missing: string[] = [];
  if (!e.fields["vehicle_number"]?.value) missing.push("vehicle_number");
  if (effectiveNet === null) missing.push("net_weight");
  if (!e.fields["date"]?.value) missing.push("date");
  if (e.warnings.includes("weight_unit_unknown")) missing.push("weight_unit");
  problems.push(...missing.map((m) => `missing:${m}`));

  let conflict = false;
  if (gross !== null && tare !== null && tare >= gross) {
    problems.push("tare_not_below_gross");
    conflict = true;
  }
  if (
    calculatedNet !== null &&
    printed !== null &&
    Math.abs(calculatedNet - printed) > netTolerance + 1e-9
  ) {
    problems.push(`net_mismatch:printed=${printed},calculated=${calculatedNet}`);
    conflict = true;
  }
  if (gross !== null && (gross > LIMITS.maxGross || gross <= 0)) {
    problems.push(`implausible_gross:${gross}`);
    conflict = true;
  }
  if (tare !== null && (tare > LIMITS.maxTare || tare < LIMITS.minTare)) {
    problems.push(`implausible_tare:${tare}`);
    conflict = true;
  }
  if (effectiveNet !== null && (effectiveNet > LIMITS.maxNet || effectiveNet < LIMITS.minNet)) {
    problems.push(`implausible_net:${effectiveNet}`);
    conflict = true;
  }

  const essentialKeys = [
    "vehicle_number",
    "date",
    calculatedNet !== null ? "gross_weight" : "net_weight",
  ];
  if (calculatedNet !== null) essentialKeys.push("tare_weight");
  const confidences = essentialKeys
    .map((k) => e.fields[k])
    .filter((f) => f && f.value !== null)
    .map((f) => f!.confidence);
  const overallConfidence = Math.max(0, Math.min(e.doc_type_confidence, ...confidences, 1));

  const reason: ReviewReason | null = missing.length
    ? "missing_essential_info"
    : conflict
      ? "conflicting_weight_values"
      : null;
  return {
    ok: reason === null,
    reason,
    problems,
    overallConfidence: Math.round(overallConfidence * 10000) / 10000,
    calculatedNet,
    effectiveNet,
    recordTypeHint: recordTypeFor(e.doc_type),
  };
}

export const isWeightDocument = (t: DocType) => WEIGHT_DOC_TYPES.includes(t);
