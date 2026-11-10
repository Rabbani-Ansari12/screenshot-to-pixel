// Owner-only employee administration.
//   POST { action: "list" }
//   POST { action: "create", name, email, phone, designation, permissions[], method: "invite" | "temp_password" | "magic_link", password? }
//   POST { action: "set_permissions", profileId, permissions[] }
//   POST { action: "set_active", profileId, active }
//   POST { action: "reset_password", profileId, method: "email" | "temp_password", password? }
//
// Security:
//  * The caller's JWT is verified with Supabase Auth and the caller must be an ACTIVE OWNER.
//  * The service-role key is used only for Auth admin calls (create / ban / password).
//  * Table changes run with the caller's own session, so RLS applies and the audit log records the owner.
//  * The owner cannot deactivate themselves, and the last active owner can never be removed.
// Deploy: npx supabase functions deploy admin-manage-employee --use-api
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { getSecret, secretProblem } from "../_shared/env.ts";

const PERMISSIONS = [
  "view_records",
  "manage_orders",
  "review_documents",
  "manage_trips",
  "correct_extracted",
  "verify_bills",
  "record_payments",
  "view_financial_reports",
] as const;
type Permission = (typeof PERMISSIONS)[number];

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "content-type": "application/json" },
  });

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
const fail = (status: number, message: string): never => {
  throw new HttpError(status, message);
};
function must<R extends { data: unknown; error: { message: string } | null }>(
  res: R,
  what: string,
): R["data"] {
  if (res.error) fail(400, `${what}: ${res.error.message}`);
  return res.data;
}

const isPermissionList = (v: unknown): v is Permission[] =>
  Array.isArray(v) && v.every((p) => (PERMISSIONS as readonly string[]).includes(p as string));
const emailOk = (v: unknown): v is string =>
  typeof v === "string" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);
const passwordOk = (v: unknown): v is string => typeof v === "string" && v.length >= 10;

function appOrigin(): string | undefined {
  return secretProblem("APP_ORIGIN") ? undefined : getSecret("APP_ORIGIN").replace(/\/$/, "");
}

interface Ctx {
  callerId: string;
  businessId: string;
  asOwner: SupabaseClient; // caller's session (RLS + audit attribution)
  admin: SupabaseClient; // service role, Auth admin API only
  anon: SupabaseClient; // for e-mails sent through the normal auth flow
}

async function authenticate(req: Request): Promise<Ctx> {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) fail(401, "Sign in first.");
  const url = getSecret("SUPABASE_URL");
  const anonKey = getSecret("SUPABASE_ANON_KEY");
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const asOwner = createClient(url, anonKey, {
    ...options,
    global: { headers: { Authorization: authHeader } },
  });
  const admin = createClient(url, getSecret("SUPABASE_SERVICE_ROLE_KEY"), options);
  const anon = createClient(url, anonKey, options);

  const { data: userData, error } = await asOwner.auth.getUser(authHeader.slice(7));
  if (error || !userData.user) fail(401, "Your session has expired. Sign in again.");
  const callerId = userData.user!.id;
  const { data: profile } = await admin
    .from("profiles")
    .select("business_id, role, is_active")
    .eq("id", callerId)
    .maybeSingle();
  if (!profile || profile.role !== "owner" || !profile.is_active)
    fail(403, "Only the owner can manage employees.");
  return { callerId, businessId: profile!.business_id as string, asOwner, admin, anon };
}

