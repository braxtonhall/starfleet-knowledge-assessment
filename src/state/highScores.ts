const STORAGE_KEY = "stf.highScores.v1";

export type HighScores = Record<string, number>;

export function loadHighScores(): HighScores {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const scores: HighScores = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "number") scores[key] = value;
    }
    return scores;
  } catch {
    return {};
  }
}

export function saveHighScores(scores: HighScores): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(scores));
}

export function bestForCount(scores: HighScores, key: string): number | undefined {
  return scores[key];
}

export function recordIfBetter(scores: HighScores, key: string, score: number): boolean {
  const best = scores[key];
  if (best === undefined || score > best) {
    scores[key] = score;
    saveHighScores(scores);
    return true;
  }
  return false;
}
