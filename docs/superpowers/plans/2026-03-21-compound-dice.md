# Compound Dice Expression Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the dice roller to parse and evaluate chained expressions like `5d20+1d4-1d4+5`.

**Architecture:** Replace the single-term parser/roller in `src/lib/dice.ts` with a compound API that tokenizes expressions into a list of signed `RollTerm` values. `DiceRoller.tsx` calls the new API; simple expressions like `1d20` are valid degenerate cases (1 term) so no compatibility shim is needed.

**Tech Stack:** TypeScript, Vitest (new dev dependency for tests), no other new deps.

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `src/types/index.ts` | Modify | Add `RollTerm`, `TermResult`, `CompoundRollResult`; remove `ParsedRoll` |
| `src/lib/dice.ts` | Rewrite | New compound API: `parseCompoundExpression`, `rollCompound`, `formatCompoundExpression`; remove old functions |
| `src/lib/dice.test.ts` | Create | Vitest unit tests for the new dice API |
| `src/components/dice/DiceRoller.tsx` | Modify | Use new API; update `lastResult` shape and nat-max/min detection |
| `vitest.config.ts` | Create | Vitest config (needed — no test runner exists yet) |
| `package.json` | Modify | Add `vitest` dev dep and `"test"` script |

---

## Task 1: Install Vitest and configure it

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

The project has no test runner. Vitest works with TypeScript out of the box and needs no special setup for pure-function tests.

- [ ] **Step 1: Install vitest**

```bash
npm install -D vitest
```

- [ ] **Step 2: Add test script to `package.json`**

In the `"scripts"` block, add:
```json
"test": "vitest run"
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
});
```

- [ ] **Step 4: Verify vitest works**

```bash
npx vitest run --reporter=verbose
```

Expected: "No test files found" or 0 tests — no errors.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: add vitest for unit tests"
```

---

## Task 2: Add new types, remove ParsedRoll

**Files:**
- Modify: `src/types/index.ts` (lines 68–72 contain `ParsedRoll`)

No tests needed for type-only changes — TypeScript compilation verifies them.

- [ ] **Step 1: Open `src/types/index.ts` and delete the `ParsedRoll` interface (lines 68–72)**

Remove this entire block:
```ts
export interface ParsedRoll {
  count: number;
  sides: number;
  modifier: number;
}
```

- [ ] **Step 2: Add the three new types at the bottom of the file**

```ts
export type RollTerm =
  | { kind: "dice"; sign: 1 | -1; count: number; sides: number }
  | { kind: "flat";  sign: 1 | -1; value: number };

export interface TermResult {
  term: RollTerm;
  rolls: number[];   // empty for flat terms
  subtotal: number;  // signed contribution to the total (sign already applied)
}

export interface CompoundRollResult {
  result: number;
  breakdown: string;
  termResults: TermResult[];
}
```

- [ ] **Step 3: Verify TypeScript is happy**

```bash
npx tsc --noEmit
```

Expected: Errors about `ParsedRoll` being used in `src/lib/dice.ts` — that's fine, they'll be fixed in the next task.

- [ ] **Step 4: Commit**

```bash
git add src/types/index.ts
git commit -m "types: add RollTerm, TermResult, CompoundRollResult; remove ParsedRoll"
```

---

## Task 3: Write failing tests for the new dice API

**Files:**
- Create: `src/lib/dice.test.ts`

Write all tests first. They will fail because the new functions don't exist yet. That's expected.

- [ ] **Step 1: Create `src/lib/dice.test.ts` with the full test suite**

```ts
import { describe, it, expect } from "vitest";
import {
  parseCompoundExpression,
  rollCompound,
  formatCompoundExpression,
} from "./dice";

// ---------------------------------------------------------------------------
// parseCompoundExpression — parsing
// ---------------------------------------------------------------------------

