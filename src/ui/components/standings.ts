import { h, clear } from "../dom";
import { copy } from "../../copy";
import { leadersOf, rankScored } from "../../logic/standings";

/**
 * The final leaderboard (spec §5.4.6). One component rather than two because
 * when the host has taken a seat (spec §5.10) the same table is drawn on the
 * host display *and* on every player device — and two screens in the same room
 * disagreeing about who won would be worse than not showing it at all.
 */

export interface StandingRow {
  name: string;
  score: number;
  /** Marks the reader's own row. Every device gets the same table, so this is
   *  the only thing that differs between two of them. */
  you: boolean;
  /** Optional correct/attempted tally beside the score. Duty Rotation carries
   *  it (spec §5.11) so a speed-bonus upset — or an officer who never got their
   *  last turn — is legible rather than mysterious. */
  detail?: string;
}

export interface Standings {
  root: HTMLElement;
  update(rows: readonly StandingRow[]): void;
}

export function createStandings(): Standings {
  const verdict = h("p", { className: "standings-verdict", hidden: true });
  // The same `.roster` classes the ready room uses: this is the same list of
  // people, at the end of the drill rather than the start of it.
  const list = h("ul", { className: "roster" });
  const root = h("div", { className: "standings" }, verdict, list);

  return {
    root,
    update(rows) {
      clear(list);
      if (rows.length === 0) {
        verdict.hidden = true;
        list.appendChild(h("li", { className: "roster-empty", textContent: copy.crew.rosterEmpty }));
        return;
      }

      const leaders = leadersOf(rows);
      // A single-seat drill has a top score but no one to have beaten, so it
      // gets the table without the fanfare.
      verdict.hidden = rows.length < 2;
      verdict.textContent =
        leaders.length === 1
          ? copy.crew.commendation(leaders[0].name)
          : copy.crew.deadHeat(leaders.map((entry) => entry.name).join(" · "));

      let rank = 0;
      for (const row of rankScored(rows)) {
        rank += 1;
        list.appendChild(rowFor(row, rank));
      }
    },
  };
}

function rowFor(row: StandingRow, rank: number): HTMLElement {
  const element = h("li", { className: "roster-row roster-row--standing" });
  if (row.you) element.classList.add("roster-row--you");
  element.appendChild(
    h("span", { className: "roster-rank", textContent: String(rank).padStart(2, "0") }),
  );
  element.appendChild(h("span", { className: "roster-name", textContent: row.name }));
  if (row.you) element.appendChild(h("span", { className: "roster-tag", textContent: copy.crew.you }));
  if (row.detail !== undefined) {
    element.appendChild(h("span", { className: "roster-tag roster-tag--tally", textContent: row.detail }));
  }
  element.appendChild(h("span", { className: "roster-score", textContent: String(row.score) }));
  return element;
}
