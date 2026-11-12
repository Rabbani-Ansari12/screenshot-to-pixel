// Extractor registry keyed by document type: weight documents and bills. Payment receipts can
// be registered here later without touching the pipeline.
import type { DocType } from "./doc-types.ts";
import {
  PROVIDER_BILL_PROMPT,
  PROVIDER_BILL_SCHEMA,
  PROVIDER_BILL_SYSTEM,
  TRANSPORTER_BILL_PROMPT,
  TRANSPORTER_BILL_SCHEMA,
  TRANSPORTER_BILL_SYSTEM,
} from "./prompts/bills.ts";
import {
  WEIGHBRIDGE_PROMPT,
  WEIGHBRIDGE_SCHEMA,
  WEIGHBRIDGE_SYSTEM,
} from "./prompts/weighbridge.ts";

export interface Extractor {
  /** Short name stored with the AI record. */
  name: string;
  /** Which pipeline branch handles the result. */
  kind: "weights" | "provider_bill" | "transporter_bill";
  system: string;
  prompt: string;
  schema: Record<string, unknown>;
}

const weighbridge: Extractor = {
  name: "weighbridge_v1",
  kind: "weights",
  system: WEIGHBRIDGE_SYSTEM,
  prompt: WEIGHBRIDGE_PROMPT,
  schema: WEIGHBRIDGE_SCHEMA,
};

const providerBill: Extractor = {
  name: "provider_bill_v1",
  kind: "provider_bill",
  system: PROVIDER_BILL_SYSTEM,
  prompt: PROVIDER_BILL_PROMPT,
  schema: PROVIDER_BILL_SCHEMA,
};

const transporterBill: Extractor = {
  name: "transporter_bill_v1",
  kind: "transporter_bill",
  system: TRANSPORTER_BILL_SYSTEM,
  prompt: TRANSPORTER_BILL_PROMPT,
  schema: TRANSPORTER_BILL_SCHEMA,
};

export const EXTRACTORS: Partial<Record<DocType, Extractor>> = {
  weighbridge_slip: weighbridge,
  loading_slip: weighbridge,
  unloading_slip: weighbridge,
  delivery_photo: weighbridge,
  provider_bill: providerBill,
  transporter_bill: transporterBill,
  // payment_receipt: no extractor yet (stored as "information extracted").
};

export const extractorFor = (t: DocType): Extractor | null => EXTRACTORS[t] ?? null;
