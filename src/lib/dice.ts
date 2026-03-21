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
