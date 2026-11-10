/**
 * Creates (or repairs) the first owner account. Safe to run any number of times.
 *
 *   npm run create-owner
 *
 * Reads OWNER_EMAIL / OWNER_PASSWORD from supabase/secrets.env and
 * SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY from supabase/.env (both gitignored).
 * Skips with a message while the owner values are still REPLACE_ME placeholders.
 */
import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function readEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const i = line.indexOf("=");
        return [
          line.slice(0, i).trim(),
          line
            .slice(i + 1)
            .trim()
            .replace(/^["']|["']$/g, ""),
        ];
      }),
  );
}

const env = {
  ...readEnvFile("supabase/.env"),
  ...readEnvFile("supabase/secrets.env"),
  ...process.env,
} as Record<string, string | undefined>;
const need = (name: string) => {
  const value = env[name];
  if (!value)
    throw new Error(
      `${name} is not set (expected in supabase/.env, supabase/secrets.env or the environment).`,
    );
  return value;
};

const email = env["OWNER_EMAIL"] ?? "";
const password = env["OWNER_PASSWORD"] ?? "";
if (!email || !password || email.startsWith("REPLACE_ME") || password.startsWith("REPLACE_ME")) {
  console.log(
    "Skipped: OWNER_EMAIL / OWNER_PASSWORD in supabase/secrets.env are still placeholders. Fill them in and run again.",
  );
  process.exit(0);
}
if (password.length < 10) {
  console.error("OWNER_PASSWORD must be at least 10 characters.");
  process.exit(1);
}

const admin = createClient(need("SUPABASE_URL"), need("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  // 1. Business (single business for now: reuse the existing one).
  const { data: businesses, error: bErr } = await admin
    .from("businesses")
    .select("id, name")
    .order("created_at")
    .limit(1);
  if (bErr) throw bErr;
  let businessId = businesses?.[0]?.id as string | undefined;
  if (!businessId) {
    const { data, error } = await admin
      .from("businesses")
      .insert({ name: "Meridian Supply" })
      .select("id")
      .single();
    if (error) throw error;
    businessId = data.id as string;
    console.log("Created business", businessId);
  }

  // 2. Settings row (invoice numbering, thresholds).
  const { error: sErr } = await admin
    .from("app_settings")
    .upsert({ business_id: businessId }, { onConflict: "business_id", ignoreDuplicates: true });
  if (sErr) throw sErr;

  // 3. Auth user (find by email, otherwise create).
  const appMetadata = { role: "owner", is_active: true, business_id: businessId };
  let userId: string | undefined;
  for (let page = 1; !userId; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    userId = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())?.id;
    if (data.users.length < 200) break;
  }
  if (userId) {
    const { error } = await admin.auth.admin.updateUserById(userId, { app_metadata: appMetadata });
    if (error) throw error;
    console.log("Owner user already exists:", email);
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: appMetadata,
      user_metadata: { full_name: "Owner" },
    });
    if (error) throw error;
    userId = data.user.id;
    console.log("Created owner user:", email);
  }

  // 4. Profile (the auth trigger creates it; make sure it is an active owner).
  const { error: pErr } = await admin
    .from("profiles")
    .upsert(
      { id: userId, business_id: businessId, email, role: "owner", is_active: true },
      { onConflict: "id" },
    );
  if (pErr) throw pErr;

  // 5. Employee record linked to the profile.
  const { data: existing, error: eErr } = await admin
    .from("employees")
    .select("id")
    .eq("profile_id", userId)
    .maybeSingle();
  if (eErr) throw eErr;
  if (!existing) {
    const { error } = await admin.from("employees").insert({
      business_id: businessId,
      profile_id: userId,
      full_name: "Owner",
      email,
      designation: "Owner",
    });
    if (error) throw error;
  }
  console.log("Owner ready. Sign in with", email);
}

main().catch((error) => {
  console.error("create-owner failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
