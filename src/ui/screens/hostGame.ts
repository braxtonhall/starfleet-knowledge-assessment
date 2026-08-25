import { h, clear } from "../dom";
import { copy } from "../../copy";
import {
  beepCorrect,
  beepIncorrect,
  beepTap,
  screenHeading,
  scrollToContentTop,
  setBanner,
} from "../lcars";
import { createConfigForm } from "../components/configForm";
import { createAnswerOptions } from "../components/answerOptions";
import { createQrFrame } from "../components/qr";
import { createRoster, type RosterMode } from "../components/roster";
import { missedRow } from "../components/missedList";
import { createStandings } from "../components/standings";
import { createToggle } from "../components/toggle";
import { createHostSession, type HostSession, type HostState } from "../../net/hostSession";
import { MAX_ROOM_LENGTH, normalizeRoomCode } from "../../net/roomCode";
import { defaultConfig } from "../../data/types";
import type { ScreenRenderer } from "../../app-context";

/**
 * The host device: ready room, then the shared drill display (spec §5.2–§5.4).
 * It is one screen rather than three because the PeerJS session has to outlive
 * every phase change — navigating away is what ends the room.
 *
 * With the host seated (spec §5.10) the same screen is also a personal one:
 * the options become clickable and the host gets their own verdict alongside
 * the room's. Nothing on it moves earlier because of that — their own
 * correctness lands on beat 2 with everyone else's, so the screen resolves the
 * question in one motion.
 *
 * The view is rebuilt only when the phase changes; inside a phase, `update`
 * mutates in place so the per-question countdown does not blow away the
 * roster (or, in the ready room, whatever the host is typing).
 */

interface HostView {
  root: HTMLElement;
  update(state: HostState): void;
}

type ViewKey = "opening" | "lobby" | "play" | "over" | "error";

function keyFor(state: HostState): ViewKey {
  if (state.phase === "question" || state.phase === "reveal") return "play";
  return state.phase;
}

export const render: ScreenRenderer = (ctx, _params, main) => {
  const titles = ctx.categories.map((category) => category.title);
  const session =
    ctx.net.host ??
    createHostSession({
      playable: ctx.playable,
      config: ctx.lastConfig() ?? defaultConfig(titles),
      // A seated host is a player, and a player's answers belong to this
      // device's permanent history like any other (spec §3).
      onResolved: (number, state) => ctx.setAnswer(number, state),
    });
  ctx.net.host = session;

  let viewKey: ViewKey | null = null;
  let view: HostView | null = null;

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
    // The drill display trims the chrome the same way solo play does; the ready
    // room keeps it, since nobody is reading that off a projector.
    document.body.classList.toggle("mode-play", key === "play");
    // A seated host is on the roster under a designation they never chose, so
    // they get the same always-visible banner a player device gets (spec §5.5).
    setBanner(state.seat?.name ?? null);
  });

  return () => {
    unsubscribe();
    setBanner(null);
    document.body.classList.remove("mode-play");
  };
};

function buildView(
  key: ViewKey,
  ctx: Parameters<ScreenRenderer>[0],
  session: HostSession,
  state: HostState,
): HostView {
  switch (key) {
    case "opening":
      return statusView(copy.crew.opening);
    case "error":
      return errorView(ctx, session);
    case "lobby":
      return lobbyView(ctx, session, state);
    case "play":
      return playView(session);
    case "over":
      return standingsView(ctx, session);
  }
}

function statusView(message: string): HostView {
  const root = h("div", { className: "crew-status" }, h("p", { textContent: message }));
  return { root, update: () => {} };
}

function errorView(ctx: Parameters<ScreenRenderer>[0], session: HostSession): HostView {
  const detail = h("p", { className: "crew-error-detail" });
  const root = h(
    "div",
    { className: "crew-status" },
    screenHeading(copy.crew.channelFailed),
    detail,
    h(
      "div",
      { className: "buttons" },
      h("button", {
        type: "button",
        textContent: copy.crew.tryAgain,
        onClick: () => {
          // A fresh designation is the reliable way back onto a broker that
          // just refused this one.
          session.setRoomCode("");
          ctx.net.teardown();
          ctx.navigate("hostGame");
        },
      }),
      h("button", {
        type: "button",
        className: "button-honey",
        textContent: copy.crew.withdraw,
        onClick: () => ctx.navigate("multiplayer"),
      }),
    ),
  );
  return {
    root,
    update: (state) => {
      detail.textContent = state.error ?? "";
    },
  };
}

