import { randomInt } from "node:crypto";
import { nanoid } from "nanoid";
import type {
  WheelOfFortunePhase,
  WheelOfFortunePuzzleSource,
  WheelOfFortuneState
} from "../../shared/contracts";
import {
  WHEEL_OF_FORTUNE_BONUS_EXTRA_CONSONANTS,
  WHEEL_OF_FORTUNE_BONUS_EXTRA_VOWELS,
  WHEEL_OF_FORTUNE_BONUS_GIVEN_LETTERS,
  WHEEL_OF_FORTUNE_BONUS_SOLVE_MS,
  WHEEL_OF_FORTUNE_ROUNDS,
  WHEEL_OF_FORTUNE_SPIN_MAX_MS,
  WHEEL_OF_FORTUNE_SPIN_MIN_MS,
  WHEEL_OF_FORTUNE_VOWEL_COST,
  WHEEL_WEDGES,
  WHEEL_WEDGE_COUNT,
  bankRoundWinnings,
  bonusFfPoints,
  computeFinalRotationDeg,
  countLetterOccurrences,
  fridayFusionPointsFromMoney,
  isConsonant,
  isVowel,
  maskPuzzle,
  nextPlayerInOrder,
  normalizeLetter,
  pickMoneyLeader,
  puzzleFullyRevealed,
  solutionsMatch
} from "../../shared/wheelOfFortuneLogic";
import type { WheelOfFortunePuzzle } from "./wheelOfFortunePuzzles";

export type WheelOfFortuneGameInternal = {
  id: string;
  type: "wheelOfFortune";
  status: "setup" | "playing" | "spinning" | "bonusLetterPick" | "bonusSolve" | "finished";
  puzzleSource: WheelOfFortunePuzzleSource;
  /** Round puzzles (length 4) + bonus as last entry when present. */
  puzzles: WheelOfFortunePuzzle[];
  /** 0-based index into puzzles for the active main-game round. */
  roundIndex: number;
  playerOrder: string[];
  currentTurnId: string | null;
  phase: WheelOfFortunePhase;
  revealedLetters: string[];
  usedLetters: string[];
  roundMoney: Record<string, number>;
  bankedMoney: Record<string, number>;
  freeSpinTokens: Record<string, number>;
  pendingWedgeIndex: number | null;
  spinStartedAt: number | null;
  spinEndsAt: number | null;
  targetWedgeIndex: number | null;
  finalRotationDeg: number | null;
  lastOutcome: string | null;
  bonusPlayerId: string | null;
  bonusEndsAt: number | null;
  bonusSolved: boolean;
  scoresApplied: boolean;
  usedPuzzleIds: string[];
  /** When Free Spin can rescue a miss / LAT / bankrupt. */
  freeSpinPending: boolean;
  freeSpinReason: string | null;
};

const emptyMoneyMaps = (playerIds: readonly string[]) => {
  const roundMoney: Record<string, number> = {};
  const bankedMoney: Record<string, number> = {};
  const freeSpinTokens: Record<string, number> = {};
  for (const id of playerIds) {
    roundMoney[id] = 0;
    bankedMoney[id] = 0;
    freeSpinTokens[id] = 0;
  }
  return { roundMoney, bankedMoney, freeSpinTokens };
};

export function createWheelOfFortuneGame(opts: {
  playerOrder: string[];
  puzzleSource: WheelOfFortunePuzzleSource;
  puzzles?: WheelOfFortunePuzzle[];
  usedPuzzleIds?: string[];
}): WheelOfFortuneGameInternal {
  const maps = emptyMoneyMaps(opts.playerOrder);
  const isCustom = opts.puzzleSource === "custom";
  const puzzles = opts.puzzles ?? [];
  const ready = !isCustom && puzzles.length >= WHEEL_OF_FORTUNE_ROUNDS + 1;
  const game: WheelOfFortuneGameInternal = {
    id: nanoid(6),
    type: "wheelOfFortune",
    status: ready ? "playing" : "setup",
    puzzleSource: opts.puzzleSource,
    puzzles,
    roundIndex: 0,
    playerOrder: [...opts.playerOrder],
    currentTurnId: opts.playerOrder[0] ?? null,
    phase: "awaitingAction",
    revealedLetters: [],
    usedLetters: [],
    ...maps,
    pendingWedgeIndex: null,
    spinStartedAt: null,
    spinEndsAt: null,
    targetWedgeIndex: null,
    finalRotationDeg: null,
    lastOutcome: null,
    bonusPlayerId: null,
    bonusEndsAt: null,
    bonusSolved: false,
    scoresApplied: false,
    usedPuzzleIds: [...(opts.usedPuzzleIds ?? [])],
    freeSpinPending: false,
    freeSpinReason: null
  };
  if (ready) {
    beginRound(game, 0);
  }
  return game;
}

