// One document through the pipeline: classify → extract → normalise → validate → match → decide.
// All I/O is injected (Deps) so the whole flow is tested with fixtures and a mocked model.
import {
  billKindFor,
  decideBill,
  normalizeBill,
  resolveParty,
  validateBill,
  type BillKind,
  type MaterialRef,
  type Party,
} from "../_shared/bills.ts";
import type {
  AiClient,
  AiFile,
  DocType,
  Extraction,
  RawFields,
  Usage,
} from "../_shared/doc-types.ts";
import { DOC_TYPES } from "../_shared/doc-types.ts";
import { extractorFor } from "../_shared/extractors.ts";
import {
  decide,
  rankCandidates,
  type CandidateTrip,
  type MatchConfig,
} from "../_shared/matcher.ts";
import { normalizeExtraction } from "../_shared/normalize.ts";
import { validateWeightExtraction } from "../_shared/validate.ts";

export interface DocumentRow {
  id: string;
  business_id: string;
  storage_path: string;
  mime_type: string | null;
  sha256: string;
  trip_hint_id: string | null;
  document_type_hint: string | null;
  received_at: string;
}

export interface PipelineSettings extends MatchConfig {}

export type ApplyDecision =
  | { action: "auto_record"; trip_id: string; record_type: "loading" | "delivery"; detail: unknown }
  | { action: "needs_review"; review_reason: string; detail: unknown }
  | { action: "duplicate"; duplicate_of: string; detail: unknown }
  | { action: "extracted_only"; detail: unknown }
  | {
      action: "record_bill";
      kind: BillKind;
      bill: Record<string, unknown>;
      items: Record<string, unknown>[];
      detail: unknown;
    };

export interface Deps {
  ai: AiClient;
  loadDocument(id: string): Promise<DocumentRow>;
  downloadFile(path: string): Promise<AiFile>;
  settings(businessId: string): Promise<PipelineSettings>;
  /** One reservation per model call; false when the daily cap is reached. */
  reserveCall(businessId: string): Promise<boolean>;
  /** Open trips for the vehicle (and the hinted trip), within the matching window. */
  candidateTrips(
    businessId: string,
    query: {
      vehicle: string | null;
      around: string | null;
      windowHours: number;
      tripHintId: string | null;
    },
  ): Promise<CandidateTrip[]>;
  /** Another document with the same slip + vehicle (not this one), if any. */
  findSlipDuplicate(
    businessId: string,
    documentId: string,
    slip: string,
    vehicle: string,
  ): Promise<string | null>;
  /** Providers or transporters of the business (for matching the name / GSTIN on a bill). */
  billParties(businessId: string, kind: BillKind): Promise<Party[]>;
  materials(businessId: string): Promise<MaterialRef[]>;
  recordExtraction(documentId: string, payload: Record<string, unknown>): Promise<void>;
  applyDecision(documentId: string, decision: ApplyDecision): Promise<string>;
  log(event: string, data: Record<string, unknown>): void;
}

export class CapReachedError extends Error {
  constructor() {
    super("Daily AI limit reached");
  }
}

export interface Outcome {
  status: string;
  docType: DocType;
  reason?: string;
  tripId?: string;
}

const addUsage = (a: Usage, b: Usage): Usage => ({
  prompt_tokens: a.prompt_tokens + b.prompt_tokens,
  output_tokens: a.output_tokens + b.output_tokens,
  total_tokens: a.total_tokens + b.total_tokens,
});

