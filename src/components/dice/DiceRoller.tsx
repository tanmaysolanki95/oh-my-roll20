"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { parseDiceExpression, rollDice, formatExpression, QUICK_DICE } from "@/lib/dice";
import { useSessionStore } from "@/store/session";

interface DiceRollerProps {
  sessionId: string;
}

export default function DiceRoller({ sessionId }: DiceRollerProps) {
  const supabase = createClient();
  const { diceLog, playerName, addDiceRoll } = useSessionStore();
  const [expr, setExpr] = useState("1d20");
  const [error, setError] = useState("");
  const [lastResult, setLastResult] = useState<{
    expression: string;
    result: number;
    breakdown: string;
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

    setLastResult({ expression: formattedExpr, result, breakdown });

    // Persist to DB (triggers broadcast to others via our realtime hook)
    const roll = {
      id: crypto.randomUUID(),
      session_id: sessionId,
      player_name: playerName || "Anonymous",
      expression: formattedExpr,
      result,
      breakdown,
      created_at: new Date().toISOString(),
    };

    // Add locally immediately
    addDiceRoll(roll);

    // Persist to Supabase
    await supabase.from("dice_rolls").insert({
      session_id: roll.session_id,
      player_name: roll.player_name,
      expression: roll.expression,
      result: roll.result,
      breakdown: roll.breakdown,
    });
  };

  return (
    <div className="flex flex-col gap-3 h-full">
      <div className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Dice</div>

      {/* Quick roll buttons */}
      <div className="flex flex-wrap gap-1.5">
        {QUICK_DICE.map((sides) => (
          <button
            key={sides}
            onClick={() => roll(`1d${sides}`)}
            className="px-2.5 py-1 text-xs font-bold bg-gray-700 hover:bg-indigo-600 text-white rounded transition-colors"
          >
            d{sides}
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
          className="flex-1 bg-gray-700 text-white text-sm px-3 py-1.5 rounded border border-gray-600 focus:outline-none focus:border-indigo-500"
        />
        <button
          onClick={() => roll(expr)}
          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold rounded transition-colors"
        >
          Roll
        </button>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {/* Last result callout */}
      {lastResult && (
        <div className="bg-gray-700 rounded-lg p-3 text-center">
          <div className="text-3xl font-black text-white">{lastResult.result}</div>
          <div className="text-xs text-gray-400 mt-1">{lastResult.breakdown}</div>
          <div className="text-xs text-indigo-400 font-mono">{lastResult.expression}</div>
        </div>
      )}

      {/* Roll log */}
      <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
        {diceLog.map((r) => (
          <div key={r.id} className="flex items-center gap-2 text-xs bg-gray-800 rounded px-2 py-1.5">
            <span
              className="font-bold text-white shrink-0 w-7 text-center tabular-nums"
            >
              {r.result}
            </span>
            <span className="text-gray-400 truncate">
              <span className="text-indigo-400">{r.player_name}</span>{" "}
              rolled {r.expression}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
