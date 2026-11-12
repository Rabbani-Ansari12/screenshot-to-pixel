// Deno-only helpers shared by the Edge Functions: the service-role client, the error_logs sink,
// rate limiting (public.rate_limit_hit) and the configured app origin.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { getSecret, secretProblem } from "./env.ts";
import { SECURITY_HEADERS, logger, requestIdOf, type ErrorSink } from "./http.ts";

let adminClient: SupabaseClient | null = null;
export function admin(): SupabaseClient {
  adminClient ??= createClient(getSecret("SUPABASE_URL"), getSecret("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return adminClient;
}

/** A client acting as the caller (their JWT), so RLS and permission checks apply. */
export function asCaller(req: Request): SupabaseClient {
  return createClient(getSecret("SUPABASE_URL"), getSecret("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export const appOrigin = (): string | null =>
  secretProblem("APP_ORIGIN") ? null : getSecret("APP_ORIGIN").replace(/\/$/, "");

export const errorSink: ErrorSink = async (row) => {
  const { error } = await admin().from("error_logs").insert(row);
  if (error)
    console.log(
      JSON.stringify({ level: "warn", event: "error_log_failed", message: error.message }),
    );
};

/** true while `bucket` is under `limit` hits in the current window. Fails open only on DB errors. */
export async function rateLimit(
  bucket: string,
  limit: number,
  windowSeconds = 3600,
): Promise<boolean> {
  const { data, error } = await admin().rpc("rate_limit_hit", {
    p_bucket: bucket,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) return true;
  return Boolean(data);
}

/**
 * Wraps a handler that builds its own responses (e.g. the public driver functions with their
 * own CORS): adds the request id and security headers, and logs unexpected errors to error_logs.
 */
export function serveHardened(
  fn: string,
  handler: (req: Request, log: ReturnType<typeof logger>) => Promise<Response>,
) {
  Deno.serve(async (req) => {
    const requestId = requestIdOf(req);
    const log = logger(fn, requestId, errorSink);
    let res: Response;
    try {
      res = await handler(req, log);
    } catch (e) {
      log("error", "unexpected", { message: e instanceof Error ? e.message : String(e) });
      res = new Response(
        JSON.stringify({ error: "Something went wrong. Please try again.", requestId }),
        {
          status: 500,
          headers: { "content-type": "application/json" },
        },
      );
    }
    const headers = new Headers(res.headers);
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) if (!headers.has(k)) headers.set(k, v);
    headers.set("x-request-id", requestId);
    return new Response(res.body, { status: res.status, headers });
  });
}
