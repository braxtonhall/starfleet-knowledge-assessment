import { describe, expect, it } from "vitest";
import { buildSequence, createEndlessDrawer, shuffle } from "../src/logic/sequence";
import { mulberry32 } from "../src/logic/random";
import type { Question } from "../src/data/types";

function question(number: number, featureText: string | null = null): Question {
  return {
    number,
    chapter: 1,
    chapter_title: "THE FIVE-YEAR MISSION",
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

const plain = (count: number, offset = 0) =>
  Array.from({ length: count }, (_, i) => question(offset + i + 1));

describe("shuffle", () => {
  it("keeps every item exactly once", () => {
    const items = plain(20);
    const result = shuffle(items, mulberry32(7));
    expect(result).toHaveLength(items.length);
    expect(new Set(result.map((q) => q.number)).size).toBe(items.length);
  });

  it("does not mutate the source", () => {
    const items = plain(10);
    shuffle(items, mulberry32(1));
    expect(items.map((q) => q.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});

describe("buildSequence", () => {
  it("draws without replacement so a shared game never repeats a question", () => {
    const pool = plain(50);
    const sequence = buildSequence(pool, 20, false, mulberry32(3));
    expect(sequence).toHaveLength(20);
    expect(new Set(sequence.map((q) => q.number)).size).toBe(20);
  });

  it("only repeats once the pool is exhausted", () => {
    const pool = plain(5);
    const sequence = buildSequence(pool, 8, false, mulberry32(11));
    expect(sequence).toHaveLength(8);
    // Every question appears before any appears twice.
    expect(new Set(sequence.slice(0, 5).map((q) => q.number)).size).toBe(5);
  });

  it("saves a feature question for the finale and keeps them out of the body", () => {
    const pool = [...plain(30), question(101, "bonus"), question(102, "bonus")];
    for (let seed = 0; seed < 25; seed += 1) {
      const sequence = buildSequence(pool, 10, true, mulberry32(seed));
      expect(sequence).toHaveLength(10);
      expect(sequence[9].feature_text).not.toBeNull();
      for (const item of sequence.slice(0, 9)) {
        expect(item.feature_text).toBeNull();
      }
    }
  });

  it("applies no positional bias at a length of one", () => {
    const pool = [...plain(3), question(101, "bonus")];
    const seen = new Set<number>();
    for (let seed = 0; seed < 40; seed += 1) {
      seen.add(buildSequence(pool, 1, true, mulberry32(seed))[0].number);
    }
    // A biased single-question game would only ever pick the feature question.
    expect(seen.size).toBeGreaterThan(1);
  });

  it("still fills the requested length when plain questions run short", () => {
    const pool = [question(1), question(101, "bonus"), question(102, "bonus")];
    const sequence = buildSequence(pool, 3, true, mulberry32(5));
    expect(sequence).toHaveLength(3);
    expect(sequence[2].feature_text).not.toBeNull();
    expect(new Set(sequence.map((q) => q.number)).size).toBe(3);
  });

  it("ignores the feature bias when the filtered pool has none", () => {
    const sequence = buildSequence(plain(10), 4, true, mulberry32(2));
    expect(sequence).toHaveLength(4);
  });

  it("returns nothing for an empty pool", () => {
    expect(buildSequence([], 10, false, mulberry32(1))).toEqual([]);
  });
});

describe("createEndlessDrawer", () => {
  it("exhausts the pool before repeating anything", () => {
    const drawer = createEndlessDrawer(plain(6), mulberry32(9));
    const first = Array.from({ length: 6 }, () => drawer.next().number);
    expect(new Set(first).size).toBe(6);
    expect(drawer.next().number).toBeGreaterThan(0);
  });
});
