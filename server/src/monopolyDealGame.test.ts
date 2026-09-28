import { describe, expect, it } from "vitest";
import { formatMillions, getCardHelpText } from "../../shared/monopolyDealCardHelp";
import { getCardDef } from "../../shared/monopolyDealData";
import { getColorSets } from "../../shared/monopolyDealLogic";
import {
  createMonopolyDealGame,
  monopolyDealBankCard,
  monopolyDealCancelResolution,
  monopolyDealEndTurn,
  monopolyDealForceEndTurn,
  monopolyDealRemovePlayer,
  monopolyDealFlipWild,
  monopolyDealLayProperty,
  monopolyDealMoveWild,
  monopolyDealPlayAction,
  monopolyDealPlayRentWithDouble,
  monopolyDealMaybeExpireJustSayNo,
  monopolyDealRespondJustSayNo,
  monopolyDealExtendJustSayNo,
  monopolyDealExpireJustSayNo,
  monopolyDealSelectRentColor,
  monopolyDealSelectTarget,
  monopolyDealSetWager,
  monopolyDealStartAfterWagers,
  monopolyDealSubmitPayment,
  monopolyDealUndoBank
} from "./monopolyDealGame";

describe("monopolyDealCardHelp", () => {
  it("formats money as value plus M", () => {
    expect(formatMillions(3)).toBe("3M");
  });

  it("describes pass go", () => {
    expect(getCardHelpText(getCardDef("action-passGo-0"))).toMatch(/Draw 2/i);
  });

  it("describes two-color rent as charging all other players", () => {
    expect(getCardHelpText(getCardDef("rent-red-yellow-0"))).toMatch(/all other players/i);
  });

  it("says two-color wilds cannot be banked", () => {
    expect(getCardHelpText(getCardDef("wild-red-yellow-0"))).toMatch(/cannot be banked/i);
  });
});

describe("monopolyDealGame plays remaining", () => {
  it("does not bank a card when no plays remain", () => {
    const game = createMonopolyDealGame(["p1", "p2"]);
    monopolyDealSetWager(game, "p1", 1, 10);
    monopolyDealSetWager(game, "p2", 1, 10);
    monopolyDealStartAfterWagers(game);
    game.playsRemaining = 0;
    const cardId = game.hands.p1![0]!.id;
    const handBefore = game.hands.p1!.length;
    const bankBefore = game.boards.p1!.bank.length;

    expect(() => monopolyDealBankCard(game, "p1", cardId)).toThrow(/No plays remaining/i);
    expect(game.hands.p1).toHaveLength(handBefore);
    expect(game.boards.p1!.bank).toHaveLength(bankBefore);
  });
});

describe("monopolyDealGame house and hotel", () => {
  it("rejects house when no eligible set exists", () => {
    const game = createMonopolyDealGame(["p1", "p2"]);
    monopolyDealSetWager(game, "p1", 1, 10);
    monopolyDealSetWager(game, "p2", 1, 10);
    monopolyDealStartAfterWagers(game);
    game.hands.p1 = [{ id: "house-1", defId: "action-house-0" }];
    game.currentPlayerIndex = 0;
    game.playsRemaining = 3;

    expect(() => monopolyDealPlayAction(game, "p1", "house-1")).toThrow(/eligible for a house/i);
    expect(game.hands.p1).toHaveLength(1);
    expect(game.playsRemaining).toBe(3);
  });

  it("rejects hotel when no set has a house", () => {
    const game = createMonopolyDealGame(["p1", "p2"]);
    monopolyDealSetWager(game, "p1", 1, 10);
    monopolyDealSetWager(game, "p2", 1, 10);
    monopolyDealStartAfterWagers(game);
    game.boards.p1!.propertySets.green = {
      cards: [
        { instanceId: "g1", defId: "prop-green-pacific", activeColor: "green" },
        { instanceId: "g2", defId: "prop-green-northCarolina", activeColor: "green" },
        { instanceId: "g3", defId: "prop-green-pennsylvania", activeColor: "green" }
      ],
      house: false,
      hotel: false
    };
    game.hands.p1 = [{ id: "hotel-1", defId: "action-hotel-0" }];
    game.currentPlayerIndex = 0;
    game.playsRemaining = 3;

    expect(() => monopolyDealPlayAction(game, "p1", "hotel-1")).toThrow(/house eligible for a hotel/i);
    expect(game.hands.p1).toHaveLength(1);
  });
});

describe("monopolyDealGame payments", () => {
  it("records a payment event when rent is paid", () => {
    const game = createMonopolyDealGame(["p1", "p2"]);
    monopolyDealSetWager(game, "p1", 1, 10);
    monopolyDealSetWager(game, "p2", 1, 10);
    monopolyDealStartAfterWagers(game);

    game.boards.p1!.propertySets.brown = {
      cards: [
        { instanceId: "b1", defId: "prop-brown-mediterranean", activeColor: "brown" },
        { instanceId: "b2", defId: "prop-brown-baltic", activeColor: "brown" }
      ],
      house: false,
      hotel: false
    };
    game.boards.p2!.bank = [
      { id: "m1", defId: "money-1m-0" },
      { id: "m2", defId: "money-1m-1" }
    ];
    game.hands.p1 = [{ id: "rent-1", defId: "rent-brown-lightBlue-0" }];
    game.hands.p2 = game.hands.p2!.filter((c) => getCardDef(c.defId).action !== "justSayNo");
    game.currentPlayerIndex = 0;
    game.playsRemaining = 3;

    monopolyDealPlayAction(game, "p1", "rent-1");
    monopolyDealSelectRentColor(game, "p1", "brown", "p2");
    monopolyDealSubmitPayment(game, "p2", [
      { zone: "bank", instanceId: "m1" },
      { zone: "bank", instanceId: "m2" }
    ]);

    expect(game.recentEvent).toMatchObject({
      type: "payment",
      payerId: "p2",
      payeeId: "p1",
      amount: 2,
      reason: expect.stringMatching(/rent/i)
    });
  });
});

