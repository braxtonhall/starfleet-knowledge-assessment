import type { CountChoice, Question, QuizConfig, RecapItem } from "../data/types";
import { randomDesignation } from "../net/names";
import { eligiblePool } from "./pool";
import { mathRandom, type Random } from "./random";
import { speedBonusFor } from "./scoring";
import { createEndlessDrawer, deal, shuffle, type Drawer } from "./sequence";
import { hasFeatureText } from "./weighting";

/**
 * Duty Rotation: one device, two to eight officers, passed hand to hand.
 *
 * The whole mode follows from one constraint — **the incoming officer must
 * never be able to read the outgoing officer's question, choice or verdict off
 * the screen.** That is what makes the hand-off a phase of its own rather than
 * a transition, and what makes the draw a single shared bag: if two officers
 * could be dealt the same question, the first would answer it aloud in a room
 * where a later one is about to be handed it.
 *
 * This module is the session — turn order, the dealer, the clock, per-officer
 * scoring and recaps — in the shape of `hostSession` minus the network. It
 * touches no DOM and nothing in `net/` beyond the designation generator.
 *
 * Two deliberate deviations from the spec, both spelled out in §5.11:
 *
 * 1. **Nothing is written to the answer log.** Spec §3 says every mode that
 *    answers a question updates the device's global history, which is right for
 *    a networked drill where each player answers on their own phone. The
 *    single-device analogue is not "everyone writes to the one device" — the
 *    seat belongs to whoever is holding it, not to the device. Four guests'
 *    guesses would reweight the owner's Solo draws and recolour their Browse
 *    rows. Standings live for the drill and are gone when it ends.
 * 2. **No high scores.** `countKey` records a personal best per count category
 *    and there is no single player here to own one.
 */

export type RotationPhase = "config" | "watchbill" | "handoff" | "question" | "verdict" | "over";

const TICK_MS = 200;

export interface OfficerView {
  /** Position in the watch bill, 0-based. Turn order is roster order and fixed
   *  for the drill. */
  index: number;
  name: string;
  score: number;
  correctCount: number;
  /** Turns actually completed. The denominator of the standings tally, and the
   *  reason an endless drill quit mid-rotation reads honestly (spec §5.11). */
  turns: number;
  missed: RecapItem[];
}

/** The outgoing officer's verdict, carried onto the hand-off screen. Never
 *  their question, never their choice, never a running total. */
export interface HandoffResult {
  name: string;
  correct: boolean;
}

export interface RotationState {
  phase: RotationPhase;
  config: QuizConfig;
  officers: OfficerView[];
  poolSize: number;
  /** Items per officer; `null` in an endless drill. */
  perOfficer: number | null;
  /** Global turn index, 0-based. `-1` before the first hand-off. */
  rotation: number;
  /** Whose turn it is — an index into `officers`, or `null` off-turn. */
  currentIndex: number | null;
  /** How far into their own assessment the current officer is, 0-based. */
  slot: number;
  previous: HandoffResult | null;
  question: Question | null;
  showFeature: boolean;
  chosen: string | null;
  correct: boolean | null;
  /** The response window closed before an answer was taken. */
  expired: boolean;
  timerSeconds: number | null;
  remainingMs: number | null;
}

export interface RotationSession {
  getState(): RotationState;
  subscribe(listener: (state: RotationState) => void): () => void;
  /** Config screen only; the drill locks its settings when it starts. */
  setConfig(config: QuizConfig): void;
  start(): void;
  answer(letter: string): void;
  /** One forward step: watch bill → hand-off → question, and verdict → the next
   *  hand-off (or the standings). */
  advance(): void;
  /** Endless only: ends the drill where it stands rather than making whoever
   *  wanted to stop keep passing the terminal. */
  disengage(): void;
  /** Same crew, same designations, fresh bag. */
  restart(): void;
  destroy(): void;
}

/**
 * What a given configuration actually draws.
 *
 * `ALL` means the whole archive split across the crew rather than the whole
 * archive *each*, which is unsatisfiable — every officer still answers the same
 * number of items, so the standings compare like with like. A fixed count means
 * that many *each*: four officers at 20 needs 200 distinct items, and a drill
 * that cannot be dealt says so before it starts rather than reshuffling
 * silently.
 */
export interface RotationDraw {
  perOfficer: number | null;
  /** Items the whole drill consumes; `null` when endless. */
  total: number | null;
  sufficient: boolean;
}

export function rotationDraw(
  count: CountChoice,
  poolSize: number,
  officers: number,
): RotationDraw {
  if (officers <= 0) return { perOfficer: 0, total: 0, sufficient: false };
  if (count === "endless") {
    return { perOfficer: null, total: null, sufficient: poolSize > 0 };
  }
  const perOfficer = count === "all" ? Math.floor(poolSize / officers) : count;
  const total = perOfficer * officers;
  return { perOfficer, total, sufficient: perOfficer >= 1 && total <= poolSize };
}

