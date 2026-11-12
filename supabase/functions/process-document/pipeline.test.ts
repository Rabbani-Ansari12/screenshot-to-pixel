/**
 * Integration test: fixture images through the full pipeline (classify → extract → normalise →
 * validate → duplicate check → match → decide) with a mocked Gemini and in-memory storage.
 */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import type { AiClient, DocType, FieldValue, RawFields } from "../_shared/doc-types.ts";
import { createGeminiClient, type GenAiLike } from "../_shared/gemini.ts";
import { DEFAULT_WEIGHTS, type CandidateTrip } from "../_shared/matcher.ts";
import {
  CapReachedError,
  processDocument,
  type ApplyDecision,
  type Deps,
  type DocumentRow,
} from "./pipeline.ts";

const FIX = "supabase/functions/process-document/fixtures";
const load = (name: string) => new Uint8Array(readFileSync(`${FIX}/${name}`));
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const fv = (
  value: string | number | null,
  confidence = 0.95,
  legible = value !== null,
): FieldValue => ({ value, confidence, legible });

/** What the mocked model "reads" on each fixture. */
const SLIPS: Record<string, { type: DocType; confidence: number; fields: RawFields }> = {
  "clean-unloading.png": {
    type: "unloading_slip",
    confidence: 0.97,
    fields: {
      vehicle_number: fv("MH 12 AB 4821"),
      slip_number: fv("SITE-77"),
      date: fv("10/11/2026"),
      time: fv("1:05 PM"),
      gross_weight: fv("41,600"),
      tare_weight: fv("14,050"),
      net_weight: fv("27,550"),
      weight_unit: fv("KG"),
      material_name: fv("River Sand"),
      provider: fv(null),
      weighbridge_name: fv("Kharadi site WB"),
    },
  },
  "blurry.png": {
    type: "unloading_slip",
    confidence: 0.8,
    fields: {
      vehicle_number: fv("MH12AB48?1", 0.4, false),
      slip_number: fv(null),
      date: fv("10/11/2026", 0.6),
      time: fv(null),
      gross_weight: fv(41.6, 0.5),
      tare_weight: fv(null),
      net_weight: fv(null),
      weight_unit: fv("MT", 0.7),
      material_name: fv(null),
      provider: fv(null),
      weighbridge_name: fv(null),
    },
  },
  "duplicate-of-clean.png": {
    type: "unloading_slip",
    confidence: 0.95,
    fields: {
      vehicle_number: fv("MH12AB4821"),
      slip_number: fv("SITE 77"),
      date: fv("10-11-2026"),
      time: fv("13:05"),
      gross_weight: fv(41.6),
      tare_weight: fv(14.05),
      net_weight: fv(27.55),
      weight_unit: fv("MT"),
      material_name: fv("River sand"),
      provider: fv(null),
      weighbridge_name: fv(null),
    },
  },
  "conflicting-weights.png": {
    type: "weighbridge_slip",
    confidence: 0.96,
    fields: {
      vehicle_number: fv("MH14CD1001"),
      slip_number: fv("WB-2002"),
      date: fv("10/11/2026"),
      time: fv("09:10"),
      gross_weight: fv(42.18),
      tare_weight: fv(14.06),
      net_weight: fv(27.52),
      weight_unit: fv("MT"),
      material_name: fv("20mm aggregate"),
      provider: fv("Shree Quarry"),
      weighbridge_name: fv("Shree WB"),
    },
  },
  "no-match.png": {
    type: "unloading_slip",
    confidence: 0.97,
    fields: {
      vehicle_number: fv("KA01C1234"),
      slip_number: fv("S-9"),
      date: fv("10/11/2026"),
      time: fv("15:00"),
      gross_weight: fv(30.2),
      tare_weight: fv(12.1),
      net_weight: fv(18.1),
      weight_unit: fv("MT"),
      material_name: fv("River sand"),
      provider: fv(null),
      weighbridge_name: fv(null),
    },
  },
  "vehicle-mismatch.png": {
    type: "unloading_slip",
    confidence: 0.97,
    fields: {
      vehicle_number: fv("MH12XY9999"),
      slip_number: fv("S-10"),
      date: fv("10/11/2026"),
      time: fv("14:00"),
      gross_weight: fv(40.0),
      tare_weight: fv(13.0),
      net_weight: fv(27.0),
      weight_unit: fv("MT"),
      material_name: fv("River sand"),
      provider: fv(null),
      weighbridge_name: fv(null),
    },
  },
};
const byHash = Object.fromEntries(
  Object.keys(SLIPS).map((name) => [sha(load(name)), SLIPS[name]!]),
);
const usage = { prompt_tokens: 1300, output_tokens: 250, total_tokens: 1550 };

