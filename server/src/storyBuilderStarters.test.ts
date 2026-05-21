import { describe, expect, it } from "vitest";
import { pickStoryBuilderStarter, STORY_BUILDER_STARTER_COUNT, storyBuilderStarterSchema } from "./storyBuilderStarters";
import starters from "./data/storyBuilderStarters.json";

describe("storyBuilderStarters", () => {
  it("parses the bundled JSON with at least 30 unique starters", () => {
    const parsed = storyBuilderStarterSchema.array().parse(starters);
    expect(parsed.length).toBeGreaterThanOrEqual(30);
    const ids = new Set(parsed.map((s) => s.id));
    expect(ids.size).toBe(parsed.length);
    for (const row of parsed) {
      expect(row.text.trim().length).toBeGreaterThan(0);
    }
    expect(STORY_BUILDER_STARTER_COUNT).toBe(parsed.length);
  });

  it("pickStoryBuilderStarter prefers unused ids", () => {
    const pool = [
      { id: "a", text: "one" },
      { id: "b", text: "two" },
      { id: "c", text: "three" }
    ];
    const seen = new Set<string>();
    for (let i = 0; i < 20; i += 1) {
      const pick = pickStoryBuilderStarter([...seen], pool);
      expect(["a", "b", "c"]).toContain(pick.id);
      seen.add(pick.id);
      if (seen.size === 3) {
        seen.clear();
      }
    }
  });
});
