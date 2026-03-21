"use client";

import { createClient } from "@/lib/supabase/client";

/**
 * Removes all map files for a session from Supabase Storage.
 * Must be called through the Storage API (not by deleting storage.objects
 * rows directly) so Supabase's background workers can clean up the
 * underlying S3 objects.
 */
export async function cleanupSessionStorage(sessionId: string): Promise<void> {
  const supabase = createClient();
  const { data: files } = await supabase.storage.from("maps").list(sessionId);
  if (!files || files.length === 0) return;
  const paths = files.map((f) => `${sessionId}/${f.name}`);
  await supabase.storage.from("maps").remove(paths);
}
