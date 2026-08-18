/** Robust JSON extraction/validation for LLM poker decisions. */
import type { PlayerAction } from "../engine/game";

export interface ParsedDecision {
  action: PlayerAction;
  /** Optional short rationale from the model (for logs/debug). */
  rationale?: string;
}

/** Extract the first balanced JSON object from a possibly noisy LLM response. */
export function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  // Strip markdown code fences.
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : trimmed;
  const start = candidate.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < candidate.length; i++) {
    const ch = candidate[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (inString) {
      if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(candidate.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/** Validate a parsed object into a legal poker action. */
export function parseDecision(input: unknown): ParsedDecision | null {
  if (typeof input !== "object" || input === null) return null;
  const obj = input as Record<string, unknown>;
  const action = obj.action;
  if (typeof action !== "string") return null;
  const amount = obj.amount;
  switch (action) {
    case "fold":
    case "check":
      return { action: { action } };
    case "call":
      return { action: { action } };
    case "allIn":
      return { action: { action: "allIn" } };
    case "bet":
    case "raise": {
      const n =
        typeof amount === "number"
          ? amount
          : typeof amount === "string"
            ? Number(amount)
            : NaN;
      if (!Number.isFinite(n) || n <= 0) return null;
      return {
        action: { action: "bet", amount: Math.floor(n) },
        rationale:
          typeof obj.rationale === "string" ? obj.rationale : undefined,
      };
    }
    default:
      return null;
  }
}

/** Full pipeline: extract + validate, tolerant of prose around JSON. */
export function parseDecisionText(text: string): ParsedDecision | null {
  const extracted = extractJsonObject(text);
  if (extracted === null) return null;
  return parseDecision(extracted);
}