export function hydrateWheelOfFortuneGame(
  raw: Partial<WheelOfFortuneGameInternal> & { type: "wheelOfFortune" }
): WheelOfFortuneGameInternal {
  const playerOrder = Array.isArray(raw.playerOrder)
    ? raw.playerOrder.filter((id) => typeof id === "string" && id.length > 0)
    : [];
  const base = createWheelOfFortuneGame({
    playerOrder,
    puzzleSource: raw.puzzleSource === "custom" ? "custom" : "bank",
    puzzles: [],
    usedPuzzleIds: Array.isArray(raw.usedPuzzleIds) ? raw.usedPuzzleIds : []
  });
  const status =
    raw.status === "setup"
    || raw.status === "playing"
    || raw.status === "spinning"
    || raw.status === "bonusLetterPick"
    || raw.status === "bonusSolve"
    || raw.status === "finished"
      ? raw.status
      : "setup";
  // Don't restore mid-spin / mid-bonus timers after restart — settle safely.
  const restoredStatus = status === "spinning" ? "playing" : status === "bonusSolve" ? "bonusLetterPick" : status;
  const puzzles = Array.isArray(raw.puzzles)
    ? raw.puzzles
        .filter((p) => p && typeof p.category === "string" && typeof p.answer === "string")
        .map((p) => ({
          id: typeof p.id === "string" ? p.id : nanoid(6),
          category: p.category,
          answer: p.answer.toUpperCase()
        }))
    : [];
  return {
    ...base,
    id: typeof raw.id === "string" ? raw.id : base.id,
    status: restoredStatus,
    puzzles,
    roundIndex: Math.min(
      Math.max(0, Number(raw.roundIndex) || 0),
      Math.max(0, WHEEL_OF_FORTUNE_ROUNDS - 1)
    ),
    currentTurnId: typeof raw.currentTurnId === "string" ? raw.currentTurnId : base.currentTurnId,
    phase:
      raw.phase === "awaitingLetter"
      || raw.phase === "freeSpinPrompt"
      || raw.phase === "roundSolved"
      || raw.phase === "awaitingAction"
        ? raw.phase
        : "awaitingAction",
    revealedLetters: Array.isArray(raw.revealedLetters)
      ? raw.revealedLetters.filter((l) => typeof l === "string").map((l) => l.toUpperCase())
      : [],
    usedLetters: Array.isArray(raw.usedLetters)
      ? raw.usedLetters.filter((l) => typeof l === "string").map((l) => l.toUpperCase())
      : [],
    roundMoney: raw.roundMoney && typeof raw.roundMoney === "object" ? { ...raw.roundMoney } : base.roundMoney,
    bankedMoney: raw.bankedMoney && typeof raw.bankedMoney === "object" ? { ...raw.bankedMoney } : base.bankedMoney,
    freeSpinTokens:
      raw.freeSpinTokens && typeof raw.freeSpinTokens === "object" ? { ...raw.freeSpinTokens } : base.freeSpinTokens,
    pendingWedgeIndex: typeof raw.pendingWedgeIndex === "number" ? raw.pendingWedgeIndex : null,
    spinStartedAt: null,
    spinEndsAt: null,
    targetWedgeIndex: null,
    finalRotationDeg: null,
    lastOutcome: typeof raw.lastOutcome === "string" ? raw.lastOutcome : null,
    bonusPlayerId: typeof raw.bonusPlayerId === "string" ? raw.bonusPlayerId : null,
    bonusEndsAt: null,
    bonusSolved: raw.bonusSolved === true,
    scoresApplied: raw.scoresApplied === true,
    freeSpinPending: raw.freeSpinPending === true,
    freeSpinReason: typeof raw.freeSpinReason === "string" ? raw.freeSpinReason : null
  };
}

