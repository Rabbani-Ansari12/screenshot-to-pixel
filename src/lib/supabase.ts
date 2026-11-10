/**
 * Typed Supabase client for the browser.
 * Uses only public values (URL + anon/publishable key). Never put the service-role key here.
 * Types come from src/types/database.ts (regenerate with `npm run db:types`; do not edit by hand).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
export type { Json } from "@/types/database";

export type TypedSupabaseClient = SupabaseClient<Database>;

let client: TypedSupabaseClient | undefined;

/** True when the public URL and key are set (or a client was injected, e.g. in tests). */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    client || (import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY),
  );
}

/** Replaces the shared client. Tests use this to inject an in-memory fake. */
export function setSupabaseClient(next: TypedSupabaseClient | undefined): void {
  client = next;
}

/** Returns the shared client, creating it on first use. Throws a clear error if env vars are missing. */
export function getSupabase(): TypedSupabaseClient {
  if (client) return client;
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Supabase is not configured: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local (see .env.example).",
    );
  }
  client = createClient<Database>(url, anonKey, {
    auth: {
      persistSession: typeof window !== "undefined",
      autoRefreshToken: typeof window !== "undefined",
      detectSessionInUrl: typeof window !== "undefined",
    },
  });
  return client;
}

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];
export type Views<T extends keyof Database["public"]["Views"]> =
  Database["public"]["Views"][T]["Row"];
export type Enums<T extends keyof Database["public"]["Enums"]> = Database["public"]["Enums"][T];
