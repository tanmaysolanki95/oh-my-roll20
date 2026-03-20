import type { ParsedRoll } from "@/types";

// Parses expressions like: d20, 3d6, 2d8+5, 1d20-2, d100
const DICE_RE = /^(\d*)d(\d+)([+-]\d+)?$/i;

export function parseDiceExpression(expr: string): ParsedRoll | null {
  const trimmed = expr.trim().replace(/\s/g, "");
  const match = trimmed.match(DICE_RE);
  if (!match) return null;

  const count = match[1] === "" ? 1 : parseInt(match[1], 10);
  const sides = parseInt(match[2], 10);
  const modifier = match[3] ? parseInt(match[3], 10) : 0;

  if (count < 1 || count > 100 || sides < 2 || sides > 1000) return null;

  return { count, sides, modifier };
}

export function rollDice(parsed: ParsedRoll): {
  result: number;
  rolls: number[];
  breakdown: string;
} {
  const rolls: number[] = [];
  for (let i = 0; i < parsed.count; i++) {
    rolls.push(Math.floor(Math.random() * parsed.sides) + 1);
  }
  const sum = rolls.reduce((a, b) => a + b, 0) + parsed.modifier;

  const rollStr = `[${rolls.join(", ")}]`;
  const modStr =
    parsed.modifier > 0
      ? ` + ${parsed.modifier}`
      : parsed.modifier < 0
        ? ` - ${Math.abs(parsed.modifier)}`
        : "";
  const breakdown = `${rollStr}${modStr}`;

  return { result: sum, rolls, breakdown };
}

export function formatExpression(parsed: ParsedRoll): string {
  const modStr =
    parsed.modifier > 0
      ? `+${parsed.modifier}`
      : parsed.modifier < 0
        ? `${parsed.modifier}`
        : "";
  return `${parsed.count}d${parsed.sides}${modStr}`;
}

export const QUICK_DICE = [4, 6, 8, 10, 12, 20, 100] as const;
