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
      .update({ map_url: data.publicUrl })
      .eq("id", sessionId);

    if (updateError) { setMapError(updateError.message); return; }

    // Update local store immediately (don't wait for the subscription round-trip)
    // Spread from the current store session to avoid clobbering other fields.
    const current = useSessionStore.getState().session;
    if (current) setSession({ ...current, map_url: data.publicUrl });
  };

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-white">
      <PresenceBar isOwner={isOwner} />

      <div className="flex flex-1 min-h-0 gap-0">
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
            <label className="absolute bottom-4 left-4 cursor-pointer">
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

        {/* Right sidebar */}
        <div className="w-64 shrink-0 bg-gray-900 border-l border-gray-800 flex flex-col">
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
                <span className="text-xs text-gray-500 uppercase tracking-wider">Player tokens</span>
                <div className="flex items-center gap-1 ml-auto">
                  <button
                    onClick={() => changeMaxTokens(-1)}
                    className="w-6 h-6 flex items-center justify-center bg-gray-700 hover:bg-gray-600 text-white rounded text-sm transition-colors"
                  >−</button>
                  <span className="text-xs text-gray-300 tabular-nums w-6 text-center">
                    {session?.max_tokens_per_player ?? 1}
                  </span>
                  <button
                    onClick={() => changeMaxTokens(1)}
                    className="w-6 h-6 flex items-center justify-center bg-gray-700 hover:bg-gray-600 text-white rounded text-sm transition-colors"
                  >+</button>
                </div>
              </div>
              {/* Grid size */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 uppercase tracking-wider">Grid</span>
                <div className="flex items-center gap-1 ml-auto">
                  <button
                    onClick={() => changeGridSize(-10)}
                    className="w-6 h-6 flex items-center justify-center bg-gray-700 hover:bg-gray-600 text-white rounded text-sm transition-colors"
                  >−</button>
                  <span className="text-xs text-gray-300 tabular-nums w-8 text-center">
                    {session?.grid_size ?? 60}px
                  </span>
                  <button
                    onClick={() => changeGridSize(10)}
                    className="w-6 h-6 flex items-center justify-center bg-gray-700 hover:bg-gray-600 text-white rounded text-sm transition-colors"
                  >+</button>
                </div>
              </div>
              {/* End session */}
              <button
                onClick={endSession}
                className="w-full py-1 text-xs font-semibold text-red-400 hover:text-white hover:bg-red-700 border border-red-800 hover:border-red-700 rounded transition-colors"
              >
                End Session
              </button>
            </div>
          )}

          <div className="flex-1 min-h-0 p-3 border-b border-gray-800 overflow-hidden flex flex-col">
            <TokenPanel sessionId={sessionId} isOwner={isOwner} />
          </div>
          <div className="h-80 shrink-0 p-3 overflow-hidden flex flex-col">
            <DiceRoller sessionId={sessionId} />
          </div>
        </div>
      </div>
    </div>
  );
}
