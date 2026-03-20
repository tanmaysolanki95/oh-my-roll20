"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useSessionStore } from "@/store/session";

const COLORS = [
  "#3b82f6", "#ef4444", "#22c55e", "#eab308",
  "#a855f7", "#f97316", "#06b6d4", "#ec4899",
];

interface TokenPanelProps {
  sessionId: string;
  isOwner: boolean;
}

export default function TokenPanel({ sessionId, isOwner }: TokenPanelProps) {
  const { tokens, session, userId, upsertToken, removeToken: removeTokenFromStore } = useSessionStore();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [maxHp, setMaxHp] = useState(10);
  const [color, setColor] = useState(COLORS[0]);
  const [addError, setAddError] = useState("");

  const gridSize = session?.grid_size ?? 60;

  const canControl = (tokenOwnerId: string | null) =>
    isOwner || tokenOwnerId === userId;

  const addToken = async () => {
    if (!name.trim()) return;
    setAddError("");
    const supabase = createClient();
    // Use .select() to get the full inserted row back (with server-generated id etc.)
    const { data, error } = await supabase
      .from("tokens")
      .insert({
        session_id: sessionId,
        name: name.trim(),
        color,
        hp: maxHp,
        max_hp: maxHp,
        x: gridSize * 2,
        y: gridSize * 2,
      })
      .select()
      .single();
    if (error) { setAddError(error.message); return; }
    // Update store immediately — don't rely solely on Postgres Changes
    if (data) upsertToken(data);
    setName("");
    setMaxHp(10);
    setAdding(false);
  };

  const removeToken = async (id: string) => {
    removeTokenFromStore(id); // optimistic
    const supabase = createClient();
    await supabase.from("tokens").delete().eq("id", id);
  };

  const updateHp = async (id: string, hp: number, tokenMaxHp: number) => {
    const clamped = Math.max(0, Math.min(tokenMaxHp, hp));
    const token = tokens.find((t) => t.id === id);
    if (token) upsertToken({ ...token, hp: clamped }); // optimistic
    const supabase = createClient();
    await supabase.from("tokens").update({ hp: clamped }).eq("id", id);
  };

  const claimToken = async (id: string) => {
    const supabase = createClient();
    await supabase.from("tokens").update({ owner_id: userId }).eq("id", id);
  };

  const unclaimToken = async (id: string) => {
    const supabase = createClient();
    await supabase.from("tokens").update({ owner_id: null }).eq("id", id);
  };

  return (
    <div className="flex flex-col gap-3 h-full">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Tokens</span>
        {isOwner && (
          <button
            onClick={() => setAdding((v) => !v)}
            className="text-xs px-2 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded transition-colors"
          >
            {adding ? "Cancel" : "+ Add"}
          </button>
        )}
      </div>

      {/* Add token form — DM only */}
      {isOwner && adding && (
        <div className="bg-gray-800 rounded-lg p-3 space-y-2">
          <input
            autoFocus
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addToken()}
            placeholder="Token name"
            className="w-full bg-gray-700 text-white text-sm px-3 py-1.5 rounded border border-gray-600 focus:outline-none focus:border-indigo-500"
          />
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-400 shrink-0">Max HP</label>
            <input
              type="number"
              value={maxHp}
              onChange={(e) => setMaxHp(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-16 bg-gray-700 text-white text-sm px-2 py-1.5 rounded border border-gray-600 focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                style={{ background: c }}
                className={`w-6 h-6 rounded-full transition-transform ${color === c ? "scale-125 ring-2 ring-white" : ""}`}
              />
            ))}
          </div>
          {addError && <p className="text-xs text-red-400">{addError}</p>}
          <button
            onClick={addToken}
            className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold rounded transition-colors"
          >
            Add to Map
          </button>
        </div>
      )}

      {/* Token list */}
      <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
        {tokens.length === 0 && (
          <p className="text-xs text-gray-500 text-center mt-4">No tokens yet</p>
        )}
        {tokens.map((token) => {
          const hpRatio = Math.max(0, token.hp / token.max_hp);
          const mine = token.owner_id === userId;
          const controllable = canControl(token.owner_id);
          const unclaimed = token.owner_id === null;

          return (
            <div
              key={token.id}
              className={`bg-gray-800 rounded-lg p-2.5 space-y-1.5 ${mine ? "ring-1 ring-indigo-500" : ""}`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className="w-4 h-4 rounded-full shrink-0"
                    style={{ background: token.color }}
                  />
                  <span className="text-sm font-medium text-white truncate">{token.name}</span>
                  {mine && (
                    <span className="text-xs text-indigo-400 shrink-0">you</span>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {/* Claim / Unclaim — only for non-DM players */}
                  {!isOwner && unclaimed && (
                    <button
                      onClick={() => claimToken(token.id)}
                      className="text-xs px-1.5 py-0.5 bg-indigo-700 hover:bg-indigo-600 text-white rounded transition-colors"
                    >
                      Claim
                    </button>
                  )}
                  {mine && !isOwner && (
                    <button
                      onClick={() => unclaimToken(token.id)}
                      className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
                      title="Release token"
                    >
                      ↩
                    </button>
                  )}
                  {/* Delete — DM only */}
                  {isOwner && (
                    <button
                      onClick={() => removeToken(token.id)}
                      className="text-gray-600 hover:text-red-400 text-xs transition-colors"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>

              {/* HP controls — only if you can control this token */}
              {controllable ? (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => updateHp(token.id, token.hp - 1, token.max_hp)}
                    className="w-6 h-6 bg-gray-700 hover:bg-red-900 text-white rounded text-sm font-bold transition-colors"
                  >
                    −
                  </button>
                  <div className="flex-1">
                    <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${hpRatio * 100}%`,
                          background: hpRatio > 0.5 ? "#22c55e" : hpRatio > 0.25 ? "#eab308" : "#ef4444",
                        }}
                      />
                    </div>
                    <div className="text-xs text-gray-400 text-center tabular-nums mt-0.5">
                      {token.hp} / {token.max_hp}
                    </div>
                  </div>
                  <button
                    onClick={() => updateHp(token.id, token.hp + 1, token.max_hp)}
                    className="w-6 h-6 bg-gray-700 hover:bg-green-900 text-white rounded text-sm font-bold transition-colors"
                  >
                    +
                  </button>
                </div>
              ) : (
                /* Read-only HP bar for tokens you don't own */
                <div className="px-1">
                  <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${hpRatio * 100}%`,
                        background: hpRatio > 0.5 ? "#22c55e" : hpRatio > 0.25 ? "#eab308" : "#ef4444",
                      }}
                    />
                  </div>
                  <div className="text-xs text-gray-600 text-center tabular-nums mt-0.5">
                    {token.hp} / {token.max_hp}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
