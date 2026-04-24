import {
  triviaCategorySchema,
  triviaQuestionSchema,
  type TriviaCategory,
  type TriviaDifficulty,
  type TriviaQuestion,
  type TriviaRoundConfig
} from "../../shared/contracts";
import fallbackQuestions from "./data/triviaQuestions.json";

type OpenTdbTokenResponse = {
  response_code: number;
  response_message: string;
  token?: string;
};

type OpenTdbQuestion = {
  category: string;
  type: "multiple" | "boolean";
  difficulty: "easy" | "medium" | "hard";
  question: string;
  correct_answer: string;
  incorrect_answers: string[];
};

type OpenTdbQuestionResponse = {
  response_code: number;
  results: OpenTdbQuestion[];
};

type OpenTdbCategoryResponse = {
  trivia_categories: Array<{ id: number; name: string }>;
};

const OPENTDB_API_BASE = "https://opentdb.com";
const OPENTDB_MAX_PER_REQUEST = 50;
const OPENTDB_BETWEEN_CALLS_WAIT_MS = 5000;
const OPENTDB_RATE_LIMIT_RESPONSE_CODE = 5;
const OPENTDB_RATE_LIMIT_WAIT_MS = 5000;
const OPENTDB_RATE_LIMIT_MAX_RETRIES = 1;
const CATEGORIES_CACHE_MS = 1000 * 60 * 60;
const TEST_ENV = "test";
const FALLBACK_TRIVIA = triviaQuestionSchema.array().parse(fallbackQuestions);
const FALLBACK_CATEGORIES: TriviaCategory[] = triviaCategorySchema.array().parse([
  { id: 9, name: "General Knowledge" },
  { id: 10, name: "Entertainment: Books" },
  { id: 11, name: "Entertainment: Film" },
  { id: 12, name: "Entertainment: Music" },
  { id: 13, name: "Entertainment: Musicals & Theatres" },
  { id: 14, name: "Entertainment: Television" },
  { id: 15, name: "Entertainment: Video Games" },
  { id: 16, name: "Entertainment: Board Games" },
  { id: 17, name: "Science & Nature" },
  { id: 18, name: "Science: Computers" },
  { id: 19, name: "Science: Mathematics" },
  { id: 20, name: "Mythology" },
  { id: 21, name: "Sports" },
  { id: 22, name: "Geography" },
  { id: 23, name: "History" },
  { id: 24, name: "Politics" },
  { id: 25, name: "Art" },
  { id: 26, name: "Celebrities" },
  { id: 27, name: "Animals" },
  { id: 28, name: "Vehicles" },
  { id: 29, name: "Entertainment: Comics" },
  { id: 30, name: "Science: Gadgets" },
  { id: 31, name: "Entertainment: Japanese Anime & Manga" },
  { id: 32, name: "Entertainment: Cartoon & Animations" }
]);

const DIFFICULTY_ORDER: TriviaDifficulty[] = ["easy", "medium", "hard"];

let cachedToken: string | null = null;
let cachedCategories: TriviaCategory[] | null = null;
let categoriesCachedAt = 0;

export type TriviaQuestionLoadProgress = {
  totalCalls: number;
  completedCalls: number;
  message: string;
};

export type TriviaQuestionLoader = (
  config: TriviaRoundConfig,
  excludedQuestionIds: Set<string>,
  onProgress?: (progress: TriviaQuestionLoadProgress) => Promise<void> | void
) => Promise<TriviaQuestion[]>;

export const resetTriviaQuestionLoaderCache = (): void => {
  cachedToken = null;
  cachedCategories = null;
  categoriesCachedAt = 0;
};

const hashString = (value: string): string => {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
};

const decodeOpenTdbText = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const shuffle = <T>(input: T[]): T[] => {
  const copy = [...input];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

const sleep = async (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const normalizeDifficulties = (difficulties: TriviaDifficulty[]): TriviaDifficulty[] => {
  const unique = new Set(difficulties);
  return DIFFICULTY_ORDER.filter((difficulty) => unique.has(difficulty));
};

const pickFromFallback = (
  amount: number,
  excludedQuestionIds: Set<string>,
  config: TriviaRoundConfig
): TriviaQuestion[] => {
  const selectedDifficulties = normalizeDifficulties(config.difficulties);
  const availableFallback = shuffle(FALLBACK_TRIVIA).filter((question) => {
    if (excludedQuestionIds.has(question.id)) {
      return false;
    }
    if (!selectedDifficulties.includes(question.difficulty)) {
      return false;
    }
    return true;
  });
  return availableFallback.slice(0, Math.max(1, Math.min(amount, availableFallback.length)));
};

const fetchJson = async <T>(
  fetchImpl: typeof fetch,
  url: string,
  timeoutMs = 3000
): Promise<T> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
  }
};

