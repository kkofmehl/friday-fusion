import { typeRacePromptSchema, type TypeRacePrompt } from "../../shared/contracts";
import fallbackPrompts from "./data/typeRacePrompts.json";

const FALLBACK = typeRacePromptSchema.array().parse(fallbackPrompts);

const shuffleInPlace = <T>(items: T[]): T[] => {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
  return items;
};

/**
 * Picks one prompt, preferring ids not in `usedIds`. When every prompt has been
 * used, recycles from a reshuffled full pool.
 */
export const pickTypeRacePrompt = (
  usedIds: ReadonlySet<string>,
  pool: TypeRacePrompt[] = FALLBACK,
  random: () => number = Math.random
): TypeRacePrompt => {
  if (pool.length === 0) {
    throw new Error("Type Race prompt library is empty.");
  }
  const unused = pool.filter((prompt) => !usedIds.has(prompt.id));
  const source = unused.length > 0 ? [...unused] : [...pool];
  shuffleInPlace(source);
  // deterministic index when tests pass a fixed random
  const index = Math.floor(random() * source.length);
  return source[index]!;
};

export const getTypeRacePromptLibrary = (): TypeRacePrompt[] => [...FALLBACK];
