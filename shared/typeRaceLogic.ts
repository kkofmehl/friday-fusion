/** Milliseconds added to raw finish time for each typing error. */
export const TYPE_RACE_PENALTY_MS_PER_ERROR = 500;

export type TypeRaceCompareResult = {
  /** Characters that match under an optimal Levenshtein alignment. */
  correct: number;
  /** Edit distance (insertions + deletions + substitutions). */
  errors: number;
  /** correct / (correct + errors); 1 when both are 0 (empty prompt and empty submission). */
  accuracy: number;
};

export type TypeRacePlayerResult = {
  participantId: string;
  /** False when the host ended the race before this player clicked Finished. */
  finished: boolean;
  elapsedMs: number;
  submittedText: string;
  correct: number;
  errors: number;
  accuracy: number;
  penaltyMs: number;
  adjustedMs: number;
  /**
   * Standard typing WPM from correct characters: (correct / 5) / minutes elapsed.
   * Uses raw finish time (not penalty-adjusted).
   */
  wordsPerMinute: number;
};

export type TypeRaceStanding = TypeRacePlayerResult & {
  place: number;
  /** 1 for each tied winner; 0 otherwise. */
  ffPoints: number;
};

/**
 * Compare submission to prompt with Levenshtein alignment so a single dropped
 * or inserted character counts as one error instead of cascading mismatches.
 * Case, spaces, and punctuation all count.
 */
export function compareTypeRaceTexts(prompt: string, submission: string): TypeRaceCompareResult {
  const a = prompt;
  const b = submission;
  const n = a.length;
  const m = b.length;

  if (n === 0 && m === 0) {
    return { correct: 0, errors: 0, accuracy: 1 };
  }

  const dp: number[][] = Array.from({ length: n + 1 }, () => Array.from({ length: m + 1 }, () => 0));
  for (let i = 0; i <= n; i += 1) {
    dp[i]![0] = i;
  }
  for (let j = 0; j <= m; j += 1) {
    dp[0]![j] = j;
  }

  for (let i = 1; i <= n; i += 1) {
    for (let j = 1; j <= m; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1,
        dp[i]![j - 1]! + 1,
        dp[i - 1]![j - 1]! + cost
      );
    }
  }

  let i = n;
  let j = m;
  let correct = 0;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && dp[i]![j] === dp[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1)) {
      if (a[i - 1] === b[j - 1]) {
        correct += 1;
      }
      i -= 1;
      j -= 1;
    } else if (i > 0 && dp[i]![j] === dp[i - 1]![j]! + 1) {
      i -= 1;
    } else {
      j -= 1;
    }
  }

  const errors = dp[n]![m]!;
  const denom = correct + errors;
  return {
    correct,
    errors,
    accuracy: denom === 0 ? 1 : correct / denom
  };
}

export function typeRacePenaltyMs(errors: number): number {
  return Math.max(0, errors) * TYPE_RACE_PENALTY_MS_PER_ERROR;
}

export function typeRaceAdjustedMs(elapsedMs: number, errors: number): number {
  return Math.max(0, elapsedMs) + typeRacePenaltyMs(errors);
}

/** (correctChars / 5) / minutes — classic words-per-minute from correct characters. */
export function typeRaceWordsPerMinute(correctChars: number, elapsedMs: number): number {
  if (elapsedMs <= 0 || correctChars <= 0) {
    return 0;
  }
  const minutes = elapsedMs / 60_000;
  return correctChars / 5 / minutes;
}

/** Finishers first by adjusted time; DNF last. Tie-break by participantId. */
export function compareTypeRaceResults(a: TypeRacePlayerResult, b: TypeRacePlayerResult): number {
  if (a.finished !== b.finished) {
    return a.finished ? -1 : 1;
  }
  if (a.finished && b.finished && a.adjustedMs !== b.adjustedMs) {
    return a.adjustedMs - b.adjustedMs;
  }
  return a.participantId.localeCompare(b.participantId);
}

/**
 * Ranks players and awards 1 Friday Fusion point to each tied winner
 * (lowest adjusted time among finishers). DNF players get 0.
 */
export function computeTypeRaceStandings(results: readonly TypeRacePlayerResult[]): TypeRaceStanding[] {
  const sorted = [...results].sort(compareTypeRaceResults);
  const bestAdjusted = sorted.find((r) => r.finished)?.adjustedMs;
  return sorted.map((row, index) => {
    const isWinner =
      row.finished && bestAdjusted !== undefined && row.adjustedMs === bestAdjusted;
    return {
      ...row,
      place: index + 1,
      ffPoints: isWinner ? 1 : 0
    };
  });
}

export function buildTypeRacePlayerResult(input: {
  participantId: string;
  finished: boolean;
  elapsedMs: number;
  submittedText: string;
  prompt: string;
}): TypeRacePlayerResult {
  if (!input.finished) {
    return {
      participantId: input.participantId,
      finished: false,
      elapsedMs: 0,
      submittedText: "",
      correct: 0,
      errors: 0,
      accuracy: 0,
      penaltyMs: 0,
      /** Unused for ranking (finished flag sorts first); kept finite for JSON. */
      adjustedMs: 0,
      wordsPerMinute: 0
    };
  }
  const compared = compareTypeRaceTexts(input.prompt, input.submittedText);
  const elapsedMs = Math.max(0, input.elapsedMs);
  const penaltyMs = typeRacePenaltyMs(compared.errors);
  const adjustedMs = typeRaceAdjustedMs(elapsedMs, compared.errors);
  return {
    participantId: input.participantId,
    finished: true,
    elapsedMs,
    submittedText: input.submittedText,
    correct: compared.correct,
    errors: compared.errors,
    accuracy: compared.accuracy,
    penaltyMs,
    adjustedMs,
    wordsPerMinute: typeRaceWordsPerMinute(compared.correct, elapsedMs)
  };
}
