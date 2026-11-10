// getSecret must refuse missing values and REPLACE_ME placeholders with a message naming the secret.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const values: Record<string, string | undefined> = {};
beforeEach(() => {
  (globalThis as unknown as { Deno: unknown }).Deno = { env: { get: (k: string) => values[k] } };
});
afterEach(() => {
  delete (globalThis as unknown as { Deno?: unknown }).Deno;
  for (const k of Object.keys(values)) delete values[k];
});

describe("getSecret", () => {
  it("throws a clear error for a REPLACE_ME placeholder, without the value", async () => {
    const { getSecret, MissingSecretError } = await import("./env.ts");
    values["GEMINI_API_KEY"] = "REPLACE_ME_GEMINI_API_KEY";
    expect(() => getSecret("GEMINI_API_KEY")).toThrow(MissingSecretError);
    expect(() => getSecret("GEMINI_API_KEY")).toThrow(
      /Secret GEMINI_API_KEY still has its placeholder value\. Run: npx supabase secrets set GEMINI_API_KEY=/,
    );
  });

  it("throws for a missing or empty secret", async () => {
    const { getSecret, secretProblem } = await import("./env.ts");
    expect(secretProblem("GEMINI_MODEL")).toBe("missing");
    values["GEMINI_MODEL"] = "  ";
    expect(() => getSecret("GEMINI_MODEL")).toThrow(/GEMINI_MODEL is not set/);
  });

  it("returns real values", async () => {
    const { getSecret, secretProblem } = await import("./env.ts");
    values["GEMINI_MODEL"] = "gemini-3.6-flash";
    expect(getSecret("GEMINI_MODEL")).toBe("gemini-3.6-flash");
    expect(secretProblem("GEMINI_MODEL")).toBeNull();
  });

  it("no longer knows any Twilio / WhatsApp secret", async () => {
    const { SECRET_NAMES } = await import("./env.ts");
    expect(SECRET_NAMES.join()).not.toMatch(/TWILIO|WHATSAPP|WEBHOOK/);
  });
});
