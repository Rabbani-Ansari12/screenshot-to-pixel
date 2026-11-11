/**
 * Security tests for the public driver channel: generic errors for every bad link, minimal data,
 * file checks by magic bytes, size limits, rate limits, Turnstile, and no raw tokens in logs.
 */
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { buildDigest } from "./digest.ts";
import { handleInfo, handleUpload, type LinkInfo, type PublicDeps } from "./driver-handlers.ts";
import {
  GENERIC_LINK_ERROR,
  MAX_FILE_BYTES,
  RATE_LIMIT_ERROR,
  cleanDriverName,
  clientIp,
  constantTimeEqual,
  corsHeaders,
  isWellFormedToken,
  sha256Hex,
  sniffMime,
} from "./driver-link.ts";

const ORIGIN = "https://app.example.in";
const TOKEN = "Abcdefghijklmnopqrstuvwxyz0123456789_-ABCDE"; // 43 chars, base64url
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1, 1, 0, 0, 1]);
const PNG = new Uint8Array(
  readFileSync("supabase/functions/process-document/fixtures/clean-unloading.png"),
);
const PDF = new TextEncoder().encode("%PDF-1.7\n1 0 obj\n");
const HEIC = new Uint8Array([0, 0, 0, 24, ...new TextEncoder().encode("ftypheic"), 0, 0, 0, 0]);
const WEBP = new Uint8Array([
  ...new TextEncoder().encode("RIFF"),
  0,
  0,
  0,
  0,
  ...new TextEncoder().encode("WEBPVP8 "),
]);

let links: Map<string, LinkInfo & { remaining: number; state: "ok" | "expired" | "revoked" }>;
let hits: Map<string, number>;
let stored: string[];
let removed: string[];
let registered: { path: string; docType: string; driverName: string | null; sha256: string }[];
let logs: string[];
let turnstile: PublicDeps["verifyTurnstile"];

async function addLink(
  token: string,
  over: Partial<LinkInfo> = {},
  state: "ok" | "expired" | "revoked" = "ok",
) {
  const hash = await sha256Hex(token);
  links.set(hash, {
    token_hash: hash,
    trip_code: "TRP-2026-00101",
    vehicle_number: "MH12AB4821",
    material_name: "River Sand",
    allowed_doc_types: ["loading_slip", "unloading_slip", "delivery_photo", "other"],
    remaining_uploads: 20,
    remaining: 20,
    _business_id: "b0000000-0000-4000-8000-000000000001",
    _rate_limit_per_ip: 30,
    state,
    ...over,
  });
}

function deps(): PublicDeps {
  return {
    async linkInfo(hash) {
      const l = links.get(hash);
      // like driver_link_info(): expired / revoked / used up all look like "not found"
      if (!l || l.state !== "ok" || l.remaining <= 0) return null;
      const { remaining: _r, state: _s, ...info } = l;
      return { ...info, remaining_uploads: l.remaining };
    },
    async rateLimit(bucket, limit) {
      const n = (hits.get(bucket) ?? 0) + 1;
      hits.set(bucket, n);
      return n <= limit;
    },
    async upload(path) {
      stored.push(path);
    },
    async remove(path) {
      removed.push(path);
    },
    async register(a) {
      const l = links.get(a.tokenHash);
      if (!l || l.remaining <= 0) throw new Error("invalid_link");
      l.remaining--;
      registered.push({
        path: a.path,
        docType: a.docType,
        driverName: a.driverName,
        sha256: a.sha256,
      });
      return { id: crypto.randomUUID(), status: "received", remaining_uploads: l.remaining };
    },
    appOrigin: ORIGIN,
    verifyTurnstile: turnstile,
    uuid: () => crypto.randomUUID(),
    now: () => new Date("2026-11-11T05:00:00Z"),
    log: (event, data) => logs.push(JSON.stringify({ event, ...data })),
  };
}

