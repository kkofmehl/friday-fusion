import { describe, expect, it, vi } from "vitest";
import { trivialPursuitStateSchema } from "../../shared/contracts";
import {
  TRIVIAL_PURSUIT_CLOCK_DURATION_MS,
  TRIVIAL_PURSUIT_HUB_ID,
  TRIVIAL_PURSUIT_SHOW_QUESTION_CLOCK_DELAY_MS
} from "../../shared/trivialPursuitLogic";
import {
  createTrivialPursuitGame,
  detachTrivialPursuitPlayer,
  toPublicTrivialPursuitState,
  trivialPursuitChooseFinalCategory,
  trivialPursuitJudge,
  trivialPursuitMove,
  trivialPursuitReveal,
  trivialPursuitRequestChoices,
  trivialPursuitRoll,
  trivialPursuitShowQuestion,
  trivialPursuitStartClock,
  type TrivialPursuitGameInternal
} from "./trivialPursuitGame";
import type { TrivialPursuitQuestion } from "./trivialPursuitQuestions";

const apiQuestion = (
  category: string,
  id: string,
  text: string,
  answer: string
): Record<string, unknown> => ({
  id,
  type: "text_choice",
  category,
  question: { text },
  correctAnswer: answer,
  incorrectAnswers: ["A", "B", "C"]
});

const mockFetchAllCategories = (): typeof fetch => {
  let n = 0;
  return vi.fn(async (url: string) => {
    n += 1;
    const u = String(url);
    const cat =
      u.includes("geography")
        ? "geography"
        : u.includes("history")
          ? "history"
          : u.includes("arts_and_literature")
            ? "arts"
            : u.includes("film_and_tv")
              ? "ent"
              : u.includes("sport_and_leisure")
                ? "sport"
                : "science";
    const questions = Array.from({ length: 8 }, (_, i) =>
      apiQuestion(cat, `${cat}-${n}-${i}`, `Question ${cat} ${i}?`, `Answer ${i}`)
    );
    return { ok: true, json: async () => questions };
  }) as unknown as typeof fetch;
};

