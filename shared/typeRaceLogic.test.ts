import { describe, expect, it } from "vitest";
import {
  TYPE_RACE_PENALTY_MS_PER_ERROR,
  buildTypeRacePlayerResult,
  compareTypeRaceTexts,
  computeTypeRaceStandings,
  typeRaceAdjustedMs,
  typeRacePenaltyMs,
  typeRaceWordsPerMinute
} from "./typeRaceLogic";

describe("compareTypeRaceTexts", () => {
  it("scores an exact match with full accuracy", () => {
    const result = compareTypeRaceTexts("Hello world.", "Hello world.");
    expect(result.errors).toBe(0);
    expect(result.correct).toBe("Hello world.".length);
    expect(result.accuracy).toBe(1);
  });

  it("counts a single substitution as one error", () => {
    const prompt = "abcde";
    const result = compareTypeRaceTexts(prompt, "abXde");
    expect(result.errors).toBe(1);
    expect(result.correct).toBe(4);
    expect(result.accuracy).toBeCloseTo(4 / 5);
  });

  it("does not cascade when one character is inserted", () => {
    const prompt = "The quick brown fox";
    const result = compareTypeRaceTexts(prompt, "The quickk brown fox");
    expect(result.errors).toBe(1);
    expect(result.correct).toBe(prompt.length);
  });

  it("does not cascade when one character is deleted", () => {
    const prompt = "The quick brown fox";
    const result = compareTypeRaceTexts(prompt, "The quik brown fox");
    expect(result.errors).toBe(1);
    expect(result.correct).toBe(prompt.length - 1);
  });

  it("treats case and punctuation as significant", () => {
    expect(compareTypeRaceTexts("Hello!", "hello!").errors).toBe(1);
    expect(compareTypeRaceTexts("Hello.", "Hello!").errors).toBe(1);
  });

  it("handles empty strings", () => {
    expect(compareTypeRaceTexts("", "")).toEqual({ correct: 0, errors: 0, accuracy: 1 });
    expect(compareTypeRaceTexts("a", "").errors).toBe(1);
    expect(compareTypeRaceTexts("", "a").errors).toBe(1);
  });
});

describe("typeRacePenaltyMs / typeRaceAdjustedMs", () => {
  it("applies 0.5 second per error", () => {
    expect(TYPE_RACE_PENALTY_MS_PER_ERROR).toBe(500);
    expect(typeRacePenaltyMs(0)).toBe(0);
    expect(typeRacePenaltyMs(3)).toBe(1500);
    expect(typeRaceAdjustedMs(10_000, 2)).toBe(11_000);
  });
});

describe("typeRaceWordsPerMinute", () => {
  it("uses correct characters over five as a word and raw elapsed minutes", () => {
    // 250 correct chars in 60s => (250/5)/1 = 50 WPM
    expect(typeRaceWordsPerMinute(250, 60_000)).toBe(50);
    expect(typeRaceWordsPerMinute(0, 60_000)).toBe(0);
    expect(typeRaceWordsPerMinute(100, 0)).toBe(0);
  });

  it("includes WPM on finished player results", () => {
    const result = buildTypeRacePlayerResult({
      participantId: "a",
      finished: true,
      elapsedMs: 30_000,
      submittedText: "abcdefghij",
      prompt: "abcdefghij"
    });
    // 10 correct chars in 30s => (10/5) / 0.5 = 4 WPM
    expect(result.wordsPerMinute).toBe(4);
  });
});

describe("computeTypeRaceStandings", () => {
  it("ranks by adjusted time and awards the winner one point", () => {
    const standings = computeTypeRaceStandings([
      buildTypeRacePlayerResult({
        participantId: "slow",
        finished: true,
        elapsedMs: 12_000,
        submittedText: "abc",
        prompt: "abc"
      }),
      buildTypeRacePlayerResult({
        participantId: "fast",
        finished: true,
        elapsedMs: 8_000,
        submittedText: "abc",
        prompt: "abc"
      })
    ]);
    expect(standings.map((s) => s.participantId)).toEqual(["fast", "slow"]);
    expect(standings[0]!.ffPoints).toBe(1);
    expect(standings[1]!.ffPoints).toBe(0);
  });

  it("lets penalties change the winner", () => {
    const standings = computeTypeRaceStandings([
      buildTypeRacePlayerResult({
        participantId: "messy",
        finished: true,
        elapsedMs: 5_000,
        submittedText: "XXXX",
        prompt: "abcd"
      }),
      buildTypeRacePlayerResult({
        participantId: "clean",
        finished: true,
        elapsedMs: 6_000,
        submittedText: "abcd",
        prompt: "abcd"
      })
    ]);
    expect(standings[0]!.participantId).toBe("clean");
    expect(standings[0]!.ffPoints).toBe(1);
    expect(standings[1]!.participantId).toBe("messy");
    expect(standings[1]!.ffPoints).toBe(0);
  });

  it("awards one point to each tied winner", () => {
    const standings = computeTypeRaceStandings([
      buildTypeRacePlayerResult({
        participantId: "a",
        finished: true,
        elapsedMs: 5_000,
        submittedText: "hi",
        prompt: "hi"
      }),
      buildTypeRacePlayerResult({
        participantId: "b",
        finished: true,
        elapsedMs: 5_000,
        submittedText: "hi",
        prompt: "hi"
      }),
      buildTypeRacePlayerResult({
        participantId: "c",
        finished: true,
        elapsedMs: 9_000,
        submittedText: "hi",
        prompt: "hi"
      })
    ]);
    expect(standings.filter((s) => s.ffPoints === 1).map((s) => s.participantId).sort()).toEqual([
      "a",
      "b"
    ]);
    expect(standings.find((s) => s.participantId === "c")!.ffPoints).toBe(0);
  });

  it("places DNF players after finishers with zero points", () => {
    const standings = computeTypeRaceStandings([
      buildTypeRacePlayerResult({
        participantId: "dnf",
        finished: false,
        elapsedMs: 0,
        submittedText: "",
        prompt: "hello"
      }),
      buildTypeRacePlayerResult({
        participantId: "done",
        finished: true,
        elapsedMs: 4_000,
        submittedText: "hello",
        prompt: "hello"
      })
    ]);
    expect(standings.map((s) => s.participantId)).toEqual(["done", "dnf"]);
    expect(standings[0]!.ffPoints).toBe(1);
    expect(standings[1]!.ffPoints).toBe(0);
    expect(standings[1]!.finished).toBe(false);
  });
});
