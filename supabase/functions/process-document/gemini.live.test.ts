/**
 * Optional live test against the real Gemini API. Skipped unless GEMINI_API_KEY is set in the
 * environment and is not a REPLACE_ME placeholder. Costs one or two cheap calls.
 *   GEMINI_API_KEY=... GEMINI_MODEL=gemini-3.6-flash npx vitest run supabase/functions/process-document/gemini.live.test.ts
 * Optional: LIVE_SLIP=path/to/a/real/slip.jpg to also run the extractor on a real photo.
 */
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createGeminiClient, DEFAULT_GEMINI_MODEL, type GenAiLike } from "../_shared/gemini.ts";

const key = process.env["GEMINI_API_KEY"] ?? "";
const live = key !== "" && !key.startsWith("REPLACE_ME");

describe.skipIf(!live)("Gemini (live)", () => {
  it("classifies and extracts with structured output", async () => {
    const { GoogleGenAI } = await import("@google/genai");
    const client = createGeminiClient(
      new GoogleGenAI({ apiKey: key }) as unknown as GenAiLike,
      process.env["GEMINI_MODEL"] || DEFAULT_GEMINI_MODEL,
    );
    const path = process.env["LIVE_SLIP"];
    const file =
      path && existsSync(path)
        ? {
            bytes: new Uint8Array(readFileSync(path)),
            mimeType: path.endsWith(".png") ? "image/png" : "image/jpeg",
          }
        : {
            bytes: new Uint8Array(
              readFileSync("supabase/functions/process-document/fixtures/blurry.png"),
            ),
            mimeType: "image/png",
          };
    const cls = await client.classify(file, null);
    expect(typeof cls.result.confidence).toBe("number");
    expect(cls.usage.total_tokens).toBeGreaterThan(0);
    const ext = await client.extract(file, "weighbridge_slip");
    expect(ext.result).toHaveProperty("vehicle_number");
    if (!path) {
      // A synthetic image with no text: every value must be null, never invented.
      for (const f of Object.values(ext.result)) expect(f?.value ?? null).toBeNull();
    }
  }, 60_000);
});
