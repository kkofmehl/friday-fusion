import { nanoid } from "nanoid";
import { FRIENDLY_FEUD_ANSWER_MS, FRIENDLY_FEUD_BUZZ_DELAY_MS, FRIENDLY_FEUD_MAX_STRIKES, FRIENDLY_FEUD_ROUNDS_PER_GAME } from "../../shared/contracts";
import type {
  FriendlyFeudBoardSlot,
  FriendlyFeudRoundResult,
  FriendlyFeudState,
  FriendlyFeudTeamId
} from "../../shared/contracts";
import {
  friendlyFeudRoundMultiplier,
  matchFriendlyFeudGuess,
  nextFriendlyFeudRotator,
  otherFriendlyFeudTeam,
  pickFriendlyFeudWinners,
  resolveFaceOffControl,
  type FaceOffGuess
} from "../../shared/friendlyFeudLogic";
import {
  pickFriendlyFeudQuestions,
  type FriendlyFeudQuestion
} from "./friendlyFeudQuestions";

export type FriendlyFeudAnswerInternal = {
  ans: string;
  pnt: number;
  alts?: string[];
};

export type FriendlyFeudRoundInternal = {
  id: string;
  question: string;
  answers: FriendlyFeudAnswerInternal[];
};

export type FriendlyFeudGameInternal = {
  id: string;
  type: "friendlyFeud";
  status: "teamSetup" | "faceOff" | "playBoard" | "steal" | "roundReveal" | "finished";
  teamAIds: string[];
  teamBIds: string[];
  teamScores: { A: number; B: number };
  rounds: FriendlyFeudRoundInternal[];
  roundIndex: number;
  revealed: boolean[];
  pot: number;
  strikes: number;
  faceOffCursorA: number;
  faceOffCursorB: number;
  faceOffPlayerAId: string | null;
  faceOffPlayerBId: string | null;
  buzzedParticipantId: string | null;
  answeringParticipantId: string | null;
  awaitingSecondAnswer: boolean;
  faceOffFirstGuess: FaceOffGuess | null;
  controllingTeam: FriendlyFeudTeamId | null;
  currentGuesserId: string | null;
  playCursorA: number;
  playCursorB: number;
  awardedTeam: FriendlyFeudTeamId | null;
  awardedPoints: number;
  winnerTeams: FriendlyFeudTeamId[] | null;
  lastGuess: { participantId: string; text: string; correct: boolean } | null;
  /** Epoch ms when Buzz unlocks for this face-off. */
  buzzOpensAt: number | null;
  /** Epoch ms when the current face-off answer window ends. */
  answerEndsAt: number | null;
  /** Session FF points already applied for the current roundReveal. */
  roundScoresApplied: boolean;
  /** Session FF points already applied for game winners. */
  gameScoresApplied: boolean;
  /** Per-round Family Feud point awards (for end-of-game recap). */
  roundResults: FriendlyFeudRoundResult[];
};

const currentRound = (game: FriendlyFeudGameInternal): FriendlyFeudRoundInternal => {
  const round = game.rounds[game.roundIndex];
  if (!round) {
    throw new Error("Friendly Feud round is missing.");
  }
  return round;
};

const projectBoard = (game: FriendlyFeudGameInternal): FriendlyFeudBoardSlot[] => {
  const round = currentRound(game);
  return round.answers.map((answer, index) => {
    if (!game.revealed[index]) {
      return { revealed: false as const };
    }
    return { revealed: true as const, ans: answer.ans, pnt: answer.pnt };
  });
};

const commonPlayFields = (game: FriendlyFeudGameInternal) => {
  const round = currentRound(game);
  return {
    teamAIds: [...game.teamAIds],
    teamBIds: [...game.teamBIds],
    teamScores: { ...game.teamScores },
    roundIndex: game.roundIndex,
    multiply: friendlyFeudRoundMultiplier(game.roundIndex),
    question: round.question,
    board: projectBoard(game),
    pot: game.pot,
    strikes: game.strikes,
    lastGuess: game.lastGuess ? { ...game.lastGuess } : null
  };
};

