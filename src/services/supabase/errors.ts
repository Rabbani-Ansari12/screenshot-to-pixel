/**
 * Turns Supabase / Postgres errors into short messages people can act on.
 * Pages show `error.message` in toasts and error states.
 */

export class AppError extends Error {
  constructor(
    message: string,
    readonly code: string | null = null,
    readonly status:
      "not_found" | "forbidden" | "invalid" | "conflict" | "network" | "unknown" = "unknown",
  ) {
    super(message);
    this.name = "AppError";
  }
}

interface PgLikeError {
  message?: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
  status?: number;
}

export function toAppError(
  error: unknown,
  fallback = "Something went wrong. Please try again.",
): AppError {
  if (error instanceof AppError) return error;
  const e = (error ?? {}) as PgLikeError;
  const message = typeof e.message === "string" ? e.message : "";
  const code = typeof e.code === "string" ? e.code : null;

  if (/Failed to fetch|NetworkError|fetch failed|Load failed/i.test(message))
    return new AppError(
      "Can't reach the server. Check your internet connection and try again.",
      code,
      "network",
    );
  if (code === "PGRST116") return new AppError("Record not found.", code, "not_found");
  if (code === "42501" || /row-level security|permission denied/i.test(message))
    return new AppError(
      /Only the owner/i.test(message)
        ? message
        : "You don't have permission to do that. Ask the owner to give you access.",
      code,
      "forbidden",
    );
  if (code === "PGRST301" || /JWT expired|invalid JWT/i.test(message))
    return new AppError("Your session has expired. Please sign in again.", code, "forbidden");
  if (code === "23505") {
    if (/vehicle/i.test(message))
      return new AppError("A vehicle with this number already exists.", code, "conflict");
    if (/materials_business_name/i.test(message))
      return new AppError("A material with this name already exists.", code, "conflict");
    return new AppError("This record already exists.", code, "conflict");
  }
  if (code === "23503")
    return new AppError(
      "This links to a record that no longer exists, or is still used elsewhere.",
      code,
      "conflict",
    );
  if (code === "23514" && message.includes("_check"))
    return new AppError(
      "Some values are out of range. Check the form and try again.",
      code,
      "invalid",
    );
  // Our own validation messages (app_fail, business-rule triggers) are already readable.
  if (code === "22023" || code === "23514" || code === "P0001")
    return new AppError(message, code, "invalid");
  if (code === "22P02")
    return new AppError("Some values are not in the right format.", code, "invalid");
  return new AppError(message || fallback, code);
}

/** Throws an AppError when a Supabase call failed or returned nothing, otherwise returns its data. */
type Result = { data: unknown; error: unknown };

export function unwrap<R extends Result>(result: R): NonNullable<R["data"]> {
  if (result.error) throw toAppError(result.error);
  if (result.data === null || result.data === undefined)
    throw new AppError("The server returned no data.", null, "unknown");
  return result.data as NonNullable<R["data"]>;
}

/** For maybeSingle(): null when the row does not exist (or is hidden by RLS). */
export function unwrapMaybe<R extends Result>(result: R): NonNullable<R["data"]> | null {
  if (result.error) throw toAppError(result.error);
  return (result.data ?? null) as NonNullable<R["data"]> | null;
}

/** For writes / void RPCs: only checks the error. */
export function check(result: { error: unknown }): void {
  if (result.error) throw toAppError(result.error);
}

/** Like unwrap, but a missing row is a NotFound error. */
export function unwrapOne<R extends Result>(result: R, what: string): NonNullable<R["data"]> {
  if (result.error) throw toAppError(result.error);
  if (result.data === null || result.data === undefined)
    throw new AppError(`${what} not found.`, null, "not_found");
  return result.data as NonNullable<R["data"]>;
}

/** List reads: throws on error, never returns null. */
export function rows<R extends Result>(result: R): NonNullable<R["data"]> {
  if (result.error) throw toAppError(result.error);
  return (result.data ?? []) as NonNullable<R["data"]>;
}
