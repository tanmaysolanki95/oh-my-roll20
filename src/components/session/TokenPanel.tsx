"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useSessionStore } from "@/store/session";
import type { Token } from "@/types";

const COLORS = [
  "#3b82f6", "#ef4444", "#22c55e", "#eab308",
  "#a855f7", "#f97316", "#06b6d4", "#ec4899",
];

const MIN_TOKEN_SIZE = 24;
const MAX_TOKEN_SIZE = 120;

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
  const mapUrl = session?.map_url ?? null;

  const canControl = (tokenOwnerId: string | null) =>
    isOwner || tokenOwnerId === userId;

  function getSpawnPosition(): Promise<{ x: number; y: number }> {
    const defaultPos = { x: gridSize * 2, y: gridSize * 2 };
    if (!mapUrl) return Promise.resolve(defaultPos);
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({
        x: Math.min(gridSize * 2, img.naturalWidth - gridSize),
        y: Math.min(gridSize * 2, img.naturalHeight - gridSize),
      });
      img.onerror = () => resolve(defaultPos);
      img.src = mapUrl;
    });
  }

  const addToken = async () => {
    if (!name.trim()) return;
    setAddError("");
    const spawn = await getSpawnPosition();
    const supabase = createClient();
    const { data, error } = await supabase
      .from("tokens")
      .insert({
        session_id: sessionId,
        name: name.trim(),
        color,
        hp: maxHp,
        max_hp: maxHp,
        x: spawn.x,
        y: spawn.y,
        // DM adds unclaimed tokens (null); players automatically own their tokens
        ...(!isOwner && userId ? { owner_id: userId } : {}),
      })
      .select()
      .single();
    if (error) { setAddError(error.message); return; }
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

  const updateSize = async (token: Token, delta: number) => {
    const current = token.size ?? session?.token_size ?? 56;
    const newSize = Math.max(MIN_TOKEN_SIZE, Math.min(MAX_TOKEN_SIZE, current + delta));
    upsertToken({ ...token, size: newSize }); // optimistic
    const supabase = createClient();
    await supabase.from("tokens").update({ size: newSize }).eq("id", token.id);
  };

  const claimToken = async (id: string) => {
    const supabase = createClient();
    await supabase.from("tokens").update({ owner_id: userId }).eq("id", id);
  };

  const unclaimToken = async (id: string) => {
    const supabase = createClient();
    await supabase.from("tokens").update({ owner_id: null }).eq("id", id);
  };

  // Any authenticated user can add a token
  const canAdd = isOwner || !!userId;

  return (
    <div className="flex flex-col gap-3 h-full">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Tokens</span>
        {canAdd && (
          <button
            onClick={() => setAdding((v) => !v)}
            className="text-xs px-2 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded transition-colors"
          >
            {adding ? "Cancel" : "+ Add"}
          </button>
        )}
      </div>

      {/* Add token form */}
      {canAdd && adding && (
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
          const effectiveSize = token.size ?? session?.token_size ?? 56;

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

              {/* Size controls — token owner or DM */}
              {controllable && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">Size</span>
                  <button
                    onClick={() => updateSize(token, -4)}
                    className="w-5 h-5 flex items-center justify-center bg-gray-700 hover:bg-gray-600 text-white rounded text-xs transition-colors"
                  >−</button>
                  <span className="text-xs text-gray-400 tabular-nums w-6 text-center">{effectiveSize}</span>
                  <button
                    onClick={() => updateSize(token, 4)}
                    className="w-5 h-5 flex items-center justify-center bg-gray-700 hover:bg-gray-600 text-white rounded text-xs transition-colors"
                  >+</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
