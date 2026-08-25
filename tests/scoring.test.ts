import { describe, it, expect } from "vitest";
import { speedBonusFor, isNewHighScore, countKey } from "../src/logic/scoring";

describe("scoring", () => {
  it("awards the full bonus for instant answers", () => {
    expect(speedBonusFor(0)).toBe(3);
  });

  it("awards nothing past the window", () => {
    expect(speedBonusFor(15000)).toBe(0);
    expect(speedBonusFor(30000)).toBe(0);
  });

  it("is non-increasing with elapsed time", () => {
    let previous = Infinity;
    for (let ms = 0; ms <= 15000; ms += 500) {
      const bonus = speedBonusFor(ms);
      expect(bonus).toBeLessThanOrEqual(previous);
      previous = bonus;
    }
  });

  it("detects new high scores", () => {
    expect(isNewHighScore(5, undefined)).toBe(true);
    expect(isNewHighScore(6, 5)).toBe(true);
    expect(isNewHighScore(4, 5)).toBe(false);
  });

  it("maps counts to score keys", () => {
    expect(countKey(10)).toBe("10");
    expect(countKey("all")).toBe("all");
    expect(countKey("endless")).toBe(null);
  });
});
