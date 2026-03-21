# Dice Real-time Sharing + Toast Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix dice rolls not propagating to other players in real-time, and add an Apple-style toast notification that appears on every roll.

**Architecture:** Add a `roll_id` and `created_at` to the existing (but unwired) `dice_roll` broadcast event; make `addDiceRoll` idempotent to handle the sender receiving their own broadcast back; add a `DiceToast` component that reads the store directly and shows a transient notification for rolls created within the last 10 seconds.

**Tech Stack:** Next.js 16, React 19, Zustand 5, Supabase Realtime (broadcast), TypeScript, Tailwind CSS

---

## File Map

| File | Change |
|------|--------|
| `src/types/index.ts` | Add `roll_id: string` and `created_at: string` to `dice_roll` BroadcastEvent variant |
| `src/store/session.ts` | Make `addDiceRoll` idempotent — skip if id already in `diceLog` |
| `src/lib/useRealtimeSession.ts` | Add `broadcastDiceRoll` sender; update `dice_roll` receive handler to use payload ids |
| `src/app/session/[id]/SessionView.tsx` | Destructure + pass `broadcastDiceRoll` to `<DiceRoller>`; render `<DiceToast />` |
| `src/components/dice/DiceRoller.tsx` | Accept `broadcastDiceRoll` prop; call before DB insert; pass `id` to insert |
| `src/components/dice/DiceToast.tsx` | New file — self-contained toast overlay |

---

## Background: Why `addDiceRoll` Must Be Idempotent

Supabase Realtime delivers broadcast events to **all subscribers including the sender**. Without idempotency:

1. Player rolls → `addDiceRoll(rollEntry)` called directly (id = X)
2. Broadcast fires → received by all subscribers including the sender
3. Receive handler calls `addDiceRoll` again with the same roll — but currently generates a new `crypto.randomUUID()` as the id, so it looks like a different roll
4. Result: the roll appears **twice** in the sender's log

The fix: pass the same `rollEntry.id` in the broadcast payload, use it in the receive handler, and skip in `addDiceRoll` if the id is already present.

---

## Task 1: Update Types and Store

**Files:**
- Modify: `src/types/index.ts:52-57`
- Modify: `src/store/session.ts:57-58`

- [ ] **Step 1: Update the `dice_roll` BroadcastEvent variant**

In `src/types/index.ts`, find this line (currently line 54):
```ts
| { type: "dice_roll"; player_name: string; expression: string; result: number; breakdown: string }
```

Replace with:
```ts
| { type: "dice_roll"; roll_id: string; created_at: string; player_name: string; expression: string; result: number; breakdown: string }
```

- [ ] **Step 2: Make `addDiceRoll` idempotent**

In `src/store/session.ts`, find the `addDiceRoll` implementation (currently lines 57-59):
```ts
addDiceRoll: (roll) =>
  set((state) => ({ diceLog: [roll, ...state.diceLog].slice(0, 50) })),
```

