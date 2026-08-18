import { describe, expect, test } from "bun:test";
import { Game } from "../src/engine/game";

function makeGame(overrides?: {
  stacks?: number[];
  seed?: number;
  dealer?: number;
}) {
  const stacks = overrides?.stacks ?? [
    100_000, 100_000, 100_000, 100_000, 100_000, 100_000,
  ];
  const players = stacks.map((stack, seat) => ({
    seat,
    name: `P${seat}`,
    stack,
    isBot: seat !== 0,
  }));
  return new Game({
    config: {
      seats: 6,
      smallBlind: 500,
      bigBlind: 1000,
      startingStack: 100_000,
    },
    dealerSeat: overrides?.dealer ?? 4,
    players,
    seed: overrides?.seed ?? 42,
  });
}

/** Fold the current-turn player repeatedly until the hand ends. */
function foldUntilEnd(game: Game): void {
  let safety = 0;
  while (game.snapshot().status !== "handEnded" && safety < 10) {
    const seat = game.snapshot().currentTurn!;
    game.applyAction(seat, { action: "fold" });
    safety++;
  }
}

/** Drive the game: call when facing a bet, otherwise check, until status changes or safety. */
function callOrCheckUntil(game: Game, stopStatus: string, safety = 60): void {
  let n = 0;
  while (game.snapshot().status !== stopStatus && n < safety) {
    const s = game.snapshot();
    const seat = s.currentTurn!;
    const player = s.players[seat];
    const toCall = Math.min(s.toCall - player.contributed, player.stack);
    game.applyAction(
      seat,
      toCall > 0 ? { action: "call" } : { action: "check" },
    );
    n++;
  }
}

describe("Game state machine", () => {
  test("startHand posts blinds and deals", () => {
    const game = makeGame();
    const events = game.startHand();
    const snap = game.snapshot();
    expect(
      events.some((e) => e.kind === "streetChanged" && e.status === "preflop"),
    ).toBe(true);
    expect(snap.status).toBe("preflop");
    expect(snap.pot).toBe(1500);
    expect(snap.players[0].holeCards?.length).toBe(2);
    // dealer seat 4 → SB=5, BB=0
    expect(snap.players[5].stack).toBe(99_500);
    expect(snap.players[0].stack).toBe(99_000);
  });

  test("preflop: BB left acts first (dealer 4, UTG = seat 1)", () => {
    const game = makeGame();
    game.startHand();
    expect(game.snapshot().currentTurn).toBe(1);
  });

  test("fold everyone to one player ends hand", () => {
    const game = makeGame();
    game.startHand();
    foldUntilEnd(game);
    const final = game.snapshot();
    expect(final.status).toBe("handEnded");
    const survivors = final.players.filter((p) => !p.folded);
    expect(survivors.length).toBe(1);
    // Winner receives the full pot
    const result = game.getLastResult()!;
    expect(result.winnerSeats.length).toBe(1);
    expect(result.winningAmounts[0]).toBe(final.pot);
  });

  test("preflop call round completes and deals flop", () => {
    const game = makeGame();
    game.startHand();
    callOrCheckUntil(game, "flop");
    const snap = game.snapshot();
    expect(snap.status).toBe("flop");
    expect(snap.communityCards.length).toBe(3);
    expect(snap.pot).toBe(6000); // 6 * 1000
  });

  test("raise reopens action and min-raise enforced", () => {
    const game = makeGame();
    game.startHand();
    // seat 1 raises to 3000 (raise 2000 over BB 1000)
    game.applyAction(1, { action: "bet", amount: 3000 });
    let snap = game.snapshot();
    expect(snap.toCall).toBe(3000);
    expect(snap.minRaise).toBe(2000);
    // seat 2 tries min raise of 4000 total → raise 1000 < 2000 → rejected
    expect(() => game.applyAction(2, { action: "bet", amount: 4000 })).toThrow(
      /最小加注/,
    );
    // seat 2 re-raises to 5000 (raise 2000) → OK
    game.applyAction(2, { action: "bet", amount: 5000 });
    snap = game.snapshot();
    expect(snap.toCall).toBe(5000);
    expect(snap.minRaise).toBe(2000);
  });

  test("all-in short stack runs out board and settles", () => {
    const game = makeGame({
      stacks: [100_000, 100_000, 100_000, 100_000, 100_000, 5_000],
    });
    game.startHand();
    // Seat 5 (SB) has 5000 total: post 500 SB, then all-in the rest on its turn.
    let safety = 0;
    while (game.snapshot().status === "preflop" && safety < 20) {
      const s = game.snapshot();
      const seat = s.currentTurn!;
      if (seat === 5) {
        game.applyAction(seat, { action: "allIn" });
      } else {
        const player = s.players[seat];
        const toCall = Math.min(s.toCall - player.contributed, player.stack);
        game.applyAction(
          seat,
          toCall > 0 ? { action: "call" } : { action: "check" },
        );
      }
      safety++;
    }
    // Remaining players: call/check to the end (engine runs out the board).
    callOrCheckUntil(game, "handEnded");
    const snap = game.snapshot();
    expect(snap.status).toBe("handEnded");
    expect(snap.communityCards.length).toBe(5);
    for (const p of snap.players) {
      expect(p.stack).toBeGreaterThanOrEqual(0);
    }
    const result = game.getLastResult()!;
    expect(result.potSplits.length).toBeGreaterThan(0);
    // Every contributed chip is returned to some stack.
    const totalWon = result.potSplits.reduce((a, s) => a + s.amount, 0);
    expect(totalWon).toBe(snap.pot);
  });

  test("check/check to river then showdown", () => {
    const game = makeGame();
    game.startHand();
    callOrCheckUntil(game, "flop");
    callOrCheckUntil(game, "turn");
    callOrCheckUntil(game, "river");
    callOrCheckUntil(game, "handEnded");
    const snap = game.snapshot();
    expect(snap.status).toBe("handEnded");
    expect(snap.communityCards.length).toBe(5);
    const result = game.getLastResult()!;
    expect(result.showdown?.length).toBeGreaterThanOrEqual(2);
    // Total pot distributed: 6*1000 = 6000
    expect(result.potSplits.reduce((a, s) => a + s.amount, 0)).toBe(6000);
  });

  test("illegal action outside turn rejected", () => {
    const game = makeGame();
    game.startHand();
    const actor = game.snapshot().currentTurn!;
    const other = actor === 0 ? 1 : 0;
    expect(() => game.applyAction(other, { action: "fold" })).toThrow(/不是/);
  });

  test("fold after hand ended rejected", () => {
    const game = makeGame();
    game.startHand();
    foldUntilEnd(game);
    expect(game.snapshot().status).toBe("handEnded");
    expect(() => game.applyAction(0, { action: "fold" })).toThrow(/未开始/);
  });
});
