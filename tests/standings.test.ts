import { describe, it, expect } from "vitest";
import { leadersOf, rankScored } from "../src/logic/standings";

const roster = (...pairs: [string, number][]) =>
  pairs.map(([name, score]) => ({ name, score }));

describe("standings", () => {
  it("ranks by score, highest first", () => {
    const ranked = rankScored(roster(["ENSIGN RISA", 2], ["CADET BAJOR", 9], ["COMMANDER TRILL", 5]));
    expect(ranked.map((entry) => entry.name)).toEqual([
      "CADET BAJOR",
      "COMMANDER TRILL",
      "ENSIGN RISA",
    ]);
  });

  it("breaks ties by name so every device draws the same order", () => {
    const rows = roster(["ZETA", 4], ["ALPHA", 4], ["MU", 4]);
    expect(rankScored(rows).map((entry) => entry.name)).toEqual(["ALPHA", "MU", "ZETA"]);
    // Input order must not survive into the output.
    expect(rankScored([...rows].reverse()).map((entry) => entry.name)).toEqual([
      "ALPHA",
      "MU",
      "ZETA",
    ]);
  });

  it("does not mutate the input", () => {
    const rows = roster(["ZETA", 1], ["ALPHA", 9]);
    rankScored(rows);
    expect(rows.map((entry) => entry.name)).toEqual(["ZETA", "ALPHA"]);
  });

  it("names a single leader", () => {
    const leaders = leadersOf(roster(["ALPHA", 3], ["BETA", 7], ["GAMMA", 1]));
    expect(leaders.map((entry) => entry.name)).toEqual(["BETA"]);
  });

  it("names everyone tied at the top", () => {
    const leaders = leadersOf(roster(["ALPHA", 7], ["BETA", 7], ["GAMMA", 1]));
    expect(leaders.map((entry) => entry.name)).toEqual(["ALPHA", "BETA"]);
  });

  it("treats a scoreless drill as a dead heat, not as having no leader", () => {
    const leaders = leadersOf(roster(["ALPHA", 0], ["BETA", 0]));
    expect(leaders.map((entry) => entry.name)).toEqual(["ALPHA", "BETA"]);
  });

  it("has no leader in an empty room", () => {
    expect(leadersOf([])).toEqual([]);
    expect(rankScored([])).toEqual([]);
  });
});