describe("monopolyDealGame forced deal", () => {
  it("resolves target player then property then swap in three steps", () => {
    const game = createMonopolyDealGame(["p1", "p2"]);
    monopolyDealSetWager(game, "p1", 1, 10);
    monopolyDealSetWager(game, "p2", 1, 10);
    monopolyDealStartAfterWagers(game);

    const theirPropId = "their-brown";
    const myPropId = "my-blue";
    game.boards.p2!.propertySets.brown = {
      cards: [{ instanceId: theirPropId, defId: "prop-brown-mediterranean", activeColor: "brown" }],
      house: false,
      hotel: false
    };
    game.boards.p1!.propertySets.lightBlue = {
      cards: [{ instanceId: myPropId, defId: "prop-lightBlue-oriental", activeColor: "lightBlue" }],
      house: false,
      hotel: false
    };

    const forcedDealId = "fd-1";
    game.hands.p1 = [{ id: forcedDealId, defId: "action-forcedDeal-0" }];
    game.hands.p2 = game.hands.p2!.filter((c) => getCardDef(c.defId).action !== "justSayNo");
    game.currentPlayerIndex = 0;
    game.playsRemaining = 3;

    monopolyDealPlayAction(game, "p1", forcedDealId);
    expect(game.pendingResolution).toMatchObject({ kind: "selectTarget", actionType: "forcedDeal" });

    monopolyDealSelectTarget(game, "p1", { targetId: "p2" });
    expect(game.pendingResolution).toMatchObject({
      kind: "selectTarget",
      actionType: "forcedDeal",
      targetId: "p2"
    });

    monopolyDealSelectTarget(game, "p1", { cardInstanceId: theirPropId });
    expect(game.pendingResolution).toMatchObject({ kind: "forcedDealPickMine", targetId: "p2" });

    monopolyDealSelectTarget(game, "p1", { cardInstanceId: myPropId });
    expect(game.pendingResolution).toBeNull();
    expect(game.boards.p1!.propertySets.brown?.cards.some((c) => c.instanceId === theirPropId)).toBe(true);
    expect(game.boards.p2!.propertySets.lightBlue?.cards.some((c) => c.instanceId === myPropId)).toBe(true);
  });

  it("allows choosing a target with grouped property sets stored as arrays", () => {
    const game = createMonopolyDealGame(["p1", "p2"]);
    monopolyDealSetWager(game, "p1", 1, 10);
    monopolyDealSetWager(game, "p2", 1, 10);
    monopolyDealStartAfterWagers(game);

    game.boards.p2!.propertySets.green = [
      {
        cards: [
          { instanceId: "g1", defId: "prop-green-pacific", activeColor: "green" },
          { instanceId: "g2", defId: "prop-green-northcarolina", activeColor: "green" },
          { instanceId: "g3", defId: "prop-green-pennsylvania", activeColor: "green" }
        ],
        house: false,
        hotel: false
      },
      {
        cards: [{ instanceId: "g4", defId: "prop-green-pacific", activeColor: "green" }],
        house: false,
        hotel: false
      }
    ];
    game.boards.p1!.propertySets.brown = {
      cards: [{ instanceId: "my-brown", defId: "prop-brown-mediterranean", activeColor: "brown" }],
      house: false,
      hotel: false
    };
    game.hands.p1 = [{ id: "fd-1", defId: "action-forcedDeal-0" }];
    game.hands.p2 = game.hands.p2!.filter((c) => getCardDef(c.defId).action !== "justSayNo");
    game.currentPlayerIndex = 0;
    game.playsRemaining = 3;

    monopolyDealPlayAction(game, "p1", "fd-1");
    expect(() => monopolyDealSelectTarget(game, "p1", { targetId: "p2" })).not.toThrow();
    expect(game.pendingResolution).toMatchObject({
      kind: "selectTarget",
      actionType: "forcedDeal",
      targetId: "p2"
    });
  });

  it("places swapped cards in sets matching their color, not the vacated slot", () => {
    const game = createMonopolyDealGame(["p1", "p2"]);
    monopolyDealSetWager(game, "p1", 1, 10);
    monopolyDealSetWager(game, "p2", 1, 10);
    monopolyDealStartAfterWagers(game);

    const theirPinkId = "their-pink";
    const myUtilityId = "my-utility";
    game.boards.p2!.propertySets.pink = {
      cards: [{ instanceId: theirPinkId, defId: "prop-pink-states", activeColor: "pink" }],
      house: false,
      hotel: false
    };
    game.boards.p1!.propertySets.utility = {
      cards: [{ instanceId: myUtilityId, defId: "prop-utility-electric", activeColor: "utility" }],
      house: false,
      hotel: false
    };

    game.hands.p1 = [{ id: "fd-1", defId: "action-forcedDeal-0" }];
    game.hands.p2 = game.hands.p2!.filter((c) => getCardDef(c.defId).action !== "justSayNo");
    game.currentPlayerIndex = 0;
    game.playsRemaining = 3;

    monopolyDealPlayAction(game, "p1", "fd-1");
    monopolyDealSelectTarget(game, "p1", { targetId: "p2" });
    monopolyDealSelectTarget(game, "p1", { cardInstanceId: theirPinkId });
    monopolyDealSelectTarget(game, "p1", { cardInstanceId: myUtilityId });

    expect(game.boards.p1!.propertySets.pink?.cards.some((c) => c.instanceId === theirPinkId)).toBe(true);
    expect(game.boards.p1!.propertySets.utility).toBeUndefined();
    expect(game.boards.p2!.propertySets.utility?.cards.some((c) => c.instanceId === myUtilityId)).toBe(true);
    expect(game.boards.p2!.propertySets.pink).toBeUndefined();
  });

  it("rejects giving a property you do not own during forced deal", () => {
    const game = createMonopolyDealGame(["p1", "p2"]);
    monopolyDealSetWager(game, "p1", 1, 10);
    monopolyDealSetWager(game, "p2", 1, 10);
    monopolyDealStartAfterWagers(game);

    game.boards.p2!.propertySets.brown = {
      cards: [{ instanceId: "their-brown", defId: "prop-brown-mediterranean", activeColor: "brown" }],
      house: false,
      hotel: false
    };
    game.boards.p1!.propertySets.lightBlue = {
      cards: [{ instanceId: "my-blue", defId: "prop-lightBlue-oriental", activeColor: "lightBlue" }],
      house: false,
      hotel: false
    };
    game.hands.p1 = [{ id: "fd-1", defId: "action-forcedDeal-0" }];
    game.currentPlayerIndex = 0;
    game.playsRemaining = 3;

    monopolyDealPlayAction(game, "p1", "fd-1");
    monopolyDealSelectTarget(game, "p1", { targetId: "p2" });
    monopolyDealSelectTarget(game, "p1", { cardInstanceId: "their-brown" });
    expect(game.pendingResolution).toMatchObject({ kind: "forcedDealPickMine" });

    expect(() => monopolyDealSelectTarget(game, "p1", { cardInstanceId: "bogus-id" })).toThrow(
      /one of your properties/i
    );
    expect(game.pendingResolution).toMatchObject({ kind: "forcedDealPickMine" });
  });

  it("prompts to assign color when stealing a dual wild", () => {
    const game = createMonopolyDealGame(["p1", "p2"]);
    monopolyDealSetWager(game, "p1", 1, 10);
    monopolyDealSetWager(game, "p2", 1, 10);
    monopolyDealStartAfterWagers(game);

    const wildId = "their-wild";
    const myPropId = "my-blue";
    game.boards.p2!.propertySets.red = {
      cards: [{ instanceId: wildId, defId: "wild-red-yellow-0", activeColor: "red" }],
      house: false,
      hotel: false
    };
    game.boards.p1!.propertySets.lightBlue = {
      cards: [{ instanceId: myPropId, defId: "prop-lightBlue-oriental", activeColor: "lightBlue" }],
      house: false,
      hotel: false
    };

    const forcedDealId = "fd-1";
    game.hands.p1 = [{ id: forcedDealId, defId: "action-forcedDeal-0" }];
    game.hands.p2 = game.hands.p2!.filter((c) => getCardDef(c.defId).action !== "justSayNo");
    game.currentPlayerIndex = 0;
    game.playsRemaining = 3;

    monopolyDealPlayAction(game, "p1", forcedDealId);
    monopolyDealSelectTarget(game, "p1", { targetId: "p2" });
    monopolyDealSelectTarget(game, "p1", { cardInstanceId: wildId });
    monopolyDealSelectTarget(game, "p1", { cardInstanceId: myPropId });

    expect(game.pendingResolution).toMatchObject({
      kind: "selectWildColor",
      allowedColors: ["red", "yellow"],
      fromPropertyColor: "red"
    });

    monopolyDealSelectTarget(game, "p1", { propertyColor: "yellow" });
    expect(game.pendingResolution).toBeNull();
    expect(game.boards.p1!.propertySets.yellow?.cards.some((c) => c.instanceId === wildId && c.activeColor === "yellow")).toBe(
      true
    );
  });
});

describe("monopolyDealGame flip wild", () => {
  it("flips a dual wild to its other color using one play", () => {
    const game = createMonopolyDealGame(["p1", "p2"]);
    monopolyDealSetWager(game, "p1", 1, 10);
    monopolyDealSetWager(game, "p2", 1, 10);
    monopolyDealStartAfterWagers(game);

    game.boards.p1!.propertySets.red = {
      cards: [{ instanceId: "wild-1", defId: "wild-red-yellow-0", activeColor: "red" }],
      house: false,
      hotel: false
    };
    game.currentPlayerIndex = 0;
    game.playsRemaining = 3;

    monopolyDealFlipWild(game, "p1", "wild-1", "red", "yellow");
    expect(game.playsRemaining).toBe(2);
    expect(game.boards.p1!.propertySets.red).toBeUndefined();
    expect(game.boards.p1!.propertySets.yellow?.cards[0]?.activeColor).toBe("yellow");
    expect(game.boards.p1!.propertySets.yellow?.cards[0]?.instanceId).toBe("wild-1");
  });
});

describe("monopolyDealGame move rainbow wild", () => {
  it("moves a rainbow wild to any color using one play", () => {
    const game = createMonopolyDealGame(["p1", "p2"]);
    monopolyDealSetWager(game, "p1", 1, 10);
    monopolyDealSetWager(game, "p2", 1, 10);
    monopolyDealStartAfterWagers(game);

    game.boards.p1!.propertySets.brown = {
      cards: [{ instanceId: "rainbow-1", defId: "wild-multi-0", activeColor: "brown" }],
      house: false,
      hotel: false
    };
    game.currentPlayerIndex = 0;
    game.playsRemaining = 3;

    monopolyDealMoveWild(game, "p1", "rainbow-1", "brown", "green");
    expect(game.playsRemaining).toBe(2);
    expect(game.boards.p1!.propertySets.brown).toBeUndefined();
    expect(game.boards.p1!.propertySets.green?.cards[0]?.instanceId).toBe("rainbow-1");
    expect(game.boards.p1!.propertySets.green?.cards[0]?.activeColor).toBe("green");
    expect(game.actionLog.some((entry) => entry.summary.includes("Property Wild Card") && entry.summary.includes("Green"))).toBe(
      true
    );
  });

  it("rejects moving a rainbow wild to its current color", () => {
    const game = createMonopolyDealGame(["p1", "p2"]);
    monopolyDealSetWager(game, "p1", 1, 10);
    monopolyDealSetWager(game, "p2", 1, 10);
    monopolyDealStartAfterWagers(game);
    game.boards.p1!.propertySets.brown = {
      cards: [{ instanceId: "rainbow-1", defId: "wild-multi-0", activeColor: "brown" }],
      house: false,
      hotel: false
    };
    game.currentPlayerIndex = 0;
    game.playsRemaining = 3;

    expect(() => monopolyDealMoveWild(game, "p1", "rainbow-1", "brown", "brown")).toThrow(/already on that color/i);
    expect(game.playsRemaining).toBe(3);
  });
});

