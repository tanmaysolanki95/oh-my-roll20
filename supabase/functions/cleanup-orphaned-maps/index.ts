// supabase/functions/cleanup-orphaned-maps/index.ts
/// <reference lib="deno.ns" />
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

interface CleanupError {
  prefix: string;
  message: string;
}

export interface CleanupResult {
  /** Unique session ID prefixes found in the maps bucket. */
  checked: number;
  /** Prefixes with no matching row in the sessions table. */
  orphaned: number;
  /** Orphaned prefixes successfully deleted (may be less than orphaned when errors occur). */
  deleted: number;
  /** Total individual files removed across all deleted prefixes. */
  files_deleted: number;
  errors: CleanupError[];
}

// Exported so it can be unit-tested with a mock client.
export async function runCleanup(supabase: SupabaseClient): Promise<CleanupResult> {
  // Stub — implemented in Task 3.
  return { checked: 0, orphaned: 0, deleted: 0, files_deleted: 0, errors: [] };
}

if (import.meta.main) {
  Deno.serve(async (req: Request) => {
    if (req.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const cronSecret = Deno.env.get("CRON_SECRET");
    const authHeader = req.headers.get("Authorization");
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return new Response("Unauthorized", { status: 401 });
    }

    try {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      const result = await runCleanup(supabase);
      console.log("cleanup-orphaned-maps:", JSON.stringify(result));
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("cleanup-orphaned-maps error:", message);
      return new Response(JSON.stringify({ error: message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  });
}
