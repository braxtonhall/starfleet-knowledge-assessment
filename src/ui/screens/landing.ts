import { h } from "../dom";
import { copy } from "../../copy";
import { screenHeading } from "../lcars";
import type { ScreenRenderer } from "../../app-context";

export const render: ScreenRenderer = (ctx, _params, main) => {
  // The banner already carries the program name (plan §5.1), so the screen
  // leads with the sub-line rather than repeating the title at h1 size.
  main.appendChild(screenHeading(copy.landing.sub));

  const choices = h("div", { className: "landing-choices" });

  const solo = h(
    "button",
    { className: "landing-choice landing-choice--solo", type: "button" },
    h("span", { className: "landing-choice-title", textContent: copy.landing.solo }),
    h("span", { className: "landing-choice-sub", textContent: copy.landing.soloSub }),
  );
  solo.addEventListener("click", () => ctx.navigate("hub"));
  choices.appendChild(solo);

  const crew = h(
    "button",
    { className: "landing-choice landing-choice--crew", type: "button" },
    h("span", { className: "landing-choice-title", textContent: copy.landing.crew }),
    h("span", { className: "landing-choice-sub", textContent: copy.landing.crewSub }),
  );
  crew.addEventListener("click", () => ctx.navigate("multiplayer"));
  choices.appendChild(crew);

  main.appendChild(choices);
};
