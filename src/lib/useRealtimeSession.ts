"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { useSessionStore } from "@/store/session";
import type { Token, DiceRoll, BroadcastEvent, Session } from "@/types";

export function useRealtimeSession(sessionId: string) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const router = useRouter();
  const {
    setTokens,
    upsertToken,
    removeToken,
    updateTokenPosition,
    addDiceRoll,
    setPresence,
    setSession,
    playerName,
    playerColor,
    userId,
  } = useSessionStore();

  useEffect(() => {
    const supabase = createClient();
    const presenceKey = userId ?? crypto.randomUUID();

    const channel = supabase.channel(`session:${sessionId}`, {
      config: { presence: { key: presenceKey } },
    });

    // --- Presence ---
    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState<{
        user_id: string;
        player_name: string;
        color: string;
      }>();
      setPresence(
        Object.values(state)
          .flat()
          .map((p) => ({ user_id: p.user_id, player_name: p.player_name, color: p.color }))
      );
    });

    // --- Broadcast: live token drag ---
    channel.on(
      "broadcast",
      { event: "token_move" },
      ({ payload }: { payload: Extract<BroadcastEvent, { type: "token_move" }> }) => {
        updateTokenPosition(payload.token_id, payload.x, payload.y);
      }
    );

    // --- Broadcast: session ended (DM kicked everyone out) ---
    channel.on(
      "broadcast",
      { event: "session_ended" },
      () => { router.push("/"); }
    );

    // --- Broadcast: dice roll ---
    channel.on(
      "broadcast",
      { event: "dice_roll" },
      ({ payload }: { payload: Extract<BroadcastEvent, { type: "dice_roll" }> }) => {
        addDiceRoll({
          id: crypto.randomUUID(),
          session_id: sessionId,
          player_name: payload.player_name,
          expression: payload.expression,
          result: payload.result,
          breakdown: payload.breakdown,
          created_at: new Date().toISOString(),
        });
      }
    );

    // --- Postgres Changes: tokens ---
    // Filter in JS rather than server-side to avoid filter parsing issues.
    channel
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "tokens" },
        ({ new: token }) => { if ((token as Token).session_id === sessionId) upsertToken(token as Token); }
      )
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "tokens" },
        ({ new: token }) => { if ((token as Token).session_id === sessionId) upsertToken(token as Token); }
      )
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "tokens" },
        ({ old: token }) => { if ((token as Token).session_id === sessionId) removeToken((token as Token).id); }
      );

    // --- Postgres Changes: session (map URL, grid size) ---
    channel.on("postgres_changes", { event: "UPDATE", schema: "public", table: "sessions" },
      ({ new: session }) => { if ((session as Session).id === sessionId) setSession(session as Session); }
    );

    channel.subscribe(async (status) => {
      if (status !== "SUBSCRIBED") return;

      await channel.track({
        user_id: presenceKey,
        player_name: playerName || "Anonymous",
        color: playerColor,
      });

      // Initial data load happens AFTER subscribing so we don't race with
      // incoming Postgres Changes events. We use upsertToken (not setTokens)
      // so concurrent subscription events aren't overwritten by this load.
      setTokens([]); // clear stale tokens from a previous session

      const [tokensRes, rollsRes] = await Promise.all([
        supabase.from("tokens").select("*").eq("session_id", sessionId),
        supabase.from("dice_rolls").select("*").eq("session_id", sessionId)
          .order("created_at", { ascending: false }).limit(50),
      ]);

      if (tokensRes.data) {
        tokensRes.data.forEach((t) => upsertToken(t as Token));
      }
      if (rollsRes.data) {
        const store = useSessionStore.getState();
        (rollsRes.data as DiceRoll[]).forEach((r) => store.addDiceRoll(r));
      }
    });

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const broadcastTokenMove = (token_id: string, x: number, y: number) => {
    channelRef.current?.send({
      type: "broadcast",
      event: "token_move",
      payload: { type: "token_move", token_id, x, y },
    });
  };

  const broadcastSessionEnd = () => {
    channelRef.current?.send({
      type: "broadcast",
      event: "session_ended",
      payload: { type: "session_ended" },
    });
  };

  return { broadcastTokenMove, broadcastSessionEnd };
}
