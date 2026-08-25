import type { Question } from "./types";
import { OPTION_LETTERS } from "./types";

const QUESTION_URL = `${import.meta.env.BASE_URL}questions.json`;

export interface LoadReport {
  total: number;
  playable: number;
  missingAnswer: number;
}

export async function loadQuestions(): Promise<Question[]> {
  const response = await fetch(QUESTION_URL);
  if (!response.ok) {
    throw new Error(`Unable to access question data (status ${response.status})`);
  }
  const raw = (await response.json()) as unknown;
  if (!Array.isArray(raw)) {
    throw new Error("Question data is not a list");
  }
  return raw.filter(isValidQuestion);
}

export function isValidQuestion(value: unknown): value is Question {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.number === "number" &&
    typeof record.question === "string" &&
    typeof record.chapter_title === "string" &&
    typeof record.options === "object" &&
    record.options !== null
  );
}

export function indexByNumber(questions: Question[]): Map<number, Question> {
  const index = new Map<number, Question>();
  for (const question of questions) {
    index.set(question.number, question);
  }
  return index;
}

export function hasFullOptions(question: Question): boolean {
  return OPTION_LETTERS.every((letter) => typeof question.options[letter] === "string");
}

export function playablePool(questions: Question[]): Question[] {
  return questions.filter((q) => hasFullOptions(q) && q.answer !== null);
}

export function loadReport(questions: Question[]): LoadReport {
  const playable = playablePool(questions);
  return {
    total: questions.length,
    playable: playable.length,
    missingAnswer: questions.length - playable.length,
  };
}

export function optionFor(question: Question, letter: string): string {
  return question.options[letter] ?? "";
}

export function answerText(question: Question): string {
  if (!question.answer) return "";
  return optionFor(question, question.answer) || question.answer_text || "";
}
