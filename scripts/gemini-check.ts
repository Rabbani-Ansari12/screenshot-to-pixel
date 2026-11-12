/**
 * Live check of the document reader: classify + extract one file with the real Gemini API and
 * print the normalised result and the decision inputs. Reads GEMINI_API_KEY / GEMINI_MODEL from
 * the environment (never printed). Costs two calls.
 *   npx tsx scripts/gemini-check.ts <file> [weighbridge_slip|provider_bill|...]
 */
import { readFileSync } from "node:fs";
import { GoogleGenAI } from "@google/genai";
import {
  createGeminiClient,
  DEFAULT_GEMINI_MODEL,
  type GenAiLike,
} from "../supabase/functions/_shared/gemini.ts";
import { billKindFor, normalizeBill, validateBill } from "../supabase/functions/_shared/bills.ts";
import { extractorFor } from "../supabase/functions/_shared/extractors.ts";
import { normalizeExtraction } from "../supabase/functions/_shared/normalize.ts";
import type { DocType, RawFields } from "../supabase/functions/_shared/doc-types.ts";

const [path, hint] = process.argv.slice(2);
const key = process.env["GEMINI_API_KEY"] ?? "";
if (!path || !key || key.startsWith("REPLACE_ME")) {
  console.error("Usage: GEMINI_API_KEY=… npx tsx scripts/gemini-check.ts <file> [doc type hint]");
  process.exit(1);
}
const client = createGeminiClient(
  new GoogleGenAI({ apiKey: key }) as unknown as GenAiLike,
  process.env["GEMINI_MODEL"] || DEFAULT_GEMINI_MODEL,
);
const mimeType = path.endsWith(".pdf")
  ? "application/pdf"
  : path.endsWith(".png")
    ? "image/png"
    : "image/jpeg";
const file = { bytes: new Uint8Array(readFileSync(path)), mimeType };
const cls = await client.classify(file, (hint as DocType) ?? null);
console.log("model:", client.model);
console.log("classified:", cls.result.doc_type, "confidence", cls.result.confidence);
if (!extractorFor(cls.result.doc_type)) {
  console.log(
    `No extractor for "${cls.result.doc_type}": the pipeline stores it as information extracted.`,
  );
  process.exit(0);
}
const ext = await client.extract(file, cls.result.doc_type);
if (billKindFor(cls.result.doc_type)) {
  const bill = normalizeBill(cls.result.doc_type, cls.result.confidence, ext.result);
  const v = validateBill(bill);
  const show = (f: Record<string, { value: unknown; confidence: number }>) =>
    Object.fromEntries(
      Object.entries(f).map(([k, x]) => [k, `${x.value ?? "—"} (${x.confidence})`]),
    );
  console.log("header:", show(bill.fields));
  console.log("lines:", bill.lines.map(show));
  console.log("charges:", bill.charges, "tax:", show(bill.tax));
  console.log("checks:", {
    problems: v.problems,
    missing: v.missing,
    computed: v.computedTotal,
    printed: v.printedTotal,
    confidence: v.overallConfidence,
  });
} else {
  const e = normalizeExtraction(
    cls.result.doc_type,
    cls.result.confidence,
    ext.result as RawFields,
  );
  console.log(
    Object.fromEntries(
      Object.entries(e.fields).map(([k, x]) => [k, `${x.value ?? "—"} (${x.confidence})`]),
    ),
    e.warnings,
  );
}
console.log("tokens:", cls.usage.total_tokens + ext.usage.total_tokens);
