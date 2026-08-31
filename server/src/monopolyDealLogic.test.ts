import { describe, expect, it } from "vitest";
import {
  calculateRent,
  completePropertySetColors,
  countCompleteSets,
  emptyPropertySets,
  getSet,
  hasWon,
  isSetComplete,
  hasPayableAssets,
  validatePayment,
  allBankCardsSelected,
  canTogglePaymentRef,
  paymentSelectionTotal,
  canPlayAsAction,
  type PlayerBoard,
  type PlacedPropertyCard
} from "../../shared/monopolyDealLogic";
import { getCardDef } from "../../shared/monopolyDealData";

const boardWithSet = (
  color: "brown" | "darkBlue",
  cards: PlacedPropertyCard[],
  extras?: { house?: boolean; hotel?: boolean }
): PlayerBoard => ({
  bank: [],
  propertySets: {
    [color]: {
      cards,
      house: extras?.house ?? false,
      hotel: extras?.hotel ?? false
    }
  }
});

describe("monopolyDealLogic", () => {
  it("detects complete brown set with standard property", () => {
    const set = getSet(
      boardWithSet("brown", [
        { instanceId: "a", defId: "prop-brown-mediterranean", activeColor: "brown" },
        { instanceId: "b", defId: "prop-brown-baltic", activeColor: "brown" }
      ]),
      "brown"
    );
    expect(isSetComplete(set, "brown")).toBe(true);
  });

  it("accepts wild-only set completion", () => {
    const set = getSet(
      boardWithSet("brown", [
        { instanceId: "a", defId: "wild-brown-lightBlue", activeColor: "brown" },
        { instanceId: "b", defId: "wild-multi-0", activeColor: "brown" }
      ]),
      "brown"
    );
    expect(isSetComplete(set, "brown")).toBe(true);
  });

  it("calculates rent with house and hotel on complete green set", () => {
    const board = boardWithSet(
      "darkBlue",
      [
        { instanceId: "a", defId: "prop-darkBlue-parkplace", activeColor: "darkBlue" },
        { instanceId: "b", defId: "prop-darkBlue-boardwalk", activeColor: "darkBlue" }
      ],
      { house: true, hotel: true }
    );
    expect(calculateRent(board, "darkBlue")).toBe(8 + 3 + 4);
  });

  it("wins with three complete sets", () => {
    const board: PlayerBoard = {
      bank: [],
      propertySets: {
        brown: {
          cards: [
            { instanceId: "a", defId: "prop-brown-mediterranean", activeColor: "brown" },
            { instanceId: "b", defId: "prop-brown-baltic", activeColor: "brown" }
          ],
          house: false,
          hotel: false
        },
        darkBlue: {
          cards: [
            { instanceId: "c", defId: "prop-darkBlue-parkplace", activeColor: "darkBlue" },
            { instanceId: "d", defId: "prop-darkBlue-boardwalk", activeColor: "darkBlue" }
          ],
          house: false,
          hotel: false
        },
        utility: {
          cards: [
            { instanceId: "e", defId: "prop-utility-electric", activeColor: "utility" },
            { instanceId: "f", defId: "prop-utility-water", activeColor: "utility" }
          ],
          house: false,
          hotel: false
        }
      }
    };
    expect(countCompleteSets(board)).toBe(3);
    expect(completePropertySetColors(board)).toEqual(expect.arrayContaining(["brown", "darkBlue", "utility"]));
    expect(hasWon(board)).toBe(true);
  });

  it("validates payment with no change required", () => {
    const board: PlayerBoard = {
      bank: [{ id: "m1", defId: "money-3m-0" }],
      propertySets: emptyPropertySets()
    };
    const result = validatePayment(2, [{ zone: "bank", instanceId: "m1" }], board);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.total).toBe(3);
    }
  });

  it("accepts all-in underpayment from bank only", () => {
    const board: PlayerBoard = {
      bank: [{ id: "m1", defId: "money-1m-0" }],
      propertySets: emptyPropertySets()
    };
    const result = validatePayment(3, [{ zone: "bank", instanceId: "m1" }], board);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.total).toBe(1);
    }
  });

  it("rejects underpayment when a required property is held back", () => {
    const board: PlayerBoard = {
      bank: [{ id: "m1", defId: "money-1m-0" }],
      propertySets: {
        pink: {
          cards: [{ instanceId: "p1", defId: "prop-pink-stcharles", activeColor: "pink" }],
          house: false,
          hotel: false
        }
      }
    };
    const result = validatePayment(4, [{ zone: "bank", instanceId: "m1" }], board);
    expect(result.ok).toBe(false);
  });

  it("detects when a player has nothing left to pay with", () => {
    expect(hasPayableAssets({ bank: [], propertySets: emptyPropertySets() })).toBe(false);
    expect(hasPayableAssets({ bank: [{ id: "m1", defId: "money-1m-0" }], propertySets: emptyPropertySets() })).toBe(
      true
    );
    expect(
      hasPayableAssets({
        bank: [],
        propertySets: {
          brown: {
            cards: [{ instanceId: "w1", defId: "wild-brown-lightBlue", activeColor: "brown" }],
            house: false,
            hotel: false
          }
        }
      })
    ).toBe(false);
  });

  it("accepts all-in underpayment and ignores wild cards", () => {
    const board: PlayerBoard = {
      bank: [{ id: "m1", defId: "money-1m-0" }],
      propertySets: {
        pink: {
          cards: [{ instanceId: "p1", defId: "prop-pink-stcharles", activeColor: "pink" }],
          house: false,
          hotel: false
        },
        brown: {
          cards: [{ instanceId: "w1", defId: "wild-brown-lightBlue", activeColor: "brown" }],
          house: false,
          hotel: false
        }
      }
    };
    const result = validatePayment(
      4,
      [
        { zone: "bank", instanceId: "m1" },
        { zone: "property", instanceId: "p1", propertyColor: "pink" }
      ],
      board
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.total).toBe(3);
    }
  });

  it("rejects property payment before all bank cards are selected", () => {
    const board: PlayerBoard = {
      bank: [
        { id: "m1", defId: "money-1m-0" },
        { id: "m2", defId: "money-2m-0" }
      ],
      propertySets: {
        pink: {
          cards: [{ instanceId: "p1", defId: "prop-pink-stcharles", activeColor: "pink" }],
          house: false,
          hotel: false
        }
      }
    };
    const result = validatePayment(
      5,
      [
        { zone: "bank", instanceId: "m1" },
        { zone: "property", instanceId: "p1", propertyColor: "pink" }
      ],
      board
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/money in your bank/i);
    }
  });

  it("tracks bank exhaustion and payment selection caps", () => {
    const board: PlayerBoard = {
      bank: [
        { id: "m1", defId: "money-1m-0" },
        { id: "m2", defId: "money-2m-0" }
      ],
      propertySets: {
        pink: {
          cards: [{ instanceId: "p1", defId: "prop-pink-stcharles", activeColor: "pink" }],
          house: false,
          hotel: false
        }
      }
    };
    const refs = [{ zone: "bank" as const, instanceId: "m1" }];
    expect(allBankCardsSelected(board, refs)).toBe(false);
    expect(canTogglePaymentRef(3, refs, board, { zone: "property", instanceId: "p1", propertyColor: "pink" })).toBe(
      false
    );
    expect(canTogglePaymentRef(3, refs, board, { zone: "bank", instanceId: "m2" })).toBe(true);

    const allBankRefs = [
      { zone: "bank" as const, instanceId: "m1" },
      { zone: "bank" as const, instanceId: "m2" }
    ];
    expect(allBankCardsSelected(board, allBankRefs)).toBe(true);
    expect(paymentSelectionTotal(allBankRefs, board)).toBe(3);
    expect(canTogglePaymentRef(3, allBankRefs, board, { zone: "property", instanceId: "p1", propertyColor: "pink" })).toBe(
      false
    );
    expect(canTogglePaymentRef(4, allBankRefs, board, { zone: "property", instanceId: "p1", propertyColor: "pink" })).toBe(
      true
    );
  });

  it("counts wild-only complete sets toward a win", () => {
    const board: PlayerBoard = {
      bank: [],
      propertySets: {
        brown: {
          cards: [
            { instanceId: "w1", defId: "wild-brown-lightBlue", activeColor: "brown" },
            { instanceId: "w2", defId: "wild-brown-lightBlue", activeColor: "brown" }
          ],
          house: false,
          hotel: false
        },
        darkBlue: {
          cards: [
            { instanceId: "w3", defId: "wild-green-darkBlue", activeColor: "darkBlue" },
            { instanceId: "w4", defId: "wild-green-darkBlue", activeColor: "darkBlue" }
          ],
          house: false,
          hotel: false
        },
        green: {
          cards: [
            { instanceId: "w5", defId: "wild-green-darkBlue", activeColor: "green" },
            { instanceId: "w6", defId: "wild-railroad-green", activeColor: "green" },
            { instanceId: "w7", defId: "wild-multi-0", activeColor: "green" }
          ],
          house: false,
          hotel: false
        }
      }
    };
    expect(countCompleteSets(board)).toBe(3);
    expect(hasWon(board)).toBe(true);
  });

  it("adds house bonuses from each complete set when charging rent", () => {
    const board = boardWithSet(
      "green",
      [
        { instanceId: "g1", defId: "prop-green-pacific", activeColor: "green" },
        { instanceId: "g2", defId: "prop-green-northcarolina", activeColor: "green" },
        { instanceId: "g3", defId: "prop-green-pennsylvania", activeColor: "green" }
      ],
      { house: true, hotel: true }
    );
    expect(calculateRent(board, "green")).toBe(7 + 3 + 4);
  });

  it("treats Just Say No and Double the Rent as non-playable actions", () => {
    expect(canPlayAsAction(getCardDef("action-justSayNo-0"))).toBe(false);
    expect(canPlayAsAction(getCardDef("action-doubleTheRent-0"))).toBe(false);
    expect(canPlayAsAction(getCardDef("action-slyDeal-0"))).toBe(true);
    expect(canPlayAsAction(getCardDef("rent-brown-lightBlue-0"))).toBe(true);
  });
});
