import { describe, expect, it } from "vitest";
import type { Extraction, FieldValue } from "./doc-types.ts";
import {
  DEFAULT_WEIGHTS,
  decide,
  levenshtein,
  nameSimilarity,
  rankCandidates,
  type CandidateTrip,
  type MatchConfig,
} from "./matcher.ts";
import { validateWeightExtraction } from "./validate.ts";

const cfg: MatchConfig = {
  weights: DEFAULT_WEIGHTS,
  threshold: 0.7,
  margin: 0.15,
  windowHours: 72,
  netTolerance: 0.02,
  confidenceThreshold: 0.85,
};
const fv = (value: string | number | null, confidence = 0.95): FieldValue => ({
  value,
  confidence,
  legible: value !== null,
});
const unloading = (fields: Record<string, FieldValue> = {}): Extraction => ({
  doc_type: "unloading_slip",
  doc_type_confidence: 0.96,
  fields: {
    vehicle_number: fv("MH12AB4821"),
    slip_number: fv("SITE-77"),
    date: fv("2026-11-10"),
    time: fv("13:05"),
    gross_weight: fv(41.6),
    tare_weight: fv(14.05),
    net_weight: fv(27.55),
    weight_unit: fv("MT"),
    material_name: fv("River sand"),
    ...fields,
  },
  warnings: [],
});
const trip = (over: Partial<CandidateTrip> = {}): CandidateTrip => ({
  id: "t1",
  trip_code: "TRP-2026-00101",
  status: "in_transit",
  unit: "MT",
  vehicle_number: "MH12AB4821",
  loaded_at: "2026-11-10T09:00:00+05:30",
  delivered_at: null,
  loading_weight_id: "w1",
  delivery_weight_id: null,
  loading_slip_number: "WB-1001",
  delivery_slip_number: null,
  loading_net: 28.12,
  delivered_net: null,
  loading_document_id: null,
  delivery_document_id: null,
  material_name: "River Sand",
  provider_name: "Bhima River Sands",
  transporter_name: "Om Sai Logistics",
  order_code: "ORD-2026-0101",
  site_name: "Kharadi Towers",
  ...over,
});

function run(e: Extraction, trips: CandidateTrip[], hint: string | null = null) {
  const validation = validateWeightExtraction(e, cfg.netTolerance);
  const candidates = rankCandidates(e, trips, cfg, {
    recordTypeHint: validation.recordTypeHint,
    effectiveNet: validation.effectiveNet,
  });
  return { candidates, decision: decide({ validation, candidates, tripHintId: hint, cfg }) };
}

describe("helpers", () => {
  it("levenshtein and name similarity", () => {
    expect(levenshtein("MH12AB4821", "MH12AB4827")).toBe(1);
    expect(nameSimilarity("River sand (washed)", "River Sand")).toBe(1);
    expect(nameSimilarity("Crushed metal 20mm", "River Sand")).toBe(0);
    expect(nameSimilarity(null, "River Sand")).toBeNull();
  });
});