Replace with:
```ts
addDiceRoll: (roll) =>
  set((state) => {
    if (state.diceLog.some((r) => r.id === roll.id)) return state;
    return { diceLog: [roll, ...state.diceLog].slice(0, 50) };
  }),
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: type errors in `useRealtimeSession.ts` (its `dice_roll` send/receive code uses the old payload shape, now missing `roll_id` and `created_at`). This is intentional — it confirms the type change is picked up. Fix those errors in Task 2.

- [ ] **Step 4: Commit**

```bash
git add src/types/index.ts src/store/session.ts
git commit -m "feat: add roll_id/created_at to dice_roll broadcast type; idempotent addDiceRoll"
```

---

## Task 2: Wire Up Broadcast in `useRealtimeSession`

**Files:**
- Modify: `src/lib/useRealtimeSession.ts:87-101` (receive handler) and `src/lib/useRealtimeSession.ts:160-194` (senders + return)

- [ ] **Step 1: Update the `dice_roll` receive handler**

Find the existing receive handler (lines 86-101):
```ts
// --- Broadcast: dice roll ---
channel.on(
  "broadcast",
  { event: "dice_roll" },
  ({ payload }: { payload: Extract<BroadcastEvent, { type: "dice_roll" }> }) => {
    addDiceRoll({
      id: crypto.randomUUID(),
      session_id: sessionId,
      player_name: payload.player_name,
      expression: payload.expression,
      result: payload.result,
      breakdown: payload.breakdown,
      created_at: new Date().toISOString(),
    });
  }
);
```

Replace with (use `payload.roll_id` and `payload.created_at` from the sender):
```ts
// --- Broadcast: dice roll ---
channel.on(
  "broadcast",
  { event: "dice_roll" },
  ({ payload }: { payload: Extract<BroadcastEvent, { type: "dice_roll" }> }) => {
    addDiceRoll({
      id: payload.roll_id,
      session_id: sessionId,
      player_name: payload.player_name,
      expression: payload.expression,
      result: payload.result,
      breakdown: payload.breakdown,
      created_at: payload.created_at,
    });
  }
);
```

- [ ] **Step 2: Add the `broadcastDiceRoll` sender function**

After the existing `broadcastTokenDragEnd` function (around line 185), add:
```ts
const broadcastDiceRoll = (
  roll_id: string,
  player_name: string,
  expression: string,
  result: number,
  breakdown: string,
  created_at: string,
) => {
  channelRef.current?.send({
    type: "broadcast",
    event: "dice_roll",
    payload: { type: "dice_roll", roll_id, created_at, player_name, expression, result, breakdown },
  });
};
```

- [ ] **Step 3: Return `broadcastDiceRoll` from the hook**

Find the return statement (currently line 194):
```ts
return { broadcastTokenMove, broadcastSessionEnd, broadcastTokenDragStart, broadcastTokenDragEnd, lockedBy };
```

Replace with:
```ts
return { broadcastTokenMove, broadcastSessionEnd, broadcastTokenDragStart, broadcastTokenDragEnd, broadcastDiceRoll, lockedBy };
```

- [ ] **Step 4: Verify TypeScript compiles cleanly**

```bash
npx tsc --noEmit
```

Expected: errors only from `SessionView.tsx` and `DiceRoller.tsx` not yet updated. Zero errors in `useRealtimeSession.ts` and `types/index.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/useRealtimeSession.ts
git commit -m "feat: add broadcastDiceRoll sender; use payload roll_id and created_at in receive handler"
```

---

## Task 3: Wire `DiceRoller` Through `SessionView`

**Files:**
- Modify: `src/components/dice/DiceRoller.tsx:8-11` (props interface) and `:33-65` (roll function)
- Modify: `src/app/session/[id]/SessionView.tsx:35` (destructure from hook) and `:555` (pass prop)

- [ ] **Step 1: Update `DiceRollerProps` to accept `broadcastDiceRoll`**

In `src/components/dice/DiceRoller.tsx`, find the props interface (lines 8-11):
```ts
interface DiceRollerProps {
  sessionId: string;
  onCollapse?: () => void;
}
```

Replace with:
```ts
interface DiceRollerProps {
  sessionId: string;
  onCollapse?: () => void;
  broadcastDiceRoll: (roll_id: string, player_name: string, expression: string, result: number, breakdown: string, created_at: string) => void;
}
```

- [ ] **Step 2: Destructure `broadcastDiceRoll` from props and call it in `roll()`**

Update the component signature to destructure the new prop:
```ts
export default function DiceRoller({ sessionId, onCollapse, broadcastDiceRoll }: DiceRollerProps) {
```

In the `roll` function, find these lines (after `addDiceRoll(rollEntry)`, around line 56-65):
```ts
    addDiceRoll(rollEntry);

    await supabase.from("dice_rolls").insert({
      session_id: rollEntry.session_id,
      player_name: rollEntry.player_name,
      expression: rollEntry.expression,
      result: rollEntry.result,
      breakdown: rollEntry.breakdown,
    });
```

Replace with (broadcast BEFORE the DB insert; also pass `id` to the insert):
```ts
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
```

Note: Passing `id` to the insert ensures the DB-stored id matches the broadcast id. This is important for idempotency when joiners load history — the same roll won't appear twice.

- [ ] **Step 3: Update `SessionView` to destructure and pass `broadcastDiceRoll`**

In `src/app/session/[id]/SessionView.tsx`, find the destructure from `useRealtimeSession` (line 35):
```ts
const { broadcastTokenMove, broadcastSessionEnd, broadcastTokenDragStart, broadcastTokenDragEnd, lockedBy } = useRealtimeSession(sessionId);
```

Replace with:
```ts
const { broadcastTokenMove, broadcastSessionEnd, broadcastTokenDragStart, broadcastTokenDragEnd, broadcastDiceRoll, lockedBy } = useRealtimeSession(sessionId);
```

Find the `<DiceRoller>` usage (around line 555):
```tsx
<DiceRoller sessionId={sessionId} />
```

Replace with:
```tsx
<DiceRoller sessionId={sessionId} broadcastDiceRoll={broadcastDiceRoll} />
```

- [ ] **Step 4: Verify TypeScript compiles cleanly**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/dice/DiceRoller.tsx src/app/session/[id]/SessionView.tsx
git commit -m "feat: wire broadcastDiceRoll through SessionView to DiceRoller; pass id to DB insert"
```

---

## Task 4: Create `DiceToast` Component

**Files:**
- Create: `src/components/dice/DiceToast.tsx`
- Modify: `src/app/session/[id]/SessionView.tsx` (import + render)

- [ ] **Step 1: Create `src/components/dice/DiceToast.tsx`**

```tsx
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
```

- [ ] **Step 2: Add `DiceToast` to `SessionView`**

In `src/app/session/[id]/SessionView.tsx`, add the import near the other component imports (around line 13):
```ts
import DiceToast from "@/components/dice/DiceToast";
```

Find the outermost `<div>` in the return (line 275):
```tsx
  return (
    <div className="flex flex-col h-screen bg-gray-950 text-white">
```

Add `<DiceToast />` as the first child inside it:
```tsx
  return (
    <div className="flex flex-col h-screen bg-gray-950 text-white">
      <DiceToast />
```

- [ ] **Step 3: Verify TypeScript compiles cleanly**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 4: Run a production build to catch any Next.js-specific issues**

```bash
npm run build
```

Expected: build succeeds with no errors. Warnings about `react-hooks/exhaustive-deps` for the `latestId` optimization are acceptable.

- [ ] **Step 5: Manual smoke test**

Start the dev server:
```bash
npm run dev
```

Open two browser tabs to the same session.

Test 1 — Real-time sharing:
- Roll a die in Tab A
- Confirm the roll appears in the dice log in Tab B immediately (without refresh)
- Roll in Tab B — confirm it appears in Tab A

Test 2 — No duplicate in roller's log:
- Roll in Tab A — confirm the roll appears exactly ONCE in Tab A's log (not twice)

Test 3 — Toast appears for own roll:
- Roll any die in Tab A — confirm toast slides in from top-right within ~1 second
- Confirm toast auto-dismisses after ~4 seconds

Test 4 — Toast appears for other player's roll:
- Roll in Tab B — confirm toast appears in Tab A

Test 5 — Toast replaces previous:
- Roll twice quickly in either tab — confirm only one toast is visible (the second replaces the first)

Test 6 — No toast on page load:
- Refresh Tab A — confirm NO toast appears despite historical rolls loading

Test 7 — Nat 20 styling:
- Roll `1d20` and get 20 — confirm violet glow and "Natural 20 ✨" label
- Roll `1d20+5` and get 20 — confirm NO special styling (modifier present)

Test 8 — Nat 1 styling:
- Roll `1d20` and get 1 — confirm red result and "Natural 1 💀" label

- [ ] **Step 6: Commit**

```bash
git add src/components/dice/DiceToast.tsx src/app/session/[id]/SessionView.tsx
git commit -m "feat: add DiceToast overlay — Apple-style notification on every dice roll"
```
