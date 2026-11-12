// Reports which secrets are configured (names only, never values).
// Requires a signed-in active owner. Deploy: npx supabase functions deploy config-check --use-api
import { OPTIONAL_SECRETS, SECRET_NAMES, secretProblem } from "../_shared/env.ts";
import { HttpError, context, errorResponse, json, logger } from "../_shared/http.ts";
import { appOrigin, asCaller, errorSink } from "../_shared/server.ts";

Deno.serve(async (req) => {
  const ctx = context(req, appOrigin());
  const log = logger("config-check", ctx.requestId, errorSink);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: ctx.headers });
  try {
    const { data: isOwner, error } = await asCaller(req).rpc("is_owner");
    if (error || !isOwner) throw new HttpError(403, "Owner access required");
    const secrets = Object.fromEntries(
      SECRET_NAMES.map((name) => [name, secretProblem(name) ?? "configured"]),
    );
    const pending = Object.entries(secrets)
      .filter(([name, state]) => state !== "configured" && !OPTIONAL_SECRETS.includes(name))
      .map(([name]) => name);
    return json(ctx, { ok: pending.length === 0, pending, secrets });
  } catch (e) {
    return errorResponse(ctx, e, log);
  }
});
