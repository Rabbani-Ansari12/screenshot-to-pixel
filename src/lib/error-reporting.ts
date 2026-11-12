/**
 * Client-side error reporting for React error boundaries: logged to the console and, when signed
 * in, to public.error_logs (rate limited in the database; the owner sees them under System Health).
 */
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";

export function reportClientError(error: unknown, context: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  const route = window.location.pathname;
  console.error("[client-error]", { route, ...context }, error);
  if (!isSupabaseConfigured()) return;
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  const stack =
    error instanceof Error ? (error.stack ?? "").split("\n").slice(0, 6).join("\n") : "";
  // Never send query strings (driver link tokens live in the path only for /u/; skip that page).
  if (route.startsWith("/u/")) return;
  void getSupabase()
    .rpc("log_client_error", {
      p_message: message.slice(0, 1000),
      p_context: { route, stack, ...context, userAgent: navigator.userAgent.slice(0, 160) },
    })
    .then(
      () => undefined,
      () => undefined,
    );
}
