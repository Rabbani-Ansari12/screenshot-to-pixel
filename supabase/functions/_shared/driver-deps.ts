// Real dependencies for the public driver functions (Deno). The service role is used only for
// the link functions (which return minimal trip data) and for writing into the documents bucket.
import { createClient } from "npm:@supabase/supabase-js@2";
import { getSecret, secretProblem } from "./env.ts";
import type { LinkInfo, PublicDeps } from "./driver-handlers.ts";

export function driverDeps(): PublicDeps {
  const admin = createClient(getSecret("SUPABASE_URL"), getSecret("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const turnstileSecret = secretProblem("TURNSTILE_SECRET_KEY")
    ? null
    : getSecret("TURNSTILE_SECRET_KEY");
  return {
    async linkInfo(tokenHash) {
      const { data, error } = await admin.rpc("driver_link_info", { p_token_hash: tokenHash });
      if (error) throw new Error("link lookup failed");
      return (data as LinkInfo | null) ?? null;
    },
    async rateLimit(bucket, limit) {
      const { data, error } = await admin.rpc("rate_limit_hit", {
        p_bucket: bucket,
        p_limit: limit,
        p_window_seconds: 3600,
      });
      if (error) throw new Error("rate limit failed");
      return Boolean(data);
    },
    async upload(path, bytes, contentType) {
      const { error } = await admin.storage
        .from("documents")
        .upload(path, bytes, { contentType, upsert: false });
      if (error) throw new Error("storage upload failed");
    },
    async remove(path) {
      await admin.storage.from("documents").remove([path]);
    },
    async register(a) {
      const { data, error } = await admin.rpc("driver_link_register_upload", {
        p_token_hash: a.tokenHash,
        p_storage_path: a.path,
        p_sha256: a.sha256,
        p_file_name: a.fileName,
        p_mime_type: a.mimeType,
        p_size_bytes: a.size,
        p_doc_type: a.docType,
        p_driver_name: a.driverName,
      });
      if (error) throw new Error(error.message.slice(0, 40));
      return data as { id: string; status: string; remaining_uploads: number };
    },
    appOrigin: secretProblem("APP_ORIGIN") ? null : getSecret("APP_ORIGIN").replace(/\/$/, ""),
    verifyTurnstile: turnstileSecret
      ? async (token, ip) => {
          const body = new FormData();
          body.set("secret", turnstileSecret);
          body.set("response", token);
          if (ip !== "unknown") body.set("remoteip", ip);
          const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
            method: "POST",
            body,
          });
          const out = (await res.json().catch(() => ({}))) as { success?: boolean };
          return out.success === true;
        }
      : null,
    uuid: () => crypto.randomUUID(),
    now: () => new Date(),
    // Structured logs: event names and hash prefixes only — never raw tokens, IPs or file contents.
    log: (event, data) =>
      console.log(
        JSON.stringify({
          level: "info",
          fn: "driver-upload",
          event,
          at: new Date().toISOString(),
          ...data,
        }),
      ),
  };
}
