/** Pure Friendly Feud matching and round helpers (no I/O). */

export type FriendlyFeudTeamId = "A" | "B";

export type FriendlyFeudBoardAnswer = {
  ans: string;
  pnt: number;
  /** Additional acceptable phrasings (synonyms / slash-parts). Not shown on the board. */
  alts?: readonly string[];
};

export const FRIENDLY_FEUD_ROUNDS_PER_GAME = 3;
export const FRIENDLY_FEUD_MAX_STRIKES = 3;

export function friendlyFeudRoundMultiplier(roundIndex: number): number {
  return roundIndex >= 2 ? 2 : 1;
}

export function otherFriendlyFeudTeam(team: FriendlyFeudTeamId): FriendlyFeudTeamId {
  return team === "A" ? "B" : "A";
}

export function normalizeFriendlyFeudGuess(raw: string): string {
  let s = raw
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  s = s.replace(/^(a|an|the)\s+/, "");
  return s.trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  if (a.length === 0) {
    return b.length;
  }
  if (b.length === 0) {
    return a.length;
  }
  const rows = a.length + 1;
  const cols = b.length + 1;
  const prev = new Array<number>(cols);
  const curr = new Array<number>(cols);
  for (let j = 0; j < cols; j++) {
    prev[j] = j;
  }
  for (let i = 1; i < rows; i++) {
    curr[0] = i;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j < cols; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(prev[j]! + 1, curr[j - 1]! + 1, prev[j - 1]! + cost);
    }
    for (let j = 0; j < cols; j++) {
      prev[j] = curr[j]!;
    }
  }
  return prev[b.length]!;
}

function maxEditDistance(len: number): number {
  if (len <= 3) {
    return 0;
  }
  if (len <= 6) {
    return 1;
  }
  if (len <= 10) {
    return 2;
  }
  return 3;
}

export type FriendlyFeudMatchResult = {
  index: number;
  ans: string;
  pnt: number;
  score: number;
};

/**
 * Find the best unrevealed board answer matching `guess`.
 * Prefer exact normalized match, then containment (shorter length >= 4),
 * then small Levenshtein. Also checks optional `alts` on each answer.
 * Ties break toward higher board points.
 */
export function matchFriendlyFeudGuess(
  guess: string,
  answers: readonly FriendlyFeudBoardAnswer[],
  revealed: ReadonlyArray<boolean>
): FriendlyFeudMatchResult | null {
  const normalizedGuess = normalizeFriendlyFeudGuess(guess);
  if (normalizedGuess.length === 0) {
    return null;
  }

  let best: FriendlyFeudMatchResult | null = null;

  for (let i = 0; i < answers.length; i++) {
    if (revealed[i]) {
      continue;
    }
    const answer = answers[i]!;
    const phrases = [answer.ans, ...(answer.alts ?? [])];
    let bestPhraseScore = -1;
    for (const phrase of phrases) {
      const score = scoreGuessAgainstPhrase(normalizedGuess, phrase);
      if (score > bestPhraseScore) {
        bestPhraseScore = score;
      }
    }
    if (bestPhraseScore < 0) {
      continue;
    }
    const candidate: FriendlyFeudMatchResult = {
      index: i,
      ans: answer.ans,
      pnt: answer.pnt,
      score: bestPhraseScore
    };
    if (
      !best
      || candidate.score > best.score
      || (candidate.score === best.score && candidate.pnt > best.pnt)
      || (candidate.score === best.score && candidate.pnt === best.pnt && candidate.index < best.index)
    ) {
      best = candidate;
    }
  }

  return best;
}

function scoreGuessAgainstPhrase(normalizedGuess: string, phrase: string): number {
  const normalizedAnswer = normalizeFriendlyFeudGuess(phrase);
  if (normalizedAnswer.length === 0) {
    return -1;
  }
  if (normalizedGuess === normalizedAnswer) {
    return 1000;
  }
  const shorter = normalizedGuess.length <= normalizedAnswer.length ? normalizedGuess : normalizedAnswer;
  const longer = normalizedGuess.length <= normalizedAnswer.length ? normalizedAnswer : normalizedGuess;
  if (shorter.length >= 4 && longer.includes(shorter)) {
    return 800 + shorter.length;
  }
  const dist = levenshtein(normalizedGuess, normalizedAnswer);
  const allowed = maxEditDistance(Math.max(normalizedGuess.length, normalizedAnswer.length));
  if (dist <= allowed) {
    return 500 - dist * 40 - Math.abs(normalizedGuess.length - normalizedAnswer.length);
  }
  return -1;
}

/** Face-off: decide who wins control after one or two guesses. */
export type FaceOffGuess = {
  team: FriendlyFeudTeamId;
  matchIndex: number | null;
};

export type FaceOffControlResult =
  | { kind: "control"; team: FriendlyFeudTeamId; matchIndex: number | null }
  | { kind: "needSecond" }
  | { kind: "redo" };

/**
 * Apply TV-style face-off rules.
 * - First guess hits #1 → that team wins control immediately.
 * - First guess hits any other answer → second player still answers; higher rank (lower index) wins.
 * - First miss → second answers; any hit wins for second; both miss → redo.
 */
export function resolveFaceOffControl(
  first: FaceOffGuess,
  second: FaceOffGuess | null
): FaceOffControlResult {
  if (first.matchIndex === 0) {
    return { kind: "control", team: first.team, matchIndex: 0 };
  }
  if (second === null) {
    return { kind: "needSecond" };
  }
  if (first.matchIndex === null && second.matchIndex === null) {
    return { kind: "redo" };
  }
  if (first.matchIndex === null) {
    return { kind: "control", team: second.team, matchIndex: second.matchIndex };
  }
  if (second.matchIndex === null) {
    return { kind: "control", team: first.team, matchIndex: first.matchIndex };
  }
  if (first.matchIndex === second.matchIndex) {
    // Same slot shouldn't happen once revealed; treat as first keeps control.
    return { kind: "control", team: first.team, matchIndex: first.matchIndex };
  }
  const winner = first.matchIndex < second.matchIndex ? first : second;
  return { kind: "control", team: winner.team, matchIndex: winner.matchIndex };
}

/** Next player in a roster after `currentId` (wraps). */
export function nextFriendlyFeudRotator(
  roster: readonly string[],
  currentId: string | null
): string | null {
  if (roster.length === 0) {
    return null;
  }
  if (currentId === null) {
    return roster[0] ?? null;
  }
  const idx = roster.indexOf(currentId);
  if (idx < 0) {
    return roster[0] ?? null;
  }
  return roster[(idx + 1) % roster.length] ?? null;
}

export function pickFriendlyFeudWinners(teamScores: { A: number; B: number }): FriendlyFeudTeamId[] {
  if (teamScores.A > teamScores.B) {
    return ["A"];
  }
  if (teamScores.B > teamScores.A) {
    return ["B"];
  }
  return ["A", "B"];
}
