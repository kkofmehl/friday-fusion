import { describe, expect, it } from "vitest";
import { MONOPOLY_DEAL_CARD_DEFS } from "../../shared/monopolyDealData";
import {
  buildMonopolyDealDeck,
  drawCards,
  refillDrawPileFromDiscard,
  shuffledMonopolyDealDeck,
  validateMonopolyDealDeckSize
} from "./monopolyDealDeck";

describe("monopolyDealDeck", () => {
  it("builds exactly 106 cards", () => {
    const deck = buildMonopolyDealDeck();
    validateMonopolyDealDeckSize(deck);
    expect(deck.length).toBe(MONOPOLY_DEAL_CARD_DEFS.length);
  });

  it("assigns unique instance ids", () => {
    const deck = buildMonopolyDealDeck();
    const ids = new Set(deck.map((c) => c.id));
    expect(ids.size).toBe(106);
  });

  it("shuffles without changing size", () => {
    const deck = shuffledMonopolyDealDeck();
    expect(deck).toHaveLength(106);
  });

  it("refills draw pile from discard", () => {
    const draw: ReturnType<typeof buildMonopolyDealDeck> = [];
    const discard = buildMonopolyDealDeck().slice(0, 10);
    refillDrawPileFromDiscard(draw, discard);
    expect(draw).toHaveLength(10);
    expect(discard).toHaveLength(0);
  });

  it("draws cards and refills when needed", () => {
    const draw = buildMonopolyDealDeck().slice(0, 2);
    const discard = buildMonopolyDealDeck().slice(2, 12);
    const drawn = drawCards(draw, discard, 5);
    expect(drawn).toHaveLength(5);
  });
});