function lobbyView(
  ctx: Parameters<ScreenRenderer>[0],
  session: HostSession,
  initial: HostState,
): HostView {
  const root = h("div", { className: "crew-lobby" });
  root.appendChild(screenHeading(copy.crew.lobby));

  // --- transport coordinates ------------------------------------------------
  // The caption strip under the code is the room name, so it is also where the
  // room name is edited — repeating it in a separate field below would say the
  // same thing twice.
  const codeInput = h("input", {
    className: "qr-caption qr-caption--input",
    type: "text",
    value: initial.roomCode,
    maxlength: String(MAX_ROOM_LENGTH),
    spellcheck: "false",
    autocapitalize: "characters",
    "aria-label": copy.crew.designation,
    title: copy.crew.designationHint,
  }) as HTMLInputElement;

  function applyCode(): void {
    const next = normalizeRoomCode(codeInput.value);
    if (next === "" || next === session.getState().roomCode) {
      codeInput.value = session.getState().roomCode;
      codeInput.blur();
      return;
    }
    beepTap();
    session.setRoomCode(next);
  }

  codeInput.addEventListener("keydown", (event) => {
    const key = (event as KeyboardEvent).key;
    if (key === "Enter") applyCode();
    // Confirming is deliberate: renaming re-opens the channel and everyone in
    // the room has to come back through the new code.
    else if (key === "Escape") {
      codeInput.value = session.getState().roomCode;
      codeInput.blur();
    }
  });
  codeInput.addEventListener("blur", () => {
    codeInput.value = session.getState().roomCode;
  });

  const qrHost = h("div", { className: "qr-host" });
  const copyLink = h("button", {
    className: "lcars-action lcars-action--small",
    type: "button",
    textContent: copy.crew.copyLink,
  });
  const copyNote = h("span", { className: "crew-copy-note" });

  copyLink.addEventListener("click", () => {
    const url = session.getState().joinUrl;
    void navigator.clipboard
      ?.writeText(url)
      .then(() => {
        copyNote.textContent = copy.crew.copied;
      })
      .catch(() => {
        copyNote.textContent = copy.crew.copyFailed;
      });
  });

  const coordinates = h(
    "div",
    { className: "crew-coordinates" },
    h("h3", { textContent: copy.crew.coordinates }),
    qrHost,
    h("p", { className: "crew-hint", textContent: copy.crew.scanHint }),
    h("div", { className: "crew-copy-row" }, copyLink, copyNote),
  );

  // --- crew roster ----------------------------------------------------------
  const rosterCount = h("span", { className: "disc-title-count" });
  const roster = createRoster();
  const rosterPanel = h(
    "div",
    { className: "crew-roster-panel" },
    h("h3", {}, document.createTextNode(copy.crew.roster), rosterCount),
    roster.root,
  );

  // --- assessment configuration --------------------------------------------
  const poolLabel = h("span", { className: "config-pool" });
  const engage = h(
    "button",
    { className: "lcars-action lcars-action--wide", type: "button", textContent: copy.config.engage },
  );
  engage.addEventListener("click", () => {
    beepTap();
    ctx.saveConfig(config);
    session.start();
  });

  const config = { ...initial.config, categories: [...initial.config.categories] };

  // Spec §5.10. This sits at the head of the panel rather than among the
  // assessment toggles because it decides what this terminal *is* — a shared
  // viewer, or one more personal screen — before any of them matter.
  const hostSeat = h(
    "div",
    { className: "host-seat" },
    createToggle({
      label: copy.crew.hostSeat,
      on: config.hostPlays,
      onChange: (on) => {
        config.hostPlays = on;
        session.setConfig(config);
      },
    }),
    h("p", { className: "crew-hint", textContent: copy.crew.hostSeatHint }),
  );

  const form = createConfigForm({
    categories: ctx.categories,
    pool: ctx.playable,
    config,
    lead: hostSeat,
    onChange: (next) => session.setConfig(next),
  });
  form.root.appendChild(h("div", { className: "config-footer" }, poolLabel, engage));

  // Joining information comes first in the DOM so that a phone-sized ready room
  // leads with the QR — the thing the room needs before anything can be
  // configured. On a wide screen the columns swap so config sits on the left,
  // where the host works while people are still arriving.
  root.appendChild(
    h(
      "div",
      { className: "crew-lobby-grid" },
      h("div", { className: "crew-lobby-join" }, coordinates, rosterPanel),
      h("div", { className: "crew-lobby-config" }, form.root),
    ),
  );

  let lastUrl = "";

  return {
    root,
    update(state) {
      if (state.joinUrl !== lastUrl) {
        lastUrl = state.joinUrl;
        clear(qrHost);
        // The caption input is reused rather than rebuilt, so re-encoding the
        // code never yanks focus out of the field.
        qrHost.appendChild(
          h("div", { className: "qr-panel" }, createQrFrame(state.joinUrl), codeInput),
        );
        if (document.activeElement !== codeInput) codeInput.value = state.roomCode;
      }

      roster.update(state.players, "lobby");
      rosterCount.textContent = String(state.players.length);

      const hasCrew = state.players.length > 0;
      poolLabel.textContent = !hasCrew
        ? copy.crew.needCrew
        : state.poolSize > 0
          ? `${state.poolSize} ${copy.config.itemsAvailable}`
          : copy.config.poolEmpty;
      // Spec §5.2: no crew or no questions means nothing to engage.
      engage.disabled = !hasCrew || state.poolSize === 0;
    },
  };
}

