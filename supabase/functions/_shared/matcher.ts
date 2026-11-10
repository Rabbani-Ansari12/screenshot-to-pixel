// Matching engine: which truck trip does a weight document belong to?
// Pure functions (no I/O) so every rule is unit-tested in matcher.test.ts.
import type { Extraction, ReviewReason } from "./doc-types.ts";
import type { ValidationResult } from "./validate.ts";

export type Criterion =
  | "vehicle"
  | "slip_or_trip_code"
  | "time"
  | "material"
  | "provider"
  | "transporter"
  | "order"
  | "destination"
  | "existing_records";

export const DEFAULT_WEIGHTS: Record<Criterion, number> = {
  vehicle: 0.35,
  slip_or_trip_code: 0.15,
  time: 0.2,
  material: 0.1,
  provider: 0.08,
  transporter: 0.04,
  order: 0.04,
  destination: 0.04,
  existing_records: 0.05,
};

export interface MatchConfig {
  weights: Partial<Record<Criterion, number>>;
  /** A candidate needs at least this score (0–1). */
  threshold: number;
  /** …and must lead the runner-up by at least this much. */
  margin: number;
  /** Documents may arrive late: how far from loading time a slip can still match. */
  windowHours: number;
  /** Allowed |net difference| (MT) when a slip is attached as evidence to a typed-in weight. */
  netTolerance: number;
  /** Minimum overall extraction confidence for automatic recording. */
  confidenceThreshold: number;
}

/** A trip as the worker loads it from v_trip_list. */
export interface CandidateTrip {
  id: string;
  trip_code: string;
  status: string;
  unit: string;
  vehicle_number: string;
  loaded_at: string | null;
  delivered_at: string | null;
  loading_weight_id: string | null;
  delivery_weight_id: string | null;
  loading_slip_number: string | null;
  delivery_slip_number: string | null;
  loading_net: number | null;
  delivered_net: number | null;
  loading_document_id: string | null;
  delivery_document_id: string | null;
  material_name: string | null;
  provider_name: string | null;
  transporter_name: string | null;
  order_code: string | null;
  site_name: string | null;
}

export interface CriterionScore {
  criterion: Criterion;
  score: number;
  weight: number;
  applicable: boolean;
  detail: string;
}

export interface CandidateScore {
  tripId: string;
  tripCode: string;
  score: number;
  recordType: "loading" | "delivery";
  breakdown: CriterionScore[];
  /** Why the trip cannot take this document (then score is 0). */
  excluded: string | null;
}

export type Decision =
  | {
      action: "auto_record";
      tripId: string;
      recordType: "loading" | "delivery";
      candidate: CandidateScore;
    }
  | { action: "needs_review"; reason: ReviewReason; detail: string };

// ---------- helpers ----------
const words = (s: string | null | undefined) =>
  new Set(
    String(s ?? "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 1 && !["the", "and", "pvt", "ltd", "co", "m/s", "ms"].includes(w)),
  );

/** Share of the shorter name's words found in the other (0–1). */
export function nameSimilarity(
  a: string | null | undefined,
  b: string | null | undefined,
): number | null {
  const wa = words(a);
  const wb = words(b);
  if (!wa.size || !wb.size) return null;
  let common = 0;
  for (const w of wa) if (wb.has(w)) common++;
  return common / Math.min(wa.size, wb.size);
}

export function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0]!;
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j]!;
      dp[j] = Math.min(dp[j]! + 1, dp[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length]!;
}

