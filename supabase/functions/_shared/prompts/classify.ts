// Step 1: what kind of document is this?
import { DOC_TYPES } from "../doc-types.ts";

export const CLASSIFY_SYSTEM = `You classify documents for an Indian construction-material supplier (sand, aggregate, cement).
Documents are phone photos or PDFs of: weighbridge slips, loading slips (at the quarry/plant),
unloading / delivery slips (at the construction site), provider bills, transporter bills,
delivery photos (a truck or material at the site), payment receipts, or something else.
Rules:
- Decide only from what is visible. If you cannot tell, answer "other" with a low confidence.
- A weighbridge slip shows gross, tare and net weights printed by a weighbridge.
- Confidence is your probability (0 to 1) that the type is correct.`;

export function classifyPrompt(hint: string | null): string {
  return hint
    ? `The person who uploaded this said it is a "${hint}". Treat that only as a hint: verify it against what you see and answer with the type that is actually visible.`
    : "Classify this document.";
}

export const CLASSIFY_SCHEMA = {
  type: "object",
  properties: {
    doc_type: { type: "string", enum: [...DOC_TYPES] },
    confidence: { type: "number", minimum: 0, maximum: 1 },
  },
  required: ["doc_type", "confidence"],
  additionalProperties: false,
} as const;
