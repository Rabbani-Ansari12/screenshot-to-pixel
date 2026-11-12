// Shared types for the document pipeline. Pure TypeScript (no Deno / npm imports) so the
// logic can be unit-tested with Vitest as well as run in Edge Functions.

export const DOC_TYPES = [
  "weighbridge_slip",
  "loading_slip",
  "unloading_slip",
  "provider_bill",
  "transporter_bill",
  "delivery_photo",
  "payment_receipt",
  "other",
] as const;
export type DocType = (typeof DOC_TYPES)[number];

export const WEIGHT_DOC_TYPES: readonly DocType[] = [
  "weighbridge_slip",
  "loading_slip",
  "unloading_slip",
  "delivery_photo",
];

/** One extracted field. `value` is null when missing or unreadable — never guessed. */
export interface FieldValue<T = string | number> {
  value: T | null;
  confidence: number;
  legible: boolean;
}

export type WeighbridgeFieldName =
  | "vehicle_number"
  | "slip_number"
  | "date"
  | "time"
  | "gross_weight"
  | "tare_weight"
  | "net_weight"
  | "weight_unit"
  | "material_name"
  | "provider"
  | "weighbridge_name";

export type RawFields = Partial<Record<WeighbridgeFieldName, FieldValue>>;

/** Whatever the extractor's schema returned (weight fields, or a bill with lines). */
export type RawExtraction = Record<string, unknown>;

/** Normalised extraction stored in documents.extracted (never edited afterwards). */
export interface Extraction {
  doc_type: DocType;
  doc_type_confidence: number;
  fields: Record<string, FieldValue>;
  /** Machine-readable notes from normalisation, e.g. "weight_unit_unknown". */
  warnings: string[];
}

export type ReviewReason =
  | "low_confidence"
  | "missing_essential_info"
  | "multiple_possible_matches"
  | "conflicting_weight_values"
  | "no_match"
  | "vehicle_mismatch"
  | "financial_discrepancy";

export interface Usage {
  prompt_tokens: number;
  output_tokens: number;
  total_tokens: number;
}

export interface AiFile {
  bytes: Uint8Array;
  mimeType: string;
}

/** What the pipeline needs from an AI provider (Gemini in production, a mock in tests). */
export interface AiClient {
  readonly model: string;
  classify(
    file: AiFile,
    hint: DocType | null,
  ): Promise<{ result: { doc_type: DocType; confidence: number }; raw: unknown; usage: Usage }>;
  extract(
    file: AiFile,
    docType: DocType,
  ): Promise<{ result: RawExtraction; raw: unknown; usage: Usage }>;
}
