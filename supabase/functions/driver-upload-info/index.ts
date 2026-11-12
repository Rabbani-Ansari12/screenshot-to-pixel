// Public (verify_jwt = false): what a driver upload link is for. Minimal trip data only.
// Deploy: npx supabase functions deploy driver-upload-info --use-api --no-verify-jwt
import { driverDeps } from "../_shared/driver-deps.ts";
import { handleInfo } from "../_shared/driver-handlers.ts";
import { serveHardened } from "../_shared/server.ts";

serveHardened("driver-upload-info", (req) => handleInfo(req, driverDeps()));
