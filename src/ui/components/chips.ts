import { h } from "../dom";

export interface ChipChoice {
  value: string;
  label: string;
  disabled?: boolean;
}

export function createChips(options: {
  choices: ChipChoice[];
  selected: string;
  onSelect: (value: string) => void;
}): HTMLElement {
  const group = h("div", { className: "chips" });

  for (const choice of options.choices) {
    const chip = h(
      "button",
      { className: "chip", type: "button" },
      h("span", { className: "chip-label", textContent: choice.label }),
    );

    if (choice.disabled) {
      chip.classList.add("chip--disabled");
      chip.disabled = true;
    }

    function applyState(): void {
      chip.classList.toggle("chip--selected", options.selected === choice.value);
    }

    chip.addEventListener("click", () => {
      if (choice.disabled) return;
      options.selected = choice.value;
      for (const sibling of group.children) sibling.classList.remove("chip--selected");
      applyState();
      options.onSelect(choice.value);
    });

    applyState();
    group.appendChild(chip);
  }

  return group;
}
