"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useSessionStore } from "@/store/session";

export default function PresenceBar({ isOwner }: { isOwner: boolean }) {
  const router = useRouter();
  const { presence, session } = useSessionStore();
  const [confirming, setConfirming] = useState(false);

  const endSession = async () => {
    if (!session) return;
    const supabase = createClient();
    // Deleting the session cascades to tokens + dice_rolls
    await supabase.from("sessions").delete().eq("id", session.id);
    router.push("/");
  };

  // Copy session ID to clipboard
  const copyCode = () => {
    if (session) navigator.clipboard.writeText(session.id);
  };

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-gray-900 border-b border-gray-800">
      <span className="text-xs text-gray-500 font-medium">{session?.name ?? "Session"}</span>

      <button
        onClick={copyCode}
        className="text-xs text-gray-600 hover:text-gray-400 font-mono transition-colors truncate max-w-[160px]"
        title="Copy session code"
      >
        {session?.id.slice(0, 8)}… 📋
      </button>

      <div className="flex items-center gap-1.5 ml-auto">
        <span className="text-xs text-gray-500">{presence.length} connected</span>
        {presence.map((p) => (
          <div
            key={p.user_id}
            className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white border-2 border-gray-800"
            style={{ background: p.color }}
            title={p.player_name}
          >
            {p.player_name[0]?.toUpperCase()}
          </div>
        ))}

        {/* End session — DM only, two-step confirm */}
        {isOwner && (!confirming ? (
          <button
            onClick={() => setConfirming(true)}
            className="ml-2 text-xs px-2 py-1 text-gray-500 hover:text-red-400 transition-colors"
          >
            End Session
          </button>
        ) : (
          <div className="ml-2 flex items-center gap-1">
            <span className="text-xs text-red-400">Delete everything?</span>
            <button
              onClick={endSession}
              className="text-xs px-2 py-1 bg-red-700 hover:bg-red-600 text-white rounded transition-colors"
            >
              Yes
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
            >
              No
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