export function createFriendlyFeudGame(): FriendlyFeudGameInternal {
  return {
    id: nanoid(6),
    type: "friendlyFeud",
    status: "teamSetup",
    teamAIds: [],
    teamBIds: [],
    teamScores: { A: 0, B: 0 },
    rounds: [],
    roundIndex: 0,
    revealed: [],
    pot: 0,
    strikes: 0,
    faceOffCursorA: 0,
    faceOffCursorB: 0,
    faceOffPlayerAId: null,
    faceOffPlayerBId: null,
    buzzedParticipantId: null,
    answeringParticipantId: null,
    awaitingSecondAnswer: false,
    faceOffFirstGuess: null,
    controllingTeam: null,
    currentGuesserId: null,
    playCursorA: 0,
    playCursorB: 0,
    awardedTeam: null,
    awardedPoints: 0,
    winnerTeams: null,
    lastGuess: null,
    buzzOpensAt: null,
    answerEndsAt: null,
    roundScoresApplied: false,
    gameScoresApplied: false,
    roundResults: []
  };
}

export function hydrateFriendlyFeudGame(raw: Partial<FriendlyFeudGameInternal> & { type: "friendlyFeud" }): FriendlyFeudGameInternal {
  const base = createFriendlyFeudGame();
  const status =
    raw.status === "faceOff"
    || raw.status === "playBoard"
    || raw.status === "steal"
    || raw.status === "roundReveal"
    || raw.status === "finished"
    || raw.status === "teamSetup"
      ? raw.status
      : "teamSetup";
  const rounds = Array.isArray(raw.rounds)
    ? raw.rounds
        .filter((r) => r && typeof r.question === "string" && Array.isArray(r.answers))
        .map((r) => ({
          id: typeof r.id === "string" ? r.id : nanoid(6),
          question: String(r.question),
          answers: r.answers
            .filter((a) => a && typeof a.ans === "string")
            .map((a) => ({
              ans: String(a.ans),
              pnt: Math.max(0, Math.round(Number(a.pnt) || 0)),
              ...(Array.isArray(a.alts)
                ? {
                    alts: a.alts
                      .filter((alt): alt is string => typeof alt === "string")
                      .map((alt) => alt.trim())
                      .filter((alt) => alt.length > 0)
                  }
                : {})
            }))
        }))
        .filter((r) => r.answers.length > 0)
    : [];
  const roundResults = Array.isArray(raw.roundResults)
    ? raw.roundResults
        .filter(
          (r) =>
            r
            && typeof r.question === "string"
            && (r.awardedTeam === "A" || r.awardedTeam === "B")
            && typeof r.roundIndex === "number"
        )
        .map((r) => ({
          roundIndex: Math.max(0, Math.min(FRIENDLY_FEUD_ROUNDS_PER_GAME - 1, Math.floor(r.roundIndex))),
          question: String(r.question),
          awardedTeam: r.awardedTeam as FriendlyFeudTeamId,
          awardedPoints: Math.max(0, Math.round(Number(r.awardedPoints) || 0))
        }))
    : [];
  return {
    ...base,
    ...raw,
    id: typeof raw.id === "string" && raw.id.length > 0 ? raw.id : base.id,
    type: "friendlyFeud",
    status,
    teamAIds: Array.isArray(raw.teamAIds) ? raw.teamAIds.filter((id) => typeof id === "string") : [],
    teamBIds: Array.isArray(raw.teamBIds) ? raw.teamBIds.filter((id) => typeof id === "string") : [],
    teamScores: {
      A: Math.max(0, Math.round(Number(raw.teamScores?.A) || 0)),
      B: Math.max(0, Math.round(Number(raw.teamScores?.B) || 0))
    },
    rounds,
    roundIndex: Math.max(0, Math.min(FRIENDLY_FEUD_ROUNDS_PER_GAME - 1, Math.floor(Number(raw.roundIndex) || 0))),
    revealed: Array.isArray(raw.revealed) ? raw.revealed.map(Boolean) : [],
    pot: Math.max(0, Math.round(Number(raw.pot) || 0)),
    strikes: Math.max(0, Math.min(FRIENDLY_FEUD_MAX_STRIKES, Math.floor(Number(raw.strikes) || 0))),
    faceOffCursorA: Math.max(0, Math.floor(Number(raw.faceOffCursorA) || 0)),
    faceOffCursorB: Math.max(0, Math.floor(Number(raw.faceOffCursorB) || 0)),
    faceOffPlayerAId: typeof raw.faceOffPlayerAId === "string" ? raw.faceOffPlayerAId : null,
    faceOffPlayerBId: typeof raw.faceOffPlayerBId === "string" ? raw.faceOffPlayerBId : null,
    buzzedParticipantId: typeof raw.buzzedParticipantId === "string" ? raw.buzzedParticipantId : null,
    answeringParticipantId: typeof raw.answeringParticipantId === "string" ? raw.answeringParticipantId : null,
    awaitingSecondAnswer: Boolean(raw.awaitingSecondAnswer),
    faceOffFirstGuess:
      raw.faceOffFirstGuess
      && (raw.faceOffFirstGuess.team === "A" || raw.faceOffFirstGuess.team === "B")
        ? {
            team: raw.faceOffFirstGuess.team,
            matchIndex:
              typeof raw.faceOffFirstGuess.matchIndex === "number" ? raw.faceOffFirstGuess.matchIndex : null
          }
        : null,
    controllingTeam: raw.controllingTeam === "A" || raw.controllingTeam === "B" ? raw.controllingTeam : null,
    currentGuesserId: typeof raw.currentGuesserId === "string" ? raw.currentGuesserId : null,
    playCursorA: Math.max(0, Math.floor(Number(raw.playCursorA) || 0)),
    playCursorB: Math.max(0, Math.floor(Number(raw.playCursorB) || 0)),
    awardedTeam: raw.awardedTeam === "A" || raw.awardedTeam === "B" ? raw.awardedTeam : null,
    awardedPoints: Math.max(0, Math.round(Number(raw.awardedPoints) || 0)),
    winnerTeams: Array.isArray(raw.winnerTeams)
      ? raw.winnerTeams.filter((t): t is FriendlyFeudTeamId => t === "A" || t === "B")
      : null,
    lastGuess:
      raw.lastGuess
      && typeof raw.lastGuess.participantId === "string"
      && typeof raw.lastGuess.text === "string"
        ? {
            participantId: raw.lastGuess.participantId,
            text: raw.lastGuess.text,
            correct: Boolean(raw.lastGuess.correct)
          }
        : null,
    buzzOpensAt: typeof raw.buzzOpensAt === "number" ? raw.buzzOpensAt : null,
    answerEndsAt: typeof raw.answerEndsAt === "number" ? raw.answerEndsAt : null,
    roundScoresApplied: Boolean(raw.roundScoresApplied),
    gameScoresApplied: Boolean(raw.gameScoresApplied),
    roundResults
  };
}