describe("parseCompoundExpression — valid", () => {
  it("parses a single die", () => {
    const terms = parseCompoundExpression("1d20");
    expect(terms).toEqual([{ kind: "dice", sign: 1, count: 1, sides: 20 }]);
  });

  it("parses bare dX (count defaults to 1)", () => {
    const terms = parseCompoundExpression("d6");
    expect(terms).toEqual([{ kind: "dice", sign: 1, count: 1, sides: 6 }]);
  });

  it("parses bare d20 (count defaults to 1)", () => {
    const terms = parseCompoundExpression("d20");
    expect(terms).toEqual([{ kind: "dice", sign: 1, count: 1, sides: 20 }]);
  });

  it("parses dice + positive flat modifier", () => {
    const terms = parseCompoundExpression("3d6+5");
    expect(terms).toEqual([
      { kind: "dice", sign: 1, count: 3, sides: 6 },
      { kind: "flat", sign: 1, value: 5 },
    ]);
  });

  it("parses dice + negative flat modifier (value is positive, sign is -1)", () => {
    const terms = parseCompoundExpression("1d20-5");
    expect(terms).toEqual([
      { kind: "dice", sign: 1, count: 1, sides: 20 },
      { kind: "flat", sign: -1, value: 5 },
    ]);
  });

  it("flat.value invariant: 1d6-3 produces sign:-1, value:3 (never value:-3)", () => {
    const terms = parseCompoundExpression("1d6-3");
    expect(terms).not.toBeNull();
    const flat = terms!.find(t => t.kind === "flat");
    expect(flat).toEqual({ kind: "flat", sign: -1, value: 3 });
  });

  it("parses a 4-term compound expression", () => {
    const terms = parseCompoundExpression("5d20+1d4-1d4+5");
    expect(terms).not.toBeNull();
    expect(terms!.length).toBe(4);
    expect(terms![0]).toEqual({ kind: "dice", sign: 1,  count: 5, sides: 20 });
    expect(terms![1]).toEqual({ kind: "dice", sign: 1,  count: 1, sides: 4  });
    expect(terms![2]).toEqual({ kind: "dice", sign: -1, count: 1, sides: 4  });
    expect(terms![3]).toEqual({ kind: "flat", sign: 1,  value: 5             });
  });

  it("strips whitespace", () => {
    const terms = parseCompoundExpression("  1d20 + 5  ");
    expect(terms).not.toBeNull();
    expect(terms!.length).toBe(2);
  });
});

