import { h } from "../dom";
import { copy } from "../../copy";
import type { RecapItem } from "../../data/types";

/**
 * One line of an end-of-drill review (spec §5.5): the question, and a tag when
 * it was never answered at all. Deliberately never the correct answer — an
 * answer is shown once, in the reveal beat that follows the attempt, and a list
 * you can sit and read afterwards is exactly what that rule excludes.
 *
 * Shared by the player recap, the host's own copy of it when they have taken a
 * seat (spec §5.10), and each officer's list at the end of a Duty Rotation.
 */
export function missedRow(item: RecapItem): HTMLElement {
  return h(
    "li",
    { className: "bullet-mars" },
    h(
      "span",
      { className: "results-missed-item" },
      h("span", { textContent: copy.browse.item(item.number) }),
      item.chosen === null
        ? h("span", { className: "results-missed-tag", textContent: copy.results.skipped })
        : null,
    ),
    h("span", { className: "results-missed-question", textContent: item.question }),
  );
}
