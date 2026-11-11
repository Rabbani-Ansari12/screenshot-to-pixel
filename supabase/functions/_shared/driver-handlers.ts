// Request handlers for the public driver channel, with all I/O injected (tested in
// driver-handlers.test.ts). The Edge Functions driver-upload-info and driver-upload only wire them up.
import {
  FILE_ERROR,
  GENERIC_LINK_ERROR,
  INFO_RATE_LIMIT_PER_IP,
  MAX_FILE_BYTES,
  MAX_FILES,
  RATE_LIMIT_ERROR,
  TOKEN_RATE_LIMIT,
  cleanDriverName,
  clientIp,
  constantTimeEqual,
  corsHeaders,
  isWellFormedToken,
  sha256Hex,
  sniffMime,
} from "./driver-link.ts";

export interface LinkInfo {
  token_hash: string;
  trip_code: string;
  vehicle_number: string;
  material_name: string;
  allowed_doc_types: string[];
  remaining_uploads: number;
  _business_id: string;
  _rate_limit_per_ip: number;
}

export interface PublicDeps {
  linkInfo(tokenHash: string): Promise<LinkInfo | null>;
  rateLimit(bucket: string, limit: number): Promise<boolean>;
  upload(path: string, bytes: Uint8Array, contentType: string): Promise<void>;
  remove(path: string): Promise<void>;
  register(args: {
    tokenHash: string;
    path: string;
    sha256: string;
    fileName: string;
    mimeType: string;
    size: number;
    docType: string;
    driverName: string | null;
  }): Promise<{ id: string; status: string; remaining_uploads: number }>;
  appOrigin: string | null;
  /** Null when Turnstile is not configured (secret missing or placeholder). */
  verifyTurnstile: ((token: string, ip: string) => Promise<boolean>) | null;
  uuid(): string;
  now(): Date;
  log(event: string, data: Record<string, unknown>): void;
}

const json = (body: unknown, status: number, headers: Record<string, string>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "content-type": "application/json" },
  });

async function checkLink(
  deps: PublicDeps,
  token: unknown,
): Promise<{ info: LinkInfo | null; hash: string | null }> {
  if (!isWellFormedToken(token)) return { info: null, hash: null };
  const hash = await sha256Hex(token);
  const info = await deps.linkInfo(hash);
  // The row was found by hash; compare again in constant time before trusting it.
  if (!info || !constantTimeEqual(info.token_hash, hash)) return { info: null, hash };
  return { info, hash };
}

/** GET ?token=… → trip code, vehicle, material, allowed types, remaining uploads. Nothing else. */
export async function handleInfo(req: Request, deps: PublicDeps): Promise<Response> {
  const cors = corsHeaders(req.headers.get("origin"), deps.appOrigin);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "GET") return json({ error: "Not allowed." }, 405, cors);
  const ipHash = (await sha256Hex(clientIp(req.headers))).slice(0, 32);
  if (!(await deps.rateLimit(`info:ip:${ipHash}`, INFO_RATE_LIMIT_PER_IP)))
    return json({ error: RATE_LIMIT_ERROR }, 429, cors);
  const { info, hash } = await checkLink(deps, new URL(req.url).searchParams.get("token"));
  if (!info) {
    deps.log("link_rejected", { where: "info", token: hash ? hash.slice(0, 8) : "malformed" });
    return json({ error: GENERIC_LINK_ERROR }, 404, cors);
  }
  return json(
    {
      trip_code: info.trip_code,
      vehicle_number: info.vehicle_number,
      material_name: info.material_name,
      allowed_doc_types: info.allowed_doc_types,
      remaining_uploads: info.remaining_uploads,
    },
    200,
    cors,
  );
}

