import type { Question } from "../data/types";
import type { Random } from "./random";
import { hasFeatureText } from "./weighting";

/**
 * Question selection for multiplayer.
 *
 * Spec §6: multiplayer draws uniformly at random, with none of the per-player
 * history weighting Solo uses — a single shared draw can't be personalised to
 * several players' histories at once.
 *
 * Uniform, but *without replacement*: one shared question repeating inside a
 * 20-question room reads as a bug on a projected screen, and sampling without
 * replacement is still uniform over the pool. Only a game longer than the pool
 * itself repeats, and then only after exhausting every question.
 */

export function shuffle<T>(items: T[], random: Random): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Deals `count` items, reshuffling for another pass only once the pool runs dry. */
export function deal<T>(pool: T[], count: number, random: Random): T[] {
  const dealt: T[] = [];
  while (dealt.length < count && pool.length > 0) {
    dealt.push(...shuffle(pool, random).slice(0, count - dealt.length));
  }
  return dealt;
}

/**
 * Builds the whole fixed-length game up front, so the host holds one immutable
 * sequence rather than re-deriving state per question.
 *
 * Spec §5.9: with the Features toggle on and a length of two or more, a
 * feature-text question is saved for the final slot and kept out of the earlier
 * ones, making it a finale rather than a random interruption. At length 1 there
 * is no "final" to distinguish, so the bias is skipped.
 */
export function buildSequence(
  pool: Question[],
  count: number,
  featuresOn: boolean,
  random: Random,
): Question[] {
  if (pool.length === 0 || count <= 0) return [];

  const featured = pool.filter(hasFeatureText);
  if (!featuresOn || count < 2 || featured.length === 0) {
    return deal(pool, count, random);
  }

  const finale = featured[Math.floor(random() * featured.length)];
  const plain = pool.filter((question) => !hasFeatureText(question));
  // Every category is guaranteed a feature question (spec §5.9), but a narrow
  // category filter can still leave fewer plain questions than slots to fill.
  // Falling back to the whole pool keeps the game its requested length; the
  // finale is still the last thing shown.
  const body = plain.length >= count - 1 ? plain : pool.filter((q) => q !== finale);

  return [...deal(body, count - 1, random), finale];
}

export interface Drawer {
  next(): Question;
}

/**
 * Endless multiplayer: the same without-replacement deal, but lazy and
 * unbounded. No finale bias — there is no final position to bias toward — so a
 * feature question that is in the pool simply comes up in its turn like any
 * other (spec §5.9).
 */
export function createEndlessDrawer(pool: Question[], random: Random): Drawer {
  let bag: Question[] = [];
  return {
    next(): Question {
      if (bag.length === 0) bag = shuffle(pool, random);
      return bag.pop() as Question;
    },
  };
}
