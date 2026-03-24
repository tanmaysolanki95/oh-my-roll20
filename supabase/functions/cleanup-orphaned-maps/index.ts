// supabase/functions/cleanup-orphaned-maps/index.ts
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

interface CleanupError {
  prefix: string;
  message: string;
}

export interface CleanupResult {
  checked: number;
  orphaned: number;
  deleted: number;
  files_deleted: number;
  errors: CleanupError[];
}

// Exported so it can be unit-tested with a mock client.
export async function runCleanup(supabase: SupabaseClient): Promise<CleanupResult> {
  // Stub — implemented in Task 2.
  return { checked: 0, orphaned: 0, deleted: 0, files_deleted: 0, errors: [] };
}

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
