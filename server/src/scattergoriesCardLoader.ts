import { z } from "zod";
import type { ScattergoriesListSummary } from "../../shared/contracts";
import fallbackLists from "./data/scattergoriesLists.json";

export const scattergoriesListSchema = z.object({
  id: z.string(),
  title: z.string(),
  prompts: z.array(z.string()).min(1)
});

export type ScattergoriesList = z.infer<typeof scattergoriesListSchema>;

const LISTS = scattergoriesListSchema.array().parse(fallbackLists);

const shuffleInPlace = <T>(items: T[]): T[] => {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
  return items;
};

export const SCATTERGORIES_LETTERS = [
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "H",
  "I",
  "J",
  "K",
  "L",
  "M",
  "N",
  "O",
  "P",
  "R",
  "S",
  "T",
  "W"
] as const;

export const getScattergoriesListSummaries = (): ScattergoriesListSummary[] =>
  LISTS.map(({ id, title }) => ({ id, title }));

export const getScattergoriesListById = (id: string): ScattergoriesList | undefined =>
  LISTS.find((list) => list.id === id);

export const pickScattergoriesList = (usedIds: Set<string>): ScattergoriesList => {
  const unused = LISTS.filter((list) => !usedIds.has(list.id));
  shuffleInPlace(unused);
  if (unused.length > 0) {
    return unused[0]!;
  }
  const recycled = [...LISTS];
  shuffleInPlace(recycled);
  return recycled[0]!;
};

export const pickScattergoriesLetter = (usedLetters: Set<string>): string => {
  const unused = SCATTERGORIES_LETTERS.filter((letter) => !usedLetters.has(letter));
  if (unused.length > 0) {
    return unused[Math.floor(Math.random() * unused.length)]!;
  }
  return SCATTERGORIES_LETTERS[Math.floor(Math.random() * SCATTERGORIES_LETTERS.length)]!;
};
