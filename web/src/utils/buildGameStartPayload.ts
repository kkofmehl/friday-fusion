import {
  PICTORY_ROUND_DURATION_MAX_MS,
  PICTORY_ROUND_DURATION_MIN_MS,
  type ApplesToApplesMode,
  type GameStartOptions,
  type GameType,
  type HangmanMode,
  type MemoryBoardSize,
  type StoryBuilderMode,
  type YahtzeeMode
} from "../../../shared/contracts";

export const GUESS_IMAGE_LOBBY_EVERYONE = "everyone";

export type LobbyGameOptions = {
  hangmanMode: HangmanMode;
  hangmanCreatorId: string;
  guessImagePreparer: string;
  twentyQSelectorId: string;
  twentyQMaxQuestions: number;
  captionThisProviderId: string;
  pictionaryDrawSecs: number;
  applesMode: ApplesToApplesMode;
  yahtzeeMode: YahtzeeMode;
  wouldYouRatherQuestions: number;
  wouldYouRatherAllowSubmissions: boolean;
  storyBuilderMode: StoryBuilderMode;
  storyBuilderFirstTurnId: string;
  memoryBoardSize: MemoryBoardSize;
};

export function buildGameStartPayload(
  game: GameType,
  options: LobbyGameOptions
): { game: GameType; options?: GameStartOptions } {
  if (game === "hangman") {
    return {
      game,
      options: { hangmanMode: options.hangmanMode, hangmanCreatorId: options.hangmanCreatorId }
    };
  }
  if (game === "guessTheImage") {
    if (options.guessImagePreparer === GUESS_IMAGE_LOBBY_EVERYONE) {
      return { game, options: { guessImageSetupMode: "everyone" } };
    }
    return { game, options: { guessImageSetupParticipantId: options.guessImagePreparer } };
  }
  if (game === "twentyQuestions") {
    const maxQ = Math.min(50, Math.max(1, Math.floor(options.twentyQMaxQuestions) || 20));
    return {
      game,
      options: {
        twentyQuestionsItemSelectorId: options.twentyQSelectorId,
        twentyQuestionsMaxQuestions: maxQ
      }
    };
  }
  if (game === "captionThis") {
    return { game, options: { captionThisImageProviderId: options.captionThisProviderId } };
  }
  if (game === "pictionary") {
    const minSec = PICTORY_ROUND_DURATION_MIN_MS / 1000;
    const maxSec = PICTORY_ROUND_DURATION_MAX_MS / 1000;
    const sec = Math.min(maxSec, Math.max(minSec, Math.floor(options.pictionaryDrawSecs) || minSec));
    return { game, options: { pictionaryRoundDurationMs: sec * 1000 } };
  }
  if (game === "applesToApples") {
    return { game, options: { applesToApplesMode: options.applesMode } };
  }
  if (game === "yahtzee") {
    return { game, options: { yahtzeeMode: options.yahtzeeMode } };
  }
  if (game === "wouldYouRather") {
    const totalQuestions = Math.max(1, Math.min(200, Math.floor(options.wouldYouRatherQuestions) || 10));
    return {
      game,
      options: {
        wouldYouRatherTotalQuestions: totalQuestions,
        wouldYouRatherAllowParticipantSubmissions: options.wouldYouRatherAllowSubmissions
      }
    };
  }
  if (game === "storyBuilder") {
    return {
      game,
      options: {
        storyBuilderMode: options.storyBuilderMode,
        storyBuilderFirstTurnParticipantId: options.storyBuilderFirstTurnId
      }
    };
  }
  if (game === "memory") {
    return { game, options: { memoryBoardSize: options.memoryBoardSize } };
  }
  return { game };
}

export function describeQueuedGameOptions(
  game: GameType,
  options: GameStartOptions | undefined
): string | null {
  if (!options) {
    return null;
  }
  if (game === "hangman" && options.hangmanMode) {
    return options.hangmanMode === "team" ? "Team vs host" : "Turn-based";
  }
  if (game === "memory" && options.memoryBoardSize) {
    return `${options.memoryBoardSize} cards`;
  }
  if (game === "yahtzee" && options.yahtzeeMode) {
    return options.yahtzeeMode === "turns" ? "Turn-based" : "Simultaneous";
  }
  if (game === "applesToApples" && options.applesToApplesMode) {
    return options.applesToApplesMode === "standard" ? "Standard" : "Finite deck";
  }
  if (game === "storyBuilder" && options.storyBuilderMode) {
    return options.storyBuilderMode === "stock" ? "Story starter" : "From scratch";
  }
  if (game === "wouldYouRather" && options.wouldYouRatherTotalQuestions) {
    return `${options.wouldYouRatherTotalQuestions} questions`;
  }
  if (game === "twentyQuestions" && options.twentyQuestionsMaxQuestions) {
    return `${options.twentyQuestionsMaxQuestions} questions max`;
  }
  if (game === "guessTheImage" && options.guessImageSetupMode === "everyone") {
    return "Everyone prepares";
  }
  return null;
}