/** POST multipart: token, doc_type, driver_name?, cf-turnstile-response?, files (1–5). */
export async function handleUpload(req: Request, deps: PublicDeps): Promise<Response> {
  const cors = corsHeaders(req.headers.get("origin"), deps.appOrigin);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "Not allowed." }, 405, cors);
  const length = Number(req.headers.get("content-length") ?? "0");
  if (length > MAX_FILES * MAX_FILE_BYTES + 1024 * 1024)
    return json({ error: FILE_ERROR }, 413, cors);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json({ error: "Could not read the upload. Please try again." }, 400, cors);
  }
  const ip = clientIp(req.headers);
  const ipHash = (await sha256Hex(ip)).slice(0, 32);
  const { info, hash } = await checkLink(deps, form.get("token"));

  // Count every attempt, valid or not, against the network and the link.
  if (!(await deps.rateLimit(`upload:ip:${ipHash}`, info?._rate_limit_per_ip ?? 30)))
    return json({ error: RATE_LIMIT_ERROR }, 429, cors);
  if (hash && !(await deps.rateLimit(`upload:token:${hash.slice(0, 32)}`, TOKEN_RATE_LIMIT)))
    return json({ error: RATE_LIMIT_ERROR }, 429, cors);
  if (!info || !hash) {
    deps.log("link_rejected", { where: "upload", token: hash ? hash.slice(0, 8) : "malformed" });
    return json({ error: GENERIC_LINK_ERROR }, 404, cors);
  }

  if (deps.verifyTurnstile) {
    const t = form.get("cf-turnstile-response");
    if (typeof t !== "string" || !(await deps.verifyTurnstile(t, ip)))
      return json({ error: "Please confirm you are not a robot and try again." }, 403, cors);
  }

  const docType = String(form.get("doc_type") ?? "");
  if (!info.allowed_doc_types.includes(docType))
    return json({ error: "Choose what kind of document this is." }, 400, cors);
  const driverName = cleanDriverName(form.get("driver_name"));

  const files = form
    .getAll("files")
    .filter((f): f is File => typeof f === "object" && f !== null && "arrayBuffer" in f);
  if (files.length < 1 || files.length > MAX_FILES)
    return json({ error: `Add 1 to ${MAX_FILES} files.` }, 400, cors);
  if (files.length > info.remaining_uploads)
    return json({ error: `This link allows ${info.remaining_uploads} more file(s).` }, 400, cors);

  const prepared: { bytes: Uint8Array; mime: string; ext: string; name: string }[] = [];
  for (const f of files) {
    if (f.size > MAX_FILE_BYTES || f.size === 0) return json({ error: FILE_ERROR }, 415, cors);
    const bytes = new Uint8Array(await f.arrayBuffer());
    const sniffed = sniffMime(bytes.subarray(0, 32));
    if (!sniffed) return json({ error: FILE_ERROR }, 415, cors);
    prepared.push({
      bytes,
      mime: sniffed.mime,
      ext: sniffed.ext,
      name: (f.name || `photo.${sniffed.ext}`).slice(0, 120),
    });
  }

  const now = deps.now();
  const folder = `${info._business_id}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  let received = 0;
  let duplicates = 0;
  let remaining = info.remaining_uploads;
  for (const p of prepared) {
    const path = `${folder}/${deps.uuid()}.${p.ext}`;
    const sha256 = await sha256Hex(p.bytes);
    await deps.upload(path, p.bytes, p.mime);
    try {
      const r = await deps.register({
        tokenHash: hash,
        path,
        sha256,
        fileName: p.name,
        mimeType: p.mime,
        size: p.bytes.length,
        docType,
        driverName,
      });
      received++;
      if (r.status === "duplicate") duplicates++;
      remaining = r.remaining_uploads;
    } catch (e) {
      await deps.remove(path).catch(() => undefined);
      deps.log("register_failed", {
        token: hash.slice(0, 8),
        reason: e instanceof Error ? e.message.slice(0, 40) : "error",
      });
      if (received === 0) return json({ error: GENERIC_LINK_ERROR }, 404, cors);
      break;
    }
  }
  deps.log("uploaded", { token: hash.slice(0, 8), received, duplicates });
  return json({ received, duplicates, remaining_uploads: remaining }, 200, cors);
}
