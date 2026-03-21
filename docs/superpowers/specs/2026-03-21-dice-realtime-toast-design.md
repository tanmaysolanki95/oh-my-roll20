# Dice: Real-time Sharing + Toast Notifications

**Date:** 2026-03-21
**Status:** Approved

---

## Problem

Two related gaps in the current dice system:

1. **Dice rolls are not shared in real-time.** `DiceRoller` inserts to the DB and updates the local store, but never broadcasts. Other players only see rolls from the initial DB load on subscribe — live rolls are invisible until they refresh.

2. **No visual feedback for rolls.** When any player rolls (including yourself), there is no ambient notification. You must actively watch the Dice tab to notice others' rolls.

---

## Solution Overview

1. Wire up the existing (but unused) broadcast infrastructure so rolls propagate to all clients immediately.
2. Add a `DiceToast` overlay component that shows a transient Apple-style notification on every roll.

---

## Part 1: Real-time Roll Sharing

### What changes

**`src/types/index.ts`**
- Add `roll_id: string` and `created_at: string` to the `dice_roll` variant of `BroadcastEvent`

**`src/store/session.ts`**
- Make `addDiceRoll` idempotent: skip if `diceLog` already contains an entry with the same `id`. This handles two races: (1) the sender receives its own broadcast back; (2) a live broadcast arrives during the initial DB history load in the subscribe callback, causing both paths to call `addDiceRoll` for the same roll.

**`src/lib/useRealtimeSession.ts`**
- Add `broadcastDiceRoll(roll_id, player_name, expression, result, breakdown, created_at)` sender alongside the existing broadcast senders (`broadcastTokenMove`, etc.)
- Update the `dice_roll` receive handler to use `payload.roll_id` as the roll's `id` and `payload.created_at` as `created_at` (the sender's timestamp). This ensures `DiceToast`'s recency check works on the sender's clock, not the receiver's.
- Return `broadcastDiceRoll` from the hook

**`src/app/session/[id]/SessionView.tsx`**
- Destructure `broadcastDiceRoll` from `useRealtimeSession`
- Pass it as a prop to `<DiceRoller>`

**`src/components/dice/DiceRoller.tsx`**
- Accept `broadcastDiceRoll` as a prop
- Call it inside `roll()` after `addDiceRoll` and **before** `await supabase.from('dice_rolls').insert(...)`, passing `rollEntry.id` and `rollEntry.created_at`. This ensures other clients receive the roll immediately, without waiting for the DB round-trip.
- Pass `id: rollEntry.id` into the `supabase.from('dice_rolls').insert(...)` call so that the DB-stored id matches the broadcast id. This ensures idempotency works correctly when joining clients load history — the same roll won't appear twice with different ids.

### Why this avoids double-counting

Supabase Realtime delivers broadcast events to all subscribers **including the sender**. Without this fix, the roller would call `addDiceRoll` directly (with one `id`) and then receive its own broadcast back (with a different `crypto.randomUUID()` id), duplicating the entry.

The fix: the roller generates one stable `rollEntry.id`, passes it in the broadcast payload, and the receive handler uses that same id. `addDiceRoll` skips any roll whose id is already present — so the duplicate receive is a no-op.

### What does NOT change

The DB insert in `DiceRoller` is kept — it persists rolls so new joiners see history.

---

## Part 2: DiceToast Component

### New file: `src/components/dice/DiceToast.tsx`

A self-contained overlay component. Reads from the Zustand store directly — no props needed.

**Behavior:**
- Subscribes to `diceLog[0]?.id` (the id of the newest roll) from the Zustand store via a `useEffect`
- When `diceLog[0]?.id` changes, check `created_at` recency: only show a toast if the roll's `created_at` is within the last **10 seconds** (`Date.now() - new Date(roll.created_at).getTime() < 10_000`). This suppresses DB-loaded historical rolls on initial join without any timing assumptions or ref snapshots.
- Show toast and (re)start a 4-second auto-dismiss timer
- Single toast state — each new roll replaces the previous; timer resets

**Visual design:**
- `position: fixed`, top-right corner (`top-4 right-4`), `z-50`
- ~280px wide card: `bg-gray-900/85 backdrop-blur-sm`, `rounded-2xl`, subtle border (`border-gray-700/60`)
- Content layout:
  - Top row: player name (xs, gray-400) + expression (xs, mono, gray-500)
  - Center: large bold result number (2xl, white)
  - Bottom: breakdown (xs, mono, gray-600)
- Nat max / Nat 1 detection: parse `roll.expression` using `parseDiceExpression` from `src/lib/dice.ts`. Only apply special styling when `parsed !== null && parsed.count === 1 && parsed.modifier === 0` (expressions with modifiers are excluded because `roll.result` includes the modifier and cannot be reliably compared to `sides`). Under that guard: Nat max = `roll.result === parsed.sides`; Nat 1 = `roll.result === 1`
- Nat max: result glows violet (`text-shadow: 0 0 16px rgba(167,139,250,0.8)`) + label `Natural {parsed.sides} ✨`
- Nat 1: result is `text-red-400` + label "Natural 1 💀"
- Slide in from right on appear (`translate-x-0 opacity-100`), hidden state is `translate-x-full opacity-0`; CSS transition `transition-all duration-300`
- Fade/slide out on dismiss (same transition back to hidden state)

**Integration in `SessionView`:**
- Add `<DiceToast />` inside the outermost `<div>` of the return — it uses `fixed` positioning so placement in the tree doesn't matter
- No props, no state passed in

---

## Files Changed

| File | Change |
|------|--------|
| `src/types/index.ts` | Add `roll_id` to `dice_roll` BroadcastEvent variant |
| `src/store/session.ts` | Make `addDiceRoll` idempotent (skip duplicate ids) |
| `src/lib/useRealtimeSession.ts` | Add `broadcastDiceRoll` sender; update receive handler to use `payload.roll_id`; return from hook |
| `src/app/session/[id]/SessionView.tsx` | Destructure + pass `broadcastDiceRoll` to `DiceRoller`; render `<DiceToast />` |
| `src/components/dice/DiceRoller.tsx` | Accept + call `broadcastDiceRoll` prop |
| `src/components/dice/DiceToast.tsx` | New file |

---

## Trade-offs and Constraints

- **No new DB table or migration needed.** Broadcast is ephemeral; DB insert in `DiceRoller` already handles persistence.
- **Initial burst suppression** — `DiceToast` checks `created_at` recency (< 10 seconds) before showing a toast. DB-loaded historical rolls are always older than 10 seconds. This is connection-speed-independent, requires no ref snapshots or timing assumptions, and handles batched or sequential initial load correctly. Edge case: a roll made right before you joined (< 10s ago) will show a toast on initial load — acceptable and arguably correct behavior.
- **No stacking** — user confirmed replace behavior. Simplifies state significantly.
- **`broadcastDiceRoll` is called by the roller, not the receiver** — so the local roller and all remote clients each call `addDiceRoll` exactly once per roll. No double-counting.
