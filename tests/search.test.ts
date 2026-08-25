import { describe, it, expect } from "vitest";
import { normalize, searchQuestions } from "../src/logic/search";
import { filterByCategories, countsByCategory } from "../src/logic/pool";
import type { Question } from "../src/data/types";

function makeQuestion(number: number, title: string, text: string): Question {
  return {
    number,
    chapter: 1,
    chapter_title: title,
    series: "TOS",
    question: text,
    options: { A: "a", B: "b", C: "c", D: "d" },
    answer: "A",
    answer_text: "a",
    feature_text: null,
    page: 1,
    scanned_number: null,
    ocr_confidence: null,
    flags: [],
  };
}

describe("search", () => {
  it("normalizes case and punctuation", () => {
    expect(normalize("The U.S.S. Enterprise?")).toBe("the u s s enterprise");
  });

  it("matches subsequences and never options", () => {
    const questions = [
      makeQuestion(1, "A", "Who commanded the Enterprise?"),
      makeQuestion(2, "A", "What is warp drive?"),
    ];
    expect(searchQuestions("enterprise", questions).map((q) => q.number)).toEqual([1]);
  });

  it("ranks word-start matches first", () => {
    const questions = [
      makeQuestion(1, "A", "What is a phaser bank?"),
      makeQuestion(2, "A", "What is the phase variance?"),
    ];
    expect(searchQuestions("phas", questions).map((q) => q.number)).toEqual([1, 2]);
  });
});

describe("pool", () => {
  it("filters by selected category titles", () => {
    const questions = [
      makeQuestion(1, "Alpha", "a"),
      makeQuestion(2, "Beta", "b"),
      makeQuestion(3, "Alpha", "c"),
    ];
    expect(filterByCategories(questions, ["Alpha"]).map((q) => q.number)).toEqual([1, 3]);
  });

  it("counts questions per category", () => {
    const questions = [
      makeQuestion(1, "Alpha", "a"),
      makeQuestion(2, "Beta", "b"),
      makeQuestion(3, "Alpha", "c"),
    ];
    const counts = countsByCategory(questions);
    expect(counts.get("Alpha")).toBe(2);
    expect(counts.get("Beta")).toBe(1);
  });
});
