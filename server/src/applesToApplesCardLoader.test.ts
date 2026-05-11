import { describe, expect, it } from "vitest";
import {
  getApplesToApplesResponses,
  getApplesToApplesTopics,
  pickApplesTopic,
  shuffledResponseCardIds
} from "./applesToApplesCardLoader";

describe("applesToApplesCardLoader", () => {
  it("loads non-empty topic and response pools", () => {
    expect(getApplesToApplesTopics().length).toBeGreaterThan(10);
    expect(getApplesToApplesResponses().length).toBeGreaterThan(50);
  });

  it("pickApplesTopic avoids used ids until pool is exhausted", () => {
    const used = new Set<string>();
    const first = pickApplesTopic(used);
    expect(first.id).toBeTruthy();
    used.add(first.id);
    for (let i = 0; i < 20; i += 1) {
      const next = pickApplesTopic(used);
      expect(next.id).toBeTruthy();
      used.add(next.id);
    }
  });

  it("shuffledResponseCardIds returns a permutation of all ids", () => {
    const pool = getApplesToApplesResponses();
    const a = shuffledResponseCardIds();
    expect(a.length).toBe(pool.length);
    const set = new Set(a);
    expect(set.size).toBe(pool.length);
  });
});