export function toPublicFriendlyFeudState(game: FriendlyFeudGameInternal): FriendlyFeudState {
  if (game.status === "teamSetup") {
    return {
      status: "teamSetup",
      teamAIds: [...game.teamAIds],
      teamBIds: [...game.teamBIds]
    };
  }
  if (game.status === "finished") {
    return {
      status: "finished",
      teamAIds: [...game.teamAIds],
      teamBIds: [...game.teamBIds],
      teamScores: { ...game.teamScores },
      winnerTeams: game.winnerTeams && game.winnerTeams.length > 0 ? [...game.winnerTeams] : pickFriendlyFeudWinners(game.teamScores),
      roundResults: game.roundResults.map((r) => ({ ...r }))
    };
  }
  if (game.status === "faceOff") {
    return {
      status: "faceOff",
      ...commonPlayFields(game),
      faceOffPlayerAId: game.faceOffPlayerAId!,
      faceOffPlayerBId: game.faceOffPlayerBId!,
      buzzedParticipantId: game.buzzedParticipantId,
      answeringParticipantId: game.answeringParticipantId,
      awaitingSecondAnswer: game.awaitingSecondAnswer,
      buzzOpensAt: game.buzzOpensAt ?? Date.now(),
      answerEndsAt: game.answerEndsAt
    };
  }
  if (game.status === "playBoard") {
    return {
      status: "playBoard",
      ...commonPlayFields(game),
      controllingTeam: game.controllingTeam!,
      currentGuesserId: game.currentGuesserId!
    };
  }
  if (game.status === "steal") {
    return {
      status: "steal",
      ...commonPlayFields(game),
      controllingTeam: game.controllingTeam!,
      stealingTeam: otherFriendlyFeudTeam(game.controllingTeam!),
      currentGuesserId: game.currentGuesserId!
    };
  }
  return {
    status: "roundReveal",
    ...commonPlayFields(game),
    awardedTeam: game.awardedTeam!,
    awardedPoints: game.awardedPoints
  };
}

