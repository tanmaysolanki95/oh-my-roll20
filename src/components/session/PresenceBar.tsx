"use client";

import { useState } from "react";
import { useSessionStore } from "@/store/session";
import Logo from "@/components/ui/Logo";

interface PresenceBarProps {
  isOwner: boolean;
  onEndSession: () => void;
}

export default function PresenceBar({ isOwner, onEndSession }: PresenceBarProps) {
  const { presence, session } = useSessionStore();
  const [confirming, setConfirming] = useState(false);

  const handleConfirm = () => {
    setConfirming(false);
    onEndSession();
  };

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-gray-900/80 backdrop-blur-md border-b border-white/5">
      <Logo size={22} />
      <span className="text-gray-700 select-none">|</span>
      <span className="text-xs text-gray-400 font-medium">{session?.name ?? "Session"}</span>

      <div className="flex items-center gap-1.5 ml-auto">
        <span className="text-xs text-gray-500">{presence.length} connected</span>
        {presence.map((p) => (
          <div
            key={p.user_id}
            className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white border-2 border-gray-800 hover:ring-2 hover:ring-indigo-500/60 transition-all shadow-sm cursor-default"
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
              onClick={handleConfirm}
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
