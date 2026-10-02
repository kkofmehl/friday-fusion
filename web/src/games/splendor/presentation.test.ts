import { describe, expect, it } from "vitest";
import type { SplendorState } from "../../../../shared/contracts";
import { emptyTokenCounts } from "../../../../shared/splendorData";
import { diffSplendorView } from "./presentation";

const card = {
  id: "d1-01",
  tier: 1 as const,
  bonus: "red" as const,
  prestige: 1,
  cost: { white: 3 }
};

function playing(): Extract<SplendorState, { status: "playing" }> {
  return {
    status: "playing",
    playerOrder: ["a", "b"],
    currentPlayerId: "a",
    bank: { white: 4, blue: 4, green: 4, red: 4, black: 4, gold: 5 },
    market: {
      1: [card, null, null, null],
      2: [null, null, null, null],
      3: [null, null, null, null]
    },
    deckCounts: { 1: 36, 2: 30, 3: 20 },
    nobles: [
      {
        id: "noble-mary",
        name: "Mary Stuart",
        prestige: 3,
        requirements: { green: 4, red: 4 }
      }
    ],
    players: [
      {
        participantId: "a",
        tokens: { ...emptyTokenCounts(), white: 3 },
        bonuses: { white: 0, blue: 0, green: 0, red: 0, black: 0 },
        prestige: 0,
        purchasedCardCount: 0,
        reservedCount: 0,
        nobles: [],
        purchasedByBonus: { white: [], blue: [], green: [], red: [], black: [] }
      },
      {
        participantId: "b",
        tokens: emptyTokenCounts(),
        bonuses: { white: 0, blue: 0, green: 0, red: 0, black: 0 },
        prestige: 0,
        purchasedCardCount: 0,
        reservedCount: 0,
        nobles: [],
        purchasedByBonus: { white: [], blue: [], green: [], red: [], black: [] }
      }
    ],
    myReserved: [],
    pending: null,
    prestigeToEnd: 15,
    finalRoundAnchorPlayerId: null
  };
}

describe("diffSplendorView", () => {
  it("returns nothing when the board has not changed", () => {
    const state = playing();
    expect(diffSplendorView(state, playing(), "a")).toEqual([]);
  });

  it("describes a market purchase, the gems spent, and the score change", () => {
    const prev = playing();
    const next = playing();
    next.market[1] = [null, null, null, null];
    next.currentPlayerId = "b";
    next.bank.white = 7;
    const buyer = next.players[0]!;
    buyer.tokens.white = 0;
    buyer.prestige = 1;
    buyer.purchasedCardCount = 1;
    buyer.bonuses.red = 1;
    buyer.purchasedByBonus.red = [card];

    const events = diffSplendorView(prev, next, "a");
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "cardPurchased", cardId: "d1-01", from: "market", participantId: "a" }),
        expect.objectContaining({ type: "tokensSpent", color: "white", amount: 3, participantId: "a" }),
        expect.objectContaining({ type: "scoreChanged", participantId: "a", from: 0, to: 1 }),
        expect.objectContaining({ type: "turnChanged", participantId: "b" })
      ])
    );
  });

  it("describes reserving a market card and gaining a gold token", () => {
    const prev = playing();
    const next = playing();
    next.market[1] = [null, null, null, null];
    next.currentPlayerId = "b";
    next.bank.gold = 4;
    next.myReserved = [card];
    const player = next.players[0]!;
    player.tokens.gold = 1;
    player.reservedCount = 1;

    const events = diffSplendorView(prev, next, "a");
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "cardReserved", cardId: "d1-01", from: "market", participantId: "a" }),
        expect.objectContaining({ type: "tokensGained", color: "gold", amount: 1, participantId: "a" })
      ])
    );
    expect(events.some((event) => event.type === "cardPurchased")).toBe(false);
  });

  it("describes taking different gems from the bank", () => {
    const prev = playing();
    const next = playing();
    next.currentPlayerId = "b";
    next.bank.blue = 3;
    next.bank.green = 3;
    next.players[0]!.tokens.blue = 1;
    next.players[0]!.tokens.green = 1;

    const events = diffSplendorView(prev, next, "a");
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "tokensGained", color: "blue", amount: 1 }),
        expect.objectContaining({ type: "tokensGained", color: "green", amount: 1 })
      ])
    );
  });

  it("describes a noble acquisition and the score it adds", () => {
    const prev = playing();
    const next = playing();
    next.nobles = [];
    next.players[0]!.nobles = [prev.nobles[0]!];
    next.players[0]!.prestige = 3;

    const events = diffSplendorView(prev, next, "a");
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "nobleAcquired",
          nobleId: "noble-mary",
          name: "Mary Stuart",
          participantId: "a"
        }),
        expect.objectContaining({ type: "scoreChanged", from: 0, to: 3, milestone: false })
      ])
    );
  });

  it("describes the end of the game without treating the whole market as purchased", () => {
    const prev = playing();
    const next: SplendorState = {
      status: "finished",
      winnerParticipantIds: ["a"],
      players: prev.players.map((player) =>
        player.participantId === "a" ? { ...player, prestige: 15 } : player
      ),
      prestigeByParticipant: { a: 15, b: 0 }
    };

    const events = diffSplendorView(prev, next, "a");
    expect(events.some((event) => event.type === "cardPurchased")).toBe(false);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "scoreChanged", participantId: "a", to: 15, milestone: true }),
        expect.objectContaining({ type: "gameFinished", winnerParticipantIds: ["a"] })
      ])
    );
  });

  it("ignores a restarted game instead of animating every card leaving the table", () => {
    const prev = playing();
    prev.players[0]!.purchasedCardCount = 4;
    prev.players[0]!.purchasedByBonus.red = [card];
    const next = playing();
    expect(diffSplendorView(prev, next, "a")).toEqual([]);
  });
});
