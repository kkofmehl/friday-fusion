import { describe, expect, it } from "vitest";
import {
  compareWordleResults,
  computeWordlePlacement,
  evaluateGuess,
  isSolvedEvaluation,
  pickRandomAnswer
} from "./wordleLogic";

describe("evaluateGuess", () => {
  it("marks all correct for exact match", () => {
    expect(evaluateGuess("crane", "crane")).toEqual([
      "correct",
      "correct",
      "correct",
      "correct",
      "correct"
    ]);
    expect(isSolvedEvaluation(evaluateGuess("crane", "crane"))).toBe(true);
  });

  it("marks absents and presents", () => {
    expect(evaluateGuess("crane", "trace")).toEqual([
      "absent",
      "correct",
      "correct",
      "present",
      "correct"
    ]);
  });

  it("handles duplicate letters in guess against single answer letter", () => {
    // answer has one A; first A should be yellow
    expect(evaluateGuess("plant", "abbey")).toEqual([
      "present",
      "absent",
      "absent",
      "absent",
      "absent"
    ]);
    // greens consume A and E; second A has no remaining count
    expect(evaluateGuess("abbey", "aahed")).toEqual([
      "correct",
      "absent",
      "absent",
      "correct",
      "absent"
    ]);
  });

  it("prefers green over yellow for the same letter", () => {
    expect(evaluateGuess("speed", "erase")).toEqual([
      "present",
      "absent",
      "absent",
      "present",
      "present"
    ]);
  });
});

describe("compareWordleResults / computeWordlePlacement", () => {
  it("ranks solved above failed", () => {
    const standings = computeWordlePlacement([
      { participantId: "a", solved: false, guessCount: 6, elapsedMs: 1000 },
      { participantId: "b", solved: true, guessCount: 4, elapsedMs: 5000 }
    ]);
    expect(standings.map((s) => s.participantId)).toEqual(["b", "a"]);
    expect(standings[0]!.award).toBe(2);
    expect(standings[1]!.award).toBe(1);
  });

  it("prefers fewer guesses over faster time", () => {
    const standings = computeWordlePlacement([
      { participantId: "fast3", solved: true, guessCount: 3, elapsedMs: 1000 },
      { participantId: "slow2", solved: true, guessCount: 2, elapsedMs: 9000 }
    ]);
    expect(standings.map((s) => s.participantId)).toEqual(["slow2", "fast3"]);
  });

  it("breaks equal guess count by elapsed time", () => {
    const cmp = compareWordleResults(
      { participantId: "a", solved: true, guessCount: 3, elapsedMs: 2000 },
      { participantId: "b", solved: true, guessCount: 3, elapsedMs: 1000 }
    );
    expect(cmp).toBeGreaterThan(0);
  });

  it("awards inverse placement for five players", () => {
    const standings = computeWordlePlacement(
      Array.from({ length: 5 }, (_, i) => ({
        participantId: `p${i}`,
        solved: true,
        guessCount: i + 1,
        elapsedMs: 1000
      }))
    );
    expect(standings.map((s) => s.award)).toEqual([5, 4, 3, 2, 1]);
  });
});

describe("pickRandomAnswer", () => {
  it("avoids used answers until pool exhausted", () => {
    const answers = ["alpha", "bravo", "crane"];
    const picked = pickRandomAnswer(answers, ["alpha", "bravo"], () => 0);
    expect(picked).toBe("crane");
  });

  it("resets pool when all answers used", () => {
    const answers = ["alpha", "bravo"];
    const picked = pickRandomAnswer(answers, ["alpha", "bravo"], () => 0);
    expect(picked).toBe("alpha");
  });
});
