"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useRealtimeSession } from "@/lib/useRealtimeSession";
import { useSessionStore } from "@/store/session";
import { useAuth } from "@/lib/useAuth";
import PresenceBar from "@/components/session/PresenceBar";
import { cleanupSessionStorage } from "@/lib/cleanupSessionStorage";
import TokenPanel from "@/components/session/TokenPanel";
import DiceRoller from "@/components/dice/DiceRoller";
import DiceToast from "@/components/dice/DiceToast";
import { MIN_TOKEN_SIZE, MAX_TOKEN_SIZE } from "@/lib/mapUtils";
import { getThemeTokens } from "@/lib/themeTokens";
import type { Session } from "@/types";

const PLAYER_COLORS = [
  "#3b82f6", "#ef4444", "#22c55e", "#eab308",
  "#a855f7", "#f97316", "#06b6d4", "#ec4899",
];

const MapCanvas = dynamic(() => import("@/components/map/MapCanvas"), { ssr: false });

interface SessionViewProps {
  sessionId: string;
  initialSession: Session;
}

type TabId = "dm" | "tokens" | "dice";

export default function SessionView({ sessionId, initialSession }: SessionViewProps) {
  useAuth();

  const { setSession, session, tokens, userId, playerName, playerColor, setPlayerName, setPlayerColor, upsertToken } = useSessionStore();
  const { broadcastTokenMove, broadcastSessionEnd, broadcastTokenDragStart, broadcastTokenDragEnd, broadcastDiceRoll, lockedBy } = useRealtimeSession(sessionId);

  const [mapError, setMapError] = useState("");
  const [mapUploading, setMapUploading] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(300);
  const [activeTab, setActiveTab] = useState<TabId>("tokens");

  // Lifted from MapCanvas so DM tab controls can drive them
  const [fogTool, setFogTool] = useState<"reveal" | "hide" | null>(null);
  const [pendingTokenSize, setPendingTokenSize] = useState<number | null>(null);
  const [tokenSizeScope, setTokenSizeScope] = useState<"all" | "players">("all");
  // Token drag-to-place: set when user starts dragging an unplaced token from sidebar
  const [draggingTokenId, setDraggingTokenId] = useState<string | null>(null);

  // Name gate — shown when arriving via direct link without a saved name
  const [authChecked, setAuthChecked] = useState(false);
  const [gateNameInput, setGateNameInput] = useState("");
  const [gateColorPick, setGateColorPick] = useState(PLAYER_COLORS[0]);
  const gateNameRef = useRef<HTMLInputElement>(null);
  // Runs after useAuth's effect (effects execute in declaration order)
  useEffect(() => { setAuthChecked(true); }, []);
  // Pre-fill gate inputs if name/color were already set (e.g. after restore)
  useEffect(() => {
    if (playerName) setGateNameInput(playerName);
    if (playerColor) setGateColorPick(playerColor);
  }, [playerName, playerColor]);

  const router = useRouter();
  const isOwner = !!userId && session?.owner_id === userId;
  const themeTokens = getThemeTokens(session?.theme ?? "grimoire");

  // Force fog tool off when the DM hits the 50-operation cap
  const fogAtLimitRef = useRef(false);
  useEffect(() => {
    const atLimit = (session?.fog_history ?? []).length >= 50;
    if (atLimit && !fogAtLimitRef.current) setFogTool(null);
    fogAtLimitRef.current = atLimit;
  }, [session?.fog_history]);

  useEffect(() => { setSession(initialSession); }, [initialSession, setSession]);

  // Apply theme to <body> whenever session.theme changes; reset on unmount
  useEffect(() => {
    const theme = session?.theme ?? "grimoire";
    document.body.setAttribute("data-theme", theme);
    return () => { document.body.setAttribute("data-theme", "grimoire"); };
  }, [session?.theme]);

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
    setSession({ ...current, fog_shapes: [], fog_history: [] });
    await createClient().from("sessions").update({ fog_shapes: [], fog_history: [] }).eq("id", sessionId);
  };

  const undoFog = async () => {
    const current = useSessionStore.getState().session;
    if (!current || !isOwner) return;
    const history = current.fog_history ?? [];
    if (history.length === 0) return;
    const newHistory = history.slice(0, -1);
    const previousShapes = history[history.length - 1];
    setSession({ ...current, fog_shapes: previousShapes, fog_history: newHistory });
    await createClient()
      .from("sessions")
      .update({ fog_shapes: previousShapes, fog_history: newHistory })
      .eq("id", sessionId);
  };

  const commitTokenSize = async (newSize: number) => {
    const current = useSessionStore.getState().session;
    if (!current || !isOwner) return;
    setSession({ ...current, token_size: newSize });
    const supabase = createClient();
    const currentTokens = useSessionStore.getState().tokens;
    // Skip locked tokens — they are protected from batch resize
    const inScope = (t: { owner_id: string | null; size_locked: boolean }) =>
      (tokenSizeScope === "all" || t.owner_id !== null) && !t.size_locked;
    currentTokens.filter(inScope).forEach(t => upsertToken({ ...t, size: newSize }));
    const tokenQuery = supabase.from("tokens")
      .update({ size: newSize })
      .eq("session_id", current.id)
      .eq("size_locked", false);
    await Promise.all([
      supabase.from("sessions").update({ token_size: newSize }).eq("id", current.id),
      tokenSizeScope === "all" ? tokenQuery : tokenQuery.not("owner_id", "is", null),
    ]);
  };

  const lockAllSizes = async (locked: boolean) => {
    const current = useSessionStore.getState().session;
    if (!current || !isOwner) return;
    const currentTokens = useSessionStore.getState().tokens;
    currentTokens.forEach(t => upsertToken({ ...t, size_locked: locked }));
    await createClient().from("tokens").update({ size_locked: locked }).eq("session_id", current.id);
  };

  const handleTokenDrop = async (tokenId: string, x: number, y: number) => {
    const token = tokens.find(t => t.id === tokenId);
    if (!token) return;
    if (!isOwner && token.owner_id !== userId) return;
    setDraggingTokenId(null);
    upsertToken({ ...token, placed: true, x, y });
    const supabase = createClient();
    const { error } = await supabase.from('tokens').update({ placed: true, x, y }).eq('id', tokenId);
    if (error) console.error('Failed to place token:', error.message);
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
  const allSizesLocked = tokens.length > 0 && tokens.every(t => t.size_locked);
  const fogHistory = session?.fog_history ?? [];
  const fogAtLimit = fogHistory.length >= 50;

  // ── Name gate ─────────────────────────────────────────────────────────────
  // Show after auth check — wait one tick so useAuth's effect can restore the name first.
  if (authChecked && !playerName) {
    const submit = () => {
      const trimmed = gateNameInput.trim();
      if (!trimmed) { gateNameRef.current?.focus(); return; }
      setPlayerName(trimmed);
      setPlayerColor(gateColorPick);
    };

    return (
      <div className="min-h-screen bg-[#0f172a] text-white flex items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-5">
          <div className="text-center">
            <h1 className="text-xl font-black tracking-tight">{session?.name ?? "Game Session"}</h1>
            <p className="text-slate-500 text-sm mt-1">You need a name before entering.</p>
          </div>
          <div className="bg-slate-800/80 border border-slate-700/60 rounded-2xl p-5 space-y-4">
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Your name</label>
              <input
                ref={gateNameRef}
                autoFocus
                type="text"
                value={gateNameInput}
                onChange={(e) => setGateNameInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                placeholder="Enter your name"
                maxLength={30}
                className="w-full bg-slate-900 text-white px-4 py-2.5 rounded-xl border border-slate-700 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 text-sm transition-all placeholder:text-slate-500"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Your color</label>
              <div className="flex gap-2 flex-wrap">
                {PLAYER_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setGateColorPick(c)}
                    style={{ background: c }}
                    className={`w-7 h-7 rounded-full transition-all ${gateColorPick === c ? "scale-125 ring-2 ring-white ring-offset-2 ring-offset-[#1e293b]" : "hover:scale-110 opacity-80 hover:opacity-100"}`}
                  />
                ))}
              </div>
            </div>
            <button
              onClick={submit}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] text-white text-sm font-bold rounded-xl transition-all shadow-md shadow-indigo-900/40"
            >
              Enter Session
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-white" onPointerUp={() => setDraggingTokenId(null)}>
      <DiceToast />
      <PresenceBar isOwner={isOwner} onEndSession={endSession} onLeave={() => router.push("/")} />

      <div className="flex flex-1 min-h-0">
        {/* Main map area */}
        <div className="flex-1 min-w-0 relative p-2">
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <MapCanvas
            sessionId={sessionId}
            broadcastTokenMove={broadcastTokenMove}
            broadcastTokenDragStart={broadcastTokenDragStart}
            broadcastTokenDragEnd={broadcastTokenDragEnd}
            lockedBy={lockedBy}
            fogTool={fogTool}
            pendingTokenSize={pendingTokenSize}
            tokenSizeScope={tokenSizeScope}
            themeTokens={themeTokens}
            {...({ draggingTokenId, onTokenDrop: handleTokenDrop } as any)}
          />
        </div>

        {/* Sidebar resize handle */}
        <div
          className="w-1 shrink-0 cursor-col-resize transition-colors hover:opacity-80 active:opacity-100"
          style={{ background: "var(--theme-accent)" }}
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
        <div
          className="shrink-0 flex flex-col border-l"
          style={{ width: sidebarWidth, background: "var(--theme-bg-deep)", borderColor: "var(--theme-border)" }}
        >

          {/* Tab bar */}
          <div
            className="flex shrink-0 overflow-x-auto border-b"
            style={{ background: "var(--theme-bg-surface)", borderColor: "var(--theme-border)" }}
          >
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap hover:opacity-75"
                style={
                  activeTab === tab.id
                    ? { borderColor: "var(--theme-tab-border)", color: "var(--theme-text-primary)", fontFamily: "var(--theme-font-display)" }
                    : { borderColor: "transparent", color: "var(--theme-text-muted)" }
                }
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
                <div className="rounded-xl p-3 border" style={{ background: "var(--theme-bg-panel)", borderColor: "var(--theme-border)" }}>
                  <div className="text-[10px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: "var(--theme-text-secondary)", fontFamily: "var(--theme-font-display)" }}>🔗 Invite Code</div>
                  <p className="text-[11px] mb-2" style={{ color: "var(--theme-text-muted)" }}>Share this code with players so they can join the session.</p>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-lg font-black tracking-widest flex-1" style={{ color: "var(--theme-text-primary)", fontFamily: "var(--theme-font-display)" }}>{session?.join_code ?? "—"}</span>
                    <button onClick={copyJoinCode} className="text-xs px-2.5 py-1 rounded-lg transition-colors shrink-0 border hover:opacity-80" style={{ background: "var(--theme-bg-deep)", color: "var(--theme-text-secondary)", borderColor: "var(--theme-border)" }}>
                      {codeCopied ? "✓ Copied!" : "📋 Copy"}
                    </button>
                  </div>
                </div>

                {/* Battle map */}
                <div className="rounded-xl p-3 border" style={{ background: "var(--theme-bg-panel)", borderColor: "var(--theme-border)" }}>
                  <div className="text-[10px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: "var(--theme-text-secondary)", fontFamily: "var(--theme-font-display)" }}>🗺️ Battle Map</div>
                  <p className="text-[11px] mb-2" style={{ color: "var(--theme-text-muted)" }}>Upload the image players will fight on. Fog of war is enabled automatically when a map is loaded.</p>
                  <label className="block cursor-pointer">
                    <div
                      className="w-full py-2 px-3 border border-dashed rounded-lg text-center text-xs transition-colors"
                      style={
                        mapUploading
                          ? { borderColor: "var(--theme-border-accent)", color: "var(--theme-text-secondary)", background: "transparent" }
                          : { borderColor: "var(--theme-border)", color: "var(--theme-text-muted)", background: "transparent" }
                      }
                    >
                      {mapUploading ? "Uploading…" : session?.map_url ? "🔄 Replace map image" : "+ Upload image (PNG, JPG, WebP — max 20 MB)"}
                    </div>
                    <input type="file" accept="image/*" className="hidden" onChange={handleMapUpload} />
                  </label>
                  {mapError && <p className="text-xs text-red-400 mt-1.5">{mapError}</p>}
                  {session?.map_url && !mapUploading && <p className="text-[11px] mt-1.5" style={{ color: "var(--theme-text-muted)" }}>Map loaded ✓</p>}
                </div>

                {/* Theme switcher */}
                {isOwner && (
                  <div className="bg-[var(--theme-bg-panel)] border border-[var(--theme-border)] rounded-xl p-3">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--theme-text-secondary)] mb-2"
                         style={{ fontFamily: "var(--theme-font-display)" }}>
                      Realm Theme
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(["grimoire", "scroll", "neon"] as const).map((t) => {
                        const labels = { grimoire: "💀 Grimoire", scroll: "📜 Scroll", neon: "🔮 Arcane" };
                        const active = (session?.theme ?? "grimoire") === t;
                        return (
                          <button
                            key={t}
                            onClick={async () => {
                              if (!session) return;
                              setSession({ ...session, theme: t });
                              await createClient().from("sessions").update({ theme: t }).eq("id", sessionId);
                            }}
                            className={`rounded-lg py-1.5 px-1 text-[10px] font-semibold border transition-all
                              ${active
                                ? "bg-[var(--theme-accent-dim)]/20 border-[var(--theme-accent)] text-[var(--theme-text-primary)] shadow-[0_0_8px_var(--theme-accent-glow)]"
                                : "bg-[var(--theme-bg-deep)] border-[var(--theme-border)] text-[var(--theme-text-muted)] hover:text-[var(--theme-text-secondary)]"
                              }`}
                            style={{ fontFamily: "var(--theme-font-display)" }}
                          >
                            {labels[t]}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Fog of war */}
                <div className="rounded-xl p-3 border" style={{ background: "var(--theme-bg-panel)", borderColor: "var(--theme-border)" }}>
                  <div className="text-[10px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: "var(--theme-text-secondary)", fontFamily: "var(--theme-font-display)" }}>🌫️ Fog of War</div>
                  <p className="text-[11px] mb-3" style={{ color: "var(--theme-text-muted)" }}>Hide unexplored areas from players. Paint reveal or hide zones by dragging on the map.</p>

                  {/* On/Off toggle */}
                  <button
                    onClick={toggleFog}
                    className="w-full py-1.5 rounded-lg text-xs font-bold mb-2 transition-colors"
                    style={
                      session?.fog_enabled
                        ? { background: "var(--theme-accent)", color: "var(--theme-text-primary)", boxShadow: "0 0 8px var(--theme-accent-glow)" }
                        : { background: "var(--theme-bg-panel)", color: "var(--theme-text-muted)", border: "1px solid var(--theme-border)" }
                    }
                  >
                    {session?.fog_enabled ? "Fog is ON — players only see revealed areas" : "Fog is OFF — players see the whole map"}
                  </button>

                  {session?.fog_enabled && (
                    <>
                      {/* Painting tools */}
                      <div className="grid grid-cols-2 gap-2 mb-2">
                        <button
                          onClick={() => { if (!fogAtLimit) setFogTool(fogTool === "reveal" ? null : "reveal"); }}
                          disabled={fogAtLimit}
                          className={`py-2 rounded-lg text-xs font-bold transition-colors ${
                            fogAtLimit ? "bg-gray-800 text-gray-600 cursor-not-allowed"
                            : fogTool === "reveal" ? "bg-green-700 text-white"
                            : ""
                          }`}
                          style={
                            !fogAtLimit && fogTool !== "reveal"
                              ? { background: "var(--theme-bg-panel)", color: "var(--theme-text-secondary)", border: "1px solid var(--theme-border)" }
                              : {}
                          }
                          title={fogAtLimit ? "Limit reached" : "Drag on the map to uncover an area for players"}
                        >
                          👁 Reveal area
                        </button>
                        <button
                          onClick={() => { if (!fogAtLimit) setFogTool(fogTool === "hide" ? null : "hide"); }}
                          disabled={fogAtLimit}
                          className={`py-2 rounded-lg text-xs font-bold transition-colors ${
                            fogAtLimit ? "bg-gray-800 text-gray-600 cursor-not-allowed"
                            : fogTool === "hide" ? "bg-red-800 text-white"
                            : ""
                          }`}
                          style={
                            !fogAtLimit && fogTool !== "hide"
                              ? { background: "var(--theme-bg-panel)", color: "var(--theme-text-secondary)", border: "1px solid var(--theme-border)" }
                              : {}
                          }
                          title={fogAtLimit ? "Limit reached" : "Drag on the map to re-fog an area"}
                        >
                          🌑 Hide area
                        </button>
                      </div>

                      {/* Status line: at-limit notice OR active tool hint */}
                      {fogAtLimit ? (
                        <p className="text-[11px] text-amber-400 text-center mb-2">
                          Limit reached — undo or reset to continue.
                        </p>
                      ) : fogTool ? (
                        <p className="text-[11px] text-center mb-2" style={{ color: "var(--theme-text-secondary)" }}>
                          {fogTool === "reveal" ? "Drag on the map to reveal an area →" : "Drag on the map to hide an area →"}
                        </p>
                      ) : null}

                      {/* Operation counter + Undo */}
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px]" style={{ color: "var(--theme-text-muted)" }}>
                          {fogHistory.length} / 50 fog operations
                        </span>
                        <button
                          onClick={undoFog}
                          disabled={fogHistory.length === 0}
                          className="text-xs px-2.5 py-1 disabled:opacity-30 disabled:cursor-not-allowed rounded-lg transition-colors border hover:opacity-80"
                          style={{ background: "var(--theme-bg-deep)", color: "var(--theme-text-secondary)", borderColor: "var(--theme-border)" }}
                          title="Undo last fog operation"
                        >
                          ↩ Undo last
                        </button>
                      </div>

                      <button
                        onClick={clearFog}
                        className="w-full py-1.5 rounded-lg text-xs transition-colors border hover:opacity-80"
                        style={{ color: "var(--theme-text-muted)", borderColor: "var(--theme-border)", background: "transparent" }}
                        title="Remove all fog zones — the whole map becomes fogged again"
                      >
                        Reset all fog zones
                      </button>
                    </>
                  )}
                </div>

                {/* Token default size */}
                <div className="rounded-xl p-3 border" style={{ background: "var(--theme-bg-panel)", borderColor: "var(--theme-border)" }}>
                  <div className="text-[10px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: "var(--theme-text-secondary)", fontFamily: "var(--theme-font-display)" }}>⬤ Token Default Size</div>
                  <p className="text-[11px] mb-3" style={{ color: "var(--theme-text-muted)" }}>Resize all tokens at once. Locked tokens are skipped. Lock individual tokens in the Tokens tab.</p>
                  {/* Lock all / Unlock all */}
                  <button
                    onClick={() => lockAllSizes(!allSizesLocked)}
                    className="w-full py-1.5 rounded-lg text-xs font-bold mb-3 transition-colors border hover:opacity-80"
                    style={{ background: "var(--theme-bg-panel)", color: "var(--theme-text-secondary)", borderColor: "var(--theme-border)" }}
                  >
                    {allSizesLocked ? "🔓 Unlock all sizes" : "🔒 Lock all sizes"}
                  </button>

                  {/* Scope toggle */}
                  <div className="flex rounded-lg overflow-hidden text-xs mb-3 border" style={{ borderColor: "var(--theme-border)" }}>
                    {(["all", "players"] as const).map((s) => (
                      <button
                        key={s}
                        onClick={() => setTokenSizeScope(s)}
                        className="flex-1 py-1.5 font-medium transition-colors"
                        style={
                          tokenSizeScope === s
                            ? { background: "var(--theme-accent)", color: "var(--theme-text-primary)" }
                            : { background: "var(--theme-bg-deep)", color: "var(--theme-text-muted)" }
                        }
                        title={s === "all" ? "Resize every token on the map" : "Resize only player-owned tokens"}
                      >
                        {s === "all" ? "All tokens" : "Players only"}
                      </button>
                    ))}
                  </div>

                  {/* Slider */}
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] shrink-0" style={{ color: "var(--theme-text-muted)" }}>{MIN_TOKEN_SIZE}</span>
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
                      className="flex-1 h-1.5 rounded-lg appearance-none cursor-pointer"
                      style={{ background: "var(--theme-border)", accentColor: "var(--theme-accent)" } as React.CSSProperties}
                    />
                    <span className="text-[10px] shrink-0" style={{ color: "var(--theme-text-muted)" }}>{MAX_TOKEN_SIZE}</span>
                  </div>
                  <div className="text-center text-xs tabular-nums" style={{ color: "var(--theme-text-secondary)" }}>
                    {pendingTokenSize ?? tokenSize}px
                  </div>
                </div>

                {/* Player token limit */}
                <div className="rounded-xl p-3 border" style={{ background: "var(--theme-bg-panel)", borderColor: "var(--theme-border)" }}>
                  <div className="text-[10px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: "var(--theme-text-secondary)", fontFamily: "var(--theme-font-display)" }}>🎭 Player Token Limit</div>
                  <p className="text-[11px] mb-2" style={{ color: "var(--theme-text-muted)" }}>How many tokens each player is allowed to place on the map.</p>
                  <div className="flex items-center gap-2">
                    <button onClick={() => changeMaxTokens(-1)} className="w-7 h-7 flex items-center justify-center rounded-lg text-base transition-colors border hover:opacity-80" style={{ background: "var(--theme-bg-deep)", color: "var(--theme-text-primary)", borderColor: "var(--theme-border)" }}>−</button>
                    <span className="text-base font-bold tabular-nums w-8 text-center" style={{ color: "var(--theme-text-primary)" }}>{session?.max_tokens_per_player ?? 1}</span>
                    <button onClick={() => changeMaxTokens(1)} className="w-7 h-7 flex items-center justify-center rounded-lg text-base transition-colors border hover:opacity-80" style={{ background: "var(--theme-bg-deep)", color: "var(--theme-text-primary)", borderColor: "var(--theme-border)" }}>+</button>
                    <span className="text-xs" style={{ color: "var(--theme-text-muted)" }}>per player</span>
                  </div>
                </div>

                {/* Grid */}
                <div className="rounded-xl p-3 border" style={{ background: "var(--theme-bg-panel)", borderColor: "var(--theme-border)" }}>
                  <div className="text-[10px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: "var(--theme-text-secondary)", fontFamily: "var(--theme-font-display)" }}>⊞ Grid</div>
                  <p className="text-[11px] mb-3" style={{ color: "var(--theme-text-muted)" }}>Toggle the grid overlay and adjust the cell size to match your map.</p>

                  {/* On/Off toggle */}
                  <button
                    onClick={toggleGrid}
                    className="w-full py-1.5 rounded-lg text-xs font-bold mb-3 transition-colors"
                    style={
                      (session?.grid_enabled ?? true)
                        ? { background: "var(--theme-accent)", color: "var(--theme-text-primary)", boxShadow: "0 0 8px var(--theme-accent-glow)" }
                        : { background: "var(--theme-bg-panel)", color: "var(--theme-text-muted)", border: "1px solid var(--theme-border)" }
                    }
                  >
                    {(session?.grid_enabled ?? true) ? "Grid is ON" : "Grid is OFF"}
                  </button>

                  {/* Cell size stepper */}
                  {(session?.grid_enabled ?? true) && (
                    <div className="flex items-center gap-2">
                      <button onClick={() => changeGridSize(-10)} className="w-7 h-7 flex items-center justify-center rounded-lg text-base transition-colors border hover:opacity-80" style={{ background: "var(--theme-bg-deep)", color: "var(--theme-text-primary)", borderColor: "var(--theme-border)" }}>−</button>
                      <span className="text-base font-bold tabular-nums w-12 text-center" style={{ color: "var(--theme-text-primary)" }}>{session?.grid_size ?? 60}px</span>
                      <button onClick={() => changeGridSize(10)} className="w-7 h-7 flex items-center justify-center rounded-lg text-base transition-colors border hover:opacity-80" style={{ background: "var(--theme-bg-deep)", color: "var(--theme-text-primary)", borderColor: "var(--theme-border)" }}>+</button>
                      <span className="text-xs" style={{ color: "var(--theme-text-muted)" }}>cell size</span>
                    </div>
                  )}
                </div>

              </div>
            )}

            {/* ── Tokens tab ── */}
            {activeTab === "tokens" && (
              <div className="flex-1 min-h-0 px-3 pb-3 pt-2 overflow-hidden flex flex-col">
                <TokenPanel sessionId={sessionId} isOwner={isOwner} onTokenDragStart={setDraggingTokenId} />
              </div>
            )}

            {/* ── Dice tab ── */}
            {activeTab === "dice" && (
              <div className="flex-1 min-h-0 px-3 pb-3 pt-2 overflow-hidden flex flex-col">
                <DiceRoller sessionId={sessionId} broadcastDiceRoll={broadcastDiceRoll} />
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