const getOrCreateToken = async (fetchImpl: typeof fetch): Promise<string | null> => {
  if (cachedToken) {
    return cachedToken;
  }
  const tokenResponse = await fetchJson<OpenTdbTokenResponse>(
    fetchImpl,
    `${OPENTDB_API_BASE}/api_token.php?command=request`
  );
  if (tokenResponse.response_code !== 0 || !tokenResponse.token) {
    throw new Error(tokenResponse.response_message || "Failed to request Open Trivia DB token.");
  }
  cachedToken = tokenResponse.token;
  return cachedToken;
};

const allocateQuestionCounts = (
  totalQuestions: number,
  difficulties: TriviaDifficulty[]
): Array<{ difficulty: TriviaDifficulty; amount: number }> => {
  const selected = normalizeDifficulties(difficulties);
  if (selected.length === 0) {
    return [];
  }
  const evenShare = Math.floor(totalQuestions / selected.length);
  let remainder = totalQuestions % selected.length;
  return selected.map((difficulty) => {
    const extra = remainder > 0 ? 1 : 0;
    remainder = Math.max(0, remainder - 1);
    return {
      difficulty,
      amount: evenShare + extra
    };
  });
};

const buildOpenTdbCallPlan = (
  config: TriviaRoundConfig
): Array<{ amount: number; difficulty: TriviaDifficulty; categoryId: number | null }> => {
  const perDifficulty = allocateQuestionCounts(config.totalQuestions, config.difficulties).filter(
    (entry) => entry.amount > 0
  );
  const calls: Array<{ amount: number; difficulty: TriviaDifficulty; categoryId: number | null }> = [];
  perDifficulty.forEach((entry) => {
    let remaining = entry.amount;
    while (remaining > 0) {
      const chunk = Math.min(OPENTDB_MAX_PER_REQUEST, remaining);
      calls.push({
        amount: chunk,
        difficulty: entry.difficulty,
        categoryId: config.categoryMode === "single" ? (config.categoryId ?? null) : null
      });
      remaining -= chunk;
    }
  });
  return calls;
};

const fetchOpenTdbQuestions = async (
  fetchImpl: typeof fetch,
  request: {
    amount: number;
    difficulty: TriviaDifficulty;
    categoryId: number | null;
  },
  sleepImpl: (ms: number) => Promise<void>
): Promise<TriviaQuestion[]> => {
  const amount = Math.max(1, Math.min(request.amount, OPENTDB_MAX_PER_REQUEST));
  const token = await getOrCreateToken(fetchImpl);
  const tokenPart = token ? `&token=${encodeURIComponent(token)}` : "";
  const categoryPart = request.categoryId ? `&category=${request.categoryId}` : "";
  const difficultyPart = `&difficulty=${request.difficulty}`;
  const url =
    `${OPENTDB_API_BASE}/api.php?amount=${amount}&type=multiple&encode=url3986${difficultyPart}${categoryPart}${tokenPart}`;

  let payload = await fetchJson<OpenTdbQuestionResponse>(fetchImpl, url);
  if (payload.response_code === 4 && token) {
    await fetchJson<OpenTdbTokenResponse>(
      fetchImpl,
      `${OPENTDB_API_BASE}/api_token.php?command=reset&token=${encodeURIComponent(token)}`
    );
    payload = await fetchJson<OpenTdbQuestionResponse>(fetchImpl, url);
  }

  let rateLimitRetries = 0;
  while (payload.response_code === OPENTDB_RATE_LIMIT_RESPONSE_CODE && rateLimitRetries < OPENTDB_RATE_LIMIT_MAX_RETRIES) {
    await sleepImpl(OPENTDB_RATE_LIMIT_WAIT_MS);
    payload = await fetchJson<OpenTdbQuestionResponse>(fetchImpl, url);
    rateLimitRetries += 1;
  }

  if (payload.response_code !== 0) {
    throw new Error(`Open Trivia DB returned response code ${payload.response_code}.`);
  }

  return payload.results.map((item) => {
    const category = decodeOpenTdbText(item.category);
    const question = decodeOpenTdbText(item.question);
    const correctAnswer = decodeOpenTdbText(item.correct_answer);
    const options = shuffle([
      correctAnswer,
      ...item.incorrect_answers.map((answer) => decodeOpenTdbText(answer))
    ]);
    return triviaQuestionSchema.parse({
      id: `opentdb-${hashString(`${category}|${question}|${correctAnswer}`)}`,
      category,
      difficulty: item.difficulty,
      question,
      options,
      correctAnswer
    });
  });
};

