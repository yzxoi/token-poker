import { describe, expect, test } from "bun:test";
import { evaluate, compareHands, handName } from "../src/engine/evaluate";
import type { Card } from "../src/engine/cards";

function c(rank: number, suit: Card["suit"]): Card {
  return { rank: rank as Card["rank"], suit };
}

describe("evaluate", () => {
  test("high card", () => {
    const v = evaluate([
      c(2, "s"),
      c(7, "h"),
      c(9, "d"),
      c(11, "c"),
      c(14, "s"),
    ]);
    expect(v.category).toBe(0);
    expect(v.tiebreakers).toEqual([14, 11, 9, 7, 2]);
    expect(handName(v)).toBe("高牌");
  });

  test("pair", () => {
    const v = evaluate([
      c(9, "s"),
      c(9, "h"),
      c(2, "d"),
      c(7, "c"),
      c(14, "s"),
    ]);
    expect(v.category).toBe(1);
    expect(v.tiebreakers).toEqual([9, 14, 7, 2]);
  });

  test("two pair", () => {
    const v = evaluate([
      c(9, "s"),
      c(9, "h"),
      c(2, "d"),
      c(2, "c"),
      c(14, "s"),
    ]);
    expect(v.category).toBe(2);
    expect(v.tiebreakers).toEqual([9, 2, 14]);
  });

  test("three of a kind", () => {
    const v = evaluate([
      c(5, "s"),
      c(5, "h"),
      c(5, "d"),
      c(7, "c"),
      c(14, "s"),
    ]);
    expect(v.category).toBe(3);
    expect(v.tiebreakers).toEqual([5, 14, 7]);
  });

  test("straight", () => {
    const v = evaluate([c(5, "s"), c(6, "h"), c(7, "d"), c(8, "c"), c(9, "s")]);
    expect(v.category).toBe(4);
    expect(v.tiebreakers).toEqual([9]);
  });

  test("wheel straight (A-5)", () => {
    const v = evaluate([
      c(14, "s"),
      c(2, "h"),
      c(3, "d"),
      c(4, "c"),
      c(5, "s"),
    ]);
    expect(v.category).toBe(4);
    expect(v.tiebreakers).toEqual([5]);
  });

  test("flush", () => {
    const v = evaluate([
      c(2, "s"),
      c(7, "s"),
      c(9, "s"),
      c(11, "s"),
      c(14, "s"),
    ]);
    expect(v.category).toBe(5);
    expect(v.tiebreakers).toEqual([14, 11, 9, 7, 2]);
  });

  test("full house", () => {
    const v = evaluate([c(9, "s"), c(9, "h"), c(9, "d"), c(2, "c"), c(2, "s")]);
    expect(v.category).toBe(6);
    expect(v.tiebreakers).toEqual([9, 2]);
  });

  test("four of a kind", () => {
    const v = evaluate([
      c(7, "s"),
      c(7, "h"),
      c(7, "d"),
      c(7, "c"),
      c(14, "s"),
    ]);
    expect(v.category).toBe(7);
    expect(v.tiebreakers).toEqual([7, 14]);
  });

  test("straight flush", () => {
    const v = evaluate([c(5, "h"), c(6, "h"), c(7, "h"), c(8, "h"), c(9, "h")]);
    expect(v.category).toBe(8);
    expect(handName(v)).toBe("同花顺");
  });

  test("royal flush", () => {
    const v = evaluate([
      c(10, "d"),
      c(11, "d"),
      c(12, "d"),
      c(13, "d"),
      c(14, "d"),
    ]);
    expect(v.category).toBe(8);
    expect(v.tiebreakers).toEqual([14]);
    expect(handName(v)).toBe("皇家同花顺");
  });

  test("best 5 of 7", () => {
    // Board pairs + hole pair → four of a kind 9s
    const v = evaluate([
      c(9, "s"),
      c(9, "h"), // hole
      c(9, "d"),
      c(9, "c"),
      c(2, "s"),
      c(7, "h"),
      c(14, "d"), // board
    ]);
    expect(v.category).toBe(7);
    expect(v.tiebreakers[0]).toBe(9);
  });

  test("compare hands", () => {
    const pair = evaluate([
      c(9, "s"),
      c(9, "h"),
      c(2, "d"),
      c(7, "c"),
      c(14, "s"),
    ]);
    const high = evaluate([
      c(2, "s"),
      c(7, "h"),
      c(9, "d"),
      c(11, "c"),
      c(14, "s"),
    ]);
    const pairKicker = evaluate([
      c(9, "s"),
      c(9, "h"),
      c(2, "d"),
      c(7, "c"),
      c(13, "s"),
    ]);
    expect(compareHands(pair, high)).toBeGreaterThan(0);
    expect(compareHands(high, pair)).toBeLessThan(0);
    // A kicker beats K kicker
    expect(compareHands(pair, pairKicker)).toBeGreaterThan(0);
    expect(compareHands(pairKicker, pair)).toBeLessThan(0);
    expect(compareHands(pair, pair)).toBe(0);
  });
});