const rosterPlayer = (roster: string[], cursor: number): string => {
  if (roster.length === 0) {
    throw new Error("Team roster is empty.");
  }
  return roster[cursor % roster.length]!;
};

const revealAnswer = (game: FriendlyFeudGameInternal, index: number): number => {
  const round = currentRound(game);
  const answer = round.answers[index];
  if (!answer || game.revealed[index]) {
    return 0;
  }
  game.revealed[index] = true;
  const points = answer.pnt * friendlyFeudRoundMultiplier(game.roundIndex);
  game.pot += points;
  return points;
};

const boardCleared = (game: FriendlyFeudGameInternal): boolean => game.revealed.every(Boolean);

const enterFaceOff = (game: FriendlyFeudGameInternal, now = Date.now()): void => {
  const round = currentRound(game);
  game.status = "faceOff";
  game.revealed = round.answers.map(() => false);
  game.pot = 0;
  game.strikes = 0;
  game.buzzedParticipantId = null;
  game.answeringParticipantId = null;
  game.awaitingSecondAnswer = false;
  game.faceOffFirstGuess = null;
  game.controllingTeam = null;
  game.currentGuesserId = null;
  game.awardedTeam = null;
  game.awardedPoints = 0;
  game.lastGuess = null;
  game.roundScoresApplied = false;
  game.buzzOpensAt = now + FRIENDLY_FEUD_BUZZ_DELAY_MS;
  game.answerEndsAt = null;
  game.faceOffPlayerAId = rosterPlayer(game.teamAIds, game.faceOffCursorA);
  game.faceOffPlayerBId = rosterPlayer(game.teamBIds, game.faceOffCursorB);
};

const advanceFaceOffCursors = (game: FriendlyFeudGameInternal): void => {
  if (game.teamAIds.length > 0) {
    game.faceOffCursorA = (game.faceOffCursorA + 1) % game.teamAIds.length;
  }
  if (game.teamBIds.length > 0) {
    game.faceOffCursorB = (game.faceOffCursorB + 1) % game.teamBIds.length;
  }
};

/**
 * After face-off, the next teammate in rotation (after the showdown winner) starts board play.
 */
