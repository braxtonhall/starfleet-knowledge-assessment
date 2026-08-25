import { h, clear } from "../dom";
import { copy } from "../../copy";
import { createAccordion } from "../components/accordion";
import type { Accordion } from "../components/accordion";
import { VirtualList } from "../components/virtualList";
import { openQuestionDetail } from "../components/questionDetail";
import { searchQuestions } from "../../logic/search";
import { countsFor } from "../../state/answerLog";
import { screenHeading } from "../lcars";
import type { ScreenRenderer } from "../../app-context";
import type { Question } from "../../data/types";

const ROW_HEIGHT_PX = 64;

interface CategoryEntry {
  accordion: Accordion;
  list: VirtualList | null;
}

export const render: ScreenRenderer = (ctx, _params, main) => {
  main.appendChild(screenHeading(copy.browse.heading));

  const searchInput = h("input", {
    className: "browse-search",
    type: "search",
    placeholder: copy.browse.search,
    autocomplete: "off",
    spellcheck: "false",
    "aria-label": copy.browse.search,
  });

  const counterEl = h("div", { className: "browse-counters" });
  main.appendChild(h("div", { className: "browse-toolbar" }, searchInput, counterEl));

  const accordionContainer = h("div", { className: "browse-accordions" });
  const searchContainer = h("div", { className: "browse-search-results" });
  searchContainer.hidden = true;
  main.appendChild(accordionContainer);
  main.appendChild(searchContainer);

  const entries = new Map<string, CategoryEntry>();
  let searchList: VirtualList | null = null;
  let visibleNumbers: number[] = ctx.questions.map((q) => q.number);
  let debounce = 0;

  function renderRow(question: Question): HTMLElement {
    const state = ctx.answerFor(question.number);
    const row = h("div", {
      className: `qrow qrow--${state}`,
      role: "button",
      tabindex: "0",
    });
    row.appendChild(h("span", { className: "qrow-num", textContent: copy.browse.item(question.number) }));
    row.appendChild(h("span", { className: "qrow-text", textContent: question.question }));
    if (question.feature_text) {
      row.appendChild(h("span", { className: "qrow-badge", title: copy.browse.supplemental }, "◆"));
    }
    return row;
  }

  function openItem(question: Question, index: number, list: VirtualList | null): void {
    openQuestionDetail(ctx, question, () => {
      list?.refresh(index);
      updateCounters(visibleNumbers);
    });
  }

  function updateCounters(numbers: number[]): void {
    const counts = countsFor(ctx.answerLog, numbers);
    clear(counterEl);
    counterEl.appendChild(
      h("span", { className: "counter counter--correct", textContent: copy.browse.confirmed(counts.correct) }),
    );
    counterEl.appendChild(
      h("span", { className: "counter counter--incorrect", textContent: copy.browse.incorrect(counts.incorrect) }),
    );
  }

  function closeCategory(entry: CategoryEntry): void {
    entry.list?.destroy();
    entry.list = null;
    clear(entry.accordion.contentEl);
  }

  function openCategory(title: string, questions: Question[]): void {
    // One discipline open at a time: eleven stacked headers otherwise push the
    // expanded list off-screen, which is exactly the "can't see the questions
    // while scrolling" failure.
    for (const [otherTitle, other] of entries) {
      if (otherTitle !== title && other.accordion.isOpen()) other.accordion.close();
    }

    const entry = entries.get(title);
    if (!entry) return;
    entry.list = new VirtualList(entry.accordion.contentEl, {
      rowHeight: ROW_HEIGHT_PX,
      renderRow: (item) => renderRow(item as Question),
      onItemTap: (item, index) => openItem(item as Question, index, entry.list),
    });
    entry.list.setItems(questions);
    // Pull the header *and* its list into view, not just the header — otherwise
    // the rows open below the fold.
    entry.accordion.root.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  function buildAccordions(): void {
    for (const category of ctx.categories) {
      const header = h(
        "span",
        { className: "disc-title" },
        h("span", { className: "disc-title-name", textContent: category.title.toUpperCase() }),
        h("span", { className: "disc-title-count", textContent: String(category.questions.length) }),
      );
      const accordion = createAccordion({
        header,
        panelClass: "disc-panel--list",
        onToggle: (open) => {
          const entry = entries.get(category.title);
          if (!entry) return;
          if (open) openCategory(category.title, category.questions);
          else closeCategory(entry);
        },
      });
      entries.set(category.title, { accordion, list: null });
      accordionContainer.appendChild(accordion.root);
    }
  }

  function showAccordions(): void {
    searchList?.destroy();
    searchList = null;
    clear(searchContainer);
    searchContainer.hidden = true;
    accordionContainer.hidden = false;
    visibleNumbers = ctx.questions.map((q) => q.number);
    updateCounters(visibleNumbers);
  }

  function showSearch(query: string): void {
    const results = searchQuestions(query, ctx.questions);
    searchList?.destroy();
    searchList = null;
    clear(searchContainer);
    accordionContainer.hidden = true;
    searchContainer.hidden = false;

    visibleNumbers = results.map((q) => q.number);
    updateCounters(visibleNumbers);

    if (results.length === 0) {
      searchContainer.appendChild(h("p", { className: "browse-empty", textContent: copy.browse.noMatches }));
      return;
    }

    searchList = new VirtualList(searchContainer, {
      rowHeight: ROW_HEIGHT_PX,
      renderRow: (item) => renderRow(item as Question),
      onItemTap: (item, index) => openItem(item as Question, index, searchList),
    });
    searchList.setItems(results);
  }

  searchInput.addEventListener("input", () => {
    clearTimeout(debounce);
    debounce = window.setTimeout(() => {
      const query = searchInput.value.trim();
      if (query) showSearch(query);
      else showAccordions();
    }, 120);
  });

  buildAccordions();
  showAccordions();

  return () => {
    clearTimeout(debounce);
    searchList?.destroy();
    for (const entry of entries.values()) entry.list?.destroy();
  };
};
