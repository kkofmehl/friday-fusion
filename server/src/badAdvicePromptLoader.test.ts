import { describe, expect, it } from "vitest";
import { pickBadAdvicePrompts } from "./badAdvicePromptLoader";

describe("pickBadAdvicePrompts", () => {
  const pool = [
    { id: "ba-a", text: "How do I buy a car?" },
    { id: "ba-b", text: "How do I cook pasta?" },
    { id: "ba-c", text: "How do I ask for a raise?" }
  ];

  it("returns unused prompts first", () => {
    const picked = pickBadAdvicePrompts(new Set(["ba-a"]), 2, pool);
    expect(picked).toHaveLength(2);
    expect(picked.every((prompt) => prompt.id !== "ba-a")).toBe(true);
  });

  it("returns available unused prompts when count exceeds unused", () => {
    const picked = pickBadAdvicePrompts(new Set(["ba-a"]), 10, pool);
    expect(picked).toHaveLength(2);
    expect(picked.map((p) => p.id).sort()).toEqual(["ba-b", "ba-c"]);
  });

  it("recycles the full pool when all prompts are used", () => {
    const picked = pickBadAdvicePrompts(new Set(["ba-a", "ba-b", "ba-c"]), 2, pool);
    expect(picked).toHaveLength(2);
    expect(picked.every((prompt) => pool.some((p) => p.id === prompt.id))).toBe(true);
  });

  it("loads the stock bank by default", () => {
    const picked = pickBadAdvicePrompts(new Set(), 50);
    expect(picked).toHaveLength(50);
    expect(new Set(picked.map((p) => p.id)).size).toBe(50);
  });
});
