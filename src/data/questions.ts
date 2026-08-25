import type { Question } from "./types";
import { OPTION_LETTERS } from "./types";

const QUESTION_URL = `${import.meta.env.BASE_URL}questions.json.enc`;

export interface LoadReport {
  total: number;
  playable: number;
  missingAnswer: number;
}

export async function loadQuestions(password: string): Promise<Question[]> {
  const response = await fetch(QUESTION_URL);
  if (!response.ok) {
    throw new Error(`Unable to access question data (status ${response.status})`);
  }
  const encrypted = new Uint8Array(await response.arrayBuffer());
  const raw = (await decrypt(encrypted, password)) as unknown;
  if (!Array.isArray(raw)) {
    throw new Error("Question data is not a list");
  }
  return raw.filter(isValidQuestion);
}

async function decrypt(bytes: Uint8Array, password: string): Promise<unknown> {
  if (bytes.length < 29) throw new Error("Question data is truncated");
  const salt = bytes.slice(0, 16);
  const iv = bytes.slice(16, 28);
  const ciphertext = bytes.slice(28);
  const enc = new TextEncoder();
  const material = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return JSON.parse(new TextDecoder().decode(plaintext));
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
