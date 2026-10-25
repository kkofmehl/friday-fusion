import { randomInt } from "node:crypto";
import { nanoid } from "nanoid";
import type {
  TrivialPursuitPhase,
  TrivialPursuitState,
  TrivialPursuitWedgeMode,
  TrivialPursuitWedges
} from "../../shared/contracts";
import {
  TRIVIAL_PURSUIT_CATEGORIES,
  TRIVIAL_PURSUIT_CHOICE_HELPS_PER_GAME,
  TRIVIAL_PURSUIT_CLOCK_DURATION_MS,
  TRIVIAL_PURSUIT_HUB_ID,
  TRIVIAL_PURSUIT_MAX_PLAYERS,
  TRIVIAL_PURSUIT_MIN_PLAYERS,
  TRIVIAL_PURSUIT_SHOW_QUESTION_CLOCK_DELAY_MS,
  categoryForSpace,
  emptyWedges,
  fridayFusionPointsForWin,
  getLegalDestinations,
  hasAllWedges,
  isRollAgainSpace,
  nextPlayerInOrder,
  pickReaderId,
  shouldAwardWedge,
  type TrivialPursuitCategory
} from "../../shared/trivialPursuitLogic";
import {
  loadInitialQuestionPools,
  poolNeedsRefill,
  refillCategoryPool,
  takeQuestion,
  type TrivialPursuitFetch,
  type TrivialPursuitQuestion,
  type TrivialPursuitQuestionPools
} from "./trivialPursuitQuestions";

export type TrivialPursuitPlayerInternal = {
  participantId: string;
  spaceId: string;
  wedges: TrivialPursuitWedges;
  choiceHelpsRemaining: number;
};

export type TrivialPursuitGameInternal = {
  id: string;
  type: "trivialPursuit";
  status: "playing" | "finished";
  phase: TrivialPursuitPhase;
  wedgeMode: TrivialPursuitWedgeMode;
  playerOrder: string[];
  players: Record<string, TrivialPursuitPlayerInternal>;
  currentTurnId: string | null;
  readerId: string | null;
  lastDieRoll: number | null;
  legalMoveSpaceIds: string[];
  activeCategory: TrivialPursuitCategory | null;
  activeQuestion: TrivialPursuitQuestion | null;
  questionShownAt: number | null;
  /** Reader shared MC choices with the answerer (not the correct mark). */
  choicesShownAt: number | null;
  clockEndsAt: number | null;
  answerRevealed: boolean;
  finalCategoryChooserId: string | null;
  /** Contestant must leave hub and return after a failed final. */
  awaitingHubReturn: boolean;
  winnerParticipantId: string | null;
  lastOutcome: string | null;
  questionError: string | null;
  pools: TrivialPursuitQuestionPools;
  usedQuestionIds: string[];
  scoresApplied: boolean;
};

const rollDie = (): number => randomInt(1, 7);

const playerList = (game: TrivialPursuitGameInternal): TrivialPursuitPlayerInternal[] =>
  game.playerOrder
    .map((id) => game.players[id])
    .filter((p): p is TrivialPursuitPlayerInternal => Boolean(p));

const contestant = (game: TrivialPursuitGameInternal): TrivialPursuitPlayerInternal | null =>
  game.currentTurnId ? game.players[game.currentTurnId] ?? null : null;

const clearCard = (game: TrivialPursuitGameInternal): void => {
  game.readerId = null;
  game.activeCategory = null;
  game.activeQuestion = null;
  game.questionShownAt = null;
  game.choicesShownAt = null;
  game.clockEndsAt = null;
  game.answerRevealed = false;
  game.questionError = null;
};

const beginRolling = (game: TrivialPursuitGameInternal): void => {
  game.phase = "rolling";
  game.lastDieRoll = null;
  game.legalMoveSpaceIds = [];
  clearCard(game);
  game.finalCategoryChooserId = null;
};

const beginChoosingMove = (game: TrivialPursuitGameInternal, roll: number): void => {
  const player = contestant(game);
  if (!player) {
    throw new Error("No current player.");
  }
  game.phase = "choosingMove";
  game.lastDieRoll = roll;
  game.legalMoveSpaceIds = getLegalDestinations(
    player.spaceId,
    roll,
    hasAllWedges(player.wedges)
  );
  clearCard(game);
};

