/**
 * Supabase Auth (email + password). Only the owner and employees log in.
 * Role and permissions come from `profiles` and `user_permissions`; the frontend uses them to
 * hide what a user cannot do, but Row Level Security in the database is the real enforcement.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Permission, Role } from "@/types";
import { setActingUser } from "@/services/core";
import { toAppError } from "@/services/supabase/errors";
import { getSupabase, isSupabaseConfigured } from "./supabase";
import { ALL_PERMISSIONS } from "./permissions";

export interface SessionUser {
  /** auth.users id = profiles.id */
  id: string;
  /** Kept for older components; same as id. */
  employeeId: string;
  name: string;
  email: string;
  role: Role;
  designation: string;
}

export interface AuthState {
  user: SessionUser | null;
  ready: boolean;
  permissions: Permission[];
  isOwner: boolean;
  can: (permission: Permission | "owner") => boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  /** Why the user was signed out (inactive account, expired session), shown on the login page. */
  notice: string | null;
  clearNotice: () => void;
  /** True after following a password-reset / invite link. */
  recovery: boolean;
}

export const INACTIVE_MESSAGE =
  "Your account is inactive. Ask the owner to reactivate it before signing in.";
export const EXPIRED_MESSAGE = "Your session has expired. Please sign in again.";
const REFRESH_ACCESS_MS = 5 * 60_000;

/** Pure: owner has everything; employees only what they were given. Exported for tests. */
export function canWith(
  user: Pick<SessionUser, "role"> | null,
  permissions: Permission[],
  permission: Permission | "owner",
): boolean {
  if (!user) return false;
  if (user.role === "Owner") return true;
  if (permission === "owner") return false;
  return permissions.includes(permission);
}

interface Access {
  user: SessionUser;
  permissions: Permission[];
}

class InactiveAccountError extends Error {}

async function loadAccess(userId: string, fallbackEmail: string): Promise<Access> {
  const sb = getSupabase();
  const { data: profile, error } = await sb
    .from("profiles")
    .select("id, full_name, email, role, is_active")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw toAppError(error);
  if (!profile || !profile.is_active) throw new InactiveAccountError(INACTIVE_MESSAGE);
  const role: Role = profile.role === "owner" ? "Owner" : "Employee";
  const [perms, employee] = await Promise.all([
    role === "Owner"
      ? Promise.resolve({ data: [], error: null })
      : sb.from("user_permissions").select("permission").eq("profile_id", userId),
    sb.from("employees").select("full_name, designation").eq("profile_id", userId).maybeSingle(),
  ]);
  if (perms.error) throw toAppError(perms.error);
  const name = employee.data?.full_name || profile.full_name || profile.email || fallbackEmail;
  return {
    user: {
      id: userId,
      employeeId: userId,
      name,
      email: profile.email ?? fallbackEmail,
      role,
      designation: employee.data?.designation ?? (role === "Owner" ? "Owner" : "Employee"),
    },
    permissions:
      role === "Owner"
        ? ALL_PERMISSIONS
        : (perms.data ?? []).map((p) => (p as { permission: Permission }).permission),
  };
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [access, setAccess] = useState<Access | null>(null);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [recovery, setRecovery] = useState(false);
  const signingOut = useRef(false);
  const currentUserId = useRef<string | null>(null);

  const reset = useCallback(
    (message: string | null) => {
      currentUserId.current = null;
      setAccess(null);
      queryClient.clear();
      if (message) setNotice(message);
    },
    [queryClient],
  );

  const refreshAccess = useCallback(
    async (userId: string, email: string) => {
      try {
        const next = await loadAccess(userId, email);
        currentUserId.current = userId;
        setAccess(next);
      } catch (e) {
        if (e instanceof InactiveAccountError) {
          signingOut.current = true;
          await getSupabase().auth.signOut();
          signingOut.current = false;
          reset(INACTIVE_MESSAGE);
        } else {
          // Network / server problem: keep the current state; pages show their own errors.
          console.error("Could not load access", e);
          if (!currentUserId.current) setNotice(toAppError(e).message);
        }
      }
    },
    [reset],
  );

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setNotice("Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
      setReady(true);
      return;
    }
    const sb = getSupabase();
    let cancelled = false;
    void sb.auth.getSession().then(async ({ data }) => {
      const s = data.session;
      if (s) await refreshAccess(s.user.id, s.user.email ?? "");
      if (!cancelled) setReady(true);
    });
    const { data: sub } = sb.auth.onAuthStateChange((event, session) => {
      // Don't await Supabase calls inside this callback (it holds the auth lock).
      setTimeout(() => {
        if (event === "PASSWORD_RECOVERY") setRecovery(true);
        if (event === "SIGNED_OUT") {
          const expected = signingOut.current;
          if (currentUserId.current) reset(expected ? null : EXPIRED_MESSAGE);
          return;
        }
        if (session && session.user.id !== currentUserId.current)
          void refreshAccess(session.user.id, session.user.email ?? "");
      }, 0);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [refreshAccess, reset]);

  // Pick up deactivation and permission changes without a reload.
  useEffect(() => {
    if (!access) return;
    const recheck = () => void refreshAccess(access.user.id, access.user.email);
    const timer = setInterval(recheck, REFRESH_ACCESS_MS);
    const onFocus = () => document.visibilityState === "visible" && recheck();
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [access, refreshAccess]);

  useEffect(() => {
    if (access) setActingUser(access.user.name);
  }, [access]);

  const login = useCallback(
    async (email: string, password: string) => {
      setNotice(null);
      const { data, error } = await getSupabase().auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) {
        if (/banned/i.test(error.message)) throw new Error(INACTIVE_MESSAGE);
        if (/invalid login credentials/i.test(error.message))
          throw new Error("Wrong email or password.");
        if (/email not confirmed/i.test(error.message))
          throw new Error("Confirm your email first, using the link we sent you.");
        throw toAppError(error);
      }
      await refreshAccess(data.user.id, data.user.email ?? email);
      if (!currentUserId.current) throw new Error(INACTIVE_MESSAGE);
    },
    [refreshAccess],
  );

  const logout = useCallback(async () => {
    signingOut.current = true;
    try {
      await getSupabase().auth.signOut();
    } finally {
      signingOut.current = false;
      reset(null);
    }
  }, [reset]);

  const requestPasswordReset = useCallback(async (email: string) => {
    const { error } = await getSupabase().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    // Never reveal whether an account exists; only surface rate limits / outages.
    if (error && !/not found|user/i.test(error.message)) throw toAppError(error);
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    const { error } = await getSupabase().auth.updateUser({ password });
    if (error) throw toAppError(error);
    setRecovery(false);
  }, []);

  const permissions = useMemo(() => access?.permissions ?? [], [access]);
  const can = useCallback(
    (permission: Permission | "owner") => canWith(access?.user ?? null, permissions, permission),
    [access, permissions],
  );

  const value = useMemo<AuthState>(
    () => ({
      user: access?.user ?? null,
      ready,
      permissions,
      isOwner: access?.user.role === "Owner",
      can,
      login,
      logout,
      requestPasswordReset,
      updatePassword,
      notice,
      clearNotice: () => setNotice(null),
      recovery,
    }),
    [
      access,
      ready,
      permissions,
      can,
      login,
      logout,
      requestPasswordReset,
      updatePassword,
      notice,
      recovery,
    ],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

/** True when the signed-in user has the permission (owner has all). Cosmetic only: RLS enforces. */
export function usePermission(permission: Permission | "owner"): boolean {
  return useAuth().can(permission);
}