const currentPuzzle = (game: WheelOfFortuneGameInternal): WheelOfFortunePuzzle => {
  const puzzle = game.puzzles[game.roundIndex];
  if (!puzzle) {
    throw new Error("Wheel of Fortune puzzle is missing.");
  }
  return puzzle;
};

const bonusPuzzle = (game: WheelOfFortuneGameInternal): WheelOfFortunePuzzle => {
  const puzzle = game.puzzles[WHEEL_OF_FORTUNE_ROUNDS];
  if (!puzzle) {
    throw new Error("Wheel of Fortune bonus puzzle is missing.");
  }
  return puzzle;
};

const ensureMoneyKeys = (game: WheelOfFortuneGameInternal, participantId: string): void => {
  if (game.roundMoney[participantId] === undefined) {
    game.roundMoney[participantId] = 0;
  }
  if (game.bankedMoney[participantId] === undefined) {
    game.bankedMoney[participantId] = 0;
  }
  if (game.freeSpinTokens[participantId] === undefined) {
    game.freeSpinTokens[participantId] = 0;
  }
};

function beginRound(game: WheelOfFortuneGameInternal, roundIndex: number): void {
  game.roundIndex = roundIndex;
  game.status = "playing";
  game.phase = "awaitingAction";
  game.revealedLetters = [];
  game.usedLetters = [];
  game.pendingWedgeIndex = null;
  game.spinStartedAt = null;
  game.spinEndsAt = null;
  game.targetWedgeIndex = null;
  game.finalRotationDeg = null;
  game.freeSpinPending = false;
  game.freeSpinReason = null;
  for (const id of Object.keys(game.roundMoney)) {
    game.roundMoney[id] = 0;
  }
  // Solver of previous round starts next; first round uses seat 0.
  if (!game.currentTurnId || !game.playerOrder.includes(game.currentTurnId)) {
    game.currentTurnId = game.playerOrder[0] ?? null;
  }
  const puzzle = currentPuzzle(game);
  game.lastOutcome = `Round ${roundIndex + 1}: ${puzzle.category}`;
}

function moneyMapsPublic(game: WheelOfFortuneGameInternal) {
  return {
    playerOrder: [...game.playerOrder],
    roundMoney: { ...game.roundMoney },
    bankedMoney: { ...game.bankedMoney },
    freeSpinTokens: { ...game.freeSpinTokens }
  };
}

function boardPublic(game: WheelOfFortuneGameInternal) {
  const puzzle = currentPuzzle(game);
  return {
    roundIndex: game.roundIndex + 1,
    category: puzzle.category,
    maskedBoard: maskPuzzle(puzzle.answer, game.revealedLetters),
    usedLetters: [...game.usedLetters].sort(),
    currentTurnId: game.currentTurnId,
    phase: game.phase,
    pendingWedgeIndex: game.pendingWedgeIndex,
    lastOutcome: game.lastOutcome,
    ...moneyMapsPublic(game)
  };
}