const startQuestion = (
  game: TrivialPursuitGameInternal,
  category: TrivialPursuitCategory,
  random: () => number = Math.random
): void => {
  if (!game.currentTurnId) {
    throw new Error("No current player.");
  }
  const used = new Set(game.usedQuestionIds);
  let question = takeQuestion(game.pools, category, used);
  if (!question) {
    game.questionError = `No questions left for ${category}. Try again shortly.`;
    game.phase = "reading";
    game.activeCategory = category;
    game.activeQuestion = null;
    game.readerId = pickReaderId(game.playerOrder, game.currentTurnId, random);
    game.questionShownAt = null;
    game.choicesShownAt = null;
    game.clockEndsAt = null;
    game.answerRevealed = false;
    return;
  }
  game.usedQuestionIds.push(question.id);
  game.activeCategory = category;
  game.activeQuestion = question;
  game.readerId = pickReaderId(game.playerOrder, game.currentTurnId, random);
  game.questionShownAt = null;
  game.choicesShownAt = null;
  game.clockEndsAt = null;
  game.answerRevealed = false;
  game.questionError = null;
  game.phase = "reading";
  game.legalMoveSpaceIds = [];

  if (poolNeedsRefill(game.pools, category)) {
    void refillCategoryPool(game.pools, category, new Set(game.usedQuestionIds)).catch(() => {
      /* background refill best-effort */
    });
  }
};

export async function createTrivialPursuitGame(opts: {
  playerOrder: string[];
  fetchImpl?: TrivialPursuitFetch;
  usedQuestionIds?: string[];
  wedgeMode?: TrivialPursuitWedgeMode;
}): Promise<TrivialPursuitGameInternal> {
  if (
    opts.playerOrder.length < TRIVIAL_PURSUIT_MIN_PLAYERS
    || opts.playerOrder.length > TRIVIAL_PURSUIT_MAX_PLAYERS
  ) {
    throw new Error(
      `Trivial Pursuit needs ${TRIVIAL_PURSUIT_MIN_PLAYERS}–${TRIVIAL_PURSUIT_MAX_PLAYERS} active players.`
    );
  }
  const pools = await loadInitialQuestionPools({ fetchImpl: opts.fetchImpl });
  const players: Record<string, TrivialPursuitPlayerInternal> = {};
  for (const id of opts.playerOrder) {
    players[id] = {
      participantId: id,
      spaceId: TRIVIAL_PURSUIT_HUB_ID,
      wedges: emptyWedges(),
      choiceHelpsRemaining: TRIVIAL_PURSUIT_CHOICE_HELPS_PER_GAME
    };
  }
  const first = opts.playerOrder[randomInt(0, opts.playerOrder.length)]!;
  const game: TrivialPursuitGameInternal = {
    id: nanoid(6),
    type: "trivialPursuit",
    status: "playing",
    phase: "rolling",
    wedgeMode: opts.wedgeMode === "classic" ? "classic" : "fast",
    playerOrder: [...opts.playerOrder],
    players,
    currentTurnId: first,
    readerId: null,
    lastDieRoll: null,
    legalMoveSpaceIds: [],
    activeCategory: null,
    activeQuestion: null,
    questionShownAt: null,
    choicesShownAt: null,
    clockEndsAt: null,
    answerRevealed: false,
    finalCategoryChooserId: null,
    awaitingHubReturn: false,
    winnerParticipantId: null,
    lastOutcome: null,
    questionError: null,
    pools,
    usedQuestionIds: [...(opts.usedQuestionIds ?? [])],
    scoresApplied: false
  };
  return game;
}