const mockAi: AiClient = {
  model: "mock-gemini",
  async classify(file) {
    const s = byHash[sha(file.bytes)]!;
    return { result: { doc_type: s.type, confidence: s.confidence }, raw: { mock: true }, usage };
  },
  async extract(file) {
    return { result: byHash[sha(file.bytes)]!.fields, raw: { mock: true }, usage };
  },
};

const trips: CandidateTrip[] = [
  {
    id: "trip-sand",
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
    transporter_name: "Om Sai",
    order_code: "ORD-2026-0101",
    site_name: "Kharadi Towers",
  },
  {
    id: "trip-agg",
    trip_code: "TRP-2026-00102",
    status: "in_transit",
    unit: "MT",
    vehicle_number: "MH14CD1001",
    loaded_at: "2026-11-10T09:05:00+05:30",
    delivered_at: null,
    loading_weight_id: "w2",
    delivery_weight_id: null,
    loading_slip_number: null,
    delivery_slip_number: null,
    loading_net: 28.1,
    delivered_net: null,
    loading_document_id: null,
    delivery_document_id: null,
    material_name: "20mm Aggregate",
    provider_name: "Shree Quarry",
    transporter_name: "Om Sai",
    order_code: "ORD-2026-0102",
    site_name: "Hinjewadi",
  },
];

let docs: Map<string, DocumentRow & { extracted?: unknown; status?: string }>;
let files: Map<string, Uint8Array>;
let decisions: Map<string, ApplyDecision>;
let calls: number;
let cap: number;

function deps(): Deps {
  return {
    ai: mockAi,
    async loadDocument(id) {
      return docs.get(id)!;
    },
    async downloadFile(path) {
      return { bytes: files.get(path)!, mimeType: "image/png" };
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
      calls++;
      return calls <= cap;
    },
    async candidateTrips(_b, q) {
      return trips.filter((t) => t.id === q.tripHintId || q.vehicle !== null);
    },
    async findSlipDuplicate(_b, documentId, slip, vehicle) {
      for (const [id, d] of docs) {
        const f = (d.extracted as { fields?: Record<string, FieldValue> } | undefined)?.fields;
        if (
          id !== documentId &&
          d.status !== "duplicate" &&
          f?.["slip_number"]?.value === slip &&
          f?.["vehicle_number"]?.value === vehicle
        )
          return id;
      }
      return null;
    },
    async billParties() {
      return [];
    },
    async materials() {
      return [];
    },
    async recordExtraction(documentId, payload) {
      docs.get(documentId)!.extracted = payload["extracted"];
    },
    async applyDecision(documentId, decision) {
      decisions.set(documentId, decision);
      const status =
        decision.action === "auto_record"
          ? "automatically_recorded"
          : decision.action === "extracted_only"
            ? "information_extracted"
            : decision.action;
      docs.get(documentId)!.status = status;
      return status;
    },
    log() {},
  };
}

function upload(name: string, tripHint: string | null = null) {
  const bytes = load(name);
  const id = `doc-${name}`;
  files.set(`b/2026/11/${id}.png`, bytes);
  docs.set(id, {
    id,
    business_id: "b",
    storage_path: `b/2026/11/${id}.png`,
    mime_type: "image/png",
    sha256: sha(bytes),
    trip_hint_id: tripHint,
    document_type_hint: null,
    received_at: "2026-11-10T14:00:00+05:30",
  });
  return id;
}

beforeEach(() => {
  docs = new Map();
  files = new Map();
  decisions = new Map();
  calls = 0;
  cap = 100;
});

