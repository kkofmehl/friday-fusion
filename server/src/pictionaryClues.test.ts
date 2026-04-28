import { describe, expect, it } from "vitest";
import { PICTORY_CLUES, pickPictionaryClue } from "./pictionaryClues";

describe("pictionaryClues", () => {
  it("exports a large non-empty clue deck with unique ids", () => {
    expect(PICTORY_CLUES.length).toBeGreaterThanOrEqual(150);
    const ids = new Set(PICTORY_CLUES.map((c) => c.id));
    expect(ids.size).toBe(PICTORY_CLUES.length);
    expect(PICTORY_CLUES.every((c) => c.text.trim().length > 0)).toBe(true);
  });

  it("pickPictionaryClue returns a clue when every id was used (deck reuse)", () => {
    const allIds = PICTORY_CLUES.map((c) => c.id);
    const pick = pickPictionaryClue(allIds);
    expect(pick).not.toBeNull();
    expect(PICTORY_CLUES.some((c) => c.id === pick!.id)).toBe(true);
  });
});
