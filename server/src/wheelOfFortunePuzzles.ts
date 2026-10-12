import { z } from "zod";
import { validatePuzzleCategory, validatePuzzleText } from "../../shared/wheelOfFortuneLogic";
import puzzlesJson from "./data/wheelOfFortunePuzzles.json";

export const wheelOfFortuneBankPuzzleSchema = z.object({
  id: z.string().min(1),
  category: z.string().min(1),
  answer: z.string().min(1)
});
export type WheelOfFortuneBankPuzzle = z.infer<typeof wheelOfFortuneBankPuzzleSchema>;

const BANK = wheelOfFortuneBankPuzzleSchema.array().parse(puzzlesJson);

const shuffleInPlace = <T>(items: T[]): T[] => {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
  return items;
};

export type WheelOfFortunePuzzle = {
  id: string;
  category: string;
  answer: string;
};

/**
 * Prefer unused puzzles until the bank is exhausted, then reshuffle and reuse.
 * Returns exactly `count` puzzles when the bank is non-empty.
 */
export function pickWheelOfFortunePuzzles(
  usedIds: ReadonlySet<string>,
  count: number,
  pool: WheelOfFortuneBankPuzzle[] = BANK
): WheelOfFortunePuzzle[] {
  if (pool.length === 0 || count <= 0) {
    return [];
  }
  const unused = pool.filter((p) => !usedIds.has(p.id));
  shuffleInPlace(unused);
  const picked: WheelOfFortuneBankPuzzle[] = [];
  if (unused.length >= count) {
    picked.push(...unused.slice(0, count));
  } else {
    picked.push(...unused);
    const remaining = count - picked.length;
    const recycled = pool.filter((p) => !picked.some((x) => x.id === p.id));
    shuffleInPlace(recycled);
    const refill = recycled.length > 0 ? recycled : [...pool];
    shuffleInPlace(refill);
    while (picked.length < count) {
      const next = refill[(picked.length - unused.length) % refill.length];
      if (!next) {
        break;
      }
      picked.push(next);
    }
  }
  return picked.slice(0, count).map((p) => ({
    id: p.id,
    category: p.category,
    answer: p.answer.toUpperCase()
  }));
}

export function normalizeCustomPuzzles(
  inputs: ReadonlyArray<{ category: string; answer: string }>
): WheelOfFortunePuzzle[] {
  return inputs.map((input, index) => ({
    id: `custom-${index + 1}`,
    category: validatePuzzleCategory(input.category),
    answer: validatePuzzleText(input.answer)
  }));
}

export function getWheelOfFortuneBankSize(): number {
  return BANK.length;
}