/**
 * One shuffle bag for the whole session, dealt across all officers — not a bag
 * per player. Uniform over the pool like every other multiplayer draw
 * (spec §6), and no question can reach two officers.
 *
 * With SUPPLEMENTAL DATA on, one feature question is reserved for each
 * officer's *own* final slot, so everybody gets a finale: the bias
 * `buildSequence` applies to a single sequence, generalised across N of them
 * drawn from one bag.
 */
export function dealRotation(options: {
  pool: Question[];
  officers: number;
  perOfficer: number;
  featuresOn: boolean;
  random: Random;
}): Question[][] {
  const { pool, officers, perOfficer, featuresOn, random } = options;
  if (officers <= 0 || perOfficer <= 0 || pool.length === 0) return [];

  const hands: Question[][] = Array.from({ length: officers }, () => []);

  // At a length of one there is no "final" slot to distinguish, exactly as in
  // `buildSequence`. A pool with fewer feature questions than officers hands
  // out what it has; the rest simply end on an ordinary item.
  const featured = featuresOn && perOfficer >= 2 ? pool.filter(hasFeatureText) : [];
  const finales = shuffle(featured, random).slice(0, officers);
  const reserved = new Set(finales);

  const need = hands.map((_, index) => perOfficer - (finales[index] ? 1 : 0));
  const bodyCount = need.reduce((sum, value) => sum + value, 0);

  // Same fallback `buildSequence` uses: a narrow discipline filter can leave
  // fewer plain questions than body slots, and the drill is still owed its
  // requested length.
  const plain = pool.filter((question) => !hasFeatureText(question));
  const body = plain.length >= bodyCount ? plain : pool.filter((q) => !reserved.has(q));
  const dealt = deal(body, bodyCount, random);

  let cursor = 0;
  for (let slot = 0; slot < perOfficer; slot += 1) {
    for (let index = 0; index < officers; index += 1) {
      if (hands[index].length >= need[index] || cursor >= dealt.length) continue;
      hands[index].push(dealt[cursor]);
      cursor += 1;
    }
  }

  for (let index = 0; index < officers; index += 1) {
    const finale = finales[index];
    if (finale) hands[index].push(finale);
  }

  return hands;
}

