import { describe, expect, it } from "vitest";
import type { YahtzeeCategory, YahtzeeSheetRow } from "../../shared/contracts";
import {
  computeYahtzeePlacement,
  grandTotalFromSheetRows,
  hasLargeStraight,
  hasSmallStraight,
  hasUpperBonusFromSheetRows,
  isYahtzee,
  placementAward,
  scoreCategory,
  scoredYahtzeeFromSheetRows,
  upperBonusFromSheet,
  upperSubtotalFromSheet
} from "../../shared/yahtzeeScoring";

const d = (...v: number[]) => v as [number, number, number, number, number];

describe("scoreCategory", () => {
  it("scores upper section as sum of matching dice only", () => {
    expect(scoreCategory(d(1, 1, 2, 3, 4), "ones")).toBe(2);
    expect(scoreCategory(d(6, 6, 6, 1, 2), "sixes")).toBe(18);
    expect(scoreCategory(d(2, 3, 4, 5, 6), "ones")).toBe(0);
  });

  it("three and four of a kind use sum of all dice when pattern matches", () => {
    expect(scoreCategory(d(3, 3, 3, 2, 1), "threeOfAKind")).toBe(12);
    expect(scoreCategory(d(3, 3, 4, 5, 6), "threeOfAKind")).toBe(0);
    expect(scoreCategory(d(4, 4, 4, 4, 1), "fourOfAKind")).toBe(17);
    expect(scoreCategory(d(4, 4, 4, 1, 2), "fourOfAKind")).toBe(0);
  });

  it("full house", () => {
    expect(scoreCategory(d(2, 2, 2, 5, 5), "fullHouse")).toBe(25);
    expect(scoreCategory(d(2, 2, 5, 5, 5), "fullHouse")).toBe(25);
    expect(scoreCategory(d(1, 2, 3, 4, 5), "fullHouse")).toBe(0);
    expect(scoreCategory(d(6, 6, 6, 6, 6), "fullHouse")).toBe(25);
  });

  it("straights", () => {
    expect(hasSmallStraight(d(1, 2, 3, 4, 6))).toBe(true);
    expect(hasSmallStraight(d(1, 3, 4, 5, 6))).toBe(true);
    expect(hasSmallStraight(d(1, 2, 3, 5, 6))).toBe(false);
    expect(scoreCategory(d(1, 2, 3, 4, 6), "smallStraight")).toBe(30);
    expect(hasLargeStraight(d(1, 2, 3, 4, 5))).toBe(true);
    expect(hasLargeStraight(d(2, 3, 4, 5, 6))).toBe(true);
    expect(hasLargeStraight(d(1, 2, 3, 4, 6))).toBe(false);
    expect(scoreCategory(d(2, 3, 4, 5, 6), "largeStraight")).toBe(40);
  });

  it("yahtzee and chance", () => {
    expect(isYahtzee(d(3, 3, 3, 3, 3))).toBe(true);
    expect(scoreCategory(d(3, 3, 3, 3, 3), "yahtzee")).toBe(50);
    expect(scoreCategory(d(3, 3, 3, 3, 2), "yahtzee")).toBe(0);
    expect(scoreCategory(d(1, 2, 4, 5, 6), "chance")).toBe(18);
  });
});

describe("upperBonusFromSheet", () => {
  it("is 0 until all upper rows are filled", () => {
    const partial: Partial<Record<YahtzeeCategory, number>> = {
      ones: 3,
      twos: 6,
      threes: 9,
      fours: 12,
      fives: 15,
      sixes: 18
    };
    expect(upperSubtotalFromSheet(partial)).toBe(63);
    expect(upperBonusFromSheet(partial)).toBe(35);
    expect(upperBonusFromSheet({ ones: 5, twos: 0 })).toBe(0);
  });

  it("no bonus when upper sum under 63", () => {
    const m: Partial<Record<YahtzeeCategory, number>> = {
      ones: 0,
      twos: 0,
      threes: 0,
      fours: 0,
      fives: 0,
      sixes: 30
    };
    expect(upperBonusFromSheet(m)).toBe(0);
  });
});

describe("scoredYahtzeeFromSheetRows and hasUpperBonusFromSheetRows", () => {
  it("detects yahtzee row score and upper bonus from committed rows", () => {
    const rows: YahtzeeSheetRow[] = [
      { category: "ones", points: 3 },
      { category: "twos", points: 6 },
      { category: "threes", points: 9 },
      { category: "fours", points: 12 },
      { category: "fives", points: 15 },
      { category: "sixes", points: 18 },
      { category: "yahtzee", points: 50 }
    ];
    expect(scoredYahtzeeFromSheetRows(rows)).toBe(true);
    expect(hasUpperBonusFromSheetRows(rows)).toBe(true);
    expect(scoredYahtzeeFromSheetRows([{ category: "yahtzee", points: 0 }])).toBe(false);
    expect(hasUpperBonusFromSheetRows([{ category: "ones", points: 5 }])).toBe(false);
  });
});

describe("grandTotalFromSheetRows", () => {
  it("sums upper, bonus, and lower from committed rows", () => {
    const rows: YahtzeeSheetRow[] = [
      { category: "ones", points: 3 },
      { category: "twos", points: 6 },
      { category: "threes", points: 9 },
      { category: "fours", points: 12 },
      { category: "fives", points: 15 },
      { category: "sixes", points: 18 },
      { category: "chance", points: 10 }
    ];
    expect(grandTotalFromSheetRows(rows)).toBe(63 + 35 + 10);
  });
});

describe("placementAward and computeYahtzeePlacement", () => {
  it("reverse place points", () => {
    expect(placementAward(1, 4)).toBe(4);
    expect(placementAward(2, 4)).toBe(3);
    expect(placementAward(4, 4)).toBe(1);
  });

  it("tie-break by playerOrder index", () => {
    const order = ["a", "b", "c"];
    const totals = { a: 100, b: 100, c: 50 };
    const r = computeYahtzeePlacement(order, totals);
    expect(r[0]!.participantId).toBe("a");
    expect(r[1]!.participantId).toBe("b");
    expect(r[2]!.participantId).toBe("c");
    expect(r.map((x) => x.award)).toEqual([3, 2, 1]);
  });
});
