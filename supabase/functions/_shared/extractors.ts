// Extractor registry keyed by document type. Weight documents have an extractor today;
// bill / receipt extractors can be registered here later without touching the pipeline.
import type { DocType } from "./doc-types.ts";
import {
  WEIGHBRIDGE_PROMPT,
  WEIGHBRIDGE_SCHEMA,
  WEIGHBRIDGE_SYSTEM,
} from "./prompts/weighbridge.ts";

export interface Extractor {
  /** Short name stored with the AI record. */
  name: string;
  system: string;
  prompt: string;
  schema: Record<string, unknown>;
  /** Whether the result can be recorded automatically on a trip. */
  recordsWeights: boolean;
}

const weighbridge: Extractor = {
  name: "weighbridge_v1",
  system: WEIGHBRIDGE_SYSTEM,
  prompt: WEIGHBRIDGE_PROMPT,
  schema: WEIGHBRIDGE_SCHEMA,
  recordsWeights: true,
};

export const EXTRACTORS: Partial<Record<DocType, Extractor>> = {
  weighbridge_slip: weighbridge,
  loading_slip: weighbridge,
  unloading_slip: weighbridge,
  delivery_photo: weighbridge,
  // provider_bill, transporter_bill, payment_receipt: add extractors with the finance phase.
};

export const extractorFor = (t: DocType): Extractor | null => EXTRACTORS[t] ?? null;