describe("process-document pipeline (fixtures, mocked Gemini)", () => {
  it("clean unloading slip in kg → normalised to MT and recorded automatically on the right trip", async () => {
    const id = upload("clean-unloading.png");
    const out = await processDocument(deps(), id);
    expect(out).toMatchObject({ status: "automatically_recorded", tripId: "trip-sand" });
    const d = decisions.get(id)!;
    expect(d).toMatchObject({ action: "auto_record", record_type: "delivery" });
    const ex = docs.get(id)!.extracted as { fields: Record<string, FieldValue> };
    expect(ex.fields["vehicle_number"]?.value).toBe("MH12AB4821");
    expect(ex.fields["net_weight"]?.value).toBe(27.55);
    expect(ex.fields["date"]?.value).toBe("2026-11-10");
    expect(ex.fields["time"]?.value).toBe("13:05");
  });

  it("blurry photo → unreadable fields stay null, sent to review (never guessed)", async () => {
    const id = upload("blurry.png");
    const out = await processDocument(deps(), id);
    expect(out).toMatchObject({ status: "needs_review", reason: "missing_essential_info" });
    const ex = docs.get(id)!.extracted as { fields: Record<string, FieldValue> };
    expect(ex.fields["vehicle_number"]?.value).toBeNull();
    expect(ex.fields["net_weight"]?.value).toBeNull();
  });

  it("second photo of the same slip (slip + vehicle) → duplicate of the first", async () => {
    const first = upload("clean-unloading.png");
    await processDocument(deps(), first);
    const second = upload("duplicate-of-clean.png");
    const out = await processDocument(deps(), second);
    expect(out.status).toBe("duplicate");
    expect(decisions.get(second)).toMatchObject({ action: "duplicate", duplicate_of: first });
  });

  it("printed net ≠ gross − tare → review for conflicting weights", async () => {
    const id = upload("conflicting-weights.png");
    const out = await processDocument(deps(), id);
    expect(out).toMatchObject({ status: "needs_review", reason: "conflicting_weight_values" });
    const detail = (decisions.get(id) as { detail: { checks: { calculated_net: number } } }).detail;
    expect(detail.checks.calculated_net).toBe(28.12);
  });

  it("vehicle with no open trip → review with no match, candidates stored", async () => {
    const id = upload("no-match.png");
    const out = await processDocument(deps(), id);
    expect(out).toMatchObject({ status: "needs_review", reason: "no_match" });
    const detail = (decisions.get(id) as { detail: { candidates: unknown[] } }).detail;
    expect(detail.candidates.length).toBeGreaterThan(0);
  });

  it("uploader picked a trip but the slip's vehicle differs → review for vehicle mismatch", async () => {
    const id = upload("vehicle-mismatch.png", "trip-sand");
    const out = await processDocument(deps(), id);
    expect(out).toMatchObject({ status: "needs_review", reason: "vehicle_mismatch" });
  });

  it("daily AI cap → the job is deferred, nothing recorded", async () => {
    cap = 0;
    const id = upload("clean-unloading.png");
    await expect(processDocument(deps(), id)).rejects.toBeInstanceOf(CapReachedError);
    expect(decisions.size).toBe(0);
  });
});

describe("Gemini client", () => {
  it("sends the image inline with JSON schema output at temperature 0 and reports usage", async () => {
    const requests: { model: string; config?: Record<string, unknown>; contents: unknown }[] = [];
    const fake: GenAiLike = {
      models: {
        async generateContent(req) {
          requests.push(req);
          return {
            text: JSON.stringify({ doc_type: "weighbridge_slip", confidence: 0.91 }),
            usageMetadata: {
              promptTokenCount: 1290,
              candidatesTokenCount: 20,
              totalTokenCount: 1310,
            },
          };
        },
      },
    };
    const client = createGeminiClient(fake, "gemini-3.6-flash");
    const r = await client.classify(
      { bytes: load("clean-unloading.png"), mimeType: "image/png" },
      "unloading_slip",
    );
    expect(r.result).toEqual({ doc_type: "weighbridge_slip", confidence: 0.91 });
    expect(r.usage).toEqual({ prompt_tokens: 1290, output_tokens: 20, total_tokens: 1310 });
    const req = requests[0]!;
    expect(req.model).toBe("gemini-3.6-flash");
    expect(req.config).toMatchObject({ temperature: 0, responseMimeType: "application/json" });
    expect(req.config?.["responseJsonSchema"]).toBeTruthy();
    const part = (
      req.contents as { parts: { inlineData?: { mimeType: string; data: string } }[] }[]
    )[0]!.parts[0]!;
    expect(part.inlineData?.mimeType).toBe("image/png");
    expect(
      Buffer.from(part.inlineData!.data, "base64").equals(Buffer.from(load("clean-unloading.png"))),
    ).toBe(true);
  });

  it("rejects non-JSON output instead of guessing", async () => {
    const fake: GenAiLike = {
      models: { generateContent: async () => ({ text: "I think it says 42 tonnes" }) },
    };
    const client = createGeminiClient(fake, "m");
    await expect(
      client.extract({ bytes: new Uint8Array([1]), mimeType: "image/png" }, "weighbridge_slip"),
    ).rejects.toThrow(/non-JSON/);
  });
});
