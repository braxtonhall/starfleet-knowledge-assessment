import { h, clear } from "../dom";
import { copy } from "../../copy";
import { createAccordion } from "../components/accordion";
import { confirmDestructive } from "../components/resetConfirm";
import { countsFor } from "../../state/answerLog";
import { screenHeading } from "../lcars";
import type { ScreenRenderer } from "../../app-context";

export const render: ScreenRenderer = (ctx, _params, main) => {
  // Persist the collapsed/expanded state across the re-render that follows a purge.
  let categoriesOpen = false;

  function renderScreen(): void {
    clear(main);
    main.appendChild(screenHeading(copy.options.heading));

    const stats = countsFor(ctx.answerLog, ctx.questions.map((q) => q.number));
    main.appendChild(
      h(
        "p",
        { className: "options-stats" },
        `${stats.correct} CONFIRMED · ${stats.incorrect} INCORRECT · ${stats.unanswered} UNANSWERED`,
      ),
    );

    const purgeAll = h("button", { className: "lcars-action", type: "button" }, copy.options.purgeAll);
    purgeAll.addEventListener("click", () => {
      confirmDestructive({
        message: copy.options.purgeAllConfirm,
        onConfirm: () => {
          ctx.resetAll();
          renderScreen();
        },
      });
    });
    main.appendChild(h("div", { className: "options-block" }, purgeAll));

    // Spec §4.3: per-discipline purge stays collapsed behind its own menu rather
    // than putting eleven destructive buttons on screen at once.
    const categories = createAccordion({
      header: h(
        "span",
        { className: "disc-title" },
        h("span", { textContent: copy.options.purgeByDiscipline }),
        h("span", { className: "disc-title-count", textContent: String(ctx.categories.length) }),
      ),
      initiallyOpen: categoriesOpen,
      onToggle: (open) => {
        categoriesOpen = open;
      },
    });

    const list = h("div", { className: "options-category-list" });
    for (const category of ctx.categories) {
      const counts = countsFor(ctx.answerLog, category.questions.map((q) => q.number));
      const answered = counts.correct + counts.incorrect;
      const purge = h(
        "button",
        {
          className: "lcars-action lcars-action--small",
          type: "button",
          disabled: answered === 0,
        },
        copy.options.purge,
      );
      purge.addEventListener("click", () => {
        confirmDestructive({
          message: copy.options.purgeCategoryConfirm(category.title, answered),
          onConfirm: () => {
            ctx.resetCategory(category.title);
            renderScreen();
          },
        });
      });
      list.appendChild(
        h(
          "div",
          { className: "options-category-row" },
          h("span", { className: "options-category-title", textContent: category.title.toUpperCase() }),
          h("span", { className: "options-category-count", textContent: `${answered} LOGGED` }),
          purge,
        ),
      );
    }

    categories.contentEl.appendChild(list);
    main.appendChild(h("div", { className: "options-categories" }, categories.root));
  }

  renderScreen();
};
