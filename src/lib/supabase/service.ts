import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

// Module-level singleton — service role key has no per-user state so
// sharing one instance across requests is safe.
let instance: SupabaseClient | null = null;

/**
 * Returns a Supabase client authenticated with the service role key.
 * This bypasses RLS entirely — only call this from server-side code
 * (API routes) after performing your own authorization checks.
 */
export function createServiceClient(): SupabaseClient {
  if (!instance) {
    instance = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }
  return instance;
}
