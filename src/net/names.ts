import type { Random } from "../logic/random";
import { mathRandom } from "../logic/random";

/**
 * Personnel designations (voice plan §4). Players never type a nickname
 * (spec §5.2) — a rank plus a closed-vocabulary noun reads like a roster entry
 * and is short enough to sit next to a score on a projected screen.
 */
const RANKS = ["ENSIGN", "LIEUTENANT", "LT. CMDR.", "COMMANDER", "CADET"];

const NOUNS = [
  "GALAXY",
  "SOVEREIGN",
  "INTREPID",
  "DEFIANT",
  "AKIRA",
  "NEBULA",
  "CONSTITUTION",
  "MIRANDA",
  "EXCELSIOR",
  "OBERTH",
  "STEAMRUNNER",
  "PROMETHEUS",
  "VULCAN",
  "ANDORIA",
  "BAJOR",
  "BETAZED",
  "RISA",
  "TRILL",
  "TELLAR",
  "CARDASSIA",
  "ORION",
  "BOLARUS",
  "ARGELIUS",
  "IZAR",
];

export function randomDesignation(taken: Iterable<string>, random: Random = mathRandom): string {
  const used = new Set(taken);
  // Bounded retry, then fall through to a numeric suffix — a full room must
  // still be able to name its next arrival.
  for (let attempt = 0; attempt < 64; attempt += 1) {
    const name = `${pick(RANKS, random)} ${pick(NOUNS, random)}`;
    if (!used.has(name)) return name;
  }
  let suffix = 2;
  const base = `${pick(RANKS, random)} ${pick(NOUNS, random)}`;
  while (used.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

function pick<T>(items: T[], random: Random): T {
  return items[Math.floor(random() * items.length)];
}