export function toPublicWheelOfFortuneState(game: WheelOfFortuneGameInternal): WheelOfFortuneState {
  if (game.status === "setup") {
    return {
      status: "setup",
      puzzleSource: game.puzzleSource,
      playerOrder: [...game.playerOrder]
    };
  }
  if (game.status === "spinning") {
    return {
      status: "spinning",
      ...boardPublic(game),
      spinStartedAt: game.spinStartedAt ?? Date.now(),
      spinEndsAt: game.spinEndsAt ?? Date.now(),
      targetWedgeIndex: game.targetWedgeIndex ?? 0,
      finalRotationDeg: game.finalRotationDeg ?? 0
    };
  }
  if (game.status === "bonusLetterPick" || game.status === "bonusSolve") {
    const puzzle = bonusPuzzle(game);
    const common = {
      category: puzzle.category,
      maskedBoard: maskPuzzle(puzzle.answer, game.revealedLetters),
      usedLetters: [...game.usedLetters].sort(),
      bonusPlayerId: game.bonusPlayerId!,
      lastOutcome: game.lastOutcome,
      ...moneyMapsPublic(game)
    };
    if (game.status === "bonusLetterPick") {
      return { status: "bonusLetterPick", ...common };
    }
    return {
      status: "bonusSolve",
      ...common,
      bonusEndsAt: game.bonusEndsAt ?? Date.now() + WHEEL_OF_FORTUNE_BONUS_SOLVE_MS
    };
  }
  if (game.status === "finished") {
    const lastMain = game.puzzles[Math.min(game.roundIndex, WHEEL_OF_FORTUNE_ROUNDS - 1)];
    const bonus = game.puzzles[WHEEL_OF_FORTUNE_ROUNDS];
    const revealPuzzle = game.bonusPlayerId && bonus ? bonus : lastMain;
    return {
      status: "finished",
      category: revealPuzzle?.category ?? null,
      revealedBoard: revealPuzzle?.answer ?? null,
      bonusPlayerId: game.bonusPlayerId,
      bonusSolved: game.bonusSolved,
      lastOutcome: game.lastOutcome,
      ...moneyMapsPublic(game)
    };
  }
  return {
    status: "playing",
    ...boardPublic(game)
  };
}

export function setWheelOfFortunePuzzles(
  game: WheelOfFortuneGameInternal,
  puzzles: WheelOfFortunePuzzle[]
): void {
  if (game.status !== "setup") {
    throw new Error("Puzzles can only be set during setup.");
  }
  if (puzzles.length !== WHEEL_OF_FORTUNE_ROUNDS + 1) {
    throw new Error(`Provide exactly ${WHEEL_OF_FORTUNE_ROUNDS + 1} puzzles (4 rounds + bonus).`);
  }
  game.puzzles = puzzles.map((p) => ({
    id: p.id,
    category: p.category,
    answer: p.answer.toUpperCase()
  }));
  for (const p of game.puzzles) {
    if (!game.usedPuzzleIds.includes(p.id) && !p.id.startsWith("custom-")) {
      game.usedPuzzleIds.push(p.id);
    }
  }
  beginRound(game, 0);
}

function endTurn(game: WheelOfFortuneGameInternal, message: string): void {
  game.pendingWedgeIndex = null;
  game.phase = "awaitingAction";
  game.freeSpinPending = false;
  game.freeSpinReason = null;
  game.lastOutcome = message;
  game.currentTurnId = nextPlayerInOrder(game.playerOrder, game.currentTurnId);
}

function offerOrEndTurn(game: WheelOfFortuneGameInternal, participantId: string, message: string): void {
  const tokens = game.freeSpinTokens[participantId] ?? 0;
  if (tokens > 0) {
    game.freeSpinPending = true;
    game.freeSpinReason = message;
    game.phase = "freeSpinPrompt";
    game.lastOutcome = `${message} Use a Free Spin?`;
    return;
  }
  endTurn(game, message);
}

export function startWheelSpin(game: WheelOfFortuneGameInternal, participantId: string, now = Date.now()): void {
  if (game.status !== "playing" || game.phase !== "awaitingAction") {
    throw new Error("You can only spin when it is your turn to act.");
  }
  if (game.currentTurnId !== participantId) {
    throw new Error("It is not your turn.");
  }
  const targetWedgeIndex = randomInt(0, WHEEL_WEDGE_COUNT);
  const extraTurns = 4 + randomInt(0, 3);
  const duration = WHEEL_OF_FORTUNE_SPIN_MIN_MS + randomInt(0, WHEEL_OF_FORTUNE_SPIN_MAX_MS - WHEEL_OF_FORTUNE_SPIN_MIN_MS + 1);
  game.status = "spinning";
  game.spinStartedAt = now;
  game.spinEndsAt = now + duration;
  game.targetWedgeIndex = targetWedgeIndex;
  game.finalRotationDeg = computeFinalRotationDeg(targetWedgeIndex, extraTurns);
  game.pendingWedgeIndex = targetWedgeIndex;
  game.lastOutcome = "Spinning…";
}

