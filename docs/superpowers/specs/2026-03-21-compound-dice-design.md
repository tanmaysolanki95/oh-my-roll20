# Compound Dice Expression Design

## Goal

Extend the dice roller to parse and evaluate chained dice expressions like `5d20+1d4-1d4+5`, where any number of dice groups and flat modifiers can be combined with `+` and `-`.

## Architecture

Replace the single-term parser (`parseDiceExpression`) and roller (`rollDice`) in `src/lib/dice.ts` with a compound API. The new API handles the existing simple format (`1d20`, `3d6+5`) as a degenerate 1-term case — no backward-compat shim needed. `DiceRoller.tsx` calls the new functions in place of the old ones.

## Tech Stack

TypeScript, no new dependencies. Pure functions in `src/lib/dice.ts`.

---

## Data Model (`src/types/index.ts`)

### `RollTerm` (new)

```ts
export type RollTerm =
  | { kind: "dice"; sign: 1 | -1; count: number; sides: number }
  | { kind: "flat";  sign: 1 | -1; value: number };
```

`sign` is `+1` or `-1` and is applied when summing. For flat terms, `value` is always a **positive** integer; `sign` carries the direction. A flat term `1d6-3` produces `{kind:"flat", sign:-1, value:3}` — never `value:-3`.

The leading term always has `sign: 1`. A leading negative dice term (e.g. `-1d6` as the first/only term) is **invalid** → `null`.

### `TermResult` (new)

```ts
export interface TermResult {
  term: RollTerm;
  rolls: number[];   // empty for flat terms
  subtotal: number;  // signed contribution to the total (sign already applied)
}
```

### `CompoundRollResult` (new)

```ts
export interface CompoundRollResult {
  result: number;
  breakdown: string;
  termResults: TermResult[];
}
```

### Types removed

`ParsedRoll` is **removed** from `src/types/index.ts` — it is tied exclusively to the old single-term API.

---

## `src/lib/dice.ts` — New API

### `parseCompoundExpression(expr: string): RollTerm[] | null`

Tokenizes the expression into signed terms.

**Algorithm:**
1. Strip all whitespace.
2. Use a regex scan `/([+-]?)(\d*d\d+|\d+)/gi` to extract tokens with their leading sign character (`""`, `"+"`, or `"-"`). The regex captures the optional sign and the body (`NdX` or `N`) together, so no sign is lost.
3. The first token's sign defaults to `+` if the character is absent.
4. If the first token's sign is `-` **and** the body is a dice expression (`NdX`), return `null` (leading negative dice term is invalid).
5. Parse each body as either `NdX` (dice) or `N` (flat integer). Bare `dX` → count defaults to 1.
6. Validate: count 1–100, sides 2–1000, `|flat value|` ≤ 10000, total term count ≤ 20.
7. Must contain at least one `kind: "dice"` term.
8. Return `null` if any token fails to parse or any constraint is violated.

**Note:** The regex approach avoids the trap of first prepending `+` to the string (which would silently accept `-1d6` by converting it to `+1d6` before checking the sign constraint).

**Valid examples:**
- `1d20` → `[{kind:"dice", sign:1, count:1, sides:20}]`
- `3d6+5` → `[{kind:"dice", sign:1, count:3, sides:6}, {kind:"flat", sign:1, value:5}]`
- `5d20+1d4-1d4+5` → 4 terms
- `d20` → count defaults to 1
- `1d6-3` → `[{kind:"dice",sign:1,count:1,sides:6}, {kind:"flat",sign:-1,value:3}]`

**Invalid → `null`:** empty string, no dice term, `0d6`, `d0`, counts > 100, > 20 terms, `-1d6` as the leading/only term, `5` (no dice), `invalid`.

### `rollCompound(terms: RollTerm[]): CompoundRollResult`

Rolls each dice term and sums all contributions.

**breakdown format:** `[15, 3, 18, 1, 20] + [2] - [3] + 5`
- Dice groups → bracketed list of individual rolls.
- Flat modifiers → bare number.
- Leading positive term has no operator prefix; all others are preceded by ` + ` or ` - `.

Note: `breakdown` uses spaces around operators for readability. `formatCompoundExpression` (below) returns a compact form with no spaces — these are intentionally two different string formats.

