import { h, clear } from "../dom";
import { copy } from "../../copy";
import { beepCorrect, beepIncorrect, beepTap, screenHeading, scrollToContentTop, setBanner } from "../lcars";
import { createAccordion } from "../components/accordion";
import { createAnswerOptions } from "../components/answerOptions";
import { createChips } from "../components/chips";
import { createConfigForm } from "../components/configForm";
import { missedRow } from "../components/missedList";
import { createStandings } from "../components/standings";
import { createRotationSession, rotationDraw, type RotationSession, type RotationState } from "../../logic/rotation";
import { MAX_OFFICERS, MIN_OFFICERS, defaultConfig } from "../../data/types";
import type { AppContext, ScreenRenderer } from "../../app-context";

/**
 * Duty Rotation (spec §5.11): the config screen, the watch bill, and then the
 * hand-off / question / verdict cycle, all on one device.
 *
 * One screen rather than five because the session has to outlive every phase
 * change — navigating away is what ends the drill. The view is rebuilt only
 * when the phase changes; inside a phase `update` mutates in place, so the
 * countdown never blows the question away underneath the officer answering it.
 *
 * The hand-off is the spine of the mode, not a nicety. Everything above it is
 * arranged so the incoming officer cannot read the outgoing one's question,
 * choice or verdict: the play view's DOM is torn down before the hand-off
 * renders, the hand-off is full-screen, and no running total appears on it —
 * spec §5.3's "no totals until the end" holds here for the same reason it holds
 * there.
 */

interface RotationView {
  root: HTMLElement;
  update(state: RotationState): void;
}

type ViewKey = "config" | "watchbill" | "handoff" | "play" | "over";

function keyFor(state: RotationState): ViewKey {
  if (state.phase === "question" || state.phase === "verdict") return "play";
  return state.phase;
}

export const render: ScreenRenderer = (ctx, _params, main) => {
  const titles = ctx.categories.map((category) => category.title);
  const previous = ctx.lastConfig();
  const session = createRotationSession({
    playable: ctx.playable,
    config: previous
      ? {
          ...previous,
          categories: previous.categories.length > 0 ? [...previous.categories] : [...titles],
        }
      : defaultConfig(titles),
  });

  let viewKey: ViewKey | null = null;
  let view: RotationView | null = null;

  const unsubscribe = session.subscribe((state) => {
    const key = keyFor(state);
    if (key !== viewKey) {
      viewKey = key;
      view = buildView(key, ctx, session, state);
      clear(main);
      main.appendChild(view.root);
      scrollToContentTop();
    }
    view?.update(state);

    // The turn trims the chrome the same way solo play does.
    document.body.classList.toggle("mode-play", key === "play");
    // Whose turn it is, at the one size visible from every scroll position —
    // but never on the hand-off, where the screen is already naming the
    // *incoming* officer at heading size and a banner naming the outgoing one
    // would contradict it.
    const officer = state.currentIndex === null ? null : state.officers[state.currentIndex];
    setBanner(key === "play" && officer ? officer.name : null);
  });

  return () => {
    unsubscribe();
    session.destroy();
    setBanner(null);
    document.body.classList.remove("mode-play");
  };
};

function buildView(
  key: ViewKey,
  ctx: AppContext,
  session: RotationSession,
  state: RotationState,
): RotationView {
  switch (key) {
    case "config":
      return configView(ctx, session, state);
    case "watchbill":
      return watchBillView(session);
    case "handoff":
      return handoffView(session);
    case "play":
      return playView(session);
    case "over":
      return standingsView(ctx, session);
  }
}

// ----- config ---------------------------------------------------------------

function configView(ctx: AppContext, session: RotationSession, initial: RotationState): RotationView {
  const root = h("div", { className: "rotation-config" });
  root.appendChild(screenHeading(copy.rotation.heading));

  const config = { ...initial.config, categories: [...initial.config.categories] };

  const poolLabel = h("span", { className: "config-pool" });
  const engage = h("button", {
    className: "lcars-action lcars-action--wide",
    type: "button",
    textContent: copy.config.engage,
  });

  // Crew size rides the `lead` hook — the same slot the host seat occupies in
  // the ready room. It decides how many assessments the drill deals before any
  // of the controls below it mean anything.
  const officerChips = h(
    "div",
    { className: "rotation-officers" },
    h("h3", { textContent: copy.rotation.officers }),
    createChips({
      choices: Array.from({ length: MAX_OFFICERS - MIN_OFFICERS + 1 }, (_, index) => {
        const value = String(MIN_OFFICERS + index);
        return { value, label: value };
      }),
      selected: String(config.officers),
      onSelect: (value) => {
        config.officers = Number(value);
        session.setConfig(config);
        updateFooter();
      },
    }),
  );

  const form = createConfigForm({
    categories: ctx.categories,
    pool: ctx.playable,
    config,
    lead: officerChips,
    countLabel: copy.rotation.count,
    onChange: (next) => {
      session.setConfig(next);
      updateFooter();
    },
  });

  function updateFooter(): void {
    const poolSize = form.poolSize();
    const draw = rotationDraw(config.count, poolSize, config.officers);
    if (draw.perOfficer === null) {
      poolLabel.textContent =
        poolSize > 0 ? `${poolSize} ${copy.config.itemsAvailable}` : copy.config.poolEmpty;
    } else if (draw.sufficient) {
      poolLabel.textContent = copy.rotation.draw(config.officers, draw.perOfficer, draw.total ?? 0);
    } else {
      // A four-officer, 50-item drill needs 200 distinct items. Better said here
      // than discovered by a bag that quietly reshuffles.
      poolLabel.textContent = copy.rotation.insufficient(
        Math.max(draw.total ?? 0, config.officers),
        poolSize,
      );
    }
    poolLabel.classList.toggle("config-pool--short", !draw.sufficient);
    engage.disabled = !draw.sufficient;
  }

  engage.addEventListener("click", () => {
    beepTap();
    ctx.saveConfig(config);
    session.setConfig(config);
    session.start();
  });

  form.root.appendChild(h("div", { className: "config-footer" }, poolLabel, engage));
  updateFooter();
  root.appendChild(form.root);

  return { root, update: () => {} };
}

