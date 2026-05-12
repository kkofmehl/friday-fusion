import { buildUnoDeck, shuffledUnoDeck, validateUnoDeckSize } from "./unoDeck";
import { describe, expect, it } from "vitest";
import { UNO_DECK_SIZE } from "../../shared/contracts";

describe("unoDeck", () => {
  it("builds 108 cards with correct composition", () => {
    const deck = buildUnoDeck();
    validateUnoDeckSize(deck);
    expect(deck.length).toBe(UNO_DECK_SIZE);

    const byKey = new Map<string, number>();
    for (const c of deck) {
      const key =
        c.color === "wild"
          ? `wild:${c.rank}`
          : `${c.color}:${typeof c.rank === "number" ? c.rank : c.rank}`;
      byKey.set(key, (byKey.get(key) ?? 0) + 1);
    }

    for (const color of ["red", "yellow", "green", "blue"] as const) {
      expect(byKey.get(`${color}:0`)).toBe(1);
      for (let n = 1; n <= 9; n += 1) {
        expect(byKey.get(`${color}:${n}`)).toBe(2);
      }
      expect(byKey.get(`${color}:skip`)).toBe(2);
      expect(byKey.get(`${color}:reverse`)).toBe(2);
      expect(byKey.get(`${color}:drawTwo`)).toBe(2);
    }
    expect(byKey.get("wild:wild")).toBe(4);
    expect(byKey.get("wild:wildDrawFour")).toBe(4);
  });

  it("shuffledUnoDeck preserves size", () => {
    const d = shuffledUnoDeck();
    expect(d.length).toBe(UNO_DECK_SIZE);
  });
});
