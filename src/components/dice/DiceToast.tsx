"use client";

import { useEffect, useRef, useState } from "react";
import { useSessionStore } from "@/store/session";
import { parseCompoundExpression } from "@/lib/dice";
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
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestId]);

  // Detect nat max / nat 1 — only for simple single-die rolls (1dX, no other terms)
  const terms = roll ? parseCompoundExpression(roll.expression) : null;
  const simpleTerm = terms?.length === 1 && terms[0].kind === "dice" && terms[0].count === 1 ? terms[0] : null;
  const isNatMax = simpleTerm !== null && roll !== null && roll.result === simpleTerm.sides;
  const isNatMin = simpleTerm !== null && roll !== null && roll.result === 1 && !isNatMax;

  if (!roll) return null;

  return (
    <div
      className={`fixed top-4 right-4 z-50 w-[280px] transition-all duration-300 ${
        visible ? "translate-x-0 opacity-100" : "translate-x-full opacity-0"
      }`}
    >
      <div
        className="rounded-2xl px-4 py-3 shadow-xl"
        style={{
          background: "var(--theme-bg-surface)",
          backdropFilter: "blur(12px)",
          border: "1px solid var(--theme-border)",
        }}
      >
        {/* Top row: player + expression */}
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium truncate" style={{ color: "var(--theme-text-secondary)" }}>
            {roll.player_name}
          </span>
          <span className="text-xs font-mono ml-2 shrink-0" style={{ color: "var(--theme-text-muted)" }}>
            {roll.expression}
          </span>
        </div>

        {/* Result */}
        <div
          className="text-2xl font-black tabular-nums leading-none"
          style={{
            color: isNatMin ? "#f87171" : "var(--theme-text-primary)",
            textShadow: isNatMax ? "0 0 20px var(--theme-accent-glow)" : undefined,
          }}
        >
          {roll.result}
        </div>

        {/* Nat label */}
        {isNatMax && (
          <div className="text-[10px] font-bold text-yellow-300 tracking-widest uppercase mt-0.5">
            Natural {simpleTerm!.sides} ✨
          </div>
        )}
        {isNatMin && (
          <div className="text-[10px] font-bold text-red-400 tracking-widest uppercase mt-0.5">
            Natural 1 💀
          </div>
        )}

        {/* Breakdown */}
        <div className="text-xs font-mono mt-1" style={{ color: "var(--theme-text-muted)" }}>
          {roll.breakdown}
        </div>
      </div>
    </div>
  );
}
