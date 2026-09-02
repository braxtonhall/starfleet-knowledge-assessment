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
import { createAnswerOptions } from "../components/answerOptions";
import { missedRow } from "../components/missedList";
import { createRoster } from "../components/roster";
import { createStandings } from "../components/standings";
import { createPlayerSession, type PlayerSession, type PlayerState } from "../../net/playerSession";
import { MAX_ROOM_LENGTH, normalizeRoomCode } from "../../net/roomCode";
import type { RejectReason } from "../../net/protocol";
import type { AppContext, ScreenRenderer } from "../../app-context";

/**
 * The player device (spec §5.5). It shows one question at a time and the
 * player's own locked choice. While the question is open it stays personal —
 * nothing about the rest of the room, so a glance at a neighbour's phone gives
 * nothing away.
 *
 * At reveal it opens up: the host display is showing every choice and every
 * verdict to the room at that same moment, so mirroring them here tells a
 * player whether they were the only one who missed it — and is the only way to
 * know that at all when the host is playing and there is no shared screen
 * (spec §5.10).
 */

interface PlayerView {
  root: HTMLElement;
  update(state: PlayerState): void;
}

type ViewKey = "connecting" | "lobby" | "play" | "over" | "blocked";

function keyFor(state: PlayerState): ViewKey {
  switch (state.phase) {
    case "question":
    case "reveal":
      return "play";
    case "rejected":
    case "disbanded":
    case "lost":
      return "blocked";
    default:
      return state.phase;
  }
}

export const render: ScreenRenderer = (ctx, params, main) => {
  const requested = params?.kind === "join" ? params.roomCode : "";
  let unsubscribe: (() => void) | null = null;

  function connect(roomCode: string): void {
    ctx.net.player?.destroy();
    const session = createPlayerSession({
      roomCode,
      // Spec §3: a multiplayer answer lands in the same permanent local history
      // Solo and Browse read from.
      onResolved: (number, state) => ctx.setAnswer(number, state),
    });
    ctx.net.player = session;

    let viewKey: ViewKey | null = null;
    let view: PlayerView | null = null;

    unsubscribe = session.subscribe((state) => {
      const key = keyFor(state);
      if (key !== viewKey) {
        viewKey = key;
        view = buildView(key, ctx, session, roomCode);
        clear(main);
        main.appendChild(view.root);
        scrollToContentTop();
      }
      view?.update(state);
      document.body.classList.toggle("mode-play", key === "play");
      // The banner is the one thing on screen in every phase and at every
      // scroll position, so the designation rides there rather than in a line
      // that a question can push out of view.
      setBanner(state.name);
    });
  }

  if (requested) connect(requested);
  else main.appendChild(entryView(ctx, connect));

  return () => {
    unsubscribe?.();
    setBanner(null);
    document.body.classList.remove("mode-play");
  };
};

/** Manual designation entry — the path for anyone who did not arrive by QR. */
function entryView(ctx: AppContext, connect: (roomCode: string) => void): HTMLElement {
  const input = h("input", {
    className: "room-input",
    type: "text",
    placeholder: copy.crew.codePlaceholder,
    maxlength: String(MAX_ROOM_LENGTH),
    spellcheck: "false",
    autocapitalize: "characters",
    "aria-label": copy.crew.codeLabel,
  }) as HTMLInputElement;

  const energize = h("button", {
    className: "lcars-action lcars-action--wide",
    type: "button",
    textContent: copy.crew.energize,
  });

  function submit(): void {
    const code = normalizeRoomCode(input.value);
    if (!code) return;
    beepTap();
    connect(code);
  }

  energize.addEventListener("click", submit);
  input.addEventListener("keydown", (event) => {
    if ((event as KeyboardEvent).key === "Enter") submit();
  });
  input.addEventListener("input", () => {
    energize.disabled = normalizeRoomCode(input.value) === "";
  });
  energize.disabled = true;

  return h(
    "div",
    { className: "crew-join" },
    screenHeading(copy.crew.joinHeading),
    h("h3", { textContent: copy.crew.codeLabel }),
    h("div", { className: "room-row" }, input, energize),
    h("p", { className: "crew-hint", textContent: copy.crew.scanNote }),
    h(
      "div",
      { className: "buttons" },
      h("button", {
        type: "button",
        className: "button-honey",
        textContent: copy.crew.withdraw,
        onClick: () => ctx.navigate("multiplayer"),
      }),
    ),
  );
}

