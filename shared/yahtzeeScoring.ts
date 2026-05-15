import type { YahtzeeCategory, YahtzeeSheetRow } from "./contracts";

const UPPER: YahtzeeCategory[] = ["ones", "twos", "threes", "fours", "fives", "sixes"];

const LOWER: YahtzeeCategory[] = [
  "threeOfAKind",
  "fourOfAKind",
  "fullHouse",
  "smallStraight",
  "largeStraight",
  "yahtzee",
  "chance"
];

export const YAHTZEE_UPPER_CATEGORIES: readonly YahtzeeCategory[] = UPPER;
export const YAHTZEE_LOWER_CATEGORIES: readonly YahtzeeCategory[] = LOWER;
export const YAHTZEE_CATEGORY_ORDER: readonly YahtzeeCategory[] = [...UPPER, ...LOWER];

function sumDice(dice: readonly number[]): number {
  return dice.reduce((a, b) => a + b, 0);
}

function countsByFace(dice: readonly number[]): Record<number, number> {
  const out: Record<number, number> = {};
  for (const d of dice) {
    out[d] = (out[d] ?? 0) + 1;
  }
  return out;
}

function countValuesSortedDesc(dice: readonly number[]): number[] {
  return Object.values(countsByFace(dice)).sort((a, b) => b - a);
}

function hasNOfAKind(dice: readonly number[], n: number): boolean {
  return countValuesSortedDesc(dice)[0]! >= n;
}

function hasFullHouse(dice: readonly number[]): boolean {
  const sorted = countValuesSortedDesc(dice);
  return sorted[0] === 5 || (sorted[0] === 3 && sorted[1] === 2);
}

function uniqueSorted(dice: readonly number[]): number[] {
  return [...new Set(dice)].sort((a, b) => a - b);
}

/** Any four consecutive values among the five dice (Hasbro-style). */
export function hasSmallStraight(dice: readonly number[]): boolean {
  const u = uniqueSorted(dice);
  const runs: number[][] = [
    [1, 2, 3, 4],
    [2, 3, 4, 5],
    [3, 4, 5, 6]
  ];
  return runs.some((run) => run.every((v) => u.includes(v)));
}

export function hasLargeStraight(dice: readonly number[]): boolean {
  const u = uniqueSorted(dice);
  if (u.length !== 5) {
    return false;
  }
  return (u[0] === 1 && u[4] === 5) || (u[0] === 2 && u[4] === 6);
}

export function isYahtzee(dice: readonly number[]): boolean {
  return hasNOfAKind(dice, 5);
}

export function scoreCategory(dice: readonly number[], category: YahtzeeCategory): number {
  if (dice.length !== 5) {
    return 0;
  }
  const counts = countsByFace(dice);
  switch (category) {
    case "ones":
      return counts[1] ?? 0;
    case "twos":
      return (counts[2] ?? 0) * 2;
    case "threes":
      return (counts[3] ?? 0) * 3;
    case "fours":
      return (counts[4] ?? 0) * 4;
    case "fives":
      return (counts[5] ?? 0) * 5;
    case "sixes":
      return (counts[6] ?? 0) * 6;
    case "threeOfAKind":
      return hasNOfAKind(dice, 3) ? sumDice(dice) : 0;
    case "fourOfAKind":
      return hasNOfAKind(dice, 4) ? sumDice(dice) : 0;
    case "fullHouse":
      return hasFullHouse(dice) ? 25 : 0;
    case "smallStraight":
      return hasSmallStraight(dice) ? 30 : 0;
    case "largeStraight":
      return hasLargeStraight(dice) ? 40 : 0;
    case "yahtzee":
      return isYahtzee(dice) ? 50 : 0;
    case "chance":
      return sumDice(dice);
  }
}

function sheetRowsToMap(rows: readonly YahtzeeSheetRow[]): Partial<Record<YahtzeeCategory, number>> {
  const m: Partial<Record<YahtzeeCategory, number>> = {};
  for (const r of rows) {
    m[r.category] = r.points;
  }
  return m;
}

export function upperSubtotalFromSheet(map: Partial<Record<YahtzeeCategory, number>>): number {
  let s = 0;
  for (const c of UPPER) {
    const v = map[c];
    if (typeof v === "number") {
      s += v;
    }
  }
  return s;
}

/** +35 only when all six upper rows are filled and their sum is at least 63. */
export function upperBonusFromSheet(map: Partial<Record<YahtzeeCategory, number>>): number {
  for (const c of UPPER) {
    if (typeof map[c] !== "number") {
      return 0;
    }
  }
  return upperSubtotalFromSheet(map) >= 63 ? 35 : 0;
}

export function lowerTotalFromSheet(map: Partial<Record<YahtzeeCategory, number>>): number {
  let s = 0;
  for (const c of LOWER) {
    const v = map[c];
    if (typeof v === "number") {
      s += v;
    }
  }
  return s;
}

export function grandTotalFromSheetRows(rows: readonly YahtzeeSheetRow[]): number {
  const map = sheetRowsToMap(rows);
  return upperSubtotalFromSheet(map) + upperBonusFromSheet(map) + lowerTotalFromSheet(map);
}

export function placementAward(place: number, playerCount: number): number {
  if (playerCount < 1 || place < 1 || place > playerCount) {
    return 0;
  }
  return playerCount - place + 1;
}

export type YahtzeeStandingsEntry = {
  participantId: string;
  grandTotal: number;
  /** 1-based place after sorting by grandTotal desc, tie-break by lower playerOrderIndex. */
  place: number;
  award: number;
};

/** Sort by grand total descending; ties → earlier index in `playerOrder` ranks higher. */
export function computeYahtzeePlacement(
  playerOrder: readonly string[],
  grandTotals: Readonly<Record<string, number>>
): YahtzeeStandingsEntry[] {
  const n = playerOrder.length;
  const indexed = playerOrder.map((participantId, playerOrderIndex) => ({
    participantId,
    playerOrderIndex,
    grandTotal: grandTotals[participantId] ?? 0
  }));
  indexed.sort((a, b) => {
    if (b.grandTotal !== a.grandTotal) {
      return b.grandTotal - a.grandTotal;
    }
    return a.playerOrderIndex - b.playerOrderIndex;
  });
  return indexed.map((row, i) => ({
    participantId: row.participantId,
    grandTotal: row.grandTotal,
    place: i + 1,
    award: placementAward(i + 1, n)
  }));
}