const enterPlayBoard = (game: FriendlyFeudGameInternal, controllingTeam: FriendlyFeudTeamId, faceOffWinnerId: string): void => {
  game.status = "playBoard";
  game.controllingTeam = controllingTeam;
  game.buzzedParticipantId = null;
  game.answeringParticipantId = null;
  game.awaitingSecondAnswer = false;
  game.faceOffFirstGuess = null;
  game.buzzOpensAt = null;
  game.answerEndsAt = null;
  const roster = controllingTeam === "A" ? game.teamAIds : game.teamBIds;
  const winnerIdx = Math.max(0, roster.indexOf(faceOffWinnerId));
  const playStartIdx = roster.length > 0 ? (winnerIdx + 1) % roster.length : 0;
  if (controllingTeam === "A") {
    game.playCursorA = playStartIdx;
  } else {
    game.playCursorB = playStartIdx;
  }
  game.currentGuesserId = rosterPlayer(roster, playStartIdx);
};

const enterSteal = (game: FriendlyFeudGameInternal): void => {
  if (!game.controllingTeam) {
    throw new Error("Cannot steal without a controlling team.");
  }
  const stealingTeam = otherFriendlyFeudTeam(game.controllingTeam);
  const roster = stealingTeam === "A" ? game.teamAIds : game.teamBIds;
  const cursor = stealingTeam === "A" ? game.playCursorA : game.playCursorB;
  game.status = "steal";
  game.currentGuesserId = rosterPlayer(roster, cursor);
};

const revealRemaining = (game: FriendlyFeudGameInternal): void => {
  const round = currentRound(game);
  for (let i = 0; i < round.answers.length; i++) {
    if (!game.revealed[i]) {
      game.revealed[i] = true;
    }
  }
};

export function awardRoundAndReveal(game: FriendlyFeudGameInternal, team: FriendlyFeudTeamId): void {
  revealRemaining(game);
  game.status = "roundReveal";
  game.awardedTeam = team;
  game.awardedPoints = game.pot;
  game.teamScores[team] += game.pot;
  game.roundResults.push({
    roundIndex: game.roundIndex,
    question: currentRound(game).question,
    awardedTeam: team,
    awardedPoints: game.pot
  });
  game.currentGuesserId = null;
  game.buzzedParticipantId = null;
  game.answeringParticipantId = null;
  game.buzzOpensAt = null;
  game.answerEndsAt = null;
}

export function beginFriendlyFeudPlay(game: FriendlyFeudGameInternal, usedQuestionIds: ReadonlySet<string> = new Set()): void {
  const picked = pickFriendlyFeudQuestions(usedQuestionIds, FRIENDLY_FEUD_ROUNDS_PER_GAME);
  if (picked.length < FRIENDLY_FEUD_ROUNDS_PER_GAME) {
    throw new Error("Not enough Friendly Feud questions available.");
  }
  game.rounds = picked.map((q: FriendlyFeudQuestion) => ({
    id: q.id,
    question: q.question,
    answers: q.answers.map((a) => ({
      ans: a.ans,
      pnt: a.pnt,
      ...(a.alts && a.alts.length > 0 ? { alts: [...a.alts] } : {})
    }))
  }));
  game.roundIndex = 0;
  game.teamScores = { A: 0, B: 0 };
  game.faceOffCursorA = 0;
  game.faceOffCursorB = 0;
  game.playCursorA = 0;
  game.playCursorB = 0;
  game.winnerTeams = null;
  game.gameScoresApplied = false;
  game.roundResults = [];
  enterFaceOff(game);
}

export function friendlyFeudBuzz(game: FriendlyFeudGameInternal, participantId: string, now = Date.now()): void {
  if (game.status !== "faceOff") {
    throw new Error("Buzzing is only allowed during the face-off.");
  }
  if (game.buzzOpensAt !== null && now < game.buzzOpensAt) {
    throw new Error("Buzzing is not open yet — wait for the countdown.");
  }
  if (game.buzzedParticipantId) {
    throw new Error("Someone already buzzed in.");
  }
  if (game.awaitingSecondAnswer || game.answeringParticipantId) {
    throw new Error("Waiting for an answer — buzzing is closed.");
  }
  if (participantId !== game.faceOffPlayerAId && participantId !== game.faceOffPlayerBId) {
    throw new Error("Only the face-off players can buzz.");
  }
  game.buzzedParticipantId = participantId;
  game.answeringParticipantId = participantId;
  game.answerEndsAt = now + FRIENDLY_FEUD_ANSWER_MS;
}

