import { h, clear } from "../dom";
import { copy } from "../../copy";

/**
 * The crew roster. Which face it shows is what paces spec §5.4: binary status
 * during the question so nothing leaks, then choices, then correctness. The
 * final leaderboard is a different list with a different job — see
 * `createStandings`.
 *
 * The host display draws it from its own player records; a player device draws
 * it at reveal from the round result the host sent (spec §5.5), which is why
 * this takes a minimal shape rather than `HostPlayerView`.
 */
export type RosterMode = "lobby" | "status" | "choices" | "verdict";

export interface RosterPerson {
  name: string;
  connected: boolean;
  answered: boolean;
  /** Withheld until reveal beat 1 by whoever builds this. */
  choice: string | null;
  /** Withheld until reveal beat 2 by whoever builds this. */
  correct: boolean | null;
  /** Marks the host's own seat when they are playing (spec §5.10). */
  isHost?: boolean;
  /** Marks the reader's own row, on a device that is looking at the room. */
  you?: boolean;
}

export interface Roster {
  root: HTMLElement;
  update(people: readonly RosterPerson[], mode: RosterMode): void;
}

export function createRoster(): Roster {
  // Not `.lcars-list`: its decorative bullet would sit next to the status dot,
  // which is the marker that actually means something here.
  const root = h("ul", { className: "roster" });

  return {
    root,
    update(people, mode) {
      clear(root);

      if (people.length === 0) {
        root.appendChild(
          h("li", { className: "roster-empty", textContent: copy.crew.rosterEmpty }),
        );
        return;
      }

      // The host holds players in arrival order. In the ready room that gets
      // reversed so a new arrival lands at the top, where the host is watching
      // for it, rather than at the bottom of a list that may already be
      // scrolled. During play the order stays put — a roster that reshuffles
      // between questions is impossible to read at a glance.
      const ordered = mode === "lobby" ? [...people].reverse() : people;

      for (const person of ordered) root.appendChild(rowFor(person, mode));
    },
  };
}

function rowFor(person: RosterPerson, mode: RosterMode): HTMLElement {
  const row = h("li", { className: "roster-row" });
  if (!person.connected) row.classList.add("roster-row--gone");
  if (person.you) row.classList.add("roster-row--you");

  row.appendChild(h("span", { className: "roster-dot", textContent: dotFor(person, mode) }));
  row.appendChild(h("span", { className: "roster-name", textContent: person.name }));
  if (person.isHost) {
    row.appendChild(h("span", { className: "roster-tag roster-tag--command", textContent: copy.crew.command }));
  }

  const trailing = trailingFor(person, mode);
  if (trailing) row.appendChild(trailing);

  return row;
}

function dotFor(person: RosterPerson, mode: RosterMode): string {
  if (!person.connected) return "○";
  if (mode === "status") return person.answered ? "●" : "◌";
  return "●";
}

function trailingFor(person: RosterPerson, mode: RosterMode): HTMLElement | null {
  switch (mode) {
    case "lobby":
      // The dot already says "aboard"; spelling it out on every row just steals
      // width from the names in a narrow roster column.
      return person.connected
        ? null
        : h("span", { className: "roster-tag", textContent: copy.crew.signalLost });

    case "status":
      // Binary only — no hint of what was picked or whether it is right, so a
      // player glancing at the shared screen learns nothing but the turn order.
      return h("span", {
        className: `roster-tag ${person.answered ? "roster-tag--in" : "roster-tag--waiting"}`,
        textContent: person.answered ? copy.crew.logged : copy.crew.awaiting,
      });

    case "choices":
    case "verdict": {
      if (person.choice === null) {
        return h("span", { className: "roster-tag roster-tag--waiting", textContent: copy.crew.noResponse });
      }
      const chip = h("span", { className: "roster-choice", textContent: person.choice });
      if (mode === "verdict" && person.correct !== null) {
        chip.classList.add(person.correct ? "roster-choice--correct" : "roster-choice--wrong");
      }
      return chip;
    }
  }
}
