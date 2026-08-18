import { describe, expect, test } from "bun:test";
import { splitPots } from "../src/engine/pots";

describe("splitPots", () => {
  test("single winner takes everything", () => {
    const splits = splitPots(
      [
        { seat: 0, amount: 1000 },
        { seat: 1, amount: 1000 },
        { seat: 2, amount: 1000 },
      ],
      () => [1],
    );
    expect(splits).toEqual([{ seat: 1, amount: 3000 }]);
  });

  test("side pot: short stack all-in", () => {
    // seat 0 all-in 500, seats 1/2 each 1000.
    const splits = splitPots(
      [
        { seat: 0, amount: 500 },
        { seat: 1, amount: 1000 },
        { seat: 2, amount: 1000 },
      ],
      (candidates) => {
        // seat 0 wins main pot; seat 1 wins side pot
        if (
          candidates.includes(0) &&
          candidates.includes(1) &&
          candidates.includes(2)
        )
          return [0];
        return [1];
      },
    );
    expect(splits).toEqual([
      { seat: 0, amount: 1500 },
      { seat: 1, amount: 1000 },
    ]);
  });

  test("tie splits evenly", () => {
    const splits = splitPots(
      [
        { seat: 0, amount: 1000 },
        { seat: 1, amount: 1000 },
      ],
      () => [0, 1],
    );
    expect(splits).toEqual([
      { seat: 0, amount: 1000 },
      { seat: 1, amount: 1000 },
    ]);
  });

  test("multi-level side pots", () => {
    // seat 0: 300, seat 1: 600, seat 2: 1000
    const splits = splitPots(
      [
        { seat: 0, amount: 300 },
        { seat: 1, amount: 600 },
        { seat: 2, amount: 1000 },
      ],
      (candidates) => {
        // seat 2 beats everyone; among 0/1, seat 1 wins
        if (candidates.includes(2)) return [2];
        if (candidates.includes(1)) return [1];
        return [0];
      },
    );
    // level 300: 3*300=900 → seat 2
    // level 600: 2*300=600 → seat 2
    // level 1000: 1*400=400 → seat 2
    expect(splits).toEqual([{ seat: 2, amount: 1900 }]);
  });

  test("empty contributions", () => {
    expect(splitPots([], () => [])).toEqual([]);
  });
});
