/** Side-pot splitting for all-in situations. Pure function, no game state. */

export interface PotContribution {
  seat: number;
  amount: number;
}

export interface PotSplit {
  seat: number;
  amount: number;
}

/**
 * Split contributed amounts into main/side pots and award each pot to the
 * best-ranked eligible player(s). `rankSeats` returns the winning seats among
 * the candidates (may include ties); it must not mutate input.
 */
export function splitPots(
  contributions: PotContribution[],
  rankSeats: (candidates: number[]) => number[],
): PotSplit[] {
  const active = contributions.filter((c) => c.amount > 0);
  if (active.length === 0) return [];
  const levels = [...new Set(active.map((c) => c.amount))].sort(
    (a, b) => a - b,
  );

  const awards: Map<number, number> = new Map();
  let prev = 0;
  for (const level of levels) {
    const layer = level - prev;
    const eligible = active.filter((c) => c.amount >= level);
    const potAmount = layer * eligible.length;
    if (potAmount > 0) {
      const winners = rankSeats(eligible.map((c) => c.seat));
      if (winners.length === 0) {
        // No winner (defensive): return the layer to contributors proportionally.
        const share = Math.floor(potAmount / eligible.length);
        for (const c of eligible)
          awards.set(c.seat, (awards.get(c.seat) ?? 0) + share);
      } else {
        const share = Math.floor(potAmount / winners.length);
        for (const w of winners) awards.set(w, (awards.get(w) ?? 0) + share);
      }
    }
    prev = level;
  }

  // Distribute any remainder (floor rounding) to winners of the top layer.
  const awarded = [...awards.values()].reduce((a, b) => a + b, 0);
  const total = active.reduce((a, c) => a + c.amount, 0);
  const remainder = total - awarded;
  if (remainder > 0 && active.length > 0) {
    const top = Math.max(...active.map((c) => c.amount));
    const topSeats = rankSeats(
      active.filter((c) => c.amount === top).map((c) => c.seat),
    );
    if (topSeats.length > 0) {
      const share = Math.floor(remainder / topSeats.length);
      for (const w of topSeats) awards.set(w, (awards.get(w) ?? 0) + share);
    }
  }

  return [...awards.entries()]
    .filter(([, amount]) => amount > 0)
    .map(([seat, amount]) => ({ seat, amount }));
}