describe("scoring", () => {
  it("gives a per-criterion breakdown and skips criteria without data", () => {
    const { candidates } = run(unloading(), [trip()]);
    const c = candidates[0]!;
    expect(c.recordType).toBe("delivery");
    const by = Object.fromEntries(c.breakdown.map((b) => [b.criterion, b]));
    expect(by["vehicle"]).toMatchObject({ score: 1, applicable: true });
    expect(by["time"]).toMatchObject({ score: 1, applicable: true });
    expect(by["material"]).toMatchObject({ score: 1 });
    expect(by["order"]?.applicable).toBe(false);
    expect(c.score).toBe(1);
  });

  it("accepts late-arriving documents within the window", () => {
    const late = unloading({ date: fv("2026-11-12"), time: fv("10:00") }); // 49 h after loading
    const { candidates } = run(late, [trip()]);
    const time = candidates[0]!.breakdown.find((b) => b.criterion === "time")!;
    expect(time.score).toBeGreaterThan(0);
    expect(time.score).toBeLessThan(1);
  });

  it("gives a one-character plate difference half credit (OCR error)", () => {
    const { candidates } = run(unloading({ vehicle_number: fv("MH12AB4827") }), [trip()]);
    expect(candidates[0]!.breakdown.find((b) => b.criterion === "vehicle")!.score).toBe(0.5);
  });

  it("excludes trips already recorded from another document and non-MT trips", () => {
    const { candidates } = run(unloading(), [
      trip({
        id: "a",
        trip_code: "A",
        delivery_weight_id: "x",
        delivery_document_id: "other-doc",
        delivered_net: 27.5,
      }),
      trip({ id: "b", trip_code: "B", unit: "BRASS" }),
    ]);
    expect(candidates.every((c) => c.excluded && c.score === 0)).toBe(true);
  });

  it("decides a weighbridge slip is a loading weight when it is the trip's loading slip", () => {
    const wb: Extraction = {
      ...unloading({
        slip_number: fv("WB-1001"),
        time: fv("09:05"),
        net_weight: fv(28.12),
        gross_weight: fv(42.18),
        tare_weight: fv(14.06),
      }),
      doc_type: "weighbridge_slip",
    };
    const { candidates } = run(wb, [trip()]);
    expect(candidates[0]!.recordType).toBe("loading");
  });
});

describe("decision", () => {
  it("records automatically: one clear match, confident, valid", () => {
    const { decision } = run(unloading(), [
      trip(),
      trip({ id: "t2", trip_code: "TRP-2026-00102", vehicle_number: "MH14ZZ0001" }),
    ]);
    expect(decision).toMatchObject({ action: "auto_record", tripId: "t1", recordType: "delivery" });
  });

  it("no match when nothing scores above the threshold", () => {
    const { decision } = run(unloading({ vehicle_number: fv("KA01C1234") }), [trip()]);
    expect(decision).toMatchObject({ action: "needs_review", reason: "no_match" });
  });

  it("multiple matches when two trips are too close", () => {
    const { decision } = run(unloading({ material_name: fv(null) }), [
      trip(),
      trip({ id: "t2", trip_code: "TRP-2026-00102", loaded_at: "2026-11-10T08:30:00+05:30" }),
    ]);
    expect(decision).toMatchObject({ action: "needs_review", reason: "multiple_possible_matches" });
  });

  it("low confidence never records automatically", () => {
    const { decision } = run(
      unloading({ net_weight: fv(27.55, 0.5), gross_weight: fv(41.6, 0.5) }),
      [trip()],
    );
    expect(decision).toMatchObject({ action: "needs_review", reason: "low_confidence" });
  });

  it("weight conflicts and missing essentials go to review first", () => {
    expect(run(unloading({ net_weight: fv(26.9) }), [trip()]).decision).toMatchObject({
      reason: "conflicting_weight_values",
    });
    expect(run(unloading({ date: fv(null) }), [trip()]).decision).toMatchObject({
      reason: "missing_essential_info",
    });
  });

  it("a trip hint is verified: the vehicle must match", () => {
    expect(run(unloading(), [trip()], "t1").decision).toMatchObject({
      action: "auto_record",
      tripId: "t1",
    });
    expect(run(unloading(), [trip({ vehicle_number: "MH14ZZ0001" })], "t1").decision).toMatchObject(
      {
        action: "needs_review",
        reason: "vehicle_mismatch",
      },
    );
  });

  it("a typed-in weight that disagrees lowers the score instead of being overwritten", () => {
    const { candidates } = run(unloading(), [
      trip({ delivery_weight_id: "w2", delivered_net: 25 }),
    ]);
    expect(candidates[0]!.breakdown.find((b) => b.criterion === "existing_records")!.score).toBe(0);
  });
});