export function friendlyFeudSubmitGuess(
  game: FriendlyFeudGameInternal,
  participantId: string,
  guess: string,
  now = Date.now()
): void {
  const trimmed = guess.trim();
  if (!trimmed) {
    throw new Error("Guess cannot be empty.");
  }

  if (game.status === "faceOff") {
    submitFaceOffGuess(game, participantId, trimmed, now);
    return;
  }
  if (game.status === "playBoard") {
    submitPlayBoardGuess(game, participantId, trimmed);
    return;
  }
  if (game.status === "steal") {
    submitStealGuess(game, participantId, trimmed);
    return;
  }
  throw new Error("Guessing is not allowed right now.");
}

const teamForFaceOffPlayer = (game: FriendlyFeudGameInternal, participantId: string): FriendlyFeudTeamId => {
  if (participantId === game.faceOffPlayerAId) {
    return "A";
  }
  if (participantId === game.faceOffPlayerBId) {
    return "B";
  }
  throw new Error("Only the face-off players can answer.");
};

const submitFaceOffGuess = (
  game: FriendlyFeudGameInternal,
  participantId: string,
  guess: string,
  now = Date.now()
): void => {
  if (game.answeringParticipantId !== participantId) {
    throw new Error("It is not your turn to answer.");
  }
  const round = currentRound(game);
  const match = matchFriendlyFeudGuess(guess, round.answers, game.revealed);
  applyFaceOffAnswer(game, participantId, match ? match.index : null, trimmedGuessLabel(guess), match !== null, now);
};

/** Face-off answer window expired — treat as a miss and continue the showdown. */
export function friendlyFeudFaceOffTimeout(game: FriendlyFeudGameInternal, now = Date.now()): void {
  if (game.status !== "faceOff" || !game.answeringParticipantId) {
    return;
  }
  const participantId = game.answeringParticipantId;
  applyFaceOffAnswer(game, participantId, null, "(time's up)", false, now);
}

const applyFaceOffAnswer = (
  game: FriendlyFeudGameInternal,
  participantId: string,
  matchIndex: number | null,
  guessLabel: string,
  correct: boolean,
  now: number
): void => {
  const team = teamForFaceOffPlayer(game, participantId);
  game.lastGuess = {
    participantId,
    text: guessLabel,
    correct
  };

  const thisGuess: FaceOffGuess = { team, matchIndex };

  if (!game.awaitingSecondAnswer) {
    const result = resolveFaceOffControl(thisGuess, null);
    if (result.kind === "control") {
      if (matchIndex !== null) {
        revealAnswer(game, matchIndex);
      }
      enterPlayBoard(game, result.team, participantId);
      advanceFaceOffCursors(game);
      return;
    }
    // Non-#1 hit (or miss): reveal immediately so the board updates before the second answer.
    if (matchIndex !== null) {
      revealAnswer(game, matchIndex);
    }
    game.faceOffFirstGuess = thisGuess;
    game.awaitingSecondAnswer = true;
    game.buzzedParticipantId = null;
    const otherId =
      participantId === game.faceOffPlayerAId ? game.faceOffPlayerBId : game.faceOffPlayerAId;
    game.answeringParticipantId = otherId;
    game.answerEndsAt = now + FRIENDLY_FEUD_ANSWER_MS;
    return;
  }

  const first = game.faceOffFirstGuess;
  if (!first) {
    throw new Error("Missing first face-off guess.");
  }
  const result = resolveFaceOffControl(first, thisGuess);
  if (result.kind === "redo") {
    advanceFaceOffCursors(game);
    enterFaceOff(game, now);
    return;
  }
  if (result.kind !== "control") {
    throw new Error("Unexpected face-off result.");
  }
  if (first.matchIndex !== null) {
    revealAnswer(game, first.matchIndex);
  }
  if (thisGuess.matchIndex !== null && thisGuess.matchIndex !== first.matchIndex) {
    revealAnswer(game, thisGuess.matchIndex);
  }
  const starterId =
    result.team === "A" ? game.faceOffPlayerAId! : game.faceOffPlayerBId!;
  enterPlayBoard(game, result.team, starterId);
  advanceFaceOffCursors(game);
};

