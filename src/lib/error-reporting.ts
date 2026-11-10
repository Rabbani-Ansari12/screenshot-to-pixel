/**
 * Client-side error reporting hook for React error boundaries.
 * Currently logs to the console. Plug in an error tracker (e.g. Sentry) here later.
 */
export function reportClientError(error: unknown, context: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  console.error("[client-error]", { route: window.location.pathname, ...context }, error);
}
