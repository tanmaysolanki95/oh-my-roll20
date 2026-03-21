# Compound Dice Expression Design

## Goal

Extend the dice roller to parse and evaluate chained dice expressions like `5d20+1d4-1d4+5`, where any number of dice groups and flat modifiers can be combined with `+` and `-`.

## Architecture

Replace the single-term parser (`parseDiceExpression`) and roller (`rollDice`) in `src/lib/dice.ts` with a compound API. The new API handles the existing simple format (`1d20`, `3d6+5`) as a degenerate 1-term case — no backward-compat shim needed. `DiceRoller.tsx` calls the new functions in place of the old ones.

## Tech Stack

TypeScript, no new dependencies. Pure functions in `src/lib/dice.ts`.

---

## Data Model

### `RollTerm` (new, in `src/types/index.ts`)

```ts
export type RollTerm =
  | { kind: "dice"; sign: 1 | -1; count: number; sides: number }
  | { kind: "flat";  sign: 1 | -1; value: number };
```

`sign` is `+1` or `-1` and is applied when summing. The leading term always has `sign: 1`.

### `TermResult` (new, in `src/types/index.ts`)

```ts
export interface TermResult {
  term: RollTerm;
  rolls: number[];   // empty for flat terms
  subtotal: number;  // signed contribution to the total
}
```

---

## `src/lib/dice.ts` — New API

### `parseCompoundExpression(expr: string): RollTerm[] | null`

Tokenizes the expression into signed terms.

**Algorithm:**
1. Strip whitespace, uppercase.
2. Prepend `+` if expression does not start with `-`.
3. Split on `+` or `-` delimiters, keeping the sign with each token.
4. Parse each token as either `NdX` (dice) or `N` (flat integer).
5. Validate: count 1–100, sides 2–1000, flat value ≤ 10000.
6. Return `null` if any token fails to parse.

**Valid examples:**
- `1d20` → `[{kind:"dice", sign:1, count:1, sides:20}]`
- `3d6+5` → `[{kind:"dice", sign:1, count:3, sides:6}, {kind:"flat", sign:1, value:5}]`
- `5d20+1d4-1d4+5` → 4 terms
- `d20` → count defaults to 1
- `-3` as a standalone expression → `null` (must have at least one dice term)

**Invalid → `null`:** empty string, no dice term, `0d6`, `d0`, counts > 100.

### `rollCompound(terms: RollTerm[]): { result: number; breakdown: string; termResults: TermResult[] }`

Rolls each dice term and sums all contributions.

**breakdown format:** `[15, 3, 18, 1, 20] + [2] - [3] + 5`
- Dice groups → bracketed list of individual rolls, preceded by ` + ` or ` - `.
- Flat modifiers → bare number preceded by ` + ` or ` - `.
- Leading positive term has no prefix.

**Example:** `5d20+1d4-1d4+5` might produce:
```
[15, 3, 18, 1, 20] + [2] - [3] + 5   →   result: 61
```

### `formatCompoundExpression(terms: RollTerm[]): string`

Returns a canonical string like `5d20+1d4-1d4+5`. Used to normalize user input for display in the log.

### `QUICK_DICE` — unchanged.

Old functions `parseDiceExpression`, `rollDice`, `formatExpression` are **removed** (only used in `DiceRoller.tsx`).

---

## Natural Max / Natural Min Detection

After `rollCompound`, scan `termResults` for dice terms where `count === 1`:
- **Nat max candidate:** `rolls[0] === term.sides`
- **Nat min candidate:** `rolls[0] === 1`

If multiple candidates qualify, pick the highest-sided die (most dramatic). Show at most one callout at a time, with nat max taking priority over nat min.

This preserves the existing behaviour for `1d20` and `1d20+5`, and extends naturally to `1d20+1d4`.

---

## `DiceRoller.tsx` Changes

- Replace `parseDiceExpression` → `parseCompoundExpression`.
- Replace `rollDice` + `formatExpression` → `rollCompound` + `formatCompoundExpression`.
- `lastResult` shape change:
  ```ts
  // before
  { expression, result, breakdown, sides, count }
  // after
  { expression, result, breakdown, natMaxDie: number | null, natMinDie: number | null }
  ```
  where `natMaxDie` / `natMinDie` are the `sides` of the qualifying single-die term, or `null`.
- Nat max callout: `Natural {natMaxDie} ✨` (was hardcoded "Natural {sides}")
- Nat min callout: `Natural 1 💀` (unchanged).
- Input placeholder: `e.g. 5d20+1d4-2`
- Error hint: `Try: 2d6+3 or 1d20+1d4-2`
- Quick-roll buttons unchanged — they pass `1d${sides}` which is valid single-term compound syntax.

---

## Error Handling

- Bad expression → `parseCompoundExpression` returns `null` → `DiceRoller` shows inline error: `Can't parse "…". Try: 2d6+3 or 1d20+1d4-2`.
- Expressions with no dice term (e.g. just `5`) → `null` (must roll at least one die).
- Overflow guard: total term count ≤ 20 (prevents absurd inputs).

---

## Testing

Verify in `src/lib/dice.test.ts` (new file):

| Expression | Expected result shape |
|---|---|
| `1d20` | 1 term, result 1–20 |
| `3d6+5` | 2 terms, result 8–23 |
| `5d20+1d4-1d4+5` | 4 terms, result 6–105 |
| `d6` | count defaults to 1 |
| `1d20-5` | negative modifier |
| `invalid` | returns null |
| `0d6` | returns null |
| `5` (no dice) | returns null |
| nat max: `1d6` rolls 6 | natMaxDie = 6 |
| nat min: `1d6` rolls 1 | natMinDie = 6 |
| compound: `1d20+1d4`, d20=20 | natMaxDie = 20 |
