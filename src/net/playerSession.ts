import type { QuestionState } from "../data/types";
import { clientId } from "../state/identity";
import {
  PROTOCOL_VERSION,
  asHostMessage,
  type QuestionPayload,
  type RecapItem,
  type RejectReason,
  type RoundResult,
  type StandingEntry,
} from "./protocol";
import { createPlayerTransport, type PlayerTransport, type TransportErrorKind } from "./transport";

/**
 * The player device (spec §5.5): a personal screen. It sees its own locked-in
 * choice and its own verdict, never the room's — everything about the other
 * players lives on the host display.
 *
 * It holds no game logic beyond "show what the host said": scoring, the
 * sequence, and the clock's authority all sit on the host.
 */

export type PlayerPhase =
  | "connecting"
  | "lobby"
  | "question"
  | "reveal"
  | "over"
  | "rejected"
  | "lost";

const RETRY_DELAY_MS = 1500;
const MAX_RETRIES = 8;
const TICK_MS = 200;

export interface PlayerState {
  phase: PlayerPhase;
  roomCode: string;
  name: string;
  index: number;
  total: number | null;
  question: QuestionPayload | null;
  showFeature: boolean;
  timerSeconds: number | null;
  remainingMs: number | null;
  /** Locked once set — a player cannot change their answer (spec §5.5). */
  choice: string | null;
  correctLetter: string | null;
  /** Own result only, and only after reveal. */
  correct: boolean | null;
  /** How the whole room did on the question that just closed — empty until the
   *  reveal beat, and cleared again by the next question. */
  roundResults: RoundResult[];
  recap: RecapItem[] | null;
  /** The room's final leaderboard — `null` unless the host played, in which
   *  case their screen is nobody else's viewer (spec §5.10). */
  standings: StandingEntry[] | null;
  score: number;
  correctCount: number;
  answeredCount: number;
  playedCount: number;
  rejection: RejectReason | null;
  error: string | null;
  errorKind: TransportErrorKind | null;
  reconnecting: boolean;
}

export interface PlayerSession {
  getState(): PlayerState;
  subscribe(listener: (state: PlayerState) => void): () => void;
  answer(letter: string): void;
  retry(): void;
  destroy(): void;
}