export function hydrateTrivialPursuitGame(
  raw: Partial<TrivialPursuitGameInternal> & { type: "trivialPursuit" }
): TrivialPursuitGameInternal {
  const playerOrder = Array.isArray(raw.playerOrder)
    ? raw.playerOrder.filter((id) => typeof id === "string" && id.length > 0)
    : [];
  const players: Record<string, TrivialPursuitPlayerInternal> = {};
  for (const id of playerOrder) {
    const src = raw.players?.[id];
    const remaining =
      typeof src?.choiceHelpsRemaining === "number" && Number.isFinite(src.choiceHelpsRemaining)
        ? Math.max(0, Math.min(TRIVIAL_PURSUIT_CHOICE_HELPS_PER_GAME, Math.floor(src.choiceHelpsRemaining)))
        : TRIVIAL_PURSUIT_CHOICE_HELPS_PER_GAME;
    players[id] = {
      participantId: id,
      spaceId: typeof src?.spaceId === "string" ? src.spaceId : TRIVIAL_PURSUIT_HUB_ID,
      wedges: {
        ...emptyWedges(),
        ...(src?.wedges && typeof src.wedges === "object" ? src.wedges : {})
      },
      choiceHelpsRemaining: remaining
    };
  }
  const emptyPools = {} as TrivialPursuitQuestionPools;
  for (const c of TRIVIAL_PURSUIT_CATEGORIES) {
    emptyPools[c] = Array.isArray(raw.pools?.[c]) ? [...raw.pools![c]!] : [];
  }
  return {
    id: typeof raw.id === "string" ? raw.id : nanoid(6),
    type: "trivialPursuit",
    status: raw.status === "finished" ? "finished" : "playing",
    phase:
      raw.phase === "choosingMove"
      || raw.phase === "reading"
      || raw.phase === "judging"
      || raw.phase === "choosingFinalCategory"
      || raw.phase === "finished"
        ? raw.phase
        : "rolling",
    wedgeMode: raw.wedgeMode === "fast" ? "fast" : "classic",
    playerOrder,
    players,
    currentTurnId: typeof raw.currentTurnId === "string" ? raw.currentTurnId : playerOrder[0] ?? null,
    readerId: typeof raw.readerId === "string" ? raw.readerId : null,
    lastDieRoll:
      typeof raw.lastDieRoll === "number" && raw.lastDieRoll >= 1 && raw.lastDieRoll <= 6
        ? raw.lastDieRoll
        : null,
    legalMoveSpaceIds: Array.isArray(raw.legalMoveSpaceIds) ? raw.legalMoveSpaceIds : [],
    activeCategory:
      typeof raw.activeCategory === "string"
      && (TRIVIAL_PURSUIT_CATEGORIES as readonly string[]).includes(raw.activeCategory)
        ? (raw.activeCategory as TrivialPursuitCategory)
        : null,
    activeQuestion: raw.activeQuestion ?? null,
    questionShownAt: typeof raw.questionShownAt === "number" ? raw.questionShownAt : null,
    choicesShownAt: typeof raw.choicesShownAt === "number" ? raw.choicesShownAt : null,
    clockEndsAt: typeof raw.clockEndsAt === "number" ? raw.clockEndsAt : null,
    answerRevealed: raw.answerRevealed === true,
    finalCategoryChooserId:
      typeof raw.finalCategoryChooserId === "string" ? raw.finalCategoryChooserId : null,
    awaitingHubReturn: raw.awaitingHubReturn === true,
    winnerParticipantId:
      typeof raw.winnerParticipantId === "string" ? raw.winnerParticipantId : null,
    lastOutcome: typeof raw.lastOutcome === "string" ? raw.lastOutcome : null,
    questionError: typeof raw.questionError === "string" ? raw.questionError : null,
    pools: emptyPools,
    usedQuestionIds: Array.isArray(raw.usedQuestionIds) ? raw.usedQuestionIds : [],
    scoresApplied: raw.scoresApplied === true
  };
}

export function trivialPursuitRoll(game: TrivialPursuitGameInternal, participantId: string): void {
  if (game.status !== "playing" || game.phase !== "rolling") {
    throw new Error("It is not time to roll.");
  }
  if (participantId !== game.currentTurnId) {
    throw new Error("Only the current player can roll.");
  }
  game.lastOutcome = null;
  beginChoosingMove(game, rollDie());
  if (game.legalMoveSpaceIds.length === 0) {
    // Extremely unlikely; treat as pass.
    game.lastOutcome = "No legal moves — turn passes.";
    passTurn(game);
  }
}

