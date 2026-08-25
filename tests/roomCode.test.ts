import { describe, expect, it } from "vitest";
import {
  MAX_ROOM_LENGTH,
  generateRoomCode,
  isValidRoomCode,
  joinUrlFor,
  normalizeRoomCode,
  peerIdFor,
  roomCodeFromUrl,
} from "../src/net/roomCode";
import { randomDesignation } from "../src/net/names";
import { mulberry32 } from "../src/logic/random";

describe("generateRoomCode", () => {
  it("produces a code that survives normalization unchanged", () => {
    for (let seed = 0; seed < 50; seed += 1) {
      const code = generateRoomCode(mulberry32(seed));
      expect(normalizeRoomCode(code)).toBe(code);
      expect(isValidRoomCode(code)).toBe(true);
    }
  });

  it("avoids characters that are unreadable off a projected screen", () => {
    for (let seed = 0; seed < 50; seed += 1) {
      const registry = generateRoomCode(mulberry32(seed)).split("-")[1];
      expect(registry).not.toMatch(/[01]/);
    }
  });
});

describe("normalizeRoomCode", () => {
  it("folds however a human typed it into one canonical form", () => {
    expect(normalizeRoomCode("  enterprise 2345 ")).toBe("ENTERPRISE-2345");
    expect(normalizeRoomCode("Enterprise_2345")).toBe("ENTERPRISE-2345");
    expect(normalizeRoomCode("--enterprise--2345--")).toBe("ENTERPRISE-2345");
  });

  it("rejects input with nothing usable in it", () => {
    expect(normalizeRoomCode("   ")).toBe("");
    expect(normalizeRoomCode("!!!")).toBe("");
  });

  it("caps the length", () => {
    expect(normalizeRoomCode("A".repeat(80))).toHaveLength(MAX_ROOM_LENGTH);
  });
});

describe("join links", () => {
  it("round-trips a room code through the query string", () => {
    const url = joinUrlFor("ENTERPRISE-2345", new URL("https://example.test/trivia/"));
    expect(url).toBe("https://example.test/trivia/?room=ENTERPRISE-2345");
    expect(roomCodeFromUrl(new URL(url).search)).toBe("ENTERPRISE-2345");
  });

  it("drops any existing query or hash rather than compounding them", () => {
    const url = joinUrlFor("VOYAGER-7788", new URL("https://example.test/?room=OLD-1#play"));
    expect(url).toBe("https://example.test/?room=VOYAGER-7788");
  });

  it("normalizes a hand-edited link", () => {
    expect(roomCodeFromUrl("?room=voyager%207788")).toBe("VOYAGER-7788");
  });

  it("reports no room when the link carries none", () => {
    expect(roomCodeFromUrl("?other=1")).toBe("");
  });

  it("namespaces the broker id so another app cannot collide with a room", () => {
    expect(peerIdFor("ENTERPRISE-2345")).toBe("stfka-ENTERPRISE-2345");
  });
});

describe("randomDesignation", () => {
  it("never reissues a designation already on the roster", () => {
    const taken: string[] = [];
    for (let i = 0; i < 16; i += 1) {
      const name = randomDesignation(taken, mulberry32(i));
      expect(taken).not.toContain(name);
      taken.push(name);
    }
  });
});
