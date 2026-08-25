/**
 * The host↔player message protocol (spec §8 left this deferred; this module is
 * the concrete answer).
 *
 * Topology is a star: every player holds one WebRTC data channel to the host,
 * and the host is the sole authority. Players never talk to each other, never
 * see another player's answer, and never compute their own score — the host
 * owns the question sequence, the clock, and the leaderboard (spec §5.3).
 *
 * Every field a player needs is pushed to it; a player never polls.
 */
import type { RecapItem } from "../data/types";

export const PROTOCOL_VERSION = 1;

/** How many players one room accepts. Past this the roster stops being legible
 *  on a shared screen long before WebRTC runs out of channels. */
export const MAX_PLAYERS = 16;

/** The question as it crosses the wire — deliberately not the full `Question`.
 *  Sending `answer`/`answer_text` would hand the correct letter to anyone with
 *  a devtools console open. */
export interface QuestionPayload {
  number: number;
  question: string;
  options: Record<string, string>;
  category: string;
  featureText: string | null;
}

export interface RosterEntry {
  id: string;
  name: string;
  connected: boolean;
}

/**
 * One line of a player's end-of-drill review — question-only, so the correct
 * letter never travels back onto a screen (or into a devtools console) after
 * the reveal beat that showed it once.
 *
 * The type itself lives in `data/types`: it describes a recap line rather than
 * a wire format, and Duty Rotation builds the same lines without ever opening a
 * channel. Re-exported here because it is part of this protocol's payloads.
 */
export type { RecapItem };

/**
 * How one player fared on the question that just closed, as it travels to the
 * other player devices.
 *
 * This rides the reveal beat and only the reveal beat: by then the host display
 * is showing every choice and every verdict to the whole room anyway, so
 * putting the same thing on the phones leaks nothing — it just means a player
 * can tell whether they were the only one who missed it without a shared screen
 * to look at. Nothing here is sent while the question is still open, and no
 * running total is carried; the leaderboard is still an end-of-drill event.
 */
export interface RoundResult {
  name: string;
  /** `null` when they never answered. */
  choice: string | null;
  correct: boolean | null;
  /** True on the row belonging to the device this message was addressed to. */
  you: boolean;
}

/**
 * One row of the final leaderboard as a *player* device sees it.
 *
 * Normally the cumulative table is the host screen's alone (spec §5.4.6) and
 * this is never sent. It exists for the host-plays configuration (spec §5.10),
 * where the host device is somebody's personal screen and nobody else can read
 * the standings off it — so the standings have to travel to the devices that
 * can. Scores only: still no answers, and still nothing about what anyone
 * picked on any individual question.
 */
export interface StandingEntry {
  name: string;
  score: number;
  correct: number;
  /** True on the row belonging to the device this message was addressed to. */
  you: boolean;
}

export type RejectReason = "locked" | "version" | "full";

export type PlayerMessage =
  | { type: "join"; version: number; clientId: string }
  | { type: "answer"; number: number; letter: string; elapsedMs: number }
  | { type: "pong"; nonce: number };

export type HostMessage =
  | { type: "welcome"; version: number; playerId: string; name: string; roomName: string }
  | { type: "rejected"; reason: RejectReason }
  | { type: "lobby"; roomName: string; roster: RosterEntry[] }
  | {
      type: "question";
      index: number;
      /** `null` in an endless game — there is no final position. */
      total: number | null;
      question: QuestionPayload;
      /** `null` when this question is untimed (spec §4.1, §5.9). */
      timerSeconds: number | null;
      showFeature: boolean;
      /** Non-null only when replaying to a reconnecting player (spec §5.8). */
      yourChoice: string | null;
    }
  | {
      type: "reveal";
      number: number;
      correctLetter: string | null;
      /** How the rest of the room did on this question. */
      results: RoundResult[];
    }
  | {
      type: "recap";
      correct: number;
      answered: number;
      total: number;
      score: number;
      missed: RecapItem[];
      /** `null` in an ordinary drill, where the leaderboard belongs to the host
       *  screen alone (spec §5.4.6, §5.10). */
      standings: StandingEntry[] | null;
    }
  | { type: "ping"; nonce: number };

/**
 * A data channel carries whatever the peer chose to send, so both ends
 * validate before dispatch rather than trusting the shape.
 */
export function asPlayerMessage(value: unknown): PlayerMessage | null {
  if (!isRecord(value)) return null;
  switch (value.type) {
    case "join":
      return typeof value.version === "number" && typeof value.clientId === "string"
        ? { type: "join", version: value.version, clientId: value.clientId }
        : null;
    case "answer":
      return typeof value.number === "number" &&
        typeof value.letter === "string" &&
        typeof value.elapsedMs === "number"
        ? { type: "answer", number: value.number, letter: value.letter, elapsedMs: value.elapsedMs }
        : null;
    case "pong":
      return typeof value.nonce === "number" ? { type: "pong", nonce: value.nonce } : null;
    default:
      return null;
  }
}

export function asHostMessage(value: unknown): HostMessage | null {
  if (!isRecord(value)) return null;
  const known = new Set(["welcome", "rejected", "lobby", "question", "reveal", "recap", "ping"]);
  return known.has(value.type as string) ? (value as HostMessage) : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