// ----- watch bill -----------------------------------------------------------

function watchBillView(session: RotationSession): RotationView {
  const list = h("ul", { className: "roster rotation-bill" });
  const begin = h("button", {
    className: "lcars-action lcars-action--wide",
    type: "button",
    textContent: copy.rotation.begin,
  });
  begin.addEventListener("click", () => {
    beepTap();
    session.advance();
  });

  const root = h(
    "div",
    { className: "rotation-watchbill" },
    screenHeading(copy.rotation.watchBill),
    list,
    h("p", { className: "crew-hint", textContent: copy.rotation.watchBillHint }),
    h("div", { className: "config-footer" }, begin),
  );

  let drawn = false;

  return {
    root,
    update(state) {
      // The bill is fixed for the drill, so it is drawn once — re-rendering it
      // on every emit would be motion with nothing behind it.
      if (drawn) return;
      drawn = true;
      for (const officer of state.officers) {
        list.appendChild(
          h(
            "li",
            { className: "roster-row" },
            h("span", {
              className: "roster-rank",
              textContent: `${String(officer.index + 1).padStart(2, "0")}.`,
            }),
            h("span", { className: "roster-name", textContent: officer.name }),
            officer.index === 0
              ? h("span", {
                  className: "roster-tag roster-tag--command",
                  textContent: copy.rotation.firstWatch,
                })
              : null,
          ),
        );
      }
    },
  };
}

// ----- hand-off -------------------------------------------------------------

function handoffView(session: RotationSession): RotationView {
  // The outgoing officer's verdict and nothing else of theirs: no question, no
  // choice, no answer, no totals.
  const previous = h("p", { className: "rotation-previous", hidden: true });
  const progress = h("span", { className: "play-progress" });
  const conn = h("h2", { className: "rotation-conn" });

  const take = h("button", {
    className: "lcars-action lcars-action--wide rotation-take",
    type: "button",
    textContent: copy.rotation.takeConn,
  });
  take.addEventListener("click", () => {
    beepTap();
    session.advance();
  });

  const quit = h("button", { className: "play-quit", type: "button", textContent: copy.play.quit, hidden: true });
  quit.addEventListener("click", () => session.disengage());

  const root = h(
    "div",
    { className: "rotation-handoff" },
    h("div", { className: "play-top" }, progress, quit),
    previous,
    conn,
    take,
  );

  return {
    root,
    update(state) {
      const officer = state.currentIndex === null ? null : state.officers[state.currentIndex];
      if (!officer) return;

      progress.textContent = copy.rotation.progress(state.rotation + 1, officer.name);
      conn.textContent = copy.rotation.conn(officer.name);

      previous.hidden = state.previous === null;
      if (state.previous) {
        previous.textContent = copy.rotation.previousResult(
          state.previous.name,
          state.previous.correct ? copy.play.confirmed : copy.play.incorrect,
        );
        previous.className = `rotation-previous rotation-previous--${state.previous.correct ? "correct" : "incorrect"}`;
      }

      // Endless has no natural end, so it carries the exit — here rather than
      // only mid-question, where quitting means abandoning a live turn.
      quit.hidden = state.perOfficer !== null;
    },
  };
}

// ----- the turn -------------------------------------------------------------

