import {
  applesToApplesLibraryCardSchema,
  type ApplesToApplesLibraryCard
} from "../../shared/contracts";
import fallbackTopics from "./data/applesToApplesTopics.json";
import fallbackResponses from "./data/applesToApplesResponses.json";

const TOPICS = applesToApplesLibraryCardSchema.array().parse(fallbackTopics);
const RESPONSES = applesToApplesLibraryCardSchema.array().parse(fallbackResponses);

const shuffleInPlace = <T>(items: T[]): T[] => {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
  return items;
};

export const getApplesToApplesTopics = (): ApplesToApplesLibraryCard[] => TOPICS;
export const getApplesToApplesResponses = (): ApplesToApplesLibraryCard[] => RESPONSES;

const RESPONSE_TEXT_BY_ID = new Map(RESPONSES.map((c) => [c.id, c.text] as const));

export const getApplesResponseText = (id: string): string | undefined => RESPONSE_TEXT_BY_ID.get(id);

/**
 * Picks the next topic, preferring unused ids; reshuffles full pool when exhausted.
 */
export const pickApplesTopic = (usedIds: Set<string>): ApplesToApplesLibraryCard => {
  const unused = TOPICS.filter((t) => !usedIds.has(t.id));
  shuffleInPlace(unused);
  if (unused.length > 0) {
    return unused[0]!;
  }
  const recycled = [...TOPICS];
  shuffleInPlace(recycled);
  return recycled[0]!;
};

/** Shuffled copy of all response card ids (for dealing). */
export const shuffledResponseCardIds = (): string[] => {
  const ids = RESPONSES.map((c) => c.id);
  shuffleInPlace(ids);
  return ids;
};
