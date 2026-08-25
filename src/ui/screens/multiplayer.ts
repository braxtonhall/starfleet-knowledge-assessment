import { h } from "../dom";
import { copy } from "../../copy";
import { beepTap, screenHeading } from "../lcars";
import type { ScreenRenderer } from "../../app-context";

/**
 * Spec §5.1: the two ways into a room. Host on the device that owns the shared
 * screen, join on the device you answer from.
 *
 * Duty Rotation (spec §5.11) is listed last and carries a tone of its own: the
 * two above it are the pair that need a network and should keep reading as a
 * pair, while this is the option for when there is no second device to be had.
 */
export const render: ScreenRenderer = (ctx, _params, main) => {
  main.appendChild(screenHeading(copy.crew.heading));

  const choices = h("div", { className: "landing-choices" });

  for (const entry of [
    { screen: "hostGame" as const, title: copy.crew.host, sub: copy.crew.hostSub, tone: "solo" },
    { screen: "joinGame" as const, title: copy.crew.join, sub: copy.crew.joinSub, tone: "crew" },
    {
      screen: "rotationGame" as const,
      title: copy.rotation.entry,
      sub: copy.rotation.entrySub,
      tone: "rotation",
    },
  ]) {
    const button = h(
      "button",
      { className: `landing-choice landing-choice--${entry.tone}`, type: "button" },
      h("span", { className: "landing-choice-title", textContent: entry.title }),
      h("span", { className: "landing-choice-sub", textContent: entry.sub }),
    );
    button.addEventListener("click", () => {
      beepTap();
      ctx.navigate(entry.screen);
    });
    choices.appendChild(button);
  }

  main.appendChild(choices);
};
