import { describe, expect, it } from "vitest";
import { formatMillions, getCardHelpText } from "../../shared/monopolyDealCardHelp";
import { getCardDef } from "../../shared/monopolyDealData";
import { getColorSets } from "../../shared/monopolyDealLogic";
import {
  createMonopolyDealGame,
  monopolyDealBankCard,
  monopolyDealCancelResolution,
  monopolyDealEndTurn,
  monopolyDealFlipWild,
  monopolyDealLayProperty,
  monopolyDealPlayAction,
  monopolyDealPlayRentWithDouble,
  monopolyDealMaybeExpireJustSayNo,
  monopolyDealRespondJustSayNo,
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

describe("monopolyDealGame undo bank", () => {
  it("returns a banked card to hand and restores the play", () => {
    const game = createMonopolyDealGame(["p1", "p2"]);
    monopolyDealSetWager(game, "p1", 1, 10);
    monopolyDealSetWager(game, "p2", 1, 10);
    monopolyDealStartAfterWagers(game);
    const money = game.hands.p1!.find((c) => getCardDef(c.defId).kind === "money");
    expect(money).toBeTruthy();
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
      queueRemaining: ["p3"]
    });

    game.boards.p2!.bank = [{ id: "m2", defId: "money-5m-0" }];
    monopolyDealSubmitPayment(game, "p2", [{ zone: "bank", instanceId: "m2" }]);
    expect(game.pendingResolution).toMatchObject({
      kind: "collectPayment",
      payerId: "p3",
      payeeId: "p1",
      amountDue: 3,
      reason: expect.stringMatching(/rent/i)
    });
    expect(game.recentEvent).toMatchObject({
      type: "payment",
      payerId: "p2",
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
