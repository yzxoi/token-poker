/** Heuristic fallback policy used when the LLM decision is unavailable. */
import type { Card } from "../engine/cards";
import { evaluate } from "../engine/evaluate";
import type { GameSnapshot, PlayerAction } from "../engine/game";
import type { BotStyle } from "./roster";

export interface DecisionContext {
  snapshot: GameSnapshot;
  seat: number;
  style: BotStyle;
  /** Deterministic per-decision randomness seed. */
  seed: number;
}

const POSTFLOP_BASE: Record<number, number> = {
  0: 0.05, // high card
  1: 0.3, // pair (plus pair-rank and top-pair bonus below)
  2: 0.55, // two pair
  3: 0.72, // trips
  4: 0.82, // straight
  5: 0.86, // flush
  6: 0.92, // full house
  7: 0.97, // quads
  8: 1.0, // straight flush
};

/** Rough hand-strength score 0..1 for the current visible cards. */
export function handStrength(hole: Card[], community: Card[]): number {
  if (community.length < 3) {
    // Preflop: simple pair / high-card scoring.
    const [a, b] = hole;
    if (a.rank === b.rank) return 0.75 + (a.rank - 2) / 52;
    const high = Math.max(a.rank, b.rank);
    const low = Math.min(a.rank, b.rank);
    if (a.suit === b.suit) return 0.3 + (high - 2) / 26;
    if (high === 14 && low >= 10) return 0.55 + (low - 10) / 26;
    return 0.2 + (high - 2) / 26;
  }
  const value = evaluate([...hole, ...community]);
  if (value.category === 1) {
    // Pair: distinguish top pair (pair rank >= highest board rank).
    const pairRank = value.tiebreakers[0];
    const boardHigh = Math.max(...community.map((c) => c.rank));
    const topPairBonus = pairRank >= boardHigh ? 0.12 : 0;
    const kicker = value.tiebreakers[1] ?? 0;
    return 0.3 + pairRank / 300 + topPairBonus + kicker / 600;
  }
  return POSTFLOP_BASE[value.category] + value.tiebreakers[0] / 300;
}

function seededRandom(seed: number): number {
  let state = seed >>> 0;
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  return (state >>> 0) / 0xffffffff;
}

const TIGHTNESS: Record<BotStyle["aggression"], number> = {
  tight: 0.15,
  passive: 0.1,
  balanced: 0.05,
  aggressive: 0,
  maniac: -0.05,
};

/** Strong-hand threshold: top pair with a good kicker or better raises. */
const STRONG_THRESHOLD = 0.42;
/** Marginal-hand threshold: playable but not strong. */
const MARGINAL_THRESHOLD = 0.28;

/**
 * Deterministic heuristic decision.
 * - Strong hand: raise (bet ~pot).
 * - Marginal: call/check, occasionally raise if aggressive.
 * - Weak: check/fold, occasionally bluff-raise if the style allows.
 */
export function decideFallback(ctx: DecisionContext): PlayerAction {
  const { snapshot, seat, style } = ctx;
  const player = snapshot.players.find((p) => p.seat === seat)!;
  const toCall = Math.min(snapshot.toCall - player.contributed, player.stack);
  const strength = handStrength(
    player.holeCards ?? [],
    snapshot.communityCards,
  );
  const rand = seededRandom(ctx.seed);

  // Fold threshold scales with how much it costs to continue.
  const foldThreshold =
    0.18 +
    (toCall / Math.max(snapshot.pot, 1)) * 0.35 -
    TIGHTNESS[style.aggression];

  if (strength >= STRONG_THRESHOLD) {
    // Strong: raise ~pot, or all-in if pot-sized bet exceeds stack.
    const raiseAmount = Math.min(
      player.stack,
      Math.max(snapshot.pot, snapshot.toCall * 2),
    );
    if (toCall > 0 && raiseAmount <= toCall && player.stack > toCall) {
      return { action: "call" };
    }
    if (raiseAmount >= player.stack) return { action: "allIn" };
    if (raiseAmount > 0 && player.contributed + raiseAmount < snapshot.toCall) {
      return { action: "call" };
    }
    return { action: "bet", amount: Math.max(raiseAmount, snapshot.toCall) };
  }

  if (strength >= MARGINAL_THRESHOLD) {
    // Marginal: mostly call/check, aggressive styles raise sometimes.
    const raiseProb = style.raiseBias * 0.4;
    if (rand < raiseProb) {
      const amount = Math.min(player.stack, Math.round(snapshot.pot * 0.6));
      if (amount > toCall) return { action: "bet", amount };
    }
    return toCall > 0 ? { action: "call" } : { action: "check" };
  }

  if (strength >= foldThreshold) {
    // Weak but cheap to continue: check/call small, fold to big.
    if (toCall <= 0) return { action: "check" };
    if (toCall <= snapshot.pot * 0.15 && strength >= 0.2) {
      return { action: "call" };
    }
    if (rand < style.bluffBias && player.stack > snapshot.pot) {
      // Bluff-raise.
      const amount = Math.min(player.stack, Math.round(snapshot.pot * 0.8));
      if (amount > toCall) return { action: "bet", amount };
    }
    return { action: "fold" };
  }

  // Very weak: fold unless free to check.
  if (toCall <= 0) return { action: "check" };
  return { action: "fold" };
}
