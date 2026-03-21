"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useRealtimeSession } from "@/lib/useRealtimeSession";
import { useSessionStore } from "@/store/session";
import { useAuth } from "@/lib/useAuth";
import PresenceBar from "@/components/session/PresenceBar";
import { cleanupSessionStorage } from "@/lib/cleanupSessionStorage";
import TokenPanel from "@/components/session/TokenPanel";
import DiceRoller from "@/components/dice/DiceRoller";
import type { Session } from "@/types";

const MapCanvas = dynamic(() => import("@/components/map/MapCanvas"), { ssr: false });

interface SessionViewProps {
  sessionId: string;
  initialSession: Session;
}

type TabId = "session" | "tokens" | "dice";

export default function SessionView({ sessionId, initialSession }: SessionViewProps) {
  useAuth();

  const { setSession, session, userId } = useSessionStore();
  const { broadcastTokenMove, broadcastSessionEnd, broadcastTokenDragStart, broadcastTokenDragEnd, lockedBy } = useRealtimeSession(sessionId);
  const [mapError, setMapError] = useState("");
  const [mapUploading, setMapUploading] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(288);
  const [activeTab, setActiveTab] = useState<TabId>("tokens");

  const router = useRouter();
  const isOwner = !!userId && session?.owner_id === userId;

  useEffect(() => {
    setSession(initialSession);
  }, [initialSession, setSession]);

  const copyJoinCode = () => {
    if (!session?.join_code) return;
    navigator.clipboard.writeText(session.join_code);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 1500);
  };

  const endSession = async () => {
    broadcastSessionEnd();
    await Promise.all([
      createClient().from("sessions").delete().eq("id", sessionId),
      cleanupSessionStorage(sessionId),
    ]);
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
    setSession({ ...current, grid_size: newSize });
    await createClient().from("sessions").update({ grid_size: newSize }).eq("id", sessionId);
  };

  const handleMapUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isOwner) return;
    const file = e.target.files?.[0];
    if (!file) return;
    setMapError("");

    const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml"];
    const MAX_BYTES = 20 * 1024 * 1024;
    if (!ALLOWED_TYPES.includes(file.type)) {
      setMapError("Only image files are allowed (PNG, JPG, GIF, WebP, SVG).");
      return;
    }
    if (file.size > MAX_BYTES) {
      setMapError("File too large — maximum 20 MB.");
      return;
    }

    setMapUploading(true);
    const supabase = createClient();
    const ext = file.name.split(".").pop();
    const path = `${sessionId}/map.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("maps")
      .upload(path, file, { upsert: true });

    if (uploadError) { setMapError(uploadError.message); setMapUploading(false); return; }

    const { data } = supabase.storage.from("maps").getPublicUrl(path);

    const { error: updateError } = await supabase
      .from("sessions")
      .update({ map_url: data.publicUrl, fog_enabled: true })
      .eq("id", sessionId);

    setMapUploading(false);
    if (updateError) { setMapError(updateError.message); return; }

    const current = useSessionStore.getState().session;
    if (current) setSession({ ...current, map_url: data.publicUrl, fog_enabled: true });
    // Reset the input so the same file can be re-uploaded if needed
    e.target.value = "";
  };

  const tabs: { id: TabId; icon: string; label: string }[] = [
    ...(isOwner ? [{ id: "session" as TabId, icon: "⚙️", label: "Session" }] : []),
    { id: "tokens", icon: "🎭", label: "Tokens" },
    { id: "dice", icon: "🎲", label: "Dice" },
  ];

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-white">
      <PresenceBar isOwner={isOwner} onEndSession={endSession} />

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
        </div>

        {/* Sidebar resize handle */}
        <div
          className="w-1 shrink-0 cursor-col-resize bg-gray-800 hover:bg-indigo-500/60 active:bg-indigo-500 transition-colors"
          onPointerDown={(e) => {
            e.preventDefault();
            const startX = e.clientX;
            const startWidth = sidebarWidth;
            const onMove = (ev: PointerEvent) => {
              const delta = startX - ev.clientX;
              setSidebarWidth(Math.max(220, Math.min(560, startWidth + delta)));
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

          {/* Tab bar */}
          <div className="flex border-b border-gray-800 bg-gray-900/80 shrink-0">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? "border-indigo-500 text-white"
                    : "border-transparent text-gray-500 hover:text-gray-300 hover:border-gray-600"
                }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">

            {/* ── Session tab (DM only) ── */}
            {activeTab === "session" && isOwner && (
              <div className="flex-1 overflow-y-auto p-3 space-y-3">

                {/* Invite code */}
                <div className="bg-gray-800/60 border border-gray-700/40 rounded-xl p-3">
                  <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">🔗 Invite Code</div>
                  <p className="text-[11px] text-gray-500 mb-2">Share this code with players so they can join the session.</p>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-lg font-black text-indigo-300 tracking-widest flex-1">
                      {session?.join_code ?? "—"}
                    </span>
                    <button
                      onClick={copyJoinCode}
                      className="text-xs px-2.5 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white rounded-lg transition-colors shrink-0"
                    >
                      {codeCopied ? "✓ Copied!" : "📋 Copy"}
                    </button>
                  </div>
                </div>

                {/* Battle map upload */}
                <div className="bg-gray-800/60 border border-gray-700/40 rounded-xl p-3">
                  <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">🗺️ Battle Map</div>
                  <p className="text-[11px] text-gray-500 mb-2">Upload the image players will fight on. Fog of war is enabled automatically when a map is loaded.</p>
                  <label className="block cursor-pointer">
                    <div className={`w-full py-2 px-3 border border-dashed rounded-lg text-center text-xs transition-colors ${
                      mapUploading
                        ? "border-indigo-500/50 text-indigo-400 bg-indigo-950/20"
                        : "border-gray-600 text-gray-400 hover:border-indigo-500/60 hover:text-gray-200 bg-gray-900/40"
                    }`}>
                      {mapUploading ? "Uploading…" : session?.map_url ? "🔄 Replace map image" : "+ Upload image (PNG, JPG, WebP — max 20 MB)"}
                    </div>
                    <input type="file" accept="image/*" className="hidden" onChange={handleMapUpload} />
                  </label>
                  {mapError && <p className="text-xs text-red-400 mt-1.5">{mapError}</p>}
                  {session?.map_url && !mapUploading && (
                    <p className="text-[11px] text-gray-600 mt-1.5">Map loaded ✓</p>
                  )}
                </div>

                {/* Player token limit */}
                <div className="bg-gray-800/60 border border-gray-700/40 rounded-xl p-3">
                  <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">🎭 Player Token Limit</div>
                  <p className="text-[11px] text-gray-500 mb-2">How many tokens each player is allowed to place on the map.</p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => changeMaxTokens(-1)}
                      className="w-7 h-7 flex items-center justify-center bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-base transition-colors"
                    >−</button>
                    <span className="text-base font-bold text-gray-100 tabular-nums w-8 text-center">
                      {session?.max_tokens_per_player ?? 1}
                    </span>
                    <button
                      onClick={() => changeMaxTokens(1)}
                      className="w-7 h-7 flex items-center justify-center bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-base transition-colors"
                    >+</button>
                    <span className="text-xs text-gray-500">per player</span>
                  </div>
                </div>

                {/* Grid cell size */}
                <div className="bg-gray-800/60 border border-gray-700/40 rounded-xl p-3">
                  <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">⊞ Grid Cell Size</div>
                  <p className="text-[11px] text-gray-500 mb-2">Width of each grid square in canvas pixels. Adjust to match your map's grid.</p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => changeGridSize(-10)}
                      className="w-7 h-7 flex items-center justify-center bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-base transition-colors"
                    >−</button>
                    <span className="text-base font-bold text-gray-100 tabular-nums w-12 text-center">
                      {session?.grid_size ?? 60}px
                    </span>
                    <button
                      onClick={() => changeGridSize(10)}
                      className="w-7 h-7 flex items-center justify-center bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-base transition-colors"
                    >+</button>
                  </div>
                </div>

              </div>
            )}

            {/* ── Tokens tab ── */}
            {activeTab === "tokens" && (
              <div className="flex-1 min-h-0 px-3 pb-3 pt-2 overflow-hidden flex flex-col">
                <TokenPanel sessionId={sessionId} isOwner={isOwner} />
              </div>
            )}

            {/* ── Dice tab ── */}
            {activeTab === "dice" && (
              <div className="flex-1 min-h-0 px-3 pb-3 pt-2 overflow-hidden flex flex-col">
                <DiceRoller sessionId={sessionId} />
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
