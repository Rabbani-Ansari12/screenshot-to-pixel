// Gemini client for the pipeline. The SDK class is passed in so the same code runs in Deno
// (npm:@google/genai) and in Node tests (@google/genai). Server-side only: the key never
// reaches the browser.
import type { AiClient, AiFile, DocType, RawExtraction, Usage } from "./doc-types.ts";
import { DOC_TYPES } from "./doc-types.ts";
import { CLASSIFY_SCHEMA, CLASSIFY_SYSTEM, classifyPrompt } from "./prompts/classify.ts";
import { extractorFor } from "./extractors.ts";

/** Minimal shape of `new GoogleGenAI({ apiKey })` that we use. */
export interface GenAiLike {
  models: {
    generateContent(req: {
      model: string;
      contents: unknown;
      config?: Record<string, unknown>;
    }): Promise<{
      text?: string;
      usageMetadata?: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
        totalTokenCount?: number;
      };
    }>;
  };
}

export const DEFAULT_GEMINI_MODEL = "gemini-3.6-flash";

function base64(bytes: Uint8Array): string {
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk)
    s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(s);
}

const usageOf = (
  u:
    | { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number }
    | undefined,
): Usage => ({
  prompt_tokens: u?.promptTokenCount ?? 0,
  output_tokens: u?.candidatesTokenCount ?? 0,
  total_tokens: u?.totalTokenCount ?? (u?.promptTokenCount ?? 0) + (u?.candidatesTokenCount ?? 0),
});

export class AiResponseError extends Error {}

export function createGeminiClient(ai: GenAiLike, model: string): AiClient {
  async function call(file: AiFile, system: string, prompt: string, schema: unknown) {
    const res = await ai.models.generateContent({
      model,
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType: file.mimeType, data: base64(file.bytes) } },
            { text: prompt },
          ],
        },
      ],
      config: {
        systemInstruction: system,
        temperature: 0,
        responseMimeType: "application/json",
        responseJsonSchema: schema,
      },
    });
    const text = res.text ?? "";
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new AiResponseError(`Model returned non-JSON output (${text.slice(0, 80)})`);
    }
    return {
      parsed,
      raw: { text, usageMetadata: res.usageMetadata ?? null },
      usage: usageOf(res.usageMetadata),
    };
  }

  return {
    model,
    async classify(file, hint) {
      const r = await call(file, CLASSIFY_SYSTEM, classifyPrompt(hint), CLASSIFY_SCHEMA);
      const p = r.parsed as { doc_type?: string; confidence?: number };
      const docType = (DOC_TYPES as readonly string[]).includes(p.doc_type ?? "")
        ? (p.doc_type as DocType)
        : "other";
      const confidence =
        typeof p.confidence === "number" ? Math.max(0, Math.min(1, p.confidence)) : 0;
      return { result: { doc_type: docType, confidence }, raw: r.raw, usage: r.usage };
    },
    async extract(file, docType) {
      const ex = extractorFor(docType);
      if (!ex) throw new AiResponseError(`No extractor for ${docType}`);
      const r = await call(file, ex.system, ex.prompt, ex.schema);
      return { result: (r.parsed ?? {}) as RawExtraction, raw: r.raw, usage: r.usage };
    },
  };
}