/** Called when the spin timer elapses. */
export function settleWheelSpin(game: WheelOfFortuneGameInternal): void {
  if (game.status !== "spinning" || game.targetWedgeIndex === null) {
    return;
  }
  const wedge = WHEEL_WEDGES[game.targetWedgeIndex]!;
  const turnId = game.currentTurnId;
  game.status = "playing";
  game.spinStartedAt = null;
  game.spinEndsAt = null;
  game.finalRotationDeg = null;

  if (!turnId) {
    game.phase = "awaitingAction";
    return;
  }
  ensureMoneyKeys(game, turnId);

  if (wedge.kind === "bankrupt") {
    game.roundMoney[turnId] = 0;
    offerOrEndTurn(game, turnId, "Bankrupt!");
    return;
  }
  if (wedge.kind === "loseATurn") {
    offerOrEndTurn(game, turnId, "Lose a Turn!");
    return;
  }
  game.pendingWedgeIndex = game.targetWedgeIndex;
  game.phase = "awaitingLetter";
  game.lastOutcome = wedge.freeSpin
    ? `$${wedge.value} + Free Spin — call a consonant`
    : `${wedge.label} — call a consonant`;
}

export function callConsonant(game: WheelOfFortuneGameInternal, participantId: string, rawLetter: string): void {
  if (game.status !== "playing" || game.phase !== "awaitingLetter") {
    throw new Error("Call a consonant after spinning a cash wedge.");
  }
  if (game.currentTurnId !== participantId) {
    throw new Error("It is not your turn.");
  }
  if (game.pendingWedgeIndex === null) {
    throw new Error("No wedge value pending.");
  }
  const letter = normalizeLetter(rawLetter);
  if (!isConsonant(letter)) {
    throw new Error("Guess a consonant.");
  }
  if (game.usedLetters.includes(letter)) {
    throw new Error("That letter was already called.");
  }
  const wedge = WHEEL_WEDGES[game.pendingWedgeIndex]!;
  const puzzle = currentPuzzle(game);
  game.usedLetters.push(letter);
  const count = countLetterOccurrences(puzzle.answer, letter);
  if (count === 0) {
    offerOrEndTurn(game, participantId, `No ${letter}.`);
    return;
  }
  if (!game.revealedLetters.includes(letter)) {
    game.revealedLetters.push(letter);
  }
  ensureMoneyKeys(game, participantId);
  const earned = wedge.value * count;
  game.roundMoney[participantId] = (game.roundMoney[participantId] ?? 0) + earned;
  if (wedge.freeSpin) {
    game.freeSpinTokens[participantId] = (game.freeSpinTokens[participantId] ?? 0) + 1;
  }
  game.pendingWedgeIndex = null;
  game.phase = "awaitingAction";
  game.lastOutcome = wedge.freeSpin
    ? `${letter} × ${count} = $${earned} + Free Spin!`
    : `${letter} × ${count} = $${earned}`;
  if (puzzleFullyRevealed(puzzle.answer, game.revealedLetters)) {
    solveRoundFor(game, participantId, puzzle.answer);
  }
}

