import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  awardRoundAndReveal,
  beginFriendlyFeudPlay,
  createFriendlyFeudGame,
  friendlyFeudBuzz,
  friendlyFeudFaceOffTimeout,
  friendlyFeudSubmitGuess,
  toPublicFriendlyFeudState,
  advanceFriendlyFeudAfterReveal
} from "./friendlyFeudGame";
import * as questions from "./friendlyFeudQuestions";

const TEAM_A = ["a1", "a2", "a3"];
const TEAM_B = ["b1", "b2", "b3"];

describe("friendlyFeudGame", () => {
  beforeEach(() => {
    vi.spyOn(questions, "pickFriendlyFeudQuestions").mockImplementation(() => [
      {
        id: "q1",
        question: "Name something people watch",
        answers: [
          { ans: "TV", pnt: 40 },
          { ans: "Sports", pnt: 25 },
          { ans: "Kids", pnt: 20 }
        ]
      },
      {
        id: "q2",
        question: "Name a fruit",
        answers: [
          { ans: "Apple", pnt: 50 },
          { ans: "Banana", pnt: 30 }
        ]
      },
      {
        id: "q3",
        question: "Name a color",
        answers: [
          { ans: "Blue", pnt: 45 },
          { ans: "Red", pnt: 35 }
        ]
      }
    ]);
  });

  it("hides unrevealed answers in public state", () => {
    const game = createFriendlyFeudGame();
    game.teamAIds = [...TEAM_A];
    game.teamBIds = [...TEAM_B];
    beginFriendlyFeudPlay(game);
    const pub = toPublicFriendlyFeudState(game);
    expect(pub.status).toBe("faceOff");
    if (pub.status !== "faceOff") {
      return;
    }
    expect(pub.question).toContain("watch");
    expect(pub.board.every((slot) => slot.revealed === false)).toBe(true);
    expect(JSON.stringify(pub)).not.toContain("TV");
  });

  it("locks first buzz and rejects others", () => {
    const game = createFriendlyFeudGame();
    game.teamAIds = [...TEAM_A];
    game.teamBIds = [...TEAM_B];
    beginFriendlyFeudPlay(game);
    const openAt = game.buzzOpensAt!;
    expect(() => friendlyFeudBuzz(game, "a1", openAt - 1)).toThrow(/not open yet/i);
    friendlyFeudBuzz(game, "a1", openAt);
    expect(game.buzzedParticipantId).toBe("a1");
    expect(game.answerEndsAt).toBe(openAt + 7_000);
    expect(() => friendlyFeudBuzz(game, "b1", openAt)).toThrow(/already buzzed/i);
  });

  it("awards control on #1 face-off answer and starts play with the next teammate", () => {
    const game = createFriendlyFeudGame();
    game.teamAIds = [...TEAM_A];
    game.teamBIds = [...TEAM_B];
    beginFriendlyFeudPlay(game);
    const openAt = game.buzzOpensAt!;
    friendlyFeudBuzz(game, "a1", openAt);
    friendlyFeudSubmitGuess(game, "a1", "TV");
    expect(game.status).toBe("playBoard");
    expect(game.controllingTeam).toBe("A");
    expect(game.revealed[0]).toBe(true);
    expect(game.pot).toBe(40);
    // Next player after the showdown winner starts board play
    expect(game.currentGuesserId).toBe("a2");
    expect(game.answerEndsAt).toBeNull();
  });

  it("gives the other face-off player a turn when first is not #1", () => {
    const game = createFriendlyFeudGame();
    game.teamAIds = [...TEAM_A];
    game.teamBIds = [...TEAM_B];
    beginFriendlyFeudPlay(game);
    const openAt = game.buzzOpensAt!;
    friendlyFeudBuzz(game, "a1", openAt);
    friendlyFeudSubmitGuess(game, "a1", "Sports", openAt + 1_000);
    expect(game.status).toBe("faceOff");
    expect(game.awaitingSecondAnswer).toBe(true);
    expect(game.answeringParticipantId).toBe("b1");
    expect(game.answerEndsAt).toBe(openAt + 1_000 + 7_000);
    // First non-#1 hit should appear on the board before the second player answers
    expect(game.revealed[1]).toBe(true);
    expect(game.pot).toBe(25);
    expect(game.revealed[2]).toBe(false);
    const pub = toPublicFriendlyFeudState(game);
    expect(pub.status).toBe("faceOff");
    if (pub.status === "faceOff") {
      expect(pub.board[1]).toEqual({ revealed: true, ans: "Sports", pnt: 25 });
      expect(pub.board[2]).toEqual({ revealed: false });
    }
    friendlyFeudSubmitGuess(game, "b1", "Kids");
    expect(game.status).toBe("playBoard");
    expect(game.controllingTeam).toBe("A");
    expect(game.revealed[1]).toBe(true);
    expect(game.revealed[2]).toBe(true);
    // Team A won via face-off player a1 → next teammate a2 guesses first
    expect(game.currentGuesserId).toBe("a2");
  });

  it("treats face-off answer timeout as a miss", () => {
    const game = createFriendlyFeudGame();
    game.teamAIds = [...TEAM_A];
    game.teamBIds = [...TEAM_B];
    beginFriendlyFeudPlay(game);
    const openAt = game.buzzOpensAt!;
    friendlyFeudBuzz(game, "a1", openAt);
    friendlyFeudFaceOffTimeout(game, openAt + 7_000);
    expect(game.awaitingSecondAnswer).toBe(true);
    expect(game.answeringParticipantId).toBe("b1");
    expect(game.lastGuess?.text).toBe("(time's up)");
    expect(game.lastGuess?.correct).toBe(false);
    expect(game.answerEndsAt).toBe(openAt + 7_000 + 7_000);
  });

  it("rotates typers and steals after three strikes", () => {
    const game = createFriendlyFeudGame();
    game.teamAIds = [...TEAM_A];
    game.teamBIds = [...TEAM_B];
    beginFriendlyFeudPlay(game);
    friendlyFeudBuzz(game, "a1", game.buzzOpensAt!);
    friendlyFeudSubmitGuess(game, "a1", "TV");
    expect(game.currentGuesserId).toBe("a2");
    friendlyFeudSubmitGuess(game, "a2", "nope");
    expect(game.strikes).toBe(1);
    expect(game.currentGuesserId).toBe("a3");
    friendlyFeudSubmitGuess(game, "a3", "nope");
    expect(game.strikes).toBe(2);
    expect(game.currentGuesserId).toBe("a1");
    friendlyFeudSubmitGuess(game, "a1", "nope");
    expect(game.status).toBe("steal");
    expect(game.currentGuesserId).toBe("b1");
  });

  it("awards steal points to the stealing team and waits for host continue", () => {
    const game = createFriendlyFeudGame();
    game.teamAIds = [...TEAM_A];
    game.teamBIds = [...TEAM_B];
    beginFriendlyFeudPlay(game);
    friendlyFeudBuzz(game, "a1", game.buzzOpensAt!);
    friendlyFeudSubmitGuess(game, "a1", "TV");
    friendlyFeudSubmitGuess(game, "a2", "x");
    friendlyFeudSubmitGuess(game, "a3", "y");
    friendlyFeudSubmitGuess(game, "a1", "z");
    friendlyFeudSubmitGuess(game, "b1", "Sports");
    expect(game.status).toBe("roundReveal");
    expect(game.awardedTeam).toBe("B");
    expect(game.teamScores.B).toBeGreaterThan(0);
    expect(game.roundResults).toHaveLength(1);
    expect(game.roundResults[0]?.awardedTeam).toBe("B");
    const pub = toPublicFriendlyFeudState(game);
    expect(pub.status).toBe("roundReveal");
    if (pub.status === "roundReveal") {
      expect(pub.board.every((s) => s.revealed)).toBe(true);
      expect("nextRoundStartsAt" in pub).toBe(false);
    }
  });

  it("finishes after three rounds with round recap", () => {
    const game = createFriendlyFeudGame();
    game.teamAIds = [...TEAM_A];
    game.teamBIds = [...TEAM_B];
    beginFriendlyFeudPlay(game);
    for (let r = 0; r < 3; r++) {
      const faceA = game.faceOffPlayerAId!;
      friendlyFeudBuzz(game, faceA, game.buzzOpensAt!);
      const top = game.rounds[r]!.answers[0]!.ans;
      friendlyFeudSubmitGuess(game, faceA, top);
      while (game.status === "playBoard") {
        const guesser = game.currentGuesserId!;
        const nextIdx = game.revealed.findIndex((v) => !v);
        const ans = game.rounds[r]!.answers[nextIdx]!.ans;
        friendlyFeudSubmitGuess(game, guesser, ans);
      }
      expect(game.status).toBe("roundReveal");
      advanceFriendlyFeudAfterReveal(game);
    }
    expect(game.status).toBe("finished");
    expect(game.winnerTeams).toEqual(["A"]);
    expect(game.roundResults).toHaveLength(3);
    const pub = toPublicFriendlyFeudState(game);
    expect(pub.status).toBe("finished");
    if (pub.status === "finished") {
      expect(pub.roundResults).toHaveLength(3);
      expect(pub.roundResults[0]?.question).toContain("watch");
    }
  });

  it("awardRoundAndReveal adds pot to Family Feud team score only", () => {
    const game = createFriendlyFeudGame();
    game.teamAIds = [...TEAM_A];
    game.teamBIds = [...TEAM_B];
    beginFriendlyFeudPlay(game);
    game.pot = 55;
    game.revealed = [true, false, false];
    awardRoundAndReveal(game, "A");
    expect(game.teamScores.A).toBe(55);
    expect(game.status).toBe("roundReveal");
    expect(game.revealed.every(Boolean)).toBe(true);
    expect(game.roundResults).toEqual([
      {
        roundIndex: 0,
        question: "Name something people watch",
        awardedTeam: "A",
        awardedPoints: 55
      }
    ]);
  });
});
