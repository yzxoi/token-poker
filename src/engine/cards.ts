/** Playing card primitives for token-poker. */

export const SUITS = ["s", "h", "d", "c"] as const;
export type Suit = (typeof SUITS)[number];

/** 2..14 where 11=J, 12=Q, 13=K, 14=A. */
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;

export interface Card {
  rank: Rank;
  suit: Suit;
}

export const RANK_CHARS: Record<Rank, string> = {
  2: "2",
  3: "3",
  4: "4",
  5: "5",
  6: "6",
  7: "7",
  8: "8",
  9: "9",
  10: "T",
  11: "J",
  12: "Q",
  13: "K",
  14: "A",
};

export const SUIT_CHARS: Record<Suit, string> = {
  s: "♠",
  h: "♥",
  d: "♦",
  c: "♣",
};

export function cardChar(card: Card): string {
  return `${RANK_CHARS[card.rank]}${SUIT_CHARS[card.suit]}`;
}

/** Deterministic Fisher-Yates shuffle. */
export function shuffle(seed: number): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (let rank = 2; rank <= 14; rank++) {
      deck.push({ rank: rank as Rank, suit });
    }
  }
  let state = seed >>> 0;
  const next = () => {
    // xorshift32
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0xffffffff;
  };
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

/** Build a fresh deterministic deck (used for tests and replayable hands). */
export function freshDeck(seed: number): Card[] {
  return shuffle(seed);
}