describe("trivialPursuitGame", () => {
  it("creates a game and never assigns the contestant as reader", async () => {
    const game = await createTrivialPursuitGame({
      playerOrder: ["p1", "p2", "p3"],
      fetchImpl: mockFetchAllCategories()
    });
    expect(game.status).toBe("playing");
    expect(game.phase).toBe("rolling");
    expect(game.playerOrder).toHaveLength(3);

    // Force a known turn and move onto a category space via die+move.
    game.currentTurnId = "p1";
    game.phase = "choosingMove";
    game.lastDieRoll = 1;
    game.legalMoveSpaceIds = ["spoke-0-0"];
    trivialPursuitMove(game, "p1", "spoke-0-0", () => 0);
    expect(game.phase).toBe("reading");
    expect(game.readerId).not.toBe("p1");
    expect(game.readerId).toBe("p2");
  });

  it("shows the question only to the reader until show-question", async () => {
    const game = await createTrivialPursuitGame({
      playerOrder: ["p1", "p2"],
      fetchImpl: mockFetchAllCategories()
    });
    game.currentTurnId = "p1";
    game.phase = "choosingMove";
    game.lastDieRoll = 1;
    game.legalMoveSpaceIds = ["spoke-0-0"];
    trivialPursuitMove(game, "p1", "spoke-0-0", () => 0);

    const forReader = toPublicTrivialPursuitState(game, game.readerId!);
    const forAnswerer = toPublicTrivialPursuitState(game, "p1");
    expect(forReader.activeQuestion?.text).toBeTruthy();
    expect(forAnswerer.activeQuestion?.text).toBeNull();
    expect(forReader.activeQuestion?.correctAnswer).toBeNull();
    expect(forReader.activeQuestion?.choices).toHaveLength(4);
    expect(forAnswerer.activeQuestion?.choices).toBeNull();

    trivialPursuitShowQuestion(game, game.readerId!, 1_000);
    const afterShow = toPublicTrivialPursuitState(game, "p1");
    expect(afterShow.activeQuestion?.text).toBeTruthy();
    expect(afterShow.activeQuestion?.correctAnswer).toBeNull();
    // Answerer still should not see choices until they spend a choice help.
    expect(afterShow.activeQuestion?.choices).toBeNull();
    expect(afterShow.players.find((p) => p.participantId === "p1")?.choiceHelpsRemaining).toBe(5);

    expect(() => trivialPursuitRequestChoices(game, game.readerId!, 1_500)).toThrow(/answering/i);

    trivialPursuitRequestChoices(game, "p1", 1_500);
    const afterChoices = toPublicTrivialPursuitState(game, "p1");
    expect(afterChoices.activeQuestion?.choices).toHaveLength(4);
    expect(afterChoices.activeQuestion?.correctAnswer).toBeNull();
    expect(afterChoices.players.find((p) => p.participantId === "p1")?.choiceHelpsRemaining).toBe(4);

    trivialPursuitReveal(game, game.readerId!);
    const afterReveal = toPublicTrivialPursuitState(game, "p1");
    expect(afterReveal.activeQuestion?.choices).toHaveLength(4);
    expect(afterReveal.activeQuestion?.correctAnswer).toBeTruthy();
  });

  it("limits each player to 5 choice helps per game", async () => {
    const game = await createTrivialPursuitGame({
      playerOrder: ["p1", "p2"],
      fetchImpl: mockFetchAllCategories()
    });
    game.currentTurnId = "p1";
    game.players.p1!.choiceHelpsRemaining = 0;
    game.phase = "reading";
    game.readerId = "p2";
    game.activeCategory = "geography";
    game.activeQuestion = {
      id: "q1",
      category: "geography",
      text: "Capital?",
      correctAnswer: "Paris",
      incorrectAnswers: ["A", "B", "C"],
      choices: ["Paris", "A", "B", "C"]
    } as TrivialPursuitQuestion;
    expect(() => trivialPursuitRequestChoices(game, "p1")).toThrow(/used all/i);
  });

  it("rejects clock before 10s and ignores expiry for judging", async () => {
    const game = await createTrivialPursuitGame({
      playerOrder: ["p1", "p2"],
      fetchImpl: mockFetchAllCategories()
    });
    game.currentTurnId = "p1";
    game.phase = "choosingMove";
    game.lastDieRoll = 1;
    game.legalMoveSpaceIds = ["spoke-0-0"];
    trivialPursuitMove(game, "p1", "spoke-0-0", () => 0);
    const reader = game.readerId!;
    const t0 = 10_000;
    trivialPursuitShowQuestion(game, reader, t0);
    expect(() => trivialPursuitStartClock(game, reader, t0 + 5_000)).toThrow(/10 seconds/i);

    trivialPursuitStartClock(
      game,
      reader,
      t0 + TRIVIAL_PURSUIT_SHOW_QUESTION_CLOCK_DELAY_MS
    );
    expect(game.clockEndsAt).toBe(
      t0 + TRIVIAL_PURSUIT_SHOW_QUESTION_CLOCK_DELAY_MS + TRIVIAL_PURSUIT_CLOCK_DURATION_MS
    );

    // Clock expiry does not change phase; reveal/judge still work.
    game.clockEndsAt = t0;
    trivialPursuitReveal(game, reader);
    expect(game.phase).toBe("judging");
    trivialPursuitJudge(game, reader, false);
    expect(game.phase).toBe("rolling");
    expect(game.currentTurnId).toBe("p2");
  });

  it("only the reader can reveal and judge; correct at HQ awards a wedge", async () => {
    const game = await createTrivialPursuitGame({
      playerOrder: ["p1", "p2"],
      fetchImpl: mockFetchAllCategories(),
      wedgeMode: "classic"
    });
    expect(game.wedgeMode).toBe("classic");
    game.currentTurnId = "p1";
    game.players.p1!.spaceId = "spoke-0-3";
    game.phase = "choosingMove";
    game.lastDieRoll = 1;
    game.legalMoveSpaceIds = ["hq-0"];
    trivialPursuitMove(game, "p1", "hq-0", () => 0);
    const reader = game.readerId!;
    expect(() => trivialPursuitReveal(game, "p1")).toThrow(/reader/i);
    trivialPursuitReveal(game, reader);
    expect(toPublicTrivialPursuitState(game, "p2").activeQuestion?.correctAnswer).toBeTruthy();
    trivialPursuitJudge(game, reader, true);
    expect(game.players.p1!.wedges.geography).toBe(true);
    expect(game.phase).toBe("rolling");
    expect(game.currentTurnId).toBe("p1");
  });

  it("classic mode does not award a wedge on a regular category space", async () => {
    const game = await createTrivialPursuitGame({
      playerOrder: ["p1", "p2"],
      fetchImpl: mockFetchAllCategories(),
      wedgeMode: "classic"
    });
    game.currentTurnId = "p1";
    game.players.p1!.spaceId = TRIVIAL_PURSUIT_HUB_ID;
    game.phase = "choosingMove";
    game.lastDieRoll = 1;
    game.legalMoveSpaceIds = ["spoke-0-0"];
    trivialPursuitMove(game, "p1", "spoke-0-0", () => 0);
    // spoke-0-0 is sportsAndLeisure on the Master Edition spoke layout
    expect(game.activeCategory).toBe("sportsAndLeisure");
    const reader = game.readerId!;
    trivialPursuitReveal(game, reader);
    trivialPursuitJudge(game, reader, true);
    expect(game.players.p1!.wedges.sportsAndLeisure).toBe(false);
    expect(game.lastOutcome).toMatch(/roll again/i);
    expect(game.currentTurnId).toBe("p1");
  });

  it("fast mode awards a wedge on any correct category answer, then only roll-again once owned", async () => {
    const game = await createTrivialPursuitGame({
      playerOrder: ["p1", "p2"],
      fetchImpl: mockFetchAllCategories(),
      wedgeMode: "fast"
    });
    expect(game.wedgeMode).toBe("fast");
    game.currentTurnId = "p1";
    game.players.p1!.spaceId = TRIVIAL_PURSUIT_HUB_ID;
    game.phase = "choosingMove";
    game.lastDieRoll = 1;
    game.legalMoveSpaceIds = ["spoke-0-0"];
    trivialPursuitMove(game, "p1", "spoke-0-0", () => 0);
    expect(game.activeCategory).toBe("sportsAndLeisure");
    let reader = game.readerId!;
    trivialPursuitReveal(game, reader);
    trivialPursuitJudge(game, reader, true);
    expect(game.players.p1!.wedges.sportsAndLeisure).toBe(true);
    expect(game.lastOutcome).toMatch(/wedge earned/i);

    // Land again on sportsAndLeisure via ring-5-0 (category space after Science HQ)
    game.players.p1!.spaceId = "hq-5";
    game.phase = "choosingMove";
    game.lastDieRoll = 1;
    game.legalMoveSpaceIds = ["ring-5-0"];
    trivialPursuitMove(game, "p1", "ring-5-0", () => 0);
    expect(game.activeCategory).toBe("sportsAndLeisure");
    reader = game.readerId!;
    trivialPursuitReveal(game, reader);
    trivialPursuitJudge(game, reader, true);
    expect(game.players.p1!.wedges.sportsAndLeisure).toBe(true);
    expect(game.lastOutcome).toBe("Correct — roll again.");
    expect(game.currentTurnId).toBe("p1");
  });

  it("roll-again space skips the reader and keeps the turn", async () => {
    const game = await createTrivialPursuitGame({
      playerOrder: ["p1", "p2"],
      fetchImpl: mockFetchAllCategories()
    });
    game.currentTurnId = "p1";
    game.players.p1!.spaceId = "ring-0-0";
    game.phase = "choosingMove";
    game.lastDieRoll = 1;
    game.legalMoveSpaceIds = ["ring-0-1"];
    trivialPursuitMove(game, "p1", "ring-0-1", () => 0);
    expect(game.phase).toBe("rolling");
    expect(game.currentTurnId).toBe("p1");
    expect(game.readerId).toBeNull();
  });

  it("reassigns the reader when the reader leaves", async () => {
    const game = await createTrivialPursuitGame({
      playerOrder: ["p1", "p2", "p3"],
      fetchImpl: mockFetchAllCategories()
    });
    game.currentTurnId = "p1";
    game.phase = "choosingMove";
    game.lastDieRoll = 1;
    game.legalMoveSpaceIds = ["spoke-0-0"];
    trivialPursuitMove(game, "p1", "spoke-0-0", () => 0);
    const oldReader = game.readerId!;
    expect(oldReader).toBe("p2");
    detachTrivialPursuitPlayer(game, "p2", () => 0.9);
    expect(game.readerId).toBe("p3");
    expect(game.phase).toBe("reading");
  });

  it("wins on a correct final hub answer", async () => {
    const game = await createTrivialPursuitGame({
      playerOrder: ["p1", "p2"],
      fetchImpl: mockFetchAllCategories()
    });
    game.currentTurnId = "p1";
    const wedges = game.players.p1!.wedges;
    for (const key of Object.keys(wedges) as (keyof typeof wedges)[]) {
      wedges[key] = true;
    }
    game.players.p1!.spaceId = "spoke-0-0";
    game.phase = "choosingMove";
    game.lastDieRoll = 1;
    game.legalMoveSpaceIds = [TRIVIAL_PURSUIT_HUB_ID];
    trivialPursuitMove(game, "p1", TRIVIAL_PURSUIT_HUB_ID, () => 0);
    expect(game.phase).toBe("choosingFinalCategory");
    expect(game.finalCategoryChooserId).toBe("p2");
    trivialPursuitChooseFinalCategory(game, "p2", "geography", () => 0);
    const reader = game.readerId!;
    trivialPursuitReveal(game, reader);
    trivialPursuitJudge(game, reader, true);
    expect(game.status).toBe("finished");
    expect(game.winnerParticipantId).toBe("p1");
  });

  it("emits schema-valid public state after turn pass even if wedgeMode was missing", async () => {
    const game = await createTrivialPursuitGame({
      playerOrder: ["p1", "p2"],
      fetchImpl: mockFetchAllCategories(),
      wedgeMode: "fast"
    });
    // Simulate a hot-reload / legacy in-memory game missing the field.
    delete (game as { wedgeMode?: TrivialPursuitGameInternal["wedgeMode"] }).wedgeMode;
    game.currentTurnId = "p1";
    game.players.p1!.spaceId = TRIVIAL_PURSUIT_HUB_ID;
    game.phase = "choosingMove";
    game.lastDieRoll = 1;
    game.legalMoveSpaceIds = ["spoke-0-0"];
    trivialPursuitMove(game, "p1", "spoke-0-0", () => 0);
    const reader = game.readerId!;
    trivialPursuitReveal(game, reader);
    trivialPursuitJudge(game, reader, false);
    expect(game.phase).toBe("rolling");
    expect(game.currentTurnId).toBe("p2");

    const forNext = toPublicTrivialPursuitState(game, "p2");
    expect(forNext.wedgeMode).toBe("fast");
    expect(forNext.phase).toBe("rolling");
    expect(forNext.currentTurnId).toBe("p2");
    expect(trivialPursuitStateSchema.safeParse(forNext).success).toBe(true);

    trivialPursuitRoll(game, "p2");
    const afterRoll = toPublicTrivialPursuitState(game, "p2");
    expect(afterRoll.phase).toBe("choosingMove");
    expect(afterRoll.legalMoveSpaceIds.length).toBeGreaterThan(0);
    expect(trivialPursuitStateSchema.safeParse(afterRoll).success).toBe(true);
  });

  it("allows roll after creating a game", async () => {
    const game = await createTrivialPursuitGame({
      playerOrder: ["p1", "p2"],
      fetchImpl: mockFetchAllCategories()
    });
    const turn = game.currentTurnId!;
    trivialPursuitRoll(game, turn);
    expect(game.phase).toBe("choosingMove");
    expect(game.lastDieRoll).toBeGreaterThanOrEqual(1);
    expect(game.legalMoveSpaceIds.length).toBeGreaterThan(0);
  });
});

// silence unused import in case tree-shaking complains in older tooling
void (0 as unknown as TrivialPursuitQuestion);
