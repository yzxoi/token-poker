import type { Card } from "./cards";

/** 0 = high card … 8 = straight flush; royal flush is an A-high straight flush. */
export type HandCategory = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export interface HandValue {
  category: HandCategory;
  /** Primary rank(s) then kickers, high to low. */
  tiebreakers: number[];
}

const CATEGORY_NAME: Record<HandCategory, string> = {
  0: "高牌",
  1: "一对",
  2: "两对",
  3: "三条",
  4: "顺子",
  5: "同花",
  6: "葫芦",
  7: "四条",
  8: "同花顺",
};

export function handName(value: HandValue): string {
  if (value.category === 8 && value.tiebreakers[0] === 14) return "皇家同花顺";
  return CATEGORY_NAME[value.category];
}

function uniqueSortedRanks(ranks: number[]): number[] {
  return [...new Set(ranks)].sort((a, b) => b - a);
}

/** Detect a straight from unique sorted ranks (high to low). Returns high card or null. */
function straightHigh(unique: number[]): number | null {
  if (unique.length < 5) return null;
  // Wheel: A-5-4-3-2 (A=14, straight high is 5).
  if (
    unique[0] === 14 &&
    unique.includes(5) &&
    unique.includes(4) &&
    unique.includes(3) &&
    unique.includes(2)
  ) {
    return 5;
  }
  for (let i = 0; i + 4 < unique.length; i++) {
    if (unique[i] - unique[i + 4] === 4) return unique[i];
  }
  return null;
}

/** Evaluate exactly 5 cards. */
export function evaluate5(cards: Card[]): HandValue {
  if (cards.length !== 5)
    throw new Error(`evaluate5 expects 5 cards, got ${cards.length}`);
  const ranks = cards.map((c) => c.rank);
  const counts = new Map<number, number>();
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1);
  const groups = [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || b[0] - a[0],
  );
  const unique = uniqueSortedRanks(ranks);
  const flush = cards.every((c) => c.suit === cards[0].suit);
  const straight = straightHigh(unique);

  if (flush && straight !== null) {
    // Royal flush is an A-high straight flush; both are category 8.
    return { category: 8, tiebreakers: [straight] };
  }
  if (groups[0][1] === 4) {
    return { category: 7, tiebreakers: [groups[0][0], groups[1][0]] };
  }
  if (groups[0][1] === 3 && groups[1][1] === 2) {
    return { category: 6, tiebreakers: [groups[0][0], groups[1][0]] };
  }
  if (flush) return { category: 5, tiebreakers: unique };
  if (straight !== null) return { category: 4, tiebreakers: [straight] };
  if (groups[0][1] === 3) {
    return {
      category: 3,
      tiebreakers: [groups[0][0], ...unique.filter((r) => r !== groups[0][0])],
    };
  }
  if (groups[0][1] === 2 && groups[1][1] === 2) {
    const pairHigh = [groups[0][0], groups[1][0]].sort((a, b) => b - a);
    const kicker = unique.find((r) => !pairHigh.includes(r))!;
    return { category: 2, tiebreakers: [...pairHigh, kicker] };
  }
  if (groups[0][1] === 2) {
    return {
      category: 1,
      tiebreakers: [groups[0][0], ...unique.filter((r) => r !== groups[0][0])],
    };
  }
  return { category: 0, tiebreakers: unique };
}

function compare(a: HandValue, b: HandValue): number {
  if (a.category !== b.category) return a.category - b.category;
  const n = Math.max(a.tiebreakers.length, b.tiebreakers.length);
  for (let i = 0; i < n; i++) {
    const x = a.tiebreakers[i] ?? 0;
    const y = b.tiebreakers[i] ?? 0;
    if (x !== y) return x - y;
  }
  return 0;
}

/** Evaluate 5–7 cards; picks the best 5-card hand. */
export function evaluate(cards: Card[]): HandValue {
  if (cards.length < 5 || cards.length > 7) {
    throw new Error(`evaluate expects 5-7 cards, got ${cards.length}`);
  }
  if (cards.length === 5) return evaluate5(cards);
  // Enumerate C(n,5) subsets and keep the best.
  let best: HandValue | null = null;
  const indices = [...Array(cards.length).keys()];
  const pick: number[] = [];
  const walk = (start: number) => {
    if (pick.length === 5) {
      const value = evaluate5(pick.map((i) => cards[i]));
      if (best === null || compare(value, best) > 0) best = value;
      return;
    }
    for (let i = start; i < indices.length; i++) {
      pick.push(i);
      walk(i + 1);
      pick.pop();
    }
  };
  walk(0);
  return best!;
}

/** Compare two evaluated hands: positive when a is better. */
export function compareHands(a: HandValue, b: HandValue): number {
  return compare(a, b);
}
