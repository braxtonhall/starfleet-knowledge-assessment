import { h } from "../dom";
import { copy } from "../../copy";
import { screenHeading } from "../lcars";
import type { ScreenRenderer } from "../../app-context";

export const render: ScreenRenderer = (ctx, params, main) => {
  if (!params || params.kind !== "results") {
    ctx.navigate("hub");
    return;
  }

  const { result, config, isRecord } = params;

  main.appendChild(screenHeading(copy.results.complete));

  const rating = h("p", { className: "results-rating", textContent: copy.results.efficiency(result.correct, result.total) });
  main.appendChild(rating);

  if (config.speedBonus && result.bonus > 0) {
    main.appendChild(h("p", { className: "results-bonus", textContent: copy.results.bonus(result.bonus) }));
  }

  if (isRecord) {
    main.appendChild(h("h3", { className: "font-mars blink results-record", textContent: copy.results.newRecord }));
  }

  main.appendChild(h("h2", { className: "results-review-heading", textContent: copy.results.review }));

  if (result.missed.length === 0) {
    main.appendChild(h("p", { className: "results-clean", textContent: copy.play.confirmed }));
  } else {
    const list = h("ul", { className: "lcars-list results-missed" });
    for (const item of result.missed) {
      list.appendChild(
        h(
          "li",
          { className: "bullet-mars" },
          h(
            "span",
            { className: "results-missed-item" },
            h("span", { textContent: copy.browse.item(item.number) }),
            item.skipped ? h("span", { className: "results-missed-tag", textContent: copy.results.skipped }) : null,
          ),
          h("span", { className: "results-missed-question", textContent: item.question }),
        ),
      );
    }
    main.appendChild(list);
  }

  const actions = h(
    "div",
    { className: "buttons" },
    h(
      "button",
      { type: "button", onClick: () => ctx.navigate("play", { kind: "play", config }) },
      copy.results.reEngage,
    ),
    h(
      "button",
      { type: "button", className: "button-honey", onClick: () => ctx.navigate("hub") },
      copy.results.return,
    ),
  );
  main.appendChild(actions);
};
