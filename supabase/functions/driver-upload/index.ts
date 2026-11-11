// Public (verify_jwt = false): drivers upload 1–5 files through a link. Files are type-checked by
// their bytes, stored privately and handed to the same intake as staff uploads.
// Deploy: npx supabase functions deploy driver-upload --use-api --no-verify-jwt
import { driverDeps } from "../_shared/driver-deps.ts";
import { handleUpload } from "../_shared/driver-handlers.ts";

Deno.serve(async (req) => {
  try {
    return await handleUpload(req, driverDeps());
  } catch {
    console.log(JSON.stringify({ level: "error", fn: "driver-upload", event: "unexpected" }));
    return new Response(JSON.stringify({ error: "Something went wrong. Please try again." }), {
      status: 500,
      headers: { "content-type": "application/json", "Cache-Control": "no-store" },
    });
  }
});
