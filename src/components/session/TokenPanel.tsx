"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useSessionStore } from "@/store/session";
import type { Token } from "@/types";

const COLORS = [
  "#3b82f6", "#ef4444", "#22c55e", "#eab308",
  "#a855f7", "#f97316", "#06b6d4", "#ec4899",
];

import { MIN_TOKEN_SIZE, MAX_TOKEN_SIZE } from "@/lib/mapUtils";

interface TokenPanelProps {
  sessionId: string;
  isOwner: boolean;
}

export default function TokenPanel({ sessionId, isOwner }: TokenPanelProps) {
  const { tokens, session, userId, upsertToken, removeToken: removeTokenFromStore } = useSessionStore();
  const [adding, setAdding] = useState(false);
  const [pendingSize, setPendingSize] = useState<Record<string, number>>({});
  const [hpAmount, setHpAmount] = useState<Record<string, number>>({});
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
    if (atLimit) { setAddError(`Token limit reached (max ${maxTokens}).`); return; }
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
        // Stamp explicit size so changing the session default never retroactively resizes this token
        size: session?.token_size ?? 56,
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

  const updateHp = async (token: Token, delta: number) => {
    const newHp = Math.max(0, Math.min(token.max_hp, token.hp + delta));
    upsertToken({ ...token, hp: newHp });
    const supabase = createClient();
    await supabase.from("tokens").update({ hp: newHp }).eq("id", token.id);
  };

  const updateSize = async (token: Token, delta: number) => {
    const current = token.size ?? session?.token_size ?? 56;
    const newSize = Math.max(MIN_TOKEN_SIZE, Math.min(MAX_TOKEN_SIZE, current + delta));
    upsertToken({ ...token, size: newSize }); // optimistic
    const supabase = createClient();
    await supabase.from("tokens").update({ size: newSize }).eq("id", token.id);
  };

  const toggleVisible = async (token: Token) => {
    upsertToken({ ...token, visible: !token.visible });
    const supabase = createClient();
    await supabase.from("tokens").update({ visible: !token.visible }).eq("id", token.id);
  };

  const claimToken = async (id: string) => {
    const supabase = createClient();
    await supabase.from("tokens").update({ owner_id: userId }).eq("id", id);
  };

  const unclaimToken = async (id: string) => {
    const supabase = createClient();
    await supabase.from("tokens").update({ owner_id: null }).eq("id", id);
  };

  const maxTokens = session?.max_tokens_per_player ?? 1;
  const ownedCount = tokens.filter((t) => t.owner_id === userId).length;
  const atLimit = !isOwner && !!userId && ownedCount >= maxTokens;
  // Any authenticated user can add a token, unless they've hit their limit
  const canAdd = (isOwner || !!userId) && !atLimit;

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
        <div className="bg-gray-800/80 rounded-xl p-3 space-y-2 border border-gray-700/40">
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

          const isDead = token.hp === 0;
          const isHidden = isOwner && !(token.visible ?? true);

          return (
            <div
              key={token.id}
              className={`rounded-xl p-2.5 space-y-1.5 border transition-colors ${mine ? "ring-1 ring-indigo-500" : ""} ${
                isHidden
                  ? "bg-gray-900/60 border-dashed border-gray-700/60 opacity-75 hover:opacity-90"
                  : "bg-gray-800/60 hover:bg-gray-800/90 border-gray-700/40"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                  <div
                    className="w-4 h-4 rounded-full shrink-0"
                    style={{ background: token.color }}
                  />
                  <span className="text-sm font-medium text-white truncate">{token.name}</span>
                  {mine && (
                    <span className="text-xs text-indigo-400 shrink-0">you</span>
                  )}
                  {isDead && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-red-950/60 text-red-400 border border-red-800/50 shrink-0">Dead</span>
                  )}
                  {isHidden && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-amber-950/60 text-amber-400 border border-amber-800/50 shrink-0">Hidden</span>
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
                  {/* Visibility toggle — DM only */}
                  {isOwner && (
                    <button
                      onClick={() => toggleVisible(token)}
                      className={`text-xs px-1.5 py-0.5 rounded transition-colors ${
                        token.visible
                          ? "text-gray-500 hover:text-white hover:bg-gray-700"
                          : "text-yellow-400 bg-gray-700 hover:text-yellow-300"
                      }`}
                      title={token.visible ? "Hide from players" : "Show to players"}
                    >
                      {token.visible ? "Hide" : "Show"}
                    </button>
                  )}
                  {/* Delete — DM or token owner */}
                  {(isOwner || mine) && (
                    <button
                      onClick={() => removeToken(token.id)}
                      className="text-gray-600 hover:text-red-400 text-xs transition-colors"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>

              {/* HP controls */}
              {controllable ? (
                <div className="space-y-1.5 rounded-lg bg-gray-900/40 px-2 py-1.5">
                  {/* HP bar */}
                  <div>
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
                  {/* Amount input + damage/heal buttons */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => updateHp(token, -(hpAmount[token.id] ?? 1))}
                      className="px-2 h-6 bg-gray-700 hover:bg-red-900 text-white rounded text-xs font-bold transition-colors shrink-0"
                      title="Deal damage"
                    >−</button>
                    <input
                      type="number"
                      min={1}
                      value={hpAmount[token.id] ?? 1}
                      onChange={(e) => setHpAmount((prev) => ({ ...prev, [token.id]: Math.max(1, parseInt(e.target.value) || 1) }))}
                      className="w-12 bg-gray-700 text-white text-xs text-center px-1 py-0.5 rounded border border-gray-600 focus:outline-none focus:border-indigo-500 tabular-nums"
                    />
                    <button
                      onClick={() => updateHp(token, hpAmount[token.id] ?? 1)}
                      className="px-2 h-6 bg-gray-700 hover:bg-green-900 text-white rounded text-xs font-bold transition-colors shrink-0"
                      title="Heal"
                    >+</button>
                  </div>
                  {token.hp === 0 && (
                    <button
                      onClick={() => updateHp(token, token.max_hp)}
                      className="w-full py-0.5 text-xs font-semibold text-green-400 hover:text-white hover:bg-green-800 border border-green-800 hover:border-green-700 rounded transition-colors"
                    >
                      Revive
                    </button>
                  )}
                </div>
              ) : (
                <div className="rounded-lg bg-gray-900/40 px-2 py-1.5">
                  <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${hpRatio * 100}%`,
                        background: hpRatio > 0.5 ? "#22c55e" : hpRatio > 0.25 ? "#eab308" : "#ef4444",
                      }}
                    />
                  </div>
                  <div className="text-xs text-gray-500 text-center tabular-nums mt-0.5">
                    {token.hp} / {token.max_hp}
                  </div>
                </div>
              )}

              {/* Size slider — token owner or DM */}
              {controllable && (
                <div className="flex items-center gap-2 rounded-lg bg-gray-900/40 px-2 py-1.5">
                  <span className="text-xs text-gray-500 shrink-0">Size</span>
                  <input
                    type="range"
                    min={MIN_TOKEN_SIZE}
                    max={MAX_TOKEN_SIZE}
                    value={pendingSize[token.id] ?? effectiveSize}
                    onChange={(e) => setPendingSize((prev) => ({ ...prev, [token.id]: Number(e.target.value) }))}
                    onPointerUp={(e) => {
                      const val = Number((e.target as HTMLInputElement).value);
                      setPendingSize((prev) => { const next = { ...prev }; delete next[token.id]; return next; });
                      updateSize(token, val - effectiveSize);
                    }}
                    className="flex-1 h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                  />
                  <span className="text-xs text-gray-400 tabular-nums w-7 text-right shrink-0">
                    {pendingSize[token.id] ?? effectiveSize}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