async function list(ctx: Ctx) {
  const [profiles, employees, permissions] = await Promise.all([
    ctx.asOwner.from("profiles").select("*").order("created_at"),
    ctx.asOwner.from("employees").select("*").is("deleted_at", null),
    ctx.asOwner.from("user_permissions").select("profile_id, permission"),
  ]);
  const lastSignIn = new Map<string, string | null>();
  for (let page = 1; page < 50; page++) {
    const { data, error } = await ctx.admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) break;
    for (const u of data.users) lastSignIn.set(u.id, u.last_sign_in_at ?? null);
    if (data.users.length < 200) break;
  }
  const emp = new Map((must(employees, "employees") ?? []).map((e) => [e.profile_id, e]));
  const perms = must(permissions, "permissions") ?? [];
  return (must(profiles, "profiles") ?? []).map((p) => {
    const e = emp.get(p.id);
    return {
      id: p.id,
      name: e?.full_name || p.full_name || p.email || "—",
      email: p.email ?? e?.email ?? "",
      phone: e?.phone ?? p.phone ?? "",
      designation: e?.designation ?? (p.role === "owner" ? "Owner" : ""),
      role: p.role === "owner" ? "Owner" : "Employee",
      active: Boolean(p.is_active),
      permissions:
        p.role === "owner"
          ? [...PERMISSIONS]
          : perms.filter((x) => x.profile_id === p.id).map((x) => x.permission),
      lastActiveAt: lastSignIn.get(p.id) ?? "",
      joinedAt: (e?.joined_on as string | null) ?? String(p.created_at).slice(0, 10),
    };
  });
}

async function setPermissions(ctx: Ctx, profileId: string, wanted: Permission[]) {
  const current =
    must(
      await ctx.asOwner.from("user_permissions").select("permission").eq("profile_id", profileId),
      "permissions",
    ) ?? [];
  const have = new Set(current.map((x) => x.permission as Permission));
  const add = wanted.filter((p) => !have.has(p));
  const remove = [...have].filter((p) => !wanted.includes(p));
  if (remove.length)
    must(
      await ctx.asOwner
        .from("user_permissions")
        .delete()
        .eq("profile_id", profileId)
        .in("permission", remove),
      "remove permissions",
    );
  if (add.length)
    must(
      await ctx.asOwner
        .from("user_permissions")
        .insert(add.map((permission) => ({ profile_id: profileId, permission }))),
      "add permissions",
    );
}

async function targetProfile(ctx: Ctx, profileId: unknown) {
  if (typeof profileId !== "string" || !/^[0-9a-f-]{36}$/i.test(profileId))
    fail(400, "profileId is required.");
  const { data } = await ctx.admin
    .from("profiles")
    .select("*")
    .eq("id", profileId as string)
    .maybeSingle();
  if (!data || data.business_id !== ctx.businessId) fail(404, "Employee not found.");
  return data!;
}

async function create(ctx: Ctx, body: Record<string, unknown>) {
  const { name, email, phone, designation, permissions, method, password } = body;
  if (typeof name !== "string" || name.trim().length < 2) fail(400, "Enter the employee's name.");
  if (!emailOk(email)) fail(400, "Enter a valid email.");
  if (!isPermissionList(permissions) || permissions.length === 0)
    fail(400, "Give at least one permission.");
  if (!["invite", "temp_password", "magic_link"].includes(method as string))
    fail(400, "Choose how they sign in.");
  if (method === "temp_password" && !passwordOk(password))
    fail(400, "Temporary password must be at least 10 characters.");

  const redirectTo = appOrigin() ? `${appOrigin()}/reset-password` : undefined;
  const appMetadata = { role: "employee", is_active: true, business_id: ctx.businessId };
  let userId: string;
  if (method === "invite") {
    const { data, error } = await ctx.admin.auth.admin.inviteUserByEmail(email as string, {
      data: { full_name: (name as string).trim() },
      ...(redirectTo ? { redirectTo } : {}),
    });
    if (error)
      fail(
        400,
        error.message.includes("already")
          ? "A user with this email already exists."
          : error.message,
      );
    userId = data.user!.id;
    must(
      await ctx.admin.auth.admin.updateUserById(userId, { app_metadata: appMetadata }),
      "activate user",
    );
  } else {
    const { data, error } = await ctx.admin.auth.admin.createUser({
      email: email as string,
      email_confirm: true,
      app_metadata: appMetadata,
      user_metadata: { full_name: (name as string).trim() },
      ...(method === "temp_password" ? { password: password as string } : {}),
    });
    if (error)
      fail(
        400,
        error.message.includes("already")
          ? "A user with this email already exists."
          : error.message,
      );
    userId = data.user!.id;
    if (method === "magic_link") {
      const { error: otpError } = await ctx.anon.auth.signInWithOtp({
        email: email as string,
        options: {
          shouldCreateUser: false,
          ...(redirectTo ? { emailRedirectTo: `${appOrigin()}/` } : {}),
        },
      });
      if (otpError)
        fail(400, `User created, but the sign-in link could not be sent: ${otpError.message}`);
    }
  }

  // The auth trigger creates the profile; make sure it exists, then activate it as the owner (audited).
  const { data: existing } = await ctx.admin
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();
  if (!existing)
    must(
      await ctx.admin.from("profiles").insert({
        id: userId,
        business_id: ctx.businessId,
        email,
        full_name: (name as string).trim(),
        role: "employee",
        is_active: false,
      }),
      "create profile",
    );
  must(
    await ctx.asOwner
      .from("profiles")
      .update({
        full_name: (name as string).trim(),
        email,
        phone: (phone as string) || null,
        role: "employee",
        is_active: true,
      })
      .eq("id", userId),
    "activate profile",
  );
  must(
    await ctx.asOwner.from("employees").insert({
      profile_id: userId,
      full_name: (name as string).trim(),
      email,
      phone: (phone as string) || null,
      designation: (designation as string) || null,
      joined_on: new Date().toISOString().slice(0, 10),
    }),
    "create employee",
  );
  await setPermissions(ctx, userId, permissions as Permission[]);
  return { id: userId };
}

