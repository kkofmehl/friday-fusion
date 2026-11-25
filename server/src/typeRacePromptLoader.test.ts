import { describe, expect, it } from "vitest";
import { getTypeRacePromptLibrary, pickTypeRacePrompt } from "./typeRacePromptLoader";

describe("typeRacePromptLoader", () => {
  it("loads about fifty unique prompts within length bounds", () => {
    const library = getTypeRacePromptLibrary();
    expect(library.length).toBeGreaterThanOrEqual(50);
    expect(new Set(library.map((p) => p.id)).size).toBe(library.length);
    for (const prompt of library) {
      expect(prompt.text.length).toBeGreaterThanOrEqual(350);
      expect(prompt.text.length).toBeLessThanOrEqual(700);
    }
  });

  it("prefers unused prompts", () => {
    const pool = [
      { id: "a", text: "a".repeat(350) },
      { id: "b", text: "b".repeat(350) },
      { id: "c", text: "c".repeat(350) }
    ];
    const picked = pickTypeRacePrompt(new Set(["a", "b"]), pool, () => 0);
    expect(picked.id).toBe("c");
  });

  it("recycles when all prompts are used", () => {
    const pool = [
      { id: "a", text: "a".repeat(350) },
      { id: "b", text: "b".repeat(350) }
    ];
    const picked = pickTypeRacePrompt(new Set(["a", "b"]), pool, () => 0);
    expect(["a", "b"]).toContain(picked.id);
  });
});