function buildView(
  key: ViewKey,
  ctx: AppContext,
  session: PlayerSession,
  roomCode: string,
): PlayerView {
  switch (key) {
    case "connecting":
      return statusView(copy.crew.connecting, roomCode);
    case "lobby":
      return lobbyView(roomCode);
    case "play":
      return playView(session);
    case "over":
      return recapView(ctx);
    case "blocked":
      return blockedView(ctx, session);
  }
}

function statusView(message: string, roomCode: string): PlayerView {
  const line = h("p", { textContent: message });
  const root = h(
    "div",
    { className: "crew-status" },
    screenHeading(roomCode),
    line,
  );
  return {
    root,
    update: (state) => {
      line.textContent = state.reconnecting ? copy.crew.reconnecting : message;
    },
  };
}

function lobbyView(roomCode: string): PlayerView {
  // No designation line here: the banner above already carries the name, and
  // repeating it directly underneath says the same thing twice.
  const root = h(
    "div",
    { className: "crew-status" },
    screenHeading(roomCode),
    h("p", { className: "blink", textContent: copy.crew.standBy }),
  );
  return { root, update: () => {} };
}

function playView(session: PlayerSession): PlayerView {
  const progress = h("span", { className: "play-progress" });
  const discipline = h("span", { className: "play-discipline" });
  const timerWrap = h("div", { className: "play-timer", hidden: true });
  const timerValue = h("span", { className: "play-timer-value", textContent: "00" });
  timerWrap.appendChild(timerValue);

  const questionEl = h("p", { className: "play-question" });
  const featureEl = h("div", { className: "feature-panel", hidden: true });
  const featureText = h("p", { className: "feature-text" });
  featureEl.appendChild(h("div", { className: "feature-heading", textContent: copy.play.supplementalData }));
  featureEl.appendChild(featureText);

  const optionsHost = h("div", { className: "play-options" });
  const status = h("div", { className: "status-banner", hidden: true });

  // Hidden until reveal — while the question is open this device says nothing
  // about anyone else.
  const roomPanel = h("div", { className: "crew-roster-panel", hidden: true });
  const roomHeading = h("h3", { className: "crew-roster-heading", textContent: copy.crew.reveal });
  const roomRoster = createRoster();
  roomPanel.appendChild(roomHeading);
  roomPanel.appendChild(roomRoster.root);

  const root = h(
    "div",
    { className: "play crew-play" },
    h("div", { className: "play-top" }, h("div", { className: "play-meta" }, progress, discipline)),
    timerWrap,
    questionEl,
    featureEl,
    optionsHost,
    h("div", { className: "play-footer" }, status),
    roomPanel,
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

      if (question.number !== shownNumber) {
        shownNumber = question.number;
        lockedChoice = null;
        revealed = false;
        questionEl.textContent = question.question;
        featureEl.hidden = !state.showFeature;
        featureText.textContent = question.featureText ?? "";
        status.hidden = true;
        roomPanel.hidden = true;
        clear(roomRoster.root);
        clear(optionsHost);
        options = createAnswerOptions({
          options: question.options,
          onSelect: (letter) => {
            beepTap();
            session.answer(letter);
          },
        });
        optionsHost.appendChild(options.root);
      }

      progress.textContent = copy.play.progress(state.index, state.total);
      discipline.textContent = copy.play.discipline(question.category);

      const timed = state.phase === "question" && state.remainingMs !== null;
      timerWrap.hidden = !timed;
      if (timed) {
        const seconds = Math.ceil((state.remainingMs ?? 0) / 1000);
        timerValue.textContent = String(seconds).padStart(2, "0");
        timerWrap.classList.toggle("play-timer--low", (state.remainingMs ?? 0) < 5000);
      }

      // Covers both a tap on this device and a choice replayed by the host to a
      // reconnecting player (spec §5.8).
      if (state.choice !== null && lockedChoice !== state.choice && !revealed) {
        lockedChoice = state.choice;
        options?.lock(state.choice);
        status.hidden = false;
        status.className = "status-banner";
        status.textContent = copy.crew.awaitCrew;
      }

      if (state.phase === "reveal" && !revealed) {
        revealed = true;
        options?.reveal(state.correctLetter, state.choice ?? "");

        // A room of one is just this player, and a list holding only their own
        // row tells them nothing they cannot already see above it — so it is
        // never built, not merely hidden.
        if (state.roundResults.length >= 2) {
          roomPanel.hidden = false;
          roomRoster.update(
            state.roundResults.map((entry) => ({
              name: entry.name,
              connected: true,
              answered: entry.choice !== null,
              choice: entry.choice,
              correct: entry.correct,
              you: entry.you,
            })),
            "verdict",
          );
        }

        status.hidden = false;
        if (state.correct === null) {
          status.className = "status-banner status-banner--incorrect";
          status.textContent = copy.crew.noResponseLogged;
          beepIncorrect();
        } else {
          status.className = `status-banner ${state.correct ? "status-banner--correct" : "status-banner--incorrect"}`;
          status.textContent = state.correct ? copy.play.confirmed : copy.play.incorrect;
          if (state.correct) beepCorrect();
          else beepIncorrect();
        }
      }
    },
  };
}

