import { describe, expect, it } from "vitest";
import { advanceTurnAfterPlay, isColoredNumberCard, unoCanPlayCard } from "./unoGameHelpers";
import type { UnoCard } from "../../shared/contracts";

describe("unoGameHelpers", () => {
  it("isColoredNumberCard rejects wild and actions", () => {
    expect(isColoredNumberCard({ id: "r", color: "red", rank: 3 })).toBe(true);
    expect(isColoredNumberCard({ id: "w", color: "wild", rank: "wild" })).toBe(false);
    expect(isColoredNumberCard({ id: "s", color: "red", rank: "skip" })).toBe(false);
  });

  it("unoCanPlayCard matches color or rank", () => {
    const top: UnoCard = { id: "t", color: "blue", rank: 5 };
    const hand: UnoCard[] = [
      { id: "a", color: "red", rank: 5 },
      { id: "b", color: "yellow", rank: 2 }
    ];
    expect(unoCanPlayCard(hand[0]!, top, "blue", hand)).toBe(true);
    expect(unoCanPlayCard(hand[1]!, top, "blue", hand)).toBe(false);
  });

  it("advanceTurnAfterPlay skips two for skip", () => {
    const order = ["a", "b", "c", "d"];
    const out = advanceTurnAfterPlay(order, 0, 1, "skip");
    expect(order[out.currentPlayerIndex]).toBe("c");
  });
});
