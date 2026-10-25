import http from "node:http";
import https from "node:https";
import {
  TRIVIAL_PURSUIT_CATEGORIES,
  type TrivialPursuitCategory
} from "../../shared/trivialPursuitLogic";

const TRIVIA_API_BASE = "https://the-trivia-api.com/v2/questions";
const DEFAULT_FETCH_LIMIT = 20;
const POOL_REFILL_THRESHOLD = 5;

/** Minimal fetch surface used by the loader (works on Node 16 without global fetch). */
export type TrivialPursuitFetch = (
  url: string,
  init?: { signal?: AbortSignal }
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

const nodeHttpFetch: TrivialPursuitFetch = (url, init) =>
  new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const transport = parsed.protocol === "http:" ? http : https;
    const req = transport.get(url, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        const status = res.statusCode ?? 500;
        resolve({
          ok: status >= 200 && status < 300,
          status,
          json: async () => JSON.parse(body) as unknown
        });
      });
    });
    req.on("error", reject);
    if (init?.signal) {
      const onAbort = () => {
        req.destroy(new Error("aborted"));
      };
      if (init.signal.aborted) {
        onAbort();
        return;
      }
      init.signal.addEventListener("abort", onAbort, { once: true });
    }
  });

const defaultFetch: TrivialPursuitFetch =
  typeof globalThis.fetch === "function"
    ? (url, init) => globalThis.fetch(url, init)
    : nodeHttpFetch;

/** Trivia API category query strings for each Trivial Pursuit category. */
export const TRIVIAL_PURSUIT_API_CATEGORIES: Record<TrivialPursuitCategory, string> = {
  geography: "geography",
  history: "history",
  artsAndLiterature: "arts_and_literature",
  entertainment: "film_and_tv,music",
  sportsAndLeisure: "sport_and_leisure",
  scienceAndNature: "science"
};

export type TrivialPursuitQuestion = {
  id: string;
  category: TrivialPursuitCategory;
  text: string;
  correctAnswer: string;
  /** Wrong answers from the API (usually 3). */
  incorrectAnswers: string[];
  /** Stable shuffled order of correct + incorrect for display. */
  choices: string[];
};

type TriviaApiQuestion = {
  id?: string;
  type?: string;
  category?: string;
  question?: { text?: string } | string;
  correctAnswer?: string;
  incorrectAnswers?: string[];
};

const decodeText = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const questionText = (raw: TriviaApiQuestion): string | null => {
  if (typeof raw.question === "string") {
    const t = decodeText(raw.question).trim();
    return t.length > 0 ? t : null;
  }
  if (raw.question && typeof raw.question.text === "string") {
    const t = decodeText(raw.question.text).trim();
    return t.length > 0 ? t : null;
  }
  return null;
};

/**
 * Drop prompts that clearly depend on seeing the options.
 * Soft MC wording can still slip through — readers may read choices aloud.
 */
export function isObviousMultipleChoicePrompt(text: string): boolean {
  const normalized = text.trim().replace(/\s+/g, " ");
  const patterns = [
    /\bwhich of the following\b/i,
    /\bwhich of these\b/i,
    /\bwhich one of the following\b/i,
    /\bwhich of the below\b/i,
    /\bwhich of the above\b/i,
    /\ball of the above\b/i,
    /\bnone of the above\b/i,
    /\bboth of the above\b/i,
    /\bselect (the|which|all)\b/i,
    /\bchoose (the|which|all)\b/i,
    /\bpick (the|which)\b/i,
    /\bwhich (option|answer|choice) (is|are|below)\b/i,
    /\bwhich is (not )?correct\b/i,
    /\bwhich are correct\b/i
  ];
  return patterns.some((re) => re.test(normalized));
}

const hashString = (value: string): number => {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(i);
  }
  return hash >>> 0;
};

/** Deterministic Fisher–Yates so every client sees the same order. */
export function shuffleChoices(choices: string[], seed: string): string[] {
  const out = [...choices];
  let state = hashString(seed) || 1;
  const next = (): number => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
}

