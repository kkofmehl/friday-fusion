import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createTriviaCategoryLoader,
  createTriviaQuestionLoader,
  resetTriviaQuestionLoaderCache
} from "./triviaQuestionLoader";

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_TRIVIA_SOURCE = process.env.TRIVIA_SOURCE;

const mockResponse = (payload: unknown): Response =>
  ({
    ok: true,
    status: 200,
    json: async () => payload
  }) as Response;

describe("createTriviaQuestionLoader", () => {
  afterEach(() => {
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
    process.env.TRIVIA_SOURCE = ORIGINAL_TRIVIA_SOURCE;
    resetTriviaQuestionLoaderCache();
  });

  it("loads trivia questions from Open Trivia DB when enabled", async () => {
    process.env.NODE_ENV = "development";
    delete process.env.TRIVIA_SOURCE;

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        mockResponse({
          response_code: 0,
          response_message: "Token Generated Successfully!",
          token: "token-123"
        })
      )
      .mockResolvedValueOnce(
        mockResponse({
          response_code: 0,
          results: [
            {
              category: "Science%20%26%20Nature",
              type: "multiple",
              difficulty: "easy",
              question: "What%20is%20H2O%3F",
              correct_answer: "Water",
              incorrect_answers: ["Fire", "Earth", "Air"]
            }
          ]
        })
      );

    const loader = createTriviaQuestionLoader(fetchMock as unknown as typeof fetch);
    const questions = await loader(
      {
        totalQuestions: 1,
        categoryMode: "all",
        difficulties: ["easy"]
      },
      new Set()
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(questions).toHaveLength(1);
    expect(questions[0]?.category).toBe("Science & Nature");
    expect(questions[0]?.question).toBe("What is H2O?");
    expect(questions[0]?.correctAnswer).toBe("Water");
    expect(questions[0]?.options).toContain("Water");
  });

  it("splits all-difficulty rounds and spaces calls by 5 seconds", async () => {
    process.env.NODE_ENV = "development";
    delete process.env.TRIVIA_SOURCE;

    const sleepMock = vi.fn().mockResolvedValue(undefined);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        mockResponse({
          response_code: 0,
          response_message: "Token Generated Successfully!",
          token: "token-123"
        })
      )
      .mockResolvedValueOnce(
        mockResponse({
          response_code: 0,
          results: [
            {
              category: "General%20Knowledge",
              type: "multiple",
              difficulty: "easy",
              question: "Easy%20Q1",
              correct_answer: "A",
              incorrect_answers: ["B", "C", "D"]
            },
            {
              category: "General%20Knowledge",
              type: "multiple",
              difficulty: "easy",
              question: "Easy%20Q2",
              correct_answer: "A",
              incorrect_answers: ["B", "C", "D"]
            },
            {
              category: "General%20Knowledge",
              type: "multiple",
              difficulty: "easy",
              question: "Easy%20Q3",
              correct_answer: "A",
              incorrect_answers: ["B", "C", "D"]
            },
            {
              category: "General%20Knowledge",
              type: "multiple",
              difficulty: "easy",
              question: "Easy%20Q4",
              correct_answer: "A",
              incorrect_answers: ["B", "C", "D"]
            }
          ]
        })
      )
      .mockResolvedValueOnce(
        mockResponse({
          response_code: 0,
          results: [
            {
              category: "General%20Knowledge",
              type: "multiple",
              difficulty: "medium",
              question: "Medium%20Q1",
              correct_answer: "A",
              incorrect_answers: ["B", "C", "D"]
            },
            {
              category: "General%20Knowledge",
              type: "multiple",
              difficulty: "medium",
              question: "Medium%20Q2",
              correct_answer: "A",
              incorrect_answers: ["B", "C", "D"]
            },
            {
              category: "General%20Knowledge",
              type: "multiple",
              difficulty: "medium",
              question: "Medium%20Q3",
              correct_answer: "A",
              incorrect_answers: ["B", "C", "D"]
            }
          ]
        })
      )
      .mockResolvedValueOnce(
        mockResponse({
          response_code: 0,
          results: [
            {
              category: "General%20Knowledge",
              type: "multiple",
              difficulty: "hard",
              question: "Hard%20Q1",
              correct_answer: "A",
              incorrect_answers: ["B", "C", "D"]
            },
            {
              category: "General%20Knowledge",
              type: "multiple",
              difficulty: "hard",
              question: "Hard%20Q2",
              correct_answer: "A",
              incorrect_answers: ["B", "C", "D"]
            },
            {
              category: "General%20Knowledge",
              type: "multiple",
              difficulty: "hard",
              question: "Hard%20Q3",
              correct_answer: "A",
              incorrect_answers: ["B", "C", "D"]
            }
          ]
        })
      );

    const loader = createTriviaQuestionLoader(fetchMock as unknown as typeof fetch, sleepMock);
    const questions = await loader(
      {
        totalQuestions: 10,
        categoryMode: "all",
        difficulties: ["easy", "medium", "hard"]
      },
      new Set()
    );

    expect(questions).toHaveLength(10);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[1]?.[0]).toContain("amount=4");
    expect(fetchMock.mock.calls[1]?.[0]).toContain("difficulty=easy");
    expect(fetchMock.mock.calls[2]?.[0]).toContain("amount=3");
    expect(fetchMock.mock.calls[2]?.[0]).toContain("difficulty=medium");
    expect(fetchMock.mock.calls[3]?.[0]).toContain("amount=3");
    expect(fetchMock.mock.calls[3]?.[0]).toContain("difficulty=hard");
    expect(sleepMock).toHaveBeenCalledTimes(2);
    expect(sleepMock).toHaveBeenNthCalledWith(1, 5000);
    expect(sleepMock).toHaveBeenNthCalledWith(2, 5000);
  });

  it("falls back to local trivia library when the API request fails", async () => {
    process.env.NODE_ENV = "development";
    delete process.env.TRIVIA_SOURCE;

    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    const loader = createTriviaQuestionLoader(fetchMock as unknown as typeof fetch);
    const questions = await loader(
      {
        totalQuestions: 2,
        categoryMode: "all",
        difficulties: ["easy", "medium", "hard"]
      },
      new Set()
    );

    expect(questions.length).toBeGreaterThanOrEqual(1);
    expect(fetchMock).toHaveBeenCalled();
  });

  it("retries once after rate limiting and then returns API questions", async () => {
    process.env.NODE_ENV = "development";
    delete process.env.TRIVIA_SOURCE;

    const sleepMock = vi.fn().mockResolvedValue(undefined);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        mockResponse({
          response_code: 0,
          response_message: "Token Generated Successfully!",
          token: "token-123"
        })
      )
      .mockResolvedValueOnce(
        mockResponse({
          response_code: 5,
          results: []
        })
      )
      .mockResolvedValueOnce(
        mockResponse({
          response_code: 0,
          results: [
            {
              category: "General%20Knowledge",
              type: "multiple",
              difficulty: "easy",
              question: "What%20color%20is%20the%20sky%3F",
              correct_answer: "Blue",
              incorrect_answers: ["Green", "Red", "Yellow"]
            }
          ]
        })
      );

    const loader = createTriviaQuestionLoader(fetchMock as unknown as typeof fetch, sleepMock);
    const questions = await loader(
      {
        totalQuestions: 1,
        categoryMode: "all",
        difficulties: ["easy"]
      },
      new Set()
    );

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(sleepMock).toHaveBeenCalledTimes(1);
    expect(sleepMock).toHaveBeenCalledWith(5000);
    expect(questions).toHaveLength(1);
    expect(questions[0]?.correctAnswer).toBe("Blue");
  });
});

describe("createTriviaCategoryLoader", () => {
  it("loads and returns categories from Open Trivia DB", async () => {
    process.env.NODE_ENV = "development";
    delete process.env.TRIVIA_SOURCE;
    const fetchMock = vi.fn().mockResolvedValue(
      mockResponse({
        trivia_categories: [
          { id: 22, name: "Geography" },
          { id: 9, name: "General Knowledge" }
        ]
      })
    );
    const loadCategories = createTriviaCategoryLoader(fetchMock as unknown as typeof fetch);
    const categories = await loadCategories();
    expect(categories).toHaveLength(2);
    expect(categories[0]?.name).toBe("General Knowledge");
  });
});

