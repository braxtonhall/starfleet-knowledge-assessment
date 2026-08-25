import type { Question } from "./data/types";
import { indexByNumber, playablePool } from "./data/questions";
import { groupQuestionsByCategory } from "./data/categories";
import {
  loadAnswerLog,
  setAnswer,
  answerFor,
  resetAll,
  resetNumbers,
  countsFor,
} from "./state/answerLog";
import { loadHighScores, bestForCount, recordIfBetter } from "./state/highScores";
import { loadSettings, saveLastConfig } from "./state/settings";
import type { AppContext, NetSlot, Screen, ScreenParams, ScreenRenderer } from "./app-context";
import { clear } from "./ui/dom";
import { scrollToContentTop } from "./ui/lcars";
import * as landing from "./ui/screens/landing";
import * as hub from "./ui/screens/hub";
import * as quickPlayConfig from "./ui/screens/quickPlayConfig";
import * as play from "./ui/screens/play";
import * as results from "./ui/screens/results";
import * as browse from "./ui/screens/browse";
import * as options from "./ui/screens/options";
import * as multiplayer from "./ui/screens/multiplayer";
import * as hostGame from "./ui/screens/hostGame";
import * as joinGame from "./ui/screens/joinGame";
import * as rotationGame from "./ui/screens/rotationGame";

const renderers: Record<Screen, ScreenRenderer> = {
  landing: landing.render,
  hub: hub.render,
  quickPlayConfig: quickPlayConfig.render,
  play: play.render,
  results: results.render,
  browse: browse.render,
  options: options.render,
  multiplayer: multiplayer.render,
  hostGame: hostGame.render,
  joinGame: joinGame.render,
  rotationGame: rotationGame.render,
};

const RAIL_BY_SCREEN: Record<Screen, string | null> = {
  landing: null,
  hub: null,
  quickPlayConfig: "drill",
  play: "drill",
  results: "drill",
  browse: "database",
  options: "systems",
  multiplayer: null,
  hostGame: null,
  joinGame: null,
  rotationGame: null,
};

/**
 * Spec §2: the landing screen offers exactly two choices. The solo sections
 * live one level deeper, so the left-frame shortcuts to them stay hidden until
 * the player is inside Solo Simulation — and they stay hidden down the crew
 * branch too, which has nothing to do with this device's solo history.
 */
const RAIL_IDS = ["nav-drill", "nav-database", "nav-systems"];

// Duty Rotation opens no channel, but it lives down the crew branch and hides
// the solo rails for the same reason the networked modes do — the drill on
// screen is not this device owner's history. `net.teardown()` on the way out is
// a harmless no-op for a screen that never had a peer.
const CREW_SCREENS = new Set<Screen>(["multiplayer", "hostGame", "joinGame", "rotationGame"]);

export function startApp(questions: Question[], main: HTMLElement, deepLinkRoom = ""): void {
  const byNumber = indexByNumber(questions);
  const categories = groupQuestionsByCategory(questions);
  const playable = playablePool(questions);
  const answerLog = loadAnswerLog();
  const highScores = loadHighScores();
  const settings = loadSettings();
  const allNumbers = questions.map((q) => q.number);

  let cleanup: (() => void) | null = null;
  let current: Screen | null = null;

  const net: NetSlot = {
    host: null,
    player: null,
    teardown(): void {
      net.host?.destroy();
      net.player?.destroy();
      net.host = null;
      net.player = null;
    },
  };

  function refreshStatusReadouts(): void {
    const counts = countsFor(answerLog, allNumbers);
    setReadout("stat-correct", counts.correct);
    setReadout("stat-incorrect", counts.incorrect);
    setReadout("stat-unanswered", counts.unanswered);
    setReadout("stat-total", questions.length);
  }

  const ctx: AppContext = {
    questions,
    byNumber,
    categories,
    playable,
    answerLog,
    net,
    navigate,
    answerFor: (number) => answerFor(answerLog, number),
    setAnswer: (number, state) => {
      setAnswer(answerLog, number, state);
      refreshStatusReadouts();
    },
    resetAll: () => {
      resetAll(answerLog);
      refreshStatusReadouts();
    },
    resetCategory: (title) => {
      const category = categories.find((c) => c.title === title);
      if (category) resetNumbers(answerLog, category.questions.map((q) => q.number));
      refreshStatusReadouts();
    },
    bestForCount: (key) => bestForCount(highScores, key),
    recordHighScore: (key, score) => recordIfBetter(highScores, key, score),
    lastConfig: () => settings.lastConfig,
    saveConfig: (config) => {
      settings.lastConfig = config;
      saveLastConfig(config);
    },
  };

  function updateChrome(screen: Screen): void {
    const railActive = RAIL_BY_SCREEN[screen];
    const soloRails = screen !== "landing" && !CREW_SCREENS.has(screen);
    for (const id of RAIL_IDS) {
      const element = document.getElementById(id);
      if (!(element instanceof HTMLButtonElement)) continue;
      element.classList.toggle("rail-active", `nav-${railActive}` === id);
      element.disabled = !soloRails;
    }
    // END SESSION ends whatever is in progress; on the landing screen there is
    // nothing to end and it would only navigate to where you already are.
    const endButton = document.getElementById("nav-end");
    if (endButton instanceof HTMLButtonElement) endButton.disabled = screen === "landing";

    // The full header ornament is the landing screen's alone; everything past
    // it runs compact. Play trims further still (see app.css).
    document.body.classList.toggle("mode-compact", screen !== "landing");
    document.body.classList.toggle("mode-play", screen === "play");
  }

  function navigate(screen: Screen, params?: ScreenParams): void {
    cleanup?.();
    cleanup = null;
    // Walking out of the crew branch is what ends the room — a host who leaves
    // takes the game with them, so the peer connections close here rather than
    // lingering behind a screen nobody is looking at.
    if (current !== null && CREW_SCREENS.has(current) && !CREW_SCREENS.has(screen)) {
      net.teardown();
    }
    current = screen;
    clear(main);
    updateChrome(screen);
    const result = renderers[screen](ctx, params, main);
    if (typeof result === "function") cleanup = result;
    scrollToContentTop();
  }

  document.getElementById("nav-drill")?.addEventListener("click", () => navigate("quickPlayConfig"));
  document.getElementById("nav-database")?.addEventListener("click", () => navigate("browse"));
  document.getElementById("nav-systems")?.addEventListener("click", () => navigate("options"));
  document.getElementById("nav-end")?.addEventListener("click", () => navigate("landing"));

  refreshStatusReadouts();
  // A join link skips the landing choice entirely and lands on the join step
  // (spec §5.1).
  if (deepLinkRoom) navigate("joinGame", { kind: "join", roomCode: deepLinkRoom });
  else navigate("landing");
}

function setReadout(id: string, value: number): void {
  const element = document.getElementById(id);
  if (element) element.textContent = value.toLocaleString();
}
