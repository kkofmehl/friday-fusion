import { wouldYouRatherPromptSchema, type WouldYouRatherPrompt } from "../../shared/contracts";
import fallbackPrompts from "./data/wouldYouRatherPrompts.json";

const FALLBACK = wouldYouRatherPromptSchema.array().parse(fallbackPrompts);

const shuffleInPlace = <T>(items: T[]): T[] => {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
  return items;
};

export const pickWouldYouRatherPrompts = (
  usedIds: Set<string>,
  count: number,
  pool: WouldYouRatherPrompt[] = FALLBACK
): WouldYouRatherPrompt[] => {
  const unused = pool.filter((prompt) => !usedIds.has(prompt.id));
  shuffleInPlace(unused);
  if (unused.length >= count) {
    return unused.slice(0, count);
  }
  if (unused.length > 0) {
    return unused;
  }
  const recycled = [...pool];
  shuffleInPlace(recycled);
  return recycled.slice(0, Math.min(count, recycled.length));
};
