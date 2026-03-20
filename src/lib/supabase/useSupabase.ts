"use client";

import { useRef } from "react";
import { createClient } from "./client";
import type { SupabaseClient } from "@supabase/supabase-js";

// Returns a stable Supabase client instance per component mount.
// Using a ref ensures we never instantiate it during SSR and never
// recreate it on re-renders.
export function useSupabase(): SupabaseClient {
  const ref = useRef<SupabaseClient | null>(null);
  if (ref.current === null) {
    ref.current = createClient();
  }
  return ref.current;
}
