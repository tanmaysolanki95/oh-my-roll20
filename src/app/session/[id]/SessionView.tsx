"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useRealtimeSession } from "@/lib/useRealtimeSession";
import { useSessionStore } from "@/store/session";
import { useAuth } from "@/lib/useAuth";
import PresenceBar from "@/components/session/PresenceBar";
import TokenPanel from "@/components/session/TokenPanel";
import DiceRoller from "@/components/dice/DiceRoller";
import type { Session } from "@/types";

const MapCanvas = dynamic(() => import("@/components/map/MapCanvas"), { ssr: false });

interface SessionViewProps {
  sessionId: string;
  initialSession: Session;
}

export default function SessionView({ sessionId, initialSession }: SessionViewProps) {
  useAuth();

  const { setSession, session, userId } = useSessionStore();
  const { broadcastTokenMove, broadcastSessionEnd, broadcastTokenDragStart, broadcastTokenDragEnd, lockedBy } = useRealtimeSession(sessionId);
  const [mapError, setMapError] = useState("");
  const [codeCopied, setCodeCopied] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(256);
  const [tokensCollapsed, setTokensCollapsed] = useState(false);
  const [diceCollapsed, setDiceCollapsed] = useState(false);
  const [diceHeight, setDiceHeight] = useState(320);

  const copyJoinCode = () => {
    if (!session?.join_code) return;
    navigator.clipboard.writeText(session.join_code);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 1500);
  };
  const router = useRouter();

  const isOwner = !!userId && session?.owner_id === userId;

  useEffect(() => {
    setSession(initialSession);
  }, [initialSession, setSession]);

  const endSession = async () => {
    broadcastSessionEnd();
    await createClient().from("sessions").delete().eq("id", sessionId);
    router.push("/");
  };

  const changeMaxTokens = async (delta: number) => {
    const current = useSessionStore.getState().session;
    if (!current || !isOwner) return;
    const newMax = Math.max(1, Math.min(20, current.max_tokens_per_player + delta));
    setSession({ ...current, max_tokens_per_player: newMax });
    await createClient().from("sessions").update({ max_tokens_per_player: newMax }).eq("id", sessionId);
  };

  const changeGridSize = async (delta: number) => {
    const current = useSessionStore.getState().session;
    if (!current || !isOwner) return;
    const newSize = Math.max(20, Math.min(200, current.grid_size + delta));
    setSession({ ...current, grid_size: newSize }); // optimistic
    await createClient().from("sessions").update({ grid_size: newSize }).eq("id", sessionId);
  };

  const handleMapUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isOwner) return;
    const file = e.target.files?.[0];
    if (!file) return;
    setMapError("");

    const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml"];
    const MAX_BYTES = 20 * 1024 * 1024; // 20 MB
    if (!ALLOWED_TYPES.includes(file.type)) {
      setMapError("Only image files are allowed (PNG, JPG, GIF, WebP, SVG).");
      return;
    }
    if (file.size > MAX_BYTES) {
      setMapError("File too large — maximum 20 MB.");
      return;
    }

    const supabase = createClient();
    const ext = file.name.split(".").pop();
    const path = `${sessionId}/map.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("maps")
      .upload(path, file, { upsert: true });

    if (uploadError) { setMapError(uploadError.message); return; }

    const { data } = supabase.storage.from("maps").getPublicUrl(path);

    // Persist to DB — the sessions Postgres Changes subscription will
    // propagate the new map_url to all connected clients automatically.
    const { error: updateError } = await supabase
      .from("sessions")
      .update({ map_url: data.publicUrl, fog_enabled: true })
      .eq("id", sessionId);

    if (updateError) { setMapError(updateError.message); return; }

    // Update local store immediately (don't wait for the subscription round-trip)
    // Spread from the current store session to avoid clobbering other fields.
    const current = useSessionStore.getState().session;
    if (current) setSession({ ...current, map_url: data.publicUrl, fog_enabled: true });
  };

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-white">
      <PresenceBar isOwner={isOwner} />

      <div className="flex flex-1 min-h-0">
        {/* Main map area */}
        <div className="flex-1 min-w-0 relative p-2">
          <MapCanvas
            sessionId={sessionId}
            broadcastTokenMove={broadcastTokenMove}
            broadcastTokenDragStart={broadcastTokenDragStart}
            broadcastTokenDragEnd={broadcastTokenDragEnd}
            lockedBy={lockedBy}
          />

          {/* Map upload — DM only */}
          {isOwner && (
            <label className="absolute bottom-4 left-4 cursor-pointer" title="Upload an image to use as the battle map — enables fog of war automatically">
              <span className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-xs text-gray-300 rounded border border-gray-600 transition-colors">
                Upload Map
              </span>
              <input type="file" accept="image/*" className="hidden" onChange={handleMapUpload} />
            </label>
          )}
          {mapError && (
            <p className="absolute bottom-4 left-36 text-xs text-red-400">{mapError}</p>
          )}
        </div>

        {/* Resize handle */}
        <div
          className="w-1 shrink-0 cursor-col-resize bg-gray-800 hover:bg-indigo-500/60 active:bg-indigo-500 transition-colors"
          onPointerDown={(e) => {
            e.preventDefault();
            const startX = e.clientX;
            const startWidth = sidebarWidth;
            const onMove = (ev: PointerEvent) => {
              const delta = startX - ev.clientX;
              setSidebarWidth(Math.max(200, Math.min(520, startWidth + delta)));
            };
            const onUp = () => {
              window.removeEventListener("pointermove", onMove);
              window.removeEventListener("pointerup", onUp);
            };
            window.addEventListener("pointermove", onMove);
            window.addEventListener("pointerup", onUp);
          }}
        />

        {/* Right sidebar */}
        <div className="shrink-0 bg-gray-900 border-l border-gray-800 flex flex-col" style={{ width: sidebarWidth }}>
          {/* DM-only controls */}
          {isOwner && (
            <div className="px-3 py-2 border-b border-gray-800 space-y-2">
              {/* Join code */}
              {session?.join_code && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 uppercase tracking-wider shrink-0">Code</span>
                  <span className="font-mono text-sm font-bold text-indigo-300 tracking-widest flex-1">{session.join_code}</span>
                  <button
                    onClick={copyJoinCode}
                    className="text-xs text-gray-500 hover:text-white transition-colors shrink-0"
                  >
                    {codeCopied ? "Copied!" : "Copy"}
                  </button>
                </div>
              )}
              {/* Max tokens per player */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 uppercase tracking-wider" title="Maximum number of tokens each player can place on the map">Player tokens</span>
                <div className="flex items-center gap-1 ml-auto">
                  <button
                    onClick={() => changeMaxTokens(-1)}
                    className="w-6 h-6 flex items-center justify-center bg-gray-700 hover:bg-gray-600 text-white rounded text-sm transition-colors"
                    title="Decrease max tokens per player"
                  >−</button>
                  <span className="text-xs text-gray-300 tabular-nums w-6 text-center">
                    {session?.max_tokens_per_player ?? 1}
                  </span>
                  <button
                    onClick={() => changeMaxTokens(1)}
                    className="w-6 h-6 flex items-center justify-center bg-gray-700 hover:bg-gray-600 text-white rounded text-sm transition-colors"
                    title="Increase max tokens per player"
                  >+</button>
                </div>
              </div>
              {/* Grid size */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 uppercase tracking-wider" title="Size of each grid cell in canvas pixels">Grid</span>
                <div className="flex items-center gap-1 ml-auto">
                  <button
                    onClick={() => changeGridSize(-10)}
                    className="w-6 h-6 flex items-center justify-center bg-gray-700 hover:bg-gray-600 text-white rounded text-sm transition-colors"
                    title="Shrink grid cells"
                  >−</button>
                  <span className="text-xs text-gray-300 tabular-nums w-8 text-center">
                    {session?.grid_size ?? 60}px
                  </span>
                  <button
                    onClick={() => changeGridSize(10)}
                    className="w-6 h-6 flex items-center justify-center bg-gray-700 hover:bg-gray-600 text-white rounded text-sm transition-colors"
                    title="Enlarge grid cells"
                  >+</button>
                </div>
              </div>
              {/* End session */}
              <button
                onClick={endSession}
                className="w-full py-1 text-xs font-semibold text-red-400 hover:text-white hover:bg-red-700 border border-red-800 hover:border-red-700 rounded transition-colors"
                title="Permanently delete this session and all its tokens and dice rolls"
              >
                End Session
              </button>
            </div>
          )}

          {/* Tokens panel */}
          {tokensCollapsed ? (
            <button
              onClick={() => setTokensCollapsed(false)}
              className="flex items-center justify-between px-3 py-1.5 border-b border-gray-800 text-gray-500 hover:text-gray-300 hover:bg-gray-800/50 transition-colors shrink-0"
              title="Expand token panel"
            >
              <span className="text-xs font-semibold uppercase tracking-wider">Tokens</span>
              <span className="text-xs">▾</span>
            </button>
          ) : (
            <div className={`${diceCollapsed ? "flex-1" : ""} min-h-0 px-3 pb-3 pt-1 overflow-hidden flex flex-col`}
              style={!diceCollapsed ? { height: `calc(100% - ${diceHeight}px - 4px)` } : undefined}
            >
              <TokenPanel sessionId={sessionId} isOwner={isOwner} onCollapse={() => setTokensCollapsed(true)} />
            </div>
          )}

          {/* Drag handle between panels */}
          {!tokensCollapsed && !diceCollapsed && (
            <div
              className="h-1 shrink-0 cursor-row-resize bg-gray-800 hover:bg-indigo-500/60 active:bg-indigo-500 transition-colors"
              title="Drag to resize panels"
              onPointerDown={(e) => {
                e.preventDefault();
                const startY = e.clientY;
                const startH = diceHeight;
                const onMove = (ev: PointerEvent) => setDiceHeight(Math.max(120, Math.min(500, startH + (startY - ev.clientY))));
                const onUp = () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); };
                window.addEventListener("pointermove", onMove);
                window.addEventListener("pointerup", onUp);
              }}
            />
          )}

          {/* Dice panel */}
          {diceCollapsed ? (
            <button
              onClick={() => setDiceCollapsed(false)}
              className="flex items-center justify-between px-3 py-1.5 border-t border-gray-800 text-gray-500 hover:text-gray-300 hover:bg-gray-800/50 transition-colors shrink-0"
              title="Expand dice roller"
            >
              <span className="text-xs font-semibold uppercase tracking-wider">Dice</span>
              <span className="text-xs">▾</span>
            </button>
          ) : (
            <div
              className={`shrink-0 px-3 pb-3 pt-1 overflow-hidden flex flex-col ${tokensCollapsed ? "flex-1" : ""}`}
              style={!tokensCollapsed ? { height: diceHeight } : undefined}
            >
              <DiceRoller sessionId={sessionId} onCollapse={() => setDiceCollapsed(true)} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
