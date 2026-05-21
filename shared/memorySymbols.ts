/** Friday Fusion lobby game icons used as Memory card faces. */
export type MemorySymbolEntry = {
  id: string;
  iconSrc: string;
};

export const MEMORY_SYMBOL_CATALOG: readonly MemorySymbolEntry[] = [
  { id: "hangman", iconSrc: "/game_icons/hangman.png" },
  { id: "twoTruthsLie", iconSrc: "/game_icons/two_truths_and_one_lie.png" },
  { id: "trivia", iconSrc: "/game_icons/trivia.png" },
  { id: "wouldYouRather", iconSrc: "/game_icons/would_you_rather.png" },
  { id: "icebreaker", iconSrc: "/game_icons/ice_breaker_questions.png" },
  { id: "guessWhoSaidIt", iconSrc: "/game_icons/guess_who_said_it.png" },
  { id: "guessTheImage", iconSrc: "/game_icons/guess_the_image.png" },
  { id: "twentyQuestions", iconSrc: "/game_icons/20_questions.png" },
  { id: "captionThis", iconSrc: "/game_icons/caption_this.png" },
  { id: "pictionary", iconSrc: "/game_icons/pictionary.png" },
  { id: "applesToApples", iconSrc: "/game_icons/apples_to_apples.png" },
  { id: "uno", iconSrc: "/game_icons/uno.png" },
  { id: "bs", iconSrc: "/game_icons/bs.png" },
  { id: "madlibs", iconSrc: "/game_icons/madlibs.png" },
  { id: "catchPhrase", iconSrc: "/game_icons/catchphrase.png" },
  { id: "yahtzee", iconSrc: "/game_icons/yahtzee.png" },
  { id: "scattergories", iconSrc: "/game_icons/scattegories.png" },
  { id: "storyBuilder", iconSrc: "/game_icons/story_builder.png" },
  { id: "memory", iconSrc: "/game_icons/memory.png" }
] as const;

export const MEMORY_MAX_PAIRS = MEMORY_SYMBOL_CATALOG.length;

const MEMORY_SYMBOL_BY_ID: ReadonlyMap<string, MemorySymbolEntry> = new Map(
  MEMORY_SYMBOL_CATALOG.map((entry) => [entry.id, entry])
);

export function getMemorySymbolById(id: string): MemorySymbolEntry | undefined {
  return MEMORY_SYMBOL_BY_ID.get(id);
}
