import { h } from "../dom";
import { copy } from "../../copy";
import { createConfigForm } from "../components/configForm";
import { beepTap, screenHeading } from "../lcars";
import type { ScreenRenderer } from "../../app-context";
import { defaultConfig } from "../../data/types";

export const render: ScreenRenderer = (ctx, _params, main) => {
  const allTitles = ctx.categories.map((category) => category.title);
  const previous = ctx.lastConfig();
  const config = previous
    ? {
        ...previous,
        categories: previous.categories.length > 0 ? [...previous.categories] : [...allTitles],
      }
    : defaultConfig(allTitles);

  main.appendChild(screenHeading(copy.config.heading));

  const poolLabel = h("span", { className: "config-pool" });
  const engage = h(
    "button",
    { className: "lcars-action lcars-action--wide", type: "button" },
    copy.config.engage,
  );
  const footer = h("div", { className: "config-footer" }, poolLabel, engage);

  const form = createConfigForm({
    categories: ctx.categories,
    pool: ctx.playable,
    config,
    onChange: (_next, poolSize) => updateFooter(poolSize),
  });

  function updateFooter(poolSize: number): void {
    poolLabel.textContent =
      poolSize > 0 ? `${poolSize} ${copy.config.itemsAvailable}` : copy.config.poolEmpty;
    engage.disabled = poolSize === 0;
  }

  engage.addEventListener("click", () => {
    beepTap();
    ctx.saveConfig(config);
    ctx.navigate("play", { kind: "play", config });
  });

  form.root.appendChild(footer);
  updateFooter(form.poolSize());
  main.appendChild(form.root);
};
