import { z } from "zod";
import fallbackStarters from "./data/storyBuilderStarters.json";

export const storyBuilderStarterSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1).max(500)
});
export type StoryBuilderStarter = z.infer<typeof storyBuilderStarterSchema>;

const FALLBACK = storyBuilderStarterSchema.array().parse(fallbackStarters);

const shuffleInPlace = <T>(items: T[]): T[] => {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
  return items;
};

/**
 * Picks a starter preferring ids not in `usedIds`. When all are used, reshuffles the full pool.
 */
export const pickStoryBuilderStarter = (
  usedIds: readonly string[],
  pool: readonly StoryBuilderStarter[] = FALLBACK
): StoryBuilderStarter => {
  const used = new Set(usedIds);
  const unused = pool.filter((entry) => !used.has(entry.id));
  const candidates = unused.length > 0 ? [...unused] : [...pool];
  shuffleInPlace(candidates);
  return candidates[0] ?? pool[0]!;
};

export const STORY_BUILDER_STARTER_COUNT = FALLBACK.length;
