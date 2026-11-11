// Public (verify_jwt = false): what a driver upload link is for. Minimal trip data only.
// Deploy: npx supabase functions deploy driver-upload-info --use-api --no-verify-jwt
import { driverDeps } from "../_shared/driver-deps.ts";
import { handleInfo } from "../_shared/driver-handlers.ts";

Deno.serve(async (req) => {
  try {
    return await handleInfo(req, driverDeps());
  } catch {
    console.log(JSON.stringify({ level: "error", fn: "driver-upload-info", event: "unexpected" }));
    return new Response(JSON.stringify({ error: "Something went wrong. Please try again." }), {
      status: 500,
      headers: { "content-type": "application/json", "Cache-Control": "no-store" },
    });
  }
});
