/** Chip/amount formatting for the table UI. */

/** Format chips like the Earn Tokens mock: 106M / 35.8M / 2.13M / 561K. */
export function formatChips(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) {
    const v = abs / 1_000_000;
    return `${sign}${v >= 100 ? Math.round(v) : v.toFixed(v >= 10 ? 1 : 2)}M`;
  }
  if (abs >= 1_000) {
    const v = abs / 1_000;
    return `${sign}${v >= 100 ? Math.round(v) : v.toFixed(v >= 10 ? 1 : 1)}K`;
  }
  return `${sign}${abs}`;
}

/** Compact integer with locale separators (for tooltips/aria). */
export function formatExact(n: number): string {
  return n.toLocaleString("en-US");
}
