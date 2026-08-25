import { describe, expect, it } from "vitest";
import {
  createRotationSession,
  dealRotation,
  rotationDraw,
  type RotationSession,
  type RotationState,
} from "../src/logic/rotation";
import { mulberry32 } from "../src/logic/random";
import { defaultConfig, type Question, type QuizConfig } from "../src/data/types";

const CATEGORY = "THE FIVE-YEAR MISSION";

function question(number: number, featureText: string | null = null): Question {
  return {
    number,
    chapter: 1,
    chapter_title: CATEGORY,
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

const plain = (count: number) => Array.from({ length: count }, (_, i) => question(i + 1));

function config(overrides: Partial<QuizConfig> = {}): QuizConfig {
  return { ...defaultConfig([CATEGORY]), ...overrides };
}

function session(pool: Question[], overrides: Partial<QuizConfig> = {}, seed = 1): RotationSession {
  return createRotationSession({
    playable: pool,
    config: config(overrides),
    random: mulberry32(seed),
  });
}

/** Answer the current officer's question and step to the next hand-off. */
function takeTurn(rotation: RotationSession, letter: string): RotationState {
  rotation.advance(); // hand-off → question
  rotation.answer(letter);
  const answered = rotation.getState();
  rotation.advance(); // verdict → next hand-off
  return answered;
}

describe("rotationDraw", () => {
  it("means the count *each*, so the whole drill draws officers × count", () => {
    expect(rotationDraw(20, 500, 4)).toEqual({ perOfficer: 20, total: 80, sufficient: true });
  });

  it("refuses a drill the pool cannot deal without repeating", () => {
    expect(rotationDraw(50, 199, 4).sufficient).toBe(false);
    expect(rotationDraw(50, 200, 4).sufficient).toBe(true);
  });

  it("splits the archive across the crew at ALL rather than dealing it each", () => {
    // Everyone still answers the same number, so the standings compare like
    // with like; the remainder is simply not dealt.
    expect(rotationDraw("all", 101, 4)).toEqual({ perOfficer: 25, total: 100, sufficient: true });
  });

  it("has no fixed length to guard in an endless drill", () => {
    expect(rotationDraw("endless", 40, 8)).toEqual({
      perOfficer: null,
      total: null,
      sufficient: true,
    });
  });

  it("refuses a crew larger than the archive", () => {
    expect(rotationDraw("all", 3, 4).sufficient).toBe(false);
  });
});

describe("dealRotation", () => {
  it("deals one shared bag across the crew, so no question reaches two officers", () => {
    const hands = dealRotation({
      pool: plain(60),
      officers: 4,
      perOfficer: 10,
      featuresOn: false,
      random: mulberry32(7),
    });
    expect(hands).toHaveLength(4);
    for (const hand of hands) expect(hand).toHaveLength(10);
    const numbers = hands.flat().map((q) => q.number);
    expect(new Set(numbers).size).toBe(40);
  });

  it("saves a feature question for every officer's own final slot", () => {
    const pool = [...plain(40), ...Array.from({ length: 5 }, (_, i) => question(200 + i, "bonus"))];
    for (let seed = 0; seed < 15; seed += 1) {
      const hands = dealRotation({
        pool,
        officers: 4,
        perOfficer: 6,
        featuresOn: true,
        random: mulberry32(seed),
      });
      const finales = new Set<number>();
      for (const hand of hands) {
        expect(hand).toHaveLength(6);
        expect(hand[5].feature_text).not.toBeNull();
        finales.add(hand[5].number);
        for (const item of hand.slice(0, 5)) expect(item.feature_text).toBeNull();
      }
      // A finale is still drawn from the one shared bag.
      expect(finales.size).toBe(4);
    }
  });

  it("hands out what feature questions there are when the pool is short of them", () => {
    const pool = [...plain(30), question(200, "bonus")];
    const hands = dealRotation({
      pool,
      officers: 4,
      perOfficer: 5,
      featuresOn: true,
      random: mulberry32(3),
    });
    const withFinale = hands.filter((hand) => hand[4].feature_text !== null);
    expect(withFinale).toHaveLength(1);
    for (const hand of hands) expect(hand).toHaveLength(5);
    expect(new Set(hands.flat().map((q) => q.number)).size).toBe(20);
  });

  it("applies no positional bias at a length of one", () => {
    const pool = [...plain(6), question(200, "bonus")];
    const seen = new Set<number>();
    for (let seed = 0; seed < 30; seed += 1) {
      const hands = dealRotation({
        pool,
        officers: 2,
        perOfficer: 1,
        featuresOn: true,
        random: mulberry32(seed),
      });
      for (const hand of hands) seen.add(hand[0].number);
    }
    expect(seen.size).toBeGreaterThan(2);
  });
});

describe("rotation session", () => {
  it("opens on the config screen and will not start a drill it cannot deal", () => {
    const rotation = session(plain(10), { count: 20, officers: 4 });
    rotation.start();
    expect(rotation.getState().phase).toBe("config");
  });

  it("shows the watch bill before the first hand-off, with a designation each", () => {
    const rotation = session(plain(60), { count: 10, officers: 4 });
    rotation.start();
    const state = rotation.getState();
    expect(state.phase).toBe("watchbill");
    expect(state.officers).toHaveLength(4);
    expect(new Set(state.officers.map((o) => o.name)).size).toBe(4);
    expect(state.officers.map((o) => o.index)).toEqual([0, 1, 2, 3]);
    // Nothing has been dealt to the screen yet.
    expect(state.question).toBeNull();
  });

  it("cycles hand-off → question → verdict → hand-off in roster order", () => {
    const rotation = session(plain(9), { count: "all", officers: 3 });
    rotation.start();
    rotation.advance(); // watch bill → first hand-off

    const order: number[] = [];
    for (let turn = 0; turn < 6; turn += 1) {
      expect(rotation.getState().phase).toBe("handoff");
      order.push(rotation.getState().currentIndex as number);
      rotation.advance();
      expect(rotation.getState().phase).toBe("question");
      rotation.answer("A");
      expect(rotation.getState().phase).toBe("verdict");
      rotation.advance();
    }
    expect(order).toEqual([0, 1, 2, 0, 1, 2]);
  });

  it("never puts the same question in front of two officers", () => {
    const rotation = session(plain(12), { count: "all", officers: 3 });
    rotation.start();
    rotation.advance();

    const numbers: number[] = [];
    while (rotation.getState().phase !== "over") {
      const state = takeTurn(rotation, "A");
      numbers.push(state.question?.number as number);
    }
    expect(numbers).toHaveLength(12);
    expect(new Set(numbers).size).toBe(12);
  });

  it("ends the drill once every officer has had their last turn", () => {
    const rotation = session(plain(4), { count: "all", officers: 2 });
    rotation.start();
    rotation.advance();
    for (let turn = 0; turn < 4; turn += 1) takeTurn(rotation, "A");
    expect(rotation.getState().phase).toBe("over");
  });

  it("carries only the outgoing officer's verdict onto the hand-off", () => {
    const rotation = session(plain(4), { count: "all", officers: 2 });
    rotation.start();
    rotation.advance();
    expect(rotation.getState().previous).toBeNull();

    const first = rotation.getState().officers[0].name;
    takeTurn(rotation, "B"); // wrong
    const handoff = rotation.getState();
    expect(handoff.phase).toBe("handoff");
    expect(handoff.previous).toEqual({ name: first, correct: false });
    // Nothing of the previous question survives into the hand-off state.
    expect(handoff.question).toBeNull();
    expect(handoff.chosen).toBeNull();
  });

  it("scores each officer on their own items and files their own misses", () => {
    const rotation = session(plain(4), { count: "all", officers: 2 });
    rotation.start();
    rotation.advance();

    takeTurn(rotation, "A"); // officer 0 — correct
    takeTurn(rotation, "C"); // officer 1 — wrong
    takeTurn(rotation, "A"); // officer 0 — correct
    takeTurn(rotation, "C"); // officer 1 — wrong

    const [first, second] = rotation.getState().officers;
    expect(first.score).toBe(2);
    expect(first.correctCount).toBe(2);
    expect(first.turns).toBe(2);
    expect(first.missed).toHaveLength(0);

    expect(second.score).toBe(0);
    expect(second.turns).toBe(2);
    expect(second.missed.map((item) => item.chosen)).toEqual(["C", "C"]);
    // Questions only — the recap never carries the answer.
    expect(Object.keys(second.missed[0])).toEqual(["number", "question", "chosen"]);
  });

  it("locks an answer once taken", () => {
    const rotation = session(plain(4), { count: "all", officers: 2 });
    rotation.start();
    rotation.advance();
    rotation.advance();
    rotation.answer("B");
    rotation.answer("A");
    expect(rotation.getState().chosen).toBe("B");
    expect(rotation.getState().correct).toBe(false);
  });

  it("ends an endless drill where it stands, and the standings say so", () => {
    const rotation = session(plain(60), { count: "endless", officers: 3 });
    rotation.start();
    expect(rotation.getState().perOfficer).toBeNull();
    rotation.advance();

    // A full rotation, then one more officer, then somebody calls it.
    for (let turn = 0; turn < 4; turn += 1) takeTurn(rotation, "A");
    rotation.disengage();

    const state = rotation.getState();
    expect(state.phase).toBe("over");
    expect(state.officers.map((officer) => officer.turns)).toEqual([2, 1, 1]);
    // Visible rather than hidden: the officer who never got their last turn is
    // ranked on a smaller denominator, and the table shows both numbers.
    expect(state.officers.map((officer) => officer.correctCount)).toEqual([2, 1, 1]);
  });

  it("keeps the crew and deals a fresh bag on ROTATE AGAIN", () => {
    const rotation = session(plain(40), { count: 10, officers: 2 });
    rotation.start();
    rotation.advance();

    const first: number[] = [];
    while (rotation.getState().phase !== "over") {
      first.push(takeTurn(rotation, "A").question?.number as number);
    }
    const names = rotation.getState().officers.map((officer) => officer.name);

    rotation.restart();
    const state = rotation.getState();
    expect(state.phase).toBe("watchbill");
    expect(state.officers.map((officer) => officer.name)).toEqual(names);
    // Scores and recaps belong to the drill that just ended.
    expect(state.officers.map((officer) => officer.score)).toEqual([0, 0]);
    expect(state.officers.every((officer) => officer.missed.length === 0)).toBe(true);

    rotation.advance();
    const second: number[] = [];
    while (rotation.getState().phase !== "over") {
      second.push(takeTurn(rotation, "A").question?.number as number);
    }
    expect(second).toHaveLength(20);
    expect(second).not.toEqual(first);
  });

  it("never writes to the answer log — it has no way to (spec §5.11)", () => {
    // The session takes no `onResolved` hook at all, unlike `hostSession`: four
    // guests' guesses must not reweight the device owner's Solo draws.
    const rotation = session(plain(4), { count: "all", officers: 2 });
    expect(Object.keys(rotation)).not.toContain("onResolved");
  });

  it("leaves a supplemental-data question untimed", () => {
    const pool = [...plain(2), question(200, "bonus"), question(201, "bonus")];
    const rotation = session(pool, {
      count: "all",
      officers: 2,
      featuresOn: true,
      timerOn: true,
      timerSeconds: 20,
    });
    rotation.start();
    rotation.advance();

    for (let turn = 0; turn < 4; turn += 1) {
      rotation.advance();
      const state = rotation.getState();
      expect(state.timerSeconds).toBe(state.showFeature ? null : 20);
      rotation.answer("A");
      rotation.advance();
    }
  });
});