export async function processDocument(deps: Deps, documentId: string): Promise<Outcome> {
  const doc = await deps.loadDocument(documentId);
  const settings = await deps.settings(doc.business_id);
  const file = await deps.downloadFile(doc.storage_path);
  let usage: Usage = { prompt_tokens: 0, output_tokens: 0, total_tokens: 0 };

  // 1. classify (the uploader's hint is only a hint)
  if (!(await deps.reserveCall(doc.business_id))) throw new CapReachedError();
  const hint = (DOC_TYPES as readonly string[]).includes(doc.document_type_hint ?? "")
    ? (doc.document_type_hint as DocType)
    : null;
  const cls = await deps.ai.classify(file, hint);
  usage = addUsage(usage, cls.usage);
  const docType = cls.result.doc_type;
  deps.log("classified", { documentId, docType, confidence: cls.result.confidence, hint });

  const extractor = extractorFor(docType);
  if (!extractor) {
    await deps.recordExtraction(documentId, {
      model: deps.ai.model,
      raw_response: { classify: cls.raw },
      extracted: {
        doc_type: docType,
        doc_type_confidence: cls.result.confidence,
        fields: {},
        warnings: ["no_extractor"],
      },
      overall_confidence: cls.result.confidence,
      usage: { calls: 1, ...usage },
    });
    await deps.applyDecision(documentId, {
      action: "extracted_only",
      detail: { note: `No automatic processing for ${docType.replace(/_/g, " ")} yet.` },
    });
    return { status: "information_extracted", docType };
  }

  // 2. extract (structured output, temperature 0)
  if (!(await deps.reserveCall(doc.business_id))) throw new CapReachedError();
  const ext = await deps.ai.extract(file, docType);
  usage = addUsage(usage, ext.usage);

  if (extractor.kind !== "weights") {
    return processBill(deps, {
      documentId,
      businessId: doc.business_id,
      docType,
      docTypeConfidence: cls.result.confidence,
      raw: { classify: cls.raw, extract: ext.raw, extractor: extractor.name },
      result: ext.result,
      usage,
      confidenceThreshold: settings.confidenceThreshold,
    });
  }

  const extraction: Extraction = normalizeExtraction(
    docType,
    cls.result.confidence,
    ext.result as RawFields,
  );
  const validation = validateWeightExtraction(extraction, settings.netTolerance);
  const fieldConfidences = Object.fromEntries(
    Object.entries(extraction.fields).map(([k, f]) => [k, f.confidence]),
  );
  await deps.recordExtraction(documentId, {
    model: deps.ai.model,
    raw_response: { classify: cls.raw, extract: ext.raw, extractor: extractor.name },
    extracted: extraction,
    field_confidences: fieldConfidences,
    overall_confidence: validation.overallConfidence,
    usage: { calls: 2, ...usage },
  });

  // 3. duplicate by slip + vehicle
  const slip = extraction.fields["slip_number"]?.value;
  const vehicle = extraction.fields["vehicle_number"]?.value;
  if (typeof slip === "string" && typeof vehicle === "string") {
    const original = await deps.findSlipDuplicate(doc.business_id, documentId, slip, vehicle);
    if (original) {
      await deps.applyDecision(documentId, {
        action: "duplicate",
        duplicate_of: original,
        detail: { reason: `Same slip ${slip} and vehicle ${vehicle} as an earlier document.` },
      });
      return { status: "duplicate", docType };
    }
  }

  // 4. match
  const date = extraction.fields["date"]?.value;
  const time = extraction.fields["time"]?.value;
  const around =
    typeof date === "string"
      ? `${date}T${typeof time === "string" ? time : "12:00"}:00+05:30`
      : null;
  const trips = await deps.candidateTrips(doc.business_id, {
    vehicle: typeof vehicle === "string" ? vehicle : null,
    around,
    windowHours: settings.windowHours,
    tripHintId: doc.trip_hint_id,
  });
  const candidates = rankCandidates(extraction, trips, settings, {
    recordTypeHint: validation.recordTypeHint,
    effectiveNet: validation.effectiveNet,
    documentId,
  });
  const decision = decide({ validation, candidates, tripHintId: doc.trip_hint_id, cfg: settings });
  const detail = {
    checks: {
      problems: validation.problems,
      calculated_net: validation.calculatedNet,
      effective_net: validation.effectiveNet,
      warnings: extraction.warnings,
    },
    overall_confidence: validation.overallConfidence,
    candidates: candidates.slice(0, 5),
    explanation:
      decision.action === "needs_review"
        ? decision.detail
        : `matched ${decision.candidate.tripCode}`,
  };
  deps.log("decided", {
    documentId,
    action: decision.action,
    ...(decision.action === "needs_review"
      ? { reason: decision.reason }
      : { trip: decision.candidate.tripCode }),
  });

  if (decision.action === "auto_record") {
    const status = await deps.applyDecision(documentId, {
      action: "auto_record",
      trip_id: decision.tripId,
      record_type: decision.recordType,
      detail,
    });
    return { status, docType, tripId: decision.tripId };
  }
  const status = await deps.applyDecision(documentId, {
    action: "needs_review",
    review_reason: decision.reason,
    detail,
  });
  return { status, docType, reason: decision.reason };
}

/**
 * Bills: normalise → validate → find the provider / transporter → record or review.
 * Duplicate detection (same party + bill number + amount) and reconciliation run in the
 * database (create_bill_from_document). The AI never approves a difference or pays.
 */
async function processBill(
  deps: Deps,
  input: {
    documentId: string;
    businessId: string;
    docType: DocType;
    docTypeConfidence: number;
    raw: Record<string, unknown>;
    result: Record<string, unknown>;
    usage: Usage;
    confidenceThreshold: number;
  },
): Promise<Outcome> {
  const kind = billKindFor(input.docType)!;
  const extraction = normalizeBill(input.docType, input.docTypeConfidence, input.result);
  const validation = validateBill(extraction);
  await deps.recordExtraction(input.documentId, {
    model: deps.ai.model,
    raw_response: input.raw,
    extracted: extraction,
    field_confidences: Object.fromEntries(
      Object.entries(extraction.fields).map(([k, f]) => [k, f.confidence]),
    ),
    overall_confidence: validation.overallConfidence,
    usage: { calls: 2, ...input.usage },
  });
  const [parties, materials] = await Promise.all([
    deps.billParties(input.businessId, kind),
    kind === "provider" ? deps.materials(input.businessId) : Promise.resolve([]),
  ]);
  const nameKey = kind === "provider" ? "provider_name" : "transporter_name";
  const gstinKey = kind === "provider" ? "provider_gstin" : "transporter_gstin";
  const party = resolveParty(
    (extraction.fields[nameKey]?.value as string | null) ?? null,
    (extraction.fields[gstinKey]?.value as string | null) ?? null,
    parties,
  );
  const decision = decideBill({
    extraction,
    validation,
    party,
    materials,
    confidenceThreshold: input.confidenceThreshold,
  });
  deps.log("decided", {
    documentId: input.documentId,
    action: decision.action,
    ...(decision.action === "needs_review" ? { reason: decision.review_reason } : { kind }),
  });
  const status = await deps.applyDecision(input.documentId, decision);
  return decision.action === "needs_review"
    ? { status, docType: input.docType, reason: decision.review_reason }
    : { status, docType: input.docType };
}