**Example:** `5d20+1d4-1d4+5` might produce:
```
breakdown: "[15, 3, 18, 1, 20] + [2] - [3] + 5"
result: 61
```

### `formatCompoundExpression(terms: RollTerm[]): string`

Returns a canonical compact string like `5d20+1d4-1d4+5` (no spaces). Used to normalize user input for display in the log.

### `QUICK_DICE` — unchanged.

Old functions `parseDiceExpression`, `rollDice`, `formatExpression` are **removed** (only used in `DiceRoller.tsx`).

---

## Natural Max / Natural Min Detection

After `rollCompound`, `DiceRoller` scans `termResults` (at roll time, not stored in state) for dice terms where `count === 1`:
- **Nat max candidate:** `rolls[0] === term.sides`
- **Nat min candidate:** `rolls[0] === 1`

If multiple candidates qualify, pick the **first qualifying term** in the expression (stable tiebreak by position). Show at most one callout at a time — nat max takes priority over nat min.

`natMaxDie` and `natMinDie` store the **`sides`** value of the qualifying die (e.g. `20` for a d20 that rolled 20), or `null`. `natMinDie` stores `sides`, not `1` — it identifies *which* die rolled a natural 1.

**Behaviour change vs. old code:** The old `DiceRoller.tsx` compared `lastResult.result === lastResult.sides`, which checked the *total result* against the die's sides. This was incorrect for `1d20+5` rolling a 20 (total 25 ≠ 20). The new implementation checks the **raw roll value** of the individual die against its sides — the correct D&D definition of "natural max." This is an intentional fix.

---

## `DiceRoller.tsx` Changes

- Replace `parseDiceExpression` → `parseCompoundExpression`.
- Replace `rollDice` + `formatExpression` → `rollCompound` + `formatCompoundExpression`.
- Compute `natMaxDie` / `natMinDie` from `termResults` immediately after rolling; do **not** store `termResults` in component state.
- `lastResult` shape change:
  ```ts
  // before
  { expression, result, breakdown, sides, count }
  // after
  { expression, result, breakdown, natMaxDie: number | null, natMinDie: number | null }
  ```
- Nat max callout: `Natural {natMaxDie} ✨` (was hardcoded `"Natural {sides}"`)
- Nat min callout: `Natural 1 💀` (unchanged).
- Input placeholder: `e.g. 5d20+1d4-2`
- Error hint: `Try: 2d6+3 or 1d20+1d4-2`
- Quick-roll buttons unchanged — they pass `1d${sides}` which is valid single-term compound syntax.

---

## Error Handling

- Bad expression → `parseCompoundExpression` returns `null` → `DiceRoller` shows inline error: `Can't parse "…". Try: 2d6+3 or 1d20+1d4-2`.
- Expressions with no dice term (e.g. just `5`) → `null`.
- Overflow guard: total term count ≤ 20.

---

## Testing

Verify in `src/lib/dice.test.ts` (new file):

| Expression | Expected |
|---|---|
| `1d20` | 1 term, result 1–20 |
| `3d6+5` | 2 terms, result 8–23 |
| `5d20+1d4-1d4+5` | 4 terms, result 6–105 |
| `d6` | count defaults to 1 |
| `d20` | count defaults to 1 |
| `1d20-5` | negative flat modifier |
| `invalid` | returns null |
| `0d6` | returns null |
| `d0` | returns null |
| `5` (no dice) | returns null |
| `-1d6` (leading negative dice) | returns null |
| 21 terms (e.g. `1d6` repeated 21 times) | returns null (overflow guard) |
| nat max: `1d6` rolls 6 | `natMaxDie = 6` (sides of qualifying die) |
| nat max: `1d100` rolls 100 | `natMaxDie = 100` |
| nat min: `1d6` rolls 1 | `natMinDie = 6` (sides of die that rolled 1, not the roll value) |
| compound: `1d20+1d4`, d20=20 | `natMaxDie = 20` |
| compound: `1d20+5`, d20=20 | `natMaxDie = 20` (raw roll checked, not total 25) |
| `flat.value` invariant: `1d6-3` | flat term has `sign:-1, value:3` (not `value:-3`) |
