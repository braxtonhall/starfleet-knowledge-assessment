import { h } from "../dom";
import { copy } from "../../copy";
import { screenHeading } from "../lcars";
import type { ScreenRenderer } from "../../app-context";

export const render: ScreenRenderer = (ctx, _params, main) => {
  main.appendChild(screenHeading(copy.hub.heading));

  const entries: Array<{ screen: "quickPlayConfig" | "browse" | "options"; title: string; sub: string }> = [
    { screen: "quickPlayConfig", title: copy.hub.quickDrill, sub: copy.hub.quickDrillSub },
    { screen: "browse", title: copy.hub.database, sub: copy.hub.databaseSub },
    { screen: "options", title: copy.hub.systems, sub: copy.hub.systemsSub },
  ];

  const list = h("div", { className: "hub-entries" });
  for (const entry of entries) {
    const button = h(
      "button",
      { className: "hub-entry", type: "button" },
      h("span", { className: "hub-entry-title", textContent: entry.title }),
      h("span", { className: "hub-entry-sub", textContent: entry.sub }),
    );
    button.addEventListener("click", () => ctx.navigate(entry.screen));
    list.appendChild(button);
  }
  main.appendChild(list);
};
