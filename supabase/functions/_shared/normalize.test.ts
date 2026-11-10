import { describe, expect, it } from "vitest";
import {
  looksLikeIndianPlate,
  normalizeDate,
  normalizeExtraction,
  normalizeTime,
  normalizeVehicleNumber,
  normalizeWeightUnit,
  parseNumber,
} from "./normalize.ts";

const f = (value: string | number | null, confidence = 0.95, legible = true) => ({
  value,
  confidence,
  legible,
});

describe("vehicle numbers", () => {
  it("strips spaces / hyphens and upper-cases", () => {
    expect(normalizeVehicleNumber("mh 12-ab 4821")).toBe("MH12AB4821");
    expect(normalizeVehicleNumber("  ")).toBeNull();
    expect(normalizeVehicleNumber(null)).toBeNull();
  });
  it("recognises Indian plates", () => {
    expect(looksLikeIndianPlate("MH12AB4821")).toBe(true);
    expect(looksLikeIndianPlate("KA01C1234")).toBe(true);
    expect(looksLikeIndianPlate("22BH1234AA")).toBe(true);
    expect(looksLikeIndianPlate("HELLO")).toBe(false);
  });
});

describe("dates and times", () => {
  it("reads day-first Indian dates into ISO", () => {
    expect(normalizeDate("10/11/2026")).toBe("2026-11-10");
    expect(normalizeDate("10-11-26")).toBe("2026-11-10");
    expect(normalizeDate("10.11.2026 13:05")).toBe("2026-11-10");
    expect(normalizeDate("2026-11-10")).toBe("2026-11-10");
    expect(normalizeDate("10 Nov 2026")).toBe("2026-11-10");
    expect(normalizeDate("10-NOV-26")).toBe("2026-11-10");
  });
  it("returns null instead of guessing", () => {
    expect(normalizeDate("31/02/2026")).toBeNull();
    expect(normalizeDate("yesterday")).toBeNull();
    expect(normalizeDate(null)).toBeNull();
  });
  it("reads 12- and 24-hour times", () => {
    expect(normalizeTime("1:05 PM")).toBe("13:05");
    expect(normalizeTime("12:30 am")).toBe("00:30");
    expect(normalizeTime("13.05.22")).toBe("13:05");
    expect(normalizeTime("25:00")).toBeNull();
  });
});

describe("weights", () => {
  it("parses numbers with commas and units", () => {
    expect(parseNumber("42,180")).toBe(42180);
    expect(parseNumber("42.18 MT")).toBe(42.18);
    expect(parseNumber("—")).toBeNull();
  });
  it("knows units as printed", () => {
    expect(normalizeWeightUnit("Kgs")).toBe("KG");
    expect(normalizeWeightUnit("M.T.")).toBe("MT");
    expect(normalizeWeightUnit("Qtl")).toBe("QUINTAL");
    expect(normalizeWeightUnit("bags")).toBeNull();
  });
  it("converts printed kg to MT (weight to weight only) and flags a missing unit", () => {
    const kg = normalizeExtraction("weighbridge_slip", 0.9, {
      gross_weight: f(42180),
      tare_weight: f("14,060"),
      net_weight: f(28120),
      weight_unit: f("KG"),
    });
    expect(kg.fields["gross_weight"]?.value).toBe(42.18);
    expect(kg.fields["tare_weight"]?.value).toBe(14.06);
    expect(kg.fields["net_weight"]?.value).toBe(28.12);
    expect(kg.warnings).not.toContain("weight_unit_unknown");

    const noUnit = normalizeExtraction("weighbridge_slip", 0.9, {
      gross_weight: f(42180),
      weight_unit: f(null, 0, false),
    });
    expect(noUnit.fields["gross_weight"]?.value).toBe(42180); // kept as read, not converted
    expect(noUnit.warnings).toContain("weight_unit_unknown");
  });
  it("treats illegible values as null", () => {
    const e = normalizeExtraction("unloading_slip", 0.9, {
      vehicle_number: f("MH12AB4821", 0.3, false),
      slip_number: f(" site 77 "),
    });
    expect(e.fields["vehicle_number"]).toEqual({ value: null, confidence: 0, legible: false });
    expect(e.fields["slip_number"]?.value).toBe("SITE77");
    expect(
      normalizeExtraction("unloading_slip", 0.9, { slip_number: f("Site-77") }).fields[
        "slip_number"
      ]?.value,
    ).toBe("SITE77");
  });
});
