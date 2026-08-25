import { h } from "../dom";
import { OPTION_LETTERS } from "../../data/types";

export interface AnswerOptionsHandle {
  root: HTMLElement;
  /** Freeze the board on a choice without giving away whether it was right —
   *  a multiplayer player waits for the host's reveal (spec §5.5). */
  lock(chosen: string): void;
  reveal(correct: string | null, chosen: string): void;
}

export function createAnswerOptions(options: {
  options: Record<string, string>;
  /** Omitted on the host display, which shows the options but never answers
   *  them (spec §5.3). */
  onSelect?: (letter: string) => void;
}): AnswerOptionsHandle {
  const root = h("div", { className: "answer-list" });
  const buttons = new Map<string, HTMLButtonElement>();
  let locked = options.onSelect === undefined;
  if (locked) root.classList.add("answer-list--readonly");

  for (const letter of OPTION_LETTERS) {
    const text = options.options[letter] ?? "";
    const button = h(
      "button",
      { className: "answer", type: "button" },
      h("span", { className: "answer-letter", textContent: `${letter}.` }),
      h("span", { className: "answer-text", textContent: text }),
    );
    button.addEventListener("click", () => {
      if (locked || text === "" || !options.onSelect) return;
      locked = true;
      options.onSelect(letter);
    });
    buttons.set(letter, button);
    root.appendChild(button);
  }

  return {
    root,
    lock(chosen) {
      locked = true;
      for (const [letter, button] of buttons) {
        button.disabled = true;
        button.classList.toggle("answer--chosen", letter === chosen);
        button.classList.toggle("answer--dim", letter !== chosen);
      }
    },
    reveal(correct, chosen) {
      locked = true;
      for (const [letter, button] of buttons) {
        button.disabled = true;
        // A locked board is being re-decorated, so drop its holding state first.
        button.classList.remove("answer--chosen", "answer--dim");
        if (correct !== null && letter === correct) button.classList.add("answer--correct");
        else if (letter === chosen) button.classList.add("answer--wrong");
        else button.classList.add("answer--dim");
      }
    },
  };
}
