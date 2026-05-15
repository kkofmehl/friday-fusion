import { describe, expect, it } from "vitest";
import { CATCH_PHRASE_CLUES, pickCatchPhraseClue } from "./catchPhraseClues";

describe("catchPhraseClues", () => {
  it("exports a non-empty clue deck with unique ids", () => {
    expect(CATCH_PHRASE_CLUES.length).toBeGreaterThanOrEqual(120);
    const ids = new Set(CATCH_PHRASE_CLUES.map((c) => c.id));
    expect(ids.size).toBe(CATCH_PHRASE_CLUES.length);
    expect(CATCH_PHRASE_CLUES.every((c) => c.text.trim().length > 0)).toBe(true);
  });

  it("can still pick when every clue has been used", () => {
    const allIds = CATCH_PHRASE_CLUES.map((c) => c.id);
    const pick = pickCatchPhraseClue(allIds);
    expect(pick).not.toBeNull();
    expect(CATCH_PHRASE_CLUES.some((c) => c.id === pick!.id)).toBe(true);
  });
});
