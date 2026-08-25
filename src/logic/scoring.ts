import type { CountChoice } from "../data/types";

export const SPEED_BONUS_MAX = 3;
export const SPEED_BONUS_WINDOW_MS = 15000;

export function speedBonusFor(elapsedMs: number): number {
  if (elapsedMs <= 0) return SPEED_BONUS_MAX;
  const fraction = 1 - Math.min(elapsedMs / SPEED_BONUS_WINDOW_MS, 1);
  return Math.round(SPEED_BONUS_MAX * fraction);
}

export function isNewHighScore(score: number, best: number | undefined): boolean {
  return best === undefined || score > best;
}

export function countKey(count: CountChoice): string | null {
  if (count === "endless") return null;
  return String(count);
}