export function buyVowel(game: WheelOfFortuneGameInternal, participantId: string, rawLetter: string): void {
  if (game.status !== "playing" || game.phase !== "awaitingAction") {
    throw new Error("Buy a vowel on your turn before spinning.");
  }
  if (game.currentTurnId !== participantId) {
    throw new Error("It is not your turn.");
  }
  const letter = normalizeLetter(rawLetter);
  if (!isVowel(letter)) {
    throw new Error("Buy a vowel (A, E, I, O, or U).");
  }
  if (game.usedLetters.includes(letter)) {
    throw new Error("That letter was already called.");
  }
  ensureMoneyKeys(game, participantId);
  const round = game.roundMoney[participantId] ?? 0;
  if (round < WHEEL_OF_FORTUNE_VOWEL_COST) {
    throw new Error(`You need $${WHEEL_OF_FORTUNE_VOWEL_COST} in round money to buy a vowel.`);
  }
  game.roundMoney[participantId] = round - WHEEL_OF_FORTUNE_VOWEL_COST;
  game.usedLetters.push(letter);
  const puzzle = currentPuzzle(game);
  const count = countLetterOccurrences(puzzle.answer, letter);
  if (count === 0) {
    offerOrEndTurn(game, participantId, `No ${letter}.`);
    return;
  }
  if (!game.revealedLetters.includes(letter)) {
    game.revealedLetters.push(letter);
  }
  game.lastOutcome = `${letter} appears ${count}× (−$${WHEEL_OF_FORTUNE_VOWEL_COST})`;
  if (puzzleFullyRevealed(puzzle.answer, game.revealedLetters)) {
    solveRoundFor(game, participantId, puzzle.answer);
  }
}

function solveRoundFor(game: WheelOfFortuneGameInternal, participantId: string, answer: string): void {
  ensureMoneyKeys(game, participantId);
  const banked = bankRoundWinnings(game.roundMoney[participantId] ?? 0);
  game.bankedMoney[participantId] = (game.bankedMoney[participantId] ?? 0) + banked;
  for (const id of Object.keys(game.roundMoney)) {
    game.roundMoney[id] = 0;
  }
  // Reveal full puzzle.
  const letters = new Set(game.revealedLetters);
  for (const ch of answer.toUpperCase()) {
    if (ch >= "A" && ch <= "Z") {
      letters.add(ch);
    }
  }
  game.revealedLetters = [...letters];
  game.phase = "roundSolved";
  game.pendingWedgeIndex = null;
  game.freeSpinPending = false;
  game.currentTurnId = participantId;
  game.lastOutcome = `${answer} — banks $${banked}!`;
}

export function solvePuzzle(game: WheelOfFortuneGameInternal, participantId: string, guess: string): void {
  if (game.status !== "playing") {
    throw new Error("Cannot solve right now.");
  }
  if (game.phase !== "awaitingAction" && game.phase !== "awaitingLetter") {
    throw new Error("Cannot solve right now.");
  }
  if (game.currentTurnId !== participantId) {
    throw new Error("It is not your turn.");
  }
  const puzzle = currentPuzzle(game);
  if (!solutionsMatch(guess, puzzle.answer)) {
    offerOrEndTurn(game, participantId, "Incorrect solve.");
    return;
  }
  solveRoundFor(game, participantId, puzzle.answer);
}

export function respondFreeSpin(game: WheelOfFortuneGameInternal, participantId: string, use: boolean): void {
  if (game.status !== "playing" || game.phase !== "freeSpinPrompt") {
    throw new Error("No Free Spin decision pending.");
  }
  if (game.currentTurnId !== participantId) {
    throw new Error("It is not your turn.");
  }
  const reason = game.freeSpinReason ?? "Turn ends.";
  if (!use) {
    endTurn(game, reason);
    return;
  }
  const tokens = game.freeSpinTokens[participantId] ?? 0;
  if (tokens <= 0) {
    endTurn(game, reason);
    return;
  }
  game.freeSpinTokens[participantId] = tokens - 1;
  game.freeSpinPending = false;
  game.freeSpinReason = null;
  game.pendingWedgeIndex = null;
  game.phase = "awaitingAction";
  game.lastOutcome = "Free Spin used — keep playing!";
}

export function continueAfterRound(game: WheelOfFortuneGameInternal): void {
  if (game.status !== "playing" || game.phase !== "roundSolved") {
    throw new Error("No round to continue from.");
  }
  const nextRound = game.roundIndex + 1;
  if (nextRound < WHEEL_OF_FORTUNE_ROUNDS) {
    beginRound(game, nextRound);
    return;
  }
  startBonusRound(game);
}

