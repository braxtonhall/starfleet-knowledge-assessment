/**
 * Ordering for the final leaderboard.
 *
 * It lives here rather than inside the roster because the same table is now
 * drawn in two places — the host display and, when the host has taken a seat
 * (spec §5.10), every player device. Two copies of the sort would eventually
 * disagree about who won, on screens sitting next to each other.
 */

export interface Scored {
  name: string;
  score: number;
}

/** Highest first, ties broken by name so the order is stable across renders
 *  and identical on every device that draws it. */
export function rankScored<T extends Scored>(entries: readonly T[]): T[] {
  return [...entries].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

/**
 * Everyone tied at the top. More than one means the drill ended in a dead heat;
 * an empty roster has no leader at all. A room where nobody scored still has
 * leaders — a zero-all draw is a result, not an absence of one.
 */
export function leadersOf<T extends Scored>(entries: readonly T[]): T[] {
  if (entries.length === 0) return [];
  let top = -Infinity;
  for (const entry of entries) top = Math.max(top, entry.score);
  return rankScored(entries.filter((entry) => entry.score === top));
}
