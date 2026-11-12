// Shared request plumbing for every Edge Function: request IDs, security headers, CORS locked to
// APP_ORIGIN, zod validation, JSON responses and a structured logger that also records errors in
// public.error_logs. Pure (Web APIs only, zod injected through ./zod.ts) so it is unit-tested.
import { z, type ZodTypeAny } from "./zod.ts";

export const SECURITY_HEADERS: Record<string, string> = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
};

/** Incoming x-request-id (if it looks safe) or a new UUID; echoed back on every response. */
export function requestIdOf(req: Request): string {
  const given = req.headers.get("x-request-id") ?? "";
  return /^[A-Za-z0-9_-]{8,64}$/.test(given) ? given : crypto.randomUUID();
}

/** CORS for browser-called functions: only the app's own origin is allowed. */
export function appCors(origin: string | null, appOrigin: string | null): Record<string, string> {
  const base: Record<string, string> = { Vary: "Origin" };
  if (!appOrigin || !origin) return base;
  if (origin.replace(/\/$/, "") !== appOrigin.replace(/\/$/, "")) return base;
  return {
    ...base,
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-request-id",
    "Access-Control-Expose-Headers": "x-request-id, content-disposition",
    "Access-Control-Max-Age": "600",
  };
}

export interface Ctx {
  requestId: string;
  headers: Record<string, string>;
}

export function context(req: Request, appOrigin: string | null): Ctx {
  const requestId = requestIdOf(req);
  return {
    requestId,
    headers: {
      ...SECURITY_HEADERS,
      ...appCors(req.headers.get("origin"), appOrigin),
      "x-request-id": requestId,
    },
  };
}

export const json = (ctx: Ctx, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...ctx.headers, "content-type": "application/json" },
  });

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Validates a JSON body with zod; 400 with the first readable problem otherwise. */
export async function parseJson<S extends ZodTypeAny>(
  req: Request,
  schema: S,
  maxBytes = 64 * 1024,
): Promise<z.infer<S>> {
  const length = Number(req.headers.get("content-length") ?? "0");
  if (length > maxBytes) throw new HttpError(413, "Request too large.");
  let body: unknown;
  try {
    const text = await req.text();
    if (text.length > maxBytes) throw new HttpError(413, "Request too large.");
    body = text ? JSON.parse(text) : {};
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(400, "Send a JSON body.");
  }
  return parseWith(schema, body);
}

export function parseWith<S extends ZodTypeAny>(schema: S, value: unknown): z.infer<S> {
  const r = schema.safeParse(value);
  if (!r.success) {
    const issue = r.error.issues[0];
    const where = issue?.path.length ? `${issue.path.join(".")}: ` : "";
    throw new HttpError(400, `Invalid request — ${where}${issue?.message ?? "bad input"}`);
  }
  return r.data;
}

export interface ErrorSink {
  (row: {
    source: string;
    request_id: string;
    level: "warn" | "error";
    message: string;
    context: Record<string, unknown>;
    business_id?: string | null;
    user_id?: string | null;
  }): Promise<unknown>;
}

const SENSITIVE = /token|secret|password|authorization|apikey|key/i;
/** Drops anything that looks like a credential before it is logged. */
export function redact(data: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(data).map(([k, v]) => [
      k,
      SENSITIVE.test(k) ? "[redacted]" : typeof v === "string" ? v.slice(0, 300) : v,
    ]),
  );
}

export function logger(fn: string, requestId: string, sink: ErrorSink | null) {
  return (level: "info" | "warn" | "error", event: string, data: Record<string, unknown> = {}) => {
    const safe = redact(data);
    console.log(JSON.stringify({ level, fn, requestId, event, ...safe }));
    if (level !== "info" && sink)
      sink({
        source: fn,
        request_id: requestId,
        level,
        message:
          `${event}${typeof safe["message"] === "string" ? `: ${safe["message"]}` : ""}`.slice(
            0,
            2000,
          ),
        context: safe,
        business_id: (data["businessId"] as string | undefined) ?? null,
        user_id: (data["userId"] as string | undefined) ?? null,
      }).catch(() => undefined);
  };
}

/** Turns thrown errors into JSON responses; unexpected ones are logged and hidden. */
export function errorResponse(ctx: Ctx, e: unknown, log: ReturnType<typeof logger>): Response {
  if (e instanceof HttpError)
    return json(ctx, { error: e.message, requestId: ctx.requestId }, e.status);
  log("error", "unexpected", { message: e instanceof Error ? e.message : String(e) });
  return json(
    ctx,
    { error: "Something went wrong. Please try again.", requestId: ctx.requestId },
    500,
  );
}

export const uuid = z.string().uuid();
