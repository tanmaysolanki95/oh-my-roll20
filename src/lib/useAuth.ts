"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useSessionStore } from "@/store/session";

/**
 * Ensures the user has an anonymous Supabase auth session.
 * Safe to call in multiple components — Supabase deduplicates.
 * The resulting user.id is stored in the session store as `userId`.
 */
export function useAuth() {
  const setUserId = useSessionStore((s) => s.setUserId);

  useEffect(() => {
    const supabase = createClient();

    // Restore existing session or create an anonymous one
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        setUserId(session.user.id);
      } else {
        const { data } = await supabase.auth.signInAnonymously();
        if (data.user) setUserId(data.user.id);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUserId(session?.user?.id ?? null);
    });

    return () => subscription.unsubscribe();
  }, [setUserId]);
}
