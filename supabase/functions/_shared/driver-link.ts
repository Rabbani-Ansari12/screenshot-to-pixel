// Helpers for the public driver-upload channel. Pure (Web APIs only) so they run in Deno and
// are unit-tested with Vitest.

/** One message for every bad link (unknown, expired, revoked, used up) so nothing leaks. */
export const GENERIC_LINK_ERROR =
  "This upload link is not valid any more. Ask the office for a new link.";
export const RATE_LIMIT_ERROR =
  "Too many uploads from this network. Please wait and try again later.";
export const FILE_ERROR =
  "Only photos (JPG, PNG, WebP, HEIC) or PDF files up to 10 MB can be uploaded.";

export const MAX_FILES = 5;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_DRIVER_NAME = 60;
export const TOKEN_RATE_LIMIT = 60; // requests per hour per link
export const INFO_RATE_LIMIT_PER_IP = 120; // link checks per hour per IP

/** 32 random bytes in base64url = 43 characters. */
export const isWellFormedToken = (t: unknown): t is string =>
  typeof t === "string" && /^[A-Za-z0-9_-]{43}$/.test(t);

export async function sha256Hex(data: string | Uint8Array): Promise<string> {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Compares two strings in time independent of where they differ. */
export function constantTimeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export type SniffedType = { mime: string; ext: string };

/** File type from the first bytes (never from the name or the browser's Content-Type). */
export function sniffMime(head: Uint8Array): SniffedType | null {
  const b = (i: number) => head[i] ?? -1;
  const ascii = (from: number, to: number) => String.fromCharCode(...head.subarray(from, to));
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  if ([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b(i) === v))
    return { mime: "image/png", ext: "png" };
  if (head.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP")
    return { mime: "image/webp", ext: "webp" };
  if (head.length >= 5 && ascii(0, 5) === "%PDF-") return { mime: "application/pdf", ext: "pdf" };
  if (head.length >= 12 && ascii(4, 8) === "ftyp") {
    const brand = ascii(8, 12);
    if (["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"].includes(brand))
      return { mime: "image/heic", ext: "heic" };
  }
  return null;
}

/** Free-text name typed by the driver: no control characters, at most 60 characters. */
export function cleanDriverName(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_DRIVER_NAME);
  return s || null;
}

/** First client IP (Supabase sets x-forwarded-for); hashed before it is stored anywhere. */
export function clientIp(headers: Headers): string {
  return (
    headers.get("cf-connecting-ip") ??
    headers.get("x-real-ip") ??
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

/** CORS for the public page only: the browser accepts responses only on APP_ORIGIN. */
export function corsHeaders(
  origin: string | null,
  appOrigin: string | null,
): Record<string, string> {
  const base: Record<string, string> = {
    Vary: "Origin",
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  };
  if (appOrigin && origin && origin.replace(/\/$/, "") === appOrigin.replace(/\/$/, "")) {
    base["Access-Control-Allow-Origin"] = origin;
    base["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
    base["Access-Control-Allow-Headers"] = "content-type";
    base["Access-Control-Max-Age"] = "600";
  }
  return base;
}

export const DOC_TYPE_LABELS: Record<string, string> = {
  weighbridge_slip: "Weighbridge slip",
  loading_slip: "Loading slip",
  unloading_slip: "Unloading slip",
  delivery_photo: "Delivery photo",
  other: "Other",
};
