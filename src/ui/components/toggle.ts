import { h } from "../dom";

export function createToggle(options: {
  label: string;
  on: boolean;
  onChange: (on: boolean) => void;
}): HTMLElement {
  const row = h("div", { className: "toggle-row" });
  const label = h("span", { className: "toggle-label", textContent: options.label });
  const button = h(
    "button",
    { className: "toggle-btn", type: "button", "aria-pressed": String(options.on) },
    options.on ? "ON" : "OFF",
  );

  function applyState(): void {
    button.classList.toggle("toggle-btn--on", options.on);
    button.textContent = options.on ? "ON" : "OFF";
    button.setAttribute("aria-pressed", String(options.on));
  }

  button.addEventListener("click", () => {
    options.on = !options.on;
    applyState();
    options.onChange(options.on);
  });

  applyState();
  row.appendChild(label);
  row.appendChild(button);
  return row;
}
