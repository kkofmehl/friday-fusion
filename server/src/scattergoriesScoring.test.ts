import { describe, expect, it } from "vitest";
import { countLetterWords } from "../../shared/scattergoriesScoring";

describe("countLetterWords", () => {
  it("counts each qualifying word", () => {
    expect(countLetterWords("Silly Silo", "S")).toBe(2);
    expect(countLetterWords("silly silo", "s")).toBe(2);
  });

  it("returns 0 for empty or non-matching answers", () => {
    expect(countLetterWords("", "S")).toBe(0);
    expect(countLetterWords("Apple", "S")).toBe(0);
  });

  it("counts single-word answers", () => {
    expect(countLetterWords("Spaceship", "S")).toBe(1);
  });
});