const trimmedGuessLabel = (guess: string): string => guess.trim().slice(0, 120);

const advancePlayCursor = (game: FriendlyFeudGameInternal, team: FriendlyFeudTeamId): void => {
  const roster = team === "A" ? game.teamAIds : game.teamBIds;
  if (team === "A") {
    game.playCursorA = (game.playCursorA + 1) % Math.max(1, roster.length);
    game.currentGuesserId = rosterPlayer(roster, game.playCursorA);
  } else {
    game.playCursorB = (game.playCursorB + 1) % Math.max(1, roster.length);
    game.currentGuesserId = rosterPlayer(roster, game.playCursorB);
  }
};

const submitPlayBoardGuess = (game: FriendlyFeudGameInternal, participantId: string, guess: string): void => {
  if (game.currentGuesserId !== participantId) {
    throw new Error("It is not your turn to guess.");
  }
  if (!game.controllingTeam) {
    throw new Error("No controlling team.");
  }
  const round = currentRound(game);
  const match = matchFriendlyFeudGuess(guess, round.answers, game.revealed);
  game.lastGuess = {
    participantId,
    text: trimmedGuessLabel(guess),
    correct: match !== null
  };
  if (match) {
    revealAnswer(game, match.index);
    if (boardCleared(game)) {
      awardRoundAndReveal(game, game.controllingTeam);
      return;
    }
    advancePlayCursor(game, game.controllingTeam);
    return;
  }
  game.strikes += 1;
  if (game.strikes >= FRIENDLY_FEUD_MAX_STRIKES) {
    enterSteal(game);
    return;
  }
  advancePlayCursor(game, game.controllingTeam);
};

const submitStealGuess = (game: FriendlyFeudGameInternal, participantId: string, guess: string): void => {
  if (game.currentGuesserId !== participantId) {
    throw new Error("It is not your turn to steal.");
  }
  if (!game.controllingTeam) {
    throw new Error("No controlling team.");
  }
  const stealingTeam = otherFriendlyFeudTeam(game.controllingTeam);
  const round = currentRound(game);
  const match = matchFriendlyFeudGuess(guess, round.answers, game.revealed);
  game.lastGuess = {
    participantId,
    text: trimmedGuessLabel(guess),
    correct: match !== null
  };
  if (match) {
    revealAnswer(game, match.index);
    awardRoundAndReveal(game, stealingTeam);
    return;
  }
  awardRoundAndReveal(game, game.controllingTeam);
};

export function advanceFriendlyFeudAfterReveal(game: FriendlyFeudGameInternal): void {
  if (game.status !== "roundReveal") {
    return;
  }
  if (game.roundIndex >= FRIENDLY_FEUD_ROUNDS_PER_GAME - 1) {
    game.status = "finished";
    game.winnerTeams = pickFriendlyFeudWinners(game.teamScores);
    game.currentGuesserId = null;
    return;
  }
  game.roundIndex += 1;
  enterFaceOff(game);
}

export function friendlyFeudTeamForParticipant(
  game: FriendlyFeudGameInternal,
  participantId: string
): FriendlyFeudTeamId | null {
  if (game.teamAIds.includes(participantId)) {
    return "A";
  }
  if (game.teamBIds.includes(participantId)) {
    return "B";
  }
  return null;
}

/** Exported for tests — rotate helper without mutating. */
export function peekNextRotator(roster: readonly string[], currentId: string | null): string | null {
  return nextFriendlyFeudRotator(roster, currentId);
}
