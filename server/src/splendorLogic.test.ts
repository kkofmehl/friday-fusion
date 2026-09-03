import { describe, expect, it } from "vitest";
import {
  SPLENDOR_CARDS,
  SPLENDOR_CARDS_BY_TIER,
  SPLENDOR_NOBLES,
  emptyTokenCounts,
  gemSupplyForPlayerCount,
  getSplendorCard,
  goldSupplyForPlayerCount,
  marketSlotsForPlayerCount,
  nobleCountForPlayerCount,
  prestigeToEndForPlayerCount
} from "../../shared/splendorData";
import {
  bonusesFromPurchasedCards,
  canAffordCard,
  canReserveMore,
  canTakeSameColor,
  computeAutoPayment,
  eligibleNobles,
  playerPrestige,
  resolveSplendorWinners,
  tokensExceedLimit,
  tokensToReturnCount,
  validatePayment
} from "../../shared/splendorLogic";

describe("splendorData", () => {
  it("has 90 development cards across three tiers", () => {
    expect(SPLENDOR_CARDS).toHaveLength(90);
    expect(SPLENDOR_CARDS_BY_TIER[1]).toHaveLength(40);
    expect(SPLENDOR_CARDS_BY_TIER[2]).toHaveLength(30);
    expect(SPLENDOR_CARDS_BY_TIER[3]).toHaveLength(20);
  });

  it("has 10 nobles each worth 3 prestige", () => {
    expect(SPLENDOR_NOBLES).toHaveLength(10);
    expect(SPLENDOR_NOBLES.every((n) => n.prestige === 3)).toBe(true);
  });

  it("scales supplies and win threshold for larger tables", () => {
    expect(gemSupplyForPlayerCount(4)).toBe(7);
    expect(gemSupplyForPlayerCount(5)).toBe(9);
    expect(gemSupplyForPlayerCount(6)).toBe(11);
    expect(goldSupplyForPlayerCount(4)).toBe(5);
    expect(goldSupplyForPlayerCount(5)).toBe(6);
    expect(goldSupplyForPlayerCount(6)).toBe(7);
    expect(marketSlotsForPlayerCount(4)).toBe(4);
    expect(marketSlotsForPlayerCount(5)).toBe(5);
    expect(marketSlotsForPlayerCount(6)).toBe(5);
    expect(prestigeToEndForPlayerCount(4)).toBe(15);
    expect(prestigeToEndForPlayerCount(5)).toBe(12);
    expect(nobleCountForPlayerCount(6)).toBe(7);
  });
});

describe("splendorLogic", () => {
  it("computes bonuses and prestige from purchased cards", () => {
    const card = SPLENDOR_CARDS.find((c) => c.tier === 1 && c.prestige === 1)!;
    const bonuses = bonusesFromPurchasedCards([card.id]);
    expect(bonuses[card.bonus]).toBe(1);
    expect(playerPrestige([card.id], [])).toBe(1);
  });

  it("affords cards with bonuses and gold", () => {
    const card = getSplendorCard("d1-01")!; // cost: 3 white, bonus red
    expect(card.cost.white).toBe(3);
    const tokens = emptyTokenCounts();
    tokens.white = 2;
    tokens.gold = 1;
    expect(canAffordCard(card, tokens, { white: 0, blue: 0, green: 0, red: 0, black: 0 })).toBe(true);
    const payment = computeAutoPayment(card, tokens, {
      white: 0,
      blue: 0,
      green: 0,
      red: 0,
      black: 0
    });
    expect(payment).toEqual({ white: 2, blue: 0, green: 0, red: 0, black: 0, gold: 1 });
    expect(
      validatePayment(card, payment!, tokens, { white: 0, blue: 0, green: 0, red: 0, black: 0 })
    ).toBe(true);
  });

  it("applies permanent bonuses as discounts", () => {
    const card = getSplendorCard("d1-01")!;
    const tokens = emptyTokenCounts();
    expect(
      canAffordCard(card, tokens, { white: 3, blue: 0, green: 0, red: 0, black: 0 })
    ).toBe(true);
  });

  it("enforces take-two and reserve limits", () => {
    expect(canTakeSameColor(3)).toBe(false);
    expect(canTakeSameColor(4)).toBe(true);
    expect(canReserveMore(2)).toBe(true);
    expect(canReserveMore(3)).toBe(false);
  });

  it("detects token overflow past 10", () => {
    const tokens = emptyTokenCounts();
    tokens.white = 4;
    tokens.blue = 4;
    tokens.green = 3;
    expect(tokensExceedLimit(tokens)).toBe(true);
    expect(tokensToReturnCount(tokens)).toBe(1);
  });

  it("finds eligible nobles from bonuses", () => {
    const mary = SPLENDOR_NOBLES.find((n) => n.id === "noble-mary")!;
    const eligible = eligibleNobles(
      ["noble-mary", "noble-machiavelli"],
      { white: 0, blue: 0, green: 4, red: 4, black: 0 }
    );
    expect(eligible.map((n) => n.id)).toEqual([mary.id]);
  });

  it("resolves winners by prestige then fewest cards then fewest reserved", () => {
    expect(
      resolveSplendorWinners([
        { participantId: "a", prestige: 15, purchasedCardCount: 10, reservedCardCount: 1 },
        { participantId: "b", prestige: 16, purchasedCardCount: 12, reservedCardCount: 0 }
      ])
    ).toEqual(["b"]);

    expect(
      resolveSplendorWinners([
        { participantId: "a", prestige: 16, purchasedCardCount: 10, reservedCardCount: 2 },
        { participantId: "b", prestige: 16, purchasedCardCount: 8, reservedCardCount: 0 }
      ])
    ).toEqual(["b"]);

    expect(
      resolveSplendorWinners([
        { participantId: "a", prestige: 16, purchasedCardCount: 8, reservedCardCount: 1 },
        { participantId: "b", prestige: 16, purchasedCardCount: 8, reservedCardCount: 0 }
      ])
    ).toEqual(["b"]);

    expect(
      resolveSplendorWinners([
        { participantId: "a", prestige: 16, purchasedCardCount: 8, reservedCardCount: 1 },
        { participantId: "b", prestige: 16, purchasedCardCount: 8, reservedCardCount: 1 }
      ])
    ).toEqual(["a", "b"]);
  });
});
