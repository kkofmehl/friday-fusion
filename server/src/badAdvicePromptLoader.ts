import { badAdvicePromptSchema, type BadAdvicePrompt } from "../../shared/contracts";
import fallbackPrompts from "./data/badAdvicePrompts.json";

const FALLBACK = badAdvicePromptSchema.array().parse(fallbackPrompts);

const shuffleInPlace = <T>(items: T[]): T[] => {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
  return items;
};

/**
 * Picks up to `count` prompts, preferring items not in `usedIds`. If every
 * prompt has been used, repeats are allowed from a reshuffled full pool.
 */
export const pickBadAdvicePrompts = (
  usedIds: Set<string>,
  count: number,
  pool: BadAdvicePrompt[] = FALLBACK
): BadAdvicePrompt[] => {
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
