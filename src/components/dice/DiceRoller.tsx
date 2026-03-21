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
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Dice</span>
        </div>
        {onCollapse && (
          <button
            onClick={onCollapse}
            className="text-gray-600 hover:text-gray-300 text-xs px-1 transition-colors"
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
            className={`py-1.5 text-[10px] font-bold rounded transition-all ${
              sides === 20
                ? "bg-violet-800 hover:bg-violet-700 text-white shadow-[0_0_8px_rgba(124,58,237,0.5)]"
                : "bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700"
            }`}
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
          className="flex-1 bg-gray-800 text-white text-sm px-3 py-1.5 rounded-lg border border-gray-700 focus:outline-none focus:border-violet-500 font-mono"
        />
        <button
          onClick={() => roll(expr)}
          className="px-3 py-1.5 bg-violet-700 hover:bg-violet-600 text-white text-sm font-bold rounded-lg transition-colors shadow-[0_0_10px_rgba(124,58,237,0.4)]"
          title="Roll dice — result is shared with all players in the session"
        >
          Roll
        </button>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {/* Last result callout */}
      {lastResult && (
        <div className="rounded-xl border border-violet-900 bg-[#0d0d18] px-3 py-3 text-center shadow-[0_0_24px_rgba(124,58,237,0.2)]">
          <div
            className="text-5xl font-black text-white leading-none tabular-nums"
            style={{ textShadow: isNatMax ? "0 0 24px rgba(167,139,250,0.8)" : undefined }}
          >
            {lastResult.result}
          </div>
          {isNatMax && (
            <div className="text-[10px] font-bold text-violet-400 tracking-widest uppercase mt-1">
              Natural {lastResult.sides} ✨
            </div>
          )}
          {isNatMin && !isNatMax && (
            <div className="text-[10px] font-bold text-red-500 tracking-widest uppercase mt-1">
              Natural 1 💀
            </div>
          )}
          <div className="text-xs text-gray-500 mt-1 font-mono">{lastResult.breakdown}</div>
          <div className="text-xs text-violet-800 font-mono">{lastResult.expression}</div>
        </div>
      )}

      {/* Roll log */}
      <div className="flex-1 overflow-y-auto min-h-0 space-y-0 divide-y divide-gray-800">
        {diceLog.map((r) => (
          <div key={r.id} className="flex items-center gap-2 text-xs py-1.5 px-0.5">
            <span className="min-w-[22px] text-right font-bold tabular-nums text-violet-400 shrink-0">
              {r.result}
            </span>
            <span className="flex-1 text-gray-500 truncate">
              <span className="text-gray-200 font-medium">{r.player_name}</span>
              {" · "}
              {r.expression}
            </span>
            <span className="text-gray-700 text-[10px] shrink-0">{relativeTime(r.created_at)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
