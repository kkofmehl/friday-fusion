import { describe, expect, it } from "vitest";
import { buildGameStartPayload } from "./buildGameStartPayload";

const baseOptions = {
  hangmanMode: "turns" as const,
  hangmanCreatorId: "p2",
  guessImagePreparer: "p1",
  twentyQSelectorId: "p1",
  twentyQMaxQuestions: 20,
  captionThisProviderId: "p1",
  pictionaryDrawSecs: 60,
  applesMode: "standard" as const,
  yahtzeeMode: "turns" as const,
  wouldYouRatherQuestions: 10,
  wouldYouRatherAllowSubmissions: true,
  storyBuilderMode: "stock" as const,
  storyBuilderFirstTurnId: "p1",
  memoryBoardSize: "36" as const
};

describe("buildGameStartPayload", () => {
  it("builds hangman start payload from lobby options", () => {
    expect(buildGameStartPayload("hangman", baseOptions)).toEqual({
      game: "hangman",
      options: { hangmanMode: "turns", hangmanCreatorId: "p2" }
    });
  });

  it("builds memory start payload from lobby options", () => {
    expect(buildGameStartPayload("memory", baseOptions)).toEqual({
      game: "memory",
      options: { memoryBoardSize: "36" }
    });
  });
});