/**
 * The personal end-of-game recap (spec §5.5). Normally it carries no
 * leaderboard — that is the host screen's one moment (spec §5.4.6) and this
 * device just points at it. When the host played, though, their screen is
 * somebody's personal one and the room has no shared display left, so the
 * standings arrive here instead (spec §5.10).
 */
function recapView(ctx: AppContext): PlayerView {
  const rating = h("p", { className: "results-rating" });
  const bonus = h("p", { className: "results-bonus", hidden: true });
  const onHost = h("p", { className: "crew-hint", textContent: copy.crew.standingsOnHost });
  const standingsHeading = h("h2", { className: "results-review-heading", textContent: copy.crew.standings, hidden: true });
  const standings = createStandings();
  standings.root.hidden = true;
  const list = h("ul", { className: "lcars-list results-missed" });
  const clean = h("p", { className: "results-clean", textContent: copy.play.confirmed, hidden: true });

  const root = h(
    "div",
    { className: "crew-recap" },
    screenHeading(copy.crew.drillComplete),
    rating,
    bonus,
    onHost,
    standingsHeading,
    standings.root,
    h("h2", { className: "results-review-heading", textContent: copy.results.review }),
    clean,
    list,
    h(
      "div",
      { className: "buttons" },
      h("button", {
        type: "button",
        className: "button-honey",
        textContent: copy.crew.withdraw,
        onClick: () => ctx.navigate("landing"),
      }),
    ),
  );

  let rendered = false;

  return {
    root,
    update(state) {
      rating.textContent = copy.crew.yourRating(state.correctCount, state.playedCount);
      if (state.score > state.correctCount) {
        bonus.hidden = false;
        bonus.textContent = copy.results.bonus(state.score - state.correctCount);
      }

      // Pointing at the main viewer is only useful when there is one to point at.
      const shared = state.standings !== null;
      onHost.hidden = shared;
      standingsHeading.hidden = !shared;
      standings.root.hidden = !shared;
      if (state.standings) standings.update(state.standings);

      if (rendered || !state.recap) return;
      rendered = true;

      if (state.recap.length === 0) {
        clean.hidden = false;
        return;
      }

      for (const item of state.recap) list.appendChild(missedRow(item));
    },
  };
}

const REJECTION_COPY: Record<RejectReason, string> = {
  locked: copy.crew.roomLocked,
  full: copy.crew.roomFull,
  version: copy.crew.versionMismatch,
};

function blockedView(ctx: AppContext, session: PlayerSession): PlayerView {
  const heading = screenHeading(copy.crew.linkLost);
  const message = h("p", { className: "crew-error-detail" });
  const retry = h("button", {
    type: "button",
    textContent: copy.crew.tryAgain,
    onClick: () => session.retry(),
  });

  const root = h(
    "div",
    { className: "crew-status" },
    heading,
    message,
    h(
      "div",
      { className: "buttons" },
      retry,
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
    update(state) {
      if (state.rejection) {
        message.textContent = REJECTION_COPY[state.rejection];
        // A locked or full room will not change its mind on a retry.
        retry.hidden = true;
        return;
      }
      retry.hidden = false;
      const disbanded = state.phase === "disbanded";
      heading.textContent = disbanded ? copy.crew.disbanded : copy.crew.linkLost;
      retry.hidden = disbanded;
      message.textContent = disbanded
        ? copy.crew.disbandedDetail
        : state.errorKind === "missing"
          ? copy.crew.roomMissing
          : copy.crew.linkLost;
    },
  };
}
