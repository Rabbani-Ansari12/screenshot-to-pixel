// Public (verify_jwt = false): drivers upload 1–5 files through a link. Files are type-checked by
// their bytes, stored privately and handed to the same intake as staff uploads.
// Deploy: npx supabase functions deploy driver-upload --use-api --no-verify-jwt
import { driverDeps } from "../_shared/driver-deps.ts";
import { handleUpload } from "../_shared/driver-handlers.ts";
import { serveHardened } from "../_shared/server.ts";

serveHardened("driver-upload", (req) => handleUpload(req, driverDeps()));
