import { describe, expect, it } from "vitest";
import {
  WHEEL_OF_FORTUNE_ROUNDS,
  WHEEL_OF_FORTUNE_VOWEL_COST
} from "../../shared/wheelOfFortuneLogic";
import {
  applyWheelOfFortuneScores,
  bonusPickLetters,
  bonusSolve,
  bonusTimedOut,
  buyVowel,
  callConsonant,
  continueAfterRound,
  createWheelOfFortuneGame,
  detachWheelOfFortunePlayer,
  respondFreeSpin,
  setWheelOfFortunePuzzles,
  settleWheelSpin,
  solvePuzzle,
  startWheelSpin,
  toPublicWheelOfFortuneState
} from "./wheelOfFortuneGame";

const samplePuzzles = () => [
  { id: "p1", category: "Phrase", answer: "HELLO WORLD" },
  { id: "p2", category: "Thing", answer: "COFFEE MUG" },
  { id: "p3", category: "Place", answer: "NEW YORK" },
  { id: "p4", category: "Person", answer: "ADA LOVELACE" },
  { id: "p5", category: "Phrase", answer: "BEST OF LUCK" }
];

const bankGame = (players = ["a", "b", "c"]) =>
  createWheelOfFortuneGame({
    playerOrder: players,
    puzzleSource: "bank",
    puzzles: samplePuzzles(),
    usedPuzzleIds: []
  });

