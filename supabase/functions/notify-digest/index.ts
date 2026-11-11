// Daily e-mail digest of exceptions through Resend. OFF by default:
//   - only for businesses with app_settings.email_digest_enabled = true,
//   - skipped silently while RESEND_API_KEY / NOTIFY_EMAIL_FROM are missing or REPLACE_ME placeholders.
// Called by pg_cron (kick_notify_digest) with the x-worker-secret header.
// Deploy: npx supabase functions deploy notify-digest --use-api --no-verify-jwt
import { createClient } from "npm:@supabase/supabase-js@2";
import { getSecret, secretProblem } from "../_shared/env.ts";
import { buildDigest, type DigestItem } from "../_shared/digest.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  if (
    secretProblem("WORKER_SECRET") ||
    !safeEqual(req.headers.get("x-worker-secret") ?? "", getSecret("WORKER_SECRET"))
  )
    return json({ error: "Unauthorized" }, 401);
  if (secretProblem("RESEND_API_KEY") || secretProblem("NOTIFY_EMAIL_FROM"))
    return json({ skipped: "not_configured" });

  const admin = createClient(getSecret("SUPABASE_URL"), getSecret("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const appOrigin = secretProblem("APP_ORIGIN") ? null : getSecret("APP_ORIGIN").replace(/\/$/, "");
  const { data: settings } = await admin
    .from("app_settings")
    .select("business_id, email_digest_last_sent_at")
    .eq("email_digest_enabled", true);
  const sent: string[] = [];
  for (const s of settings ?? []) {
    const since = s.email_digest_last_sent_at ?? new Date(Date.now() - 86_400_000).toISOString();
    const [{ data: items }, { data: owners }, { data: business }] = await Promise.all([
      admin
        .from("notifications")
        .select("kind, severity, title, detail, href, occurrences, created_at")
        .eq("business_id", s.business_id)
        .gt("updated_at", since)
        .order("updated_at", { ascending: false })
        .limit(100),
      admin
        .from("profiles")
        .select("email")
        .eq("business_id", s.business_id)
        .eq("role", "owner")
        .eq("is_active", true),
      admin.from("businesses").select("name").eq("id", s.business_id).single(),
    ]);
    const to = (owners ?? []).map((o) => o.email).filter((e): e is string => Boolean(e));
    if (!items?.length || !to.length) continue;
    const digest = buildDigest(
      items as DigestItem[],
      appOrigin,
      business?.name ?? "Meridian Supply",
    );
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getSecret("RESEND_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: getSecret("NOTIFY_EMAIL_FROM"),
        to,
        subject: digest.subject,
        html: digest.html,
        text: digest.text,
      }),
    });
    if (!res.ok) {
      console.log(
        JSON.stringify({
          level: "error",
          fn: "notify-digest",
          event: "send_failed",
          status: res.status,
        }),
      );
      continue;
    }
    await admin
      .from("app_settings")
      .update({ email_digest_last_sent_at: new Date().toISOString() })
      .eq("business_id", s.business_id);
    sent.push(s.business_id);
  }
  return json({ sent: sent.length });
});