describe("monopolyDealGame rent validation", () => {
  it("rejects rent when player has no matching properties", () => {
    const game = createMonopolyDealGame(["p1", "p2"]);
    monopolyDealSetWager(game, "p1", 1, 10);
    monopolyDealSetWager(game, "p2", 1, 10);
    monopolyDealStartAfterWagers(game);
    game.hands.p1 = [{ id: "rent-1", defId: "rent-red-yellow-0" }];
    game.currentPlayerIndex = 0;
    game.playsRemaining = 3;

    expect(() => monopolyDealPlayAction(game, "p1", "rent-1")).toThrow(/matching property/i);
    expect(game.pendingResolution).toBeNull();
    expect(game.hands.p1).toHaveLength(1);
    expect(game.playsRemaining).toBe(3);
  });
});

describe("monopolyDealGame wagering", () => {
  it("caps wager to the player's available points", () => {
    const game = createMonopolyDealGame(["p1", "p2"]);
    expect(() => monopolyDealSetWager(game, "p1", 5, 3)).toThrow(/between 1 and 3/i);
    monopolyDealSetWager(game, "p1", 3, 3);
    expect(game.wagers.p1).toBe(3);
  });
});

describe("monopolyDealGame cancel resolution", () => {
  it("returns the action card and play when cancelling target selection", () => {
    const game = createMonopolyDealGame(["p1", "p2"]);
    monopolyDealSetWager(game, "p1", 1, 10);
    monopolyDealSetWager(game, "p2", 1, 10);
    monopolyDealStartAfterWagers(game);
    game.hands.p1 = [{ id: "dc-1", defId: "action-debtCollector-0" }];
    game.currentPlayerIndex = 0;
    game.playsRemaining = 3;

    monopolyDealPlayAction(game, "p1", "dc-1");
    expect(game.pendingResolution).toMatchObject({ kind: "selectTarget", actionType: "debtCollector" });
    expect(game.playsRemaining).toBe(2);

    monopolyDealCancelResolution(game, "p1");
    expect(game.pendingResolution).toBeNull();
    expect(game.playsRemaining).toBe(3);
    expect(game.hands.p1!.some((c) => c.defId === "action-debtCollector-0")).toBe(true);
  });
});

describe("monopolyDealGame bank card", () => {
  it("rejects banking a two-color property wild", () => {
    const game = createMonopolyDealGame(["p1", "p2"]);
    monopolyDealSetWager(game, "p1", 1, 10);
    monopolyDealSetWager(game, "p2", 1, 10);
    monopolyDealStartAfterWagers(game);
    game.hands.p1 = [{ id: "wild-1", defId: "wild-red-yellow-0" }];
    game.currentPlayerIndex = 0;
    game.playsRemaining = 3;

    expect(() => monopolyDealBankCard(game, "p1", "wild-1")).toThrow(/cannot be banked/i);
    expect(game.boards.p1!.bank).toHaveLength(0);
    expect(game.hands.p1!.some((c) => c.id === "wild-1")).toBe(true);
    expect(game.playsRemaining).toBe(3);
  });
});

describe("monopolyDealGame undo bank", () => {
  it("returns a banked card to hand and restores the play", () => {
    const game = createMonopolyDealGame(["p1", "p2"]);
    monopolyDealSetWager(game, "p1", 1, 10);
    monopolyDealSetWager(game, "p2", 1, 10);
    monopolyDealStartAfterWagers(game);
    game.hands.p1 = [{ id: "m1", defId: "money-1m-0" }, ...game.hands.p1!];
    const money = game.hands.p1[0]!;
    game.currentPlayerIndex = 0;
    game.playsRemaining = 3;

    monopolyDealBankCard(game, "p1", money!.id);
    expect(game.boards.p1!.bank).toHaveLength(1);
    expect(game.playsRemaining).toBe(2);

    monopolyDealUndoBank(game, "p1");
    expect(game.boards.p1!.bank).toHaveLength(0);
    expect(game.hands.p1!.some((c) => c.id === money!.id)).toBe(true);
    expect(game.playsRemaining).toBe(3);
  });
});

describe("monopolyDealGame end turn", () => {
  it("clears undoable bank when ending the turn", () => {
    const game = createMonopolyDealGame(["p1", "p2"]);
    monopolyDealSetWager(game, "p1", 1, 10);
    monopolyDealSetWager(game, "p2", 1, 10);
    monopolyDealStartAfterWagers(game);
    game.hands.p1 = [{ id: "money-1", defId: "money-1m-0" }];
    game.currentPlayerIndex = 0;
    game.playsRemaining = 3;

    monopolyDealBankCard(game, "p1", "money-1");
    expect(game.undoableBank).toMatchObject({ participantId: "p1", cardId: "money-1" });

    monopolyDealEndTurn(game, "p1");
    expect(game.undoableBank).toBeNull();
    expect(game.currentPlayerIndex).toBe(1);
  });
});

describe("monopolyDealGame double the rent", () => {
  it("discards both cards and uses one play", () => {
    const game = createMonopolyDealGame(["p1", "p2"]);
    monopolyDealSetWager(game, "p1", 1, 10);
    monopolyDealSetWager(game, "p2", 1, 10);
    monopolyDealStartAfterWagers(game);

    game.boards.p1!.propertySets.brown = {
      cards: [
        { instanceId: "b1", defId: "prop-brown-mediterranean", activeColor: "brown" },
        { instanceId: "b2", defId: "prop-brown-baltic", activeColor: "brown" }
      ],
      house: false,
      hotel: false
    };
    game.hands.p1 = [
      { id: "rent-1", defId: "rent-brown-lightBlue-0" },
      { id: "double-1", defId: "action-doubleTheRent-0" }
    ];
    game.currentPlayerIndex = 0;
    game.playsRemaining = 1;

    monopolyDealPlayRentWithDouble(game, "p1", "rent-1", "double-1");
    expect(game.playsRemaining).toBe(0);
    expect(game.hands.p1!.some((c) => c.id === "rent-1" || c.id === "double-1")).toBe(false);
    expect(game.discardPile.some((c) => c.id === "rent-1")).toBe(true);
    expect(game.discardPile.some((c) => c.id === "double-1")).toBe(true);
    expect(game.pendingResolution).toMatchObject({ kind: "selectRentColor", doubleRentCardId: "double-1" });
  });

  it("doubles the rent owed after color is chosen", () => {
    const game = createMonopolyDealGame(["p1", "p2"]);
    monopolyDealSetWager(game, "p1", 1, 10);
    monopolyDealSetWager(game, "p2", 1, 10);
    monopolyDealStartAfterWagers(game);

    game.boards.p1!.propertySets.brown = {
      cards: [
        { instanceId: "b1", defId: "prop-brown-mediterranean", activeColor: "brown" },
        { instanceId: "b2", defId: "prop-brown-baltic", activeColor: "brown" }
      ],
      house: false,
      hotel: false
    };
    game.hands.p1 = [
      { id: "rent-1", defId: "rent-brown-lightBlue-0" },
      { id: "double-1", defId: "action-doubleTheRent-0" }
    ];
    game.hands.p2 = [];
    game.currentPlayerIndex = 0;
    game.playsRemaining = 3;

    monopolyDealPlayRentWithDouble(game, "p1", "rent-1", "double-1");
    monopolyDealSelectRentColor(game, "p1", "brown", "p2");

    expect(game.pendingResolution).toMatchObject({
      kind: "collectPayment",
      payerId: "p2",
      amountDue: 4
    });
  });

  it("doubles rent when a target is chosen after color selection", () => {
    const game = createMonopolyDealGame(["p1", "p2"]);
    monopolyDealSetWager(game, "p1", 1, 10);
    monopolyDealSetWager(game, "p2", 1, 10);
    monopolyDealStartAfterWagers(game);

    game.boards.p1!.propertySets.brown = {
      cards: [
        { instanceId: "b1", defId: "prop-brown-mediterranean", activeColor: "brown" },
        { instanceId: "b2", defId: "prop-brown-baltic", activeColor: "brown" }
      ],
      house: false,
      hotel: false
    };
    game.currentPlayerIndex = 0;
    game.hands.p2 = game.hands.p2!.filter((c) => getCardDef(c.defId).action !== "justSayNo");
    game.pendingResolution = {
      kind: "selectTarget",
      actorId: "p1",
      actionType: "rent",
      rentColors: ["brown"],
      doubleRent: true
    };

    monopolyDealSelectTarget(game, "p1", { targetId: "p2" });

    expect(game.pendingResolution).toMatchObject({
      kind: "collectPayment",
      payerId: "p2",
      amountDue: 4
    });
  });
});

