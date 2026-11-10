import { describe, expect, it } from "vitest";
import type { Extraction, FieldValue } from "./doc-types.ts";
import { recordTypeFor, validateWeightExtraction } from "./validate.ts";

const fv = (value: string | number | null, confidence = 0.95): FieldValue => ({
  value,
  confidence,
  legible: value !== null,
});
const slip = (fields: Record<string, FieldValue>, warnings: string[] = []): Extraction => ({
  doc_type: "weighbridge_slip",
  doc_type_confidence: 0.97,
  fields: {
    vehicle_number: fv("MH12AB4821"),
    date: fv("2026-11-10"),
    gross_weight: fv(42.18),
    tare_weight: fv(14.06),
    net_weight: fv(28.12),
    weight_unit: fv("MT"),
    ...fields,
  },
  warnings,
});

describe("validateWeightExtraction", () => {
  it("accepts a consistent slip", () => {
    const v = validateWeightExtraction(slip({}), 0.02);
    expect(v.ok).toBe(true);
    expect(v.calculatedNet).toBe(28.12);
    expect(v.overallConfidence).toBe(0.95);
  });

  it("flags printed net ≠ gross − tare as a weight conflict", () => {
    const v = validateWeightExtraction(slip({ net_weight: fv(27.52) }), 0.02);
    expect(v.reason).toBe("conflicting_weight_values");
    expect(v.problems.join()).toMatch(/net_mismatch/);
  });

  it("allows small differences within the tolerance", () => {
    expect(validateWeightExtraction(slip({ net_weight: fv(28.13) }), 0.02).ok).toBe(true);
  });

  it("flags tare ≥ gross and implausible weights", () => {
    expect(
      validateWeightExtraction(slip({ tare_weight: fv(50), gross_weight: fv(42) }), 0.02).reason,
    ).toBe("conflicting_weight_values");
    const kgAsMt = validateWeightExtraction(
      slip({ gross_weight: fv(42180), tare_weight: fv(14060), net_weight: fv(28120) }),
      0.02,
    );
    expect(kgAsMt.problems.some((p) => p.startsWith("implausible"))).toBe(true);
  });

  it("needs the essentials: vehicle, a net weight, the date and the unit", () => {
    expect(validateWeightExtraction(slip({ vehicle_number: fv(null) }), 0.02).reason).toBe(
      "missing_essential_info",
    );
    expect(validateWeightExtraction(slip({ date: fv(null) }), 0.02).reason).toBe(
      "missing_essential_info",
    );
    expect(
      validateWeightExtraction(slip({ gross_weight: fv(null), net_weight: fv(null) }), 0.02)
        .problems,
    ).toContain("missing:net_weight");
    expect(validateWeightExtraction(slip({}, ["weight_unit_unknown"]), 0.02).problems).toContain(
      "missing:weight_unit",
    );
  });

  it("uses the printed net when gross / tare are not printed", () => {
    const v = validateWeightExtraction(
      slip({ gross_weight: fv(null), tare_weight: fv(null) }),
      0.02,
    );
    expect(v.ok).toBe(true);
    expect(v.effectiveNet).toBe(28.12);
  });

  it("overall confidence is the weakest essential field", () => {
    const v = validateWeightExtraction(slip({ vehicle_number: fv("MH12AB4821", 0.6) }), 0.02);
    expect(v.overallConfidence).toBe(0.6);
  });

  it("maps document types to loading / delivery", () => {
    expect(recordTypeFor("loading_slip")).toBe("loading");
    expect(recordTypeFor("unloading_slip")).toBe("delivery");
    expect(recordTypeFor("weighbridge_slip")).toBeNull();
  });
});
