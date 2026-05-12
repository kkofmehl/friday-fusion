import { describe, expect, it } from "vitest";
import { buildBsDeck, shuffledBsDeck } from "./bsDeck";

describe("bsDeck", () => {
  it("builds a standard 52-card deck with unique ids", () => {
    const deck = buildBsDeck();
    expect(deck.length).toBe(52);
    const ids = new Set(deck.map((card) => card.id));
    expect(ids.size).toBe(52);
  });

  it("contains all suits and ranks exactly once per suit/rank pair", () => {
    const deck = buildBsDeck();
    const byPair = new Map<string, number>();
    for (const card of deck) {
      const key = `${card.suit}:${card.rank}`;
      byPair.set(key, (byPair.get(key) ?? 0) + 1);
    }
    for (const suit of ["clubs", "diamonds", "hearts", "spades"] as const) {
      for (const rank of ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"] as const) {
        expect(byPair.get(`${suit}:${rank}`)).toBe(1);
      }
    }
  });

  it("shuffled deck preserves card count", () => {
    const deck = shuffledBsDeck();
    expect(deck.length).toBe(52);
  });
});
