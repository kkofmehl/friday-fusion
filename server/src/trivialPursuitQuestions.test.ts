import { describe, expect, it, vi } from "vitest";
import {
  TRIVIAL_PURSUIT_API_CATEGORIES,
  fetchQuestionsForCategory,
  isObviousMultipleChoicePrompt,
  loadInitialQuestionPools,
  normalizeQuestion,
  shuffleChoices,
  takeQuestion
} from "./trivialPursuitQuestions";

const sampleApiQuestion = (overrides: Record<string, unknown> = {}) => ({
  id: "q1",
  type: "text_choice",
  category: "geography",
  question: { text: "What is the capital of France?" },
  correctAnswer: "Paris",
  incorrectAnswers: ["London", "Berlin", "Madrid"],
  ...overrides
});

describe("trivialPursuitQuestions", () => {
  it("maps Trivial Pursuit categories to Trivia API category strings", () => {
    expect(TRIVIAL_PURSUIT_API_CATEGORIES.geography).toBe("geography");
    expect(TRIVIAL_PURSUIT_API_CATEGORIES.entertainment).toBe("film_and_tv,music");
    expect(TRIVIAL_PURSUIT_API_CATEGORIES.scienceAndNature).toBe("science");
  });

  it("keeps choices and filters obvious multiple-choice prompts", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => [
        sampleApiQuestion(),
        sampleApiQuestion({
          id: "mc-only",
          question: { text: "Which of the following is a capital city?" },
          correctAnswer: "Paris",
          incorrectAnswers: ["Lyon", "Nice", "Bordeaux"]
        })
      ]
    })) as unknown as typeof fetch;

    const questions = await fetchQuestionsForCategory("geography", { fetchImpl });
    expect(questions).toHaveLength(1);
    expect(questions[0]?.id).toBe("q1");
    expect(questions[0]?.correctAnswer).toBe("Paris");
    expect(questions[0]?.incorrectAnswers).toEqual(["London", "Berlin", "Madrid"]);
    expect(questions[0]?.choices).toHaveLength(4);
    expect(questions[0]?.choices).toEqual(
      expect.arrayContaining(["Paris", "London", "Berlin", "Madrid"])
    );
  });

  it("filters non text_choice questions", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => [
        sampleApiQuestion({ type: "image_choice", id: "img" }),
        sampleApiQuestion({ id: "ok" })
      ]
    })) as unknown as typeof fetch;

    const questions = await fetchQuestionsForCategory("history", { fetchImpl });
    expect(questions.map((q) => q.id)).toEqual(["ok"]);
  });

  it("loads all six category pools or fails clearly", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes("categories=history")) {
        return { ok: true, json: async () => [] };
      }
      return {
        ok: true,
        json: async () => [sampleApiQuestion({ id: `id-${u.slice(-12)}` })]
      };
    }) as unknown as typeof fetch;

    await expect(loadInitialQuestionPools({ fetchImpl })).rejects.toThrow(/history/i);
  });

  it("takeQuestion removes from the pool and respects used ids", () => {
    const pools = {
      geography: [
        {
          id: "a",
          category: "geography" as const,
          text: "A?",
          correctAnswer: "1",
          incorrectAnswers: ["2", "3", "4"],
          choices: ["1", "2", "3", "4"]
        },
        {
          id: "b",
          category: "geography" as const,
          text: "B?",
          correctAnswer: "2",
          incorrectAnswers: ["1", "3", "4"],
          choices: ["2", "1", "3", "4"]
        }
      ],
      history: [],
      artsAndLiterature: [],
      entertainment: [],
      sportsAndLeisure: [],
      scienceAndNature: []
    };
    const used = new Set(["a"]);
    const q = takeQuestion(pools, "geography", used);
    expect(q?.id).toBe("b");
    expect(pools.geography).toHaveLength(1);
    expect(pools.geography[0]?.id).toBe("a");
  });
});

describe("isObviousMultipleChoicePrompt", () => {
  it("flags classic option-dependent wording", () => {
    expect(isObviousMultipleChoicePrompt("Which of the following is true?")).toBe(true);
    expect(isObviousMultipleChoicePrompt("Which of these animals is a mammal?")).toBe(true);
    expect(isObviousMultipleChoicePrompt("Select the correct answer.")).toBe(true);
    expect(isObviousMultipleChoicePrompt("None of the above applies here.")).toBe(true);
  });

  it("allows normal trivia prompts", () => {
    expect(isObviousMultipleChoicePrompt("What is the capital of France?")).toBe(false);
    expect(isObviousMultipleChoicePrompt("Which Shakespeare play features Hamlet?")).toBe(false);
    expect(isObviousMultipleChoicePrompt("Who wrote Pride and Prejudice?")).toBe(false);
  });
});

describe("shuffleChoices", () => {
  it("is deterministic for the same seed", () => {
    const input = ["A", "B", "C", "D"];
    expect(shuffleChoices(input, "seed-1")).toEqual(shuffleChoices(input, "seed-1"));
  });
});

describe("normalizeQuestion", () => {
  it("returns null for obvious MC prompts", () => {
    expect(
      normalizeQuestion(
        sampleApiQuestion({
          question: { text: "Which of the following cities is in France?" }
        }),
        "geography"
      )
    ).toBeNull();
  });
});