describe("wheelOfFortuneGame", () => {
  it("starts bank games in playing with masked board", () => {
    const game = bankGame();
    expect(game.status).toBe("playing");
    const pub = toPublicWheelOfFortuneState(game);
    expect(pub.status).toBe("playing");
    if (pub.status === "playing") {
      expect(pub.maskedBoard).toBe("_____ _____");
      expect(pub.category).toBe("Phrase");
      expect(pub.currentTurnId).toBe("a");
      expect(pub.roundIndex).toBe(1);
    }
  });

  it("starts custom games in setup until puzzles are set", () => {
    const game = createWheelOfFortuneGame({
      playerOrder: ["a", "b"],
      puzzleSource: "custom"
    });
    expect(game.status).toBe("setup");
    setWheelOfFortunePuzzles(game, samplePuzzles());
    expect(game.status).toBe("playing");
  });

  it("spins with sync fields then settles to awaiting letter or penalty", () => {
    const game = bankGame();
    startWheelSpin(game, "a", 1_000);
    expect(game.status).toBe("spinning");
    expect(game.spinStartedAt).toBe(1_000);
    expect(game.spinEndsAt).toBeGreaterThan(1_000);
    expect(game.targetWedgeIndex).toBeGreaterThanOrEqual(0);
    expect(game.finalRotationDeg).toBeGreaterThan(0);
    // Force a cash wedge for settle path.
    game.targetWedgeIndex = 1; // $800
    settleWheelSpin(game);
    expect(game.status).toBe("playing");
    expect(game.phase).toBe("awaitingLetter");
    expect(game.pendingWedgeIndex).toBe(1);
  });

  it("multiplies consonant value and continues turn", () => {
    const game = bankGame();
    game.phase = "awaitingLetter";
    game.pendingWedgeIndex = 1; // $800
    callConsonant(game, "a", "L");
    expect(game.roundMoney.a).toBe(2400); // L appears 3× in HELLO WORLD
    expect(game.phase).toBe("awaitingAction");
    expect(game.revealedLetters).toContain("L");
  });

  it("ends turn on miss and bankrupt wipes round money", () => {
    const game = bankGame();
    game.roundMoney.a = 900;
    game.phase = "awaitingLetter";
    game.pendingWedgeIndex = 1;
    callConsonant(game, "a", "Z");
    expect(game.currentTurnId).toBe("b");
    expect(game.roundMoney.a).toBe(900);

    game.currentTurnId = "a";
    game.phase = "awaitingAction";
    startWheelSpin(game, "a");
    game.targetWedgeIndex = 20; // BANKRUPT
    settleWheelSpin(game);
    expect(game.roundMoney.a).toBe(0);
    expect(game.currentTurnId).toBe("b");
  });

  it("buys vowels for $250 and solves banks only the solver", () => {
    const game = bankGame();
    game.roundMoney.a = 1000;
    game.roundMoney.b = 700;
    buyVowel(game, "a", "E");
    expect(game.roundMoney.a).toBe(1000 - WHEEL_OF_FORTUNE_VOWEL_COST);
    expect(game.revealedLetters).toContain("E");

    game.phase = "awaitingAction";
    solvePuzzle(game, "a", "hello world");
    expect(game.phase).toBe("roundSolved");
    // 750 round money floors to $1000; opponent round money wiped
    expect(game.bankedMoney.a).toBe(1000);
    expect(game.roundMoney.b).toBe(0);
  });

  it("banks with $1000 floor on solve", () => {
    const game = bankGame();
    game.roundMoney.a = 400;
    solvePuzzle(game, "a", "HELLO WORLD");
    expect(game.bankedMoney.a).toBe(1000);
    expect(game.roundMoney.b).toBe(0);
  });

  it("awards free spin token on free-spin wedge hit", () => {
    const game = bankGame();
    game.phase = "awaitingLetter";
    game.pendingWedgeIndex = 18; // $600 + free spin
    callConsonant(game, "a", "L");
    expect(game.freeSpinTokens.a).toBe(1);
    expect(game.roundMoney.a).toBe(1800); // $600 × 3 L's
  });

  it("uses free spin to continue after a miss", () => {
    const game = bankGame();
    game.freeSpinTokens.a = 1;
    game.phase = "awaitingLetter";
    game.pendingWedgeIndex = 1;
    callConsonant(game, "a", "Z");
    expect(game.phase).toBe("freeSpinPrompt");
    respondFreeSpin(game, "a", true);
    expect(game.freeSpinTokens.a).toBe(0);
    expect(game.phase).toBe("awaitingAction");
    expect(game.currentTurnId).toBe("a");
  });

  it("advances through four rounds into bonus then scores FF", () => {
    const game = bankGame();
    for (let r = 0; r < WHEEL_OF_FORTUNE_ROUNDS; r++) {
      game.roundMoney.a = 2000;
      solvePuzzle(game, "a", game.puzzles[r]!.answer);
      continueAfterRound(game);
    }
    expect(game.status).toBe("bonusLetterPick");
    expect(game.bonusPlayerId).toBe("a");
    bonusPickLetters(game, "a", ["C", "D", "M"], "O");
    expect(game.status).toBe("bonusSolve");
    bonusSolve(game, "a", "BEST OF LUCK");
    expect(game.status).toBe("finished");
    expect(game.bonusSolved).toBe(true);

    const awards: Record<string, number> = {};
    const result = applyWheelOfFortuneScores(game, (id, pts) => {
      awards[id] = (awards[id] ?? 0) + pts;
    }, 3);
    expect(result.moneyAwards.a).toBe(80); // 8000 / 100
    expect(result.bonusAward).toBe(6);
    expect(awards.a).toBe(86);
    // Idempotent
    applyWheelOfFortuneScores(game, () => {
      throw new Error("should not award twice");
    }, 3);
  });

  it("bonus timeout finishes unsolved", () => {
    const game = bankGame();
    game.bankedMoney.a = 5000;
    for (let r = 0; r < WHEEL_OF_FORTUNE_ROUNDS; r++) {
      game.roundMoney.a = 1000;
      solvePuzzle(game, "a", game.puzzles[r]!.answer);
      continueAfterRound(game);
    }
    bonusPickLetters(game, "a", ["B", "C", "D"], "I");
    bonusTimedOut(game);
    expect(game.status).toBe("finished");
    expect(game.bonusSolved).toBe(false);
  });

  it("leave mid-turn advances order but keeps money maps", () => {
    const game = bankGame();
    game.bankedMoney.a = 3000;
    game.roundMoney.a = 500;
    startWheelSpin(game, "a");
    const result = detachWheelOfFortunePlayer(game, "a");
    expect(result.finished).toBe(false);
    expect(game.playerOrder).toEqual(["b", "c"]);
    expect(game.bankedMoney.a).toBe(3000);
    expect(game.roundMoney.a).toBe(500);
    expect(game.status).toBe("playing");
    expect(game.currentTurnId).toBe("b");
  });

  it("leave during bonus ends the game without deleting money", () => {
    const game = bankGame();
    game.bankedMoney.a = 4000;
    game.bankedMoney.b = 1000;
    for (let r = 0; r < WHEEL_OF_FORTUNE_ROUNDS; r++) {
      game.roundMoney.a = 1000;
      solvePuzzle(game, "a", game.puzzles[r]!.answer);
      continueAfterRound(game);
    }
    expect(game.status).toBe("bonusLetterPick");
    const before = game.bankedMoney.a;
    detachWheelOfFortunePlayer(game, "a");
    expect(game.status).toBe("finished");
    expect(game.bankedMoney.a).toBe(before);
  });
});
