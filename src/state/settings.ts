import { clampOfficers, type QuizConfig } from "../data/types";

const STORAGE_KEY = "stf.settings.v1";

export interface Settings {
  lastConfig: QuizConfig | null;
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { lastConfig: null };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return { lastConfig: normalize(parsed.lastConfig ?? null) };
  } catch {
    return { lastConfig: null };
  }
}

/** A config stored before a field existed is missing it, and this is the only
 *  place that shape crosses back into the app. */
function normalize(config: QuizConfig | null): QuizConfig | null {
  if (!config) return null;
  return {
    ...config,
    hostPlays: config.hostPlays === true,
    officers: clampOfficers(config.officers),
  };
}

export function saveLastConfig(config: QuizConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ lastConfig: config }));
}