export const createTriviaQuestionLoader = (
  fetchImpl: typeof fetch | undefined = globalThis.fetch,
  sleepImpl: (ms: number) => Promise<void> = sleep
): TriviaQuestionLoader => {
  return async (
    config: TriviaRoundConfig,
    excludedQuestionIds: Set<string>,
    onProgress?: (progress: TriviaQuestionLoadProgress) => Promise<void> | void
  ): Promise<TriviaQuestion[]> => {
    const targetAmount = Math.max(1, config.totalQuestions);
    const useApi = Boolean(fetchImpl) && process.env.NODE_ENV !== TEST_ENV && process.env.TRIVIA_SOURCE !== "local";

    if (useApi) {
      try {
        const calls = buildOpenTdbCallPlan(config);
        const loadedQuestions: TriviaQuestion[] = [];
        const loadedQuestionIds = new Set<string>();

        if (onProgress) {
          await onProgress({
            totalCalls: calls.length,
            completedCalls: 0,
            message: "Starting trivia question load..."
          });
        }

        for (let i = 0; i < calls.length; i += 1) {
          if (i > 0) {
            await sleepImpl(OPENTDB_BETWEEN_CALLS_WAIT_MS);
          }
          const call = calls[i]!;
          const batch = await fetchOpenTdbQuestions(fetchImpl!, call, sleepImpl);
          batch.forEach((question) => {
            if (!loadedQuestionIds.has(question.id) && !excludedQuestionIds.has(question.id)) {
              loadedQuestions.push(question);
              loadedQuestionIds.add(question.id);
            }
          });
          if (onProgress) {
            await onProgress({
              totalCalls: calls.length,
              completedCalls: i + 1,
              message: `Loaded batch ${i + 1} of ${calls.length}.`
            });
          }
        }

        if (loadedQuestions.length >= targetAmount) {
          return loadedQuestions.slice(0, targetAmount);
        }
        const excludeWithApi = new Set(excludedQuestionIds);
        loadedQuestions.forEach((question) => excludeWithApi.add(question.id));
        const fromFallback = pickFromFallback(targetAmount - loadedQuestions.length, excludeWithApi, config);
        return [...loadedQuestions, ...fromFallback].slice(0, targetAmount);
      } catch {
        // Fall through to local library when API is unavailable.
      }
    }

    return pickFromFallback(targetAmount, excludedQuestionIds, config);
  };
};

export const createTriviaCategoryLoader = (
  fetchImpl: typeof fetch | undefined = globalThis.fetch
): (() => Promise<TriviaCategory[]>) => {
  return async (): Promise<TriviaCategory[]> => {
    const now = Date.now();
    if (cachedCategories && now - categoriesCachedAt < CATEGORIES_CACHE_MS) {
      return cachedCategories;
    }
    if (!fetchImpl || process.env.TRIVIA_SOURCE === "local" || process.env.NODE_ENV === TEST_ENV) {
      cachedCategories = FALLBACK_CATEGORIES;
      categoriesCachedAt = now;
      return FALLBACK_CATEGORIES;
    }
    try {
      const payload = await fetchJson<OpenTdbCategoryResponse>(fetchImpl, `${OPENTDB_API_BASE}/api_category.php`);
      const parsed = triviaCategorySchema
        .array()
        .parse(payload.trivia_categories)
        .sort((a, b) => a.name.localeCompare(b.name));
      cachedCategories = parsed;
      categoriesCachedAt = now;
      return parsed;
    } catch {
      cachedCategories = FALLBACK_CATEGORIES;
      categoriesCachedAt = now;
      return FALLBACK_CATEGORIES;
    }
  };
};

