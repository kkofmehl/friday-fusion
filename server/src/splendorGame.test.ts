import { describe, expect, it } from "vitest";
import {
  createSplendorGame,
  projectSplendorState,
  splendorBuyCard,
  splendorChooseNoble,
  splendorDebugSetPurchased,
  splendorReserveCard,
  splendorReturnTokens,
  splendorTakeDifferentGems,
  splendorTakeSameGems
} from "./splendorGame";
import { SPLENDOR_CARDS, emptyTokenCounts } from "../../shared/splendorData";
import { canAffordCard, computeAutoPayment } from "../../shared/splendorLogic";

describe("splendorGame", () => {
  it("deals bank and nobles by player count", () => {
    const two = createSplendorGame(["a", "b"]);
    expect(two.bank.white).toBe(4);
    expect(two.bank.gold).toBe(5);
    expect(two.nobleIds).toHaveLength(3);
    expect(two.market[1].filter(Boolean)).toHaveLength(4);
    expect(two.market[2].filter(Boolean)).toHaveLength(4);
    expect(two.market[3].filter(Boolean)).toHaveLength(4);

    const four = createSplendorGame(["a", "b", "c", "d"]);
    expect(four.bank.white).toBe(7);
    expect(four.nobleIds).toHaveLength(5);
  });

  it("rejects invalid player counts", () => {
    expect(() => createSplendorGame(["a"])).toThrow(/2 to 4/);
    expect(() => createSplendorGame(["a", "b", "c", "d", "e"])).toThrow(/2 to 4/);
  });

  it("takes different gems and advances turn", () => {
    const game = createSplendorGame(["a", "b"]);
    splendorTakeDifferentGems(game, "a", ["white", "blue", "green"]);
    expect(game.players.a!.tokens.white).toBe(1);
    expect(game.bank.white).toBe(3);
    expect(game.currentPlayerIndex).toBe(1);
  });

  it("requires 4 tokens for take-two", () => {
    const game = createSplendorGame(["a", "b"]);
    game.bank.white = 3;
    expect(() => splendorTakeSameGems(game, "a", "white")).toThrow(/at least 4/);
    game.bank.white = 4;
    splendorTakeSameGems(game, "a", "white");
    expect(game.players.a!.tokens.white).toBe(2);
    expect(game.bank.white).toBe(2);
  });

  it("forces token return when over 10", () => {
    const game = createSplendorGame(["a", "b"]);
    const player = game.players.a!;
    player.tokens = { white: 4, blue: 4, green: 2, red: 0, black: 0, gold: 0 };
    splendorTakeDifferentGems(game, "a", ["red"]);
    expect(game.pending?.type).toBe("returnTokens");
    if (game.pending?.type !== "returnTokens") {
      throw new Error("expected returnTokens");
    }
    expect(game.pending.mustReturn).toBe(1);
    expect(game.currentPlayerIndex).toBe(0);
    splendorReturnTokens(game, "a", { ...emptyTokenCounts(), red: 1 });
    expect(game.pending).toBeNull();
    expect(game.currentPlayerIndex).toBe(1);
  });

  it("reserves from market and hides reserved from opponents", () => {
    const game = createSplendorGame(["a", "b"]);
    const cardId = game.market[1][0]!;
    splendorReserveCard(game, "a", "market", 1, cardId);
    expect(game.players.a!.reservedCardIds).toContain(cardId);
    expect(game.players.a!.tokens.gold).toBe(1);
    expect(game.market[1][0]).not.toBe(cardId);

    const forA = projectSplendorState(game, "a");
    const forB = projectSplendorState(game, "b");
    if (forA.status !== "playing" || forB.status !== "playing") {
      throw new Error("expected playing");
    }
    expect(forA.myReserved.map((c) => c.id)).toContain(cardId);
    expect(forB.myReserved).toHaveLength(0);
    expect(forB.players.find((p) => p.participantId === "a")?.reservedCount).toBe(1);
  });

  it("buys an affordable market card and refills the slot", () => {
    const game = createSplendorGame(["a", "b"]);
    const cardId = game.market[1].find((id) => id)!;
    const card = SPLENDOR_CARDS.find((c) => c.id === cardId)!;
    const player = game.players.a!;
    // Give enough tokens to buy
    player.tokens = { white: 7, blue: 7, green: 7, red: 7, black: 7, gold: 5 };
    expect(canAffordCard(card, player.tokens, { white: 0, blue: 0, green: 0, red: 0, black: 0 })).toBe(
      true
    );
    const payment = computeAutoPayment(card, player.tokens, {
      white: 0,
      blue: 0,
      green: 0,
      red: 0,
      black: 0
    })!;
    splendorBuyCard(game, "a", "market", cardId, 1, payment);
    expect(game.players.a!.purchasedCardIds).toContain(cardId);
    expect(game.market[1].some((id) => id === cardId)).toBe(false);
  });

  it("ends the game after equal turns once prestige hits 15", () => {
    const game = createSplendorGame(["a", "b"]);
    // High-prestige tier 3 cards
    const highCards = SPLENDOR_CARDS.filter((c) => c.tier === 3 && c.prestige >= 4).slice(0, 4);
    splendorDebugSetPurchased(
      game,
      "a",
      highCards.map((c) => c.id)
    );
    // Trigger end by buying nothing — force finishTurn via take gems after setting cards...
    // Prestige is checked at end of turn; take gems to end A's turn.
    expect(
      highCards.reduce((sum, c) => sum + c.prestige, 0)
    ).toBeGreaterThanOrEqual(15);

    splendorTakeDifferentGems(game, "a", ["white"]);
    expect(game.finalRoundAnchorPlayerId).toBe("a");
    expect(game.status).toBe("playing");

    splendorTakeDifferentGems(game, "b", ["blue"]);
    expect(game.status).toBe("finished");
    expect(game.winnerParticipantIds).toContain("a");
  });

  it("lets the player choose among multiple eligible nobles", () => {
    const game = createSplendorGame(["a", "b"]);
    // Force two nobles with overlapping requirements
    game.nobleIds = ["noble-mary", "noble-catherine"];
    const player = game.players.a!;
    // 4 green + 4 red satisfies Mary; also need blue for Catherine — give both
    player.purchasedCardIds = [
      ...SPLENDOR_CARDS.filter((c) => c.bonus === "green").slice(0, 4).map((c) => c.id),
      ...SPLENDOR_CARDS.filter((c) => c.bonus === "red").slice(0, 4).map((c) => c.id),
      ...SPLENDOR_CARDS.filter((c) => c.bonus === "blue").slice(0, 3).map((c) => c.id)
    ];
    splendorTakeDifferentGems(game, "a", ["white"]);
    expect(game.pending?.type).toBe("chooseNoble");
    if (game.pending?.type !== "chooseNoble") {
      throw new Error("expected chooseNoble");
    }
    splendorChooseNoble(game, "a", "noble-mary");
    expect(game.players.a!.nobleIds).toEqual(["noble-mary"]);
    expect(game.nobleIds).not.toContain("noble-mary");
    expect(game.currentPlayerIndex).toBe(1);
  });
});
