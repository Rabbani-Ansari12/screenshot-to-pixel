import { Navigate, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Layers3 } from "lucide-react";
import type { Permission } from "@/types";
import { NoAccess } from "@/components/common";
import { useAuth } from "@/lib/auth";

const REDIRECT_KEY = "auth-redirect";

/** Remembers where a signed-out user was going, so login can send them back. */
export function rememberRedirect(path: string) {
  try {
    sessionStorage.setItem(REDIRECT_KEY, path);
  } catch {
    /* storage unavailable */
  }
}

export function takeRedirect(): string {
  try {
    const path = sessionStorage.getItem(REDIRECT_KEY);
    sessionStorage.removeItem(REDIRECT_KEY);
    // Only same-app paths; never an absolute URL.
    return path && path.startsWith("/") && !path.startsWith("//") ? path : "/";
  } catch {
    return "/";
  }
}

export function Splash() {
  return (
    <div
      className="grid min-h-screen place-items-center bg-background"
      aria-busy="true"
      aria-label="Loading"
    >
      <span className="grid size-12 animate-pulse place-items-center rounded-2xl bg-primary text-primary-foreground">
        <Layers3 className="size-6" />
      </span>
    </div>
  );
}

/**
 * Requires a signed-in, active user (and optionally a permission).
 * This only decides what to render; the database enforces access with RLS.
 */
export function ProtectedRoute({
  children,
  permission,
}: {
  children: ReactNode;
  permission?: Permission | "owner";
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user, ready, can } = useAuth();
  if (!ready) return <Splash />;
  if (!user) {
    if (pathname !== "/") rememberRedirect(pathname);
    return <Navigate to="/login" />;
  }
  if (permission && !can(permission)) return <NoAccess />;
  return <>{children}</>;
}