export function createRotationSession(options: {
  playable: Question[];
  config: QuizConfig;
  random?: Random;
}): RotationSession {
  const random = options.random ?? mathRandom;
  const listeners = new Set<(state: RotationState) => void>();

  let config: QuizConfig = { ...options.config, categories: [...options.config.categories] };
  let phase: RotationPhase = "config";
  let officers: OfficerView[] = [];
  let hands: Question[][] = [];
  let drawer: Drawer | null = null;
  let perOfficer: number | null = null;

  let rotation = -1;
  let previous: HandoffResult | null = null;
  let question: Question | null = null;
  let showFeature = false;
  let chosen: string | null = null;
  let correct: boolean | null = null;
  let expired = false;

  let timerSeconds: number | null = null;
  let deadline = 0;
  let questionStart = 0;
  let tickHandle: ReturnType<typeof setInterval> | null = null;

  function poolForConfig(): Question[] {
    return eligiblePool(options.playable, config.categories, config.featuresOn);
  }

  function emit(): void {
    const state = getState();
    for (const listener of listeners) listener(state);
  }

  function currentIndex(): number | null {
    if (officers.length === 0) return null;
    if (phase !== "handoff" && phase !== "question" && phase !== "verdict") return null;
    return rotation % officers.length;
  }

  function current(): OfficerView | null {
    const index = currentIndex();
    return index === null ? null : officers[index];
  }

  function getState(): RotationState {
    return {
      phase,
      config,
      officers: officers.map((officer) => ({ ...officer })),
      poolSize: poolForConfig().length,
      perOfficer,
      rotation,
      currentIndex: currentIndex(),
      slot: officers.length === 0 ? 0 : Math.floor(Math.max(rotation, 0) / officers.length),
      previous,
      question,
      showFeature,
      chosen,
      correct,
      expired,
      timerSeconds,
      remainingMs:
        timerSeconds === null || phase !== "question"
          ? null
          : Math.max(0, deadline - performance.now()),
    };
  }

  // ----- dealing ----------------------------------------------------------

  function prepare(): boolean {
    const pool = poolForConfig();
    const draw = rotationDraw(config.count, pool.length, config.officers);
    if (!draw.sufficient) return false;

    perOfficer = draw.perOfficer;
    hands = [];
    drawer = null;

    if (perOfficer === null) {
      // Endless: the same shared bag, lazily. No finale bias — there is no
      // final position to save one for (spec §5.9).
      drawer = createEndlessDrawer(pool, random);
    } else {
      hands = dealRotation({
        pool,
        officers: config.officers,
        perOfficer,
        featuresOn: config.featuresOn,
        random,
      });
    }

    for (const officer of officers) {
      officer.score = 0;
      officer.correctCount = 0;
      officer.turns = 0;
      officer.missed = [];
    }

    rotation = -1;
    previous = null;
    clearQuestion();
    return true;
  }

  function clearQuestion(): void {
    question = null;
    showFeature = false;
    chosen = null;
    correct = null;
    expired = false;
    timerSeconds = null;
  }

  // ----- the turn cycle ---------------------------------------------------

  function toHandoff(): void {
    stopTicking();
    rotation += 1;
    if (perOfficer !== null && rotation >= officers.length * perOfficer) {
      finish();
      return;
    }
    clearQuestion();
    phase = "handoff";
    emit();
  }

  function present(): void {
    const officer = current();
    if (!officer) return;

    const slot = Math.floor(rotation / officers.length);
    const next = drawer ? drawer.next() : hands[officer.index]?.[slot];
    if (!next) {
      finish();
      return;
    }

    question = next;
    chosen = null;
    correct = null;
    expired = false;
    showFeature = config.featuresOn && hasFeatureText(next);
    // A question displaying supplemental data is untimed wherever it appears
    // (spec §4.1).
    timerSeconds = config.timerOn && !showFeature ? config.timerSeconds : null;

    phase = "question";
    // Both clocks start here rather than when the hand-off screen went up:
    // passing a terminal across a table must not eat the response window.
    questionStart = performance.now();
    if (timerSeconds !== null) {
      deadline = questionStart + timerSeconds * 1000;
      startTicking();
    }
    emit();
  }

  function resolve(elapsedMs: number): void {
    const officer = current();
    if (!officer || !question) return;
    stopTicking();

    officer.turns += 1;
    const isCorrect = chosen !== null && question.answer !== null && chosen === question.answer;
    correct = isCorrect;

    if (isCorrect) {
      officer.correctCount += 1;
      officer.score += 1;
      if (config.speedBonus) officer.score += speedBonusFor(elapsedMs);
    } else {
      officer.missed.push({ number: question.number, question: question.question, chosen });
    }

    previous = { name: officer.name, correct: isCorrect };
    phase = "verdict";
    emit();
  }

  function startTicking(): void {
    stopTicking();
    tickHandle = setInterval(() => {
      if (phase !== "question") return;
      if (performance.now() < deadline) {
        emit();
        return;
      }
      // Nobody answered in time. The officer keeps the turn — and the miss.
      expired = true;
      resolve(performance.now() - questionStart);
    }, TICK_MS);
  }

  function stopTicking(): void {
    if (tickHandle) clearInterval(tickHandle);
    tickHandle = null;
  }

  function finish(): void {
    stopTicking();
    clearQuestion();
    phase = "over";
    emit();
  }

  return {
    getState,

    subscribe(listener) {
      listeners.add(listener);
      listener(getState());
      return () => listeners.delete(listener);
    },

    setConfig(next) {
      if (phase !== "config") return;
      config = { ...next, categories: [...next.categories] };
      emit();
    },

    start() {
      if (phase !== "config") return;

      // Designations are drawn once, here, and the watch bill they land in is
      // the turn order for the rest of the drill. Each is drawn against the
      // names already taken, so no two officers share one.
      const taken: string[] = [];
      officers = Array.from({ length: config.officers }, (_, index) => {
        const name = randomDesignation(taken, random);
        taken.push(name);
        return { index, name, score: 0, correctCount: 0, turns: 0, missed: [] as RecapItem[] };
      });

      if (!prepare()) {
        officers = [];
        return;
      }
      phase = "watchbill";
      emit();
    },

    answer(letter) {
      if (phase !== "question" || !question || chosen !== null) return;
      if (timerSeconds !== null && performance.now() >= deadline) return;
      chosen = letter;
      resolve(performance.now() - questionStart);
    },

    advance() {
      if (phase === "watchbill" || phase === "verdict") toHandoff();
      else if (phase === "handoff") present();
    },

    disengage() {
      if (phase === "handoff" || phase === "question" || phase === "verdict") finish();
    },

    restart() {
      if (phase !== "over") return;
      if (!prepare()) return;
      phase = "watchbill";
      emit();
    },

    destroy() {
      listeners.clear();
      stopTicking();
    },
  };
}
