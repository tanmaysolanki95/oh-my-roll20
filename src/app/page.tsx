"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
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

  const saveIdentity = () => {
    setPlayerName(nameInput || "Adventurer");
    setPlayerColor(colorPick);
  };

  const createSession = async () => {
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
      .insert({ name: sessionName.trim(), owner_id: uid })
      .select()
      .single();

    setLoading(false);
    if (err || !data) { setError(err?.message ?? "Failed to create session"); return; }
    router.push(`/session/${data.id}`);
  };

  const joinSession = async () => {
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
    <main className="min-h-screen bg-[#0f172a] text-white flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">

        {/* Hero */}
        <div className="text-center space-y-3">
          <div className="flex justify-center">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-700 flex items-center justify-center shadow-[0_8px_32px_rgba(99,102,241,0.45)]">
              <Logo size={48} />
            </div>
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tight text-white">oh-my-roll20</h1>
            <p className="text-slate-500 text-sm mt-1">A VTT for friends, by friends</p>
          </div>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-slate-800" />
          <span className="text-[11px] text-slate-600 uppercase tracking-widest">Who are you?</span>
          <div className="flex-1 h-px bg-slate-800" />
        </div>

        {/* Identity */}
        <div className="space-y-3">
          <input
            type="text"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            placeholder="Your name"
            className="w-full bg-slate-800 text-white px-4 py-2.5 rounded-xl border border-slate-700 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 text-sm transition-all placeholder:text-slate-500"
          />
          <div className="flex gap-2 flex-wrap px-0.5">
            {PLAYER_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColorPick(c)}
                style={{ background: c }}
                className={`w-7 h-7 rounded-full transition-all ${colorPick === c ? "scale-125 ring-2 ring-white ring-offset-2 ring-offset-[#0f172a]" : "hover:scale-110 opacity-80 hover:opacity-100"}`}
                title={c}
              />
            ))}
          </div>
        </div>

        {/* Create + Join side by side */}
        <div className="grid grid-cols-2 gap-3">

          {/* New session */}
          <div className="bg-slate-800/80 border border-slate-700/60 rounded-2xl p-4 space-y-3">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">New session</div>
            <input
              type="text"
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createSession()}
              placeholder="Campaign name"
              className="w-full bg-slate-900 text-white text-sm px-3 py-2 rounded-lg border border-slate-700 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 transition-all placeholder:text-slate-600"
            />
            <button
              onClick={createSession}
              disabled={loading}
              className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] disabled:opacity-50 text-white text-sm font-bold rounded-lg transition-all shadow-md shadow-indigo-900/40"
            >
              Create
            </button>
          </div>

          {/* Join session */}
          <div className="bg-slate-800/80 border border-slate-700/60 rounded-2xl p-4 space-y-3">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Join session</div>
            <input
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && joinSession()}
              placeholder="A3F2B9"
              className="w-full bg-slate-900 text-white text-sm px-3 py-2 rounded-lg border border-slate-700 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 font-mono tracking-widest transition-all placeholder:text-slate-600"
            />
            <button
              onClick={joinSession}
              disabled={loading}
              className="w-full py-2 bg-slate-700 hover:bg-slate-600 active:scale-[0.98] disabled:opacity-50 text-white text-sm font-bold rounded-lg transition-all"
            >
              Join
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