describe("monopolyDealGame property groups", () => {
  it("starts a new property group when laying on a color with a complete set", () => {
    const game = createMonopolyDealGame(["p1", "p2"]);
    monopolyDealSetWager(game, "p1", 1, 10);
    monopolyDealSetWager(game, "p2", 1, 10);
    monopolyDealStartAfterWagers(game);

    game.boards.p1!.propertySets.green = {
      cards: [
        { instanceId: "g1", defId: "prop-green-pacific", activeColor: "green" },
        { instanceId: "g2", defId: "prop-green-northcarolina", activeColor: "green" },
        { instanceId: "g3", defId: "prop-green-pennsylvania", activeColor: "green" }
      ],
      house: false,
      hotel: false
    };
    game.hands.p1 = [{ id: "extra-green", defId: "prop-green-pacific" }];
    game.currentPlayerIndex = 0;
    game.playsRemaining = 3;

    monopolyDealLayProperty(game, "p1", "extra-green", "green");
    const sets = getColorSets({ bank: [], propertySets: game.boards.p1!.propertySets }, "green");
    expect(sets).toHaveLength(2);
    expect(sets[0]!.cards).toHaveLength(3);
    expect(sets[1]!.cards).toHaveLength(1);
  });

  it("combines leftover incomplete groups after a wild is removed from a complete set", () => {
    const game = createMonopolyDealGame(["p1", "p2"]);
    monopolyDealSetWager(game, "p1", 1, 10);
    monopolyDealSetWager(game, "p2", 1, 10);
    monopolyDealStartAfterWagers(game);

    game.boards.p1!.propertySets.green = [
      {
        cards: [
          { instanceId: "g1", defId: "prop-green-pacific", activeColor: "green" },
          { instanceId: "g2", defId: "prop-green-northcarolina", activeColor: "green" },
          { instanceId: "w1", defId: "wild-green-darkBlue", activeColor: "green" }
        ],
        house: false,
        hotel: false
      },
      {
        cards: [{ instanceId: "g3", defId: "prop-green-pennsylvania", activeColor: "green" }],
        house: false,
        hotel: false
      }
    ];
    game.hands.p1 = [];
    game.currentPlayerIndex = 0;
    game.playsRemaining = 3;
    game.drawnThisTurn = true;

    monopolyDealFlipWild(game, "p1", "w1", "green", "darkBlue");
    const greens = getColorSets({ bank: [], propertySets: game.boards.p1!.propertySets }, "green");
    expect(greens).toHaveLength(1);
    expect(greens[0]!.cards.map((c) => c.instanceId)).toEqual(["g1", "g2", "g3"]);
    const blues = getColorSets({ bank: [], propertySets: game.boards.p1!.propertySets }, "darkBlue");
    expect(blues[0]!.cards.map((c) => c.instanceId)).toEqual(["w1"]);
  });
});

