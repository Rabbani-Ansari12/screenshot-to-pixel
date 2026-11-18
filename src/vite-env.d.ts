/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** Optional Cloudflare Turnstile site key for the public driver upload page. */
  readonly VITE_TURNSTILE_SITE_KEY?: string;
  /** Optional shared tester login for the "Sign in as tester" button. Visible to anyone who loads the app. */
  readonly VITE_TESTER_EMAIL?: string;
  readonly VITE_TESTER_PASSWORD?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
