import type { QuestionState } from "../data/types";

const STORAGE_KEY = "stf.answerLog.v1";

export type AnswerLog = Map<number, QuestionState>;

export function loadAnswerLog(): AnswerLog {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Map();
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const log = new Map<number, QuestionState>();
    for (const [key, value] of Object.entries(parsed)) {
      if (value === "correct" || value === "incorrect") {
        log.set(Number(key), value);
      }
    }
    return log;
  } catch {
    return new Map();
  }
}

export function saveAnswerLog(log: AnswerLog): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(log)));
}

export function answerFor(log: AnswerLog, number: number): QuestionState {
  return log.get(number) ?? "unanswered";
}

export function setAnswer(log: AnswerLog, number: number, state: QuestionState): void {
  if (state === "unanswered") {
    log.delete(number);
  } else {
    log.set(number, state);
  }
  saveAnswerLog(log);
}

export function countsFor(
  log: AnswerLog,
  numbers: number[],
): { correct: number; incorrect: number; unanswered: number } {
  let correct = 0;
  let incorrect = 0;
  let unanswered = 0;
  for (const number of numbers) {
    const state = answerFor(log, number);
    if (state === "correct") correct += 1;
    else if (state === "incorrect") incorrect += 1;
    else unanswered += 1;
  }
  return { correct, incorrect, unanswered };
}

export function resetAll(log: AnswerLog): void {
  log.clear();
  saveAnswerLog(log);
}

export function resetNumbers(log: AnswerLog, numbers: number[]): void {
  for (const number of numbers) {
    log.delete(number);
  }
  saveAnswerLog(log);
}
