/// <reference lib="deno.ns" />
// supabase/functions/cleanup-orphaned-maps/index.ts
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
  const result: CleanupResult = {
    checked: 0,
    orphaned: 0,
    deleted: 0,
    files_deleted: 0,
    errors: [],
  };

  // 1. List top-level prefixes (one per session ID) in the maps bucket.
  const { data: prefixEntries, error: listError } = await supabase.storage
    .from("maps")
    .list("", { limit: 1000 });

  if (listError) throw new Error(`Storage list failed: ${listError.message}`);
  if (!prefixEntries || prefixEntries.length === 0) return result;

  const prefixes = prefixEntries.map((e: { name: string }) => e.name);
  result.checked = prefixes.length;

  // 2. Find which prefixes still have a live session row.
  const { data: sessions, error: queryError } = await supabase
    .from("sessions")
    .select("id")
    .in("id", prefixes);

  if (queryError) throw new Error(`Sessions query failed: ${queryError.message}`);

  const liveIds = new Set((sessions ?? []).map((s: { id: string }) => s.id));
  const orphaned = prefixes.filter((p: string) => !liveIds.has(p));
  result.orphaned = orphaned.length;

  // 3. Delete each orphaned prefix's files.
  for (const prefix of orphaned) {
    const { data: files, error: filesError } = await supabase.storage
      .from("maps")
      .list(prefix, { limit: 1000 });

    if (filesError) {
      result.errors.push({ prefix, message: filesError.message });
      continue;
    }

    if (!files || files.length === 0) continue;

    const paths = files.map((f: { name: string }) => `${prefix}/${f.name}`);
    const { error: removeError } = await supabase.storage.from("maps").remove(paths);

    if (removeError) {
      result.errors.push({ prefix, message: removeError.message });
      continue;
    }

    result.deleted += 1;
    result.files_deleted += files.length;
  }

  return result;
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
