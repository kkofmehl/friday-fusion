import { describe, expect, it } from "vitest";
import { MEMORY_SYMBOL_CATALOG } from "../../shared/memorySymbols";
import { buildMemoryDeck } from "./memoryDeck";

describe("buildMemoryDeck", () => {
  it("builds 2 * pairCount cards with two of each symbol", () => {
    const rng = (): number => 0.37;
    const deck = buildMemoryDeck(15, rng);
    expect(deck).toHaveLength(30);
    const counts = new Map<string, number>();
    const ids = new Set<string>();
    for (const c of deck) {
      expect(ids.has(c.id)).toBe(false);
      ids.add(c.id);
      counts.set(c.symbolId, (counts.get(c.symbolId) ?? 0) + 1);
    }
    expect(counts.size).toBe(15);
    for (const n of counts.values()) {
      expect(n).toBe(2);
    }
  });

  it("supports 36 cards when pairCount is 18", () => {
    const rng = (): number => 0.11;
    const deck = buildMemoryDeck(18, rng);
    expect(deck).toHaveLength(36);
    const counts = new Map<string, number>();
    for (const c of deck) {
      counts.set(c.symbolId, (counts.get(c.symbolId) ?? 0) + 1);
    }
    expect(counts.size).toBe(18);
  });

  it("throws when pair count exceeds catalog", () => {
    expect(() => buildMemoryDeck(MEMORY_SYMBOL_CATALOG.length + 1, () => 0.5)).toThrow(
      "exceeds symbol catalog"
    );
  });
});
