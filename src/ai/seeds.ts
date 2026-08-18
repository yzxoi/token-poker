/** Deterministic seed helpers for hand and decision randomness. */

/** Build a per-hand seed from a session counter + hand index. */
export function handSeed(sessionNonce: number, handIndex: number): number {
  let h = 2166136261;
  const s = `${sessionNonce}:${handIndex}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Per-decision seed: hand seed + street + seat. */
export function decisionSeed(
  handSeedValue: number,
  seat: number,
  street: string,
): number {
  let h = handSeedValue >>> 0;
  h ^= Math.imul(seat + 1, 2654435761);
  h ^= Math.imul(street.length + 1, 40503);
  return h >>> 0;
}