function startBonusRound(game: WheelOfFortuneGameInternal): void {
  if (!game.puzzles[WHEEL_OF_FORTUNE_ROUNDS]) {
    finishGame(game, "No bonus puzzle — game over.");
    return;
  }
  const leader = pickMoneyLeader(game.playerOrder, game.bankedMoney, (n) => randomInt(0, n));
  if (!leader) {
    finishGame(game, "No players left for bonus.");
    return;
  }
  game.bonusPlayerId = leader;
  game.status = "bonusLetterPick";
  game.phase = "awaitingAction";
  game.revealedLetters = [...WHEEL_OF_FORTUNE_BONUS_GIVEN_LETTERS];
  game.usedLetters = [...WHEEL_OF_FORTUNE_BONUS_GIVEN_LETTERS];
  game.pendingWedgeIndex = null;
  game.currentTurnId = leader;
  const puzzle = bonusPuzzle(game);
  game.lastOutcome = `Bonus round for money leader — ${puzzle.category}`;
}

export function bonusPickLetters(
  game: WheelOfFortuneGameInternal,
  participantId: string,
  consonants: readonly string[],
  vowel: string
): void {
  if (game.status !== "bonusLetterPick") {
    throw new Error("Not picking bonus letters.");
  }
  if (game.bonusPlayerId !== participantId) {
    throw new Error("Only the bonus player can pick letters.");
  }
  if (consonants.length !== WHEEL_OF_FORTUNE_BONUS_EXTRA_CONSONANTS) {
    throw new Error(`Pick ${WHEEL_OF_FORTUNE_BONUS_EXTRA_CONSONANTS} consonants.`);
  }
  const normalizedCons = consonants.map(normalizeLetter);
  const normalizedVowel = normalizeLetter(vowel);
  if (new Set(normalizedCons).size !== normalizedCons.length) {
    throw new Error("Consonants must be unique.");
  }
  for (const c of normalizedCons) {
    if (!isConsonant(c)) {
      throw new Error("Bonus picks must be consonants.");
    }
    if (game.usedLetters.includes(c)) {
      throw new Error(`${c} is already given.`);
    }
  }
  if (!isVowel(normalizedVowel)) {
    throw new Error("Pick one vowel.");
  }
  if (game.usedLetters.includes(normalizedVowel) && normalizedVowel !== "E") {
    // E is already given; still allow picking another vowel only.
    throw new Error(`${normalizedVowel} is already given.`);
  }
  // TV still asks for an additional vowel even if E is present — reject duplicate E.
  if (normalizedVowel === "E") {
    throw new Error("E is already given — pick a different vowel.");
  }
  for (const c of normalizedCons) {
    game.usedLetters.push(c);
    game.revealedLetters.push(c);
  }
  game.usedLetters.push(normalizedVowel);
  game.revealedLetters.push(normalizedVowel);
  game.status = "bonusSolve";
  game.bonusEndsAt = Date.now() + WHEEL_OF_FORTUNE_BONUS_SOLVE_MS;
  game.lastOutcome = "Solve the bonus puzzle!";
}

export function bonusSolve(game: WheelOfFortuneGameInternal, participantId: string, guess: string): void {
  if (game.status !== "bonusSolve") {
    throw new Error("Bonus solve is not open.");
  }
  if (game.bonusPlayerId !== participantId) {
    throw new Error("Only the bonus player can solve.");
  }
  const puzzle = bonusPuzzle(game);
  if (solutionsMatch(guess, puzzle.answer)) {
    game.bonusSolved = true;
    // Reveal all.
    const letters = new Set(game.revealedLetters);
    for (const ch of puzzle.answer) {
      if (ch >= "A" && ch <= "Z") {
        letters.add(ch);
      }
    }
    game.revealedLetters = [...letters];
    finishGame(game, `Bonus solved: ${puzzle.answer}!`);
    return;
  }
  game.lastOutcome = "Incorrect bonus guess — keep trying!";
}

