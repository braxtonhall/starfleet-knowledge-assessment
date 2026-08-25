import type { Question } from "../data/types";

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function searchQuestions(query: string, questions: Question[]): Question[] {
  const needle = normalize(query);
  if (!needle) return [];

  const scored: Array<{ question: Question; score: number }> = [];
  for (const question of questions) {
    const score = subsequenceScore(needle, normalize(question.question));
    if (score >= 0) scored.push({ question, score });
  }

  scored.sort((a, b) => b.score - a.score || a.question.number - b.question.number);
  return scored.map((entry) => entry.question);
}

function subsequenceScore(needle: string, haystack: string): number {
  let score = 0;
  let needleIndex = 0;
  let previousMatch = -2;

  for (let i = 0; i < haystack.length && needleIndex < needle.length; i += 1) {
    if (haystack[i] !== needle[needleIndex]) continue;

    const atWordStart = i === 0 || haystack[i - 1] === " ";
    if (atWordStart) score += 5;
    else if (i === previousMatch + 1) score += 3;
    else score += 1;

    previousMatch = i;
    needleIndex += 1;
  }

  return needleIndex === needle.length ? score : -1;
}
