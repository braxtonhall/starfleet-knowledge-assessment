import { h, clear } from "../dom";
import type { Category } from "../../data/types";

export interface CategoryFilter {
  root: HTMLElement;
  selectedTitles(): string[];
  refreshCounts(counts: Map<string, number>): void;
}

export function createCategoryFilter(options: {
  categories: Category[];
  selected: string[];
  counts: Map<string, number>;
  onChange: (selected: string[]) => void;
}): CategoryFilter {
  const root = h("div", { className: "category-filter" });
  const list = h("div", { className: "category-filter-list" });
  root.appendChild(list);

  let selected = new Set(options.selected);
  let counts = options.counts;

  function render(): void {
    clear(list);
    for (const category of options.categories) {
      // `counts` holds the drawable pool, which is smaller than the category
      // whenever a question is missing options. Show both so the number can't
      // be misread as the category size.
      const drawable = counts.get(category.title) ?? 0;
      const total = category.questions.length;
      const checked = selected.has(category.title);
      const row = h(
        "button",
        { className: "category-row", type: "button", "aria-pressed": String(checked) },
        h("span", { className: "category-check", textContent: checked ? "■" : "□" }),
        h("span", { className: "category-title", textContent: category.title.toUpperCase() }),
        h("span", {
          className: "category-count",
          title: drawable === total ? undefined : `${drawable} OF ${total} ITEMS ARE DRAWABLE`,
          textContent: drawable === total ? String(total) : `${drawable} / ${total}`,
        }),
      );
      row.addEventListener("click", () => {
        if (checked) selected.delete(category.title);
        else selected.add(category.title);
        options.onChange([...selected]);
        render();
      });
      list.appendChild(row);
    }
  }

  render();

  return {
    root,
    selectedTitles: () => [...selected],
    refreshCounts(nextCounts) {
      counts = nextCounts;
      render();
    },
  };
}
