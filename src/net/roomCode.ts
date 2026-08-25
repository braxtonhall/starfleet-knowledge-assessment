import type { Random } from "../logic/random";
import { mathRandom } from "../logic/random";

/**
 * Room identity (spec §5.2: "auto-generated, editable"). The room code *is* the
 * host's peer id on the public broker, so it has to survive a round trip
 * through a URL, a QR code, and someone reading it off a projector and typing
 * it into a phone. Hence: uppercase, no lookalike characters, one separator.
 */

/** Namespace on the shared public broker so we can't collide with another app. */
export const PEER_PREFIX = "stfka-";

export const ROOM_QUERY_PARAM = "room";

export const MAX_ROOM_LENGTH = 24;

const VESSELS = [
  "ENTERPRISE",
  "VOYAGER",
  "DEFIANT",
  "DISCOVERY",
  "RECIPROCITY",
  "EXCELSIOR",
  "STARGAZER",
  "PROMETHEUS",
  "CERRITOS",
  "TITAN",
  "SARATOGA",
  "YAMATO",
  "PASTEUR",
  "BOZEMAN",
];

/** `0/O` and `1/I` are unreadable off a projected screen, so they're excluded. */
const DIGITS = "23456789";

export function generateRoomCode(random: Random = mathRandom): string {
  const vessel = VESSELS[Math.floor(random() * VESSELS.length)];
  let registry = "";
  for (let i = 0; i < 4; i += 1) {
    registry += DIGITS[Math.floor(random() * DIGITS.length)];
  }
  return `${vessel}-${registry}`;
}

/**
 * Fold anything a human might type — lowercase, spaces, stray punctuation, a
 * pasted join URL — into the canonical form. Returns `""` for input that can't
 * be a room code, which callers treat as "not joinable yet".
 */
export function normalizeRoomCode(input: string): string {
  return input
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_ROOM_LENGTH);
}

export function isValidRoomCode(code: string): boolean {
  return /^[A-Z0-9][A-Z0-9-]*$/.test(code) && code.length <= MAX_ROOM_LENGTH;
}

export function peerIdFor(roomCode: string): string {
  return `${PEER_PREFIX}${roomCode}`;
}

/**
 * The link behind the QR code. A phone's own camera app opens it directly — the
 * app never asks for camera permission or decodes anything itself.
 */
export function joinUrlFor(roomCode: string, base: Location | URL = window.location): string {
  const url = new URL(base instanceof URL ? base.href : base.href);
  url.hash = "";
  url.search = "";
  url.searchParams.set(ROOM_QUERY_PARAM, roomCode);
  return url.href;
}

/** Reads the deep-link room out of the current URL (spec §5.1). */
export function roomCodeFromUrl(search: string = window.location.search): string {
  const raw = new URLSearchParams(search).get(ROOM_QUERY_PARAM);
  return raw ? normalizeRoomCode(raw) : "";
}
