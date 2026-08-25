import { describe, expect, it } from "vitest";
import { eligiblePool, filterByCategories, countsByCategory } from "../src/logic/pool";
import type { Question } from "../src/data/types";

function question(number: number, title: string, featureText: string | null = null): Question {
  return {
    number,
    chapter: 1,
    chapter_title: title,
    series: "TOS",
    question: `Question ${number}`,
    options: { A: "a", B: "b", C: "c", D: "d" },
    answer: "A",
    answer_text: "a",
    feature_text: featureText,
    page: 1,
    scanned_number: null,
    ocr_confidence: null,
    flags: [],
  };
}

const MISSION = "THE FIVE-YEAR MISSION";
const KLINGON = "KLINGON AFFAIRS";

const archive = [
  question(1, MISSION),
  question(2, MISSION, "bonus"),
  question(3, MISSION, "   "),
  question(4, KLINGON),
  question(5, KLINGON, "bonus"),
];

describe("eligiblePool", () => {
  it("keeps feature questions when supplemental data is on", () => {
    const pool = eligiblePool(archive, [MISSION, KLINGON], true);
    expect(pool.map((q) => q.number)).toEqual([1, 2, 3, 4, 5]);
  });

  it("drops feature questions when supplemental data is off", () => {
    // A feature question without its feature text is an incomplete question,
    // so it leaves the pool rather than being asked bare.
    const pool = eligiblePool(archive, [MISSION, KLINGON], false);
    expect(pool.map((q) => q.number)).toEqual([1, 3, 4]);
  });

  it("treats blank feature text as no feature text", () => {
    expect(eligiblePool(archive, [MISSION], false).map((q) => q.number)).toContain(3);
  });

  it("applies the discipline filter either way", () => {
    expect(eligiblePool(archive, [KLINGON], true).map((q) => q.number)).toEqual([4, 5]);
    expect(eligiblePool(archive, [KLINGON], false).map((q) => q.number)).toEqual([4]);
  });

  it("is empty when no discipline is selected", () => {
    expect(eligiblePool(archive, [], true)).toEqual([]);
  });
});

describe("filterByCategories", () => {
  it("keeps only the selected disciplines", () => {
    expect(filterByCategories(archive, [MISSION]).map((q) => q.number)).toEqual([1, 2, 3]);
  });
});

describe("countsByCategory", () => {
  it("counts each discipline", () => {
    const counts = countsByCategory(archive);
    expect(counts.get(MISSION)).toBe(3);
    expect(counts.get(KLINGON)).toBe(2);
  });
});
