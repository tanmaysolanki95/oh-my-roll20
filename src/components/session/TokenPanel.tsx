"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useSessionStore } from "@/store/session";
import type { Token } from "@/types";

const COLORS = [
  "#3b82f6", "#ef4444", "#22c55e", "#eab308",
  "#a855f7", "#f97316", "#06b6d4", "#ec4899",
];

import { MIN_TOKEN_SIZE, MAX_TOKEN_SIZE, DEFAULT_TOKEN_SIZE } from "@/lib/mapUtils";
import IconPicker from "@/components/session/IconPicker";

interface TokenPanelProps {
  sessionId: string;
  isOwner: boolean;
  onCollapse?: () => void;
  onTokenDragStart?: (tokenId: string) => void;
}

interface TokenGroup {
  key: string;
  label: string;
  color: string;
  isMine: boolean;
  tokens: Token[];
}

export default function TokenPanel({ sessionId, isOwner, onCollapse, onTokenDragStart }: TokenPanelProps) {
  const { tokens, session, userId, presence, upsertToken, removeToken: removeTokenFromStore } = useSessionStore();
  const [adding, setAdding] = useState(false);
  const [pendingSize, setPendingSize] = useState<Record<string, number>>({});
  const [hpAmount, setHpAmount] = useState<Record<string, number>>({});
  const [name, setName] = useState("");
  const [maxHp, setMaxHp] = useState(10);
  const [color, setColor] = useState(COLORS[0]);
  const [iconPath, setIconPath] = useState<string | null>(null);
  const [addError, setAddError] = useState("");
  const [openIconTokenId, setOpenIconTokenId] = useState<string | null>(null);
  const [startHidden, setStartHidden] = useState(false);

  const canControl = (tokenOwnerId: string | null) =>
    isOwner || tokenOwnerId === userId;


  const addToken = async () => {
    if (!name.trim()) return;
    if (atLimit) { setAddError(`Token limit reached (max ${maxTokens}).`); return; }
    setAddError("");
    const supabase = createClient();
    const { data, error } = await supabase
      .from("tokens")
      .insert({
        session_id: sessionId,
        name: name.trim(),
        color,
        hp: maxHp,
        max_hp: maxHp,
        x: 0,
        y: 0,
        placed: false,
        size: session?.token_size ?? DEFAULT_TOKEN_SIZE,
        image_url: iconPath,
        ...(isOwner ? { visible: !startHidden } : {}),
        ...(!isOwner && userId ? { owner_id: userId } : {}),
      })
      .select()
      .single();
    if (error) { setAddError(error.message); return; }
    if (data) upsertToken(data);
    setName("");
    setMaxHp(10);
    setIconPath(null);
    setAdding(false);
  };

  const removeToken = async (id: string) => {
    removeTokenFromStore(id);
    const supabase = createClient();
    await supabase.from("tokens").delete().eq("id", id);
  };

  const updateHp = async (token: Token, delta: number) => {
    const newHp = Math.max(0, Math.min(token.max_hp, token.hp + delta));
    upsertToken({ ...token, hp: newHp });
    const supabase = createClient();
    await supabase.from("tokens").update({ hp: newHp }).eq("id", token.id);
  };

  const toggleVisible = async (token: Token) => {
    upsertToken({ ...token, visible: !token.visible });
    const supabase = createClient();
    await supabase.from("tokens").update({ visible: !token.visible }).eq("id", token.id);
  };

  const updateIcon = async (token: Token, path: string | null) => {
    upsertToken({ ...token, image_url: path });
    const supabase = createClient();
    await supabase.from("tokens").update({ image_url: path }).eq("id", token.id);
    setOpenIconTokenId(null);
  };

  const toggleSizeLock = async (token: Token) => {
    const locked = !token.size_locked;
    upsertToken({ ...token, size_locked: locked });
    const supabase = createClient();
    await supabase.from("tokens").update({ size_locked: locked }).eq("id", token.id);
  };

  const maxTokens = session?.max_tokens_per_player ?? 1;
  const ownedCount = tokens.filter((t) => t.owner_id === userId).length;
  const atLimit = !isOwner && !!userId && ownedCount >= maxTokens;
  const canAdd = (isOwner || !!userId) && !atLimit;

  // ── Token grouping ─────────────────────────────────────────────────────────
  // DM's tokens are owner_id = null. Players' tokens are owner_id = userId.
  // Show only visible tokens to non-DM.
  const visibleTokens = isOwner ? tokens : tokens.filter(t => t.visible ?? true);

  // My key: DM's "own" group is owner_id=null; player's is their userId
  const myKey = isOwner ? "__dm__" : (userId ?? "__me__");

  const getGroupKey = (t: Token) => t.owner_id ?? "__dm__";

  // Build ordered group map: my group first, then others in first-seen order
  const groupOrder: string[] = [];
  const groupTokens = new Map<string, Token[]>();
  // Ensure my group comes first even if empty (so header still shows when I have tokens later)
  for (const token of visibleTokens) {
    const key = getGroupKey(token);
    if (!groupTokens.has(key)) {
      groupTokens.set(key, []);
      if (key !== myKey) groupOrder.push(key); // my key added separately at start
    }
    groupTokens.get(key)!.push(token);
  }
  const myTokens = groupTokens.get(myKey) ?? [];
  const sortedKeys = [...(myTokens.length > 0 ? [myKey] : []), ...groupOrder];

  const buildGroups = (): TokenGroup[] => {
    return sortedKeys.map(key => {
      const isMine = key === myKey;
      let label: string;
      let color: string;
      if (key === "__dm__") {
        label = isOwner ? "My Tokens" : "DM";
        color = "#6366f1";
      } else {
        const player = presence.find(p => p.user_id === key);
        label = isMine ? "My Tokens" : (player?.player_name ?? "Player");
        color = player?.color ?? "#6b7280";
      }
      return { key, label, color, isMine, tokens: groupTokens.get(key) ?? [] };
    });
  };

  const groups = buildGroups();
  const showGroupHeaders = groups.length > 1 || (groups.length === 1 && !groups[0].isMine);

  return (
    <div className="flex flex-col gap-3 h-full">
      <div className="flex items-center justify-between">
        <span
          className="text-sm font-semibold uppercase tracking-wider"
          style={{ color: "var(--theme-text-primary)", fontFamily: "var(--theme-font-display)" }}
        >
          Tokens
        </span>
        <div className="flex items-center gap-1">
          {canAdd && (
            <button
              onClick={() => setAdding((v) => !v)}
              className="text-xs px-2 py-1 rounded transition-colors"
              style={{ background: "var(--theme-accent)", color: "var(--theme-text-primary)" }}
              title={adding ? "Cancel adding token" : "Add a new character token to the map"}
            >
              {adding ? "Cancel" : "+ Add"}
            </button>
          )}
          {onCollapse && (
            <button
              onClick={onCollapse}
              className="text-xs px-1 transition-colors"
              style={{ color: "var(--theme-text-muted)" }}
              title="Collapse token panel"
            >
              ▲
            </button>
          )}
        </div>
      </div>

      {/* Add token form */}
      {canAdd && adding && (
        <div
          className="rounded-xl p-3 space-y-2 border"
          style={{ background: "var(--theme-bg-panel)", borderColor: "var(--theme-border)" }}
        >
          <input
            autoFocus
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addToken()}
            placeholder="Token name"
            className="w-full text-sm px-3 py-1.5 rounded border focus:outline-none"
            style={{
              background: "var(--theme-bg-deep)",
              color: "var(--theme-text-primary)",
              borderColor: "var(--theme-border)",
            }}
          />
          <div className="flex items-center gap-2">
            <label
              className="text-xs shrink-0"
              style={{ color: "var(--theme-text-secondary)" }}
            >
              Max HP
            </label>
            <input
              type="number"
              value={maxHp}
              onChange={(e) => setMaxHp(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-16 text-sm px-2 py-1.5 rounded border focus:outline-none"
              style={{
                background: "var(--theme-bg-deep)",
                color: "var(--theme-text-primary)",
                borderColor: "var(--theme-border)",
              }}
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
          {isOwner && (
            <button
              type="button"
              onClick={() => setStartHidden(v => !v)}
              className="flex items-center gap-1.5 self-start px-2 py-0.5 rounded text-xs font-medium border transition-colors"
              style={
                startHidden
                  ? { background: "rgba(120,53,15,0.6)", borderColor: "rgba(146,64,14,0.5)", color: "#fbbf24" }
                  : { background: "transparent", borderColor: "var(--theme-border)", color: "var(--theme-text-muted)" }
              }
            >
              🙈 Hide Token
            </button>
          )}
          <IconPicker value={iconPath} onChange={setIconPath} />
          {addError && <p className="text-xs text-red-400">{addError}</p>}
          <button
            onClick={addToken}
            className="w-full py-1.5 text-sm font-bold rounded transition-colors"
            style={{ background: "var(--theme-accent)", color: "var(--theme-text-primary)" }}
          >
            Create Token
          </button>
        </div>
      )}

      {/* Token list */}
      <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
        {visibleTokens.length === 0 && (
          <p className="text-xs text-center mt-4" style={{ color: "var(--theme-text-muted)" }}>No tokens yet</p>
        )}

        {groups.map((group) => (
          <div key={group.key}>
            {/* Group header */}
            {showGroupHeaders && (
              <div className="flex items-center gap-2 pt-1 pb-0.5">
                <div className="w-2 h-2 rounded-full shrink-0" style={{ background: group.color }} />
                <span
                  className="text-[10px] uppercase tracking-widest font-semibold"
                  style={{ color: "var(--theme-text-muted)", fontFamily: "var(--theme-font-display)" }}
                >
                  {group.label}
                </span>
                <div className="flex-1 h-px" style={{ background: "var(--theme-border)", opacity: 0.5 }} />
              </div>
            )}

            <div className="space-y-2">
              {group.tokens.map((token) => {
                // Unplaced token — drag handle row
                if (!token.placed) {
                  const canDrag = canControl(token.owner_id);
                  return (
                    <div
                      key={token.id}
                      className="rounded-xl p-2.5 border"
                      style={{
                        background: "var(--theme-bg-surface)",
                        borderColor: "var(--theme-border)",
                        borderStyle: "dashed",
                        opacity: 0.85,
                      }}
                    >
                      <div className="flex items-center gap-2">
                        {/* Drag handle */}
                        <span
                          className="text-lg select-none shrink-0"
                          style={{
                            color: canDrag ? "var(--theme-text-secondary)" : "var(--theme-text-muted)",
                            cursor: canDrag ? "grab" : "default",
                          }}
                          onPointerDown={(e) => {
                            if (!canDrag || !onTokenDragStart) return;
                            e.preventDefault();
                            onTokenDragStart(token.id);
                          }}
                          title={canDrag ? "Drag onto the map to place" : undefined}
                        >
                          ⠿
                        </span>
                        {/* Color dot */}
                        <div className="w-3 h-3 rounded-full shrink-0" style={{ background: token.color }} />
                        {/* Name */}
                        <span className="text-sm font-medium truncate flex-1" style={{ color: "var(--theme-text-primary)" }}>
                          {token.name}
                        </span>
                        {/* Hint */}
                        <span className="text-[10px] shrink-0" style={{ color: "var(--theme-text-muted)" }}>
                          drag to map
                        </span>
                        {/* Delete */}
                        {(isOwner || canControl(token.owner_id)) && (
                          <button
                            onClick={() => removeToken(token.id)}
                            className="text-xs transition-colors hover:text-red-400 shrink-0"
                            style={{ color: "var(--theme-text-muted)" }}
                            title="Remove token"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>
                  );
                }

                const hpRatio = token.max_hp > 0 ? token.hp / token.max_hp : 0;
                const mine = token.owner_id === userId || (isOwner && token.owner_id === null);
                const controllable = canControl(token.owner_id);
                const effectiveSize = token.size ?? session?.token_size ?? DEFAULT_TOKEN_SIZE;
                const isDead = token.hp === 0;
                const isHidden = isOwner && !(token.visible ?? true);

                const PREVIEW_MIN = 20;
                const PREVIEW_MAX = 48;
                const liveSize = pendingSize[token.id] ?? token.size ?? session?.token_size ?? DEFAULT_TOKEN_SIZE;
                const previewSize = Math.round(
                  PREVIEW_MIN +
                  ((liveSize - MIN_TOKEN_SIZE) / (MAX_TOKEN_SIZE - MIN_TOKEN_SIZE)) *
                  (PREVIEW_MAX - PREVIEW_MIN)
                );

                return (
                  <div
                    key={token.id}
                    className={`rounded-xl p-2.5 space-y-1.5 border transition-colors ${isHidden ? "opacity-75 hover:opacity-90" : ""}`}
                    style={{
                      background: isHidden ? "var(--theme-bg-surface)" : "var(--theme-bg-panel)",
                      borderColor: "var(--theme-border)",
                      borderStyle: isHidden ? "dashed" : "solid",
                      ...(mine ? { outline: "1px solid var(--theme-accent)" } : {}),
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0 flex-wrap">
                        {/* Icon swatch */}
                        <button
                          type="button"
                          onClick={() => controllable && setOpenIconTokenId(openIconTokenId === token.id ? null : token.id)}
                          className="rounded-full shrink-0 overflow-hidden border-2 transition-all"
                          style={{
                            width: previewSize,
                            height: previewSize,
                            borderColor: token.color,
                            background: token.color,
                            cursor: controllable ? "pointer" : "default",
                          }}
                          title={controllable ? "Change icon" : undefined}
                        >
                          {token.image_url && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={token.image_url} alt="" className="w-full h-full object-cover" />
                          )}
                        </button>
                        <span
                          className="text-sm font-medium truncate"
                          style={{ color: "var(--theme-text-primary)" }}
                        >
                          {token.name}
                        </span>
                        {mine && (
                          <span className="text-xs shrink-0" style={{ color: "var(--theme-accent)" }}>you</span>
                        )}
                        {isDead && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-red-950/60 text-red-400 border border-red-800/50 shrink-0">Dead</span>
                        )}
                        {isHidden && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-amber-950/60 text-amber-400 border border-amber-800/50 shrink-0">Hidden</span>
                        )}
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {isOwner && (
                          <button
                            onClick={() => toggleVisible(token)}
                            className={`text-xs px-1.5 py-0.5 rounded transition-colors ${
                              token.visible
                                ? "hover:bg-[var(--theme-bg-panel)]"
                                : "text-yellow-400 hover:text-yellow-300"
                            }`}
                            style={token.visible ? { color: "var(--theme-text-muted)" } : { background: "var(--theme-bg-panel)" }}
                            title={token.visible ? "Hide token from players" : "Show token to players"}
                          >
                            {token.visible ? "Hide" : "Show"}
                          </button>
                        )}
                        {(isOwner || mine) && (
                          <button
                            onClick={() => removeToken(token.id)}
                            className="text-xs transition-colors hover:text-red-400"
                            style={{ color: "var(--theme-text-muted)" }}
                            title="Remove token from the map"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Inline icon picker */}
                    {controllable && openIconTokenId === token.id && (
                      <IconPicker
                        value={token.image_url}
                        onChange={(path) => updateIcon(token, path)}
                      />
                    )}

                    {/* HP controls */}
                    {controllable ? (
                      <div
                        className="rounded-lg px-2 py-1.5 space-y-1.5"
                        style={{ background: "var(--theme-bg-deep)" }}
                      >
                        {/* HP block */}
                        <div>
                          <div className="flex justify-between items-baseline mb-1">
                            <span className="text-[0.48rem] uppercase tracking-[0.18em]"
                              style={{ color: "var(--theme-text-muted)", fontFamily: "var(--theme-font-display)" }}>
                              Hit Points
                            </span>
                            <span className="text-[0.58rem] font-semibold"
                              style={{ color: hpRatio <= 0.25 ? "#f87171" : "var(--theme-text-primary)", fontFamily: "var(--theme-font-body)" }}>
                              {token.hp} / {token.max_hp}
                            </span>
                          </div>
                          {/* Thicker HP bar */}
                          <div className="h-[5px] rounded-full overflow-hidden mb-1.5"
                            style={{ background: "var(--theme-border)" }}>
                            <div className="h-full rounded-full transition-all"
                              style={{ width: `${hpRatio * 100}%`, background: hpRatio > 0.5 ? "#22c55e" : hpRatio > 0.25 ? "#eab308" : "#ef4444" }} />
                          </div>
                          {/* Adjust slider with label */}
                          <div className="flex items-center gap-1.5">
                            <span className="text-[0.46rem] uppercase tracking-[0.1em] whitespace-nowrap"
                              style={{ color: "var(--theme-text-muted)", fontFamily: "var(--theme-font-display)" }}>
                              Adjust
                            </span>
                            <input type="range" min={0} max={token.max_hp} value={token.hp}
                              className="flex-1 h-[3px] rounded-full cursor-pointer"
                              style={{ accentColor: "var(--theme-accent)" }}
                              onChange={() => {}}
                              onPointerUp={async (e) => {
                                const newHp = Number((e.target as HTMLInputElement).value);
                                upsertToken({ ...token, hp: newHp });
                                await createClient().from("tokens").update({ hp: newHp }).eq("id", token.id);
                              }}
                            />
                          </div>
                        </div>
                        {/* Section divider */}
                        <div className="h-px" style={{ background: "var(--theme-border)", opacity: 0.5 }} />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-red-500 shrink-0">1</span>
                            <input
                              type="range"
                              min={1}
                              max={token.max_hp}
                              value={hpAmount[token.id] ?? 1}
                              onChange={(e) => setHpAmount((prev) => ({ ...prev, [token.id]: Number(e.target.value) }))}
                              onClick={(e) => e.stopPropagation()}
                              className="flex-1 h-1.5 cursor-pointer"
                              style={{ accentColor: "var(--theme-accent)" }}
                            />
                            <span className="text-[10px] shrink-0" style={{ color: "var(--theme-text-muted)" }}>{token.max_hp}</span>
                          </div>
                          <div className="text-center text-xs font-semibold mt-0.5 tabular-nums" style={{ color: "var(--theme-accent)" }}>
                            {hpAmount[token.id] ?? 1} hp
                          </div>
                        </div>
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => updateHp(token, -(hpAmount[token.id] ?? 1))}
                            className="flex-1 py-1 bg-red-950 hover:bg-red-900 text-red-200 rounded text-xs font-bold transition-colors"
                          >
                            DAMAGE −{hpAmount[token.id] ?? 1}
                          </button>
                          <button
                            onClick={() => updateHp(token, hpAmount[token.id] ?? 1)}
                            className="flex-1 py-1 bg-green-950 hover:bg-green-900 text-green-200 rounded text-xs font-bold transition-colors"
                          >
                            HEAL +{hpAmount[token.id] ?? 1}
                          </button>
                        </div>
                        {token.hp === 0 && (
                          <button
                            onClick={() => updateHp(token, token.max_hp)}
                            className="w-full py-0.5 text-xs font-semibold text-green-400 hover:text-[var(--theme-text-primary)] hover:bg-green-800 border border-green-800 hover:border-green-700 rounded transition-colors"
                          >
                            Revive
                          </button>
                        )}
                      </div>
                    ) : (
                      <div
                        className="rounded-lg px-2 py-1.5"
                        style={{ background: "var(--theme-bg-deep)" }}
                      >
                        <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--theme-border)" }}>
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${hpRatio * 100}%`,
                              background: hpRatio > 0.5 ? "#22c55e" : hpRatio > 0.25 ? "#eab308" : "#ef4444",
                            }}
                          />
                        </div>
                        <div className="text-xs text-center tabular-nums mt-0.5" style={{ color: "var(--theme-text-muted)" }}>
                          {token.hp} / {token.max_hp}
                        </div>
                      </div>
                    )}

                    {/* Size slider — token owner or DM */}
                    {controllable && (
                      <div
                        className="flex items-center gap-2 rounded-lg px-2 py-1.5"
                        style={{ background: token.size_locked ? "var(--theme-bg-surface)" : "var(--theme-bg-deep)" }}
                      >
                        <span
                          className="text-xs shrink-0"
                          style={{ color: token.size_locked ? "var(--theme-text-muted)" : "var(--theme-text-secondary)" }}
                        >
                          Size
                        </span>
                        <input
                          type="range"
                          min={MIN_TOKEN_SIZE}
                          max={MAX_TOKEN_SIZE}
                          disabled={token.size_locked}
                          value={pendingSize[token.id] ?? effectiveSize}
                          onChange={(e) => {
                            if (token.size_locked) return;
                            const val = Number(e.target.value);
                            setPendingSize((prev) => ({ ...prev, [token.id]: val }));
                            upsertToken({ ...token, size: val });
                          }}
                          onPointerUp={async (e) => {
                            if (token.size_locked) return;
                            const val = Number((e.target as HTMLInputElement).value);
                            setPendingSize((prev) => { const next = { ...prev }; delete next[token.id]; return next; });
                            upsertToken({ ...token, size: val });
                            const supabase = createClient();
                            await supabase.from("tokens").update({ size: val }).eq("id", token.id);
                          }}
                          className={`flex-1 h-1.5 rounded-lg appearance-none ${token.size_locked ? "opacity-30 cursor-not-allowed" : "cursor-pointer"}`}
                          style={{ accentColor: "var(--theme-accent)" }}
                        />
                        <span
                          className="text-xs tabular-nums w-7 text-right shrink-0"
                          style={{ color: token.size_locked ? "var(--theme-text-muted)" : "var(--theme-text-secondary)" }}
                        >
                          {pendingSize[token.id] ?? effectiveSize}
                        </span>
                        {/* Lock toggle — DM only */}
                        {isOwner && (
                          <button
                            onClick={() => toggleSizeLock(token)}
                            className={`text-sm transition-colors shrink-0 ${token.size_locked ? "text-amber-400 hover:text-amber-300" : "hover:text-amber-400"}`}
                            style={token.size_locked ? {} : { color: "var(--theme-text-muted)" }}
                            title={token.size_locked ? "Unlock size" : "Lock size"}
                          >
                            {token.size_locked ? "🔒" : "🔓"}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
