// Reports which secrets are configured (names only, never values).
// Requires a signed-in active owner. Deploy: npx supabase functions deploy config-check --use-api
import { createClient } from "npm:@supabase/supabase-js@2";
import { SECRET_NAMES, getSecret, secretProblem } from "../_shared/env.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

Deno.serve(async (req) => {
  const supabase = createClient(getSecret("SUPABASE_URL"), getSecret("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: isOwner, error } = await supabase.rpc("is_owner");
  if (error || !isOwner) return json({ error: "Owner access required" }, 403);

  const secrets = Object.fromEntries(SECRET_NAMES.map((name) => [name, secretProblem(name) ?? "configured"]));
  const pending = Object.entries(secrets).filter(([, state]) => state !== "configured").map(([name]) => name);
  return json({ ok: pending.length === 0, pending, secrets });
});