function playView(session: RotationSession): RotationView {
  const progress = h("span", { className: "play-progress" });
  const discipline = h("span", { className: "play-discipline" });
  const quit = h("button", { className: "play-quit", type: "button", textContent: copy.play.quit, hidden: true });
  quit.addEventListener("click", () => session.disengage());

  const timerWrap = h("div", { className: "play-timer", hidden: true });
  const timerValue = h("span", { className: "play-timer-value", textContent: "00" });
  timerWrap.appendChild(timerValue);

  const questionEl = h("p", { className: "play-question" });
  const featureEl = h("div", { className: "feature-panel", hidden: true });
  const featureText = h("p", { className: "feature-text" });
  featureEl.appendChild(h("div", { className: "feature-heading", textContent: copy.play.supplementalData }));
  featureEl.appendChild(featureText);

  const optionsHost = h("div", { className: "play-options" });
  const statusEl = h("div", { className: "status-banner", hidden: true });
  const proceed = h("button", {
    className: "lcars-action lcars-action--answered",
    type: "button",
    textContent: copy.play.proceed,
    hidden: true,
  });
  proceed.addEventListener("click", () => {
    beepTap();
    session.advance();
  });

  const root = h(
    "div",
    { className: "play rotation-play" },
    h("div", { className: "play-top" }, h("div", { className: "play-meta" }, progress, discipline), quit),
    timerWrap,
    questionEl,
    featureEl,
    optionsHost,
    h("div", { className: "play-footer" }, statusEl, proceed),
  );

  // Keyed on the turn rather than the question number: an endless drill that has
  // exhausted a one-item pool would otherwise show the same number twice and
  // never reset the board.
  let shownRotation = -1;
  let options: ReturnType<typeof createAnswerOptions> | null = null;
  let resolved = false;

  return {
    root,
    update(state) {
      const question = state.question;
      if (!question) return;

      if (state.rotation !== shownRotation) {
        shownRotation = state.rotation;
        resolved = false;
        questionEl.textContent = question.question;
        featureEl.hidden = !state.showFeature;
        featureText.textContent = state.showFeature ? question.feature_text ?? "" : "";
        statusEl.hidden = true;
        proceed.hidden = true;
        clear(optionsHost);
        // No roster, no other officer's information of any kind: there is only
        // one person looking at this screen and it is their own question.
        options = createAnswerOptions({
          options: question.options,
          onSelect: (letter) => session.answer(letter),
        });
        optionsHost.appendChild(options.root);
      }

      progress.textContent = copy.play.progress(state.slot, state.perOfficer);
      discipline.textContent = copy.play.discipline(question.chapter_title);
      quit.hidden = state.perOfficer !== null;

      const timed = state.phase === "question" && state.remainingMs !== null;
      timerWrap.hidden = !timed;
      if (timed) {
        const remaining = state.remainingMs ?? 0;
        timerValue.textContent = String(Math.ceil(remaining / 1000)).padStart(2, "0");
        timerWrap.classList.toggle("play-timer--low", remaining < 5000);
      }

      // Their own verdict, immediately: they are the only reader and it is their
      // own question, so there is nothing to withhold.
      if (state.phase === "verdict" && !resolved) {
        resolved = true;
        options?.reveal(question.answer, state.chosen ?? "");
        statusEl.hidden = false;
        statusEl.className = `status-banner status-banner--${state.correct ? "correct" : "incorrect"}`;
        statusEl.textContent = state.expired
          ? copy.play.timeExpired
          : state.correct
            ? copy.play.confirmed
            : copy.play.incorrect;
        proceed.hidden = false;
        if (state.correct) beepCorrect();
        else beepIncorrect();
      }
    },
  };
}

// ----- standings ------------------------------------------------------------

function standingsView(ctx: AppContext, session: RotationSession): RotationView {
  const standings = createStandings();
  const reviewHeading = h("h2", { className: "results-review-heading", textContent: copy.results.review });
  const reviews = h("div", { className: "rotation-reviews" });

  const root = h(
    "div",
    { className: "crew-standings rotation-standings" },
    screenHeading(copy.crew.standings),
    standings.root,
    reviewHeading,
    reviews,
    h(
      "div",
      { className: "buttons" },
      h("button", {
        type: "button",
        textContent: copy.rotation.again,
        onClick: () => {
          beepTap();
          session.restart();
        },
      }),
      h("button", {
        type: "button",
        className: "button-honey",
        textContent: copy.crew.disband,
        onClick: () => ctx.navigate("landing"),
      }),
    ),
  );

  let reviewed = false;

  return {
    root,
    update(state) {
      // Nobody's row is marked YOU: every officer is reading the same screen.
      standings.update(
        state.officers.map((officer) => ({
          name: officer.name,
          score: officer.score,
          you: false,
          detail: copy.rotation.tally(officer.correctCount, officer.turns),
        })),
      );

      if (reviewed) return;
      reviewed = true;
      for (const officer of state.officers) {
        // Collapsed, one per officer: eight open lists is a wall, and each
        // officer only wants their own. Questions only, never the answers —
        // spec §5.5 is a global rule and this mode gets no exception to it.
        const accordion = createAccordion({
          header: h(
            "span",
            { className: "disc-title" },
            h("span", { textContent: copy.rotation.review(officer.name, officer.missed.length) }),
          ),
        });
        if (officer.missed.length === 0) {
          accordion.contentEl.appendChild(
            h("p", { className: "results-clean", textContent: copy.rotation.reviewClean }),
          );
        } else {
          const list = h("ul", { className: "lcars-list results-missed" });
          for (const item of officer.missed) list.appendChild(missedRow(item));
          accordion.contentEl.appendChild(list);
        }
        reviews.appendChild(accordion.root);
      }
    },
  };
}
