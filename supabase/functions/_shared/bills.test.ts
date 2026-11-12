import { describe, expect, it } from "vitest";
import {
  decideBill,
  normalizeBill,
  normalizeBillUnit,
  normalizeRateBasis,
  resolveParty,
  validateBill,
  type Party,
} from "./bills.ts";
import type { AiClient, FieldValue } from "./doc-types.ts";
import { DEFAULT_WEIGHTS } from "./matcher.ts";
import { processDocument, type ApplyDecision, type Deps } from "../process-document/pipeline.ts";

const fv = (
  value: string | number | null,
  confidence = 0.95,
  legible = value !== null,
): FieldValue => ({
  value,
  confidence,
  legible,
});
const tax = (t: Partial<Record<string, FieldValue>> = {}) => ({
  taxable_amount: fv(null),
  gst_rate: fv(null),
  cgst: fv(null),
  sgst: fv(null),
  igst: fv(null),
  tax_total: fv(null),
  ...t,
});

const providerRaw = (over: Record<string, unknown> = {}) => ({
  bill_number: fv("BRS/101"),
  bill_date: fv("12/11/2026"),
  due_date: fv(null),
  provider_name: fv("Bhima River Sands Pvt Ltd"),
  provider_gstin: fv(null),
  material_name: fv("River Sand"),
  quantity: fv(null),
  unit: fv(null),
  rate: fv(null),
  subtotal: fv("78,474.00"),
  total_amount: fv("₹ 83,397.70"),
  line_items: [
    {
      date: fv("10/11/2026"),
      reference: fv("WB-1001"),
      vehicle_number: fv("MH 12 AB 4821"),
      material_name: fv("River Sand"),
      quantity: fv(28.12),
      unit: fv("M.T."),
      rate: fv(1450),
      amount: fv("40,774.00"),
    },
    {
      date: fv("11/11/2026"),
      reference: fv(null),
      vehicle_number: fv("MH12CD1111"),
      material_name: fv("River Sand"),
      quantity: fv(26),
      unit: fv("MT"),
      rate: fv(1450),
      amount: fv(37700),
    },
  ],
  additional_charges: [{ label: fv("Loading"), amount: fv(1000) }],
  tax: tax({ cgst: fv(1961.85), sgst: fv(1961.85) }),
  ...over,
});

const transporterRaw = (over: Record<string, unknown> = {}) => ({
  bill_number: fv("OS-55"),
  bill_date: fv("14 Nov 2026"),
  due_date: fv(null),
  transporter_name: fv("Om Sai Roadlines"),
  transporter_gstin: fv("27ABCDE1234F1Z5"),
  period_from: fv("10/11/2026"),
  period_to: fv("13/11/2026"),
  number_of_trips: fv(2),
  transport_quantity: fv(null),
  rate: fv(5800),
  rate_basis: fv("Per Trip"),
  subtotal: fv(11600),
  total_amount: fv(11600),
  vehicle_numbers: [fv("MH12AB4821"), fv("MH 12 CD 1111")],
  trip_lines: [
    {
      date: fv("10/11/2026"),
      reference: fv(null),
      vehicle_number: fv("MH12AB4821"),
      quantity: fv(null),
      rate: fv(5800),
      amount: fv(5800),
    },
    {
      date: fv("11/11/2026"),
      reference: fv(null),
      vehicle_number: fv("MH12CD1111"),
      quantity: fv(null),
      rate: fv(5800),
      amount: fv(5800),
    },
  ],
  additional_charges: [],
  tax: tax(),
  ...over,
});

const providers: Party[] = [
  { id: "p1", name: "Bhima River Sands", gstin: null },
  { id: "p2", name: "Shree Quarry Works", gstin: "27AAAAA0000A1Z5" },
];
const transporters: Party[] = [
  { id: "t1", name: "Om Sai Transport", gstin: "27ABCDE1234F1Z5" },
  { id: "t2", name: "Om Sai Roadways", gstin: null },
];
const materials = [
  { id: "m1", name: "River Sand" },
  { id: "m2", name: "20mm Aggregate" },
];

