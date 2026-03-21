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
