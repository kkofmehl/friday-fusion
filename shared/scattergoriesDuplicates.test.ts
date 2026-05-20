import { describe, expect, it } from "vitest";
import {
  isScattergoriesDuplicateAt,
  normalizeScattergoriesAnswer,
  participantHasDuplicateForPrompt,
  scattergoriesDuplicateIndices
} from "./scattergoriesDuplicates";

describe("scattergoriesDuplicates", () => {
  it("normalizeScattergoriesAnswer ignores blanks", () => {
    expect(normalizeScattergoriesAnswer("  ")).toBeNull();
    expect(normalizeScattergoriesAnswer(" Apple ")).toBe("apple");
  });

  it("scattergoriesDuplicateIndices flags repeated answers case-insensitively", () => {
    const indices = scattergoriesDuplicateIndices(["Spoon", "soup", "Spoon", ""]);
    expect([...indices].sort()).toEqual([0, 2]);
  });

  it("participantHasDuplicateForPrompt checks only the requested prompt", () => {
    const answers = ["Alpha", "Beta", "alpha"];
    expect(participantHasDuplicateForPrompt(answers, 0)).toBe(true);
    expect(participantHasDuplicateForPrompt(answers, 1)).toBe(false);
    expect(isScattergoriesDuplicateAt(answers, 2)).toBe(true);
  });
});