describe("bill normalisation", () => {
  it("normalises units and rate basis without converting", () => {
    expect(normalizeBillUnit("M.T.")).toBe("MT");
    expect(normalizeBillUnit("cu.ft")).toBe("CFT");
    expect(normalizeBillUnit("Brass")).toBe("BRASS");
    expect(normalizeBillUnit("KG")).toBeNull();
    expect(normalizeRateBasis("Per Trip")).toBe("per_trip");
    expect(normalizeRateBasis("per M.T.")).toBe("per_mt");
    expect(normalizeRateBasis("lump sum")).toBeNull();
  });

  it("keeps unreadable values null and reports them", () => {
    const e = normalizeBill(
      "provider_bill",
      0.95,
      providerRaw({ bill_date: fv("??/11", 0.4), total_amount: fv(null, 0.2, false) }),
    );
    expect(e.fields.bill_date!.value).toBeNull();
    expect(e.fields.total_amount!.value).toBeNull();
    expect(e.warnings).toContain("bill_date_unreadable");
    expect(e.lines).toHaveLength(2);
    expect(e.lines[0]!.vehicle_number!.value).toBe("MH12AB4821");
    expect(e.lines[0]!.amount!.value).toBe(40774);
    expect(e.lines[0]!.unit!.value).toBe("MT");
  });

  it("never computes a missing line amount silently", () => {
    const raw = providerRaw();
    (raw.line_items as Record<string, FieldValue>[])[1]!.amount = fv(null);
    const v = validateBill(normalizeBill("provider_bill", 0.95, raw));
    expect(v.computedLineAmounts).toBe(1);
  });
});

describe("bill validation and decision", () => {
  it("records a clear provider bill (party by name, material resolved)", () => {
    const e = normalizeBill("provider_bill", 0.97, providerRaw());
    const v = validateBill(e);
    expect(v.totalsConsistent).toBe(true);
    expect(v.computedTotal).toBe(83397.7);
    const d = decideBill({
      extraction: e,
      validation: v,
      party: resolveParty("Bhima River Sands Pvt Ltd", null, providers),
      materials,
      confidenceThreshold: 0.85,
    });
    expect(d.action).toBe("record_bill");
    if (d.action !== "record_bill") return;
    expect(d.bill).toMatchObject({
      party_id: "p1",
      bill_number: "BRS/101",
      bill_date: "2026-11-12",
      total_amount: 83397.7,
      tax_amount: 3923.7,
    });
    expect(d.bill.additional_charges).toEqual([{ label: "Loading", amount: 1000 }]);
    expect(d.items[0]).toMatchObject({
      material_id: "m1",
      vehicle_number: "MH12AB4821",
      quantity: 28.12,
      rate: 1450,
      amount: 40774,
      unit: "MT",
    });
  });

  it("sends a bill whose lines don't add up to review as a financial discrepancy", () => {
    const e = normalizeBill("provider_bill", 0.97, providerRaw({ total_amount: fv(90000) }));
    const d = decideBill({
      extraction: e,
      validation: validateBill(e),
      party: resolveParty("Bhima River Sands", null, providers),
      materials,
      confidenceThreshold: 0.85,
    });
    expect(d).toMatchObject({ action: "needs_review", review_reason: "financial_discrepancy" });
  });

  it("missing essentials → review, never a guess", () => {
    const e = normalizeBill("provider_bill", 0.97, providerRaw({ bill_number: fv(null) }));
    const d = decideBill({
      extraction: e,
      validation: validateBill(e),
      party: resolveParty("Bhima River Sands", null, providers),
      materials,
      confidenceThreshold: 0.85,
    });
    expect(d).toMatchObject({ action: "needs_review", review_reason: "missing_essential_info" });
  });

  it("unknown party → review (no_match)", () => {
    const e = normalizeBill(
      "provider_bill",
      0.97,
      providerRaw({ provider_name: fv("Ganga Minerals") }),
    );
    const d = decideBill({
      extraction: e,
      validation: validateBill(e),
      party: resolveParty("Ganga Minerals", null, providers),
      materials,
      confidenceThreshold: 0.85,
    });
    expect(d).toMatchObject({ action: "needs_review", review_reason: "no_match" });
  });

  it("GSTIN beats an ambiguous name; ambiguous name alone → review", () => {
    expect(resolveParty("Om Sai", "27ABCDE1234F1Z5", transporters)).toMatchObject({
      status: "resolved",
      by: "gstin",
    });
    expect(resolveParty("Om Sai", null, transporters).status).toBe("ambiguous");
  });

  it("low confidence → review", () => {
    const e = normalizeBill("provider_bill", 0.97, providerRaw({ total_amount: fv(83397.7, 0.5) }));
    const d = decideBill({
      extraction: e,
      validation: validateBill(e),
      party: resolveParty("Bhima River Sands", null, providers),
      materials,
      confidenceThreshold: 0.85,
    });
    expect(d).toMatchObject({ action: "needs_review", review_reason: "low_confidence" });
  });

  it("records a transporter bill with its rate basis and trip lines", () => {
    const e = normalizeBill("transporter_bill", 0.96, transporterRaw());
    const v = validateBill(e);
    const d = decideBill({
      extraction: e,
      validation: v,
      party: resolveParty("Om Sai Roadlines", "27ABCDE1234F1Z5", transporters),
      materials: [],
      confidenceThreshold: 0.85,
    });
    expect(d.action).toBe("record_bill");
    if (d.action !== "record_bill") return;
    expect(d.bill).toMatchObject({
      party_id: "t1",
      rate_basis: "per_trip",
      rate: 5800,
      period_from: "2026-11-10",
      bill_date: "2026-11-14",
    });
    expect(d.items).toHaveLength(2);
    expect(e.fields.vehicle_numbers!.value).toBe("MH12AB4821, MH12CD1111");
  });

  it("transporter bill trip count mismatch and missing trip lines → review", () => {
    const e1 = normalizeBill("transporter_bill", 0.96, transporterRaw({ number_of_trips: fv(3) }));
    expect(validateBill(e1).problems.join()).toMatch(/says 3 trips but lists 2/);
    const e2 = normalizeBill("transporter_bill", 0.96, transporterRaw({ trip_lines: [] }));
    const d = decideBill({
      extraction: e2,
      validation: validateBill(e2),
      party: resolveParty(null, "27ABCDE1234F1Z5", transporters),
      materials: [],
      confidenceThreshold: 0.85,
    });
    expect(d).toMatchObject({ action: "needs_review", review_reason: "financial_discrepancy" });
  });
});