function playView(session: HostSession): HostView {
  const progress = h("span", { className: "play-progress" });
  const discipline = h("span", { className: "play-discipline" });
  const endDrill = h("button", {
    className: "play-quit",
    type: "button",
    textContent: copy.crew.endDrill,
  });
  endDrill.addEventListener("click", () => session.endGame());

  const timerWrap = h("div", { className: "play-timer", hidden: true });
  const timerValue = h("span", { className: "play-timer-value", textContent: "00" });
  timerWrap.appendChild(timerValue);

  const questionEl = h("p", { className: "play-question" });
  const featureEl = h("div", { className: "feature-panel", hidden: true });
  const featureText = h("p", { className: "feature-text" });
  featureEl.appendChild(h("div", { className: "feature-heading", textContent: copy.play.supplementalData }));
  featureEl.appendChild(featureText);

  const optionsHost = h("div", { className: "play-options" });
  // The host's own verdict, shown only when they have taken a seat. It sits
  // above the room's correct-response line: your own result first, the room's
  // second, the same order a player device resolves in.
  const seatStatus = h("div", { className: "status-banner", hidden: true });
  const correctLine = h("div", { className: "status-banner status-banner--correct", hidden: true });

  const rosterHeading = h("h3", { className: "crew-roster-heading", textContent: copy.crew.responseStatus });
  const roster = createRoster();

  const proceed = h("button", { className: "lcars-action", type: "button", textContent: copy.crew.proceed });
  proceed.addEventListener("click", () => {
    beepTap();
    session.advance();
  });
  const footer = h("div", { className: "play-footer" }, seatStatus, correctLine, proceed);

  const root = h(
    "div",
    { className: "play crew-play" },
    h("div", { className: "play-top" }, h("div", { className: "play-meta" }, progress, discipline), endDrill),
    timerWrap,
    questionEl,
    featureEl,
    optionsHost,
    h("div", { className: "crew-roster-panel" }, rosterHeading, roster.root),
    footer,
  );

  let shownNumber: number | null = null;
  let lockedChoice: string | null = null;
  let revealed = false;
  let options: ReturnType<typeof createAnswerOptions> | null = null;

  return {
    root,
    update(state) {
      const question = state.question;
      if (!question) return;
      const seated = state.seat !== null;

      if (question.number !== shownNumber) {
        shownNumber = question.number;
        lockedChoice = null;
        revealed = false;
        questionEl.textContent = question.question;
        featureEl.hidden = !state.showFeature;
        featureText.textContent = state.showFeature ? question.feature_text ?? "" : "";
        correctLine.hidden = true;
        seatStatus.hidden = true;
        clear(optionsHost);
        // Clickable only from the host's own seat; a spectating host shows the
        // options for the room to read and never answers them (spec §5.3).
        options = createAnswerOptions({
          options: question.options,
          onSelect: seated
            ? (letter) => {
                beepTap();
                session.answerLocal(letter);
              }
            : undefined,
        });
        optionsHost.appendChild(options.root);
      }

      progress.textContent = copy.play.progress(state.index, state.total);
      discipline.textContent = copy.play.discipline(question.chapter_title);
      endDrill.hidden = state.total !== null;

      const timed = state.phase === "question" && state.remainingMs !== null;
      timerWrap.hidden = !timed;
      if (timed) {
        const seconds = Math.ceil((state.remainingMs ?? 0) / 1000);
        timerValue.textContent = String(seconds).padStart(2, "0");
        timerWrap.classList.toggle("play-timer--low", (state.remainingMs ?? 0) < 5000);
      }

      // Spec §5.4: binary status while the question is live, every choice at
      // once on beat 1, correctness on beat 2.
      const mode: RosterMode =
        state.phase === "question" ? "status" : state.revealBeat >= 2 ? "verdict" : "choices";
      rosterHeading.textContent =
        state.phase === "question" ? copy.crew.responseStatus : copy.crew.reveal;
      roster.update(state.players, mode);

      // The seated host's own choice locks the board the moment it is taken,
      // exactly as it does on a player device.
      const seatChoice = state.seat?.choice ?? null;
      if (seatChoice !== null && lockedChoice !== seatChoice && !revealed) {
        lockedChoice = seatChoice;
        options?.lock(seatChoice);
        seatStatus.hidden = false;
        seatStatus.className = "status-banner";
        seatStatus.textContent = copy.crew.awaitCrew;
      }

      if (state.phase === "reveal" && state.revealBeat >= 2 && !revealed) {
        revealed = true;
        options?.reveal(question.answer, seatChoice ?? "");
        correctLine.hidden = false;
        correctLine.textContent = `${copy.crew.correctResponse}: ${question.answer ?? "—"}`;

        if (seated) {
          const verdict = state.seat?.correct ?? null;
          seatStatus.hidden = false;
          seatStatus.className =
            verdict === true
              ? "status-banner status-banner--correct"
              : "status-banner status-banner--incorrect";
          seatStatus.textContent =
            verdict === null
              ? copy.crew.noResponseLogged
              : verdict
                ? copy.play.confirmed
                : copy.play.incorrect;
          if (verdict === true) beepCorrect();
          else beepIncorrect();
        }
      }

      // The countdown is its own forcing function, so PROCEED only appears when
      // there isn't one — including on an untimed feature question in an
      // otherwise timed drill (spec §5.4.2).
      proceed.hidden = state.phase === "question" && !state.canForceAdvance;
      proceed.textContent = state.phase === "question" ? copy.crew.forceReveal : copy.crew.proceed;
    },
  };
}

