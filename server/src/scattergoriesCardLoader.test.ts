import { describe, expect, it } from "vitest";
import { getScattergoriesListById, pickScattergoriesList } from "./scattergoriesCardLoader";

describe("scattergoriesCardLoader", () => {
  it("loads lists with twelve prompts", () => {
    const list = getScattergoriesListById("scat-001");
    expect(list).toBeDefined();
    expect(list?.prompts).toHaveLength(12);
  });

  it("pickScattergoriesList avoids used ids until exhausted", () => {
    const used = new Set<string>();
    const first = pickScattergoriesList(used);
    used.add(first.id);
    const second = pickScattergoriesList(used);
    expect(second.id).not.toBe(first.id);
  });
});
