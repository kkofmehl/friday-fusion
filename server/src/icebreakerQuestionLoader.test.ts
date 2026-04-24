import { describe, expect, it } from "vitest";
import { pickIcebreakerQuestions } from "./icebreakerQuestionLoader";

describe("pickIcebreakerQuestions", () => {
  const pool = [
    { id: "a", text: "one" },
    { id: "b", text: "two" },
    { id: "c", text: "three" }
  ];

  it("returns unused questions first", () => {
    const picked = pickIcebreakerQuestions(new Set(["a"]), 2, pool);
    expect(picked).toHaveLength(2);
    expect(picked.every((q) => q.id !== "a")).toBe(true);
  });

  it("returns fewer than requested when pool is smaller than count", () => {
    const picked = pickIcebreakerQuestions(new Set(), 10, pool);
    expect(picked.length).toBeLessThanOrEqual(3);
  });
});
