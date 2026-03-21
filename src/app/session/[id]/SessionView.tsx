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
import { MIN_TOKEN_SIZE, MAX_TOKEN_SIZE } from "@/lib/mapUtils";
import type { Session } from "@/types";

const MapCanvas = dynamic(() => import("@/components/map/MapCanvas"), { ssr: false });

interface SessionViewProps {
  sessionId: string;
  initialSession: Session;
}

type TabId = "dm" | "tokens" | "dice";

export default function SessionView({ sessionId, initialSession }: SessionViewProps) {
  useAuth();

  const { setSession, session, userId, upsertToken } = useSessionStore();
  const { broadcastTokenMove, broadcastSessionEnd, broadcastTokenDragStart, broadcastTokenDragEnd, lockedBy } = useRealtimeSession(sessionId);

  const [mapError, setMapError] = useState("");
  const [mapUploading, setMapUploading] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(300);
  const [activeTab, setActiveTab] = useState<TabId>("tokens");

  // Lifted from MapCanvas so DM tab controls can drive them
  const [fogTool, setFogTool] = useState<"reveal" | "hide" | null>(null);
  const [pendingTokenSize, setPendingTokenSize] = useState<number | null>(null);
  const [tokenSizeScope, setTokenSizeScope] = useState<"all" | "players">("all");

  const router = useRouter();
  const isOwner = !!userId && session?.owner_id === userId;

  useEffect(() => { setSession(initialSession); }, [initialSession, setSession]);

  // ── DM actions ────────────────────────────────────────────────────────────

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

  const toggleGrid = async () => {
    const current = useSessionStore.getState().session;
    if (!current || !isOwner) return;
    const enabled = !(current.grid_enabled ?? true);
    setSession({ ...current, grid_enabled: enabled });
    await createClient().from("sessions").update({ grid_enabled: enabled }).eq("id", sessionId);
  };

  const toggleFog = async () => {
    const current = useSessionStore.getState().session;
    if (!current || !isOwner) return;
    const enabled = !current.fog_enabled;
    setSession({ ...current, fog_enabled: enabled });
    if (!enabled) setFogTool(null);
    await createClient().from("sessions").update({ fog_enabled: enabled }).eq("id", sessionId);
  };

  const clearFog = async () => {
    const current = useSessionStore.getState().session;
    if (!current || !isOwner) return;
    setSession({ ...current, fog_shapes: [] });
    await createClient().from("sessions").update({ fog_shapes: [] }).eq("id", sessionId);
  };

  const commitTokenSize = async (newSize: number) => {
    const current = useSessionStore.getState().session;
    if (!current || !isOwner) return;
    setSession({ ...current, token_size: newSize });
    const supabase = createClient();
    const currentTokens = useSessionStore.getState().tokens;
    const inScope = (t: { owner_id: string | null }) => tokenSizeScope === "all" || t.owner_id !== null;
    currentTokens.filter(inScope).forEach(t => upsertToken({ ...t, size: newSize }));
    const tokenQuery = supabase.from("tokens").update({ size: newSize }).eq("session_id", current.id);
    await Promise.all([
      supabase.from("sessions").update({ token_size: newSize }).eq("id", current.id),
      tokenSizeScope === "all" ? tokenQuery : tokenQuery.not("owner_id", "is", null),
    ]);
  };

  const handleMapUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isOwner) return;
    const file = e.target.files?.[0];
    if (!file) return;
    setMapError("");

    const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml"];
    const MAX_BYTES = 20 * 1024 * 1024;
    if (!ALLOWED_TYPES.includes(file.type)) { setMapError("Only image files are allowed (PNG, JPG, GIF, WebP, SVG)."); return; }
    if (file.size > MAX_BYTES) { setMapError("File too large — maximum 20 MB."); return; }

    setMapUploading(true);
    const supabase = createClient();
    const ext = file.name.split(".").pop();
    const path = `${sessionId}/map.${ext}`;

    const { error: uploadError } = await supabase.storage.from("maps").upload(path, file, { upsert: true });
    if (uploadError) { setMapError(uploadError.message); setMapUploading(false); return; }

    const { data } = supabase.storage.from("maps").getPublicUrl(path);
    const { error: updateError } = await supabase.from("sessions").update({ map_url: data.publicUrl, fog_enabled: true }).eq("id", sessionId);

    setMapUploading(false);
    if (updateError) { setMapError(updateError.message); return; }

    const current = useSessionStore.getState().session;
    if (current) setSession({ ...current, map_url: data.publicUrl, fog_enabled: true });
    e.target.value = "";
  };

  // ── Tabs ──────────────────────────────────────────────────────────────────

  const tabs: { id: TabId; icon: string; label: string }[] = [
    ...(isOwner ? [{ id: "dm" as TabId, icon: "👑", label: "Dungeon Master" }] : []),
    { id: "tokens", icon: "🎭", label: "Tokens" },
    { id: "dice", icon: "🎲", label: "Dice" },
  ];

  const tokenSize = session?.token_size ?? 56;

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
            fogTool={fogTool}
            pendingTokenSize={pendingTokenSize}
            tokenSizeScope={tokenSizeScope}
          />
        </div>

        {/* Sidebar resize handle */}
        <div
          className="w-1 shrink-0 cursor-col-resize bg-gray-800 hover:bg-indigo-500/60 active:bg-indigo-500 transition-colors"
          onPointerDown={(e) => {
            e.preventDefault();
            const startX = e.clientX;
            const startWidth = sidebarWidth;
            const onMove = (ev: PointerEvent) => setSidebarWidth(Math.max(220, Math.min(560, startWidth + (startX - ev.clientX))));
            const onUp = () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); };
            window.addEventListener("pointermove", onMove);
            window.addEventListener("pointerup", onUp);
          }}
        />

        {/* Right sidebar */}
        <div className="shrink-0 bg-gray-900 border-l border-gray-800 flex flex-col" style={{ width: sidebarWidth }}>

          {/* Tab bar */}
          <div className="flex border-b border-gray-800 bg-gray-900/80 shrink-0 overflow-x-auto">
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

            {/* ── Dungeon Master tab ── */}
            {activeTab === "dm" && isOwner && (
              <div className="flex-1 overflow-y-auto p-3 space-y-3">

                {/* Invite code */}
                <div className="bg-gray-800/60 border border-gray-700/40 rounded-xl p-3">
                  <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">🔗 Invite Code</div>
                  <p className="text-[11px] text-gray-500 mb-2">Share this code with players so they can join the session.</p>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-lg font-black text-indigo-300 tracking-widest flex-1">{session?.join_code ?? "—"}</span>
                    <button onClick={copyJoinCode} className="text-xs px-2.5 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white rounded-lg transition-colors shrink-0">
                      {codeCopied ? "✓ Copied!" : "📋 Copy"}
                    </button>
                  </div>
                </div>

                {/* Battle map */}
                <div className="bg-gray-800/60 border border-gray-700/40 rounded-xl p-3">
                  <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">🗺️ Battle Map</div>
                  <p className="text-[11px] text-gray-500 mb-2">Upload the image players will fight on. Fog of war is enabled automatically when a map is loaded.</p>
                  <label className="block cursor-pointer">
                    <div className={`w-full py-2 px-3 border border-dashed rounded-lg text-center text-xs transition-colors ${
                      mapUploading ? "border-indigo-500/50 text-indigo-400 bg-indigo-950/20" : "border-gray-600 text-gray-400 hover:border-indigo-500/60 hover:text-gray-200 bg-gray-900/40"
                    }`}>
                      {mapUploading ? "Uploading…" : session?.map_url ? "🔄 Replace map image" : "+ Upload image (PNG, JPG, WebP — max 20 MB)"}
                    </div>
                    <input type="file" accept="image/*" className="hidden" onChange={handleMapUpload} />
                  </label>
                  {mapError && <p className="text-xs text-red-400 mt-1.5">{mapError}</p>}
                  {session?.map_url && !mapUploading && <p className="text-[11px] text-gray-600 mt-1.5">Map loaded ✓</p>}
                </div>

                {/* Fog of war */}
                <div className="bg-gray-800/60 border border-gray-700/40 rounded-xl p-3">
                  <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">🌫️ Fog of War</div>
                  <p className="text-[11px] text-gray-500 mb-3">Hide unexplored areas from players. Paint reveal or hide zones by dragging on the map.</p>

                  {/* On/Off toggle */}
                  <button
                    onClick={toggleFog}
                    className={`w-full py-1.5 rounded-lg text-xs font-bold mb-2 transition-colors ${
                      session?.fog_enabled
                        ? "bg-indigo-700 hover:bg-indigo-600 text-white"
                        : "bg-gray-700 hover:bg-gray-600 text-gray-300"
                    }`}
                  >
                    {session?.fog_enabled ? "Fog is ON — players only see revealed areas" : "Fog is OFF — players see the whole map"}
                  </button>

                  {session?.fog_enabled && (
                    <>
                      {/* Painting tools */}
                      <div className="grid grid-cols-2 gap-2 mb-2">
                        <button
                          onClick={() => setFogTool(fogTool === "reveal" ? null : "reveal")}
                          className={`py-2 rounded-lg text-xs font-bold transition-colors ${
                            fogTool === "reveal" ? "bg-green-700 text-white" : "bg-gray-700 hover:bg-gray-600 text-gray-300"
                          }`}
                          title="Drag on the map to uncover an area for players"
                        >
                          👁 Reveal area
                        </button>
                        <button
                          onClick={() => setFogTool(fogTool === "hide" ? null : "hide")}
                          className={`py-2 rounded-lg text-xs font-bold transition-colors ${
                            fogTool === "hide" ? "bg-red-800 text-white" : "bg-gray-700 hover:bg-gray-600 text-gray-300"
                          }`}
                          title="Drag on the map to re-fog an area"
                        >
                          🌑 Hide area
                        </button>
                      </div>
                      {fogTool && (
                        <p className="text-[11px] text-indigo-400 text-center mb-2">
                          {fogTool === "reveal" ? "Drag on the map to reveal an area →" : "Drag on the map to hide an area →"}
                        </p>
                      )}
                      <button
                        onClick={clearFog}
                        className="w-full py-1.5 rounded-lg text-xs text-gray-500 hover:text-white hover:bg-gray-700 border border-gray-700 hover:border-gray-600 transition-colors"
                        title="Remove all fog zones — the whole map becomes fogged again"
                      >
                        Reset all fog zones
                      </button>
                    </>
                  )}
                </div>

                {/* Token default size */}
                <div className="bg-gray-800/60 border border-gray-700/40 rounded-xl p-3">
                  <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">⬤ Token Default Size</div>
                  <p className="text-[11px] text-gray-500 mb-3">Resize all tokens at once. Choose whether to affect all tokens or only player-owned ones.</p>

                  {/* Scope toggle */}
                  <div className="flex rounded-lg overflow-hidden border border-gray-700 text-xs mb-3">
                    {(["all", "players"] as const).map((s) => (
                      <button
                        key={s}
                        onClick={() => setTokenSizeScope(s)}
                        className={`flex-1 py-1.5 font-medium transition-colors ${
                          tokenSizeScope === s ? "bg-indigo-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                        }`}
                        title={s === "all" ? "Resize every token on the map" : "Resize only player-owned tokens"}
                      >
                        {s === "all" ? "All tokens" : "Players only"}
                      </button>
                    ))}
                  </div>

                  {/* Slider */}
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] text-gray-600 shrink-0">{MIN_TOKEN_SIZE}</span>
                    <input
                      type="range"
                      min={MIN_TOKEN_SIZE}
                      max={MAX_TOKEN_SIZE}
                      value={pendingTokenSize ?? tokenSize}
                      onChange={(e) => setPendingTokenSize(Number(e.target.value))}
                      onPointerUp={() => {
                        if (pendingTokenSize === null) return;
                        commitTokenSize(pendingTokenSize);
                        setPendingTokenSize(null);
                      }}
                      className="flex-1 h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                    />
                    <span className="text-[10px] text-gray-600 shrink-0">{MAX_TOKEN_SIZE}</span>
                  </div>
                  <div className="text-center text-xs text-gray-400 tabular-nums">
                    {pendingTokenSize ?? tokenSize}px
                  </div>
                </div>

                {/* Player token limit */}
                <div className="bg-gray-800/60 border border-gray-700/40 rounded-xl p-3">
                  <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">🎭 Player Token Limit</div>
                  <p className="text-[11px] text-gray-500 mb-2">How many tokens each player is allowed to place on the map.</p>
                  <div className="flex items-center gap-2">
                    <button onClick={() => changeMaxTokens(-1)} className="w-7 h-7 flex items-center justify-center bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-base transition-colors">−</button>
                    <span className="text-base font-bold text-gray-100 tabular-nums w-8 text-center">{session?.max_tokens_per_player ?? 1}</span>
                    <button onClick={() => changeMaxTokens(1)} className="w-7 h-7 flex items-center justify-center bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-base transition-colors">+</button>
                    <span className="text-xs text-gray-500">per player</span>
                  </div>
                </div>

                {/* Grid */}
                <div className="bg-gray-800/60 border border-gray-700/40 rounded-xl p-3">
                  <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">⊞ Grid</div>
                  <p className="text-[11px] text-gray-500 mb-3">Toggle the grid overlay and adjust the cell size to match your map.</p>

                  {/* On/Off toggle */}
                  <button
                    onClick={toggleGrid}
                    className={`w-full py-1.5 rounded-lg text-xs font-bold mb-3 transition-colors ${
                      (session?.grid_enabled ?? true)
                        ? "bg-indigo-700 hover:bg-indigo-600 text-white"
                        : "bg-gray-700 hover:bg-gray-600 text-gray-300"
                    }`}
                  >
                    {(session?.grid_enabled ?? true) ? "Grid is ON" : "Grid is OFF"}
                  </button>

                  {/* Cell size stepper */}
                  {(session?.grid_enabled ?? true) && (
                    <div className="flex items-center gap-2">
                      <button onClick={() => changeGridSize(-10)} className="w-7 h-7 flex items-center justify-center bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-base transition-colors">−</button>
                      <span className="text-base font-bold text-gray-100 tabular-nums w-12 text-center">{session?.grid_size ?? 60}px</span>
                      <button onClick={() => changeGridSize(10)} className="w-7 h-7 flex items-center justify-center bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-base transition-colors">+</button>
                      <span className="text-xs text-gray-500">cell size</span>
                    </div>
                  )}
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