export function createPlayerSession(options: {
  roomCode: string;
  /**
   * Multiplayer answers write to the same local history every other mode uses
   * (spec §3) — the host's copy is for the leaderboard, this is the player's
   * own permanent record.
   */
  onResolved?: (questionNumber: number, state: QuestionState) => void;
}): PlayerSession {
  const listeners = new Set<(state: PlayerState) => void>();
  const id = clientId();

  let transport: PlayerTransport | null = null;
  let destroyed = false;
  let retries = 0;
  let retryHandle: ReturnType<typeof setTimeout> | null = null;
  let tickHandle: ReturnType<typeof setInterval> | null = null;

  let phase: PlayerPhase = "connecting";
  let roomName = options.roomCode;
  let name = "";
  let index = -1;
  let total: number | null = null;
  let question: QuestionPayload | null = null;
  let showFeature = false;
  let timerSeconds: number | null = null;
  let deadline = 0;
  let questionStart = 0;
  let choice: string | null = null;
  let correctLetter: string | null = null;
  let correct: boolean | null = null;
  let roundResults: RoundResult[] = [];
  let recap: RecapItem[] | null = null;
  let standings: StandingEntry[] | null = null;
  let score = 0;
  let correctCount = 0;
  let answeredCount = 0;
  let playedCount = 0;
  let rejection: RejectReason | null = null;
  let error: string | null = null;
  let errorKind: TransportErrorKind | null = null;
  let reconnecting = false;

  function getState(): PlayerState {
    return {
      phase,
      roomCode: roomName,
      name,
      index,
      total,
      question,
      showFeature,
      timerSeconds,
      remainingMs:
        timerSeconds === null || phase !== "question" ? null : Math.max(0, deadline - performance.now()),
      choice,
      correctLetter,
      correct,
      roundResults,
      recap,
      standings,
      score,
      correctCount,
      answeredCount,
      playedCount,
      rejection,
      error,
      errorKind,
      reconnecting,
    };
  }

  function emit(): void {
    const state = getState();
    for (const listener of listeners) listener(state);
  }

  function startTicking(): void {
    stopTicking();
    tickHandle = setInterval(() => {
      if (phase !== "question" || timerSeconds === null) return;
      emit();
      // The host decides when the round actually ends; a locally expired clock
      // only stops this device from answering.
      if (performance.now() >= deadline) stopTicking();
    }, TICK_MS);
  }

  function stopTicking(): void {
    if (tickHandle) clearInterval(tickHandle);
    tickHandle = null;
  }

  function connect(): void {
    transport?.destroy();
    reconnecting = retries > 0;
    transport = createPlayerTransport(options.roomCode, {
      onOpen: () => {
        retries = 0;
        reconnecting = false;
        error = null;
        errorKind = null;
        transport?.send({ type: "join", version: PROTOCOL_VERSION, clientId: id });
      },
      onMessage: (raw) => handleMessage(raw),
      onClose: () => scheduleRetry(),
      onError: (kind, detail) => {
        errorKind = kind;
        error = detail;
        // A missing room during the first handshake is a wrong code, not a
        // dropout — retrying it just burns time the player could spend
        // re-typing.
        if (kind === "missing" && phase === "connecting") {
          phase = "lost";
          emit();
          return;
        }
        scheduleRetry();
      },
    });
    emit();
  }

  function scheduleRetry(): void {
    if (destroyed || rejection !== null || phase === "over") return;
    if (retryHandle) return;
    stopTicking();
    if (retries >= MAX_RETRIES) {
      phase = "lost";
      reconnecting = false;
      emit();
      return;
    }
    retries += 1;
    reconnecting = true;
    emit();
    retryHandle = setTimeout(() => {
      retryHandle = null;
      if (!destroyed) connect();
    }, RETRY_DELAY_MS);
  }

  function handleMessage(raw: unknown): void {
    const message = asHostMessage(raw);
    if (!message) return;

    switch (message.type) {
      case "welcome":
        name = message.name;
        roomName = message.roomName;
        if (phase === "connecting" || phase === "lost") phase = "lobby";
        break;

      case "rejected":
        rejection = message.reason;
        phase = "rejected";
        stopTicking();
        transport?.destroy();
        transport = null;
        break;

      case "lobby":
        roomName = message.roomName;
        // Covers both the first lobby and everyone being sent back to it after
        // a game (spec §5.8).
        phase = "lobby";
        question = null;
        choice = null;
        correctLetter = null;
        correct = null;
        roundResults = [];
        recap = null;
        standings = null;
        stopTicking();
        break;

      case "question": {
        const fresh = message.question.number !== question?.number || phase !== "reveal";
        question = message.question;
        index = message.index;
        total = message.total;
        showFeature = message.showFeature;
        timerSeconds = message.timerSeconds;
        // A resumed question replays the choice already on record, so a
        // reconnecting player can't answer twice (spec §5.8).
        choice = message.yourChoice;
        correctLetter = null;
        correct = null;
        roundResults = [];
        phase = "question";
        if (fresh) {
          questionStart = performance.now();
          if (timerSeconds !== null) {
            deadline = questionStart + timerSeconds * 1000;
            startTicking();
          }
        }
        break;
      }

      case "reveal": {
        if (!question || message.number !== question.number) break;
        stopTicking();
        correctLetter = message.correctLetter;
        correct = choice === null ? null : choice === message.correctLetter;
        roundResults = message.results ?? [];
        phase = "reveal";
        if (choice !== null) {
          resolve(question.number, correct ? "correct" : "incorrect");
        } else if (timerSeconds !== null) {
          // Ran out of time without answering — the same outcome Solo records
          // when its response window expires.
          resolve(question.number, "incorrect");
        }
        break;
      }

      case "recap":
        recap = message.missed;
        standings = message.standings ?? null;
        score = message.score;
        correctCount = message.correct;
        answeredCount = message.answered;
        playedCount = message.total;
        phase = "over";
        stopTicking();
        break;

      case "ping":
        transport?.send({ type: "pong", nonce: message.nonce });
        return;
    }

    emit();
  }

  function resolve(questionNumber: number, state: QuestionState): void {
    options.onResolved?.(questionNumber, state);
  }

  connect();

  return {
    getState,

    subscribe(listener) {
      listeners.add(listener);
      listener(getState());
      return () => listeners.delete(listener);
    },

    answer(letter) {
      if (phase !== "question" || choice !== null || !question) return;
      if (timerSeconds !== null && performance.now() >= deadline) return;
      choice = letter;
      transport?.send({
        type: "answer",
        number: question.number,
        letter,
        elapsedMs: performance.now() - questionStart,
      });
      emit();
    },

    retry() {
      if (destroyed) return;
      retries = 0;
      rejection = null;
      phase = "connecting";
      connect();
    },

    destroy() {
      destroyed = true;
      listeners.clear();
      stopTicking();
      if (retryHandle) clearTimeout(retryHandle);
      retryHandle = null;
      transport?.destroy();
      transport = null;
    },
  };
}
