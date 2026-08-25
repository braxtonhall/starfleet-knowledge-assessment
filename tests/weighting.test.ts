import { describe, it, expect } from "vitest";
import {
  baseWeightForState,
  sessionDecay,
  weightedDraw,
  featureWeightForPosition,
  hasFeatureText,
} from "../src/logic/weighting";
import { mulberry32 } from "../src/logic/random";
import type { Question } from "../src/data/types";

function makeQuestion(number: number, feature = false): Question {
  return {
    number,
    chapter: 1,
    chapter_title: "The Five-Year Mission",
    series: "TOS",
    question: `Question ${number}`,
    options: { A: "a", B: "b", C: "c", D: "d" },
    answer: "A",
    answer_text: "a",
    feature_text: feature ? "Feature material" : null,
    page: 1,
    scanned_number: null,
    ocr_confidence: null,
    flags: [],
  };
}

describe("weighting", () => {
  it("assigns the base weights", () => {
    expect(baseWeightForState("unanswered")).toBe(10);
    expect(baseWeightForState("incorrect")).toBe(10);
    expect(baseWeightForState("correct")).toBe(1);
  });

  it("decays with repeat count", () => {
    expect(sessionDecay(0)).toBe(1);
    expect(sessionDecay(1)).toBe(0.5);
    expect(sessionDecay(3)).toBe(0.25);
  });

  it("detects feature text", () => {
    expect(hasFeatureText(makeQuestion(1))).toBe(false);
    expect(hasFeatureText(makeQuestion(2, true))).toBe(true);
  });

  it("upweights feature questions only at the final position", () => {
    const feature = makeQuestion(1, true);
    expect(featureWeightForPosition(feature, 0, 20, true)).toBe(0.1);
    expect(featureWeightForPosition(feature, 19, 20, true)).toBe(20);
    expect(featureWeightForPosition(feature, 0, 20, false)).toBe(1);
    expect(featureWeightForPosition(makeQuestion(2), 19, 20, true)).toBe(1);
  });

  it("drops the finale bias when there is no final position", () => {
    // Endless (`total === null`) and a one-question run have nothing to save a
    // feature question for, so it draws at ordinary weight and turns up at a
    // random point instead of last.
    const feature = makeQuestion(1, true);
    expect(featureWeightForPosition(feature, 0, null, true)).toBe(1);
    expect(featureWeightForPosition(feature, 99, null, true)).toBe(1);
    expect(featureWeightForPosition(feature, 0, 1, true)).toBe(1);
  });

  it("draws high-weight items far more often", () => {
    const items = ["rare", "common"];
    const weights = [1, 100];
    const random = mulberry32(1);
    let common = 0;
    for (let i = 0; i < 1000; i += 1) {
      if (weightedDraw(items, weights, random) === "common") common += 1;
    }
    expect(common).toBeGreaterThan(900);
  });
});
