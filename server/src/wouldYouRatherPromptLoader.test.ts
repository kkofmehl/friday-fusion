import { describe, expect, it } from "vitest";
import { pickWouldYouRatherPrompts } from "./wouldYouRatherPromptLoader";

describe("pickWouldYouRatherPrompts", () => {
  const pool = [
    { id: "wyr-a", optionA: "one", optionB: "two", source: "library" as const, submittedByParticipantId: null },
    { id: "wyr-b", optionA: "three", optionB: "four", source: "library" as const, submittedByParticipantId: null },
    { id: "wyr-c", optionA: "five", optionB: "six", source: "library" as const, submittedByParticipantId: null }
  ];

  it("returns unused prompts first", () => {
    const picked = pickWouldYouRatherPrompts(new Set(["wyr-a"]), 2, pool);
    expect(picked).toHaveLength(2);
    expect(picked.every((prompt) => prompt.id !== "wyr-a")).toBe(true);
  });

  it("returns available prompts when count exceeds pool", () => {
    const picked = pickWouldYouRatherPrompts(new Set(), 10, pool);
    expect(picked.length).toBeLessThanOrEqual(3);
  });
});