describe("monopolyDealGame just say no", () => {
  it("opens a counter window when another player has Just Say No", () => {
    const game = createMonopolyDealGame(["p1", "p2"]);
    monopolyDealSetWager(game, "p1", 1, 10);
    monopolyDealSetWager(game, "p2", 1, 10);
    monopolyDealStartAfterWagers(game);

    game.boards.p2!.propertySets.brown = {
      cards: [{ instanceId: "their-brown", defId: "prop-brown-mediterranean", activeColor: "brown" }],
      house: false,
      hotel: false
    };
    game.hands.p1 = [{ id: "sly-1", defId: "action-slyDeal-0" }];
    game.hands.p2 = [{ id: "jsn-1", defId: "action-justSayNo-0" }];
    game.currentPlayerIndex = 0;
    game.playsRemaining = 3;

    monopolyDealPlayAction(game, "p1", "sly-1", { targetId: "p2", cardInstanceId: "their-brown" });
    expect(game.pendingResolution).toMatchObject({ kind: "justSayNo", eligiblePlayerIds: ["p2"] });

    monopolyDealRespondJustSayNo(game, "p2", "jsn-1");
    expect(game.pendingResolution).toBeNull();
    expect(game.boards.p2!.propertySets.brown?.cards.some((c) => c.instanceId === "their-brown")).toBe(true);
    expect(game.recentEvent).toMatchObject({
      type: "justSayNo",
      playerId: "p2",
      actorId: "p1",
      targetId: "p2",
      actionLabel: "Sly Deal"
    });
  });

  it("lets any eligible player allow a Just Say No window", () => {
    const game = createMonopolyDealGame(["p1", "p2", "p3"]);
    monopolyDealSetWager(game, "p1", 1, 10);
    monopolyDealSetWager(game, "p2", 1, 10);
    monopolyDealSetWager(game, "p3", 1, 10);
    monopolyDealStartAfterWagers(game);

    game.boards.p2!.propertySets.brown = {
      cards: [{ instanceId: "their-brown", defId: "prop-brown-mediterranean", activeColor: "brown" }],
      house: false,
      hotel: false
    };
    game.hands.p1 = [{ id: "sly-1", defId: "action-slyDeal-0" }];
    game.hands.p2 = [];
    game.hands.p3 = [{ id: "jsn-3", defId: "action-justSayNo-0" }];
    game.currentPlayerIndex = 0;
    game.playsRemaining = 3;

    monopolyDealPlayAction(game, "p1", "sly-1", { targetId: "p2", cardInstanceId: "their-brown" });
    expect(game.pendingResolution).toMatchObject({
      kind: "justSayNo",
      eligiblePlayerIds: ["p3"],
      primaryTargetId: "p2",
      canCounter: true
    });

    monopolyDealRespondJustSayNo(game, "p3", null);
    expect(game.pendingResolution).toBeNull();
    expect(game.boards.p1!.propertySets.brown?.cards.some((c) => c.instanceId === "their-brown")).toBe(true);
    expect(game.boards.p2!.propertySets.brown).toBeUndefined();
  });

  it("lets an eligible player add 30 seconds of thinking time once", () => {
    const game = createMonopolyDealGame(["p1", "p2"]);
    monopolyDealSetWager(game, "p1", 1, 10);
    monopolyDealSetWager(game, "p2", 1, 10);
    monopolyDealStartAfterWagers(game);

    game.boards.p2!.propertySets.brown = {
      cards: [{ instanceId: "their-brown", defId: "prop-brown-mediterranean", activeColor: "brown" }],
      house: false,
      hotel: false
    };
    game.hands.p1 = [{ id: "sly-1", defId: "action-slyDeal-0" }];
    game.hands.p2 = [{ id: "jsn-1", defId: "action-justSayNo-0" }];
    game.currentPlayerIndex = 0;
    game.playsRemaining = 3;

    monopolyDealPlayAction(game, "p1", "sly-1", { targetId: "p2", cardInstanceId: "their-brown" });
    expect(game.pendingResolution?.kind).toBe("justSayNo");
    const before = Date.now();

    monopolyDealExtendJustSayNo(game, "p2");
    expect(game.pendingResolution).toMatchObject({ kind: "justSayNo", thinkingExtended: true });
    if (game.pendingResolution?.kind === "justSayNo") {
      expect(game.pendingResolution.expiresAt).toBeGreaterThanOrEqual(before + 30_000);
      expect(game.pendingResolution.expiresAt).toBeLessThan(before + 31_000);
    }
    expect(game.actionLog.some((entry) => entry.summary.includes("more time"))).toBe(true);
    expect(() => monopolyDealExtendJustSayNo(game, "p2")).toThrow(/already used/i);
  });

  it("keeps the action blocked and resets the timer when I'm thinking is used after the original window elapsed", () => {
    const game = createMonopolyDealGame(["p1", "p2"]);
    monopolyDealSetWager(game, "p1", 1, 10);
    monopolyDealSetWager(game, "p2", 1, 10);
    monopolyDealStartAfterWagers(game);

    game.boards.p2!.propertySets.brown = {
      cards: [{ instanceId: "their-brown", defId: "prop-brown-mediterranean", activeColor: "brown" }],
      house: false,
      hotel: false
    };
    game.hands.p1 = [{ id: "sly-1", defId: "action-slyDeal-0" }];
    game.hands.p2 = [{ id: "jsn-1", defId: "action-justSayNo-0" }];
    game.currentPlayerIndex = 0;
    game.playsRemaining = 3;

    monopolyDealPlayAction(game, "p1", "sly-1", { targetId: "p2", cardInstanceId: "their-brown" });
    expect(game.pendingResolution?.kind).toBe("justSayNo");
    game.pendingResolution = {
      ...game.pendingResolution!,
      expiresAt: Date.now() - 1
    } as typeof game.pendingResolution;

    const before = Date.now();
    monopolyDealExtendJustSayNo(game, "p2");
    expect(game.pendingResolution).toMatchObject({ kind: "justSayNo", thinkingExtended: true });
    if (game.pendingResolution?.kind === "justSayNo") {
      expect(game.pendingResolution.expiresAt).toBeGreaterThanOrEqual(before + 30_000);
    }
    expect(game.boards.p2!.propertySets.brown?.cards.some((c) => c.instanceId === "their-brown")).toBe(true);
    expect(game.justSayNoLate).toBeNull();

    monopolyDealMaybeExpireJustSayNo(game);
    expect(game.pendingResolution?.kind).toBe("justSayNo");
    expect(game.boards.p2!.propertySets.brown?.cards.some((c) => c.instanceId === "their-brown")).toBe(true);
  });

  it("executes the action and opens the late window when the Just Say No timer is expired", () => {
    const game = createMonopolyDealGame(["p1", "p2"]);
    monopolyDealSetWager(game, "p1", 1, 10);
    monopolyDealSetWager(game, "p2", 1, 10);
    monopolyDealStartAfterWagers(game);

    game.boards.p2!.propertySets.brown = {
      cards: [{ instanceId: "their-brown", defId: "prop-brown-mediterranean", activeColor: "brown" }],
      house: false,
      hotel: false
    };
    game.hands.p1 = [{ id: "sly-1", defId: "action-slyDeal-0" }];
    game.hands.p2 = [{ id: "jsn-1", defId: "action-justSayNo-0" }];
    game.currentPlayerIndex = 0;
    game.playsRemaining = 3;

    monopolyDealPlayAction(game, "p1", "sly-1", { targetId: "p2", cardInstanceId: "their-brown" });
    game.pendingResolution = {
      ...game.pendingResolution!,
      expiresAt: Date.now() - 1
    } as typeof game.pendingResolution;

    monopolyDealExpireJustSayNo(game, "p2");
    expect(game.pendingResolution).toBeNull();
    expect(game.boards.p1!.propertySets.brown?.cards.some((c) => c.instanceId === "their-brown")).toBe(true);
    expect(game.justSayNoLate).toMatchObject({ eligiblePlayerIds: ["p2"] });
  });

  it("applies the original action when Just Say No cards cancel each other", () => {
    const game = createMonopolyDealGame(["p1", "p2", "p3"]);
    monopolyDealSetWager(game, "p1", 1, 10);
    monopolyDealSetWager(game, "p2", 1, 10);
    monopolyDealSetWager(game, "p3", 1, 10);
    monopolyDealStartAfterWagers(game);

    game.boards.p2!.propertySets.brown = {
      cards: [{ instanceId: "their-brown", defId: "prop-brown-mediterranean", activeColor: "brown" }],
      house: false,
      hotel: false
    };
    game.hands.p1 = [
      { id: "sly-1", defId: "action-slyDeal-0" },
      { id: "jsn-1", defId: "action-justSayNo-0" }
    ];
    game.hands.p2 = [];
    game.hands.p3 = [{ id: "jsn-3", defId: "action-justSayNo-0" }];
    game.currentPlayerIndex = 0;
    game.playsRemaining = 3;

    monopolyDealPlayAction(game, "p1", "sly-1", { targetId: "p2", cardInstanceId: "their-brown" });
    expect(game.pendingResolution).toMatchObject({ kind: "justSayNo", eligiblePlayerIds: ["p3"], canCounter: true });

    monopolyDealRespondJustSayNo(game, "p3", "jsn-3");
    expect(game.pendingResolution).toMatchObject({ kind: "justSayNo", eligiblePlayerIds: ["p1"], canCounter: false });
    expect(game.boards.p2!.propertySets.brown?.cards.some((c) => c.instanceId === "their-brown")).toBe(true);

    monopolyDealRespondJustSayNo(game, "p1", "jsn-1");
    expect(game.pendingResolution).toBeNull();
    expect(game.boards.p1!.propertySets.brown?.cards.some((c) => c.instanceId === "their-brown")).toBe(true);
    expect(game.boards.p2!.propertySets.brown).toBeUndefined();
  });

  it("keeps the action cancelled if the actor lets a Just Say No stand", () => {
    const game = createMonopolyDealGame(["p1", "p2"]);
    monopolyDealSetWager(game, "p1", 1, 10);
    monopolyDealSetWager(game, "p2", 1, 10);
    monopolyDealStartAfterWagers(game);

    game.boards.p2!.propertySets.brown = {
      cards: [{ instanceId: "their-brown", defId: "prop-brown-mediterranean", activeColor: "brown" }],
      house: false,
      hotel: false
    };
    game.hands.p1 = [
      { id: "sly-1", defId: "action-slyDeal-0" },
      { id: "jsn-1", defId: "action-justSayNo-0" }
    ];
    game.hands.p2 = [{ id: "jsn-2", defId: "action-justSayNo-0" }];
    game.currentPlayerIndex = 0;
    game.playsRemaining = 3;

    monopolyDealPlayAction(game, "p1", "sly-1", { targetId: "p2", cardInstanceId: "their-brown" });
    monopolyDealRespondJustSayNo(game, "p2", "jsn-2");
    expect(game.pendingResolution).toMatchObject({ kind: "justSayNo", canCounter: false });

    monopolyDealRespondJustSayNo(game, "p1", null);
    expect(game.pendingResolution).toBeNull();
    expect(game.boards.p2!.propertySets.brown?.cards.some((c) => c.instanceId === "their-brown")).toBe(true);
    expect(game.boards.p1!.propertySets.brown).toBeUndefined();
  });

  it("does not apply the original action when a Just Say No counter window expires", () => {
    const game = createMonopolyDealGame(["p1", "p2"]);
    monopolyDealSetWager(game, "p1", 1, 10);
    monopolyDealSetWager(game, "p2", 1, 10);
    monopolyDealStartAfterWagers(game);

    game.boards.p2!.propertySets.brown = {
      cards: [{ instanceId: "their-brown", defId: "prop-brown-mediterranean", activeColor: "brown" }],
      house: false,
      hotel: false
    };
    game.hands.p1 = [
      { id: "sly-1", defId: "action-slyDeal-0" },
      { id: "jsn-1", defId: "action-justSayNo-0" }
    ];
    game.hands.p2 = [{ id: "jsn-2", defId: "action-justSayNo-0" }];
    game.currentPlayerIndex = 0;
    game.playsRemaining = 3;

    monopolyDealPlayAction(game, "p1", "sly-1", { targetId: "p2", cardInstanceId: "their-brown" });
    monopolyDealRespondJustSayNo(game, "p2", "jsn-2");
    expect(game.pendingResolution).toMatchObject({ kind: "justSayNo", canCounter: false });
    game.pendingResolution = {
      ...game.pendingResolution!,
      expiresAt: Date.now() - 1
    } as typeof game.pendingResolution;

    monopolyDealMaybeExpireJustSayNo(game);
    expect(game.pendingResolution).toBeNull();
    expect(game.justSayNoLate).toMatchObject({
      eligiblePlayerIds: ["p1"],
      effect: "apply"
    });
    expect(game.boards.p2!.propertySets.brown?.cards.some((c) => c.instanceId === "their-brown")).toBe(true);
    expect(game.boards.p1!.propertySets.brown).toBeUndefined();

    monopolyDealRespondJustSayNo(game, "p1", "jsn-1");
    expect(game.justSayNoLate).toBeNull();
    expect(game.boards.p1!.propertySets.brown?.cards.some((c) => c.instanceId === "their-brown")).toBe(true);
    expect(game.boards.p2!.propertySets.brown).toBeUndefined();
  });

  it("closes the counter Just Say No late window when the actor makes another play", () => {
    const game = createMonopolyDealGame(["p1", "p2"]);
    monopolyDealSetWager(game, "p1", 1, 10);
    monopolyDealSetWager(game, "p2", 1, 10);
    monopolyDealStartAfterWagers(game);

    game.boards.p2!.propertySets.brown = {
      cards: [{ instanceId: "their-brown", defId: "prop-brown-mediterranean", activeColor: "brown" }],
      house: false,
      hotel: false
    };
    game.hands.p1 = [
      { id: "sly-1", defId: "action-slyDeal-0" },
      { id: "jsn-1", defId: "action-justSayNo-0" },
      { id: "money-1", defId: "money-1m-0" }
    ];
    game.hands.p2 = [{ id: "jsn-2", defId: "action-justSayNo-0" }];
    game.currentPlayerIndex = 0;
    game.playsRemaining = 3;

    monopolyDealPlayAction(game, "p1", "sly-1", { targetId: "p2", cardInstanceId: "their-brown" });
    monopolyDealRespondJustSayNo(game, "p2", "jsn-2");
    game.pendingResolution = {
      ...game.pendingResolution!,
      expiresAt: Date.now() - 1
    } as typeof game.pendingResolution;
    monopolyDealMaybeExpireJustSayNo(game);
    expect(game.justSayNoLate).toMatchObject({ effect: "apply" });

    monopolyDealBankCard(game, "p1", "money-1");
    expect(game.justSayNoLate).toBeNull();
    expect(game.boards.p2!.propertySets.brown?.cards.some((c) => c.instanceId === "their-brown")).toBe(true);
    expect(game.boards.p1!.propertySets.brown).toBeUndefined();
  });

  it("does not gate an action when only the actor has Just Say No", () => {
    const game = createMonopolyDealGame(["p1", "p2"]);
    monopolyDealSetWager(game, "p1", 1, 10);
    monopolyDealSetWager(game, "p2", 1, 10);
    monopolyDealStartAfterWagers(game);

    game.boards.p2!.propertySets.brown = {
      cards: [{ instanceId: "their-brown", defId: "prop-brown-mediterranean", activeColor: "brown" }],
      house: false,
      hotel: false
    };
    game.hands.p1 = [
      { id: "sly-1", defId: "action-slyDeal-0" },
      { id: "jsn-1", defId: "action-justSayNo-0" }
    ];
    game.hands.p2 = [];
    game.currentPlayerIndex = 0;
    game.playsRemaining = 3;

    monopolyDealPlayAction(game, "p1", "sly-1", { targetId: "p2", cardInstanceId: "their-brown" });
    expect(game.pendingResolution).toBeNull();
    expect(game.boards.p1!.propertySets.brown?.cards.some((c) => c.instanceId === "their-brown")).toBe(true);
  });

  it("opens a late Just Say No window after the timer expires and undoes the action", () => {
    const game = createMonopolyDealGame(["p1", "p2"]);
    monopolyDealSetWager(game, "p1", 1, 10);
    monopolyDealSetWager(game, "p2", 1, 10);
    monopolyDealStartAfterWagers(game);

    game.boards.p2!.propertySets.brown = {
      cards: [{ instanceId: "their-brown", defId: "prop-brown-mediterranean", activeColor: "brown" }],
      house: false,
      hotel: false
    };
    game.hands.p1 = [{ id: "sly-1", defId: "action-slyDeal-0" }];
    game.hands.p2 = [{ id: "jsn-1", defId: "action-justSayNo-0" }];
    game.currentPlayerIndex = 0;
    game.playsRemaining = 3;

    monopolyDealPlayAction(game, "p1", "sly-1", { targetId: "p2", cardInstanceId: "their-brown" });
    expect(game.pendingResolution).toMatchObject({ kind: "justSayNo" });
    game.pendingResolution = {
      ...game.pendingResolution!,
      expiresAt: Date.now() - 1
    } as typeof game.pendingResolution;

    monopolyDealMaybeExpireJustSayNo(game);
    expect(game.justSayNoLate).toMatchObject({ eligiblePlayerIds: ["p2"] });
    expect(game.boards.p1!.propertySets.brown?.cards.some((c) => c.instanceId === "their-brown")).toBe(true);

    monopolyDealRespondJustSayNo(game, "p2", "jsn-1");
    expect(game.justSayNoLate).toBeNull();
    expect(game.boards.p2!.propertySets.brown?.cards.some((c) => c.instanceId === "their-brown")).toBe(true);
    expect(game.boards.p1!.propertySets.brown).toBeUndefined();
  });

  it("closes the late Just Say No window when the actor makes another play", () => {
    const game = createMonopolyDealGame(["p1", "p2"]);
    monopolyDealSetWager(game, "p1", 1, 10);
    monopolyDealSetWager(game, "p2", 1, 10);
    monopolyDealStartAfterWagers(game);

    game.boards.p2!.propertySets.brown = {
      cards: [{ instanceId: "their-brown", defId: "prop-brown-mediterranean", activeColor: "brown" }],
      house: false,
      hotel: false
    };
    game.hands.p1 = [{ id: "sly-1", defId: "action-slyDeal-0" }, { id: "money-1", defId: "money-1m-0" }];
    game.hands.p2 = [{ id: "jsn-1", defId: "action-justSayNo-0" }];
    game.currentPlayerIndex = 0;
    game.playsRemaining = 2;

    monopolyDealPlayAction(game, "p1", "sly-1", { targetId: "p2", cardInstanceId: "their-brown" });
    game.pendingResolution = {
      ...game.pendingResolution!,
      expiresAt: Date.now() - 1
    } as typeof game.pendingResolution;
    monopolyDealMaybeExpireJustSayNo(game);
    expect(game.justSayNoLate).toBeTruthy();

    monopolyDealBankCard(game, "p1", "money-1");
    expect(game.justSayNoLate).toBeNull();
    expect(game.boards.p1!.propertySets.brown?.cards.some((c) => c.instanceId === "their-brown")).toBe(true);
  });
});

