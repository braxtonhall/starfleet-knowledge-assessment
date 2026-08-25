import type { Question, QuestionState, QuizConfig } from "../data/types";
import { eligiblePool } from "../logic/pool";
import { mathRandom } from "../logic/random";
import { speedBonusFor } from "../logic/scoring";
import { buildSequence, createEndlessDrawer, type Drawer } from "../logic/sequence";
import { rankScored } from "../logic/standings";
import { hasFeatureText } from "../logic/weighting";
import { randomDesignation } from "./names";
import {
  MAX_PLAYERS,
  PROTOCOL_VERSION,
  type HostMessage,
  type QuestionPayload,
  type RecapItem,
  type RosterEntry,
  type RoundResult,
  type StandingEntry,
  asPlayerMessage,
} from "./protocol";
import { generateRoomCode, joinUrlFor } from "./roomCode";
import { createHostTransport, type HostTransport, type TransportErrorKind } from "./transport";

/**
 * The host device. By default (spec §5.3) it is a pure spectator and admin
 * display: it never answers, is never scored, and is the only participant that
 * knows the correct letter before reveal or any player's running total.
 *
 * With `config.hostPlays` on (spec §5.10) it also takes a seat. The seat is an
 * ordinary `PlayerRecord` with no channel — everything downstream (the roster,
 * "has everyone answered?", scoring, the recap) treats it like any other
 * player, and the two places that push bytes at a player already skip a record
 * with no `channelId`.
 */

export type HostPhase = "opening" | "lobby" | "question" | "reveal" | "over" | "error";

/** Beat 1 is "who answered what", beat 2 is correctness (spec §5.4). The gap is
 *  deliberately short — the spec asks for fast pacing, not a drum roll. */
export const REVEAL_BEAT_MS = 900;

/**
 * How long correctness stays up before the room moves on by itself. A crew
 * drill runs on a shared screen with a host who is usually also watching it, so
 * waiting on a click between every question stalls the room on whoever happens
 * to be nearest the laptop. Long enough to read your own verdict on a phone,
 * short enough that nobody starts talking; PROCEED is still there for a host
 * who wants to cut it short.
 */
export const REVEAL_HOLD_MS = 3000;

/** Lobby liveness probing (spec §5.8): catches the player who closed their tab
 *  without the connection reporting it. */
const PING_INTERVAL_MS = 4000;
const PING_TIMEOUT_MS = 13000;

const TICK_MS = 200;

/** The host's own seat. Not a client id, so it can never collide with one. */
export const HOST_SEAT_ID = "@command";

export interface HostPlayerView {
  id: string;
  name: string;
  connected: boolean;
  answered: boolean;
  /** Withheld until reveal beat 1 — showing it mid-question leaks answers. */
  choice: string | null;
  /** Withheld until reveal beat 2. */
  correct: boolean | null;
  score: number;
  correctCount: number;
  /** True on the host's own row when they have taken a seat (spec §5.10). */
  isHost: boolean;
}

/**
 * What the host device needs to answer with — present only while the host is
 * playing. Unlike a roster row this is the host's *own* screen, so their choice
 * is not held back; correctness still waits for beat 2, so one screen resolves
 * the question in one motion rather than telling its owner the verdict a beat
 * before it tells the room.
 */
export interface HostSeatView {
  name: string;
  choice: string | null;
  correct: boolean | null;
  score: number;
  correctCount: number;
  /** The host's own end-of-drill review — questions only, same as a player's
   *  (spec §5.5). Fills as the drill runs; only read once it is over. */
  missed: RecapItem[];
}

export interface HostState {
  phase: HostPhase;
  roomCode: string;
  joinUrl: string;
  config: QuizConfig;
  poolSize: number;
  players: HostPlayerView[];
  /** Non-null only while the host is playing (spec §5.10). */
  seat: HostSeatView | null;
  index: number;
  total: number | null;
  /** How many questions the room has actually been shown — the denominator for
   *  a rating in an endless drill, where `total` is null. */
  playedCount: number;
  question: Question | null;
  showFeature: boolean;
  timerSeconds: number | null;
  remainingMs: number | null;
  revealBeat: 0 | 1 | 2;
  /** True when the host must click to advance: no timer, or an untimed feature
   *  question in an otherwise timed game (spec §5.4.2). */
  canForceAdvance: boolean;
  error: string | null;
  errorKind: TransportErrorKind | null;
}

