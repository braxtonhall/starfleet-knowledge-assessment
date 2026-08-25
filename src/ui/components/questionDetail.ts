import { h } from "../dom";
import { copy } from "../../copy";
import { createAnswerOptions } from "./answerOptions";
import { answerText } from "../../data/questions";
import type { AppContext } from "../../app-context";
import type { Question } from "../../data/types";
import { beepCorrect, beepIncorrect } from "../lcars";

export function openQuestionDetail(
  ctx: AppContext,
  question: Question,
  onAnswered: () => void,
): void {
  const backdrop = h("div", { className: "modal-backdrop" });

  const status = h("div", { className: "status-banner", hidden: true });

  const options = createAnswerOptions({
    options: question.options,
    onSelect: (letter) => {
      const correct = question.answer === letter;
      ctx.setAnswer(question.number, correct ? "correct" : "incorrect");
      options.reveal(question.answer, letter);
      status.hidden = false;
      status.textContent = correct ? copy.play.confirmed : copy.play.incorrect;
      status.className = `status-banner ${correct ? "status-banner--correct" : "status-banner--incorrect"}`;
      if (correct) beepCorrect();
      else beepIncorrect();
      onAnswered();
    },
  });

  const header = h(
    "div",
    { className: "detail-header" },
    h("span", { className: "detail-item", textContent: copy.browse.item(question.number) }),
    h("span", { className: "detail-discipline", textContent: copy.play.discipline(question.chapter_title) }),
  );

  const questionEl = h("p", { className: "detail-question", textContent: question.question });

  const body = h("div", { className: "detail-body" }, header, questionEl);

  if (question.feature_text) {
    const feature = h(
      "div",
      { className: "feature-panel" },
      h("div", { className: "feature-heading", textContent: copy.play.supplementalData }),
      h("p", { className: "feature-text", textContent: question.feature_text }),
    );
    body.appendChild(feature);
  }

  body.appendChild(options.root);

  const close = h(
    "button",
    { className: "lcars-action", type: "button", onClick: () => backdrop.remove() },
    copy.detail.close,
  );

  // Verdict sits with the actions below the options, not above the question.
  const panel = h(
    "div",
    { className: "modal-panel modal-panel--detail" },
    body,
    h("div", { className: "modal-actions" }, status, close),
  );

  backdrop.appendChild(panel);
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) backdrop.remove();
  });
  document.body.appendChild(backdrop);

  const correctAnswer = answerText(question);
  if (correctAnswer) {
    status.title = correctAnswer;
  }
}