export function trivialPursuitMove(
  game: TrivialPursuitGameInternal,
  participantId: string,
  spaceId: string,
  random: () => number = Math.random
): void {
  if (game.status !== "playing" || game.phase !== "choosingMove") {
    throw new Error("It is not time to move.");
  }
  if (participantId !== game.currentTurnId) {
    throw new Error("Only the current player can move.");
  }
  if (!game.legalMoveSpaceIds.includes(spaceId)) {
    throw new Error("That space is not a legal destination.");
  }
  const player = contestant(game);
  if (!player) throw new Error("No current player.");

  player.spaceId = spaceId;
  game.legalMoveSpaceIds = [];

  if (isRollAgainSpace(spaceId)) {
    game.lastOutcome = "Roll again!";
    beginRolling(game);
    return;
  }

  if (spaceId === TRIVIAL_PURSUIT_HUB_ID) {
    if (!hasAllWedges(player.wedges)) {
      throw new Error("You need all six wedges to enter the hub.");
    }
    if (game.awaitingHubReturn) {
      // Must leave and return; landing counts.
      game.awaitingHubReturn = false;
    }
    game.phase = "choosingFinalCategory";
    game.finalCategoryChooserId = nextPlayerInOrder(game.playerOrder, game.currentTurnId);
    clearCard(game);
    game.lastOutcome = "Final question — next player picks the category.";
    return;
  }

  const category = categoryForSpace(spaceId);
  if (!category) {
    throw new Error("Invalid landing space.");
  }
  startQuestion(game, category, random);
}

export function trivialPursuitChooseFinalCategory(
  game: TrivialPursuitGameInternal,
  participantId: string,
  category: TrivialPursuitCategory,
  random: () => number = Math.random
): void {
  if (game.status !== "playing" || game.phase !== "choosingFinalCategory") {
    throw new Error("It is not time to choose a final category.");
  }
  if (participantId !== game.finalCategoryChooserId) {
    throw new Error("Only the designated player can choose the final category.");
  }
  if (!(TRIVIAL_PURSUIT_CATEGORIES as readonly string[]).includes(category)) {
    throw new Error("Invalid category.");
  }
  startQuestion(game, category, random);
}

export function trivialPursuitShowQuestion(
  game: TrivialPursuitGameInternal,
  participantId: string,
  now = Date.now()
): void {
  if (game.status !== "playing" || (game.phase !== "reading" && game.phase !== "judging")) {
    throw new Error("No question is being read.");
  }
  if (participantId !== game.readerId) {
    throw new Error("Only the reader can reveal the question.");
  }
  if (!game.activeQuestion) {
    throw new Error("No question loaded.");
  }
  if (game.questionShownAt != null) {
    return;
  }
  game.questionShownAt = now;
}

/** Answerer spends one game-wide choice help to see MC options for the current question. */
export function trivialPursuitRequestChoices(
  game: TrivialPursuitGameInternal,
  participantId: string,
  now = Date.now()
): void {
  if (game.status !== "playing" || game.phase !== "reading") {
    throw new Error("No question is being read.");
  }
  if (participantId !== game.currentTurnId) {
    throw new Error("Only the player answering can request the answer choices.");
  }
  if (!game.activeQuestion) {
    throw new Error("No question loaded.");
  }
  const hasChoices =
    (Array.isArray(game.activeQuestion.choices) && game.activeQuestion.choices.length > 0)
    || (Array.isArray(game.activeQuestion.incorrectAnswers)
      && game.activeQuestion.incorrectAnswers.length > 0);
  if (!hasChoices) {
    throw new Error("This question has no multiple-choice options.");
  }
  if (game.choicesShownAt != null) {
    return;
  }
  const player = game.players[participantId];
  if (!player) {
    throw new Error("Player not found.");
  }
  if (player.choiceHelpsRemaining <= 0) {
    throw new Error("You have used all of your answer-choice requests for this game.");
  }
  player.choiceHelpsRemaining -= 1;
  game.choicesShownAt = now;
}