export interface HostSession {
  getState(): HostState;
  subscribe(listener: (state: HostState) => void): () => void;
  setConfig(config: QuizConfig): void;
  setRoomCode(code: string): void;
  start(): void;
  /** The host answering from their own seat (spec §5.10). Inert when they have
   *  not taken one, so the caller never has to check first. */
  answerLocal(letter: string): void;
  /** The host's PROCEED: question → reveal, or reveal → next question. */
  advance(): void;
  /** Endless only — ends the game on the host's terms. */
  endGame(): void;
  restart(): void;
  destroy(): void;
}

interface PlayerRecord {
  id: string;
  channelId: string | null;
  name: string;
  connected: boolean;
  score: number;
  correctCount: number;
  answeredCount: number;
  current: { letter: string; elapsedMs: number } | null;
  currentCorrect: boolean | null;
  missed: RecapItem[];
  lastSeen: number;
  /** The host's own seat, which has no channel and never times out. */
  isHost: boolean;
}

export function createHostSession(options: {
  playable: Question[];
  config: QuizConfig;
  roomCode?: string;
  /**
   * A host who plays is a player too, so their answers land in this device's
   * permanent local history like everyone else's (spec §3).
   */
  onResolved?: (questionNumber: number, state: QuestionState) => void;
}): HostSession {
  const listeners = new Set<(state: HostState) => void>();
  const players = new Map<string, PlayerRecord>();
  const channelToPlayer = new Map<string, string>();

  let config: QuizConfig = { ...options.config, categories: [...options.config.categories] };
  let roomCode = options.roomCode ?? generateRoomCode();
  let transport: HostTransport | null = null;

  let phase: HostPhase = "opening";
  let error: string | null = null;
  let errorKind: TransportErrorKind | null = null;

  let sequence: Question[] = [];
  let drawer: Drawer | null = null;
  let total: number | null = null;
  let index = -1;
  let question: Question | null = null;
  let showFeature = false;
  let timerSeconds: number | null = null;
  let deadline = 0;
  let revealBeat: 0 | 1 | 2 = 0;
  let playedCount = 0;
  let questionStart = 0;

  let tickHandle: ReturnType<typeof setInterval> | null = null;
  let beatHandle: ReturnType<typeof setTimeout> | null = null;
  let pingHandle: ReturnType<typeof setInterval> | null = null;
  let pingNonce = 0;

  function poolForConfig(): Question[] {
    return eligiblePool(options.playable, config.categories, config.featuresOn);
  }

  function emit(): void {
    const state = getState();
    for (const listener of listeners) listener(state);
  }

  function viewFor(record: PlayerRecord): HostPlayerView {
    return {
      id: record.id,
      name: record.name,
      connected: record.connected,
      answered: record.current !== null,
      choice: revealBeat >= 1 ? record.current?.letter ?? null : null,
      correct: revealBeat >= 2 ? record.currentCorrect : null,
      score: record.score,
      correctCount: record.correctCount,
      isHost: record.isHost,
    };
  }

  /**
   * Adds or drops the host's seat to match the toggle. Only meaningful before
   * the drill starts — `setConfig` already refuses to run once it has.
   */
  function syncHostSeat(): boolean {
    const seated = players.get(HOST_SEAT_ID);
    if (config.hostPlays === (seated !== undefined)) return false;

    if (config.hostPlays) {
      players.set(HOST_SEAT_ID, {
        id: HOST_SEAT_ID,
        channelId: null,
        name: randomDesignation([...players.values()].map((p) => p.name)),
        connected: true,
        score: 0,
        correctCount: 0,
        answeredCount: 0,
        current: null,
        currentCorrect: null,
        missed: [],
        lastSeen: performance.now(),
        isHost: true,
      });
    } else {
      players.delete(HOST_SEAT_ID);
    }
    return true;
  }

  function seatView(): HostSeatView | null {
    const record = players.get(HOST_SEAT_ID);
    if (!record) return null;
    return {
      name: record.name,
      // Their own answer on their own screen — no reason to hold it back.
      choice: record.current?.letter ?? null,
      correct: revealBeat >= 2 ? record.currentCorrect : null,
      score: record.score,
      correctCount: record.correctCount,
      missed: record.missed,
    };
  }

  function getState(): HostState {
    return {
      phase,
      roomCode,
      joinUrl: joinUrlFor(roomCode),
      config,
      poolSize: poolForConfig().length,
      players: [...players.values()].map(viewFor),
      seat: seatView(),
      index,
      total,
      playedCount,
      question,
      showFeature,
      timerSeconds,
      remainingMs: timerSeconds === null || phase !== "question" ? null : Math.max(0, deadline - performance.now()),
      revealBeat,
      canForceAdvance: phase === "question" && timerSeconds === null,
      error,
      errorKind,
    };
  }

  function roster(): RosterEntry[] {
    return [...players.values()].map((record) => ({
      id: record.id,
      name: record.name,
      connected: record.connected,
    }));
  }

  function broadcastLobby(): void {
    transport?.broadcast({ type: "lobby", roomName: roomCode, roster: roster() });
  }

  // ----- transport wiring -------------------------------------------------

  function openTransport(): void {
    transport?.destroy();
    phase = "opening";
    error = null;
    errorKind = null;
    transport = createHostTransport(roomCode, {
      onReady: () => {
        phase = "lobby";
        startPinging();
        emit();
      },
      onError: (kind, detail) => {
        // A taken room code is recoverable and common on a shared broker: take
        // a different one rather than dead-ending the host.
        if (kind === "taken" && phase === "opening") {
          roomCode = generateRoomCode();
          openTransport();
          return;
        }
        phase = "error";
        errorKind = kind;
        error = detail;
        emit();
      },
      onOpen: () => {
        // Nothing to do until the player identifies itself with `join`.
      },
      onMessage: (channelId, raw) => handleMessage(channelId, raw),
      onClose: (channelId) => handleClose(channelId),
    });
    emit();
  }

  function handleMessage(channelId: string, raw: unknown): void {
    const message = asPlayerMessage(raw);
    if (!message) return;

    if (message.type === "join") {
      handleJoin(channelId, message.clientId, message.version);
      return;
    }

    const playerId = channelToPlayer.get(channelId);
    const record = playerId ? players.get(playerId) : undefined;
    if (!record) return;
    record.lastSeen = performance.now();

    if (message.type === "pong") return;

    if (message.type === "answer") {
      if (phase !== "question" || !question || message.number !== question.number) return;
      if (record.current) return; // locked once answered (spec §5.5)
      record.current = { letter: message.letter, elapsedMs: Math.max(0, message.elapsedMs) };
      emit();
      if (everyoneAnswered()) toReveal();
    }
  }

  function handleJoin(channelId: string, id: string, version: number): void {
    if (version !== PROTOCOL_VERSION) {
      transport?.sendTo(channelId, { type: "rejected", reason: "version" });
      transport?.disconnect(channelId);
      return;
    }

    const existing = players.get(id);

    if (!existing) {
      // Spec §5.8: the room locks the moment the game starts. No late joins —
      // but a *known* player reconnecting is not a late join, which is why this
      // check sits after the lookup.
      if (phase !== "lobby") {
        transport?.sendTo(channelId, { type: "rejected", reason: "locked" });
        transport?.disconnect(channelId);
        return;
      }
      if (players.size >= MAX_PLAYERS) {
        transport?.sendTo(channelId, { type: "rejected", reason: "full" });
        transport?.disconnect(channelId);
        return;
      }
    }

    const record: PlayerRecord = existing ?? {
      id,
      channelId,
      name: randomDesignation([...players.values()].map((p) => p.name)),
      connected: true,
      score: 0,
      correctCount: 0,
      answeredCount: 0,
      current: null,
      currentCorrect: null,
      missed: [],
      lastSeen: performance.now(),
      isHost: false,
    };

    if (existing) {
      // A reconnect supersedes any stale channel still mapped to this player.
      if (existing.channelId && existing.channelId !== channelId) {
        channelToPlayer.delete(existing.channelId);
      }
      existing.channelId = channelId;
      existing.connected = true;
      existing.lastSeen = performance.now();
    }

    players.set(id, record);
    channelToPlayer.set(channelId, id);

    transport?.sendTo(channelId, {
      type: "welcome",
      version: PROTOCOL_VERSION,
      playerId: record.id,
      name: record.name,
      roomName: roomCode,
    });

    // Replay whatever is on screen right now so a rejoining player lands mid-game
    // rather than staring at a lobby that has moved on (spec §5.8).
    if (phase === "lobby") broadcastLobby();
    else if (phase === "question" || phase === "reveal") {
      transport?.sendTo(channelId, questionMessage(record));
      if (phase === "reveal" && question) {
        transport?.sendTo(channelId, revealMessage(record));
      }
    } else if (phase === "over") {
      transport?.sendTo(channelId, recapMessage(record));
    }

    emit();
  }

  function handleClose(channelId: string): void {
    const playerId = channelToPlayer.get(channelId);
    channelToPlayer.delete(channelId);
    if (!playerId) return;
    const record = players.get(playerId);
    if (!record || record.channelId !== channelId) return;

    record.connected = false;
    record.channelId = null;

    // In the lobby a dropped player has simply left; mid-game they keep their
    // seat and their score so they can come back to it (spec §5.8).
    if (phase === "lobby") {
      players.delete(playerId);
      broadcastLobby();
    } else if (phase === "question" && everyoneAnswered()) {
      // The player everyone was waiting on just vanished — don't stall the room.
      toReveal();
      return;
    }
    emit();
  }

  // ----- lobby liveness ---------------------------------------------------

  function startPinging(): void {
    stopPinging();
    pingHandle = setInterval(() => {
      if (phase !== "lobby") return;
      pingNonce += 1;
      transport?.broadcast({ type: "ping", nonce: pingNonce });

      const cutoff = performance.now() - PING_TIMEOUT_MS;
      let dropped = false;
      for (const [id, record] of players) {
        // The host's seat is on this device: there is no channel to probe and
        // nothing that could answer the probe if there were.
        if (record.isHost) continue;
        if (record.lastSeen < cutoff) {
          if (record.channelId) {
            transport?.disconnect(record.channelId);
            channelToPlayer.delete(record.channelId);
          }
          players.delete(id);
          dropped = true;
        }
      }
      if (dropped) {
        broadcastLobby();
        emit();
      }
    }, PING_INTERVAL_MS);
  }

  function stopPinging(): void {
    if (pingHandle) clearInterval(pingHandle);
    pingHandle = null;
  }

  // ----- game flow --------------------------------------------------------

  function everyoneAnswered(): boolean {
    const active = [...players.values()].filter((record) => record.connected);
    return active.length > 0 && active.every((record) => record.current !== null);
  }

  function questionPayload(): QuestionPayload {
    const source = question as Question;
    return {
      number: source.number,
      question: source.question,
      options: source.options,
      category: source.chapter_title,
      featureText: showFeature ? source.feature_text : null,
    };
  }

  function questionMessage(record: PlayerRecord): HostMessage {
    return {
      type: "question",
      index,
      total,
      question: questionPayload(),
      timerSeconds,
      showFeature,
      yourChoice: record.current?.letter ?? null,
    };
  }

  function present(next: Question): void {
    question = next;
    index += 1;
    playedCount += 1;
    revealBeat = 0;
    showFeature = config.featuresOn && hasFeatureText(next);
    // A question displaying feature text is never timed (spec §4.1), which is
    // also what puts PROCEED back on screen for this question alone (§5.4.2).
    timerSeconds = config.timerOn && !showFeature ? config.timerSeconds : null;

    for (const record of players.values()) {
      record.current = null;
      record.currentCorrect = null;
    }

    phase = "question";
    for (const record of players.values()) {
      if (record.channelId) transport?.sendTo(record.channelId, questionMessage(record));
    }

    // The host's own clock for the response-efficiency bonus, measured the same
    // way a player device measures it: from the moment the question goes up.
    questionStart = performance.now();
    if (timerSeconds !== null) {
      deadline = questionStart + timerSeconds * 1000;
      startTicking();
    }
    emit();
  }

  function startTicking(): void {
    stopTicking();
    tickHandle = setInterval(() => {
      if (phase !== "question") return;
      if (performance.now() >= deadline) toReveal();
      else emit();
    }, TICK_MS);
  }

  function stopTicking(): void {
    if (tickHandle) clearInterval(tickHandle);
    tickHandle = null;
  }

  function toReveal(): void {
    if (phase !== "question" || !question) return;
    stopTicking();

    const correctLetter = question.answer;
    for (const record of players.values()) {
      const chosen = record.current;
      if (!chosen) {
        record.currentCorrect = null;
        continue;
      }
      record.answeredCount += 1;
      const correct = correctLetter !== null && chosen.letter === correctLetter;
      record.currentCorrect = correct;
      if (correct) {
        record.correctCount += 1;
        record.score += 1;
        if (config.speedBonus) record.score += speedBonusFor(chosen.elapsedMs);
      }
    }

    // Everyone who did not get it right — including anyone who never answered —
    // is owed a recap entry (spec §5.5).
    for (const record of players.values()) {
      if (record.currentCorrect === true) continue;
      record.missed.push(recapItemFor(question, record.current?.letter ?? null));
    }

    const seat = players.get(HOST_SEAT_ID);
    if (seat) {
      // Same rule the player device applies to itself: an unanswered question
      // is only logged as wrong when the clock, not the host, closed it.
      if (seat.currentCorrect !== null) {
        options.onResolved?.(question.number, seat.currentCorrect ? "correct" : "incorrect");
      } else if (timerSeconds !== null) {
        options.onResolved?.(question.number, "incorrect");
      }
    }

    phase = "reveal";
    revealBeat = 1;
    // Addressed rather than broadcast: every device gets the same round, but
    // each needs its own row marked.
    for (const record of players.values()) {
      if (record.channelId) transport?.sendTo(record.channelId, revealMessage(record));
    }
    emit();

    beatHandle = setTimeout(() => {
      if (phase !== "reveal") return;
      revealBeat = 2;
      emit();
      // Beat 2 is the last thing this question has to say, so the room advances
      // on its own from here rather than waiting on the host (`nextQuestion`
      // clears this handle, so an early PROCEED cannot double-advance).
      beatHandle = setTimeout(() => {
        if (phase !== "reveal") return;
        nextQuestion();
      }, REVEAL_HOLD_MS);
    }, REVEAL_BEAT_MS);
  }

  function recapItemFor(source: Question, chosen: string | null): RecapItem {
    return { number: source.number, question: source.question, chosen };
  }

  /**
   * The reveal as one player device should read it: the correct letter, and how
   * the rest of the room did on this question. Only ever built once the round
   * has closed, so nothing here is in flight while anyone can still answer.
   */
  function revealMessage(reader: PlayerRecord): HostMessage {
    const source = question as Question;
    const results: RoundResult[] = [...players.values()].map((record) => ({
      name: record.name,
      choice: record.current?.letter ?? null,
      correct: record.currentCorrect,
      you: record.id === reader.id,
    }));
    return { type: "reveal", number: source.number, correctLetter: source.answer, results };
  }

  function recapMessage(record: PlayerRecord): HostMessage {
    return {
      type: "recap",
      correct: record.correctCount,
      answered: record.answeredCount,
      total: playedCount,
      score: record.score,
      missed: record.missed,
      standings: config.hostPlays ? standingsFor(record) : null,
    };
  }

  /**
   * The leaderboard as one player device should read it. Sent only when the
   * host is playing: their screen is then a personal one that nobody else in
   * the room can see, so "who won" has nowhere else to be shown (spec §5.10).
   */
  function standingsFor(reader: PlayerRecord): StandingEntry[] {
    return rankScored(
      [...players.values()].map((record) => ({
        name: record.name,
        score: record.score,
        correct: record.correctCount,
        you: record.id === reader.id,
      })),
    );
  }

  function finish(): void {
    stopTicking();
    clearBeat();
    phase = "over";
    revealBeat = 0;
    for (const record of players.values()) {
      if (record.channelId) transport?.sendTo(record.channelId, recapMessage(record));
    }
    emit();
  }

  function clearBeat(): void {
    if (beatHandle) clearTimeout(beatHandle);
    beatHandle = null;
  }

  function nextQuestion(): void {
    clearBeat();
    if (drawer) {
      present(drawer.next());
      return;
    }
    if (index + 1 >= sequence.length) {
      finish();
      return;
    }
    present(sequence[index + 1]);
  }

  syncHostSeat();
  openTransport();

  return {
    getState,

    subscribe(listener) {
      listeners.add(listener);
      listener(getState());
      return () => listeners.delete(listener);
    },

    setConfig(next) {
      if (phase !== "lobby" && phase !== "opening") return;
      config = { ...next, categories: [...next.categories] };
      // Seating or standing the host down changes the crew, so the room has to
      // hear about it the same way it hears about an arrival.
      if (syncHostSeat() && phase === "lobby") broadcastLobby();
      emit();
    },

    setRoomCode(code) {
      if (phase !== "lobby" && phase !== "opening") return;
      if (code === roomCode || code === "") return;
      roomCode = code;
      // Everyone in the room reached it via the old code; they must re-join
      // under the new one, so drop the roster rather than show a stale list.
      players.clear();
      channelToPlayer.clear();
      openTransport();
    },

    start() {
      if (phase !== "lobby") return;
      const pool = poolForConfig();
      if (pool.length === 0 || players.size === 0) return;

      stopPinging();
      index = -1;
      playedCount = 0;
      sequence = [];
      drawer = null;

      if (config.count === "endless") {
        total = null;
        drawer = createEndlessDrawer(pool, mathRandom);
      } else {
        const requested = config.count === "all" ? pool.length : config.count;
        total = Math.min(requested, pool.length);
        sequence = buildSequence(pool, total, config.featuresOn, mathRandom);
        total = sequence.length;
      }

      for (const record of players.values()) {
        record.score = 0;
        record.correctCount = 0;
        record.answeredCount = 0;
        record.current = null;
        record.currentCorrect = null;
        record.missed = [];
      }

      nextQuestion();
    },

    answerLocal(letter) {
      const seat = players.get(HOST_SEAT_ID);
      if (!seat || phase !== "question" || !question) return;
      if (seat.current) return; // locked once answered, exactly like a player
      if (timerSeconds !== null && performance.now() >= deadline) return;
      seat.current = { letter, elapsedMs: performance.now() - questionStart };
      emit();
      if (everyoneAnswered()) toReveal();
    },

    advance() {
      if (phase === "question") toReveal();
      else if (phase === "reveal") nextQuestion();
    },

    endGame() {
      if (phase === "question" || phase === "reveal") finish();
    },

    restart() {
      if (phase !== "over") return;
      clearBeat();
      question = null;
      index = -1;
      total = null;
      revealBeat = 0;
      timerSeconds = null;
      phase = "lobby";
      // Everyone returns to the lobby together, same room, no re-scanning
      // (spec §5.8) — and the liveness probe resumes to prune whoever left.
      broadcastLobby();
      startPinging();
      emit();
    },

    destroy() {
      listeners.clear();
      stopTicking();
      stopPinging();
      clearBeat();
      transport?.destroy();
      transport = null;
    },
  };
}
