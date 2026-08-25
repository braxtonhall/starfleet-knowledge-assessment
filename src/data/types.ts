export type QuestionState = "unanswered" | "correct" | "incorrect";

export interface Question {
  number: number;
  chapter: number;
  chapter_title: string;
  series: string;
  question: string;
  options: Record<string, string>;
  answer: string | null;
  answer_text: string | null;
  feature_text: string | null;
  page: number;
  scanned_number: number | null;
  ocr_confidence: number | null;
  flags: string[];
}

export interface Category {
  title: string;
  chapter: number;
  questions: Question[];
}

export type CountChoice = 10 | 20 | 50 | "all" | "endless";

/**
 * Duty Rotation crew size. Capped well below `MAX_PLAYERS` on purpose: sixteen
 * people passing one phone is a queue, not a game.
 */
export const MIN_OFFICERS = 2;
export const MAX_OFFICERS = 8;

export interface QuizConfig {
  count: CountChoice;
  timerOn: boolean;
  timerSeconds: number;
  speedBonus: boolean;
  featuresOn: boolean;
  categories: string[];
  /** Multiplayer only (spec §5.10): the host takes a seat and answers too.
   *  Solo reads the rest of this object and ignores this field. */
  hostPlays: boolean;
  /** Duty Rotation only (spec §5.11): how many officers pass the terminal
   *  around. Every other mode reads the rest of this object and ignores it. */
  officers: number;
}

export function defaultConfig(categories: string[]): QuizConfig {
  return {
    count: 10,
    timerOn: false,
    timerSeconds: 20,
    speedBonus: false,
    featuresOn: false,
    categories: [...categories],
    hostPlays: false,
    officers: MIN_OFFICERS,
  };
}

export function clampOfficers(value: unknown): number {
  const count = Math.round(Number(value));
  if (!Number.isFinite(count)) return MIN_OFFICERS;
  return Math.min(MAX_OFFICERS, Math.max(MIN_OFFICERS, count));
}

export interface MissedItem {
  number: number;
  question: string;
  chosen: string | null;
  skipped: boolean;
}

/**
 * One line of an end-of-drill review. Deliberately question-only: an answer is
 * shown exactly once, in the reveal beat right after the attempt, and a list you
 * can sit and read afterwards is exactly what that rule excludes. `chosen` is
 * carried only to mark the items that were never answered at all.
 *
 * It describes a recap line rather than a wire format, which is why it lives
 * here: `net/protocol` sends it, and Duty Rotation — which never opens a
 * channel — builds it too.
 */
export interface RecapItem {
  number: number;
  question: string;
  chosen: string | null;
}

export interface RunResult {
  correct: number;
  total: number;
  bonus: number;
  score: number;
  missed: MissedItem[];
}

export const OPTION_LETTERS = ["A", "B", "C", "D"] as const;