export function trivialPursuitStartClock(
  game: TrivialPursuitGameInternal,
  participantId: string,
  now = Date.now()
): void {
  if (game.status !== "playing" || (game.phase !== "reading" && game.phase !== "judging")) {
    throw new Error("No question is being read.");
  }
  if (participantId !== game.readerId) {
    throw new Error("Only the reader can start the clock.");
  }
  if (game.questionShownAt == null) {
    throw new Error("Reveal the question before starting the clock.");
  }
  if (now - game.questionShownAt < TRIVIAL_PURSUIT_SHOW_QUESTION_CLOCK_DELAY_MS) {
    throw new Error("Wait 10 seconds after showing the question before starting the clock.");
  }
  if (game.clockEndsAt != null) {
    return;
  }
  game.clockEndsAt = now + TRIVIAL_PURSUIT_CLOCK_DURATION_MS;
}

export function trivialPursuitReveal(
  game: TrivialPursuitGameInternal,
  participantId: string
): void {
  if (game.status !== "playing" || game.phase !== "reading") {
    throw new Error("It is not time to reveal the answer.");
  }
  if (participantId !== game.readerId) {
    throw new Error("Only the reader can reveal the answer.");
  }
  if (!game.activeQuestion) {
    throw new Error("No question loaded.");
  }
  game.answerRevealed = true;
  game.phase = "judging";
}

export function trivialPursuitJudge(
  game: TrivialPursuitGameInternal,
  participantId: string,
  correct: boolean
): void {
  if (game.status !== "playing" || game.phase !== "judging") {
    throw new Error("It is not time to judge.");
  }
  if (participantId !== game.readerId) {
    throw new Error("Only the reader can judge.");
  }
  const player = contestant(game);
  if (!player) throw new Error("No current player.");

  const onHub = player.spaceId === TRIVIAL_PURSUIT_HUB_ID;
  const category = game.activeCategory;

  if (correct) {
    if (onHub && hasAllWedges(player.wedges)) {
      game.status = "finished";
      game.phase = "finished";
      game.winnerParticipantId = player.participantId;
      game.lastOutcome = "Correct — game won!";
      clearCard(game);
      return;
    }
    if (
      category
      && shouldAwardWedge({
        mode: game.wedgeMode === "classic" ? "classic" : "fast",
        spaceId: player.spaceId,
        category,
        alreadyHas: player.wedges[category]
      })
    ) {
      player.wedges[category] = true;
      game.lastOutcome = `Correct — ${category} wedge earned! Roll again.`;
    } else {
      game.lastOutcome = "Correct — roll again.";
    }
    beginRolling(game);
    return;
  }

  // Incorrect
  if (onHub && hasAllWedges(player.wedges)) {
    game.awaitingHubReturn = true;
    game.lastOutcome = "Incorrect — leave the hub and return for another try.";
  } else {
    game.lastOutcome = "Incorrect — turn passes.";
  }
  passTurn(game);
}

export function trivialPursuitRetryQuestion(
  game: TrivialPursuitGameInternal,
  participantId: string,
  random: () => number = Math.random
): void {
  if (game.status !== "playing" || game.phase !== "reading") {
    throw new Error("No question to retry.");
  }
  if (participantId !== game.readerId && participantId !== game.currentTurnId) {
    throw new Error("Only the reader or current player can retry.");
  }
  if (!game.activeCategory) {
    throw new Error("No category selected.");
  }
  if (game.activeQuestion && !game.questionError) {
    throw new Error("A question is already loaded.");
  }
  startQuestion(game, game.activeCategory, random);
}

function passTurn(game: TrivialPursuitGameInternal): void {
  game.currentTurnId = nextPlayerInOrder(game.playerOrder, game.currentTurnId);
  beginRolling(game);
}

