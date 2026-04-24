import { icebreakerQuestionSchema, type IcebreakerQuestion } from "../../shared/contracts";
import fallbackQuestions from "./data/icebreakerQuestions.json";

const FALLBACK = icebreakerQuestionSchema.array().parse(fallbackQuestions);

const shuffleInPlace = <T>(items: T[]): T[] => {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
  return items;
};

/**
 * Picks up to `count` questions, preferring items not in `usedIds`. If every
 * question has been used, repeats are allowed from a reshuffled full pool.
 */
export const pickIcebreakerQuestions = (
  usedIds: Set<string>,
  count: number,
  pool: IcebreakerQuestion[] = FALLBACK
): IcebreakerQuestion[] => {
  const unused = pool.filter((q) => !usedIds.has(q.id));
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
