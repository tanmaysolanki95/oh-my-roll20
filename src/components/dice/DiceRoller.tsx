"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { parseDiceExpression, rollDice, formatExpression, QUICK_DICE } from "@/lib/dice";
import { useSessionStore } from "@/store/session";

interface DiceRollerProps {
  sessionId: string;
  onCollapse?: () => void;
  broadcastDiceRoll: (roll_id: string, player_name: string, expression: string, result: number, breakdown: string, created_at: string) => void;
}

function relativeTime(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return "now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  return `${Math.floor(diff / 3600)}h`;
}

export default function DiceRoller({ sessionId, onCollapse, broadcastDiceRoll }: DiceRollerProps) {
  const supabase = createClient();
  const { diceLog, playerName, addDiceRoll } = useSessionStore();
  const [expr, setExpr] = useState("1d20");
  const [error, setError] = useState("");
  const [lastResult, setLastResult] = useState<{
    expression: string;
    result: number;
    breakdown: string;
    sides: number;
    count: number;
  } | null>(null);

  const roll = async (expression: string) => {
    const parsed = parseDiceExpression(expression);
    if (!parsed) {
      setError(`Can't parse "${expression}". Try: 2d6+3`);
      return;
    }
    setError("");

    const { result, breakdown } = rollDice(parsed);
    const formattedExpr = formatExpression(parsed);

    setLastResult({ expression: formattedExpr, result, breakdown, sides: parsed.sides, count: parsed.count });

    const rollEntry = {
      id: crypto.randomUUID(),
      session_id: sessionId,
      player_name: playerName || "Adventurer",
      expression: formattedExpr,
      result,
      breakdown,
      created_at: new Date().toISOString(),
    };

    addDiceRoll(rollEntry);

    broadcastDiceRoll(
      rollEntry.id,
      rollEntry.player_name,
      rollEntry.expression,
      rollEntry.result,
      rollEntry.breakdown,
      rollEntry.created_at,
    );

    await supabase.from("dice_rolls").insert({
      id: rollEntry.id,
      session_id: rollEntry.session_id,
      player_name: rollEntry.player_name,
      expression: rollEntry.expression,
      result: rollEntry.result,
      breakdown: rollEntry.breakdown,
    });
  };

  const isNatMax = lastResult !== null && lastResult.count === 1 && lastResult.result === lastResult.sides;
  const isNatMin = lastResult !== null && lastResult.count === 1 && lastResult.result === 1;

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-base">🎲</span>
          <span
            className="text-xs font-semibold uppercase tracking-wider"
            style={{ color: "var(--theme-text-secondary)", fontFamily: "var(--theme-font-display)" }}
          >
            Dice
          </span>
        </div>
        {onCollapse && (
          <button
            onClick={onCollapse}
            className="text-xs px-1 transition-colors"
            style={{ color: "var(--theme-text-muted)" }}
            title="Collapse dice roller"
          >
            ▲
          </button>
        )}
      </div>

      {/* Quick roll buttons */}
      <div className="grid grid-cols-7 gap-1">
        {QUICK_DICE.map((sides) => (
          <button
            key={sides}
            onClick={() => roll(`1d${sides}`)}
            className="py-1.5 text-[10px] font-bold rounded transition-all"
            style={
              sides === 20
                ? {
                    background: "var(--theme-accent)",
                    color: "var(--theme-text-primary)",
                    boxShadow: "0 0 8px var(--theme-accent-glow)",
                    border: "1px solid var(--theme-border-accent)",
                  }
                : {
                    background: "var(--theme-bg-panel)",
                    color: "var(--theme-text-primary)",
                    border: "1px solid var(--theme-border)",
                  }
            }
          >
            d{sides === 100 ? "%" : sides}
          </button>
        ))}
      </div>

      {/* Custom expression input */}
      <div className="flex gap-2">
        <input
          type="text"
          value={expr}
          onChange={(e) => setExpr(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && roll(expr)}
          placeholder="e.g. 3d20+10"
          className="flex-1 text-sm px-3 py-1.5 rounded-lg focus:outline-none font-mono"
          style={{
            background: "var(--theme-bg-panel)",
            color: "var(--theme-text-primary)",
            border: "1px solid var(--theme-border)",
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = "var(--theme-border-accent)")}
          onBlur={(e) => (e.currentTarget.style.borderColor = "var(--theme-border)")}
        />
        <button
          onClick={() => roll(expr)}
          className="px-3 py-1.5 text-sm font-bold rounded-lg transition-colors"
          style={{
            background: "linear-gradient(135deg, var(--theme-accent-dim), var(--theme-accent))",
            color: "var(--theme-text-primary)",
            boxShadow: "0 0 10px var(--theme-accent-glow)",
          }}
          title="Roll dice — result is shared with all players in the session"
        >
          Roll
        </button>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {/* Last result callout */}
      {lastResult && (
        <div
          className="rounded-xl px-3 py-3 text-center"
          style={{
            border: "1px solid var(--theme-border-accent)",
            background: "var(--theme-bg-deep)",
            boxShadow: "0 0 24px var(--theme-accent-glow)",
          }}
        >
          <div
            className="text-5xl font-black leading-none tabular-nums"
            style={{
              color: "var(--theme-text-primary)",
              textShadow: isNatMax ? "0 0 20px var(--theme-accent-glow)" : undefined,
            }}
          >
            {lastResult.result}
          </div>
          {isNatMax && (
            <div className="text-[10px] font-bold text-yellow-300 tracking-widest uppercase mt-1">
              Natural {lastResult.sides} ✨
            </div>
          )}
          {isNatMin && !isNatMax && (
            <div className="text-[10px] font-bold text-red-400 tracking-widest uppercase mt-1">
              Natural 1 💀
            </div>
          )}
          <div className="text-xs mt-1 font-mono" style={{ color: "var(--theme-text-secondary)" }}>
            {lastResult.breakdown}
          </div>
          <div className="text-xs font-mono" style={{ color: "var(--theme-text-muted)" }}>
            {lastResult.expression}
          </div>
        </div>
      )}

      {/* Roll log */}
      <div
        className="flex-1 overflow-y-auto min-h-0 space-y-0 divide-y"
        style={{ borderColor: "var(--theme-border)" }}
      >
        {diceLog.map((r) => (
          <div
            key={r.id}
            className="flex items-center gap-2 text-xs py-1.5 px-0.5"
            style={{ borderColor: "var(--theme-border)" }}
          >
            <span
              className="min-w-[22px] text-right font-bold tabular-nums shrink-0"
              style={{ color: "var(--theme-accent)" }}
            >
              {r.result}
            </span>
            <span className="flex-1 truncate" style={{ color: "var(--theme-text-secondary)" }}>
              <span className="font-medium" style={{ color: "var(--theme-text-primary)" }}>
                {r.player_name}
              </span>
              {" · "}
              {r.expression}
            </span>
            <span className="text-[10px] shrink-0" style={{ color: "var(--theme-text-muted)" }}>
              {relativeTime(r.created_at)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