describe("monopolyDealGame two-color rent", () => {
  it("charges all other players after color is chosen", () => {
    const game = createMonopolyDealGame(["p1", "p2", "p3"]);
    monopolyDealSetWager(game, "p1", 1, 10);
    monopolyDealSetWager(game, "p2", 1, 10);
    monopolyDealSetWager(game, "p3", 1, 10);
    monopolyDealStartAfterWagers(game);

    game.boards.p1!.propertySets.red = {
      cards: [
        { instanceId: "r1", defId: "prop-red-kentucky", activeColor: "red" },
        { instanceId: "r2", defId: "prop-red-indiana", activeColor: "red" }
      ],
      house: false,
      hotel: false
    };
    game.hands.p1 = [{ id: "rent-1", defId: "rent-red-yellow-0" }];
    game.hands.p2 = [];
    game.hands.p3 = [];
    game.currentPlayerIndex = 0;
    game.playsRemaining = 3;

    monopolyDealPlayAction(game, "p1", "rent-1");
    expect(game.pendingResolution).toMatchObject({ kind: "selectRentColor" });

    monopolyDealSelectRentColor(game, "p1", "red");
    expect(game.pendingResolution).toMatchObject({
      kind: "collectPayment",
      payerId: "p2",
      payeeId: "p1",
      amountDue: 3,
      reason: expect.stringMatching(/rent/i),
      openPayerIds: ["p2", "p3"]
    });

    game.boards.p3!.bank = [{ id: "m3", defId: "money-5m-0" }];
    monopolyDealSubmitPayment(game, "p3", [{ zone: "bank", instanceId: "m3" }]);
    expect(game.pendingResolution).toMatchObject({
      kind: "collectPayment",
      payerId: "p2",
      payeeId: "p1",
      amountDue: 3,
      openPayerIds: ["p2"]
    });
    expect(game.recentEvent).toMatchObject({
      type: "payment",
      payerId: "p3",
      reason: expect.stringMatching(/rent/i)
    });
  });
});

describe("monopolyDealGame deal breaker", () => {
  it("cancels and returns the card to hand", () => {
    const game = createMonopolyDealGame(["p1", "p2"]);
    monopolyDealSetWager(game, "p1", 1, 10);
    monopolyDealSetWager(game, "p2", 1, 10);
    monopolyDealStartAfterWagers(game);

    const dealBreakerId = "db-1";
    game.hands.p1 = [{ id: dealBreakerId, defId: "action-dealBreaker-0" }];
    game.currentPlayerIndex = 0;
    game.playsRemaining = 3;

    monopolyDealPlayAction(game, "p1", dealBreakerId);
    expect(game.pendingResolution).toMatchObject({ actionType: "dealBreaker", discardedCardId: dealBreakerId });
    expect(game.discardPile.some((c) => c.id === dealBreakerId)).toBe(true);
    expect(game.hands.p1).toHaveLength(0);
    expect(game.playsRemaining).toBe(2);

    monopolyDealCancelResolution(game, "p1");
    expect(game.pendingResolution).toBeNull();
    expect(game.hands.p1!.some((c) => c.id === dealBreakerId)).toBe(true);
    expect(game.playsRemaining).toBe(3);
  });

  it("rejects a target without a complete set", () => {
    const game = createMonopolyDealGame(["p1", "p2"]);
    monopolyDealSetWager(game, "p1", 1, 10);
    monopolyDealSetWager(game, "p2", 1, 10);
    monopolyDealStartAfterWagers(game);

    game.boards.p2!.propertySets.brown = {
      cards: [{ instanceId: "only-one", defId: "prop-brown-mediterranean", activeColor: "brown" }],
      house: false,
      hotel: false
    };

    const dealBreakerId = "db-1";
    game.hands.p1 = [{ id: dealBreakerId, defId: "action-dealBreaker-0" }];
    game.currentPlayerIndex = 0;
    game.playsRemaining = 3;

    monopolyDealPlayAction(game, "p1", dealBreakerId);
    expect(() => monopolyDealSelectTarget(game, "p1", { targetId: "p2" })).toThrow(/no complete sets/i);
  });

  it("steals the complete set, discards Deal Breaker, and does not add properties to hand", () => {
    const game = createMonopolyDealGame(["p1", "p2"]);
    monopolyDealSetWager(game, "p1", 1, 10);
    monopolyDealSetWager(game, "p2", 1, 10);
    monopolyDealStartAfterWagers(game);

    game.boards.p2!.propertySets.brown = {
      cards: [
        { instanceId: "b1", defId: "prop-brown-mediterranean", activeColor: "brown" },
        { instanceId: "b2", defId: "prop-brown-baltic", activeColor: "brown" }
      ],
      house: false,
      hotel: false
    };
    const dealBreakerId = "db-1";
    game.hands.p1 = [{ id: dealBreakerId, defId: "action-dealBreaker-0" }];
    game.hands.p2 = [];
    game.currentPlayerIndex = 0;
    game.playsRemaining = 3;

    monopolyDealPlayAction(game, "p1", dealBreakerId);
    monopolyDealSelectTarget(game, "p1", { targetId: "p2" });
    monopolyDealSelectTarget(game, "p1", { propertyColor: "brown" });

    expect(game.pendingResolution).toBeNull();
    expect(game.pendingActionRestore).toBeNull();
    expect(game.hands.p1!.some((c) => c.id === dealBreakerId)).toBe(false);
    expect(game.discardPile.some((c) => c.id === dealBreakerId)).toBe(true);
    expect(game.hands.p1!.some((c) => c.id === "b1" || c.id === "b2")).toBe(false);
    expect(getColorSets({ bank: [], propertySets: game.boards.p1!.propertySets }, "brown")[0]?.cards.map((c) => c.instanceId)).toEqual(
      ["b1", "b2"]
    );
    expect(game.boards.p2!.propertySets.brown).toBeUndefined();
  });
});

