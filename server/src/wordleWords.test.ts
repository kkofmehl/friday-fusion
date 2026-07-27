import { describe, expect, it } from "vitest";
import { getWordleAnswers, isValidWordleGuess, pickWordleAnswer } from "./wordleWords";

describe("wordleWords", () => {
  it("loads a substantial answer list of 5-letter words", () => {
    const answers = getWordleAnswers();
    expect(answers.length).toBeGreaterThan(2000);
    expect(answers.every((w) => w.length === 5 && /^[a-z]+$/.test(w))).toBe(true);
  });

  it("accepts answers and common guesses", () => {
    expect(isValidWordleGuess("crane")).toBe(true);
    expect(isValidWordleGuess("aahed")).toBe(true);
    expect(isValidWordleGuess("zzzzz")).toBe(false);
    expect(isValidWordleGuess("too")).toBe(false);
  });

  it("picks unused answers", () => {
    const used = getWordleAnswers().slice(0, 10);
    const picked = pickWordleAnswer(used, () => 0);
    expect(used).not.toContain(picked);
    expect(picked).toHaveLength(5);
  });
});
