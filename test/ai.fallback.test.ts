import { describe, expect, test } from "bun:test";
import { decideFallback, handStrength } from "../src/ai/fallback";
import { styleForSeat } from "../src/ai/roster";
import type { GameSnapshot } from "../src/engine/game";
import type { Card } from "../src/engine/cards";

function c(rank: number, suit: Card["suit"]): Card {
  return { rank: rank as Card["rank"], suit };
}

/** Board: 2s 7h 9d. Hole cards must not overlap the board. */
const BOARD: Card[] = [c(2, "s"), c(7, "h"), c(9, "d")];

function snapshot(overrides: Partial<GameSnapshot> = {}): GameSnapshot {
  return {
    handId: "h-test",
    status: "flop",
    dealerSeat: 4,
    communityCards: BOARD,
    pot: 3000,
    toCall: 0,
    minRaise: 1000,
    currentTurn: 1,
    lastAction: null,
    players: [
      {
        seat: 0,
        name: "你",
        stack: 90_000,
        holeCards: null,
        folded: false,
        allIn: false,
        contributed: 0,
        isBot: false,
      },
      {
        seat: 1,
        name: "Ada",
        stack: 90_000,
        holeCards: null,
        folded: false,
        allIn: false,
        contributed: 0,
        isBot: true,
        style: "Ada",
      },
      {
        seat: 2,
        name: "Grace",
        stack: 90_000,
        holeCards: null,
        folded: false,
        allIn: false,
        contributed: 0,
        isBot: true,
        style: "Grace",
      },
      {
        seat: 3,
        name: "Alan",
        stack: 90_000,
        holeCards: null,
        folded: false,
        allIn: false,
        contributed: 0,
        isBot: true,
        style: "Alan",
      },
      {
        seat: 4,
        name: "Katherine",
        stack: 90_000,
        holeCards: null,
        folded: false,
        allIn: false,
        contributed: 0,
        isBot: true,
        style: "Katherine",
      },
      {
        seat: 5,
        name: "Edsger",
        stack: 90_000,
        holeCards: null,
        folded: false,
        allIn: false,
        contributed: 0,
        isBot: true,
        style: "Edsger",
      },
    ],
    lastResult: null,
    ...overrides,
  };
}

function withHole(
  snap: GameSnapshot,
  seat: number,
  hole: Card[],
): GameSnapshot {
  return {
    ...snap,
    players: snap.players.map((p) =>
      p.seat === seat ? { ...p, holeCards: hole } : p,
    ),
  };
}

describe("handStrength", () => {
  test("preflop pair is strong", () => {
    expect(handStrength([c(14, "s"), c(14, "h")], [])).toBeGreaterThan(0.7);
  });

  test("preflop junk is weak", () => {
    expect(handStrength([c(2, "s"), c(7, "h")], [])).toBeLessThan(0.4);
  });

  test("postflop trips is strong", () => {
    expect(handStrength([c(9, "s"), c(9, "h")], BOARD)).toBeGreaterThan(0.6);
  });

  test("postflop top pair with A kicker is strong", () => {
    // Board 9d is the highest card; hole 9s + Ac makes top pair with A kicker.
    expect(handStrength([c(9, "s"), c(14, "c")], BOARD)).toBeGreaterThan(0.42);
  });

  test("postflop bottom pair is marginal, not strong", () => {
    // Board 2s pairs with hole 2h; bottom pair + A kicker.
    const s = handStrength([c(2, "h"), c(14, "c")], BOARD);
    expect(s).toBeGreaterThan(0.28);
    expect(s).toBeLessThan(0.42);
  });

  test("postflop junk is weak", () => {
    expect(handStrength([c(3, "c"), c(8, "d")], BOARD)).toBeLessThan(0.2);
  });
});

describe("decideFallback", () => {
  test("strong hand raises", () => {
    const snap = withHole(snapshot({ currentTurn: 1, toCall: 0 }), 1, [
      c(9, "s"),
      c(9, "h"),
    ]);
    const action = decideFallback({
      snapshot: snap,
      seat: 1,
      style: styleForSeat(1),
      seed: 1,
    });
    expect(["bet", "allIn"]).toContain(action.action);
  });

  test("free check when no bet and weak", () => {
    const snap = withHole(snapshot({ currentTurn: 1, toCall: 0 }), 1, [
      c(3, "c"),
      c(8, "d"),
    ]);
    const action = decideFallback({
      snapshot: snap,
      seat: 1,
      style: styleForSeat(1),
      seed: 2,
    });
    expect(action.action).toBe("check");
  });

  test("big bet with weak hand folds", () => {
    const snap = withHole(
      snapshot({ currentTurn: 1, toCall: 30_000, pot: 10_000 }),
      1,
      [c(3, "c"), c(8, "d")],
    );
    const action = decideFallback({
      snapshot: snap,
      seat: 1,
      style: styleForSeat(1),
      seed: 3,
    });
    expect(action.action).toBe("fold");
  });

  test("marginal hand calls a small bet", () => {
    // Middle pair (7s on a 7h board) with 8 kicker: marginal, cheap to call.
    const snap = withHole(
      snapshot({ currentTurn: 1, toCall: 500, pot: 5000 }),
      1,
      [c(7, "s"), c(8, "d")],
    );
    const action = decideFallback({
      snapshot: snap,
      seat: 1,
      style: styleForSeat(1),
      seed: 4,
    });
    expect(["call", "bet"]).toContain(action.action);
  });

  test("deterministic with same seed", () => {
    const snap = withHole(snapshot({ currentTurn: 1, toCall: 0 }), 1, [
      c(9, "s"),
      c(9, "h"),
    ]);
    const a = decideFallback({
      snapshot: snap,
      seat: 1,
      style: styleForSeat(1),
      seed: 42,
    });
    const b = decideFallback({
      snapshot: snap,
      seat: 1,
      style: styleForSeat(1),
      seed: 42,
    });
    expect(a).toEqual(b);
  });
});