export function detachTrivialPursuitPlayer(
  game: TrivialPursuitGameInternal,
  participantId: string,
  random: () => number = Math.random
): void {
  if (game.status === "finished") return;
  const idx = game.playerOrder.indexOf(participantId);
  if (idx === -1) return;

  const wasTurn = game.currentTurnId === participantId;
  const wasReader = game.readerId === participantId;
  const wasChooser = game.finalCategoryChooserId === participantId;

  game.playerOrder = game.playerOrder.filter((id) => id !== participantId);
  delete game.players[participantId];

  if (game.playerOrder.length < TRIVIAL_PURSUIT_MIN_PLAYERS) {
    game.status = "finished";
    game.phase = "finished";
    game.winnerParticipantId = null;
    game.lastOutcome = "Not enough players — game ended.";
    clearCard(game);
    return;
  }

  if (wasChooser) {
    game.finalCategoryChooserId = nextPlayerInOrder(game.playerOrder, game.currentTurnId);
  }

  if (wasTurn) {
    game.currentTurnId = nextPlayerInOrder(
      game.playerOrder,
      game.playerOrder[Math.max(0, idx - 1)] ?? null
    );
    beginRolling(game);
    game.lastOutcome = "Player left — turn passes.";
    return;
  }

  if (wasReader && (game.phase === "reading" || game.phase === "judging")) {
    const revealed = game.answerRevealed;
    game.readerId = pickReaderId(game.playerOrder, game.currentTurnId ?? "", random);
    if (!revealed) {
      game.answerRevealed = false;
      // Keep questionShownAt / clock as-is for the new reader.
    }
    game.lastOutcome = "Reader left — new reader assigned.";
  }
}

export function applyTrivialPursuitScores(
  game: TrivialPursuitGameInternal,
  award: (participantId: string, points: number) => void,
  playerCount: number
): void {
  if (game.status !== "finished" || game.scoresApplied || !game.winnerParticipantId) {
    return;
  }
  award(game.winnerParticipantId, fridayFusionPointsForWin(playerCount));
  game.scoresApplied = true;
}

export function toPublicTrivialPursuitState(
  game: TrivialPursuitGameInternal,
  viewerId: string
): TrivialPursuitState {
  const isReader = viewerId === game.readerId;
  const isAnswerer = viewerId === game.currentTurnId;
  const showText =
    game.answerRevealed
    || isReader
    || (isAnswerer && game.questionShownAt != null);
  const showAnswer = game.answerRevealed;
  // Reader always; answerer after spending a choice help; everyone after correct-answer reveal.
  const showChoices =
    isReader
    || game.answerRevealed
    || (isAnswerer && game.choicesShownAt != null);
  const choicesForView = (question: TrivialPursuitQuestion): string[] => {
    if (Array.isArray(question.choices) && question.choices.length > 0) {
      return [...question.choices];
    }
    const incorrect = Array.isArray(question.incorrectAnswers) ? question.incorrectAnswers : [];
    return [question.correctAnswer, ...incorrect];
  };

  const activeQuestion =
    game.activeQuestion && game.activeCategory
      ? {
          id: game.activeQuestion.id,
          category: game.activeCategory,
          text: showText ? game.activeQuestion.text : null,
          correctAnswer: showAnswer ? game.activeQuestion.correctAnswer : null,
          choices: showChoices ? choicesForView(game.activeQuestion) : null
        }
      : game.activeCategory
        ? {
            id: "pending",
            category: game.activeCategory,
            text: null,
            correctAnswer: null,
            choices: null
          }
        : null;

  return {
    status: game.status === "finished" ? "finished" : "playing",
    phase: game.phase,
    // Always emit a valid mode so session:state broadcasts never fail schema checks
    // (a missing field freezes every client on the previous turn UI).
    wedgeMode: game.wedgeMode === "classic" ? "classic" : "fast",
    playerOrder: [...game.playerOrder],
    players: playerList(game).map((p) => ({
      participantId: p.participantId,
      spaceId: p.spaceId,
      wedges: { ...p.wedges },
      choiceHelpsRemaining: p.choiceHelpsRemaining
    })),
    currentTurnId: game.currentTurnId,
    readerId: game.readerId,
    lastDieRoll: game.lastDieRoll,
    legalMoveSpaceIds: [...game.legalMoveSpaceIds],
    activeCategory: game.activeCategory,
    activeQuestion,
    questionShownAt: game.questionShownAt,
    choicesShownAt: game.choicesShownAt,
    clockEndsAt: game.clockEndsAt,
    answerRevealed: game.answerRevealed,
    finalCategoryChooserId: game.finalCategoryChooserId,
    awaitingHubReturn: game.awaitingHubReturn,
    winnerParticipantId: game.winnerParticipantId,
    lastOutcome: game.lastOutcome,
    questionError: game.questionError
  };
}

export { TRIVIAL_PURSUIT_MIN_PLAYERS, TRIVIAL_PURSUIT_MAX_PLAYERS };
