import { h, clear } from "../dom";
import { copy } from "../../copy";
import { createAnswerOptions } from "../components/answerOptions";
import { createTimer } from "../components/timer";
import { weightedDraw, weightsForPool, hasFeatureText } from "../../logic/weighting";
import type { WeightContext } from "../../logic/weighting";
import { speedBonusFor, countKey } from "../../logic/scoring";
import { eligiblePool } from "../../logic/pool";
import type { ScreenRenderer } from "../../app-context";
import type { MissedItem, Question, QuizConfig, RunResult } from "../../data/types";
import { beepCorrect, beepIncorrect } from "../lcars";
import { mathRandom } from "../../logic/random";

export const render: ScreenRenderer = (ctx, params, main) => {
  if (!params || params.kind !== "play") {
    ctx.navigate("hub");
    return;
  }

  const config: QuizConfig = params.config;
  // With SUPPLEMENTAL DATA off there is no feature text to show, so those
  // questions are out of the draw entirely rather than served without it.
  const pool = eligiblePool(ctx.playable, config.categories, config.featuresOn);
  if (pool.length === 0) {
    ctx.navigate("quickPlayConfig");
    return;
  }

  const total: number | null =
    config.count === "endless" ? null : config.count === "all" ? pool.length : config.count;

  const seen = new Map<number, number>();
  const uniqueIds = new Set<number>();
  // Skipping means an encountered question may have no attempt in *this* run,
  // while still carrying a state from a previous one. Results must reflect the
  // run, so track what was actually answered here rather than trusting the log.
  const answeredThisRun = new Set<number>();
  let bonusTotal = 0;
  let position = -1;
  let startTime = 0;
  let current: Question | null = null;

  const progressEl = h("span", { className: "play-progress" });
  const disciplineEl = h("span", { className: "play-discipline" });
  const quitBtn = h("button", { className: "play-quit", type: "button" }, copy.play.quit);
  const timerWrap = h("div", { className: "play-timer", hidden: true });
  const timerValue = h("span", { className: "play-timer-value", textContent: "0" });
  const statusEl = h("div", { className: "status-banner", hidden: true });
  const questionEl = h("p", { className: "play-question" });
  const featureEl = h("div", { className: "feature-panel", hidden: true });
  const featureHeading = h("div", { className: "feature-heading" });
  const featureTextEl = h("p", { className: "feature-text" });
  const optionsHost = h("div", { className: "play-options" });
  const proceedBtn = h("button", { className: "lcars-action", type: "button" }, copy.play.skip);

  timerWrap.appendChild(timerValue);
  featureEl.appendChild(featureHeading);
  featureEl.appendChild(featureTextEl);

  // The verdict sits below the options, beside the advance button — putting it
  // above the question would shove the option you just tapped down the screen.
  const playFooter = h("div", { className: "play-footer" }, statusEl, proceedBtn);

  // Spec §4.1 / plan §7.4: DISENGAGE is the Endless-only exit. A fixed-count
  // run ends on its own, so it doesn't carry a quit control.
  const topBar = h(
    "div",
    { className: "play-top" },
    h("div", { className: "play-meta" }, progressEl, disciplineEl),
    total === null ? quitBtn : null,
  );
  const root = h(
    "div",
    { className: "play" },
    topBar,
    timerWrap,
    questionEl,
    featureEl,
    optionsHost,
    playFooter,
  );
  main.appendChild(root);

  let optionsHandle: ReturnType<typeof createAnswerOptions> | null = null;
  let answered = false;

  const timer = createTimer({
    onTick: (remainingMs) => {
      const seconds = Math.ceil(remainingMs / 1000);
      timerValue.textContent = String(seconds).padStart(2, "0");
      timerWrap.classList.toggle("play-timer--low", remainingMs < 5000);
    },
    onExpire: () => {
      if (answered || !current) return;
      answered = true;
      const correct = current.answer;
      ctx.setAnswer(current.number, "incorrect");
      answeredThisRun.add(current.number);
      optionsHandle?.reveal(correct, "");
      statusEl.hidden = false;
      statusEl.textContent = copy.play.timeExpired;
      statusEl.className = "status-banner status-banner--incorrect";
      proceedBtn.textContent = copy.play.proceed;
      proceedBtn.classList.add("lcars-action--answered");
      beepIncorrect();
    },
  });

  quitBtn.addEventListener("click", () => finish(true));

  function finish(quit: boolean): void {
    timer.stop();
    const result = buildResult(quit);
    const key = countKey(config.count);
    const isRecord = key !== null && !quit && ctx.recordHighScore(key, result.score);
    ctx.navigate("results", { kind: "results", result, config, isRecord });
  }

  function buildResult(quit: boolean): RunResult {
    let correct = 0;
    const missed: MissedItem[] = [];
    for (const number of uniqueIds) {
      const question = ctx.byNumber.get(number);
      if (!question) continue;
      const skipped = !answeredThisRun.has(number);
      const state = ctx.answerFor(number);
      if (!skipped && state === "correct") correct += 1;
      else {
        missed.push({
          number,
          question: question.question,
          chosen: null,
          skipped,
        });
      }
    }
    missed.sort((a, b) => a.number - b.number);
    const resultTotal = total === null ? uniqueIds.size : quit ? uniqueIds.size : total;
    return {
      correct,
      total: resultTotal,
      bonus: bonusTotal,
      score: correct + bonusTotal,
      missed,
    };
  }

  function drawNext(): Question {
    position += 1;
    const context: WeightContext = {
      answerLog: ctx.answerLog,
      timesSeen: seen,
      position,
      total,
      featuresOn: config.featuresOn,
    };
    const weights = weightsForPool(pool, context);
    return weightedDraw(pool, weights, mathRandom);
  }

  function present(question: Question): void {
    current = question;
    answered = false;
    seen.set(question.number, (seen.get(question.number) ?? 0) + 1);
    uniqueIds.add(question.number);

    progressEl.textContent = copy.play.progress(position, total);
    disciplineEl.textContent = copy.play.discipline(question.chapter_title);

    const showFeature = config.featuresOn && hasFeatureText(question);
    questionEl.textContent = question.question;

    featureEl.hidden = !showFeature;
    if (showFeature) {
      featureHeading.textContent = copy.play.supplementalData;
      featureTextEl.textContent = question.feature_text ?? "";
    }

    statusEl.hidden = true;
    proceedBtn.textContent = copy.play.skip;
    proceedBtn.classList.remove("lcars-action--answered");
    clear(optionsHost);

    optionsHandle = createAnswerOptions({
      options: question.options,
      onSelect: (letter) => answer(question, letter),
    });
    optionsHost.appendChild(optionsHandle.root);

    const timerActive = config.timerOn && !showFeature;
    timerWrap.hidden = !timerActive;
    if (timerActive) {
      timerWrap.classList.remove("play-timer--low");
      timer.start(config.timerSeconds);
    }

    startTime = performance.now();
  }

  function answer(question: Question, letter: string): void {
    if (answered) return;
    answered = true;
    timer.stop();

    const correct = question.answer === letter;
    ctx.setAnswer(question.number, correct ? "correct" : "incorrect");
    answeredThisRun.add(question.number);

    if (correct && config.speedBonus) {
      bonusTotal += speedBonusFor(performance.now() - startTime);
    }

    optionsHandle?.reveal(question.answer, letter);
    statusEl.hidden = false;
    statusEl.textContent = correct ? copy.play.confirmed : copy.play.incorrect;
    statusEl.className = `status-banner ${correct ? "status-banner--correct" : "status-banner--incorrect"}`;
    proceedBtn.textContent = copy.play.proceed;
    proceedBtn.classList.add("lcars-action--answered");

    if (correct) beepCorrect();
    else beepIncorrect();
  }

  proceedBtn.addEventListener("click", () => {
    if (total === null || position + 1 < total) {
      present(drawNext());
    } else {
      finish(false);
    }
  });

  present(drawNext());

  return () => timer.stop();
};
