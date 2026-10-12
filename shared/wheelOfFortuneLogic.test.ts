import { describe, expect, it } from "vitest";
import {
  WHEEL_WEDGES,
  WHEEL_WEDGE_COUNT,
  bankRoundWinnings,
  bonusFfPoints,
  computeFinalRotationDeg,
  countLetterOccurrences,
  fridayFusionPointsFromMoney,
  isConsonant,
  isVowel,
  maskPuzzle,
  nextPlayerInOrder,
  normalizePuzzleSolution,
  pickMoneyLeader,
  puzzleFullyRevealed,
  solutionsMatch,
  validatePuzzleCategory,
  validatePuzzleText,
  wheelSpinEaseOut,
  wheelSpinRotationDeg
} from "./wheelOfFortuneLogic";

describe("wheelOfFortuneLogic", () => {
  it("has 24 wedges matching the reference layout", () => {
    expect(WHEEL_WEDGE_COUNT).toBe(24);
    expect(WHEEL_WEDGES).toHaveLength(24);
    expect(WHEEL_WEDGES[0]?.kind).toBe("loseATurn");
    expect(WHEEL_WEDGES[7]?.value).toBe(5000);
    expect(WHEEL_WEDGES[18]?.freeSpin).toBe(true);
    expect(WHEEL_WEDGES[18]?.value).toBe(600);
    expect(WHEEL_WEDGES[20]?.kind).toBe("bankrupt");
  });

  it("classifies vowels and consonants", () => {
    expect(isVowel("a")).toBe(true);
    expect(isVowel("U")).toBe(true);
    expect(isConsonant("b")).toBe(true);
    expect(isConsonant("E")).toBe(false);
    expect(isConsonant("1")).toBe(false);
  });

  it("masks and reveals puzzle letters", () => {
    expect(maskPuzzle("HELLO WORLD", [])).toBe("_____ _____");
    expect(maskPuzzle("HELLO WORLD", ["L", "O"])).toBe("__LLO _O_L_");
    expect(countLetterOccurrences("HELLO", "L")).toBe(2);
    expect(puzzleFullyRevealed("HI", ["H", "I"])).toBe(true);
    expect(puzzleFullyRevealed("HI", ["H"])).toBe(false);
  });

  it("normalizes and compares solutions", () => {
    expect(normalizePuzzleSolution("  Hello, World! ")).toBe("HELLOWORLD");
    expect(solutionsMatch("hello world", "HELLO WORLD")).toBe(true);
    expect(solutionsMatch("hello", "HELLO WORLD")).toBe(false);
    expect(solutionsMatch("snow man", "SNOWMAN")).toBe(true);
  });

  it("validates host puzzle text and category", () => {
    expect(validatePuzzleText("  a phrase  ")).toBe("A PHRASE");
    expect(() => validatePuzzleText("!!!")).toThrow(/letter/);
    expect(validatePuzzleCategory("Phrase")).toBe("Phrase");
    expect(() => validatePuzzleCategory("")).toThrow(/Category/);
  });

  it("banks round winnings with $1000 floor", () => {
    expect(bankRoundWinnings(0)).toBe(1000);
    expect(bankRoundWinnings(500)).toBe(1000);
    expect(bankRoundWinnings(2500)).toBe(2500);
  });

  it("converts money and bonus to Friday Fusion points", () => {
    expect(fridayFusionPointsFromMoney(2000)).toBe(20);
    expect(fridayFusionPointsFromMoney(1999)).toBe(19);
    expect(bonusFfPoints(3)).toBe(6);
    expect(bonusFfPoints(2)).toBe(4);
  });

  it("eases spin rotation toward the final angle", () => {
    expect(wheelSpinEaseOut(0)).toBe(0);
    expect(wheelSpinEaseOut(1)).toBe(1);
    expect(wheelSpinRotationDeg(0, 1000, 2000, 720)).toBe(0);
    expect(wheelSpinRotationDeg(1500, 1000, 2000, 720)).toBeGreaterThan(0);
    expect(wheelSpinRotationDeg(1500, 1000, 2000, 720)).toBeLessThan(720);
    expect(wheelSpinRotationDeg(2000, 1000, 2000, 720)).toBe(720);
  });

  it("computes final rotation so target wedge centers under the flipper", () => {
    const deg = computeFinalRotationDeg(0, 3);
    expect(deg).toBeGreaterThanOrEqual(3 * 360);
    expect(deg % 360).toBeCloseTo(360 - 360 / 24 / 2, 5);
  });

  it("picks money leader with random tie-break", () => {
    expect(pickMoneyLeader(["a", "b"], { a: 1000, b: 500 }, () => 0)).toBe("a");
    expect(pickMoneyLeader(["a", "b"], { a: 1000, b: 1000 }, () => 1)).toBe("b");
  });

  it("advances turn order", () => {
    expect(nextPlayerInOrder(["a", "b", "c"], "a")).toBe("b");
    expect(nextPlayerInOrder(["a", "b", "c"], "c")).toBe("a");
    expect(nextPlayerInOrder(["a", "b"], null)).toBe("a");
  });
});