describe("parseCompoundExpression — invalid", () => {
  it("returns null for empty string", () => {
    expect(parseCompoundExpression("")).toBeNull();
  });

  it("returns null for non-dice text", () => {
    expect(parseCompoundExpression("invalid")).toBeNull();
  });

  it("returns null for flat-only expression (no dice term)", () => {
    expect(parseCompoundExpression("5")).toBeNull();
  });

  it("returns null for 0d6 (count must be >= 1)", () => {
    expect(parseCompoundExpression("0d6")).toBeNull();
  });

  it("returns null for d0 (sides must be >= 2)", () => {
    expect(parseCompoundExpression("d0")).toBeNull();
  });

  it("returns null for -1d6 (leading negative dice term)", () => {
    expect(parseCompoundExpression("-1d6")).toBeNull();
  });

  it("returns null for > 20 terms (overflow guard)", () => {
    const expr = Array.from({ length: 21 }, () => "1d6").join("+");
    expect(parseCompoundExpression(expr)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// rollCompound — rolling
// ---------------------------------------------------------------------------

describe("rollCompound", () => {
  it("result is within expected range for 1d20 (1-20)", () => {
    const terms = parseCompoundExpression("1d20")!;
    for (let i = 0; i < 50; i++) {
      const { result } = rollCompound(terms);
      expect(result).toBeGreaterThanOrEqual(1);
      expect(result).toBeLessThanOrEqual(20);
    }
  });

  it("result is within expected range for 3d6+5 (8-23)", () => {
    const terms = parseCompoundExpression("3d6+5")!;
    for (let i = 0; i < 50; i++) {
      const { result } = rollCompound(terms);
      expect(result).toBeGreaterThanOrEqual(8);
      expect(result).toBeLessThanOrEqual(23);
    }
  });

  it("result is within expected range for 5d20+1d4-1d4+5 (6-105)", () => {
    const terms = parseCompoundExpression("5d20+1d4-1d4+5")!;
    for (let i = 0; i < 50; i++) {
      const { result } = rollCompound(terms);
      expect(result).toBeGreaterThanOrEqual(6);
      expect(result).toBeLessThanOrEqual(105);
    }
  });

  it("termResults has the right number of entries", () => {
    const terms = parseCompoundExpression("5d20+1d4-1d4+5")!;
    const { termResults } = rollCompound(terms);
    expect(termResults.length).toBe(4);
  });

  it("flat term has empty rolls array", () => {
    const terms = parseCompoundExpression("1d6+3")!;
    const { termResults } = rollCompound(terms);
    const flatResult = termResults.find(tr => tr.term.kind === "flat");
    expect(flatResult!.rolls).toEqual([]);
  });

  it("subtotals sum to result", () => {
    const terms = parseCompoundExpression("2d6+1d4-2")!;
    for (let i = 0; i < 20; i++) {
      const { result, termResults } = rollCompound(terms);
      const sum = termResults.reduce((acc, tr) => acc + tr.subtotal, 0);
      expect(sum).toBe(result);
    }
  });
});

// ---------------------------------------------------------------------------
// Nat max / nat min — verify raw roll data from rollCompound
// ---------------------------------------------------------------------------

describe("nat max / nat min — termResults data", () => {
  // Helper: roll until a specific condition (up to maxAttempts)
  function rollUntil(
    terms: ReturnType<typeof parseCompoundExpression>,
    predicate: (tr: ReturnType<typeof rollCompound>) => boolean,
    maxAttempts = 2000
  ) {
    for (let i = 0; i < maxAttempts; i++) {
      const result = rollCompound(terms!);
      if (predicate(result)) return result;
    }
    return null;
  }

  it("1d6 eventually rolls a 6 (nat max raw data present)", () => {
    const terms = parseCompoundExpression("1d6")!;
    const found = rollUntil(terms, ({ termResults }) =>
      termResults.some(tr => tr.term.kind === "dice" && tr.rolls[0] === 6)
    );
    expect(found).not.toBeNull();
  });

  it("1d6 eventually rolls a 1 (nat min raw data present)", () => {
    const terms = parseCompoundExpression("1d6")!;
    const found = rollUntil(terms, ({ termResults }) =>
      termResults.some(tr => tr.term.kind === "dice" && tr.rolls[0] === 1)
    );
    expect(found).not.toBeNull();
  });

  it("1d20+5: when d20 rolls 20, total is 25 (raw roll checked, not total)", () => {
    const terms = parseCompoundExpression("1d20+5")!;
    const found = rollUntil(terms, ({ termResults }) => {
      const d20 = termResults.find(
        tr => tr.term.kind === "dice" && (tr.term as { sides: number }).sides === 20
      );
      return d20 !== undefined && d20.rolls[0] === 20;
    });
    expect(found).not.toBeNull();
    if (found) {
      // Old bug: comparing result (25) to sides (20) would have missed nat-20
      expect(found.result).toBe(25);
    }
  });
});

// ---------------------------------------------------------------------------
// formatCompoundExpression
// ---------------------------------------------------------------------------

describe("formatCompoundExpression", () => {
  it("formats a single die", () => {
    const terms = parseCompoundExpression("1d20")!;
    expect(formatCompoundExpression(terms)).toBe("1d20");
  });

  it("formats dice with positive modifier (no spaces)", () => {
    const terms = parseCompoundExpression("3d6+5")!;
    expect(formatCompoundExpression(terms)).toBe("3d6+5");
  });

  it("formats dice with negative flat modifier (no spaces)", () => {
    const terms = parseCompoundExpression("1d20-5")!;
    expect(formatCompoundExpression(terms)).toBe("1d20-5");
  });

  it("formats a 4-term compound expression (no spaces)", () => {
    const terms = parseCompoundExpression("5d20+1d4-1d4+5")!;
    expect(formatCompoundExpression(terms)).toBe("5d20+1d4-1d4+5");
  });

  it("normalises bare dX input to 1dX", () => {
    const terms = parseCompoundExpression("d6")!;
    expect(formatCompoundExpression(terms)).toBe("1d6");
  });
});
```

- [ ] **Step 2: Run the tests — confirm they all fail (functions not yet defined)**

```bash
npx vitest run src/lib/dice.test.ts --reporter=verbose
```

Expected: All tests fail with import/not-a-function errors.

- [ ] **Step 3: Commit the failing tests**

```bash
git add src/lib/dice.test.ts
git commit -m "test: add failing tests for compound dice API"
```

---

## Task 4: Implement the new dice API (make tests pass)

**Files:**
- Modify: `src/lib/dice.ts` (full rewrite)

Replace the entire file. Keep `QUICK_DICE`. Remove the `ParsedRoll` import and old functions.

**Implementation notes:**
- Use `String.prototype.matchAll` with `/([+-]?)(\d*d\d+|\d+)/gi` to tokenize — this captures the optional sign with each body token without losing sign characters.
- After collecting all matches, verify `consumed length === stripped.length` to reject garbage characters between tokens (e.g. `1d6@2d4` has an `@` between terms — the regex would skip it but we must catch it).
- For flat terms: store absolute `value` (always positive), put direction in `sign`.
- For the breakdown string: leading term has no prefix; subsequent terms get ` + ` or ` - `.

- [ ] **Step 1: Rewrite `src/lib/dice.ts`**

```ts
import type { RollTerm, TermResult, CompoundRollResult } from "@/types";

const TOKEN_RE = /([+-]?)(\d*d\d+|\d+)/gi;
const DICE_BODY_RE = /^(\d*)d(\d+)$/i;

export function parseCompoundExpression(expr: string): RollTerm[] | null {
  const stripped = expr.replace(/\s/g, "");
  if (!stripped) return null;

  const terms: RollTerm[] = [];
  let consumed = 0;

  for (const match of stripped.matchAll(TOKEN_RE)) {
    if (match.index !== consumed) return null; // gap = garbage char
    consumed = match.index + match[0].length;

    if (terms.length >= 20) return null; // overflow guard

    const signChar = match[1]; // "", "+", or "-"
    const body = match[2];
    const sign: 1 | -1 = signChar === "-" ? -1 : 1;
    const isFirst = terms.length === 0;

    const diceMatch = body.match(DICE_BODY_RE);
    if (diceMatch) {
      if (isFirst && sign === -1) return null; // leading negative dice term
      const count = diceMatch[1] === "" ? 1 : parseInt(diceMatch[1], 10);
      const sides = parseInt(diceMatch[2], 10);
      if (count < 1 || count > 100) return null;
      if (sides < 2 || sides > 1000) return null;
      terms.push({ kind: "dice", sign, count, sides });
    } else {
      const value = parseInt(body, 10);
      if (isNaN(value) || value > 10000) return null;
      terms.push({ kind: "flat", sign, value });
    }
  }

  if (consumed !== stripped.length) return null; // trailing garbage
  if (terms.length === 0) return null;
  if (!terms.some(t => t.kind === "dice")) return null;

  return terms;
}

export function rollCompound(terms: RollTerm[]): CompoundRollResult {
  const termResults: TermResult[] = [];
  let result = 0;
  const parts: string[] = [];

  for (let i = 0; i < terms.length; i++) {
    const term = terms[i];
    const prefix = i === 0 ? "" : term.sign === 1 ? " + " : " - ";

    if (term.kind === "dice") {
      const rolls: number[] = [];
      for (let j = 0; j < term.count; j++) {
        rolls.push(Math.floor(Math.random() * term.sides) + 1);
      }
      const subtotal = term.sign * rolls.reduce((a, b) => a + b, 0);
      result += subtotal;
      termResults.push({ term, rolls, subtotal });
      parts.push(`${prefix}[${rolls.join(", ")}]`);
    } else {
      const subtotal = term.sign * term.value;
      result += subtotal;
      termResults.push({ term, rolls: [], subtotal });
      parts.push(`${prefix}${term.value}`);
    }
  }

  return { result, breakdown: parts.join(""), termResults };
}

export function formatCompoundExpression(terms: RollTerm[]): string {
  return terms
    .map((term, i) => {
      const prefix = i === 0 ? "" : term.sign === 1 ? "+" : "-";
      if (term.kind === "dice") return `${prefix}${term.count}d${term.sides}`;
      return `${prefix}${term.value}`;
    })
    .join("");
}

export const QUICK_DICE = [4, 6, 8, 10, 12, 20, 100] as const;
```

- [ ] **Step 2: Run the tests**

```bash
npx vitest run src/lib/dice.test.ts --reporter=verbose
```

Expected: All tests pass.

- [ ] **Step 3: Check TypeScript**

```bash
npx tsc --noEmit
```

Expected: Errors only in `DiceRoller.tsx` (still imports old functions) — fixed next task.

- [ ] **Step 4: Commit**

```bash
git add src/lib/dice.ts
git commit -m "feat: implement compound dice parser and roller"
```

---

## Task 5: Update DiceRoller.tsx to use the new API

**Files:**
- Modify: `src/components/dice/DiceRoller.tsx`

The component needs to switch to the new API, update the `lastResult` shape, and compute nat-max/min from `termResults` at roll time (not stored in state).

- [ ] **Step 1: Replace the entire `DiceRoller.tsx`**

```tsx
"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { parseCompoundExpression, rollCompound, formatCompoundExpression, QUICK_DICE } from "@/lib/dice";
import { useSessionStore } from "@/store/session";
import type { TermResult } from "@/types";

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

/** Scan termResults for nat-max/nat-min on single-die terms.
 *  nat max takes priority over nat min if the same die qualifies for both.
 *  Tiebreak: first qualifying term in the expression wins. */
function detectNatFlags(termResults: TermResult[]): { natMaxDie: number | null; natMinDie: number | null } {
  let natMaxDie: number | null = null;
  let natMinDie: number | null = null;

  for (const tr of termResults) {
    if (tr.term.kind !== "dice" || tr.term.count !== 1) continue;
    const roll = tr.rolls[0];
    const sides = tr.term.sides;
    if (roll === sides && natMaxDie === null) natMaxDie = sides;
    if (roll === 1    && natMinDie === null) natMinDie = sides;
  }

  // nat max takes priority
  return { natMaxDie, natMinDie: natMaxDie !== null ? null : natMinDie };
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
    natMaxDie: number | null;
    natMinDie: number | null;
  } | null>(null);

  const roll = async (expression: string) => {
    const terms = parseCompoundExpression(expression);
    if (!terms) {
      setError(`Can't parse "${expression}". Try: 2d6+3 or 1d20+1d4-2`);
      return;
    }
    setError("");

    const { result, breakdown, termResults } = rollCompound(terms);
    const formattedExpr = formatCompoundExpression(terms);
    const { natMaxDie, natMinDie } = detectNatFlags(termResults);

    setLastResult({ expression: formattedExpr, result, breakdown, natMaxDie, natMinDie });

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
          placeholder="e.g. 5d20+1d4-2"
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
              textShadow: lastResult.natMaxDie !== null ? "0 0 20px var(--theme-accent-glow)" : undefined,
            }}
          >
            {lastResult.result}
          </div>
          {lastResult.natMaxDie !== null && (
            <div className="text-[10px] font-bold text-yellow-300 tracking-widest uppercase mt-1">
              Natural {lastResult.natMaxDie} ✨
            </div>
          )}
          {lastResult.natMinDie !== null && (
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
```

- [ ] **Step 2: Run all tests**

```bash
npx vitest run --reporter=verbose
```

Expected: All tests pass.

- [ ] **Step 3: Check TypeScript (should be clean now)**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: Smoke-test manually**

```bash
npm run dev
```

Open `http://localhost:3000`. Create a session. In the Dice tab:
- Click `d20` → rolls, result appears in callout
- Type `5d20+1d4-1d4+5` → result appears, breakdown shows bracketed groups with ` + ` / ` - ` operators
- Type `1d20` and roll until a 20 → "Natural 20 ✨" appears
- Type `invalid` → error message appears

- [ ] **Step 5: Commit and push**

```bash
git add src/components/dice/DiceRoller.tsx
git commit -m "feat: wire DiceRoller to compound dice API; fix nat-max detection"
git push
```
