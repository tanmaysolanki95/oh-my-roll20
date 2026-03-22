"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { useSessionStore } from "@/store/session";
import type { Token, DiceRoll, BroadcastEvent, Session } from "@/types";

export function useRealtimeSession(sessionId: string) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const router = useRouter();
  // token_id → user_id of whoever is currently dragging that token
  const [lockedBy, setLockedBy] = useState<Record<string, string>>({});
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

  // Refs so the re-track effect always reads the latest values without re-subscribing
  const playerNameRef = useRef(playerName);
  const playerColorRef = useRef(playerColor);
  useEffect(() => { playerNameRef.current = playerName; }, [playerName]);
  useEffect(() => { playerColorRef.current = playerColor; }, [playerColor]);

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

    // --- Broadcast: token drag lock ---
    channel.on(
      "broadcast",
      { event: "token_drag_start" },
      ({ payload }: { payload: Extract<BroadcastEvent, { type: "token_drag_start" }> }) => {
        setLockedBy((prev) => ({ ...prev, [payload.token_id]: payload.user_id }));
      }
    );
    channel.on(
      "broadcast",
      { event: "token_drag_end" },
      ({ payload }: { payload: Extract<BroadcastEvent, { type: "token_drag_end" }> }) => {
        setLockedBy((prev) => {
          const next = { ...prev };
          delete next[payload.token_id];
          return next;
        });
      }
    );

    // --- Broadcast: dice roll ---
    channel.on(
      "broadcast",
      { event: "dice_roll" },
      ({ payload }: { payload: Extract<BroadcastEvent, { type: "dice_roll" }> }) => {
        addDiceRoll({
          id: payload.roll_id,
          session_id: sessionId,
          player_name: payload.player_name,
          expression: payload.expression,
          result: payload.result,
          breakdown: payload.breakdown,
          created_at: payload.created_at,
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
        // Note: Supabase only includes the PK in `old` by default (REPLICA IDENTITY DEFAULT),
        // so session_id is absent — just remove by id, which is a no-op if not in this session's store.
        ({ old: token }) => { removeToken((token as Token).id); }
      );

    // --- Postgres Changes: session (map URL, grid size) ---
    channel.on("postgres_changes", { event: "UPDATE", schema: "public", table: "sessions" },
      ({ new: session }) => { if ((session as Session).id === sessionId) setSession(session as Session); }
    );

    channel.subscribe(async (status) => {
      if (status !== "SUBSCRIBED") return;

      await channel.track({
        user_id: presenceKey,
        player_name: (playerName || "Anonymous").trim().slice(0, 50),
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

  // Re-track presence whenever the player's name or color changes so the
  // avatar initials in the presence bar always reflect the current value.
  useEffect(() => {
    const channel = channelRef.current;
    if (!channel) return;
    channel.track({
      user_id: userId ?? "",
      player_name: (playerName || "Anonymous").trim().slice(0, 50),
      color: playerColor,
    });
  }, [playerName, playerColor, userId]);

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

  const broadcastTokenDragStart = (token_id: string) => {
    if (!userId) return;
    channelRef.current?.send({
      type: "broadcast",
      event: "token_drag_start",
      payload: { type: "token_drag_start", token_id, user_id: userId },
    });
  };

  const broadcastTokenDragEnd = (token_id: string) => {
    if (!userId) return;
    channelRef.current?.send({
      type: "broadcast",
      event: "token_drag_end",
      payload: { type: "token_drag_end", token_id, user_id: userId },
    });
  };

  const broadcastDiceRoll = (
    roll_id: string,
    player_name: string,
    expression: string,
    result: number,
    breakdown: string,
    created_at: string,
  ) => {
    channelRef.current?.send({
      type: "broadcast",
      event: "dice_roll",
      payload: { type: "dice_roll", roll_id, created_at, player_name, expression, result, breakdown },
    });
  };

  return { broadcastTokenMove, broadcastSessionEnd, broadcastTokenDragStart, broadcastTokenDragEnd, broadcastDiceRoll, lockedBy };
}