function standingsView(ctx: Parameters<ScreenRenderer>[0], session: HostSession): HostView {
  const standings = createStandings();

  // Shown only to a host who played: their own rating and the items they owe a
  // second look, the same personal recap a player device gets (spec §5.5).
  const rating = h("p", { className: "results-rating", hidden: true });
  const reviewHeading = h("h2", { className: "results-review-heading", textContent: copy.results.review, hidden: true });
  const reviewList = h("ul", { className: "lcars-list results-missed" });
  const clean = h("p", { className: "results-clean", textContent: copy.play.confirmed, hidden: true });

  const root = h(
    "div",
    { className: "crew-standings" },
    screenHeading(copy.crew.standings),
    standings.root,
    rating,
    reviewHeading,
    clean,
    reviewList,
    h(
      "div",
      { className: "buttons" },
      h("button", {
        type: "button",
        textContent: copy.crew.restart,
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
      standings.update(
        state.players.map((player) => ({
          name: player.name,
          score: player.score,
          you: player.isHost,
        })),
      );

      const seat = state.seat;
      if (!seat) return;
      rating.hidden = false;
      rating.textContent = copy.crew.yourRating(seat.correctCount, state.playedCount);

      if (reviewed) return;
      reviewed = true;
      reviewHeading.hidden = false;
      if (seat.missed.length === 0) {
        clean.hidden = false;
        return;
      }
      for (const item of seat.missed) reviewList.appendChild(missedRow(item));
    },
  };
}
