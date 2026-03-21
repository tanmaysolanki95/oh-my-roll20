"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useSessionStore } from "@/store/session";
import { useAuth } from "@/lib/useAuth";
import Logo from "@/components/ui/Logo";

const PLAYER_COLORS = [
  "#3b82f6", "#ef4444", "#22c55e", "#eab308",
  "#a855f7", "#f97316", "#06b6d4", "#ec4899",
];

export default function Home() {
  const router = useRouter();
  const { setPlayerName, setPlayerColor, setUserId, playerName, playerColor, userId } = useSessionStore();
  useAuth();

  const [sessionName, setSessionName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [nameInput, setNameInput] = useState(playerName);
  const [colorPick, setColorPick] = useState(playerColor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [lobbyTheme, setLobbyTheme] = useState<"grimoire" | "scroll" | "neon">("grimoire");
  const [mapFile, setMapFile] = useState<File | null>(null);

  // Apply theme preview to <body> immediately when user picks a theme
  useEffect(() => {
    document.body.setAttribute("data-theme", lobbyTheme);
    return () => { document.body.setAttribute("data-theme", "grimoire"); };
  }, [lobbyTheme]);

  // Sync local inputs once useAuth() restores playerName/playerColor from localStorage
  useEffect(() => {
    if (playerName) setNameInput(playerName);
    if (playerColor) setColorPick(playerColor);
  }, [playerName, playerColor]);

  const saveIdentity = () => {
    setPlayerName(nameInput.trim());
    setPlayerColor(colorPick);
  };

  const createSession = async () => {
    if (!nameInput.trim()) { setError("Please enter your name first."); return; }
    if (!sessionName.trim()) { setError("Session name required"); return; }
    setLoading(true);
    setError("");
    saveIdentity();

    const supabase = createClient();

    let uid = userId;
    if (!uid) {
      const { data: authData, error: authError } = await supabase.auth.signInAnonymously();
      if (authError) { setError(`Auth error: ${authError.message}`); setLoading(false); return; }
      uid = authData.user?.id ?? null;
      if (uid) setUserId(uid);
    }
    if (!uid) { setError("Could not authenticate. Please refresh and try again."); setLoading(false); return; }

    const { data, error: err } = await supabase
      .from("sessions")
      .insert({ name: sessionName.trim(), owner_id: uid, theme: lobbyTheme })
      .select()
      .single();

    if (err || !data) { setError(err?.message ?? "Failed to create session"); setLoading(false); return; }

    // Optional map upload
    if (mapFile) {
      const ext = mapFile.name.split(".").pop() ?? "png";
      const path = `${data.id}/map.${ext}`;
      const { error: uploadErr } = await supabase.storage.from("maps").upload(path, mapFile);
      if (!uploadErr) {
        const { data: urlData } = supabase.storage.from("maps").getPublicUrl(path);
        await supabase.from("sessions").update({ map_url: urlData.publicUrl }).eq("id", data.id);
      }
      // Non-fatal: session still created; user can upload map from inside session
    }

    setLoading(false);
    router.push(`/session/${data.id}`);
  };

  const joinSession = async () => {
    if (!nameInput.trim()) { setError("Please enter your name first."); return; }
    if (!joinCode.trim()) { setError("Session code required"); return; }
    setLoading(true);
    setError("");
    saveIdentity();

    const supabase = createClient();
    const { data } = await supabase
      .from("sessions")
      .select("id")
      .eq("join_code", joinCode.trim().toUpperCase())
      .single();

    setLoading(false);
    if (!data) { setError("Session not found. Check the code and try again."); return; }
    router.push(`/session/${data.id}`);
  };

  return (
    <main className="min-h-screen relative flex items-center justify-center p-4 overflow-hidden">
      {/* Background image */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage: "var(--theme-lobby-bg)",
          filter: "brightness(0.42) saturate(0.75)",
        }}
      />
      {/* Ambient overlay */}
      <div className="absolute inset-0"
        style={{ background: "radial-gradient(ellipse at 50% 100%, var(--theme-bg-deep) 0%, transparent 70%), linear-gradient(180deg, rgba(0,0,0,0.3) 0%, var(--theme-bg-deep) 100%)" }}
      />

      {/* Glassmorphism card */}
      <div className="relative z-10 w-full max-w-xs flex flex-col gap-4 rounded-xl p-6"
        style={{
          background: `color-mix(in srgb, var(--theme-bg-deep) 78%, transparent)`,
          border: "1px solid var(--theme-border-accent)",
          backdropFilter: "blur(12px)",
          boxShadow: "0 8px 40px rgba(0,0,0,0.65), 0 0 40px var(--theme-accent-glow)",
        }}
      >
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: `linear-gradient(145deg, var(--theme-accent-dim), var(--theme-accent))`, boxShadow: "0 0 18px var(--theme-accent-glow)", border: "1px solid var(--theme-border-accent)" }}>
            <Logo size={26} />
          </div>
          <div>
            <div className="font-bold leading-tight text-[var(--theme-text-primary)]"
              style={{ fontFamily: "var(--theme-font-display)", fontSize: "1rem" }}>
              oh-my-roll20
            </div>
            <div className="text-[0.6rem] uppercase tracking-widest text-[var(--theme-text-muted)]"
              style={{ fontFamily: "var(--theme-font-display)" }}>
              Virtual Tabletop
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="h-px" style={{ background: `linear-gradient(90deg, transparent, var(--theme-accent-dim) 30%, var(--theme-accent) 50%, var(--theme-accent-dim) 70%, transparent)`, opacity: 0.6 }} />

        {/* Identity */}
        <div className="flex flex-col gap-2">
          <div className="text-[0.55rem] uppercase tracking-[0.2em] text-[var(--theme-text-secondary)]"
            style={{ fontFamily: "var(--theme-font-display)" }}>
            Your Name
          </div>
          <input
            type="text"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            placeholder="Adventurer"
            className="w-full px-3 py-2 rounded-md text-sm transition-all placeholder:opacity-40 focus:outline-none"
            style={{
              background: `color-mix(in srgb, var(--theme-bg-deep) 85%, transparent)`,
              border: "1px solid var(--theme-border)",
              color: "var(--theme-text-primary)",
              fontFamily: "var(--theme-font-body)",
            }}
          />
          <div className="flex gap-1.5 flex-wrap">
            {PLAYER_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColorPick(c)}
                style={{ background: c }}
                className={`w-5 h-5 rounded-full transition-all ${colorPick === c ? "scale-125 ring-2 ring-white ring-offset-1 ring-offset-[var(--theme-bg-deep)]" : "hover:scale-110 opacity-80 hover:opacity-100"}`}
              />
            ))}
          </div>
        </div>

        {/* Divider */}
        <div className="h-px" style={{ background: `linear-gradient(90deg, transparent, var(--theme-accent-dim) 30%, var(--theme-accent) 50%, var(--theme-accent-dim) 70%, transparent)`, opacity: 0.4 }} />

        {/* Create section */}
        <div className="flex flex-col gap-2">
          <div className="text-[0.55rem] uppercase tracking-[0.2em] text-[var(--theme-text-secondary)]"
            style={{ fontFamily: "var(--theme-font-display)" }}>
            New Session
          </div>
          <input
            type="text"
            value={sessionName}
            onChange={(e) => setSessionName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createSession()}
            placeholder="Campaign name"
            className="w-full px-3 py-2 rounded-md text-sm transition-all placeholder:opacity-40 focus:outline-none"
            style={{
              background: `color-mix(in srgb, var(--theme-bg-deep) 85%, transparent)`,
              border: "1px solid var(--theme-border)",
              color: "var(--theme-text-primary)",
              fontFamily: "var(--theme-font-body)",
            }}
          />

          {/* Theme picker */}
          <div className="text-[0.5rem] uppercase tracking-[0.18em] text-[var(--theme-text-muted)] mt-1 mb-0.5"
            style={{ fontFamily: "var(--theme-font-display)" }}>
            Realm Theme
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {(["grimoire", "scroll", "neon"] as const).map((t) => {
              const labels = { grimoire: "💀 Grimoire", scroll: "📜 Scroll", neon: "🔮 Arcane" };
              const active = lobbyTheme === t;
              return (
                <button
                  key={t}
                  onClick={() => setLobbyTheme(t)}
                  className="rounded-md py-1.5 px-1 text-[10px] font-semibold border transition-all"
                  style={{
                    fontFamily: "var(--theme-font-display)",
                    background: active ? `color-mix(in srgb, var(--theme-accent-dim) 20%, transparent)` : `color-mix(in srgb, var(--theme-bg-deep) 80%, transparent)`,
                    borderColor: active ? "var(--theme-accent)" : "var(--theme-border)",
                    color: active ? "var(--theme-text-primary)" : "var(--theme-text-muted)",
                    boxShadow: active ? "0 0 8px var(--theme-accent-glow)" : "none",
                  }}
                >
                  {labels[t]}
                </button>
              );
            })}
          </div>

          {/* Map upload */}
          <label
            className="flex items-center gap-2 cursor-pointer rounded-md px-3 py-2 text-[0.65rem] transition-colors mt-1"
            style={{
              background: `color-mix(in srgb, var(--theme-accent-dim) 6%, transparent)`,
              border: `1px dashed color-mix(in srgb, var(--theme-border-accent) 50%, transparent)`,
              color: "var(--theme-text-secondary)",
              fontFamily: "var(--theme-font-display)",
            }}
          >
            <span>🗺️</span>
            <span>{mapFile ? mapFile.name : "Upload battle map (optional)"}</span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => setMapFile(e.target.files?.[0] ?? null)}
            />
          </label>

          <button
            onClick={createSession}
            disabled={loading}
            className="w-full py-2.5 rounded-lg text-sm font-bold tracking-wider uppercase transition-all active:scale-[0.98] disabled:opacity-50 mt-1"
            style={{
              background: `linear-gradient(135deg, var(--theme-accent-dim), var(--theme-accent))`,
              color: lobbyTheme === "scroll" ? "#0a0600" : "var(--theme-text-primary)",
              fontFamily: "var(--theme-font-display)",
              boxShadow: "0 0 16px var(--theme-accent-glow), 0 2px 8px rgba(0,0,0,0.4)",
              border: "1px solid color-mix(in srgb, var(--theme-border-accent) 50%, transparent)",
            }}
          >
            {loading ? "Forging…" : "Forge the Hall"}
          </button>
        </div>

        {/* Divider */}
        <div className="h-px" style={{ background: `linear-gradient(90deg, transparent, var(--theme-accent-dim) 30%, var(--theme-accent) 50%, var(--theme-accent-dim) 70%, transparent)`, opacity: 0.3 }} />

        {/* Join section */}
        <div className="flex flex-col gap-2">
          <div className="text-[0.55rem] uppercase tracking-[0.2em] text-[var(--theme-text-secondary)]"
            style={{ fontFamily: "var(--theme-font-display)" }}>
            Join Session
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && joinSession()}
              placeholder="A3F2B9"
              className="flex-1 px-3 py-2 rounded-md text-sm font-mono tracking-widest uppercase text-center transition-all placeholder:opacity-30 focus:outline-none"
              style={{
                background: `color-mix(in srgb, var(--theme-bg-deep) 85%, transparent)`,
                border: "1px solid var(--theme-border)",
                color: "var(--theme-text-primary)",
              }}
            />
            <button
              onClick={joinSession}
              disabled={loading}
              className="px-4 py-2 rounded-lg text-sm font-bold tracking-wider uppercase transition-all active:scale-[0.98] disabled:opacity-50"
              style={{
                background: `color-mix(in srgb, var(--theme-bg-deep) 80%, transparent)`,
                border: "1px solid var(--theme-border-accent)",
                color: "var(--theme-text-secondary)",
                fontFamily: "var(--theme-font-display)",
              }}
            >
              Enter
            </button>
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-400 text-center">{error}</p>
        )}
      </div>
    </main>
  );
}
