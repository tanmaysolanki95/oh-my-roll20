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
  useAuth(); // ensures anonymous auth is set up and userId is populated

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

    // Guarantee auth is ready before inserting — handles the race where
    // useAuth()'s signInAnonymously() hasn't resolved yet.
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
    <main className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-indigo-950/40 text-white flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-5">
        {/* Logo */}
        <div className="text-center space-y-2">
          <div className="flex justify-center drop-shadow-lg">
            <Logo size={80} />
          </div>
          <h1 className="text-4xl font-black tracking-tight text-indigo-400">
            oh-my-roll20
          </h1>
          <p className="text-gray-500 text-sm">A VTT for friends, by friends</p>
        </div>

        {/* Identity */}
        <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-4 space-y-3 border border-white/10 shadow-xl">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider border-l-2 border-indigo-500 pl-2">
            Your Identity
          </div>
          <input
            type="text"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            placeholder="Your name"
            className="w-full bg-gray-800 text-white px-3 py-2 rounded-lg border border-gray-700 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 text-sm transition-all"
          />
          <div className="flex gap-2 flex-wrap">
            {PLAYER_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColorPick(c)}
                style={{ background: c }}
                className={`w-7 h-7 rounded-full transition-transform ${colorPick === c ? "scale-125 ring-2 ring-white" : "hover:scale-110"}`}
              />
            ))}
          </div>
        </div>

        {/* Create session */}
        <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-4 space-y-3 border border-white/10 shadow-xl">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider border-l-2 border-indigo-500 pl-2">
            New Session
          </div>
          <input
            type="text"
            value={sessionName}
            onChange={(e) => setSessionName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createSession()}
            placeholder="Campaign name..."
            className="w-full bg-gray-800 text-white px-3 py-2 rounded-lg border border-gray-700 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 text-sm transition-all"
          />
          <button
            onClick={createSession}
            disabled={loading}
            className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] hover:scale-[1.02] disabled:opacity-50 text-white font-bold rounded-lg transition-all"
          >
            Create & Host
          </button>
        </div>

        {/* Join session */}
        <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-4 space-y-3 border border-white/10 shadow-xl">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider border-l-2 border-indigo-500 pl-2">
            Join Session
          </div>
          <input
            type="text"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && joinSession()}
            placeholder="6-letter code (e.g. A3F2B9)"
            className="w-full bg-gray-800 text-white px-3 py-2 rounded-lg border border-gray-700 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 text-sm font-mono transition-all"
          />
          <button
            onClick={joinSession}
            disabled={loading}
            className="w-full py-2 bg-gray-700 hover:bg-gray-600 active:scale-[0.98] hover:scale-[1.02] disabled:opacity-50 text-white font-bold rounded-lg transition-all"
          >
            Join
          </button>
        </div>

        {error && (
          <p className="text-sm text-red-400 text-center">{error}</p>
        )}
      </div>
    </main>
  );
}