describe("monopolyDealGame birthday payments", () => {
  it("lets every other player pay at the same time", () => {
    const game = createMonopolyDealGame(["p1", "p2", "p3"]);
    monopolyDealSetWager(game, "p1", 1, 10);
    monopolyDealSetWager(game, "p2", 1, 10);
    monopolyDealSetWager(game, "p3", 1, 10);
    monopolyDealStartAfterWagers(game);
    game.hands.p1 = [{ id: "bday", defId: "action-itsMyBirthday-0" }];
    game.hands.p2 = [];
    game.hands.p3 = [];
    game.currentPlayerIndex = 0;
    game.playsRemaining = 3;

    monopolyDealPlayAction(game, "p1", "bday");
    expect(game.pendingResolution).toMatchObject({
      kind: "collectPayment",
      payerId: "p2",
      payeeId: "p1",
      amountDue: 2,
      reason: "It's My Birthday",
      openPayerIds: ["p2", "p3"]
    });

    game.boards.p3!.bank = [{ id: "m3", defId: "money-2m-0" }];
    monopolyDealSubmitPayment(game, "p3", [{ zone: "bank", instanceId: "m3" }]);
    expect(game.pendingResolution).toMatchObject({
      kind: "collectPayment",
      payerId: "p2",
      payeeId: "p1",
      openPayerIds: ["p2"]
    });
    expect(game.boards.p1!.bank.map((card) => card.id)).toEqual(["m3"]);

    expect(() => monopolyDealSubmitPayment(game, "p1", [])).toThrow(/not your payment/i);
    expect(() => monopolyDealSubmitPayment(game, "p3", [])).toThrow(/not your payment/i);

    game.boards.p2!.bank = [{ id: "m2", defId: "money-2m-0" }];
    monopolyDealSubmitPayment(game, "p2", [{ zone: "bank", instanceId: "m2" }]);
    expect(game.pendingResolution).toBeNull();
    expect(game.boards.p1!.bank.map((card) => card.id)).toEqual(["m3", "m2"]);
  });

  it("drops a leaving player from an open birthday payment", () => {
    const game = startPlayingGame(["p1", "p2", "p3"]);
    game.pendingResolution = {
      kind: "collectPayment",
      payerId: "p2",
      payeeId: "p1",
      amountDue: 2,
      reason: "It's My Birthday",
      queueRemaining: [],
      openPayerIds: ["p2", "p3"]
    };

    monopolyDealRemovePlayer(game, "p3");

    expect(game.pendingResolution).toMatchObject({
      kind: "collectPayment",
      payerId: "p2",
      openPayerIds: ["p2"]
    });
  });
});

describe("monopolyDealGame payment", () => {
  it("accepts all-in underpayment when bank and property are selected", () => {
    const game = createMonopolyDealGame(["p1", "p2"]);
    game.pendingResolution = {
      kind: "collectPayment",
      payerId: "p2",
      payeeId: "p1",
      amountDue: 4,
      reason: "Rent (pink)",
      queueRemaining: []
    };
    game.boards.p2!.bank = [{ id: "m1", defId: "money-1m-0" }];
    game.boards.p2!.propertySets.pink = {
      cards: [{ instanceId: "p1", defId: "prop-pink-stcharles", activeColor: "pink" }],
      house: false,
      hotel: false
    };

    monopolyDealSubmitPayment(game, "p2", [
      { zone: "bank", instanceId: "m1" },
      { zone: "property", instanceId: "p1", propertyColor: "pink" }
    ]);
    expect(game.pendingResolution).toBeNull();
    expect(game.recentEvent).toMatchObject({ type: "payment", amount: 3, reason: "Rent (pink)" });
  });

  it("rejects underpayment when a required property is held back", () => {
    const game = createMonopolyDealGame(["p1", "p2"]);
    game.pendingResolution = {
      kind: "collectPayment",
      payerId: "p2",
      payeeId: "p1",
      amountDue: 4,
      reason: "Rent (pink)",
      queueRemaining: []
    };
    game.boards.p2!.bank = [{ id: "m1", defId: "money-1m-0" }];
    game.boards.p2!.propertySets.pink = {
      cards: [{ instanceId: "p1", defId: "prop-pink-stcharles", activeColor: "pink" }],
      house: false,
      hotel: false
    };

    expect(() => monopolyDealSubmitPayment(game, "p2", [{ zone: "bank", instanceId: "m1" }])).toThrow(/less than 4M/i);
    expect(game.pendingResolution?.kind).toBe("collectPayment");
  });

  it("accepts payment when selected cards meet the amount due", () => {
    const game = createMonopolyDealGame(["p1", "p2"]);
    game.pendingResolution = {
      kind: "collectPayment",
      payerId: "p2",
      payeeId: "p1",
      amountDue: 4,
      reason: "Rent (red)",
      queueRemaining: []
    };
    game.boards.p2!.bank = [{ id: "m1", defId: "money-1m-0" }];
    game.boards.p2!.propertySets.red = {
      cards: [{ instanceId: "p1", defId: "prop-red-kentucky", activeColor: "red" }],
      house: false,
      hotel: false
    };

    monopolyDealSubmitPayment(game, "p2", [
      { zone: "bank", instanceId: "m1" },
      { zone: "property", instanceId: "p1", propertyColor: "red" }
    ]);
    expect(game.pendingResolution).toBeNull();
    expect(game.boards.p1!.bank).toHaveLength(1);
    const redSets = getColorSets({ bank: [], propertySets: game.boards.p1!.propertySets }, "red");
    expect(redSets.flatMap((set) => set.cards)).toHaveLength(1);
  });
});

describe("monopolyDealGame incomplete set buildings", () => {
  it("discards house and hotel from an incomplete set when the player ends their turn", () => {
    const game = createMonopolyDealGame(["p1", "p2"]);
    monopolyDealSetWager(game, "p1", 1, 10);
    monopolyDealSetWager(game, "p2", 1, 10);
    monopolyDealStartAfterWagers(game);

    game.boards.p1!.propertySets.brown = {
      cards: [
        { instanceId: "b1", defId: "prop-brown-mediterranean", activeColor: "brown" },
        { instanceId: "w1", defId: "wild-brown-lightBlue", activeColor: "brown" }
      ],
      house: true,
      hotel: true
    };
    game.hands.p1 = [];
    game.hands.p2 = [];
    game.currentPlayerIndex = 0;
    game.playsRemaining = 3;
    game.drawnThisTurn = true;

    monopolyDealFlipWild(game, "p1", "w1", "brown", "lightBlue");
    expect(game.boards.p1!.propertySets.brown).toMatchObject({ house: true, hotel: true });
    expect(getColorSets({ bank: [], propertySets: game.boards.p1!.propertySets }, "brown")[0]?.cards).toHaveLength(1);

    monopolyDealEndTurn(game, "p1");
    expect(game.boards.p1!.propertySets.brown).toMatchObject({ house: false, hotel: false });
    expect(game.boards.p1!.propertySets.lightBlue).toMatchObject({ house: false, hotel: false });
  });

  it("keeps house and hotel on a set that is still complete at end of turn", () => {
    const game = createMonopolyDealGame(["p1", "p2"]);
    monopolyDealSetWager(game, "p1", 1, 10);
    monopolyDealSetWager(game, "p2", 1, 10);
    monopolyDealStartAfterWagers(game);

    game.boards.p1!.propertySets.brown = {
      cards: [
        { instanceId: "b1", defId: "prop-brown-mediterranean", activeColor: "brown" },
        { instanceId: "b2", defId: "prop-brown-baltic", activeColor: "brown" }
      ],
      house: true,
      hotel: true
    };
    game.hands.p1 = [];
    game.currentPlayerIndex = 0;
    game.playsRemaining = 0;
    game.drawnThisTurn = true;

    monopolyDealEndTurn(game, "p1");
    expect(game.boards.p1!.propertySets.brown).toMatchObject({ house: true, hotel: true });
  });
});

