/**
 * Typed Supabase client for the browser.
 * Uses only public values (URL + anon/publishable key). Never put the service-role key here.
 * Types come from src/types/database.ts (regenerate with `npm run db:types`; do not edit by hand).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export type TypedSupabaseClient = SupabaseClient<Database>;

let client: TypedSupabaseClient | undefined;

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
