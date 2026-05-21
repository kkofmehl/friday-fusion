import { nanoid } from "nanoid";
import { MEMORY_SYMBOL_CATALOG } from "../../shared/memorySymbols";

export type MemoryDeckCard = {
  id: string;
  symbolId: string;
};

const shuffleInPlace = <T>(items: T[], random: () => number): T[] => {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
  return items;
};

/**
 * Builds a shuffled deck: `pairCount` distinct symbols, each duplicated twice.
 * `pairCount` must be ≤ unique symbols in the catalog.
 */
export const buildMemoryDeck = (pairCount: number, random: () => number = Math.random): MemoryDeckCard[] => {
  if (pairCount < 1) {
    throw new Error("Memory needs at least one pair.");
  }
  if (pairCount > MEMORY_SYMBOL_CATALOG.length) {
    throw new Error("Memory pair count exceeds symbol catalog.");
  }
  const symbolEntries = shuffleInPlace([...MEMORY_SYMBOL_CATALOG], random).slice(0, pairCount);
  const pairs: MemoryDeckCard[] = [];
  for (const { id: symbolId } of symbolEntries) {
    pairs.push({ id: nanoid(8), symbolId }, { id: nanoid(8), symbolId });
  }
  shuffleInPlace(pairs, random);
  return pairs;
};