describe("monopolyDealGame win checks", () => {
  const twoCompleteSets = {
    brown: {
      cards: [
        { instanceId: "b1", defId: "prop-brown-mediterranean", activeColor: "brown" as const },
        { instanceId: "b2", defId: "prop-brown-baltic", activeColor: "brown" as const }
      ],
      house: false,
      hotel: false
    },
    utility: {
      cards: [
        { instanceId: "u1", defId: "prop-utility-electric", activeColor: "utility" as const },
        { instanceId: "u2", defId: "prop-utility-water", activeColor: "utility" as const }
      ],
      house: false,
      hotel: false
    }
  };

  it("ends the game when a laid property completes a third set", () => {
    const game = createMonopolyDealGame(["p1", "p2"]);
    monopolyDealSetWager(game, "p1", 1, 10);
    monopolyDealSetWager(game, "p2", 1, 10);
    monopolyDealStartAfterWagers(game);

    game.boards.p1!.propertySets = {
      ...twoCompleteSets,
      darkBlue: {
        cards: [{ instanceId: "d1", defId: "prop-darkBlue-parkplace", activeColor: "darkBlue" }],
        house: false,
        hotel: false
      }
    };
    game.hands.p1 = [{ id: "d2", defId: "prop-darkBlue-boardwalk" }];
    game.currentPlayerIndex = 0;
    game.playsRemaining = 3;

    monopolyDealLayProperty(game, "p1", "d2", "darkBlue");
    expect(game.status).toBe("finished");
    expect(game.winnerParticipantId).toBe("p1");
  });

  it("ends the game when payment completes a third set for the payee", () => {
    const game = createMonopolyDealGame(["p1", "p2"]);
    monopolyDealSetWager(game, "p1", 1, 10);
    monopolyDealSetWager(game, "p2", 1, 10);
    monopolyDealStartAfterWagers(game);

    game.boards.p1!.propertySets = {
      ...twoCompleteSets,
      darkBlue: {
        cards: [{ instanceId: "d1", defId: "prop-darkBlue-parkplace", activeColor: "darkBlue" }],
        house: false,
        hotel: false
      }
    };
    game.pendingResolution = {
      kind: "collectPayment",
      payerId: "p2",
      payeeId: "p1",
      amountDue: 4,
      reason: "Debt Collector",
      queueRemaining: []
    };
    game.boards.p2!.propertySets.darkBlue = {
      cards: [{ instanceId: "d2", defId: "prop-darkBlue-boardwalk", activeColor: "darkBlue" }],
      house: false,
      hotel: false
    };

    monopolyDealSubmitPayment(game, "p2", [{ zone: "property", instanceId: "d2", propertyColor: "darkBlue" }]);
    expect(game.status).toBe("finished");
    expect(game.winnerParticipantId).toBe("p1");
  });

  it("ends the game when Deal Breaker steals a third complete set", () => {
    const game = createMonopolyDealGame(["p1", "p2"]);
    monopolyDealSetWager(game, "p1", 1, 10);
    monopolyDealSetWager(game, "p2", 1, 10);
    monopolyDealStartAfterWagers(game);

    game.boards.p1!.propertySets = { ...twoCompleteSets };
    game.boards.p2!.propertySets.darkBlue = {
      cards: [
        { instanceId: "d1", defId: "prop-darkBlue-parkplace", activeColor: "darkBlue" },
        { instanceId: "d2", defId: "prop-darkBlue-boardwalk", activeColor: "darkBlue" }
      ],
      house: false,
      hotel: false
    };
    game.hands.p1 = [{ id: "db-1", defId: "action-dealBreaker-0" }];
    game.hands.p2 = [];
    game.currentPlayerIndex = 0;
    game.playsRemaining = 3;

    monopolyDealPlayAction(game, "p1", "db-1");
    monopolyDealSelectTarget(game, "p1", { targetId: "p2" });
    monopolyDealSelectTarget(game, "p1", { propertyColor: "darkBlue" });
    expect(game.status).toBe("finished");
    expect(game.winnerParticipantId).toBe("p1");
  });
});

const card = (id: string): { id: string; defId: string } => ({ id, defId: "money-1m-0" });

const startPlayingGame = (playerIds: string[]) => {
  const game = createMonopolyDealGame(playerIds);
  game.status = "playing";
  game.drawPile = Array.from({ length: 10 }, (_, index) => card(`draw-${index}`));
  game.pot = playerIds.length;
  for (const id of playerIds) {
    game.wagers[id] = 1;
    game.hands[id] = [card(`hand-${id}`)];
  }
  return game;
};

describe("monopolyDealRemovePlayer", () => {
  it("drops a wagering player and clears the table when fewer than two remain", () => {
    const stillPlaying = createMonopolyDealGame(["p1", "p2", "p3"]);
    monopolyDealSetWager(stillPlaying, "p1", 1, 10);
    monopolyDealSetWager(stillPlaying, "p2", 2, 10);
    monopolyDealSetWager(stillPlaying, "p3", 3, 10);
    expect(monopolyDealRemovePlayer(stillPlaying, "p3").clearGame).toBe(false);
    expect(stillPlaying.playerOrder).toEqual(["p1", "p2"]);
    expect(stillPlaying.pot).toBe(3);
    expect(() => monopolyDealStartAfterWagers(stillPlaying)).not.toThrow();

    const oneLeft = createMonopolyDealGame(["p1", "p2"]);
    monopolyDealSetWager(oneLeft, "p1", 1, 10);
    monopolyDealSetWager(oneLeft, "p2", 2, 10);
    expect(monopolyDealRemovePlayer(oneLeft, "p2").clearGame).toBe(true);
    expect(oneLeft.playerOrder).toEqual(["p1"]);
    expect(oneLeft.pot).toBe(1);
  });

  it("returns the leaving player's cards to the draw pile and advances when it is their turn", () => {
    const game = startPlayingGame(["p1", "p2", "p3"]);
    game.currentPlayerIndex = 0;
    game.hands.p1 = [card("h1")];
    game.boards.p1!.bank = [card("b1")];
    game.boards.p1!.propertySets = {
      brown: {
        cards: [{ instanceId: "prop1", defId: "money-1m-0", activeColor: "brown" }],
        house: true,
        hotel: false
      }
    };
    game.pendingResolution = { kind: "selectTarget", actorId: "p1", actionType: "debtCollector" };
    const nextHandBefore = game.hands.p2!.length;

    const result = monopolyDealRemovePlayer(game, "p1");

    expect(result.clearGame).toBe(false);
    expect(game.status).toBe("playing");
    expect(game.playerOrder).toEqual(["p2", "p3"]);
    expect(game.playerOrder[game.currentPlayerIndex]).toBe("p2");
    expect(game.hands.p2).toHaveLength(nextHandBefore + 2);
    expect(game.pendingResolution).toBeNull();
    expect(game.boards.p1).toBeUndefined();
    expect(game.playsRemaining).toBe(3);
    const liveIds = [
      ...game.drawPile.map((entry) => entry.id),
      ...game.hands.p2!.map((entry) => entry.id),
      ...game.hands.p3!.map((entry) => entry.id)
    ];
    expect(liveIds.filter((id) => id === "h1")).toHaveLength(1);
    expect(liveIds.filter((id) => id === "b1")).toHaveLength(1);
    expect(liveIds.filter((id) => id === "prop1")).toHaveLength(1);
  });

  it("keeps the current player and does not draw when someone else leaves", () => {
    const game = startPlayingGame(["p1", "p2", "p3"]);
    game.currentPlayerIndex = 0;
    const handBefore = game.hands.p1!.length;
    const drawBefore = game.drawPile.length;
    game.pendingResolution = {
      kind: "collectPayment",
      payerId: "p2",
      payeeId: "p1",
      amountDue: 2,
      reason: "It's My Birthday",
      queueRemaining: ["p3"]
    };

    monopolyDealRemovePlayer(game, "p3");

    expect(game.playerOrder).toEqual(["p1", "p2"]);
    expect(game.playerOrder[game.currentPlayerIndex]).toBe("p1");
    expect(game.hands.p1).toHaveLength(handBefore);
    expect(game.drawPile).toHaveLength(drawBefore + 1);
    expect(game.pendingResolution).toMatchObject({
      kind: "collectPayment",
      payerId: "p2",
      payeeId: "p1",
      queueRemaining: []
    });
  });

  it("finishes the game and keeps the pot when only one player remains", () => {
    const game = startPlayingGame(["p1", "p2"]);
    game.currentPlayerIndex = 1;
    game.pot = 4;
    const winnerHand = game.hands.p1!.length;

    monopolyDealRemovePlayer(game, "p2");

    expect(game.status).toBe("finished");
    expect(game.winnerParticipantId).toBe("p1");
    expect(game.pot).toBe(4);
    expect(game.hands.p1).toHaveLength(winnerHand);
    expect(game.winnerHand).toHaveLength(winnerHand);
  });
});

describe("monopolyDealForceEndTurn", () => {
  it("skips a pending action and starts the next player's turn", () => {
    const game = startPlayingGame(["p1", "p2"]);
    game.currentPlayerIndex = 0;
    game.hands.p1 = Array.from({ length: 8 }, (_, index) => card(`extra-${index}`));
    game.pendingResolution = { kind: "selectTarget", actorId: "p1", actionType: "slyDeal" };
    const nextHandBefore = game.hands.p2!.length;

    monopolyDealForceEndTurn(game);

    expect(game.pendingResolution).toBeNull();
    expect(game.playerOrder[game.currentPlayerIndex]).toBe("p2");
    expect(game.phase).toBe("playing");
    expect(game.playsRemaining).toBe(3);
    expect(game.hands.p1).toHaveLength(8);
    expect(game.hands.p2).toHaveLength(nextHandBefore + 2);
  });
});
