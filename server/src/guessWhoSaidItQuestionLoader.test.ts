import { describe, expect, it } from "vitest";
import { pickGuessWhoSaidItQuestions } from "./guessWhoSaidItQuestionLoader";

describe("pickGuessWhoSaidItQuestions", () => {
  const pool = [
    { id: "a", text: "A" },
    { id: "b", text: "B" },
    { id: "c", text: "C" }
  ];

  it("returns unused items first when enough remain", () => {
    const used = new Set<string>(["a"]);
    const picked = pickGuessWhoSaidItQuestions(used, 2, pool);
    expect(picked).toHaveLength(2);
    expect(picked.every((q) => q.id !== "a")).toBe(true);
  });

  it("recycles when all ids are used", () => {
    const used = new Set<string>(["a", "b", "c"]);
    const picked = pickGuessWhoSaidItQuestions(used, 2, pool);
    expect(picked).toHaveLength(2);
    expect(picked.every((q) => pool.some((p) => p.id === q.id))).toBe(true);
  });
});
