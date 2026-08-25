import { h, clear } from "../dom";
import { copy } from "../../copy";
import { createChips } from "./chips";
import { createToggle } from "./toggle";
import { createAccordion } from "./accordion";
import { createCategoryFilter } from "./categoryFilter";
import { countsByCategory } from "../../logic/pool";
import { hasFeatureText } from "../../logic/weighting";
import type { Category, CountChoice, Question, QuizConfig } from "../../data/types";

/**
 * The assessment controls shared by Quick Drill and the host lobby — spec §5.2
 * asks for "the same core config controls as Solo Quick Play", so they are one
 * component rather than two that drift apart.
 *
 * The root is the `.config-form` panel; callers append their own footer (pool
 * size, ENGAGE, and in multiplayer the room controls) into it. The controls
 * themselves sit in a box of their own, so re-rendering them after a toggle
 * does not tear out the caller's footer along with them.
 *
 * `lead` is for a control that belongs at the head of this panel but not to
 * every caller — the host seat (spec §5.10) and Duty Rotation's crew size
 * (§5.11) are decisions that would make no sense on the Solo screen. It is
 * re-attached rather than rebuilt on each render, so it keeps its own state.
 */

const COUNT_CHOICES = [
  { value: "10", label: "10" },
  { value: "20", label: "20" },
  { value: "50", label: "50" },
  { value: "all", label: "ALL" },
  { value: "endless", label: "∞" },
];

const TIMER_SECONDS = [
  { value: "10", label: "10" },
  { value: "20", label: "20" },
  { value: "30", label: "30" },
  { value: "60", label: "60" },
];

export interface ConfigForm {
  root: HTMLElement;
  config: QuizConfig;
  /** How many items the current settings can actually draw from. */
  poolSize(): number;
}

export function createConfigForm(options: {
  categories: Category[];
  pool: Question[];
  config: QuizConfig;
  onChange: (config: QuizConfig, poolSize: number) => void;
  lead?: HTMLElement;
  /** Duty Rotation draws this many items *each*, and says so (spec §5.11). */
  countLabel?: string;
}): ConfigForm {
  const root = h("div", { className: "config-form" });
  const controls = h("div", { className: "config-controls" });
  root.appendChild(controls);
  const config = options.config;
  let filterOpen = false;

  // Turning SUPPLEMENTAL DATA off takes the feature questions out of the pool
  // (see `eligiblePool`), so every count on this screen has two answers. Both
  // are computed once here rather than re-filtered on each keystroke.
  const countsWithFeatures = countsByCategory(options.pool);
  const countsWithoutFeatures = countsByCategory(
    options.pool.filter((question) => !hasFeatureText(question)),
  );

  function counts(): Map<string, number> {
    return config.featuresOn ? countsWithFeatures : countsWithoutFeatures;
  }

  function poolSize(): number {
    const available = counts();
    let total = 0;
    for (const title of config.categories) total += available.get(title) ?? 0;
    return total;
  }

  function changed(rerender: boolean): void {
    if (rerender) render();
    options.onChange(config, poolSize());
  }

  function render(): void {
    clear(controls);

    if (options.lead) controls.appendChild(options.lead);

    controls.appendChild(h("h3", { textContent: options.countLabel ?? copy.config.count }));
    controls.appendChild(
      createChips({
        choices: COUNT_CHOICES,
        selected: String(config.count),
        onSelect: (value) => {
          config.count = value as CountChoice;
          changed(true);
        },
      }),
    );

    controls.appendChild(
      createToggle({
        label: copy.config.responseWindow,
        on: config.timerOn,
        onChange: (on) => {
          config.timerOn = on;
          changed(true);
        },
      }),
    );

    if (config.timerOn) {
      controls.appendChild(
        createChips({
          choices: TIMER_SECONDS,
          selected: String(config.timerSeconds),
          onSelect: (value) => {
            config.timerSeconds = Number(value);
            changed(true);
          },
        }),
      );
    }

    controls.appendChild(
      createToggle({
        label: copy.config.responseEfficiency,
        on: config.speedBonus,
        onChange: (on) => {
          config.speedBonus = on;
          changed(true);
        },
      }),
    );

    // Offered at every length, including ∞. The finale bias needs a fixed final
    // position, but pool membership does not (spec §5.9) — with the toggle on,
    // an Endless run simply draws feature questions at random like any other.
    controls.appendChild(
      createToggle({
        label: copy.config.supplementalData,
        on: config.featuresOn,
        onChange: (on) => {
          config.featuresOn = on;
          changed(true);
        },
      }),
    );

    const filterCountEl = h("span", {
      className: "disc-title-count",
      textContent: `${config.categories.length} / ${options.categories.length}`,
    });
    const filterAccordion = createAccordion({
      header: h(
        "span",
        { className: "disc-title" },
        h("span", { textContent: copy.config.disciplineFilter }),
        filterCountEl,
      ),
      initiallyOpen: filterOpen,
      onToggle: (open) => {
        filterOpen = open;
      },
    });
    const filter = createCategoryFilter({
      categories: options.categories,
      selected: config.categories,
      counts: counts(),
      onChange: (selected) => {
        config.categories = selected;
        filterCountEl.textContent = `${selected.length} / ${options.categories.length}`;
        changed(false);
      },
    });
    filterAccordion.contentEl.appendChild(filter.root);
    controls.appendChild(filterAccordion.root);
  }

  render();
  return { root, config, poolSize };
}
