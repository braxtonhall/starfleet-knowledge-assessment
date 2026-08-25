import type { Question, QuestionState } from "../data/types";
import type { AnswerLog } from "../state/answerLog";

export const BASE_WEIGHT: Record<QuestionState, number> = {
  unanswered: 10,
  incorrect: 10,
  correct: 1,
};

export const FEATURE_DOWNWEIGHT = 0.1;
export const FEATURE_UPWEIGHT = 20;

export interface WeightContext {
  answerLog: AnswerLog;
  timesSeen: Map<number, number>;
  position: number;
  total: number | null;
  featuresOn: boolean;
}

export function baseWeightForState(state: QuestionState): number {
  return BASE_WEIGHT[state];
}

export function sessionDecay(timesSeen: number): number {
  return 1 / (1 + timesSeen);
}

export function hasFeatureText(question: Question): boolean {
  return question.feature_text !== null && question.feature_text.trim() !== "";
}

/**
 * The finale bias, and the only place that decides whether it applies. A feature
 * question is saved for the last slot of a fixed-length run; with no fixed
 * length (Endless, `total === null`) or nothing to be last of (`total < 2`)
 * there is no finale to save it for, so it draws at its ordinary weight and
 * turns up at a random point instead (spec §5.9).
 */
export function featureWeightForPosition(
  question: Question,
  position: number,
  total: number | null,
  featuresOn: boolean,
): number {
  if (!featuresOn || !hasFeatureText(question)) return 1;
  if (total === null || total < 2) return 1;
  return position === total - 1 ? FEATURE_UPWEIGHT : FEATURE_DOWNWEIGHT;
}

export function weightFor(question: Question, context: WeightContext): number {
  const state = context.answerLog.get(question.number) ?? "unanswered";
  const timesSeen = context.timesSeen.get(question.number) ?? 0;
  return (
    baseWeightForState(state) *
    sessionDecay(timesSeen) *
    featureWeightForPosition(question, context.position, context.total, context.featuresOn)
  );
}

export function weightsForPool(pool: Question[], context: WeightContext): number[] {
  return pool.map((question) => weightFor(question, context));
}

export function weightedDraw<T>(items: T[], weights: number[], random: () => number): T {
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  if (totalWeight <= 0 || items.length === 0) {
    return items[Math.floor(random() * items.length)];
  }
  let point = random() * totalWeight;
  for (let i = 0; i < items.length; i += 1) {
    point -= weights[i];
    if (point < 0) return items[i];
  }
  return items[items.length - 1];
}