async function setActive(ctx: Ctx, profileId: unknown, active: unknown) {
  if (typeof active !== "boolean") fail(400, "active must be true or false.");
  const target = await targetProfile(ctx, profileId);
  if (!active && target.id === ctx.callerId) fail(400, "You cannot deactivate your own account.");
  if (!active && target.role === "owner") {
    const { count } = await ctx.admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("business_id", ctx.businessId)
      .eq("role", "owner")
      .eq("is_active", true);
    if ((count ?? 0) <= 1) fail(400, "The last owner cannot be deactivated.");
  }
  // Ban stops sign-in and token refresh immediately; existing access tokens expire within the hour,
  // and RLS already treats an inactive profile as having no access.
  must(
    await ctx.admin.auth.admin.updateUserById(target.id, {
      ban_duration: active ? "none" : "876000h",
      app_metadata: { role: target.role, is_active: active, business_id: ctx.businessId },
    }),
    "update login",
  );
  must(
    await ctx.asOwner.from("profiles").update({ is_active: active }).eq("id", target.id),
    "update profile",
  );
  must(
    await ctx.asOwner.from("employees").update({ is_active: active }).eq("profile_id", target.id),
    "update employee",
  );
  return { id: target.id, active };
}

async function resetPassword(ctx: Ctx, body: Record<string, unknown>) {
  const target = await targetProfile(ctx, body.profileId);
  if (body.method === "temp_password") {
    if (!passwordOk(body.password)) fail(400, "Temporary password must be at least 10 characters.");
    must(
      await ctx.admin.auth.admin.updateUserById(target.id, { password: body.password as string }),
      "set password",
    );
    return { id: target.id, method: "temp_password" };
  }
  if (!target.email) fail(400, "This employee has no email address.");
  const redirectTo = appOrigin() ? `${appOrigin()}/reset-password` : undefined;
  const { error } = await ctx.anon.auth.resetPasswordForEmail(
    target.email as string,
    redirectTo ? { redirectTo } : {},
  );
  if (error) fail(400, error.message);
  return { id: target.id, method: "email" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  try {
    const ctx = await authenticate(req);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    switch (body.action) {
      case "list":
        return json({ employees: await list(ctx) });
      case "create":
        return json(await create(ctx, body));
      case "set_permissions": {
        const target = await targetProfile(ctx, body.profileId);
        if (target.role === "owner") fail(400, "The owner always has every permission.");
        if (!isPermissionList(body.permissions)) fail(400, "Unknown permission.");
        await setPermissions(ctx, target.id, body.permissions as Permission[]);
        return json({ id: target.id });
      }
      case "set_active":
        return json(await setActive(ctx, body.profileId, body.active));
      case "reset_password":
        return json(await resetPassword(ctx, body));
      default:
        return json({ error: "Unknown action." }, 400);
    }
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error(
      "admin-manage-employee failed:",
      e instanceof Error ? e.message : "unknown error",
    );
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
});
