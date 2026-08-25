import type { Question } from "../data/types";
import { hasFeatureText } from "./weighting";

export function filterByCategories(questions: Question[], selected: string[]): Question[] {
  const titles = new Set(selected);
  return questions.filter((question) => titles.has(question.chapter_title));
}

/**
 * The questions a run can actually draw from: the selected disciplines, minus
 * anything the current settings cannot present properly.
 *
 * Spec §5.9: a feature question's supplemental data is not decoration — several
 * of them do not read as complete questions without it. With SUPPLEMENTAL DATA
 * off there is nothing to show, so those questions leave the pool entirely
 * rather than being served stripped of the material they depend on.
 */
export function eligiblePool(
  questions: Question[],
  selected: string[],
  featuresOn: boolean,
): Question[] {
  const inDiscipline = filterByCategories(questions, selected);
  return featuresOn ? inDiscipline : inDiscipline.filter((question) => !hasFeatureText(question));
}

export function poolSizeFor(pool: Question[], selected: string[]): number {
  if (selected.length === 0) return 0;
  return filterByCategories(pool, selected).length;
}

export function countsByCategory(questions: Question[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const question of questions) {
    counts.set(question.chapter_title, (counts.get(question.chapter_title) ?? 0) + 1);
  }
  return counts;
}