const normalizeIncorrectAnswers = (raw: TriviaApiQuestion, correctAnswer: string): string[] => {
  if (!Array.isArray(raw.incorrectAnswers)) {
    return [];
  }
  const seen = new Set<string>([correctAnswer.toLowerCase()]);
  const out: string[] = [];
  for (const entry of raw.incorrectAnswers) {
    if (typeof entry !== "string") continue;
    const text = decodeText(entry).trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
};

export const normalizeQuestion = (
  raw: TriviaApiQuestion,
  category: TrivialPursuitCategory
): TrivialPursuitQuestion | null => {
  if (raw.type && raw.type !== "text_choice") {
    return null;
  }
  const text = questionText(raw);
  const correctAnswer =
    typeof raw.correctAnswer === "string" ? decodeText(raw.correctAnswer).trim() : "";
  if (!text || !correctAnswer) {
    return null;
  }
  if (isObviousMultipleChoicePrompt(text)) {
    return null;
  }
  const incorrectAnswers = normalizeIncorrectAnswers(raw, correctAnswer);
  const id =
    typeof raw.id === "string" && raw.id.length > 0
      ? raw.id
      : `tp-${category}-${hashString(`${text}|${correctAnswer}`).toString(16)}`;
  const choices = shuffleChoices([correctAnswer, ...incorrectAnswers], id);
  return { id, category, text, correctAnswer, incorrectAnswers, choices };
};

const fetchJson = async <T>(
  fetchImpl: TrivialPursuitFetch,
  url: string,
  timeoutMs = 8000
): Promise<T> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`The Trivia API responded with ${response.status}`);
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
  }
};

export async function fetchQuestionsForCategory(
  category: TrivialPursuitCategory,
  opts: {
    fetchImpl?: TrivialPursuitFetch;
    limit?: number;
    excludedIds?: Set<string>;
  } = {}
): Promise<TrivialPursuitQuestion[]> {
  const fetchImpl = opts.fetchImpl ?? defaultFetch;
  // Fetch extra to offset obvious-MC filtering.
  const requested = Math.max(1, Math.min(50, opts.limit ?? DEFAULT_FETCH_LIMIT));
  const limit = Math.min(50, Math.max(requested, Math.ceil(requested * 1.5)));
  const excluded = opts.excludedIds ?? new Set<string>();
  const categories = TRIVIAL_PURSUIT_API_CATEGORIES[category];
  const params = new URLSearchParams({
    limit: String(limit),
    categories,
    types: "text_choice"
  });
  const payload = await fetchJson<TriviaApiQuestion[]>(
    fetchImpl,
    `${TRIVIA_API_BASE}?${params.toString()}`
  );
  if (!Array.isArray(payload)) {
    throw new Error(`Invalid Trivia API response for ${category}.`);
  }
  const out: TrivialPursuitQuestion[] = [];
  for (const raw of payload) {
    const q = normalizeQuestion(raw, category);
    if (!q || excluded.has(q.id)) continue;
    out.push(q);
    if (out.length >= requested) break;
  }
  return out;
}

export type TrivialPursuitQuestionPools = Record<TrivialPursuitCategory, TrivialPursuitQuestion[]>;

export async function loadInitialQuestionPools(
  opts: {
    fetchImpl?: TrivialPursuitFetch;
    limit?: number;
  } = {}
): Promise<TrivialPursuitQuestionPools> {
  const pools = {} as TrivialPursuitQuestionPools;
  const results = await Promise.all(
    TRIVIAL_PURSUIT_CATEGORIES.map(async (category) => {
      const questions = await fetchQuestionsForCategory(category, opts);
      if (questions.length === 0) {
        throw new Error(`No Trivial Pursuit questions available for ${category}.`);
      }
      return { category, questions };
    })
  );
  for (const { category, questions } of results) {
    pools[category] = questions;
  }
  return pools;
}

export function takeQuestion(
  pools: TrivialPursuitQuestionPools,
  category: TrivialPursuitCategory,
  usedIds: Set<string>
): TrivialPursuitQuestion | null {
  const pool = pools[category] ?? [];
  const idx = pool.findIndex((q) => !usedIds.has(q.id));
  if (idx === -1) return null;
  const [question] = pool.splice(idx, 1);
  return question ?? null;
}

export function poolNeedsRefill(
  pools: TrivialPursuitQuestionPools,
  category: TrivialPursuitCategory
): boolean {
  return (pools[category]?.length ?? 0) < POOL_REFILL_THRESHOLD;
}

export async function refillCategoryPool(
  pools: TrivialPursuitQuestionPools,
  category: TrivialPursuitCategory,
  usedIds: Set<string>,
  opts: { fetchImpl?: TrivialPursuitFetch; limit?: number } = {}
): Promise<void> {
  const fresh = await fetchQuestionsForCategory(category, {
    ...opts,
    excludedIds: usedIds
  });
  const existingIds = new Set((pools[category] ?? []).map((q) => q.id));
  for (const q of fresh) {
    if (existingIds.has(q.id) || usedIds.has(q.id)) continue;
    pools[category].push(q);
    existingIds.add(q.id);
  }
}

export { POOL_REFILL_THRESHOLD };
