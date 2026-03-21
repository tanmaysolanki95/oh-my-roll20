"use client";

import { useEffect, useRef, useState } from "react";
import { useSessionStore } from "@/store/session";
import { parseDiceExpression } from "@/lib/dice";
import type { DiceRoll } from "@/types";

export default function DiceToast() {
  const diceLog = useSessionStore((s) => s.diceLog);
  const [visible, setVisible] = useState(false);
  const [roll, setRoll] = useState<DiceRoll | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const latestId = diceLog[0]?.id;

  useEffect(() => {
    const latest = diceLog[0];
    if (!latest) return;

    // Only show for recent rolls (within 10 seconds) — suppresses DB-loaded history on initial join
    const age = Date.now() - new Date(latest.created_at).getTime();
    if (age > 10_000) return;

    setRoll(latest);
    setVisible(true);

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setVisible(false), 4000);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestId]);

  // Detect nat max / nat 1 — only for single-die rolls with no modifier
  const parsed = roll ? parseDiceExpression(roll.expression) : null;
  const isSimple = parsed !== null && parsed.count === 1 && parsed.modifier === 0;
  const isNatMax = isSimple && roll !== null && roll.result === parsed!.sides;
  const isNatMin = isSimple && roll !== null && roll.result === 1 && !isNatMax;

  if (!roll) return null;

  return (
    <div
      className={`fixed top-4 right-4 z-50 w-[280px] transition-all duration-300 ${
        visible ? "translate-x-0 opacity-100" : "translate-x-full opacity-0"
      }`}
    >
      <div className="bg-gray-900/85 backdrop-blur-sm rounded-2xl border border-gray-700/60 px-4 py-3 shadow-xl">
        {/* Top row: player + expression */}
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-gray-400 font-medium truncate">{roll.player_name}</span>
          <span className="text-xs text-gray-500 font-mono ml-2 shrink-0">{roll.expression}</span>
        </div>

        {/* Result */}
        <div
          className={`text-2xl font-black tabular-nums leading-none ${isNatMin ? "text-red-400" : "text-white"}`}
          style={isNatMax ? { textShadow: "0 0 16px rgba(167,139,250,0.8)" } : undefined}
        >
          {roll.result}
        </div>

        {/* Nat label */}
        {isNatMax && (
          <div className="text-[10px] font-bold text-violet-400 tracking-widest uppercase mt-0.5">
            Natural {parsed!.sides} ✨
          </div>
        )}
        {isNatMin && (
          <div className="text-[10px] font-bold text-red-500 tracking-widest uppercase mt-0.5">
            Natural 1 💀
          </div>
        )}

        {/* Breakdown */}
        <div className="text-xs text-gray-600 font-mono mt-1">{roll.breakdown}</div>
      </div>
    </div>
  );
}