describe("pipeline: bills", () => {
  const run = async (
    docType: "provider_bill" | "transporter_bill",
    fields: Record<string, unknown>,
  ) => {
    const decisions: ApplyDecision[] = [];
    const ai: AiClient = {
      model: "mock",
      async classify() {
        return {
          result: { doc_type: docType, confidence: 0.96 },
          raw: {},
          usage: { prompt_tokens: 1, output_tokens: 1, total_tokens: 2 },
        };
      },
      async extract() {
        return {
          result: fields,
          raw: {},
          usage: { prompt_tokens: 1, output_tokens: 1, total_tokens: 2 },
        };
      },
    };
    let extracted: unknown;
    const deps: Deps = {
      ai,
      async loadDocument(id) {
        return {
          id,
          business_id: "b",
          storage_path: "b/x.pdf",
          mime_type: "application/pdf",
          sha256: "x",
          trip_hint_id: null,
          document_type_hint: docType,
          received_at: "2026-11-14T10:00:00Z",
        };
      },
      async downloadFile() {
        return { bytes: new Uint8Array([1]), mimeType: "application/pdf" };
      },
      async settings() {
        return {
          weights: DEFAULT_WEIGHTS,
          threshold: 0.7,
          margin: 0.15,
          windowHours: 72,
          netTolerance: 0.02,
          confidenceThreshold: 0.85,
        };
      },
      async reserveCall() {
        return true;
      },
      async candidateTrips() {
        throw new Error("bills never look for trips here");
      },
      async findSlipDuplicate() {
        return null;
      },
      async billParties(_b, kind) {
        return kind === "provider" ? providers : transporters;
      },
      async materials() {
        return materials;
      },
      async recordExtraction(_id, payload) {
        extracted = payload["extracted"];
      },
      async applyDecision(_id, decision) {
        decisions.push(decision);
        return decision.action === "record_bill" ? "automatically_recorded" : decision.action;
      },
      log() {},
    };
    const outcome = await processDocument(deps, "doc-1");
    return { outcome, decision: decisions[0]!, extracted };
  };

  it("a clear provider bill is recorded through record_bill (never approved or paid)", async () => {
    const { outcome, decision, extracted } = await run("provider_bill", providerRaw());
    expect(outcome.status).toBe("automatically_recorded");
    expect(decision.action).toBe("record_bill");
    expect(Object.keys(decision)).not.toContain("approve");
    expect((extracted as { lines: unknown[] }).lines).toHaveLength(2);
  });

  it("an unclear transporter bill goes to the review queue", async () => {
    const { outcome } = await run(
      "transporter_bill",
      transporterRaw({ transporter_name: fv("Om Sai"), transporter_gstin: fv(null) }),
    );
    expect(outcome).toMatchObject({ status: "needs_review", reason: "multiple_possible_matches" });
  });
});