export function bonusTimedOut(game: WheelOfFortuneGameInternal): void {
  if (game.status !== "bonusSolve") {
    return;
  }
  const puzzle = bonusPuzzle(game);
  finishGame(game, `Time's up! The puzzle was ${puzzle.answer}.`);
}

function finishGame(game: WheelOfFortuneGameInternal, message: string): void {
  game.status = "finished";
  game.phase = "awaitingAction";
  game.bonusEndsAt = null;
  game.spinStartedAt = null;
  game.spinEndsAt = null;
  game.lastOutcome = message;
}

/**
 * Apply Friday Fusion points once. Returns awards applied for tests.
 * `sessionPlayerCount` is used for bonus FF (players at finish time).
 */
export function applyWheelOfFortuneScores(
  game: WheelOfFortuneGameInternal,
  award: (participantId: string, points: number) => void,
  sessionPlayerCount: number
): { moneyAwards: Record<string, number>; bonusAward: number } {
  if (game.scoresApplied) {
    return { moneyAwards: {}, bonusAward: 0 };
  }
  game.scoresApplied = true;
  const moneyAwards: Record<string, number> = {};
  const ids = new Set([...game.playerOrder, ...Object.keys(game.bankedMoney)]);
  for (const id of ids) {
    const pts = fridayFusionPointsFromMoney(game.bankedMoney[id] ?? 0);
    if (pts > 0) {
      award(id, pts);
      moneyAwards[id] = pts;
    }
  }
  let bonusAward = 0;
  if (game.bonusSolved && game.bonusPlayerId) {
    bonusAward = bonusFfPoints(sessionPlayerCount);
    if (bonusAward > 0) {
      award(game.bonusPlayerId, bonusAward);
    }
  }
  return { moneyAwards, bonusAward };
}

/**
 * Remove a leaving player from turn order only; keep money maps.
 * Returns whether the game should be considered finished.
 */
export function detachWheelOfFortunePlayer(
  game: WheelOfFortuneGameInternal,
  participantId: string
): { finished: boolean } {
  if (game.status === "finished" || game.status === "setup") {
    game.playerOrder = game.playerOrder.filter((id) => id !== participantId);
    return { finished: false };
  }

  const wasCurrent = game.currentTurnId === participantId;
  const wasBonus = game.bonusPlayerId === participantId;
  const removedIdx = game.playerOrder.indexOf(participantId);
  game.playerOrder = game.playerOrder.filter((id) => id !== participantId);

  if (wasBonus && (game.status === "bonusLetterPick" || game.status === "bonusSolve")) {
    finishGame(game, "Bonus player left — game over.");
    return { finished: true };
  }

  if (game.playerOrder.length < 2) {
    finishGame(game, "Not enough players remaining.");
    return { finished: true };
  }

  if (wasCurrent) {
    game.status = game.status === "spinning" ? "playing" : game.status;
    game.spinStartedAt = null;
    game.spinEndsAt = null;
    game.targetWedgeIndex = null;
    game.finalRotationDeg = null;
    game.pendingWedgeIndex = null;
    game.freeSpinPending = false;
    game.freeSpinReason = null;
    game.phase = "awaitingAction";
    if (removedIdx >= 0 && game.playerOrder.length > 0) {
      game.currentTurnId = game.playerOrder[removedIdx % game.playerOrder.length]!;
    } else {
      game.currentTurnId = game.playerOrder[0] ?? null;
    }
    game.lastOutcome = "Player left — turn advances.";
  } else if (game.currentTurnId && !game.playerOrder.includes(game.currentTurnId)) {
    game.currentTurnId = game.playerOrder[0] ?? null;
  }

  return { finished: false };
}

export function wheelSpinEndsAt(game: WheelOfFortuneGameInternal): number | null {
  return game.status === "spinning" ? game.spinEndsAt : null;
}

export function wheelBonusEndsAt(game: WheelOfFortuneGameInternal): number | null {
  return game.status === "bonusSolve" ? game.bonusEndsAt : null;
}

export { WHEEL_WEDGES, WHEEL_OF_FORTUNE_BONUS_EXTRA_VOWELS };
