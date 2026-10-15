import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  // Fails loudly at startup rather than silently returning empty data later.
  throw new Error(
    "Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY — check your .env file."
  );
}

// Publishable key only. It grants no data access by itself; Row Level
// Security policies on each table decide what a signed-in driver can see.
// The service_role / sb_secret_... key must never appear in this project —
// that one bypasses RLS and belongs only on the Raspberry Pi.
export const supabase = createClient(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