const info = (token: string, ip = "203.0.113.5") =>
  handleInfo(
    new Request(`https://fn.test/driver-upload-info?token=${encodeURIComponent(token)}`, {
      headers: { origin: ORIGIN, "x-forwarded-for": ip },
    }),
    deps(),
  );

function uploadReq(
  fields: Record<string, string>,
  files: { bytes: Uint8Array; name: string; type?: string }[],
  ip = "203.0.113.5",
) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  for (const f of files)
    form.append("files", new File([f.bytes], f.name, { type: f.type ?? "image/jpeg" }));
  return handleUpload(
    new Request("https://fn.test/driver-upload", {
      method: "POST",
      body: form,
      headers: { origin: ORIGIN, "x-forwarded-for": ip },
    }),
    deps(),
  );
}

beforeEach(async () => {
  links = new Map();
  hits = new Map();
  stored = [];
  removed = [];
  registered = [];
  logs = [];
  turnstile = null;
  await addLink(TOKEN);
});

describe("helpers", () => {
  it("token format, hashing and constant-time comparison", async () => {
    expect(isWellFormedToken(TOKEN)).toBe(true);
    expect(isWellFormedToken("short")).toBe(false);
    expect(isWellFormedToken(`${TOKEN.slice(0, 42)}=`)).toBe(false);
    expect(await sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(constantTimeEqual("abc", "abc")).toBe(true);
    expect(constantTimeEqual("abc", "abd")).toBe(false);
    expect(constantTimeEqual("abc", "abcd")).toBe(false);
  });

  it("sniffs JPEG, PNG, WebP, HEIC and PDF by their bytes and nothing else", () => {
    expect(sniffMime(JPEG)?.mime).toBe("image/jpeg");
    expect(sniffMime(PNG)?.mime).toBe("image/png");
    expect(sniffMime(WEBP)?.mime).toBe("image/webp");
    expect(sniffMime(HEIC)?.mime).toBe("image/heic");
    expect(sniffMime(PDF)?.mime).toBe("application/pdf");
    expect(sniffMime(new TextEncoder().encode("<html><script>"))).toBeNull();
    expect(sniffMime(new TextEncoder().encode("GIF89a"))).toBeNull();
    expect(sniffMime(new Uint8Array([0x4d, 0x5a, 0x90, 0]))).toBeNull(); // .exe
  });

  it("cleans the driver name and reads the client IP", () => {
    expect(cleanDriverName("  Ramesh\u0000 \n Jadhav ")).toBe("Ramesh Jadhav");
    expect(cleanDriverName("x".repeat(80))).toHaveLength(60);
    expect(cleanDriverName("   ")).toBeNull();
    expect(clientIp(new Headers({ "x-forwarded-for": "198.51.100.7, 10.0.0.1" }))).toBe(
      "198.51.100.7",
    );
  });

  it("allows CORS only for APP_ORIGIN and never sends referrers", () => {
    expect(corsHeaders(ORIGIN, ORIGIN)["Access-Control-Allow-Origin"]).toBe(ORIGIN);
    expect(
      corsHeaders("https://evil.example", ORIGIN)["Access-Control-Allow-Origin"],
    ).toBeUndefined();
    expect(corsHeaders(null, ORIGIN)["Referrer-Policy"]).toBe("no-referrer");
  });
});

describe("driver-upload-info", () => {
  it("returns only trip code, vehicle, material, allowed types and remaining uploads", async () => {
    const res = await info(TOKEN);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual([
      "allowed_doc_types",
      "material_name",
      "remaining_uploads",
      "trip_code",
      "vehicle_number",
    ]);
    expect(JSON.stringify(body)).not.toMatch(/business|rate|hash|customer|amount|rate_per/i);
  });

  it("gives the same generic answer for unknown, malformed, expired, revoked and used-up links", async () => {
    const expired = "E".repeat(43);
    const revoked = "R".repeat(43);
    const usedUp = "U".repeat(43);
    await addLink(expired, {}, "expired");
    await addLink(revoked, {}, "revoked");
    await addLink(usedUp, { remaining_uploads: 0 });
    links.get(await sha256Hex(usedUp))!.remaining = 0;
    const answers = await Promise.all(
      ["N".repeat(43), "not-a-token", expired, revoked, usedUp].map(async (t) => {
        const r = await info(t);
        return `${r.status} ${(await r.json()).error}`;
      }),
    );
    expect(new Set(answers)).toEqual(new Set([`404 ${GENERIC_LINK_ERROR}`]));
  });

  it("rate-limits link checks per IP", async () => {
    let last = 0;
    for (let i = 0; i < 121; i++) last = (await info(TOKEN, "198.51.100.9")).status;
    expect(last).toBe(429);
    expect((await info(TOKEN, "198.51.100.10")).status).toBe(200);
  });
});

describe("driver-upload", () => {
  it("stores files under the business folder and registers them with the doc type and driver name", async () => {
    const res = await uploadReq(
      { token: TOKEN, doc_type: "unloading_slip", driver_name: " Ramesh " },
      [
        { bytes: JPEG, name: "slip.jpg" },
        { bytes: PNG, name: "slip2.png", type: "application/octet-stream" },
      ],
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: 2, duplicates: 0, remaining_uploads: 18 });
    expect(stored[0]).toMatch(
      /^b0000000-0000-4000-8000-000000000001\/2026\/11\/[0-9a-f-]{36}\.jpg$/,
    );
    expect(stored[1]).toMatch(/\.png$/); // type from bytes, not from the browser
    expect(registered[0]).toMatchObject({
      docType: "unloading_slip",
      driverName: "Ramesh",
      sha256: await sha256Hex(JPEG),
    });
  });

  it("rejects bad links with the generic message and stores nothing", async () => {
    for (const token of ["N".repeat(43), "garbage"]) {
      const res = await uploadReq({ token, doc_type: "other" }, [{ bytes: JPEG, name: "a.jpg" }]);
      expect(res.status).toBe(404);
      expect((await res.json()).error).toBe(GENERIC_LINK_ERROR);
    }
    expect(stored).toEqual([]);
  });

  it("rejects wrong file types even with an image name / Content-Type", async () => {
    const html = new TextEncoder().encode("<html><script>alert(1)</script>");
    const res = await uploadReq({ token: TOKEN, doc_type: "other" }, [
      { bytes: html, name: "photo.jpg", type: "image/jpeg" },
    ]);
    expect(res.status).toBe(415);
    expect(stored).toEqual([]);
  });

  it("rejects files over 10 MB and more than 5 files", async () => {
    const big = new Uint8Array(MAX_FILE_BYTES + 1);
    big.set(JPEG);
    expect(
      (await uploadReq({ token: TOKEN, doc_type: "other" }, [{ bytes: big, name: "big.jpg" }]))
        .status,
    ).toBe(415);
    const six = Array.from({ length: 6 }, (_, i) => ({ bytes: JPEG, name: `${i}.jpg` }));
    expect((await uploadReq({ token: TOKEN, doc_type: "other" }, six)).status).toBe(400);
    expect(stored).toEqual([]);
  });

  it("only accepts document types allowed on the link", async () => {
    const res = await uploadReq({ token: TOKEN, doc_type: "provider_bill" }, [
      { bytes: JPEG, name: "a.jpg" },
    ]);
    expect(res.status).toBe(400);
  });

  it("never uploads more than the link has left", async () => {
    links.get(await sha256Hex(TOKEN))!.remaining = 1;
    const res = await uploadReq({ token: TOKEN, doc_type: "other" }, [
      { bytes: JPEG, name: "a.jpg" },
      { bytes: JPEG, name: "b.jpg" },
    ]);
    expect(res.status).toBe(400);
    expect(stored).toEqual([]);
  });

  it("removes the stored file when registration fails (e.g. link used up meanwhile)", async () => {
    const d = deps();
    d.register = async () => {
      throw new Error("invalid_link");
    };
    const form = new FormData();
    form.set("token", TOKEN);
    form.set("doc_type", "other");
    form.append("files", new File([JPEG], "a.jpg"));
    const res = await handleUpload(
      new Request("https://fn.test/u", { method: "POST", body: form }),
      d,
    );
    expect(res.status).toBe(404);
    expect(removed).toEqual(stored);
  });

  it("rate-limits uploads per IP (setting) and per link", async () => {
    links.get(await sha256Hex(TOKEN))!.remaining = 1000;
    let status = 0;
    for (let i = 0; i < 31; i++)
      status = (
        await uploadReq(
          { token: TOKEN, doc_type: "other" },
          [{ bytes: JPEG, name: "a.jpg" }],
          "198.51.100.20",
        )
      ).status;
    expect(status).toBe(429);
    const other = await uploadReq(
      { token: TOKEN, doc_type: "other" },
      [{ bytes: JPEG, name: "a.jpg" }],
      "198.51.100.21",
    );
    expect(other.status).toBe(200);
    // invalid tokens count too, so guessing is throttled
    let guess = 0;
    for (let i = 0; i < 31; i++)
      guess = (
        await uploadReq(
          { token: "G".repeat(43), doc_type: "other" },
          [{ bytes: JPEG, name: "a.jpg" }],
          "198.51.100.30",
        )
      ).status;
    expect(guess).toBe(429);
    expect(
      (await uploadReq({ token: "G".repeat(43), doc_type: "other" }, [], "198.51.100.30")).status,
    ).toBe(429);
    expect(RATE_LIMIT_ERROR).toMatch(/try again later/);
  });

  it("checks Cloudflare Turnstile when configured", async () => {
    turnstile = async (token) => token === "good";
    expect(
      (await uploadReq({ token: TOKEN, doc_type: "other" }, [{ bytes: JPEG, name: "a.jpg" }]))
        .status,
    ).toBe(403);
    expect(
      (
        await uploadReq({ token: TOKEN, doc_type: "other", "cf-turnstile-response": "good" }, [
          { bytes: JPEG, name: "a.jpg" },
        ])
      ).status,
    ).toBe(200);
  });

  it("never logs the raw token", async () => {
    await info(TOKEN);
    await info("N".repeat(43));
    await uploadReq({ token: TOKEN, doc_type: "other" }, [{ bytes: JPEG, name: "a.jpg" }]);
    await uploadReq({ token: "N".repeat(43), doc_type: "other" }, [{ bytes: JPEG, name: "a.jpg" }]);
    expect(logs.length).toBeGreaterThan(0);
    for (const l of logs) {
      expect(l).not.toContain(TOKEN);
      expect(l).not.toContain("N".repeat(43));
      expect(l).not.toContain("203.0.113.5");
    }
  });
});

describe("e-mail digest", () => {
  it("groups exceptions, escapes text and links back to the app", () => {
    const d = buildDigest(
      [
        {
          kind: "document_review",
          severity: "warning",
          title: "3 documents need review",
          detail: "no match · <img>",
          href: "/review",
          occurrences: 3,
          created_at: "x",
        },
        {
          kind: "shortage",
          severity: "danger",
          title: "Delivery difference above tolerance",
          detail: "TRP-2026-00101",
          href: "/trips/TRP-2026-00101",
          occurrences: 1,
          created_at: "x",
        },
      ],
      ORIGIN,
      "Meridian Supply",
    );
    expect(d.subject).toBe("Meridian Supply: 4 items need attention");
    expect(d.html).toContain(`href="${ORIGIN}/review"`);
    expect(d.html).toContain("&lt;img&gt;");
    expect(d.text).toContain("Deliveries above tolerance");
  });
});
