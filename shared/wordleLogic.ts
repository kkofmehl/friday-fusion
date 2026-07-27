import { placementAward } from "./yahtzeeScoring";
import { WORDLE_MAX_GUESSES, WORDLE_WORD_LENGTH, type WordleTile } from "./contracts";

export { WORDLE_MAX_GUESSES, WORDLE_WORD_LENGTH };
export type { WordleTile };

export type WordlePlayerResult = {
  participantId: string;
  solved: boolean;
  guessCount: number;
  /** Milliseconds from race start to finish; larger means slower. */
  elapsedMs: number;
};

export type WordleStandingsEntry = WordlePlayerResult & {
  place: number;
  award: number;
};

/**
 * Standard Wordle coloring with correct duplicate-letter handling:
 * greens first, then yellows for remaining answer letters.
 */
export function evaluateGuess(answer: string, guess: string): WordleTile[] {
  const a = answer.toLowerCase();
  const g = guess.toLowerCase();
  if (a.length !== WORDLE_WORD_LENGTH || g.length !== WORDLE_WORD_LENGTH) {
    throw new Error(`Guess and answer must be ${WORDLE_WORD_LENGTH} letters.`);
  }

  const result: WordleTile[] = Array.from({ length: WORDLE_WORD_LENGTH }, () => "absent");
  const remaining: Record<string, number> = {};

  for (let i = 0; i < WORDLE_WORD_LENGTH; i += 1) {
    const ch = a[i]!;
    if (g[i] === ch) {
      result[i] = "correct";
    } else {
      remaining[ch] = (remaining[ch] ?? 0) + 1;
    }
  }

  for (let i = 0; i < WORDLE_WORD_LENGTH; i += 1) {
    if (result[i] === "correct") {
      continue;
    }
    const ch = g[i]!;
    const left = remaining[ch] ?? 0;
    if (left > 0) {
      result[i] = "present";
      remaining[ch] = left - 1;
    }
  }

  return result;
}

export function isSolvedEvaluation(evaluation: readonly WordleTile[]): boolean {
  return evaluation.length === WORDLE_WORD_LENGTH && evaluation.every((t) => t === "correct");
}

/** Solved first; fewer guesses; faster time. Returns negative if a ranks above b. */
export function compareWordleResults(a: WordlePlayerResult, b: WordlePlayerResult): number {
  if (a.solved !== b.solved) {
    return a.solved ? -1 : 1;
  }
  if (a.guessCount !== b.guessCount) {
    return a.guessCount - b.guessCount;
  }
  if (a.elapsedMs !== b.elapsedMs) {
    return a.elapsedMs - b.elapsedMs;
  }
  return a.participantId.localeCompare(b.participantId);
}

export function computeWordlePlacement(results: readonly WordlePlayerResult[]): WordleStandingsEntry[] {
  const n = results.length;
  const sorted = [...results].sort(compareWordleResults);
  return sorted.map((row, i) => ({
    ...row,
    place: i + 1,
    award: placementAward(i + 1, n)
  }));
}

export function pickRandomAnswer(
  answers: readonly string[],
  usedAnswers: readonly string[],
  random: () => number = Math.random
): string {
  if (answers.length === 0) {
    throw new Error("Wordle answer list is empty.");
  }
  const used = new Set(usedAnswers.map((w) => w.toLowerCase()));
  let pool = answers.filter((w) => !used.has(w.toLowerCase()));
  if (pool.length === 0) {
    pool = [...answers];
  }
  const index = Math.floor(random() * pool.length);
  return pool[index]!.toLowerCase();
}
