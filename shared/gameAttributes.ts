import { z } from "zod";
import type { GameType } from "./contracts";

export const gameAttributeSchema = z.enum(["scorable", "game", "activity", "team", "short", "long"]);
export type GameAttribute = z.infer<typeof gameAttributeSchema>;

export type GameAttributeDefinition = {
  id: GameAttribute;
  label: string;
  shortLabel: string;
  description: string;
};

/** Display order for legend and consistent scanning. */
export const GAME_ATTRIBUTE_DEFINITIONS: readonly GameAttributeDefinition[] = [
  {
    id: "scorable",
    label: "Scorable points",
    shortLabel: "Scorable",
    description: "Session scoreboard tracks points for this mode."
  },
  {
    id: "game",
    label: "Game",
    shortLabel: "Game",
    description: "Structured rounds with win/lose or clear objectives."
  },
  {
    id: "activity",
    label: "Activity",
    shortLabel: "Activity",
    description: "Conversation-first or creative prompts with lighter structure."
  },
  {
    id: "team",
    label: "Team game",
    shortLabel: "Team",
    description: "Works best when players split into teams or coordinated sides."
  },
  {
    id: "short",
    label: "Shorter time",
    shortLabel: "Short",
    description: "Typically quicker to run end-to-end."
  },
  {
    id: "long",
    label: "Longer time",
    shortLabel: "Long",
    description: "Often needs more time for setup, turns, or discussion."
  }
] as const;

export const GAME_ATTRIBUTES_BY_TYPE: Record<GameType, readonly GameAttribute[]> = {
  hangman: ["scorable", "game", "short"],
  twoTruthsLie: ["activity", "scorable", "long"],
  trivia: ["scorable", "game", "short"],
  wouldYouRather: ["activity", "short"],
  icebreaker: ["activity", "long"],
  guessWhoSaidIt: ["scorable", "game", "long"],
  guessTheImage: ["scorable", "game", "long"],
  twentyQuestions: ["scorable", "game", "team", "long"],
  captionThis: ["activity", "long"],
  pictionary: ["scorable", "game", "team", "long"],
  applesToApples: ["scorable", "game", "long"],
  uno: ["scorable", "game", "long"],
  bs: ["scorable", "game", "long"],
  madlibs: ["activity", "short"],
  catchPhrase: ["scorable", "game", "team", "long"],
  yahtzee: ["scorable", "game", "short"],
  scattergories: ["scorable", "game", "long"],
  storyBuilder: ["activity", "long"],
  memory: ["scorable", "game", "short"],
  wordle: ["scorable", "game", "short"],
  monopolyDeal: ["scorable", "game", "short"],
  splendor: ["scorable", "game", "long"],
  friendlyFeud: ["scorable", "game", "team", "long"]
};

export function getGameAttributes(game: GameType): readonly GameAttribute[] {
  return GAME_ATTRIBUTES_BY_TYPE[game];
}
