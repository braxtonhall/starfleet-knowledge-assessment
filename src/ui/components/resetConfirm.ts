import { h } from "../dom";
import { copy } from "../../copy";

export function confirmDestructive(options: {
  message: string;
  onConfirm: () => void;
}): void {
  const backdrop = h("div", { className: "modal-backdrop" });
  const panel = h(
    "div",
    { className: "modal-panel" },
    h("p", { className: "modal-message", textContent: options.message }),
    h(
      "div",
      { className: "modal-actions" },
      h(
        "button",
        {
          className: "lcars-action",
          type: "button",
          onClick: () => {
            backdrop.remove();
            options.onConfirm();
          },
        },
        copy.options.acknowledge,
      ),
      h(
        "button",
        { className: "lcars-action lcars-action--muted", type: "button", onClick: () => backdrop.remove() },
        copy.options.abort,
      ),
    ),
  );
  backdrop.appendChild(panel);
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) backdrop.remove();
  });
  document.body.appendChild(backdrop);
}