const normPlate = (s: string | null | undefined) =>
  String(s ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
const normSlip = (s: string | null | undefined) =>
  String(s ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
const HOUR = 3_600_000;

/** Slip date + time as an instant (IST). Date only → noon IST, flagged. */
export function documentInstant(e: Extraction): { at: number; dateOnly: boolean } | null {
  const date = e.fields["date"]?.value;
  if (typeof date !== "string") return null;
  const time = e.fields["time"]?.value;
  const t = typeof time === "string" ? time : "12:00";
  const at = Date.parse(`${date}T${t}:00+05:30`);
  return Number.isFinite(at) ? { at, dateOnly: typeof time !== "string" } : null;
}

const istDay = (ms: number) => Math.floor((ms + 5.5 * HOUR) / (24 * HOUR));

function decideRecordType(
  hint: "loading" | "delivery" | null,
  e: Extraction,
  trip: CandidateTrip,
  doc: { at: number; dateOnly: boolean } | null,
): "loading" | "delivery" {
  if (hint) return hint;
  const slip = normSlip(e.fields["slip_number"]?.value as string | null);
  if (slip && slip === normSlip(trip.loading_slip_number)) return "loading";
  if (slip && slip === normSlip(trip.delivery_slip_number)) return "delivery";
  if (
    doc &&
    trip.loaded_at &&
    !doc.dateOnly &&
    Math.abs(doc.at - Date.parse(trip.loaded_at)) <= 2 * HOUR
  )
    return "loading";
  return "delivery";
}

function timeScore(
  recordType: "loading" | "delivery",
  doc: { at: number; dateOnly: boolean } | null,
  trip: CandidateTrip,
  windowHours: number,
): Omit<CriterionScore, "criterion" | "weight"> {
  if (!doc) return { score: 0, applicable: false, detail: "no date on document" };
  if (!trip.loaded_at) return { score: 0, applicable: false, detail: "trip has no loading time" };
  const loaded = Date.parse(trip.loaded_at);
  if (doc.dateOnly) {
    const days = istDay(doc.at) - istDay(loaded);
    const s =
      recordType === "loading"
        ? days === 0
          ? 1
          : Math.abs(days) === 1
            ? 0.5
            : 0
        : days === 0 || days === 1
          ? 1
          : days > 1 && days * 24 <= windowHours
            ? 0.5
            : 0;
    return { score: s, applicable: true, detail: `${days} day(s) from loading (no time printed)` };
  }
  const hours = (doc.at - loaded) / HOUR;
  if (recordType === "loading") {
    const d = Math.abs(hours);
    const s = d <= 1 ? 1 : Math.max(0, 1 - (d - 1) / 23);
    return { score: round(s), applicable: true, detail: `${round(hours)} h from recorded loading` };
  }
  if (hours < -1)
    return { score: 0, applicable: true, detail: `${round(-hours)} h before loading` };
  if (hours <= 12) return { score: 1, applicable: true, detail: `${round(hours)} h after loading` };
  const s = Math.max(0, 1 - (hours - 12) / Math.max(1, windowHours - 12));
  return { score: round(s), applicable: true, detail: `${round(hours)} h after loading` };
}

const round = (n: number) => Math.round(n * 1000) / 1000;

// ---------- scoring ----------
export function scoreCandidate(
  e: Extraction,
  trip: CandidateTrip,
  cfg: MatchConfig,
  context: {
    recordTypeHint: "loading" | "delivery" | null;
    effectiveNet: number | null;
    documentId?: string;
  },
): CandidateScore {
  const weights = { ...DEFAULT_WEIGHTS, ...cfg.weights };
  const doc = documentInstant(e);
  const recordType = decideRecordType(context.recordTypeHint, e, trip, doc);
  const parts: CriterionScore[] = [];
  const add = (criterion: Criterion, r: Omit<CriterionScore, "criterion" | "weight">) =>
    parts.push({ criterion, weight: weights[criterion] ?? 0, ...r });

  // vehicle
  const plate = normPlate(e.fields["vehicle_number"]?.value as string | null);
  const tripPlate = normPlate(trip.vehicle_number);
  if (!plate)
    add("vehicle", { score: 0, applicable: false, detail: "no vehicle number on document" });
  else if (plate === tripPlate)
    add("vehicle", { score: 1, applicable: true, detail: `${plate} matches` });
  else {
    const dist = levenshtein(plate, tripPlate);
    add("vehicle", {
      score: dist === 1 ? 0.5 : 0,
      applicable: true,
      detail:
        dist === 1 ? `${plate} vs ${tripPlate} (one character differs)` : `${plate} ≠ ${tripPlate}`,
    });
  }

  // slip number / trip code
  const slip = normSlip(e.fields["slip_number"]?.value as string | null);
  const existingSlip = normSlip(
    recordType === "loading" ? trip.loading_slip_number : trip.delivery_slip_number,
  );
  if (slip && slip === normSlip(trip.trip_code))
    add("slip_or_trip_code", {
      score: 1,
      applicable: true,
      detail: "trip code printed on document",
    });
  else if (slip && existingSlip)
    add("slip_or_trip_code", {
      score: slip === existingSlip ? 1 : 0,
      applicable: true,
      detail:
        slip === existingSlip ? `slip ${slip} already on trip` : `trip has slip ${existingSlip}`,
    });
  else add("slip_or_trip_code", { score: 0, applicable: false, detail: "nothing to compare" });

  add("time", timeScore(recordType, doc, trip, cfg.windowHours));

  const text = (
    criterion: Criterion,
    docValue: unknown,
    tripValue: string | null,
    label: string,
  ) => {
    const sim = nameSimilarity(typeof docValue === "string" ? docValue : null, tripValue);
    if (sim === null)
      add(criterion, { score: 0, applicable: false, detail: `no ${label} to compare` });
    else
      add(criterion, {
        score: sim >= 0.5 ? 1 : sim,
        applicable: true,
        detail: `${String(docValue)} vs ${tripValue}`,
      });
  };
  text("material", e.fields["material_name"]?.value, trip.material_name, "material");
  text(
    "provider",
    recordType === "loading" ? e.fields["provider"]?.value : null,
    trip.provider_name,
    "provider",
  );
  text("transporter", e.fields["transporter"]?.value, trip.transporter_name, "transporter");
  text("order", e.fields["order_reference"]?.value, trip.order_code, "order reference");
  text("destination", e.fields["destination"]?.value, trip.site_name, "destination");

  // existing records on the trip
  const existingId = recordType === "loading" ? trip.loading_weight_id : trip.delivery_weight_id;
  const existingDoc =
    recordType === "loading" ? trip.loading_document_id : trip.delivery_document_id;
  const existingNet = recordType === "loading" ? trip.loading_net : trip.delivered_net;
  let excluded: string | null = null;
  if (trip.status === "cancelled") excluded = "trip cancelled";
  else if (trip.unit !== "MT") excluded = `trip material is measured in ${trip.unit}, not MT`;
  else if (existingDoc && existingDoc !== context.documentId)
    excluded = `${recordType} weight already recorded from another document`;
  if (!existingId)
    add("existing_records", { score: 1, applicable: true, detail: `no ${recordType} weight yet` });
  else if (
    existingNet !== null &&
    context.effectiveNet !== null &&
    Math.abs(existingNet - context.effectiveNet) <= cfg.netTolerance
  )
    add("existing_records", {
      score: 1,
      applicable: true,
      detail: `typed-in ${recordType} weight agrees`,
    });
  else
    add("existing_records", {
      score: 0,
      applicable: true,
      detail: `${recordType} weight already entered (${existingNet ?? "?"} MT)`,
    });

  const applicable = parts.filter((p) => p.applicable && p.weight > 0);
  const total = applicable.reduce((s, p) => s + p.weight, 0);
  const score =
    excluded || !total ? 0 : applicable.reduce((s, p) => s + p.weight * p.score, 0) / total;
  return {
    tripId: trip.id,
    tripCode: trip.trip_code,
    score: round(score),
    recordType,
    breakdown: parts,
    excluded,
  };
}

export function rankCandidates(
  e: Extraction,
  trips: CandidateTrip[],
  cfg: MatchConfig,
  context: {
    recordTypeHint: "loading" | "delivery" | null;
    effectiveNet: number | null;
    documentId?: string;
  },
): CandidateScore[] {
  return trips
    .map((t) => scoreCandidate(e, t, cfg, context))
    .sort((a, b) => b.score - a.score || a.tripCode.localeCompare(b.tripCode));
}

/**
 * Automatic recording only when: extraction is valid and confident, and either a verified trip
 * hint or exactly one candidate above the threshold with a clear lead. Otherwise: review.
 */
export function decide(input: {
  validation: ValidationResult;
  candidates: CandidateScore[];
  tripHintId: string | null;
  cfg: MatchConfig;
}): Decision {
  const { validation, candidates, tripHintId, cfg } = input;
  if (!validation.ok)
    return {
      action: "needs_review",
      reason: validation.reason ?? "missing_essential_info",
      detail: validation.problems.join("; "),
    };
  if (validation.overallConfidence < cfg.confidenceThreshold)
    return {
      action: "needs_review",
      reason: "low_confidence",
      detail: `confidence ${validation.overallConfidence} below ${cfg.confidenceThreshold}`,
    };

  if (tripHintId) {
    const hinted = candidates.find((c) => c.tripId === tripHintId);
    if (!hinted)
      return {
        action: "needs_review",
        reason: "no_match",
        detail: "the chosen trip could not be loaded",
      };
    const vehicle = hinted.breakdown.find((b) => b.criterion === "vehicle");
    if (!vehicle?.applicable || vehicle.score < 1)
      return {
        action: "needs_review",
        reason: "vehicle_mismatch",
        detail: `chosen trip ${hinted.tripCode}: ${vehicle?.detail ?? "no vehicle"}`,
      };
    if (hinted.excluded)
      return {
        action: "needs_review",
        reason: "conflicting_weight_values",
        detail: hinted.excluded,
      };
    return {
      action: "auto_record",
      tripId: hinted.tripId,
      recordType: hinted.recordType,
      candidate: hinted,
    };
  }

  const eligible = candidates.filter((c) => !c.excluded);
  const [top, second] = eligible;
  if (!top || top.score < cfg.threshold)
    return {
      action: "needs_review",
      reason: "no_match",
      detail: top
        ? `best ${top.tripCode} scored ${top.score} (needs ${cfg.threshold})`
        : "no open trip for this vehicle and time",
    };
  if (second && top.score - second.score < cfg.margin)
    return {
      action: "needs_review",
      reason: "multiple_possible_matches",
      detail: `${top.tripCode} ${top.score} vs ${second.tripCode} ${second.score}`,
    };
  const vehicle = top.breakdown.find((b) => b.criterion === "vehicle");
  if (!vehicle?.applicable || vehicle.score < 1)
    return {
      action: "needs_review",
      reason: "vehicle_mismatch",
      detail: vehicle?.detail ?? "no vehicle number",
    };
  return { action: "auto_record", tripId: top.tripId, recordType: top.recordType, candidate: top };
}
