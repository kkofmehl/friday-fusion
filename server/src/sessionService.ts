import { nanoid } from "nanoid";
import {
  APPLES_TO_APPLES_FINITE_ROUNDS,
  APPLES_TO_APPLES_HAND_SIZE,
  CATCH_PHRASE_MIN_PLAYERS,
  CATCH_PHRASE_PHASE1_MAX_MS,
  CATCH_PHRASE_PHASE1_MIN_MS,
  CATCH_PHRASE_PHASE2_MAX_MS,
  CATCH_PHRASE_PHASE2_MIN_MS,
  CATCH_PHRASE_PHASE3_MAX_MS,
  CATCH_PHRASE_PHASE3_MIN_MS,
  CATCH_PHRASE_WIN_SCORE,
  UNO_HAND_SIZE,
  CAPTION_THIS_MAX_CHARS,
  ICEBREAKER_PROMPT_MAX_CHARS,
  WOULD_YOU_RATHER_OPTION_MAX_CHARS,
  PICTORY_MAX_STROKES_PER_ROUND,
  PICTORY_ROUND_DURATION_DEFAULT_MS,
  PICTORY_ROUND_DURATION_MAX_MS,
  PICTORY_ROUND_DURATION_MIN_MS,
  PICTORY_STROKE_MAX_POINTS,
  TWENTY_QUESTIONS_ITEM_MAX_CHARS,
  TWENTY_QUESTIONS_QUESTION_MAX_CHARS,
  gameTypeSchema,
  type GameStartOptions,
  type GameType,
  type HangmanActivity,
  type HangmanMode,
  type PictionaryStrokePayload,
  type SessionState,
  type TriviaLoadingState,
  type TriviaQuestion,
  type BsCard,
  type MadlibsBlankPrompt,
  type BsRank,
  type UnoActiveColor,
  type UnoCard,
  type YahtzeeCategory,
  type YahtzeeMode,
  type YahtzeeSheetRow,
  SCATTERGORIES_ANSWER_MAX_CHARS,
  SCATTERGORIES_COUNTDOWN_MS
} from "../../shared/contracts";
import {
  computeYahtzeePlacement,
  grandTotalFromSheetRows,
  scoreCategory
} from "../../shared/yahtzeeScoring";
import { pickPictionaryClue } from "./pictionaryClues";
import { pickCatchPhraseClue } from "./catchPhraseClues";
import { pickIcebreakerQuestions } from "./icebreakerQuestionLoader";
import { pickGuessWhoSaidItQuestions } from "./guessWhoSaidItQuestionLoader";
import { pickWouldYouRatherPrompts } from "./wouldYouRatherPromptLoader";
import { purgeAllIcebreakerSessionUploads, purgeIcebreakerQuestionUploads } from "./icebreakerUploads";
import {
  purgeAllGuessWhoSaidItSessionUploads,
  purgeGuessWhoSaidItQuestionUploads
} from "./guessWhoSaidItUploads";
import {
  deleteCaptionThisStoredFile,
  purgeAllCaptionThisSessionUploads
} from "./captionThisUploads";
import {
  deleteGuessTheImageStoredFile,
  purgeAllGuessTheImageSessionUploads
} from "./guessTheImageUploads";
import { purgeSessionChatMessages } from "./chatMessagesStore";
import {
  getApplesResponseText,
  pickApplesTopic,
  shuffledResponseCardIds
} from "./applesToApplesCardLoader";
import { shuffledBsDeck } from "./bsDeck";
import {
  fillMadlibTemplate,
  madlibBlankCount,
  pickMadlibTemplate,
  type MadlibTemplate
} from "./madlibsTemplates";
import { shuffledUnoDeck } from "./unoDeck";
import {
  getScattergoriesListById,
  pickScattergoriesLetter,
  pickScattergoriesList,
  type ScattergoriesList
} from "./scattergoriesCardLoader";
import { participantHasDuplicateForPrompt } from "../../shared/scattergoriesDuplicates";
import { countLetterWords } from "../../shared/scattergoriesScoring";
import {
  advanceTurnAfterPlay,
  isColoredNumberCard,
  normPlayerIndex,
  peekNextParticipantId,
  refillUnoDrawPileFromDiscard,
  shuffleUnoCardsInPlace,
  unoCanPlayCard
} from "./unoGameHelpers";
import { FileStore } from "./storage/fileStore";
import {
  createTriviaQuestionLoader,
  type TriviaQuestionLoadProgress,
  type TriviaQuestionLoader
} from "./triviaQuestionLoader";

type ParticipantInternal = {
  id: string;
  displayName: string;
  score: number;
  isHost: boolean;
  /** Omitted or true = participates in games; false = in session but benched. */
  isActive?: boolean;
};

type HangmanGameInternal = {
  id: string;
  type: "hangman";
  puzzleCreatorId: string;
  secretWord: string | null;
  maskedWord: string;
  guessedLetters: string[];
  wrongGuessCount: number;
  maxWrongGuesses: number;
  status: "waitingForWord" | "inProgress" | "won" | "lost";
  mode: HangmanMode;
  currentTurnId: string | null;
  activeSolverId: string | null;
  activityLog: HangmanActivity[];
};

type TwoTruthsGameInternal = {
  id: string;
  type: "twoTruthsLie";
  submissions: Record<string, { statements: string[]; lieIndex: number }>;
  currentPresenterId: string | null;
  votes: Record<string, number>;
  status: "collecting" | "voting" | "revealed" | "finished";
};

type TriviaGameInternal = {
  id: string;
  type: "trivia";
  questions: TriviaQuestion[];
  totalQuestions: number;
  questionIndex: number;
  activeQuestion: TriviaQuestion | null;
  answers: Record<string, string>;
  usedQuestionIds: string[];
  loading: TriviaLoadingState | null;
  status: "idle" | "loading" | "questionOpen" | "questionClosed" | "finished";
};

type WouldYouRatherChoiceInternal = "optionA" | "optionB" | "pass";

type WouldYouRatherPromptInternal = {
  id: string;
  optionA: string;
  optionB: string;
  source: "library" | "submitted";
  submittedByParticipantId: string | null;
};

type WouldYouRatherSubmissionInternal = {
  id: string;
  optionA: string;
  optionB: string;
  submittedByParticipantId: string;
  status: "pending" | "approved" | "rejected";
};

type WouldYouRatherGameInternal = {
  id: string;
  type: "wouldYouRather";
  status: "questionOpen" | "results" | "finished";
  roundPrompts: WouldYouRatherPromptInternal[];
  totalQuestions: number;
  questionIndex: number;
  activePrompt: WouldYouRatherPromptInternal | null;
  responses: Record<string, WouldYouRatherChoiceInternal>;
  results: { optionACount: number; optionBCount: number; passCount: number; totalResponses: number } | null;
  usedPromptIds: string[];
  allowParticipantSubmissions: boolean;
  inSubmittedRound: boolean;
  submissions: WouldYouRatherSubmissionInternal[];
};

type IcebreakerRevealedInternal = {
  participantId: string;
  text: string;
  imageFileId: string | null;
};

type IcebreakerGameInternal = {
  id: string;
  type: "icebreaker";
  questions: Array<{ id: string; text: string }>;
  totalQuestions: number;
  questionIndex: number;
  activeQuestion: { id: string; text: string } | null;
  privateSubmissions: Record<string, { text: string; imageFileId: string | null }>;
  revealed: IcebreakerRevealedInternal[];
  usedQuestionIds: string[];
  status: "idle" | "gatheringPrompts" | "collecting" | "revealing" | "finished";
  /** Set while status is `gatheringPrompts`. */
  promptsPerParticipant: number | null;
  promptDraftsByParticipant: Record<string, string[]>;
};

type GuessWhoAnswerInternal = { text: string; imageFileId: string | null };

type GuessWhoSlotInternal = {
  slotId: string;
  authorId: string;
  text: string;
  imageFileId: string | null;
};

type GuessWhoVotingPromptInternal = {
  question: { id: string; text: string };
  slots: GuessWhoSlotInternal[];
};

type GuessWhoRevealRowInternal = {
  slotId: string;
  guessedParticipantId: string;
  actualAuthorId: string;
  correct: boolean;
  pointsEarned: number;
};

type GuessWhoPromptRevealSnapshotInternal = {
  question: { id: string; text: string };
  slots: GuessWhoSlotInternal[];
  byVoter: Array<{
    voterId: string;
    rows: GuessWhoRevealRowInternal[];
    pointsThisPrompt: number;
  }>;
};

type GuessWhoSaidItGameInternal = {
  id: string;
  type: "guessWhoSaidIt";
  questions: Array<{ id: string; text: string }>;
  totalQuestions: number;
  questionIndex: number;
  activeQuestion: { id: string; text: string } | null;
  privateSubmissions: Record<string, GuessWhoAnswerInternal>;
  answersByQuestionIndex: Record<number, Record<string, GuessWhoAnswerInternal>>;
  usedQuestionIds: string[];
  status: "idle" | "collecting" | "votingReady" | "voting" | "promptReveal" | "roundSummary";
  /** Which prompt (0-based) is active during voting / promptReveal */
  votingQuestionIndex: number;
  votingPrompt: GuessWhoVotingPromptInternal | null;
  votes: Record<string, Record<string, string>>;
  cumulativeCorrectByParticipant: Record<string, number>;
  promptRevealSnapshot: GuessWhoPromptRevealSnapshotInternal | null;
};

type GuessTheImageResultInternal = {
  participantId: string;
  choiceDisplayIndex: number | null;
  correct: boolean;
  elapsedMs: number | null;
  pointsAwarded: number;
};

type GuessImageParticipantSlotInternal = {
  imageFileId: string | null;
  canonicalDescriptions: [string, string, string, string];
  canonicalCorrectIndex: number;
  revealDurationMs: number;
  configured: boolean;
};

type GuessTheImageGameInternal = {
  id: string;
  type: "guessTheImage";
  status: "setup" | "playing" | "finished";
  /** `single`: only setupParticipantId may prepare. `everyone`: each slot in participantSetups; host picks selectedRoundParticipantId to play. */
  setupMode: "single" | "everyone";
  /** Participant who may upload/configure in single mode; during play, who prepared (sits out guessing). */
  setupParticipantId: string;
  /** Everyone mode setup: whose saved setup becomes this round (set by host). */
  selectedRoundParticipantId: string | null;
  participantSetups: Record<string, GuessImageParticipantSlotInternal>;
  imageFileId: string | null;
  canonicalDescriptions: [string, string, string, string];
  canonicalCorrectIndex: number;
  revealDurationMs: number;
  configured: boolean;
  displayPerm: [number, number, number, number] | null;
  roundStartedAt: number | null;
  locks: Record<string, { choiceIndex: number; lockedAt: number }>;
  results: GuessTheImageResultInternal[] | null;
  /** Everyone mode: after a finished round, host uses begin-next-selection instead of full reset. */
  everyoneBetweenRounds: boolean;
};

type TwentyQuestionsLogEntryInternal = {
  id: string;
  participantId: string;
  text: string;
  askedAt: number;
  answer: "yes" | "no" | null;
};

type TwentyQuestionsGameInternal = {
  id: string;
  type: "twentyQuestions";
  status: "waitingForItem" | "playing" | "finished";
  itemSelectorId: string;
  maxQuestions: number;
  secretItem: string | null;
  questionsUsed: number;
  currentAskerId: string | null;
  questionLog: TwentyQuestionsLogEntryInternal[];
  questionDraft: { participantId: string; text: string } | null;
  outcome: "team" | "selector" | null;
  scoresApplied: boolean;
};

type CaptionThisEntryInternal = {
  id: string;
  authorId: string;
  text: string;
};

type CaptionThisGameInternal = {
  id: string;
  type: "captionThis";
  status: "waitingForImage" | "collectingCaptions" | "voting" | "results";
  imageProviderId: string;
  imageFileId: string | null;
  roundNumber: number;
  captions: Record<string, string>;
  entries: CaptionThisEntryInternal[];
  /** Shuffled entry ids for display order in voting. */
  displayOrder: string[];
  votes: Record<string, string>;
};

type PictionaryStrokeInternal = {
  id: string;
  tool: "pen" | "eraser";
  width: number;
  points: { x: number; y: number }[];
};

type PictionaryGameInternal = {
  id: string;
  type: "pictionary";
  status: "teamSetup" | "drawing" | "roundBreak";
  roundDurationMs: number;
  teamAIds: string[];
  teamBIds: string[];
  drawCounts: Record<string, number>;
  strokes: PictionaryStrokeInternal[];
  usedClueIds: string[];
  currentPrompt: string | null;
  currentClueId: string | null;
  drawerId: string | null;
  activeTeam: "A" | "B" | null;
  roundStartedAt: number | null;
  roundEndsAt: number | null;
  roundBreakEndsAt: number | null;
  revealedPrompt: string | null;
  lastRoundResult: "correct" | "timeout" | null;
  /** Team that will draw when `roundBreak` ends. */
  roundBreakNextTeam: "A" | "B" | null;
};

type ApplesToApplesEntryInternal = {
  entryId: string;
  authorId: string;
  cardId: string;
};

type ApplesToApplesGameInternal = {
  id: string;
  type: "applesToApples";
  mode: "standard" | "finite";
  status: "collecting" | "judging" | "roundResult" | "finished";
  roundNumber: number;
  judgeOrder: string[];
  judgeIndex: number;
  topicId: string;
  topicText: string;
  usedTopicIds: string[];
  hands: Record<string, string[]>;
  drawPile: string[];
  discardPile: string[];
  submissions: Record<string, string>;
  entries: ApplesToApplesEntryInternal[];
  displayOrder: string[];
  roundWinnerEntryId: string | null;
  roundWinnerParticipantId: string | null;
  roundWinningText: string | null;
  /** Snapshot for round-result reveal (display order); cleared when the next round starts. */
  roundResultReveal: { entryId: string; authorId: string; text: string }[] | null;
};

type UnoGameInternal = {
  id: string;
  type: "uno";
  status: "playing" | "finished";
  playerOrder: string[];
  hands: Record<string, UnoCard[]>;
  drawPile: UnoCard[];
  discardPile: UnoCard[];
  currentPlayerIndex: number;
  direction: 1 | -1;
  activeColor: UnoActiveColor;
  winnerParticipantId: string | null;
  scoresApplied: boolean;
  /** Player with one card who has not declared UNO; catchable until next player's first action. */
  unoCatchOpenFor: string | null;
  /** First moment (epoch ms) a missed-UNO call is allowed after `unoCatchOpenFor` is set. */
  unoCatchAllowedAfterMs: number | null;
  /** Shown in clients until that player wins or no longer has exactly one card (e.g. drew back up). */
  unoAnnouncedParticipantId: string | null;
  /** After drawing one card on a turn, only this card id may be played (or pass). */
  pendingDrawnCardId: string | null;
};

type BsGameInternal = {
  id: string;
  type: "bs";
  status: "playing" | "challenging" | "challenged" | "finished";
  playerOrder: string[];
  hands: Record<string, BsCard[]>;
  discardPile: BsCard[];
  currentPlayerIndex: number;
  currentRankIndex: number;
  pendingPlayerId: string | null;
  pendingPlayedCards: BsCard[];
  believedParticipantIds: string[];
  calledBsParticipantId: string | null;
  finishedPlayerIds: string[];
  finalScores: Record<string, number>;
};

type MadlibsGameInternal = {
  id: string;
  type: "madlibs";
  status: "filling" | "reading";
  template: MadlibTemplate;
  usedTemplateIds: string[];
  currentBlankIndex: number;
  fillerParticipantIds: string[];
  words: Array<string | null>;
  readerParticipantId: string | null;
};

type CatchPhraseGameInternal = {
  id: string;
  type: "catchPhrase";
  status: "teamSetup" | "playing" | "finished";
  roundPhase: "awaitingRoundStart" | "live" | null;
  teamAIds: string[];
  teamBIds: string[];
  teamScores: { A: number; B: number };
  passOrder: string[];
  holderIndex: number | null;
  usedClueIds: string[];
  currentClueId: string | null;
  currentPhrase: string | null;
  roundStartedAt: number | null;
  slowPhaseEndsAt: number | null;
  mediumPhaseEndsAt: number | null;
  roundEndsAt: number | null;
  winnerTeam: "A" | "B" | null;
};

type YahtzeeGameInternal = {
  id: string;
  type: "yahtzee";
  status: "playing" | "finished";
  mode: YahtzeeMode;
  playerOrder: string[];
  currentPlayerIndex: number;
  dice: [number, number, number, number, number];
  held: [boolean, boolean, boolean, boolean, boolean];
  rollsUsed: 1 | 2 | 3;
  pendingCategory: YahtzeeCategory | null;
  diceByParticipant?: Record<string, [number, number, number, number, number]>;
  heldByParticipant?: Record<string, [boolean, boolean, boolean, boolean, boolean]>;
  rollsUsedByParticipant?: Record<string, 1 | 2 | 3>;
  pendingCategoryByParticipant?: Record<string, YahtzeeCategory | null>;
  latestYahtzee?: { participantId: string; createdAtMs: number } | null;
  sheetsByParticipant: Record<string, YahtzeeSheetRow[]>;
  scoresApplied: boolean;
  yahtzeeGrandTotals?: Record<string, number>;
  placementAwards?: Record<string, number>;
  winnerParticipantId?: string | null;
};

type ScattergoriesGameInternal = {
  id: string;
  type: "scattergories";
  status: "idle" | "countdown" | "answering" | "reviewing" | "roundComplete";
  listId: string;
  listTitle: string;
  prompts: string[];
  letter: string | null;
  answerDurationMs: number;
  usedListIds: string[];
  usedLetters: string[];
  countdownEndsAt: number | null;
  roundEndsAt: number | null;
  answers: Record<string, string[]>;
  currentPromptIndex: number;
  verdictsByPrompt: Record<number, Record<string, "valid" | "invalid">>;
  roundScoreDelta: Record<string, number>;
};

type GameInternal =
  | HangmanGameInternal
  | TwoTruthsGameInternal
  | TriviaGameInternal
  | WouldYouRatherGameInternal
  | IcebreakerGameInternal
  | GuessWhoSaidItGameInternal
  | GuessTheImageGameInternal
  | TwentyQuestionsGameInternal
  | CaptionThisGameInternal
  | PictionaryGameInternal
  | ApplesToApplesGameInternal
  | UnoGameInternal
  | BsGameInternal
  | MadlibsGameInternal
  | CatchPhraseGameInternal
  | YahtzeeGameInternal
  | ScattergoriesGameInternal;

// NOTE: Stored as an array even though the UI currently only allows one active
// game at a time. This keeps the room open for true multi-game-per-session
// support later without another data-model migration.
type SessionInternal = {
  sessionId: string;
  sessionName: string;
  joinCode: string;
  participants: ParticipantInternal[];
  games: GameInternal[];
  updatedAt: number;
  lobbyGamePreferences: Record<string, GameType>;
};

const pruneLobbyGamePreferences = (
  session: SessionInternal,
  prefs: Record<string, GameType> | undefined
): Record<string, GameType> => {
  const raw = prefs ?? {};
  const out: Record<string, GameType> = {};
  for (const [participantId, game] of Object.entries(raw)) {
    const p = session.participants.find((x) => x.id === participantId);
    if (p && !p.isHost && participantIsActive(p) && gameTypeSchema.safeParse(game).success) {
      out[participantId] = game as GameType;
    }
  }
  return out;
};

const participantIsActive = (p: ParticipantInternal): boolean => p.isActive !== false;

const activeParticipants = (session: SessionInternal): ParticipantInternal[] =>
  session.participants.filter(participantIsActive);

const assertParticipantActiveForGameplay = (session: SessionInternal, participantId: string): void => {
  const p = session.participants.find((x) => x.id === participantId);
  if (!p || !participantIsActive(p)) {
    throw new Error("Inactive players cannot take this action.");
  }
};

type PersistedState = {
  sessions: SessionInternal[];
};

const WORD_ADJECTIVES = [
  "bright",
  "happy",
  "swift",
  "brave",
  "clever",
  "lively",
  "sunny",
  "kind",
  "mellow",
  "spark"
];

const WORD_NOUNS = [
  "otter",
  "eagle",
  "river",
  "comet",
  "maple",
  "echo",
  "summit",
  "harbor",
  "groove",
  "horizon"
];

const normalizeSessionCode = (input: string): string =>
  input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toUpperCase();

const randomWordCode = (): string => {
  const adjective = WORD_ADJECTIVES[Math.floor(Math.random() * WORD_ADJECTIVES.length)];
  const noun = WORD_NOUNS[Math.floor(Math.random() * WORD_NOUNS.length)];
  return `${adjective}-${noun}`.toUpperCase();
};

const maskWord = (word: string, guessedLetters: string[]): string => {
  const upperWord = word.toUpperCase();
  return upperWord
    .split("")
    .map((char) => {
      if (!/[A-Z]/.test(char)) {
        return char;
      }
      return guessedLetters.includes(char) ? char : "_";
    })
    .join("");
};

const nonCreatorGuessers = (
  session: SessionInternal,
  game: HangmanGameInternal
): ParticipantInternal[] =>
  activeParticipants(session).filter((p) => p.id !== game.puzzleCreatorId);

const firstGuesserId = (
  session: SessionInternal,
  game: HangmanGameInternal
): string | null => nonCreatorGuessers(session, game)[0]?.id ?? null;

const pickNextGuesser = (
  session: SessionInternal,
  game: HangmanGameInternal,
  currentId: string | null
): string | null => {
  const guessers = nonCreatorGuessers(session, game);
  if (guessers.length === 0) return null;
  if (!currentId) return guessers[0]!.id;
  const idx = guessers.findIndex((g) => g.id === currentId);
  if (idx === -1) return guessers[0]!.id;
  return guessers[(idx + 1) % guessers.length]!.id;
};

const appendHangmanActivity = (
  game: HangmanGameInternal,
  entry: Omit<HangmanActivity, "createdAt">
): void => {
  game.activityLog.push({ ...entry, createdAt: Date.now() });
  if (game.activityLog.length > 30) {
    game.activityLog = game.activityLog.slice(-30);
  }
};

const ensureGameShape = (game: GameInternal): GameInternal => {
  if (game.type === "hangman") {
    return {
      ...game,
      id: game.id ?? nanoid(6),
      mode: game.mode ?? "team",
      currentTurnId: game.currentTurnId ?? null,
      activeSolverId: game.activeSolverId ?? null,
      activityLog: game.activityLog ?? []
    };
  }
  if (game.type === "trivia") {
    return {
      ...game,
      id: game.id ?? nanoid(6),
      usedQuestionIds: game.usedQuestionIds ?? [],
      loading: game.loading ?? null,
      totalQuestions: game.totalQuestions ?? (game.questions.length || 1)
    };
  }
  if (game.type === "wouldYouRather") {
    return {
      ...game,
      id: game.id ?? nanoid(6),
      roundPrompts: game.roundPrompts ?? [],
      totalQuestions: Math.max(1, Number(game.totalQuestions) || 1),
      questionIndex: Math.max(0, Number(game.questionIndex) || 0),
      activePrompt: game.activePrompt ?? null,
      responses: game.responses ?? {},
      results: game.results ?? null,
      usedPromptIds: Array.isArray(game.usedPromptIds) ? game.usedPromptIds : [],
      allowParticipantSubmissions: game.allowParticipantSubmissions === true,
      inSubmittedRound: game.inSubmittedRound === true,
      submissions: Array.isArray(game.submissions) ? game.submissions : [],
      status: game.status === "results" || game.status === "finished" ? game.status : "questionOpen"
    };
  }
  if (game.type === "icebreaker") {
    const raw = game as IcebreakerGameInternal & { promptsPerParticipant?: number | null };
    return {
      ...game,
      id: game.id ?? nanoid(6),
      questions: game.questions ?? [],
      totalQuestions: game.totalQuestions ?? (game.questions?.length || 1),
      questionIndex: game.questionIndex ?? 0,
      activeQuestion: game.activeQuestion ?? null,
      privateSubmissions: game.privateSubmissions ?? {},
      revealed: game.revealed ?? [],
      usedQuestionIds: game.usedQuestionIds ?? [],
      promptsPerParticipant: raw.promptsPerParticipant ?? null,
      promptDraftsByParticipant: raw.promptDraftsByParticipant ?? {}
    };
  }
  if (game.type === "guessWhoSaidIt") {
    const g = game as GuessWhoSaidItGameInternal & { votingPrompts?: GuessWhoVotingPromptInternal[] | null };
    const legacyPrompts = Array.isArray(g.votingPrompts) ? g.votingPrompts : null;
    const migratedPrompt =
      g.votingPrompt ?? (legacyPrompts && legacyPrompts.length > 0 ? legacyPrompts[0]! : null);
    return {
      ...g,
      id: g.id ?? nanoid(6),
      questions: Array.isArray(g.questions) ? g.questions : [],
      totalQuestions: Math.max(1, Number(g.totalQuestions) || 1),
      questionIndex: Math.max(0, Number(g.questionIndex) || 0),
      activeQuestion: g.activeQuestion ?? null,
      privateSubmissions: g.privateSubmissions && typeof g.privateSubmissions === "object" ? g.privateSubmissions : {},
      answersByQuestionIndex:
        g.answersByQuestionIndex && typeof g.answersByQuestionIndex === "object" ? g.answersByQuestionIndex : {},
      usedQuestionIds: Array.isArray(g.usedQuestionIds) ? g.usedQuestionIds : [],
      votingQuestionIndex: Math.max(0, Number(g.votingQuestionIndex) || 0),
      votingPrompt: migratedPrompt,
      votes: g.votes && typeof g.votes === "object" ? g.votes : {},
      cumulativeCorrectByParticipant:
        g.cumulativeCorrectByParticipant && typeof g.cumulativeCorrectByParticipant === "object"
          ? g.cumulativeCorrectByParticipant
          : {},
      promptRevealSnapshot: g.promptRevealSnapshot ?? null,
      status:
        g.status === "idle" ||
        g.status === "collecting" ||
        g.status === "votingReady" ||
        g.status === "voting" ||
        g.status === "promptReveal" ||
        g.status === "roundSummary"
          ? g.status
          : "idle"
    };
  }
  if (game.type === "guessTheImage") {
    const desc = game.canonicalDescriptions ?? ["", "", "", ""];
    const setupMode: "single" | "everyone" = game.setupMode === "everyone" ? "everyone" : "single";
    const rawSlots = (game as GuessTheImageGameInternal).participantSetups;
    const participantSetups: Record<string, GuessImageParticipantSlotInternal> =
      rawSlots && typeof rawSlots === "object"
        ? Object.fromEntries(
            Object.entries(rawSlots).map(([id, slot]) => {
              const s = slot as GuessImageParticipantSlotInternal | undefined;
              const d0 = s?.canonicalDescriptions ?? ["", "", "", ""];
              return [
                id,
                {
                  imageFileId: s?.imageFileId ?? null,
                  canonicalDescriptions: [d0[0] ?? "", d0[1] ?? "", d0[2] ?? "", d0[3] ?? ""] as [
                    string,
                    string,
                    string,
                    string
                  ],
                  canonicalCorrectIndex: s?.canonicalCorrectIndex ?? 0,
                  revealDurationMs: s?.revealDurationMs ?? 60_000,
                  configured: s?.configured ?? false
                }
              ];
            })
          )
        : {};
    return {
      ...game,
      id: game.id ?? nanoid(6),
      setupMode,
      selectedRoundParticipantId:
        (game as GuessTheImageGameInternal).selectedRoundParticipantId === undefined
          ? null
          : (game as GuessTheImageGameInternal).selectedRoundParticipantId,
      participantSetups,
      canonicalDescriptions: [desc[0] ?? "", desc[1] ?? "", desc[2] ?? "", desc[3] ?? ""] as [
        string,
        string,
        string,
        string
      ],
      canonicalCorrectIndex: game.canonicalCorrectIndex ?? 0,
      revealDurationMs: game.revealDurationMs ?? 60_000,
      configured: game.configured ?? false,
      displayPerm: game.displayPerm ?? null,
      roundStartedAt: game.roundStartedAt ?? null,
      locks: game.locks ?? {},
      results: game.results ?? null,
      setupParticipantId: game.setupParticipantId ?? "",
      everyoneBetweenRounds: (game as GuessTheImageGameInternal).everyoneBetweenRounds === true
    };
  }
  if (game.type === "twentyQuestions") {
    const g = game as TwentyQuestionsGameInternal;
    const maxQ = Math.min(50, Math.max(1, Number(g.maxQuestions) || 20));
    return {
      ...g,
      id: g.id ?? nanoid(6),
      maxQuestions: maxQ,
      secretItem: g.secretItem ?? null,
      questionsUsed: g.questionsUsed ?? 0,
      currentAskerId: g.currentAskerId === undefined ? null : g.currentAskerId,
      questionLog: Array.isArray(g.questionLog) ? g.questionLog : [],
      questionDraft: g.questionDraft ?? null,
      outcome: g.outcome ?? null,
      scoresApplied: g.scoresApplied === true
    };
  }
  if (game.type === "captionThis") {
    const g = game as CaptionThisGameInternal;
    return {
      ...g,
      id: g.id ?? nanoid(6),
      imageFileId: g.imageFileId ?? null,
      roundNumber: Math.max(1, Number(g.roundNumber) || 1),
      captions: g.captions && typeof g.captions === "object" ? g.captions : {},
      entries: Array.isArray(g.entries) ? g.entries : [],
      displayOrder: Array.isArray(g.displayOrder) ? g.displayOrder : [],
      votes: g.votes && typeof g.votes === "object" ? g.votes : {}
    };
  }
  if (game.type === "pictionary") {
    const g = game as PictionaryGameInternal;
    const clampMs = (v: number): number =>
      Math.min(PICTORY_ROUND_DURATION_MAX_MS, Math.max(PICTORY_ROUND_DURATION_MIN_MS, v));
    const rd = clampMs(Number(g.roundDurationMs) || PICTORY_ROUND_DURATION_DEFAULT_MS);
    return {
      ...g,
      id: g.id ?? nanoid(6),
      roundDurationMs: rd,
      teamAIds: Array.isArray(g.teamAIds) ? g.teamAIds : [],
      teamBIds: Array.isArray(g.teamBIds) ? g.teamBIds : [],
      drawCounts: g.drawCounts && typeof g.drawCounts === "object" ? g.drawCounts : {},
      strokes: Array.isArray(g.strokes) ? g.strokes : [],
      usedClueIds: Array.isArray(g.usedClueIds) ? g.usedClueIds : [],
      currentPrompt: g.currentPrompt ?? null,
      currentClueId: g.currentClueId ?? null,
      drawerId: g.drawerId ?? null,
      activeTeam: g.activeTeam === "A" || g.activeTeam === "B" ? g.activeTeam : null,
      roundStartedAt: g.roundStartedAt ?? null,
      roundEndsAt: g.roundEndsAt ?? null,
      roundBreakEndsAt: g.roundBreakEndsAt ?? null,
      revealedPrompt: g.revealedPrompt ?? null,
      lastRoundResult: g.lastRoundResult === "correct" || g.lastRoundResult === "timeout" ? g.lastRoundResult : null,
      roundBreakNextTeam: g.roundBreakNextTeam === "A" || g.roundBreakNextTeam === "B" ? g.roundBreakNextTeam : null
    };
  }
  if (game.type === "applesToApples") {
    const g = game as ApplesToApplesGameInternal;
    return {
      ...g,
      id: g.id ?? nanoid(6),
      mode: g.mode === "finite" ? "finite" : "standard",
      roundNumber: Math.max(1, Number(g.roundNumber) || 1),
      judgeOrder: Array.isArray(g.judgeOrder) ? g.judgeOrder : [],
      judgeIndex: Math.max(0, Number(g.judgeIndex) || 0),
      topicId: g.topicId ?? "",
      topicText: g.topicText ?? "",
      usedTopicIds: Array.isArray(g.usedTopicIds) ? g.usedTopicIds : [],
      hands: g.hands && typeof g.hands === "object" ? g.hands : {},
      drawPile: Array.isArray(g.drawPile) ? g.drawPile : [],
      discardPile: Array.isArray(g.discardPile) ? g.discardPile : [],
      submissions: g.submissions && typeof g.submissions === "object" ? g.submissions : {},
      entries: Array.isArray(g.entries) ? g.entries : [],
      displayOrder: Array.isArray(g.displayOrder) ? g.displayOrder : [],
      roundWinnerEntryId: g.roundWinnerEntryId ?? null,
      roundWinnerParticipantId: g.roundWinnerParticipantId ?? null,
      roundWinningText: g.roundWinningText ?? null,
      roundResultReveal: Array.isArray(g.roundResultReveal) ? g.roundResultReveal : null,
      status:
        g.status === "collecting" ||
        g.status === "judging" ||
        g.status === "roundResult" ||
        g.status === "finished"
          ? g.status
          : "collecting"
    };
  }
  if (game.type === "uno") {
    const g = game as UnoGameInternal;
    const ac = g.activeColor;
    const activeColor: UnoActiveColor =
      ac === "red" || ac === "yellow" || ac === "green" || ac === "blue" ? ac : "red";
    return {
      ...g,
      id: g.id ?? nanoid(6),
      playerOrder: Array.isArray(g.playerOrder) ? g.playerOrder : [],
      hands: g.hands && typeof g.hands === "object" ? g.hands : {},
      drawPile: Array.isArray(g.drawPile) ? g.drawPile : [],
      discardPile: Array.isArray(g.discardPile) ? g.discardPile : [],
      currentPlayerIndex: Math.max(0, Number(g.currentPlayerIndex) || 0),
      direction: g.direction === -1 ? -1 : 1,
      activeColor,
      winnerParticipantId: g.winnerParticipantId ?? null,
      scoresApplied: g.scoresApplied === true,
      unoCatchOpenFor: g.unoCatchOpenFor ?? null,
      unoCatchAllowedAfterMs:
        typeof g.unoCatchAllowedAfterMs === "number" && Number.isFinite(g.unoCatchAllowedAfterMs)
          ? g.unoCatchAllowedAfterMs
          : null,
      unoAnnouncedParticipantId: g.unoAnnouncedParticipantId ?? null,
      pendingDrawnCardId: g.pendingDrawnCardId ?? null,
      status: g.status === "finished" || g.status === "playing" ? g.status : "playing"
    };
  }
  if (game.type === "bs") {
    const g = game as BsGameInternal;
    return {
      ...g,
      id: g.id ?? nanoid(6),
      playerOrder: Array.isArray(g.playerOrder) ? g.playerOrder : [],
      hands: g.hands && typeof g.hands === "object" ? g.hands : {},
      discardPile: Array.isArray(g.discardPile) ? g.discardPile : [],
      currentPlayerIndex: Math.max(0, Number(g.currentPlayerIndex) || 0),
      currentRankIndex: Math.max(0, Number(g.currentRankIndex) || 0) % 13,
      pendingPlayerId: g.pendingPlayerId ?? null,
      pendingPlayedCards: Array.isArray(g.pendingPlayedCards) ? g.pendingPlayedCards : [],
      believedParticipantIds: Array.isArray(g.believedParticipantIds) ? g.believedParticipantIds : [],
      calledBsParticipantId: g.calledBsParticipantId ?? null,
      finishedPlayerIds: Array.isArray(g.finishedPlayerIds) ? g.finishedPlayerIds : [],
      finalScores: g.finalScores && typeof g.finalScores === "object" ? g.finalScores : {},
      status:
        g.status === "playing" || g.status === "challenging" || g.status === "challenged" || g.status === "finished"
          ? g.status
          : "playing"
    };
  }
  if (game.type === "madlibs") {
    const g = game as MadlibsGameInternal;
    const template = g.template ?? pickMadlibTemplate([]);
    const blankCount = madlibBlankCount(template);
    const words =
      Array.isArray(g.words) && g.words.length === blankCount
        ? g.words.map((word) => (typeof word === "string" ? word : null))
        : Array.from({ length: blankCount }, () => null);
    const fillerParticipantIds =
      Array.isArray(g.fillerParticipantIds) && g.fillerParticipantIds.length === blankCount
        ? g.fillerParticipantIds
        : Array.from({ length: blankCount }, () => "");
    return {
      ...g,
      id: g.id ?? nanoid(6),
      template,
      status: g.status === "reading" ? "reading" : "filling",
      currentBlankIndex: Math.max(0, Math.min(blankCount, Number(g.currentBlankIndex) || 0)),
      words,
      fillerParticipantIds,
      readerParticipantId: g.readerParticipantId ?? null,
      usedTemplateIds: Array.isArray(g.usedTemplateIds) ? g.usedTemplateIds : []
    };
  }
  if (game.type === "catchPhrase") {
    const g = game as CatchPhraseGameInternal;
    const roundStartedAt = g.roundStartedAt ?? null;
    const roundEndsAt = g.roundEndsAt ?? null;
    let slowPhaseEndsAt = typeof g.slowPhaseEndsAt === "number" ? g.slowPhaseEndsAt : null;
    let mediumPhaseEndsAt = typeof g.mediumPhaseEndsAt === "number" ? g.mediumPhaseEndsAt : null;
    if (
      roundStartedAt !== null
      && roundEndsAt !== null
      && roundEndsAt > roundStartedAt
      && (slowPhaseEndsAt === null || mediumPhaseEndsAt === null)
    ) {
      const span = roundEndsAt - roundStartedAt;
      slowPhaseEndsAt = roundStartedAt + Math.floor(span / 3);
      mediumPhaseEndsAt = roundStartedAt + Math.floor((2 * span) / 3);
    }
    return {
      ...g,
      id: g.id ?? nanoid(6),
      status: g.status === "teamSetup" || g.status === "playing" || g.status === "finished" ? g.status : "teamSetup",
      roundPhase: g.roundPhase === "awaitingRoundStart" || g.roundPhase === "live" ? g.roundPhase : null,
      teamAIds: Array.isArray(g.teamAIds) ? g.teamAIds : [],
      teamBIds: Array.isArray(g.teamBIds) ? g.teamBIds : [],
      teamScores: {
        A: Math.max(0, Number(g.teamScores?.A) || 0),
        B: Math.max(0, Number(g.teamScores?.B) || 0)
      },
      passOrder: Array.isArray(g.passOrder) ? g.passOrder : [],
      holderIndex: typeof g.holderIndex === "number" ? g.holderIndex : null,
      usedClueIds: Array.isArray(g.usedClueIds) ? g.usedClueIds : [],
      currentClueId: g.currentClueId ?? null,
      currentPhrase: g.currentPhrase ?? null,
      roundStartedAt,
      slowPhaseEndsAt,
      mediumPhaseEndsAt,
      roundEndsAt,
      winnerTeam: g.winnerTeam === "A" || g.winnerTeam === "B" ? g.winnerTeam : null
    };
  }
  if (game.type === "yahtzee") {
    const g = game as YahtzeeGameInternal;
    const mode: YahtzeeMode = g.mode === "simultaneous" ? "simultaneous" : "turns";
    const playerOrder = Array.isArray(g.playerOrder) ? [...g.playerOrder] : [];
    const sheets: Record<string, YahtzeeSheetRow[]> = {};
    for (const pid of playerOrder) {
      const rows = g.sheetsByParticipant?.[pid];
      sheets[pid] = Array.isArray(rows)
        ? rows.filter((r) => r && typeof r.category === "string" && typeof r.points === "number")
        : [];
    }
    const clampDie = (n: number): number => Math.min(6, Math.max(1, Math.floor(Number(n)) || 1));
    const rawDice = Array.isArray(g.dice) && g.dice.length === 5 ? g.dice : [1, 1, 1, 1, 1];
    const dice: [number, number, number, number, number] = [
      clampDie(rawDice[0]!),
      clampDie(rawDice[1]!),
      clampDie(rawDice[2]!),
      clampDie(rawDice[3]!),
      clampDie(rawDice[4]!)
    ];
    const h = Array.isArray(g.held) && g.held.length === 5 ? g.held : [false, false, false, false, false];
    const held: [boolean, boolean, boolean, boolean, boolean] = [
      Boolean(h[0]),
      Boolean(h[1]),
      Boolean(h[2]),
      Boolean(h[3]),
      Boolean(h[4])
    ];
    const ru: 1 | 2 | 3 = g.rollsUsed === 2 || g.rollsUsed === 3 ? g.rollsUsed : 1;
    let currentPlayerIndex = Math.max(0, Math.floor(Number(g.currentPlayerIndex) || 0));
    if (playerOrder.length > 0) {
      currentPlayerIndex %= playerOrder.length;
    } else {
      currentPlayerIndex = 0;
    }
    const normalizeDiceTuple = (
      raw: unknown
    ): [number, number, number, number, number] => {
      const values = Array.isArray(raw) && raw.length === 5 ? raw : [1, 1, 1, 1, 1];
      return [
        clampDie(values[0] as number),
        clampDie(values[1] as number),
        clampDie(values[2] as number),
        clampDie(values[3] as number),
        clampDie(values[4] as number)
      ];
    };
    const normalizeHeldTuple = (raw: unknown): [boolean, boolean, boolean, boolean, boolean] => {
      const values = Array.isArray(raw) && raw.length === 5 ? raw : [false, false, false, false, false];
      return [Boolean(values[0]), Boolean(values[1]), Boolean(values[2]), Boolean(values[3]), Boolean(values[4])];
    };
    const diceByParticipant: Record<string, [number, number, number, number, number]> = {};
    const heldByParticipant: Record<string, [boolean, boolean, boolean, boolean, boolean]> = {};
    const rollsUsedByParticipant: Record<string, 1 | 2 | 3> = {};
    const pendingCategoryByParticipant: Record<string, YahtzeeCategory | null> = {};
    for (const pid of playerOrder) {
      const sourceDice = g.diceByParticipant?.[pid];
      const sourceHeld = g.heldByParticipant?.[pid];
      const sourceRolls = g.rollsUsedByParticipant?.[pid];
      diceByParticipant[pid] = normalizeDiceTuple(sourceDice ?? g.dice);
      heldByParticipant[pid] = normalizeHeldTuple(sourceHeld ?? g.held);
      rollsUsedByParticipant[pid] = sourceRolls === 2 || sourceRolls === 3 ? sourceRolls : 1;
      pendingCategoryByParticipant[pid] = g.pendingCategoryByParticipant?.[pid] ?? null;
    }
    const latestYahtzee =
      g.latestYahtzee
      && typeof g.latestYahtzee === "object"
      && typeof g.latestYahtzee.participantId === "string"
      && typeof g.latestYahtzee.createdAtMs === "number"
        ? {
            participantId: g.latestYahtzee.participantId,
            createdAtMs: Math.floor(g.latestYahtzee.createdAtMs)
          }
        : null;
    return {
      ...g,
      id: g.id ?? nanoid(6),
      status: g.status === "finished" || g.status === "playing" ? g.status : "playing",
      mode,
      playerOrder,
      currentPlayerIndex,
      dice,
      held,
      rollsUsed: ru,
      pendingCategory: g.pendingCategory ?? null,
      diceByParticipant,
      heldByParticipant,
      rollsUsedByParticipant,
      pendingCategoryByParticipant,
      latestYahtzee,
      sheetsByParticipant: sheets,
      scoresApplied: g.scoresApplied === true,
      yahtzeeGrandTotals:
        g.yahtzeeGrandTotals && typeof g.yahtzeeGrandTotals === "object" ? { ...g.yahtzeeGrandTotals } : undefined,
      placementAwards:
        g.placementAwards && typeof g.placementAwards === "object" ? { ...g.placementAwards } : undefined,
      winnerParticipantId: typeof g.winnerParticipantId === "string" ? g.winnerParticipantId : null
    };
  }
  return { ...game, id: game.id ?? nanoid(6) };
};

const yahtzeeRollDie = (): number => Math.floor(Math.random() * 6) + 1;
const YAHTZEE_TOTAL_ROUNDS_PER_PLAYER = 13;

const yahtzeeRollFiveDice = (): [number, number, number, number, number] => [
  yahtzeeRollDie(),
  yahtzeeRollDie(),
  yahtzeeRollDie(),
  yahtzeeRollDie(),
  yahtzeeRollDie()
];

const yahtzeeRerollKeepingHeld = (
  dice: [number, number, number, number, number],
  held: [boolean, boolean, boolean, boolean, boolean]
): [number, number, number, number, number] => {
  const next: number[] = [...dice];
  for (let i = 0; i < 5; i += 1) {
    if (!held[i]) {
      next[i] = yahtzeeRollDie();
    }
  }
  return next as [number, number, number, number, number];
};

const yahtzeeSheetHasCategory = (rows: YahtzeeSheetRow[], category: YahtzeeCategory): boolean =>
  rows.some((row) => row.category === category);

const yahtzeePlayerFinished = (rows: YahtzeeSheetRow[]): boolean => rows.length >= YAHTZEE_TOTAL_ROUNDS_PER_PLAYER;

const yahtzeeEveryoneFinished = (game: YahtzeeGameInternal): boolean => {
  if (game.playerOrder.length === 0) {
    return false;
  }
  for (const pid of game.playerOrder) {
    if (!yahtzeePlayerFinished(game.sheetsByParticipant[pid] ?? [])) {
      return false;
    }
  }
  return true;
};

/** Delay before others may call missed UNO after someone plays down to one card without declaring. */
const UNO_MISS_CATCH_DELAY_MS = 2000;
const BS_RANKS: BsRank[] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

const bsCurrentRank = (game: BsGameInternal): BsRank => BS_RANKS[game.currentRankIndex % BS_RANKS.length]!;

const madlibsBlankPrompts = (template: MadlibTemplate): MadlibsBlankPrompt[] =>
  template.segments
    .filter((segment): segment is { kind: "blank"; prompt: MadlibsBlankPrompt } => segment.kind === "blank")
    .map((segment) => segment.prompt);

const madlibsRotateFillers = (participantIds: string[], blankCount: number): string[] => {
  if (participantIds.length === 0) {
    return [];
  }
  return Array.from({ length: blankCount }, (_unused, index) => participantIds[index % participantIds.length]!);
};

const madlibsPickReader = (participantIds: string[], avoidParticipantId: string | null = null): string | null => {
  if (participantIds.length === 0) {
    return null;
  }
  const preferred =
    avoidParticipantId && participantIds.length > 1
      ? participantIds.filter((participantId) => participantId !== avoidParticipantId)
      : participantIds;
  const pool = preferred.length > 0 ? preferred : participantIds;
  return pool[Math.floor(Math.random() * pool.length)] ?? null;
};

const shuffleEntryIds = (ids: string[]): string[] => {
  const a = [...ids];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = a[i]!;
    a[i] = a[j]!;
    a[j] = t;
  }
  return a;
};

const shuffleGuessWhoSlotsInPlace = (slots: GuessWhoSlotInternal[]): void => {
  for (let i = slots.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = slots[i]!;
    slots[i] = slots[j]!;
    slots[j] = t;
  }
};

const applesJudgeId = (game: ApplesToApplesGameInternal): string => {
  if (game.judgeOrder.length === 0) {
    return "";
  }
  return game.judgeOrder[game.judgeIndex % game.judgeOrder.length]!;
};

const applesNonJudgeIds = (session: SessionInternal, game: ApplesToApplesGameInternal): string[] => {
  const j = applesJudgeId(game);
  return activeParticipants(session)
    .map((p) => p.id)
    .filter((id) => id !== j);
};

const refillApplesHands = (session: SessionInternal, game: ApplesToApplesGameInternal): void => {
  const ids = activeParticipants(session).map((p) => p.id);
  for (const pid of ids) {
    let hand = [...(game.hands[pid] ?? [])];
    while (hand.length < APPLES_TO_APPLES_HAND_SIZE) {
      if (game.drawPile.length === 0) {
        if (game.discardPile.length === 0) {
          break;
        }
        game.drawPile = shuffleEntryIds([...game.discardPile]);
        game.discardPile = [];
      }
      const next = game.drawPile.pop();
      if (!next) {
        break;
      }
      hand.push(next);
    }
    game.hands[pid] = hand;
  }
};

const twentyQuestionsGuesserIds = (session: SessionInternal, game: TwentyQuestionsGameInternal): string[] =>
  activeParticipants(session)
    .filter((p) => p.id !== game.itemSelectorId)
    .map((p) => p.id);

const twentyQuestionsHasPendingQuestion = (game: TwentyQuestionsGameInternal): boolean =>
  game.questionLog.some((entry) => entry.answer === null);

const twentyQuestionsFirstAskerId = (
  session: SessionInternal,
  game: TwentyQuestionsGameInternal
): string | null => {
  const ids = twentyQuestionsGuesserIds(session, game);
  return ids[0] ?? null;
};

const twentyQuestionsAdvanceAsker = (session: SessionInternal, game: TwentyQuestionsGameInternal): void => {
  const guessers = twentyQuestionsGuesserIds(session, game);
  if (guessers.length === 0) {
    game.currentAskerId = null;
    return;
  }
  if (!game.currentAskerId) {
    game.currentAskerId = guessers[0]!;
    return;
  }
  const idx = guessers.indexOf(game.currentAskerId);
  const base = idx === -1 ? 0 : idx;
  game.currentAskerId = guessers[(base + 1) % guessers.length]!;
};

/** Pause between rounds so everyone can see the clue (ms). */
const PICTORY_ROUND_BREAK_MS = 3200;

const validatePictionaryTeamRoster = (
  session: SessionInternal,
  teamAIds: string[],
  teamBIds: string[]
): void => {
  const activeIds = new Set(activeParticipants(session).map((p) => p.id));
  const a = new Set(teamAIds);
  const b = new Set(teamBIds);
  if (teamAIds.length === 0 || teamBIds.length === 0) {
    throw new Error("Each team needs at least one player.");
  }
  for (const id of teamAIds) {
    if (b.has(id)) {
      throw new Error("A player cannot be on both teams.");
    }
  }
  if (a.size !== teamAIds.length || b.size !== teamBIds.length) {
    throw new Error("Duplicate players on a team are not allowed.");
  }
  const union = new Set([...teamAIds, ...teamBIds]);
  if (union.size !== activeIds.size || ![...activeIds].every((id) => union.has(id))) {
    throw new Error("Each active player must be assigned to exactly one team.");
  }
  for (const id of union) {
    if (!activeIds.has(id)) {
      throw new Error("Teams can only include active players in this session.");
    }
  }
};

const validateCatchPhraseTeamRoster = (
  session: SessionInternal,
  teamAIds: string[],
  teamBIds: string[]
): void => {
  const activeIds = new Set(activeParticipants(session).map((p) => p.id));
  const a = new Set(teamAIds);
  const b = new Set(teamBIds);
  if (activeIds.size < CATCH_PHRASE_MIN_PLAYERS) {
    throw new Error("Catch Phrase needs at least four active players.");
  }
  if (teamAIds.length < 2 || teamBIds.length < 2) {
    throw new Error("Catch Phrase needs at least two players on each team.");
  }
  for (const id of teamAIds) {
    if (b.has(id)) {
      throw new Error("A player cannot be on both teams.");
    }
  }
  if (a.size !== teamAIds.length || b.size !== teamBIds.length) {
    throw new Error("Duplicate players on a team are not allowed.");
  }
  const union = new Set([...teamAIds, ...teamBIds]);
  if (union.size !== activeIds.size || ![...activeIds].every((id) => union.has(id))) {
    throw new Error("Each active player must be assigned to exactly one team.");
  }
};

const catchPhraseTeamForParticipant = (game: CatchPhraseGameInternal, participantId: string): "A" | "B" | null => {
  if (game.teamAIds.includes(participantId)) {
    return "A";
  }
  if (game.teamBIds.includes(participantId)) {
    return "B";
  }
  return null;
};

const buildCatchPhrasePassOrder = (
  session: SessionInternal,
  teamAIds: string[],
  teamBIds: string[]
): string[] => {
  const activeOrder = activeParticipants(session).map((p) => p.id);
  const setA = new Set(teamAIds);
  const setB = new Set(teamBIds);
  const orderedA = activeOrder.filter((id) => setA.has(id));
  const orderedB = activeOrder.filter((id) => setB.has(id));
  const out: string[] = [];
  const maxLen = Math.max(orderedA.length, orderedB.length);
  for (let i = 0; i < maxLen; i += 1) {
    if (orderedA[i]) {
      out.push(orderedA[i]);
    }
    if (orderedB[i]) {
      out.push(orderedB[i]);
    }
  }
  return out;
};

const catchPhraseRandomInclusiveMs = (minMs: number, maxMs: number): number =>
  minMs + Math.floor(Math.random() * (maxMs - minMs + 1));

const catchPhraseRandomPhaseBoundaries = (
  now: number
): { roundStartedAt: number; slowPhaseEndsAt: number; mediumPhaseEndsAt: number; roundEndsAt: number } => {
  const d1 = catchPhraseRandomInclusiveMs(CATCH_PHRASE_PHASE1_MIN_MS, CATCH_PHRASE_PHASE1_MAX_MS);
  const d2 = catchPhraseRandomInclusiveMs(CATCH_PHRASE_PHASE2_MIN_MS, CATCH_PHRASE_PHASE2_MAX_MS);
  const d3 = catchPhraseRandomInclusiveMs(CATCH_PHRASE_PHASE3_MIN_MS, CATCH_PHRASE_PHASE3_MAX_MS);
  const roundStartedAt = now;
  const slowPhaseEndsAt = now + d1;
  const mediumPhaseEndsAt = now + d1 + d2;
  const roundEndsAt = now + d1 + d2 + d3;
  return { roundStartedAt, slowPhaseEndsAt, mediumPhaseEndsAt, roundEndsAt };
};

const nextCatchPhraseHolderOnTeam = (
  game: CatchPhraseGameInternal,
  startIndex: number,
  team: "A" | "B"
): number | null => {
  if (game.passOrder.length === 0) {
    return null;
  }
  for (let step = 1; step <= game.passOrder.length; step += 1) {
    const idx = (startIndex + step) % game.passOrder.length;
    const pid = game.passOrder[idx]!;
    if (catchPhraseTeamForParticipant(game, pid) === team) {
      return idx;
    }
  }
  return null;
};

const pickPictionaryDrawer = (memberIds: string[], drawCounts: Record<string, number>): string => {
  if (memberIds.length === 0) {
    throw new Error("No players on that team.");
  }
  const min = Math.min(...memberIds.map((id) => drawCounts[id] ?? 0));
  const candidates = memberIds.filter((id) => (drawCounts[id] ?? 0) === min);
  return candidates[Math.floor(Math.random() * candidates.length)]!;
};

const otherPictionaryTeam = (t: "A" | "B"): "A" | "B" => (t === "A" ? "B" : "A");

const shuffleDisplayPerm = (): [number, number, number, number] => {
  const indices = [0, 1, 2, 3];
  for (let i = indices.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = indices[i]!;
    indices[i] = indices[j]!;
    indices[j] = tmp;
  }
  return [indices[0]!, indices[1]!, indices[2]!, indices[3]!];
};

const freshGuessImageParticipantSlot = (): GuessImageParticipantSlotInternal => ({
  imageFileId: null,
  canonicalDescriptions: ["", "", "", ""],
  canonicalCorrectIndex: 0,
  revealDurationMs: 60_000,
  configured: false
});

const buildGuessImageParticipantSetups = (
  session: SessionInternal
): Record<string, GuessImageParticipantSlotInternal> =>
  Object.fromEntries(activeParticipants(session).map((p) => [p.id, freshGuessImageParticipantSlot()]));

const guessImageEveryoneAllConfigured = (
  session: SessionInternal,
  game: GuessTheImageGameInternal
): boolean => {
  const ids = activeParticipants(session).map((p) => p.id);
  return ids.length > 0 && ids.every((id) => Boolean(game.participantSetups[id]?.configured));
};

export class SessionService {
  private sessions = new Map<string, SessionInternal>();
  private readonly store: FileStore<PersistedState>;
  private readonly triviaQuestionLoader: TriviaQuestionLoader;
  private readonly dataDirectory: string;
  private onSessionUpdated?: (sessionId: string) => void;
  private readonly guessImageResolveTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly pictionaryResolveTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly catchPhraseResolveTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly scattergoriesResolveTimers = new Map<string, ReturnType<typeof setTimeout>>();

  public constructor(
    store: FileStore<PersistedState>,
    triviaQuestionLoader: TriviaQuestionLoader = createTriviaQuestionLoader(),
    dataDirectory: string = process.env.DATA_DIR ?? "./data"
  ) {
    this.store = store;
    this.triviaQuestionLoader = triviaQuestionLoader;
    this.dataDirectory = dataDirectory;
  }

  public getDataDirectory(): string {
    return this.dataDirectory;
  }

  public assertIcebreakerUploadAllowed(sessionId: string, participantId: string): { questionIndex: number } {
    const session = this.getSessionOrThrow(sessionId);
    assertParticipantActiveForGameplay(session, participantId);
    const game = session.games[0];
    if (game?.type !== "icebreaker" || game.status !== "collecting") {
      throw new Error("Icebreaker is not accepting uploads.");
    }
    if (!session.participants.some((p) => p.id === participantId)) {
      throw new Error("Participant is not in this session.");
    }
    return { questionIndex: game.questionIndex };
  }

  public assertGuessWhoSaidItUploadAllowed(sessionId: string, participantId: string): { questionIndex: number } {
    const session = this.getSessionOrThrow(sessionId);
    assertParticipantActiveForGameplay(session, participantId);
    const game = session.games[0];
    if (game?.type !== "guessWhoSaidIt" || game.status !== "collecting") {
      throw new Error("Guess Who Said It is not accepting uploads.");
    }
    if (!session.participants.some((p) => p.id === participantId)) {
      throw new Error("Participant is not in this session.");
    }
    return { questionIndex: game.questionIndex };
  }

  public assertGuessTheImageUploadAllowed(sessionId: string, participantId: string): void {
    const session = this.getSessionOrThrow(sessionId);
    assertParticipantActiveForGameplay(session, participantId);
    const game = session.games[0];
    if (game?.type !== "guessTheImage") {
      throw new Error("Guess the image is not active.");
    }
    if (game.status === "playing") {
      throw new Error("Cannot replace the image while a round is in progress.");
    }
    if (!session.participants.some((p) => p.id === participantId)) {
      throw new Error("Participant is not in this session.");
    }
    if (game.setupMode === "everyone") {
      if (game.status !== "setup" && game.status !== "finished") {
        throw new Error("Cannot upload outside setup.");
      }
      return;
    }
    if (participantId !== game.setupParticipantId) {
      throw new Error("Only the designated setup player can upload for this round.");
    }
  }

  public assertCaptionThisUploadAllowed(sessionId: string, participantId: string): void {
    const session = this.getSessionOrThrow(sessionId);
    assertParticipantActiveForGameplay(session, participantId);
    const game = session.games[0];
    if (game?.type !== "captionThis") {
      throw new Error("Caption This is not active.");
    }
    if (game.status !== "waitingForImage") {
      throw new Error("Cannot upload an image right now.");
    }
    if (!session.participants.some((p) => p.id === participantId)) {
      throw new Error("Participant is not in this session.");
    }
    if (participantId !== game.imageProviderId) {
      throw new Error("Only the image provider can upload for this round.");
    }
  }

  public setStateUpdateListener(listener: ((sessionId: string) => void) | undefined): void {
    this.onSessionUpdated = listener;
  }

  public async load(): Promise<void> {
    const data = await this.store.read({ sessions: [] });
    this.sessions = new Map(
      data.sessions.map((session) => {
        const legacy = session as SessionInternal & {
          activeGame?: GameType | null;
          game?: (GameInternal & { mode?: HangmanMode }) | null;
        };
        const games: GameInternal[] = Array.isArray(legacy.games)
          ? legacy.games.map((entry) => ensureGameShape(entry as GameInternal))
          : legacy.game
            ? [ensureGameShape(legacy.game as GameInternal)]
            : [];
        const legacyPrefs = legacy as SessionInternal & {
          lobbyGamePreferences?: Record<string, GameType>;
        };
        const migrated: SessionInternal = {
          sessionId: session.sessionId,
          sessionName:
            session.sessionName ??
            session.joinCode
              .split("-")
              .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
              .join(" "),
          joinCode: session.joinCode,
          participants: session.participants ?? [],
          games,
          updatedAt: session.updatedAt ?? Date.now(),
          lobbyGamePreferences:
            legacyPrefs.lobbyGamePreferences && typeof legacyPrefs.lobbyGamePreferences === "object"
              ? { ...legacyPrefs.lobbyGamePreferences }
              : {}
        };
        for (const p of migrated.participants) {
          if (p.isActive === undefined) {
            p.isActive = true;
          }
        }
        return [session.sessionId, migrated] as const;
      })
    );
    let repairedGuessImageSetup = false;
    for (const s of this.sessions.values()) {
      const g = s.games[0];
      if (g?.type === "guessTheImage") {
        const hostId = s.participants.find((p) => p.isHost)?.id ?? s.participants[0]?.id;
        if (hostId && (!g.setupParticipantId || !s.participants.some((p) => p.id === g.setupParticipantId))) {
          g.setupParticipantId = hostId;
          repairedGuessImageSetup = true;
        }
        if (g.setupMode === "everyone" && g.status === "setup") {
          for (const p of activeParticipants(s)) {
            if (!g.participantSetups[p.id]) {
              g.participantSetups[p.id] = freshGuessImageParticipantSlot();
              repairedGuessImageSetup = true;
            }
          }
        }
      }
    }
    if (repairedGuessImageSetup) {
      await this.persist();
    }
  }

  private async persist(): Promise<void> {
    await this.store.write({ sessions: [...this.sessions.values()] });
  }

  private getSessionOrThrow(sessionId: string): SessionInternal {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error("Session not found.");
    }
    return session;
  }

  public async createSession(displayName: string, requestedSessionName?: string): Promise<{
    sessionId: string;
    sessionName: string;
    joinCode: string;
    participantId: string;
  }> {
    const sessionId = nanoid(10);
    const preferredCode = requestedSessionName ? normalizeSessionCode(requestedSessionName) : "";
    if (preferredCode) {
      const existing = [...this.sessions.values()].find((session) => session.joinCode === preferredCode);
      if (existing) {
        throw new Error("Session name is already in use.");
      }
    }
    let joinCode = preferredCode || randomWordCode();
    while ([...this.sessions.values()].some((session) => session.joinCode === joinCode)) {
      joinCode = randomWordCode();
    }
    const participantId = nanoid(8);
    const sessionName = joinCode
      .split("-")
      .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
      .join(" ");
    const session: SessionInternal = {
      sessionId,
      sessionName,
      joinCode,
      participants: [{ id: participantId, displayName, isHost: true, score: 0, isActive: true }],
      games: [],
      updatedAt: Date.now(),
      lobbyGamePreferences: {}
    };
    this.sessions.set(sessionId, session);
    await this.persist();
    return { sessionId, sessionName, joinCode, participantId };
  }

  public async joinSession(joinCode: string, displayName: string): Promise<{
    sessionId: string;
    participantId: string;
  }> {
    const session = [...this.sessions.values()].find((item) => item.joinCode === joinCode.toUpperCase());
    if (!session) {
      throw new Error("Invalid join code.");
    }

    const existing = session.participants.find((participant) => participant.displayName === displayName);
    const participantId = existing ? existing.id : nanoid(8);
    if (existing) {
      existing.isActive = true;
      session.updatedAt = Date.now();
      await this.persist();
    } else {
      session.participants.push({
        id: participantId,
        displayName,
        isHost: false,
        score: 0,
        isActive: true
      });
      session.updatedAt = Date.now();

      const guessJoin = session.games[0];
      if (
        guessJoin?.type === "guessTheImage"
        && guessJoin.status === "setup"
        && guessJoin.setupMode === "everyone"
      ) {
        guessJoin.participantSetups[participantId] = freshGuessImageParticipantSlot();
      }

      // If a turns-mode hangman round is already in progress but has no
      // assigned guesser (because the host set the word before anyone joined),
      // the first guesser to arrive takes the first turn. Without this the
      // keyboard stays locked for everyone forever.
      const activeHangman = session.games[0];
      if (
        activeHangman?.type === "hangman"
        && activeHangman.mode === "turns"
        && activeHangman.status === "inProgress"
        && activeHangman.currentTurnId === null
        && participantId !== activeHangman.puzzleCreatorId
      ) {
        activeHangman.currentTurnId = participantId;
      }

      await this.persist();
    }
    return { sessionId: session.sessionId, participantId };
  }

  public listActiveSessions(): Array<{ sessionId: string; sessionName: string; joinCode: string; participantCount: number }> {
    return [...this.sessions.values()]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((session) => ({
        sessionId: session.sessionId,
        sessionName: session.sessionName,
        joinCode: session.joinCode,
        participantCount: session.participants.length
      }));
  }

  public getState(sessionId: string, viewerParticipantId?: string): SessionState {
    const session = this.getSessionOrThrow(sessionId);
    const state = this.toPublicState(session, viewerParticipantId);
    const lobbyGamePreferences =
      session.games.length === 0 ? pruneLobbyGamePreferences(session, session.lobbyGamePreferences) : {};
    return { ...state, lobbyGamePreferences };
  }

  public isHost(sessionId: string, participantId: string): boolean {
    const session = this.getSessionOrThrow(sessionId);
    return Boolean(session.participants.find((participant) => participant.id === participantId && participant.isHost));
  }

  public async setLobbyGamePreference(sessionId: string, participantId: string, game: GameType): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    if (session.games.length > 0) {
      throw new Error("Preferences can only be set in the lobby.");
    }
    if (!session.participants.some((p) => p.id === participantId)) {
      throw new Error("Participant is not in this session.");
    }
    const prefParticipant = session.participants.find((p) => p.id === participantId);
    if (!prefParticipant || !participantIsActive(prefParticipant)) {
      throw new Error("Inactive players cannot set a game preference.");
    }
    if (session.participants.some((p) => p.id === participantId && p.isHost)) {
      throw new Error("Host cannot set a game preference.");
    }
    session.lobbyGamePreferences[participantId] = game;
    session.updatedAt = Date.now();
    await this.persist();
  }

  public async startGame(
    sessionId: string,
    game: GameType,
    options: GameStartOptions = {}
  ): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    session.lobbyGamePreferences = {};
    const previousGame = session.games[0];
    if (previousGame?.type === "guessTheImage") {
      this.clearGuessImageTimer(sessionId);
      await purgeAllGuessTheImageSessionUploads(this.dataDirectory, sessionId);
    }
    if (previousGame?.type === "captionThis") {
      await purgeAllCaptionThisSessionUploads(this.dataDirectory, sessionId);
    }
    if (previousGame?.type === "pictionary") {
      this.clearPictionaryTimer(sessionId);
    }
    if (previousGame?.type === "catchPhrase") {
      this.clearCatchPhraseTimer(sessionId);
    }
    if (previousGame?.type === "scattergories") {
      this.clearScattergoriesTimer(sessionId);
    }
    const previousTrivia = session.games.find((entry): entry is TriviaGameInternal => entry.type === "trivia");
    session.updatedAt = Date.now();
    let next: GameInternal;
    if (game === "hangman") {
      const requestedCreatorId = options.hangmanCreatorId;
      const actives = activeParticipants(session);
      if (requestedCreatorId && !actives.some((participant) => participant.id === requestedCreatorId)) {
        throw new Error("Puzzle creator must be an active player in this session.");
      }
      const creatorId =
        requestedCreatorId
        ?? actives.find((participant) => participant.isHost)?.id
        ?? actives[0]?.id;
      if (!creatorId) {
        throw new Error("No participants in session.");
      }
      const previousHangman = session.games.find((entry) => entry.type === "hangman") as
        | HangmanGameInternal
        | undefined;
      const mode: HangmanMode = options.hangmanMode ?? previousHangman?.mode ?? "team";
      next = {
        id: nanoid(6),
        type: "hangman",
        puzzleCreatorId: creatorId,
        secretWord: null,
        maskedWord: "",
        guessedLetters: [],
        wrongGuessCount: 0,
        maxWrongGuesses: 6,
        status: "waitingForWord",
        mode,
        currentTurnId: null,
        activeSolverId: null,
        activityLog: []
      };
    } else if (game === "twoTruthsLie") {
      next = {
        id: nanoid(6),
        type: "twoTruthsLie",
        submissions: {},
        currentPresenterId: null,
        votes: {},
        status: "collecting"
      };
    } else if (game === "trivia") {
      next = {
        id: nanoid(6),
        type: "trivia",
        questions: [],
        totalQuestions: 1,
        questionIndex: 0,
        activeQuestion: null,
        answers: {},
        usedQuestionIds: previousTrivia?.usedQuestionIds ?? [],
        loading: null,
        status: "idle"
      };
    } else if (game === "wouldYouRather") {
      const previousWouldYouRather = session.games.find(
        (entry): entry is WouldYouRatherGameInternal => entry.type === "wouldYouRather"
      );
      const count = Math.max(1, Math.min(200, Math.floor(options.wouldYouRatherTotalQuestions ?? 12)));
      const usedPromptIds = new Set(previousWouldYouRather?.usedPromptIds ?? []);
      const picked = pickWouldYouRatherPrompts(usedPromptIds, count).map((prompt) => ({
        id: prompt.id,
        optionA: prompt.optionA,
        optionB: prompt.optionB,
        source: prompt.source,
        submittedByParticipantId: prompt.submittedByParticipantId
      }));
      picked.forEach((prompt) => usedPromptIds.add(prompt.id));
      next = {
        id: nanoid(6),
        type: "wouldYouRather",
        status: picked.length > 0 ? "questionOpen" : "finished",
        roundPrompts: picked,
        totalQuestions: picked.length || 1,
        questionIndex: 0,
        activePrompt: picked[0] ?? null,
        responses: {},
        results: null,
        usedPromptIds: [...usedPromptIds],
        allowParticipantSubmissions: options.wouldYouRatherAllowParticipantSubmissions === true,
        inSubmittedRound: false,
        submissions: []
      };
    } else if (game === "icebreaker") {
      const previousIcebreaker = session.games.find((entry): entry is IcebreakerGameInternal => entry.type === "icebreaker");
      next = {
        id: nanoid(6),
        type: "icebreaker",
        questions: [],
        totalQuestions: 1,
        questionIndex: 0,
        activeQuestion: null,
        privateSubmissions: {},
        revealed: [],
        usedQuestionIds: previousIcebreaker?.usedQuestionIds ?? [],
        status: "idle",
        promptsPerParticipant: null,
        promptDraftsByParticipant: {}
      };
    } else if (game === "guessWhoSaidIt") {
      if (activeParticipants(session).length < 2) {
        throw new Error("Guess Who Said It needs at least two active players.");
      }
      const previousGuessWho = session.games.find(
        (entry): entry is GuessWhoSaidItGameInternal => entry.type === "guessWhoSaidIt"
      );
      next = {
        id: nanoid(6),
        type: "guessWhoSaidIt",
        questions: [],
        totalQuestions: 1,
        questionIndex: 0,
        activeQuestion: null,
        privateSubmissions: {},
        answersByQuestionIndex: {},
        usedQuestionIds: previousGuessWho?.usedQuestionIds ?? [],
        status: "idle",
        votingQuestionIndex: 0,
        votingPrompt: null,
        votes: {},
        cumulativeCorrectByParticipant: {},
        promptRevealSnapshot: null
      };
    } else if (game === "guessTheImage") {
      const actives = activeParticipants(session);
      const hostId = actives.find((p) => p.isHost)?.id ?? actives[0]?.id;
      if (!hostId) {
        throw new Error("No active participants in session.");
      }
      const requestedSetup = options.guessImageSetupParticipantId;
      const setupParticipantId =
        requestedSetup && actives.some((p) => p.id === requestedSetup) ? requestedSetup : hostId;
      const setupMode = options.guessImageSetupMode === "everyone" ? "everyone" : "single";
      next = {
        id: nanoid(6),
        type: "guessTheImage",
        status: "setup",
        setupMode,
        setupParticipantId,
        selectedRoundParticipantId: null,
        participantSetups: setupMode === "everyone" ? buildGuessImageParticipantSetups(session) : {},
        imageFileId: null,
        canonicalDescriptions: ["", "", "", ""],
        canonicalCorrectIndex: 0,
        revealDurationMs: 60_000,
        configured: false,
        displayPerm: null,
        roundStartedAt: null,
        locks: {},
        results: null,
        everyoneBetweenRounds: false
      };
    } else if (game === "twentyQuestions") {
      const actives = activeParticipants(session);
      if (actives.length < 2) {
        throw new Error("20 Questions needs at least two active players.");
      }
      const requestedSelector = options.twentyQuestionsItemSelectorId;
      const itemSelectorId =
        requestedSelector && actives.some((p) => p.id === requestedSelector)
          ? requestedSelector
          : (actives.find((p) => p.isHost)?.id ?? actives[0]!.id);
      const guessers = actives.filter((p) => p.id !== itemSelectorId);
      if (guessers.length === 0) {
        throw new Error("20 Questions needs at least one person who is not the item selector.");
      }
      const rawMax = options.twentyQuestionsMaxQuestions ?? 20;
      const maxQuestions = Math.min(50, Math.max(1, Math.floor(Number(rawMax)) || 20));
      next = {
        id: nanoid(6),
        type: "twentyQuestions",
        status: "waitingForItem",
        itemSelectorId,
        maxQuestions,
        secretItem: null,
        questionsUsed: 0,
        currentAskerId: null,
        questionLog: [],
        questionDraft: null,
        outcome: null,
        scoresApplied: false
      };
    } else if (game === "captionThis") {
      const actives = activeParticipants(session);
      if (actives.length < 2) {
        throw new Error("Caption This needs at least two active players.");
      }
      const requestedProvider = options.captionThisImageProviderId;
      const imageProviderId =
        requestedProvider && actives.some((p) => p.id === requestedProvider)
          ? requestedProvider
          : (actives.find((p) => p.isHost)?.id ?? actives[0]!.id);
      next = {
        id: nanoid(6),
        type: "captionThis",
        status: "waitingForImage",
        imageProviderId,
        imageFileId: null,
        roundNumber: 1,
        captions: {},
        entries: [],
        displayOrder: [],
        votes: {}
      };
    } else if (game === "pictionary") {
      if (activeParticipants(session).length < 2) {
        throw new Error("Pictionary needs at least two active players.");
      }
      const rawMs = options.pictionaryRoundDurationMs ?? PICTORY_ROUND_DURATION_DEFAULT_MS;
      const roundDurationMs = Math.min(
        PICTORY_ROUND_DURATION_MAX_MS,
        Math.max(PICTORY_ROUND_DURATION_MIN_MS, Math.floor(Number(rawMs)) || PICTORY_ROUND_DURATION_DEFAULT_MS)
      );
      this.clearPictionaryTimer(sessionId);
      next = {
        id: nanoid(6),
        type: "pictionary",
        status: "teamSetup",
        roundDurationMs,
        teamAIds: [],
        teamBIds: [],
        drawCounts: {},
        strokes: [],
        usedClueIds: [],
        currentPrompt: null,
        currentClueId: null,
        drawerId: null,
        activeTeam: null,
        roundStartedAt: null,
        roundEndsAt: null,
        roundBreakEndsAt: null,
        revealedPrompt: null,
        lastRoundResult: null,
        roundBreakNextTeam: null
      };
    } else if (game === "applesToApples") {
      const actives = activeParticipants(session);
      if (actives.length < 3) {
        throw new Error("Apples to Apples needs at least three active players.");
      }
      const mode = options.applesToApplesMode === "finite" ? "finite" : "standard";
      const judgeOrder = actives.map((p) => p.id);
      const deck = shuffledResponseCardIds();
      const need = judgeOrder.length * APPLES_TO_APPLES_HAND_SIZE;
      if (deck.length < need) {
        throw new Error("Not enough response cards in the library to deal hands.");
      }
      const hands: Record<string, string[]> = {};
      for (const pid of judgeOrder) {
        hands[pid] = deck.splice(0, APPLES_TO_APPLES_HAND_SIZE);
      }
      const usedTopicIds: string[] = [];
      const topic = pickApplesTopic(new Set(usedTopicIds));
      usedTopicIds.push(topic.id);
      next = {
        id: nanoid(6),
        type: "applesToApples",
        mode,
        status: "collecting",
        roundNumber: 1,
        judgeOrder,
        judgeIndex: 0,
        topicId: topic.id,
        topicText: topic.text,
        usedTopicIds,
        hands,
        drawPile: deck,
        discardPile: [],
        submissions: {},
        entries: [],
        displayOrder: [],
        roundWinnerEntryId: null,
        roundWinnerParticipantId: null,
        roundWinningText: null,
        roundResultReveal: null
      };
    } else if (game === "uno") {
      const actives = activeParticipants(session);
      if (actives.length < 2) {
        throw new Error("UNO needs at least two active players.");
      }
      const playerOrder = actives.map((p) => p.id);
      const deck = shuffledUnoDeck();
      const hands: Record<string, UnoCard[]> = {};
      for (const pid of playerOrder) {
        hands[pid] = [];
      }
      for (let h = 0; h < UNO_HAND_SIZE; h += 1) {
        for (const pid of playerOrder) {
          hands[pid].push(deck.pop()!);
        }
      }
      let guard = 0;
      while (deck.length > 0 && guard < 200) {
        guard += 1;
        const top = deck[deck.length - 1]!;
        if (isColoredNumberCard(top)) {
          break;
        }
        deck.unshift(deck.pop()!);
      }
      if (deck.length === 0) {
        throw new Error("Could not find a valid UNO starter card.");
      }
      const starter = deck.pop()!;
      const discardPile: UnoCard[] = [starter];
      const activeColor = starter.color as UnoActiveColor;
      next = {
        id: nanoid(6),
        type: "uno",
        status: "playing",
        playerOrder,
        hands,
        drawPile: deck,
        discardPile,
        currentPlayerIndex: normPlayerIndex(0 + 1, playerOrder.length),
        direction: 1,
        activeColor,
        winnerParticipantId: null,
        scoresApplied: false,
        unoCatchOpenFor: null,
        unoCatchAllowedAfterMs: null,
        unoAnnouncedParticipantId: null,
        pendingDrawnCardId: null
      };
    } else if (game === "bs") {
      const actives = activeParticipants(session);
      if (actives.length < 3) {
        throw new Error("BS needs at least three active players.");
      }
      const playerOrder = actives.map((p) => p.id);
      const deck = shuffledBsDeck();
      const hands: Record<string, BsCard[]> = {};
      for (const pid of playerOrder) {
        hands[pid] = [];
      }
      for (let i = 0; i < deck.length; i += 1) {
        const pid = playerOrder[i % playerOrder.length]!;
        hands[pid]!.push(deck[i]!);
      }
      next = {
        id: nanoid(6),
        type: "bs",
        status: "playing",
        playerOrder,
        hands,
        discardPile: [],
        currentPlayerIndex: 0,
        currentRankIndex: 0,
        pendingPlayerId: null,
        pendingPlayedCards: [],
        believedParticipantIds: [],
        calledBsParticipantId: null,
        finishedPlayerIds: [],
        finalScores: {}
      };
    } else if (game === "madlibs") {
      const actives = activeParticipants(session);
      if (actives.length < 2) {
        throw new Error("Madlibs needs at least two active players.");
      }
      const template = pickMadlibTemplate([]);
      const blankCount = madlibBlankCount(template);
      const participantIds = actives.map((participant) => participant.id);
      next = {
        id: nanoid(6),
        type: "madlibs",
        status: "filling",
        template,
        usedTemplateIds: [template.id],
        currentBlankIndex: 0,
        fillerParticipantIds: madlibsRotateFillers(participantIds, blankCount),
        words: Array.from({ length: blankCount }, () => null),
        readerParticipantId: null
      };
    } else if (game === "catchPhrase") {
      const actives = activeParticipants(session);
      if (actives.length < CATCH_PHRASE_MIN_PLAYERS) {
        throw new Error("Catch Phrase needs at least four active players.");
      }
      this.clearCatchPhraseTimer(sessionId);
      next = {
        id: nanoid(6),
        type: "catchPhrase",
        status: "teamSetup",
        roundPhase: null,
        teamAIds: [],
        teamBIds: [],
        teamScores: { A: 0, B: 0 },
        passOrder: [],
        holderIndex: null,
        usedClueIds: [],
        currentClueId: null,
        currentPhrase: null,
        roundStartedAt: null,
        slowPhaseEndsAt: null,
        mediumPhaseEndsAt: null,
        roundEndsAt: null,
        winnerTeam: null
      };
    } else if (game === "yahtzee") {
      const actives = activeParticipants(session);
      if (actives.length < 1) {
        throw new Error("Yahtzee needs at least one active player.");
      }
      const yahtzeeMode: YahtzeeMode = options?.yahtzeeMode === "simultaneous" ? "simultaneous" : "turns";
      const playerOrder = actives.map((p) => p.id);
      const sheetsByParticipant: Record<string, YahtzeeSheetRow[]> = {};
      const diceByParticipant: Record<string, [number, number, number, number, number]> = {};
      const heldByParticipant: Record<string, [boolean, boolean, boolean, boolean, boolean]> = {};
      const rollsUsedByParticipant: Record<string, 1 | 2 | 3> = {};
      const pendingCategoryByParticipant: Record<string, YahtzeeCategory | null> = {};
      for (const pid of playerOrder) {
        sheetsByParticipant[pid] = [];
        diceByParticipant[pid] = yahtzeeRollFiveDice();
        heldByParticipant[pid] = [false, false, false, false, false];
        rollsUsedByParticipant[pid] = 1;
        pendingCategoryByParticipant[pid] = null;
      }
      const dice = yahtzeeRollFiveDice();
      next = {
        id: nanoid(6),
        type: "yahtzee",
        status: "playing",
        mode: yahtzeeMode,
        playerOrder,
        currentPlayerIndex: 0,
        dice,
        held: [false, false, false, false, false],
        rollsUsed: 1,
        pendingCategory: null,
        diceByParticipant,
        heldByParticipant,
        rollsUsedByParticipant,
        pendingCategoryByParticipant,
        latestYahtzee: null,
        sheetsByParticipant,
        scoresApplied: false
      };
    } else if (game === "scattergories") {
      const actives = activeParticipants(session);
      if (actives.length < 2) {
        throw new Error("Scattergories needs at least two active players.");
      }
      const firstList = pickScattergoriesList(new Set());
      next = {
        id: nanoid(6),
        type: "scattergories",
        status: "idle",
        listId: firstList.id,
        listTitle: firstList.title,
        prompts: [...firstList.prompts],
        letter: null,
        answerDurationMs: 90_000,
        usedListIds: [firstList.id],
        usedLetters: [],
        countdownEndsAt: null,
        roundEndsAt: null,
        answers: {},
        currentPromptIndex: 0,
        verdictsByPrompt: {},
        roundScoreDelta: {}
      };
    } else {
      throw new Error(`Unknown game type: ${String(game)}`);
    }
    session.games = [next];
    await this.persist();
  }

  public async endActiveGame(sessionId: string, participantId: string): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    const isHost = session.participants.some((p) => p.id === participantId && p.isHost);
    if (!isHost) {
      throw new Error("Only the host can end the game.");
    }
    assertParticipantActiveForGameplay(session, participantId);
    const active = session.games[0];
    if (active?.type === "icebreaker") {
      await purgeAllIcebreakerSessionUploads(this.dataDirectory, sessionId);
    }
    if (active?.type === "guessWhoSaidIt") {
      await purgeAllGuessWhoSaidItSessionUploads(this.dataDirectory, sessionId);
    }
    if (active?.type === "guessTheImage") {
      this.clearGuessImageTimer(sessionId);
      await purgeAllGuessTheImageSessionUploads(this.dataDirectory, sessionId);
    }
    if (active?.type === "captionThis") {
      await purgeAllCaptionThisSessionUploads(this.dataDirectory, sessionId);
    }
    if (active?.type === "pictionary") {
      this.clearPictionaryTimer(sessionId);
    }
    if (active?.type === "catchPhrase") {
      this.clearCatchPhraseTimer(sessionId);
    }
    if (active?.type === "scattergories") {
      this.clearScattergoriesTimer(sessionId);
    }
    session.games = [];
    session.updatedAt = Date.now();
    await this.persist();
  }

  public async closeSession(sessionId: string, participantId: string): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    const isHost = session.participants.some((p) => p.id === participantId && p.isHost);
    if (!isHost) {
      throw new Error("Only the host can close the session.");
    }
    assertParticipantActiveForGameplay(session, participantId);
    this.clearGuessImageTimer(sessionId);
    this.clearPictionaryTimer(sessionId);
    this.clearCatchPhraseTimer(sessionId);
    this.clearScattergoriesTimer(sessionId);
    await purgeAllIcebreakerSessionUploads(this.dataDirectory, sessionId);
    await purgeAllGuessWhoSaidItSessionUploads(this.dataDirectory, sessionId);
    await purgeAllGuessTheImageSessionUploads(this.dataDirectory, sessionId);
    await purgeAllCaptionThisSessionUploads(this.dataDirectory, sessionId);
    await purgeSessionChatMessages(this.dataDirectory, sessionId);
    this.sessions.delete(sessionId);
    await this.persist();
  }

  public async closeSessionUnchecked(sessionId: string): Promise<boolean> {
    if (!this.sessions.has(sessionId)) {
      return false;
    }
    this.clearGuessImageTimer(sessionId);
    this.clearPictionaryTimer(sessionId);
    this.clearCatchPhraseTimer(sessionId);
    this.clearScattergoriesTimer(sessionId);
    await purgeAllIcebreakerSessionUploads(this.dataDirectory, sessionId);
    await purgeAllGuessWhoSaidItSessionUploads(this.dataDirectory, sessionId);
    await purgeAllGuessTheImageSessionUploads(this.dataDirectory, sessionId);
    await purgeAllCaptionThisSessionUploads(this.dataDirectory, sessionId);
    await purgeSessionChatMessages(this.dataDirectory, sessionId);
    this.sessions.delete(sessionId);
    await this.persist();
    return true;
  }

  private async detachParticipantFromActiveGame(
    session: SessionInternal,
    sessionId: string,
    participantId: string
  ): Promise<void> {
    const activeHangman = session.games.find((entry) => entry.type === "hangman") as HangmanGameInternal | undefined;
    if (activeHangman) {
      if (activeHangman.puzzleCreatorId === participantId) {
        session.games = [];
      } else if (activeHangman.currentTurnId === participantId) {
        activeHangman.currentTurnId = pickNextGuesser(session, activeHangman, participantId);
      }
    }

    const activeIcebreaker = session.games[0];
    if (activeIcebreaker?.type === "icebreaker") {
      delete activeIcebreaker.privateSubmissions[participantId];
      activeIcebreaker.revealed = activeIcebreaker.revealed.filter((r) => r.participantId !== participantId);
      delete activeIcebreaker.promptDraftsByParticipant[participantId];
    }

    const activeWouldYouRather = session.games[0];
    if (activeWouldYouRather?.type === "wouldYouRather") {
      delete activeWouldYouRather.responses[participantId];
    }

    const activeGuessWho = session.games[0];
    if (activeGuessWho?.type === "guessWhoSaidIt" && activeGuessWho.status !== "idle") {
      session.games = [];
      await purgeAllGuessWhoSaidItSessionUploads(this.dataDirectory, sessionId);
    }

    const activeGuess = session.games[0];
    if (activeGuess?.type === "guessTheImage") {
      delete activeGuess.locks[participantId];
      delete activeGuess.participantSetups[participantId];
      if (activeGuess.selectedRoundParticipantId === participantId) {
        activeGuess.selectedRoundParticipantId = null;
      }
      if (activeGuess.setupMode === "single" && activeGuess.setupParticipantId === participantId) {
        activeGuess.setupParticipantId =
          activeParticipants(session).find((p) => p.isHost)?.id
          ?? activeParticipants(session)[0]?.id
          ?? session.participants.find((p) => p.isHost)?.id
          ?? session.participants[0]!.id;
      }
    }

    const active20q = session.games[0];
    if (active20q?.type === "twentyQuestions") {
      if (active20q.itemSelectorId === participantId) {
        session.games = [];
      } else if (active20q.status === "playing") {
        const guessersAfter = twentyQuestionsGuesserIds(session, active20q);
        if (guessersAfter.length === 0) {
          session.games = [];
        } else if (active20q.currentAskerId === participantId) {
          active20q.currentAskerId = guessersAfter[0] ?? null;
          active20q.questionDraft = null;
        }
      }
    }

    const activeCap = session.games[0];
    if (activeCap?.type === "captionThis") {
      if (activeCap.imageProviderId === participantId || activeParticipants(session).length < 2) {
        session.games = [];
        await purgeAllCaptionThisSessionUploads(this.dataDirectory, sessionId);
      } else if (activeCap.status === "voting" || activeCap.status === "results") {
        session.games = [];
        await purgeAllCaptionThisSessionUploads(this.dataDirectory, sessionId);
      } else if (activeCap.status === "collectingCaptions") {
        delete activeCap.captions[participantId];
      }
    }

    const activePic = session.games[0];
    if (activePic?.type === "pictionary") {
      const strip = (ids: string[]): string[] => ids.filter((id) => id !== participantId);
      const nextA = strip(activePic.teamAIds);
      const nextB = strip(activePic.teamBIds);
      if (activePic.status === "drawing" && activePic.drawerId === participantId) {
        this.clearPictionaryTimer(sessionId);
        session.games = [];
      } else if (nextA.length === 0 || nextB.length === 0) {
        this.clearPictionaryTimer(sessionId);
        session.games = [];
      } else {
        activePic.teamAIds = nextA;
        activePic.teamBIds = nextB;
        delete activePic.drawCounts[participantId];
      }
    }

    const activeApples = session.games[0];
    if (activeApples?.type === "applesToApples") {
      session.games = [];
    }

    const activeUno = session.games[0];
    if (activeUno?.type === "uno") {
      session.games = [];
    }

    const activeBs = session.games[0];
    if (activeBs?.type === "bs") {
      session.games = [];
    }

    const activeMadlibs = session.games[0];
    if (activeMadlibs?.type === "madlibs") {
      session.games = [];
    }

    const activeCatchPhrase = session.games[0];
    if (activeCatchPhrase?.type === "catchPhrase") {
      this.clearCatchPhraseTimer(sessionId);
      session.games = [];
    }
  }

  public async removeParticipant(
    sessionId: string,
    participantId: string
  ): Promise<{ sessionDeleted: boolean }> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { sessionDeleted: true };
    }
    const before = session.participants.length;
    session.participants = session.participants.filter((p) => p.id !== participantId);
    if (session.participants.length === before) {
      return { sessionDeleted: false };
    }

    session.updatedAt = Date.now();

    delete session.lobbyGamePreferences[participantId];

    if (session.participants.length === 0) {
      this.clearGuessImageTimer(sessionId);
      this.clearPictionaryTimer(sessionId);
      this.clearCatchPhraseTimer(sessionId);
      this.clearScattergoriesTimer(sessionId);
      await purgeAllIcebreakerSessionUploads(this.dataDirectory, sessionId);
      await purgeAllGuessWhoSaidItSessionUploads(this.dataDirectory, sessionId);
      await purgeAllGuessTheImageSessionUploads(this.dataDirectory, sessionId);
      await purgeAllCaptionThisSessionUploads(this.dataDirectory, sessionId);
      await purgeSessionChatMessages(this.dataDirectory, sessionId);
      this.sessions.delete(sessionId);
      await this.persist();
      return { sessionDeleted: true };
    }

    // Host left: promote the oldest remaining participant so the session
    // still has someone able to close it / end games.
    if (!session.participants.some((p) => p.isHost)) {
      session.participants[0]!.isHost = true;
      const promotedId = session.participants[0]!.id;
      delete session.lobbyGamePreferences[promotedId];
    }

    await this.detachParticipantFromActiveGame(session, sessionId, participantId);

    await this.persist();
    return { sessionDeleted: false };
  }

  public async setParticipantActive(
    sessionId: string,
    hostParticipantId: string,
    targetId: string,
    isActive: boolean
  ): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    if (!session.participants.some((p) => p.id === hostParticipantId && p.isHost)) {
      throw new Error("Only the host can change participant activity.");
    }
    assertParticipantActiveForGameplay(session, hostParticipantId);
    const target = session.participants.find((p) => p.id === targetId);
    if (!target) {
      throw new Error("Participant is not in this session.");
    }
    if (target.isHost && !isActive) {
      throw new Error("Cannot deactivate the host.");
    }
    if (isActive && session.games.length > 0) {
      throw new Error("Cannot activate a player while a game is in progress.");
    }
    if (!isActive && session.games.length > 0) {
      throw new Error("Cannot bench a player while a game is in progress.");
    }
    if (participantIsActive(target) === isActive) {
      session.updatedAt = Date.now();
      await this.persist();
      return;
    }
    target.isActive = isActive;
    session.updatedAt = Date.now();
    await this.persist();
  }

  public async setHangmanWord(sessionId: string, participantId: string, word: string): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    assertParticipantActiveForGameplay(session, participantId);
    const game = session.games[0];
    if (game?.type !== "hangman") {
      throw new Error("Hangman game is not active.");
    }
    if (game.puzzleCreatorId !== participantId) {
      throw new Error("Only the puzzle creator can set the word.");
    }
    const normalizedWord = word.trim().toUpperCase();
    game.secretWord = normalizedWord;
    game.guessedLetters = [];
    game.wrongGuessCount = 0;
    game.maskedWord = maskWord(normalizedWord, []);
    game.status = "inProgress";
    game.currentTurnId = game.mode === "turns" ? firstGuesserId(session, game) : null;
    game.activeSolverId = null;
    game.activityLog = [];
    session.updatedAt = Date.now();
    await this.persist();
  }

  public async openHangmanSolve(sessionId: string, participantId: string): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    assertParticipantActiveForGameplay(session, participantId);
    const game = session.games[0];
    if (game?.type !== "hangman") {
      throw new Error("Hangman game is not active.");
    }
    if (game.status !== "inProgress" || !game.secretWord) {
      throw new Error("Hangman round is not ready.");
    }
    if (game.puzzleCreatorId === participantId) {
      throw new Error("Puzzle creator cannot guess.");
    }
    if (game.mode === "turns") {
      if (game.currentTurnId === null) {
        game.currentTurnId = participantId;
      } else if (game.currentTurnId !== participantId) {
        throw new Error("Not your turn.");
      }
      if (game.activeSolverId && game.activeSolverId !== participantId) {
        throw new Error("Only the active solver can continue solving.");
      }
    }
    if (game.mode === "team" && game.activeSolverId && game.activeSolverId !== participantId) {
      throw new Error("Another player is attempting to solve.");
    }
    if (game.activeSolverId === participantId) {
      return;
    }
    game.activeSolverId = participantId;
    appendHangmanActivity(game, {
      kind: "solveAttempt",
      participantId,
      letter: null
    });
    session.updatedAt = Date.now();
    await this.persist();
  }

  public async cancelHangmanSolve(sessionId: string, participantId: string): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    assertParticipantActiveForGameplay(session, participantId);
    const game = session.games[0];
    if (game?.type !== "hangman") {
      throw new Error("Hangman game is not active.");
    }
    if (game.activeSolverId !== participantId) {
      throw new Error("Only the active solver can cancel.");
    }
    game.activeSolverId = null;
    appendHangmanActivity(game, {
      kind: "solveCancelled",
      participantId,
      letter: null
    });
    session.updatedAt = Date.now();
    await this.persist();
  }

  public async guessHangmanLetter(sessionId: string, participantId: string, letter: string): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    assertParticipantActiveForGameplay(session, participantId);
    const game = session.games[0];
    if (game?.type !== "hangman") {
      throw new Error("Hangman game is not active.");
    }
    if (game.status !== "inProgress" || !game.secretWord) {
      throw new Error("Hangman round is not ready.");
    }
    if (game.puzzleCreatorId === participantId) {
      throw new Error("Puzzle creator cannot guess.");
    }
    if (game.mode === "team" && game.activeSolverId && game.activeSolverId !== participantId) {
      throw new Error("Another player is attempting to solve.");
    }
    if (game.mode === "turns") {
      if (game.currentTurnId === null) {
        // Defensive: if the turn pointer somehow got orphaned (e.g. the host
        // set the word before any guessers joined), claim the turn for the
        // first guesser who acts instead of locking the game forever.
        game.currentTurnId = participantId;
      } else if (game.currentTurnId !== participantId) {
        throw new Error("Not your turn.");
      }
    }
    const normalizedLetter = letter.trim().toUpperCase();
    if (!/[A-Z]/.test(normalizedLetter)) {
      throw new Error("Only letters A-Z are allowed.");
    }
    if (game.guessedLetters.includes(normalizedLetter)) {
      return;
    }

    game.guessedLetters.push(normalizedLetter);
    const before = game.maskedWord;
    game.maskedWord = maskWord(game.secretWord, game.guessedLetters);
    const wasCorrect = game.maskedWord !== before;
    if (!wasCorrect) {
      game.wrongGuessCount += 1;
    }
    appendHangmanActivity(game, {
      kind: wasCorrect ? "letterCorrect" : "letterWrong",
      participantId,
      letter: normalizedLetter
    });

    const guesser = session.participants.find((participant) => participant.id === participantId);

    if (game.mode === "turns" && wasCorrect && guesser) {
      guesser.score += 1;
    }

    if (!game.maskedWord.includes("_")) {
      game.status = "won";
      if (game.mode === "turns") {
        if (guesser) {
          guesser.score += 3;
        }
      } else {
        const creatorId = game.puzzleCreatorId;
        session.participants.forEach((participant) => {
          if (participant.id !== creatorId) {
            participant.score += 1;
          }
        });
      }
      game.currentTurnId = null;
    } else if (game.wrongGuessCount >= game.maxWrongGuesses) {
      game.status = "lost";
      if (game.mode === "turns") {
        if (guesser) {
          guesser.score -= 5;
        }
        const creator = session.participants.find((p) => p.id === game.puzzleCreatorId);
        if (creator) {
          creator.score += 5;
        }
      } else {
        const creator = session.participants.find((p) => p.id === game.puzzleCreatorId);
        if (creator) {
          creator.score += 1;
        }
      }
      game.currentTurnId = null;
      game.activeSolverId = null;
    } else if (game.mode === "turns") {
      game.currentTurnId = pickNextGuesser(session, game, participantId);
    }

    session.updatedAt = Date.now();
    await this.persist();
  }

  public async solveHangman(sessionId: string, participantId: string, guess: string): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    assertParticipantActiveForGameplay(session, participantId);
    const game = session.games[0];
    if (game?.type !== "hangman") {
      throw new Error("Hangman game is not active.");
    }
    if (game.status !== "inProgress" || !game.secretWord) {
      throw new Error("Hangman round is not ready.");
    }
    if (game.puzzleCreatorId === participantId) {
      throw new Error("Puzzle creator cannot guess.");
    }
    if (game.activeSolverId === null) {
      game.activeSolverId = participantId;
    } else if (game.activeSolverId !== participantId) {
      if (game.mode === "team") {
        throw new Error("Another player is attempting to solve.");
      }
      throw new Error("Only the active solver can submit.");
    }
    if (game.mode === "turns") {
      if (game.currentTurnId === null) {
        game.currentTurnId = participantId;
      } else if (game.currentTurnId !== participantId) {
        throw new Error("Not your turn.");
      }
    }

    const normalize = (value: string): string => value.toUpperCase().replace(/[^A-Z]/g, "");
    const normalizedGuess = normalize(guess);
    const normalizedAnswer = normalize(game.secretWord);
    if (normalizedGuess.length === 0) {
      throw new Error("Guess cannot be empty.");
    }

    const guesser = session.participants.find((participant) => participant.id === participantId);

    if (normalizedGuess === normalizedAnswer) {
      game.maskedWord = game.secretWord;
      game.status = "won";
      if (game.mode === "turns") {
        if (guesser) {
          guesser.score += 3;
        }
      } else {
        const creatorId = game.puzzleCreatorId;
        session.participants.forEach((participant) => {
          if (participant.id !== creatorId) {
            participant.score += 1;
          }
        });
      }
      game.currentTurnId = null;
    } else {
      game.wrongGuessCount += 1;
      if (game.wrongGuessCount >= game.maxWrongGuesses) {
        game.status = "lost";
        if (game.mode === "turns") {
          if (guesser) {
            guesser.score -= 5;
          }
        const creator = session.participants.find((p) => p.id === game.puzzleCreatorId);
        if (creator) {
          creator.score += 5;
        }
        } else {
          const creator = session.participants.find((p) => p.id === game.puzzleCreatorId);
          if (creator) {
            creator.score += 1;
          }
        }
        game.currentTurnId = null;
      } else if (game.mode === "turns") {
        game.currentTurnId = pickNextGuesser(session, game, participantId);
      }
    }
    game.activeSolverId = null;

    session.updatedAt = Date.now();
    await this.persist();
  }

  public async setHangmanTurn(sessionId: string, participantId: string, targetId: string): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    assertParticipantActiveForGameplay(session, participantId);
    const isHost = session.participants.some((p) => p.id === participantId && p.isHost);
    if (!isHost) {
      throw new Error("Only the host can override the current guesser.");
    }
    const game = session.games[0];
    if (game?.type !== "hangman") {
      throw new Error("Hangman game is not active.");
    }
    if (game.mode !== "turns") {
      throw new Error("Turn override only applies in turns mode.");
    }
    const target = session.participants.find((p) => p.id === targetId);
    if (!target) {
      throw new Error("Target participant not found.");
    }
    if (target.id === game.puzzleCreatorId) {
      throw new Error("Puzzle creator cannot take a turn.");
    }
    assertParticipantActiveForGameplay(session, target.id);
    game.currentTurnId = target.id;
    session.updatedAt = Date.now();
    await this.persist();
  }

  public async reorderParticipants(
    sessionId: string,
    participantId: string,
    orderedIds: string[]
  ): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    assertParticipantActiveForGameplay(session, participantId);
    const isHost = session.participants.some((p) => p.id === participantId && p.isHost);
    if (!isHost) {
      throw new Error("Only the host can reorder participants.");
    }
    const currentIds = new Set(session.participants.map((p) => p.id));
    const nextIds = new Set(orderedIds);
    if (
      orderedIds.length !== session.participants.length
      || nextIds.size !== orderedIds.length
      || [...currentIds].some((id) => !nextIds.has(id))
    ) {
      throw new Error("Ordered participant list does not match session participants.");
    }
    const byId = new Map(session.participants.map((p) => [p.id, p]));
    session.participants = orderedIds.map((id) => byId.get(id)!);
    session.updatedAt = Date.now();
    await this.persist();
  }

  public async submitTwoTruths(sessionId: string, participantId: string, statements: string[], lieIndex: number): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    assertParticipantActiveForGameplay(session, participantId);
    const game = session.games[0];
    if (game?.type !== "twoTruthsLie") {
      throw new Error("Two Truths and a Lie is not active.");
    }
    game.submissions[participantId] = { statements, lieIndex };
    session.updatedAt = Date.now();
    await this.persist();
  }

  public async beginVoting(sessionId: string, presenterId: string): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    assertParticipantActiveForGameplay(session, presenterId);
    const game = session.games[0];
    if (game?.type !== "twoTruthsLie") {
      throw new Error("Two Truths and a Lie is not active.");
    }
    if (!game.submissions[presenterId]) {
      throw new Error("Presenter has no submission.");
    }
    game.currentPresenterId = presenterId;
    game.votes = {};
    game.status = "voting";
    session.updatedAt = Date.now();
    await this.persist();
  }

  public async voteLie(sessionId: string, participantId: string, lieIndex: number): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    assertParticipantActiveForGameplay(session, participantId);
    const game = session.games[0];
    if (game?.type !== "twoTruthsLie" || game.status !== "voting") {
      throw new Error("Voting is not active.");
    }
    if (participantId === game.currentPresenterId) {
      throw new Error("Presenter cannot vote.");
    }
    game.votes[participantId] = lieIndex;
    session.updatedAt = Date.now();
    await this.persist();
  }

  public async revealTwoTruths(sessionId: string): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    const game = session.games[0];
    if (game?.type !== "twoTruthsLie" || !game.currentPresenterId) {
      throw new Error("No current presenter.");
    }
    const presenterId = game.currentPresenterId;
    const submission = game.submissions[presenterId];
    const lieIndex = submission.lieIndex;
    let fooled = 0;
    Object.entries(game.votes).forEach(([voterId, vote]) => {
      if (vote === lieIndex) {
        const voter = session.participants.find((participant) => participant.id === voterId);
        if (voter) {
          voter.score += 1;
        }
      } else {
        fooled += 1;
      }
    });
    const presenter = session.participants.find((participant) => participant.id === presenterId);
    if (presenter) {
      presenter.score += fooled;
    }
    game.status = "revealed";
    session.updatedAt = Date.now();
    await this.persist();
  }

  public async startTrivia(
    sessionId: string,
    participantId: string,
    config:
      | number
      | {
        totalQuestions: number;
        categoryMode: "all" | "single";
        categoryId?: number;
        difficulties: Array<"easy" | "medium" | "hard">;
      }
  ): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    assertParticipantActiveForGameplay(session, participantId);
    const game = session.games[0];
    if (game?.type !== "trivia") {
      throw new Error("Trivia game is not active.");
    }
    const roundConfig = typeof config === "number"
      ? {
        totalQuestions: config,
        categoryMode: "all" as const,
        difficulties: ["easy", "medium", "hard"] as Array<"easy" | "medium" | "hard">
      }
      : config;

    game.totalQuestions = roundConfig.totalQuestions;
    game.questions = [];
    game.questionIndex = 0;
    game.activeQuestion = null;
    game.answers = {};
    game.loading = {
      totalCalls: 1,
      completedCalls: 0,
      message: "Building trivia round..."
    };
    game.status = "loading";
    session.updatedAt = Date.now();
    await this.persist();
    this.onSessionUpdated?.(sessionId);

    const usedQuestionIds = new Set(game.usedQuestionIds);
    const updateProgress = async (progress: TriviaQuestionLoadProgress): Promise<void> => {
      game.loading = progress;
      session.updatedAt = Date.now();
      await this.persist();
      this.onSessionUpdated?.(sessionId);
    };
    const picked = await this.triviaQuestionLoader(roundConfig, usedQuestionIds, updateProgress);
    game.questions = picked;
    game.questionIndex = 0;
    game.activeQuestion = picked[0] ?? null;
    if (picked[0]) {
      usedQuestionIds.add(picked[0].id);
      game.usedQuestionIds = [...usedQuestionIds];
    }
    game.answers = {};
    game.loading = null;
    game.status = picked[0] ? "questionOpen" : "finished";
    session.updatedAt = Date.now();
    await this.persist();
    this.onSessionUpdated?.(sessionId);
  }

  public async submitTriviaAnswer(sessionId: string, participantId: string, answer: string): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    assertParticipantActiveForGameplay(session, participantId);
    const game = session.games[0];
    if (game?.type !== "trivia" || game.status !== "questionOpen") {
      throw new Error("No trivia question is open.");
    }
    game.answers[participantId] = answer;
    session.updatedAt = Date.now();
    await this.persist();
  }

  public async closeTriviaQuestion(sessionId: string, participantId: string): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    assertParticipantActiveForGameplay(session, participantId);
    const game = session.games[0];
    if (game?.type !== "trivia" || game.status !== "questionOpen" || !game.activeQuestion) {
      throw new Error("No trivia question is open.");
    }
    const allParticipantsAnswered = activeParticipants(session).every(
      (participant) => typeof game.answers[participant.id] === "string"
    );
    if (!allParticipantsAnswered) {
      throw new Error("Not all participants have answered.");
    }
    const correctAnswer = game.activeQuestion.correctAnswer;
    Object.entries(game.answers).forEach(([participantId, answer]) => {
      if (answer === correctAnswer) {
        const participant = session.participants.find((item) => item.id === participantId);
        if (participant) {
          participant.score += 1;
        }
      }
    });
    game.status = "questionClosed";
    session.updatedAt = Date.now();
    await this.persist();
  }

  public async nextTriviaQuestion(sessionId: string, participantId: string): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    assertParticipantActiveForGameplay(session, participantId);
    const game = session.games[0];
    if (game?.type !== "trivia") {
      throw new Error("Trivia game is not active.");
    }
    const nextIndex = game.questionIndex + 1;
    const nextQuestion = game.questions[nextIndex];
    if (nextQuestion) {
      const usedQuestionIds = new Set(game.usedQuestionIds);
      usedQuestionIds.add(nextQuestion.id);
      game.usedQuestionIds = [...usedQuestionIds];
    }
    game.questionIndex = nextIndex;
    game.activeQuestion = nextQuestion ?? null;
    game.answers = {};
    game.status = nextQuestion ? "questionOpen" : "finished";
    session.updatedAt = Date.now();
    await this.persist();
  }

  private wouldYouRatherResultsFor(
    session: SessionInternal,
    game: WouldYouRatherGameInternal
  ): { optionACount: number; optionBCount: number; passCount: number; totalResponses: number } {
    const tallies = { optionACount: 0, optionBCount: 0, passCount: 0, totalResponses: 0 };
    for (const participant of activeParticipants(session)) {
      const choice = game.responses[participant.id];
      if (choice === "optionA") {
        tallies.optionACount += 1;
      } else if (choice === "optionB") {
        tallies.optionBCount += 1;
      } else if (choice === "pass") {
        tallies.passCount += 1;
      }
    }
    tallies.totalResponses = tallies.optionACount + tallies.optionBCount + tallies.passCount;
    return tallies;
  }

  public async submitWouldYouRatherAnswer(
    sessionId: string,
    participantId: string,
    choice: WouldYouRatherChoiceInternal
  ): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    assertParticipantActiveForGameplay(session, participantId);
    const game = session.games[0];
    if (game?.type !== "wouldYouRather" || game.status !== "questionOpen" || !game.activePrompt) {
      throw new Error("Would You Rather is not accepting answers right now.");
    }
    if (!session.participants.some((p) => p.id === participantId)) {
      throw new Error("Participant is not in this session.");
    }
    game.responses[participantId] = choice;
    const everyoneAnswered = activeParticipants(session).every(
      (participant) => typeof game.responses[participant.id] === "string"
    );
    if (everyoneAnswered) {
      game.results = this.wouldYouRatherResultsFor(session, game);
      game.status = "results";
    }
    session.updatedAt = Date.now();
    await this.persist();
  }

  public async nextWouldYouRatherPrompt(sessionId: string, hostParticipantId: string): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    if (!session.participants.some((p) => p.id === hostParticipantId && p.isHost)) {
      throw new Error("Only host can move to the next prompt.");
    }
    assertParticipantActiveForGameplay(session, hostParticipantId);
    const game = session.games[0];
    if (game?.type !== "wouldYouRather") {
      throw new Error("Would You Rather game is not active.");
    }
    if (game.status !== "results") {
      throw new Error("Move to the next prompt after results are shown.");
    }
    const nextIndex = game.questionIndex + 1;
    const nextPrompt = game.roundPrompts[nextIndex] ?? null;
    game.questionIndex = nextIndex;
    game.activePrompt = nextPrompt;
    game.responses = {};
    game.results = null;
    game.status = nextPrompt ? "questionOpen" : "finished";
    session.updatedAt = Date.now();
    await this.persist();
  }

  public async submitWouldYouRatherPrompt(
    sessionId: string,
    participantId: string,
    optionAInput: string,
    optionBInput: string
  ): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    assertParticipantActiveForGameplay(session, participantId);
    const game = session.games[0];
    if (game?.type !== "wouldYouRather") {
      throw new Error("Would You Rather game is not active.");
    }
    if (!game.allowParticipantSubmissions) {
      throw new Error("Custom prompt submissions are disabled for this round.");
    }
    const optionA = optionAInput.trim();
    const optionB = optionBInput.trim();
    if (!optionA || !optionB) {
      throw new Error("Both options are required.");
    }
    if (optionA.length > WOULD_YOU_RATHER_OPTION_MAX_CHARS || optionB.length > WOULD_YOU_RATHER_OPTION_MAX_CHARS) {
      throw new Error(`Each option must be ${WOULD_YOU_RATHER_OPTION_MAX_CHARS} characters or less.`);
    }
    if (optionA.toLowerCase() === optionB.toLowerCase()) {
      throw new Error("The two options must be different.");
    }
    game.submissions.push({
      id: `wyr-sub-${nanoid(10)}`,
      optionA,
      optionB,
      submittedByParticipantId: participantId,
      status: "pending"
    });
    session.updatedAt = Date.now();
    await this.persist();
  }

  public async reviewWouldYouRatherSubmission(
    sessionId: string,
    hostParticipantId: string,
    submissionId: string,
    decision: "approve" | "reject"
  ): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    if (!session.participants.some((p) => p.id === hostParticipantId && p.isHost)) {
      throw new Error("Only host can review submissions.");
    }
    assertParticipantActiveForGameplay(session, hostParticipantId);
    const game = session.games[0];
    if (game?.type !== "wouldYouRather") {
      throw new Error("Would You Rather game is not active.");
    }
    const submission = game.submissions.find((item) => item.id === submissionId);
    if (!submission || submission.status !== "pending") {
      throw new Error("Submission is no longer pending.");
    }
    submission.status = decision === "approve" ? "approved" : "rejected";
    session.updatedAt = Date.now();
    await this.persist();
  }

  public async startWouldYouRatherSubmittedRound(sessionId: string, hostParticipantId: string): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    if (!session.participants.some((p) => p.id === hostParticipantId && p.isHost)) {
      throw new Error("Only host can start submitted prompts.");
    }
    assertParticipantActiveForGameplay(session, hostParticipantId);
    const game = session.games[0];
    if (game?.type !== "wouldYouRather") {
      throw new Error("Would You Rather game is not active.");
    }
    if (game.inSubmittedRound) {
      throw new Error("Submitted prompt round already started.");
    }
    if (game.status !== "finished") {
      throw new Error("Finish the configured prompts before starting submitted prompts.");
    }
    const approved = game.submissions.filter((submission) => submission.status === "approved");
    if (approved.length === 0) {
      throw new Error("No approved submitted prompts available.");
    }
    const roundPrompts: WouldYouRatherPromptInternal[] = approved.map((submission) => ({
      id: submission.id,
      optionA: submission.optionA,
      optionB: submission.optionB,
      source: "submitted",
      submittedByParticipantId: submission.submittedByParticipantId
    }));
    game.inSubmittedRound = true;
    game.roundPrompts = roundPrompts;
    game.totalQuestions = roundPrompts.length;
    game.questionIndex = 0;
    game.activePrompt = roundPrompts[0] ?? null;
    game.responses = {};
    game.results = null;
    game.status = game.activePrompt ? "questionOpen" : "finished";
    session.updatedAt = Date.now();
    await this.persist();
  }

  public async cleanupStaleSessions(maxAgeMs: number): Promise<void> {
    const now = Date.now();
    let changed = false;
    for (const [sessionId, session] of this.sessions.entries()) {
      if (now - session.updatedAt > maxAgeMs) {
        await purgeAllIcebreakerSessionUploads(this.dataDirectory, sessionId);
        await purgeSessionChatMessages(this.dataDirectory, sessionId);
        this.sessions.delete(sessionId);
        changed = true;
      }
    }
    if (changed) {
      await this.persist();
    }
  }

  public async startIcebreakerRound(sessionId: string, hostParticipantId: string, totalQuestions: number): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    if (!session.participants.some((p) => p.id === hostParticipantId && p.isHost)) {
      throw new Error("Only host can start the icebreaker round.");
    }
    assertParticipantActiveForGameplay(session, hostParticipantId);
    const game = session.games[0];
    if (game?.type !== "icebreaker") {
      throw new Error("Icebreaker game is not active.");
    }
    if (game.status !== "idle") {
      throw new Error("Icebreaker stock round can only start from the lobby.");
    }
    const count = Math.max(1, Math.min(500, Math.floor(totalQuestions)));
    const used = new Set(game.usedQuestionIds);
    const picked = pickIcebreakerQuestions(used, count);
    picked.forEach((q) => used.add(q.id));
    game.usedQuestionIds = [...used];
    game.questions = picked;
    game.totalQuestions = picked.length;
    game.questionIndex = 0;
    game.activeQuestion = picked[0] ?? null;
    game.privateSubmissions = {};
    game.revealed = [];
    game.status = picked.length > 0 ? "collecting" : "finished";
    session.updatedAt = Date.now();
    await this.persist();
  }

  public async beginIcebreakerPromptGathering(
    sessionId: string,
    hostParticipantId: string,
    promptsPerParticipant: number
  ): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    if (!session.participants.some((p) => p.id === hostParticipantId && p.isHost)) {
      throw new Error("Only host can begin custom question gathering.");
    }
    assertParticipantActiveForGameplay(session, hostParticipantId);
    const game = session.games[0];
    if (game?.type !== "icebreaker") {
      throw new Error("Icebreaker game is not active.");
    }
    if (game.status !== "idle") {
      throw new Error("Custom questions can only be gathered from the lobby.");
    }
    const n = Math.max(1, Math.min(5, Math.floor(promptsPerParticipant)));
    game.status = "gatheringPrompts";
    game.promptsPerParticipant = n;
    game.promptDraftsByParticipant = {};
    session.updatedAt = Date.now();
    await this.persist();
  }

  public async submitIcebreakerPrompts(sessionId: string, participantId: string, texts: string[]): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    assertParticipantActiveForGameplay(session, participantId);
    const game = session.games[0];
    if (game?.type !== "icebreaker" || game.status !== "gatheringPrompts") {
      throw new Error("Icebreaker is not accepting custom questions.");
    }
    if (!session.participants.some((p) => p.id === participantId)) {
      throw new Error("Participant is not in this session.");
    }
    const expected = game.promptsPerParticipant;
    if (typeof expected !== "number" || expected < 1) {
      throw new Error("Invalid prompt gathering configuration.");
    }
    if (texts.length !== expected) {
      throw new Error(`Submit exactly ${expected} question(s).`);
    }
    const trimmed: string[] = [];
    for (const raw of texts) {
      const t = raw.trim();
      if (t.length === 0) {
        throw new Error("Each question must be non-empty.");
      }
      if (t.length > ICEBREAKER_PROMPT_MAX_CHARS) {
        throw new Error(`Each question must be at most ${ICEBREAKER_PROMPT_MAX_CHARS} characters.`);
      }
      trimmed.push(t);
    }
    game.promptDraftsByParticipant[participantId] = trimmed;
    session.updatedAt = Date.now();
    await this.persist();
  }

  public async startIcebreakerCustomRound(sessionId: string, hostParticipantId: string): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    if (!session.participants.some((p) => p.id === hostParticipantId && p.isHost)) {
      throw new Error("Only host can start the icebreaker round.");
    }
    assertParticipantActiveForGameplay(session, hostParticipantId);
    const game = session.games[0];
    if (game?.type !== "icebreaker" || game.status !== "gatheringPrompts") {
      throw new Error("Icebreaker is not ready to start from submitted questions.");
    }
    const expected = game.promptsPerParticipant;
    if (typeof expected !== "number") {
      throw new Error("Invalid prompt gathering configuration.");
    }
    const pool: Array<{ id: string; text: string }> = [];
    for (const p of activeParticipants(session)) {
      const draft = game.promptDraftsByParticipant[p.id];
      if (!draft || draft.length !== expected) {
        throw new Error("Not all participants have submitted their questions.");
      }
      for (const text of draft) {
        pool.push({ id: `custom-${nanoid(12)}`, text });
      }
    }
    if (pool.length === 0) {
      throw new Error("No questions to play.");
    }
    for (let i = pool.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j]!, pool[i]!];
    }
    game.questions = pool;
    game.totalQuestions = pool.length;
    game.questionIndex = 0;
    game.activeQuestion = pool[0] ?? null;
    game.privateSubmissions = {};
    game.revealed = [];
    game.promptDraftsByParticipant = {};
    game.promptsPerParticipant = null;
    game.status = "collecting";
    session.updatedAt = Date.now();
    await this.persist();
  }

  public async resetIcebreakerToIdle(sessionId: string, hostParticipantId: string): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    if (!session.participants.some((p) => p.id === hostParticipantId && p.isHost)) {
      throw new Error("Only host can return to setup.");
    }
    assertParticipantActiveForGameplay(session, hostParticipantId);
    const game = session.games[0];
    if (game?.type !== "icebreaker" || game.status !== "finished") {
      throw new Error("Icebreaker can only return to setup after the round has finished.");
    }
    game.questions = [];
    game.totalQuestions = 1;
    game.questionIndex = 0;
    game.activeQuestion = null;
    game.privateSubmissions = {};
    game.revealed = [];
    game.promptDraftsByParticipant = {};
    game.promptsPerParticipant = null;
    game.status = "idle";
    session.updatedAt = Date.now();
    await this.persist();
  }

  public async submitIcebreakerAnswer(
    sessionId: string,
    participantId: string,
    payload: { text: string; imageFileId: string | null }
  ): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    assertParticipantActiveForGameplay(session, participantId);
    const game = session.games[0];
    if (game?.type !== "icebreaker" || game.status !== "collecting") {
      throw new Error("Icebreaker is not accepting answers.");
    }
    if (!session.participants.some((p) => p.id === participantId)) {
      throw new Error("Participant is not in this session.");
    }
    const text = payload.text.trim();
    const imageFileId = payload.imageFileId?.trim() || null;
    if (text.length === 0 && !imageFileId) {
      throw new Error("Enter an answer or attach an image.");
    }
    game.privateSubmissions[participantId] = { text, imageFileId };
    session.updatedAt = Date.now();
    await this.persist();
  }

  public async beginIcebreakerReveals(sessionId: string, hostParticipantId: string): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    if (!session.participants.some((p) => p.id === hostParticipantId && p.isHost)) {
      throw new Error("Only host can begin reveals.");
    }
    assertParticipantActiveForGameplay(session, hostParticipantId);
    const game = session.games[0];
    if (game?.type !== "icebreaker" || game.status !== "collecting") {
      throw new Error("Icebreaker is not ready for reveals.");
    }
    const valid = (s: { text: string; imageFileId: string | null }): boolean =>
      s.text.trim().length > 0 || Boolean(s.imageFileId);
    const allReady = activeParticipants(session).every((p) => {
      const sub = game.privateSubmissions[p.id];
      return sub && valid(sub);
    });
    if (!allReady) {
      throw new Error("Not all participants have submitted.");
    }
    game.status = "revealing";
    session.updatedAt = Date.now();
    await this.persist();
  }

  public async revealIcebreakerParticipant(
    sessionId: string,
    hostParticipantId: string,
    participantId: string
  ): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    if (!session.participants.some((p) => p.id === hostParticipantId && p.isHost)) {
      throw new Error("Only host can reveal an answer.");
    }
    assertParticipantActiveForGameplay(session, hostParticipantId);
    const game = session.games[0];
    if (game?.type !== "icebreaker" || game.status !== "revealing") {
      throw new Error("Icebreaker reveals are not active.");
    }
    const submission = game.privateSubmissions[participantId];
    if (!submission) {
      throw new Error("That participant has no submission.");
    }
    if (game.revealed.some((r) => r.participantId === participantId)) {
      throw new Error("That answer is already revealed.");
    }
    game.revealed.push({
      participantId,
      text: submission.text,
      imageFileId: submission.imageFileId
    });
    session.updatedAt = Date.now();
    await this.persist();
  }

  public async nextIcebreakerQuestion(sessionId: string, hostParticipantId: string): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    if (!session.participants.some((p) => p.id === hostParticipantId && p.isHost)) {
      throw new Error("Only host can move to the next question.");
    }
    assertParticipantActiveForGameplay(session, hostParticipantId);
    const game = session.games[0];
    if (game?.type !== "icebreaker") {
      throw new Error("Icebreaker game is not active.");
    }
    if (game.status !== "revealing") {
      throw new Error("Move to the next question after the reveal phase.");
    }
    await purgeIcebreakerQuestionUploads(this.dataDirectory, sessionId, game.questionIndex);
    const nextIndex = game.questionIndex + 1;
    const nextQuestion = game.questions[nextIndex];
    if (nextQuestion) {
      game.questionIndex = nextIndex;
      game.activeQuestion = nextQuestion;
      game.privateSubmissions = {};
      game.revealed = [];
      game.status = "collecting";
    } else {
      game.questionIndex = nextIndex;
      game.activeQuestion = null;
      game.privateSubmissions = {};
      game.status = "finished";
    }
    session.updatedAt = Date.now();
    await this.persist();
  }

  private guessWhoAdvanceIfAllAnswered(session: SessionInternal, game: GuessWhoSaidItGameInternal): void {
    if (game.status !== "collecting") {
      return;
    }
    const valid = (s: GuessWhoAnswerInternal): boolean =>
      s.text.trim().length > 0 || Boolean(s.imageFileId);
    const allReady = activeParticipants(session).every((p) => {
      const sub = game.privateSubmissions[p.id];
      return sub && valid(sub);
    });
    if (!allReady) {
      return;
    }
    game.answersByQuestionIndex[game.questionIndex] = { ...game.privateSubmissions };
    game.privateSubmissions = {};
    if (game.questionIndex < game.totalQuestions - 1) {
      game.questionIndex += 1;
      game.activeQuestion = game.questions[game.questionIndex] ?? null;
    } else {
      game.status = "votingReady";
      game.activeQuestion = null;
      game.questionIndex = game.totalQuestions;
    }
  }

  public async startGuessWhoSaidItRound(
    sessionId: string,
    hostParticipantId: string,
    totalQuestions: number
  ): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    if (!session.participants.some((p) => p.id === hostParticipantId && p.isHost)) {
      throw new Error("Only host can start the round.");
    }
    assertParticipantActiveForGameplay(session, hostParticipantId);
    if (activeParticipants(session).length < 2) {
      throw new Error("Guess Who Said It needs at least two active players.");
    }
    const game = session.games[0];
    if (game?.type !== "guessWhoSaidIt" || game.status !== "idle") {
      throw new Error("Guess Who Said It can only start from the lobby.");
    }
    const count = Math.max(1, Math.min(500, Math.floor(totalQuestions)));
    const used = new Set(game.usedQuestionIds);
    const picked = pickGuessWhoSaidItQuestions(used, count);
    picked.forEach((q) => used.add(q.id));
    game.usedQuestionIds = [...used];
    game.questions = picked;
    game.totalQuestions = picked.length;
    game.questionIndex = 0;
    game.activeQuestion = picked[0] ?? null;
    game.privateSubmissions = {};
    game.answersByQuestionIndex = {};
    game.votingQuestionIndex = 0;
    game.votingPrompt = null;
    game.votes = {};
    game.cumulativeCorrectByParticipant = {};
    game.promptRevealSnapshot = null;
    game.status = picked.length > 0 ? "collecting" : "idle";
    session.updatedAt = Date.now();
    await this.persist();
  }

  public async submitGuessWhoSaidItAnswer(
    sessionId: string,
    participantId: string,
    payload: { text: string; imageFileId: string | null }
  ): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    assertParticipantActiveForGameplay(session, participantId);
    const game = session.games[0];
    if (game?.type !== "guessWhoSaidIt" || game.status !== "collecting") {
      throw new Error("Guess Who Said It is not accepting answers.");
    }
    if (!session.participants.some((p) => p.id === participantId)) {
      throw new Error("Participant is not in this session.");
    }
    const text = payload.text.trim();
    const imageFileId = payload.imageFileId?.trim() || null;
    if (text.length === 0 && !imageFileId) {
      throw new Error("Enter an answer or attach an image.");
    }
    game.privateSubmissions[participantId] = { text, imageFileId };
    this.guessWhoAdvanceIfAllAnswered(session, game);
    session.updatedAt = Date.now();
    await this.persist();
  }

  public async beginGuessWhoSaidItVoting(sessionId: string, hostParticipantId: string): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    if (!session.participants.some((p) => p.id === hostParticipantId && p.isHost)) {
      throw new Error("Only host can begin guessing.");
    }
    assertParticipantActiveForGameplay(session, hostParticipantId);
    const game = session.games[0];
    if (game?.type !== "guessWhoSaidIt" || game.status !== "votingReady") {
      throw new Error("Guess Who Said It is not ready for guessing.");
    }
    game.votingQuestionIndex = 0;
    game.votingPrompt = this.guessWhoBuildPromptForQuestion(session, game, 0);
    game.votes = {};
    game.status = "voting";
    session.updatedAt = Date.now();
    await this.persist();
  }

  public async setGuessWhoSaidItVotes(
    sessionId: string,
    participantId: string,
    votes: Record<string, string>
  ): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    assertParticipantActiveForGameplay(session, participantId);
    const game = session.games[0];
    if (game?.type !== "guessWhoSaidIt" || game.status !== "voting") {
      throw new Error("Guess Who Said It is not in the guessing phase.");
    }
    if (!session.participants.some((p) => p.id === participantId)) {
      throw new Error("Participant is not in this session.");
    }
    const prompt = game.votingPrompt;
    if (!prompt) {
      throw new Error("Voting is not configured.");
    }
    const expected = new Set(this.guessWhoExpectedSlotIdsForVoter(game, participantId));
    const submitted = new Set(Object.keys(votes));
    if (submitted.size !== expected.size || ![...expected].every((id) => submitted.has(id))) {
      throw new Error("Submit one guess for every answer shown.");
    }
    const participantIds = new Set(session.participants.map((p) => p.id));
    for (const slotId of expected) {
      const gid = votes[slotId]!;
      if (!participantIds.has(gid)) {
        throw new Error("Invalid participant choice.");
      }
      if (gid === participantId) {
        throw new Error("You cannot guess yourself.");
      }
    }
    game.votes[participantId] = { ...votes };
    if (this.guessWhoAllVotesIn(session, game)) {
      this.guessWhoFinalizeCurrentPrompt(session, game);
    }
    session.updatedAt = Date.now();
    await this.persist();
  }

  public async advanceGuessWhoPrompt(sessionId: string, hostParticipantId: string): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    if (!session.participants.some((p) => p.id === hostParticipantId && p.isHost)) {
      throw new Error("Only host can continue.");
    }
    assertParticipantActiveForGameplay(session, hostParticipantId);
    const game = session.games[0];
    if (game?.type !== "guessWhoSaidIt" || game.status !== "promptReveal") {
      throw new Error("Guess Who Said It is not ready to continue.");
    }
    const idx = game.votingQuestionIndex;
    game.promptRevealSnapshot = null;
    if (idx < game.totalQuestions - 1) {
      game.votingQuestionIndex = idx + 1;
      game.votingPrompt = this.guessWhoBuildPromptForQuestion(session, game, game.votingQuestionIndex);
      game.votes = {};
      game.status = "voting";
    } else {
      game.status = "roundSummary";
      game.votingPrompt = null;
    }
    session.updatedAt = Date.now();
    await this.persist();
  }

  public async resetGuessWhoSaidItToIdle(sessionId: string, hostParticipantId: string): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    if (!session.participants.some((p) => p.id === hostParticipantId && p.isHost)) {
      throw new Error("Only host can return to setup.");
    }
    assertParticipantActiveForGameplay(session, hostParticipantId);
    const game = session.games[0];
    if (game?.type !== "guessWhoSaidIt" || game.status !== "roundSummary") {
      throw new Error("Guess Who Said It can only return to setup after the round summary.");
    }
    await purgeAllGuessWhoSaidItSessionUploads(this.dataDirectory, sessionId);
    game.questions = [];
    game.totalQuestions = 1;
    game.questionIndex = 0;
    game.activeQuestion = null;
    game.privateSubmissions = {};
    game.answersByQuestionIndex = {};
    game.votingQuestionIndex = 0;
    game.votingPrompt = null;
    game.votes = {};
    game.cumulativeCorrectByParticipant = {};
    game.promptRevealSnapshot = null;
    game.status = "idle";
    session.updatedAt = Date.now();
    await this.persist();
  }

  private guessWhoBuildPromptForQuestion(
    session: SessionInternal,
    game: GuessWhoSaidItGameInternal,
    questionIdx: number
  ): GuessWhoVotingPromptInternal {
    const q = game.questions[questionIdx];
    const byParticipant = game.answersByQuestionIndex[questionIdx];
    if (!q || !byParticipant) {
      throw new Error("Missing answers for a prompt.");
    }
    const slots: GuessWhoSlotInternal[] = [];
    for (const p of session.participants) {
      const ans = byParticipant[p.id];
      if (!ans || (!(ans.text.trim().length > 0) && !ans.imageFileId)) {
        throw new Error("Missing answers for a prompt.");
      }
      slots.push({
        slotId: nanoid(12),
        authorId: p.id,
        text: ans.text,
        imageFileId: ans.imageFileId
      });
    }
    shuffleGuessWhoSlotsInPlace(slots);
    return { question: { id: q.id, text: q.text }, slots };
  }

  private guessWhoExpectedSlotIdsForVoter(game: GuessWhoSaidItGameInternal, voterId: string): string[] {
    const prompt = game.votingPrompt;
    if (!prompt) {
      return [];
    }
    return prompt.slots.filter((sl) => sl.authorId !== voterId).map((sl) => sl.slotId);
  }

  private guessWhoAllVotesIn(session: SessionInternal, game: GuessWhoSaidItGameInternal): boolean {
    if (!game.votingPrompt) {
      return false;
    }
    for (const p of activeParticipants(session)) {
      const expected = new Set(this.guessWhoExpectedSlotIdsForVoter(game, p.id));
      const vm = game.votes[p.id];
      if (!vm) {
        return false;
      }
      if (Object.keys(vm).length !== expected.size) {
        return false;
      }
      for (const sid of expected) {
        if (vm[sid] === undefined) {
          return false;
        }
      }
    }
    return true;
  }

  private guessWhoFinalizeCurrentPrompt(session: SessionInternal, game: GuessWhoSaidItGameInternal): void {
    const prompt = game.votingPrompt;
    if (!prompt) {
      throw new Error("No voting prompt to finalize.");
    }
    const byVoter: GuessWhoPromptRevealSnapshotInternal["byVoter"] = [];
    for (const voter of activeParticipants(session)) {
      const vm = game.votes[voter.id];
      if (!vm) {
        throw new Error("Missing votes.");
      }
      let pointsThisPrompt = 0;
      const rows: GuessWhoRevealRowInternal[] = [];
      for (const sl of prompt.slots) {
        if (sl.authorId === voter.id) {
          continue;
        }
        const guessedParticipantId = vm[sl.slotId] ?? "";
        const correct = guessedParticipantId === sl.authorId;
        const pointsEarned = correct ? 1 : 0;
        if (correct) {
          voter.score += 1;
          pointsThisPrompt += 1;
          game.cumulativeCorrectByParticipant[voter.id] =
            (game.cumulativeCorrectByParticipant[voter.id] ?? 0) + 1;
        }
        rows.push({
          slotId: sl.slotId,
          guessedParticipantId,
          actualAuthorId: sl.authorId,
          correct,
          pointsEarned
        });
      }
      byVoter.push({ voterId: voter.id, rows, pointsThisPrompt });
    }
    game.promptRevealSnapshot = {
      question: prompt.question,
      slots: [...prompt.slots],
      byVoter
    };
    game.votingPrompt = null;
    game.status = "promptReveal";
  }

  private clearGuessImageTimer(sessionId: string): void {
    const existing = this.guessImageResolveTimers.get(sessionId);
    if (existing) {
      clearTimeout(existing);
      this.guessImageResolveTimers.delete(sessionId);
    }
  }

  private guessTheImageOptionsFrom(game: GuessTheImageGameInternal): [string, string, string, string] {
    const perm = game.displayPerm;
    const d = game.canonicalDescriptions;
    if (!perm) {
      return d;
    }
    return [d[perm[0]]!, d[perm[1]]!, d[perm[2]]!, d[perm[3]]!];
  }

  private guessTheImageCorrectDisplayIndex(game: GuessTheImageGameInternal): number {
    const perm = game.displayPerm;
    if (!perm) {
      return game.canonicalCorrectIndex;
    }
    return perm.findIndex((canonicalSlot) => canonicalSlot === game.canonicalCorrectIndex);
  }

  public async configureGuessTheImage(
    sessionId: string,
    participantId: string,
    payload: {
      imageFileId: string;
      descriptions: [string, string, string, string];
      correctIndex: number;
      revealDurationMs: number;
    }
  ): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    assertParticipantActiveForGameplay(session, participantId);
    const game = session.games[0];
    if (game?.type !== "guessTheImage") {
      throw new Error("Guess the image is not active.");
    }
    const canConfigureEveryoneSlot =
      game.setupMode === "everyone" && (game.status === "setup" || game.status === "finished");
    if (!canConfigureEveryoneSlot && game.status !== "setup") {
      throw new Error("Configure is only available during setup.");
    }
    if (game.setupMode === "everyone") {
      const slot = game.participantSetups[participantId];
      if (!slot) {
        throw new Error("You are not in this session.");
      }
      this.clearGuessImageTimer(sessionId);
      slot.imageFileId = payload.imageFileId.trim();
      slot.canonicalDescriptions = payload.descriptions.map((line) => line.trim()) as [
        string,
        string,
        string,
        string
      ];
      slot.canonicalCorrectIndex = payload.correctIndex;
      slot.revealDurationMs = payload.revealDurationMs;
      slot.configured = true;
      session.updatedAt = Date.now();
      await this.persist();
      return;
    }
    if (participantId !== game.setupParticipantId) {
      throw new Error("Only the designated setup player can configure this round.");
    }
    this.clearGuessImageTimer(sessionId);
    game.status = "setup";
    game.imageFileId = payload.imageFileId.trim();
    game.canonicalDescriptions = payload.descriptions.map((line) => line.trim()) as [
      string,
      string,
      string,
      string
    ];
    game.canonicalCorrectIndex = payload.correctIndex;
    game.revealDurationMs = payload.revealDurationMs;
    game.configured = true;
    game.displayPerm = null;
    game.roundStartedAt = null;
    game.locks = {};
    game.results = null;
    session.updatedAt = Date.now();
    await this.persist();
  }

  public async startGuessTheImageRound(sessionId: string, participantId: string): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    assertParticipantActiveForGameplay(session, participantId);
    const game = session.games[0];
    if (game?.type !== "guessTheImage") {
      throw new Error("Guess the image is not active.");
    }
    if (game.status === "playing") {
      throw new Error("A round is already in progress.");
    }

    if (game.setupMode === "everyone") {
      if (!session.participants.some((p) => p.id === participantId && p.isHost)) {
        throw new Error("Only the host can start the round when everyone prepares setups.");
      }
      if (!game.everyoneBetweenRounds && !guessImageEveryoneAllConfigured(session, game)) {
        throw new Error("Wait until every participant has saved their setup.");
      }
      const presenterId = game.selectedRoundParticipantId;
      if (!presenterId || !session.participants.some((p) => p.id === presenterId)) {
        throw new Error("The host must choose whose image to use before starting.");
      }
      const slot = game.participantSetups[presenterId];
      if (!slot?.configured || !slot.imageFileId) {
        throw new Error("The selected participant does not have a completed setup.");
      }
      this.clearGuessImageTimer(sessionId);
      game.imageFileId = slot.imageFileId;
      game.canonicalDescriptions = [...slot.canonicalDescriptions];
      game.canonicalCorrectIndex = slot.canonicalCorrectIndex;
      game.revealDurationMs = slot.revealDurationMs;
      game.setupParticipantId = presenterId;
      game.configured = true;
      game.displayPerm = shuffleDisplayPerm();
      game.roundStartedAt = Date.now();
      game.locks = {};
      game.results = null;
      game.status = "playing";
      game.everyoneBetweenRounds = false;
      session.updatedAt = Date.now();
      await this.persist();
      this.scheduleGuessImageDeadline(sessionId);
      return;
    }

    if (participantId !== game.setupParticipantId) {
      throw new Error("Only the designated setup player can start this round.");
    }
    if (!game.configured || !game.imageFileId) {
      throw new Error("Configure the image and descriptions before starting.");
    }
    this.clearGuessImageTimer(sessionId);
    game.displayPerm = shuffleDisplayPerm();
    game.roundStartedAt = Date.now();
    game.locks = {};
    game.results = null;
    game.status = "playing";
    session.updatedAt = Date.now();
    await this.persist();
    this.scheduleGuessImageDeadline(sessionId);
  }

  public async returnGuessTheImageToSetup(sessionId: string, hostParticipantId: string): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    if (!session.participants.some((p) => p.id === hostParticipantId && p.isHost)) {
      throw new Error("Only the host can return to setup.");
    }
    assertParticipantActiveForGameplay(session, hostParticipantId);
    const game = session.games[0];
    if (game?.type !== "guessTheImage") {
      throw new Error("Guess the image is not active.");
    }
    if (game.status !== "finished") {
      throw new Error("Return to setup is only available after a round ends.");
    }
    this.clearGuessImageTimer(sessionId);
    await purgeAllGuessTheImageSessionUploads(this.dataDirectory, sessionId);
    const revealMs = game.revealDurationMs;
    game.status = "setup";
    game.imageFileId = null;
    game.canonicalDescriptions = ["", "", "", ""];
    game.canonicalCorrectIndex = 0;
    game.revealDurationMs = revealMs;
    game.configured = false;
    game.displayPerm = null;
    game.roundStartedAt = null;
    game.locks = {};
    game.results = null;
    game.setupParticipantId =
      session.participants.find((p) => p.isHost)?.id ?? session.participants[0]!.id;
    if (game.setupMode === "everyone") {
      game.participantSetups = buildGuessImageParticipantSetups(session);
      game.selectedRoundParticipantId = null;
      game.everyoneBetweenRounds = false;
    } else {
      game.participantSetups = {};
    }
    session.updatedAt = Date.now();
    await this.persist();
  }

  public async beginGuessTheImageNextRoundSelection(sessionId: string, hostParticipantId: string): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    if (!session.participants.some((p) => p.id === hostParticipantId && p.isHost)) {
      throw new Error("Only the host can continue to the next image.");
    }
    assertParticipantActiveForGameplay(session, hostParticipantId);
    const game = session.games[0];
    if (game?.type !== "guessTheImage") {
      throw new Error("Guess the image is not active.");
    }
    if (game.setupMode !== "everyone") {
      throw new Error("That action is only for everyone-preparer mode.");
    }
    if (game.status !== "finished") {
      throw new Error("Choose the next image only after a round has finished.");
    }
    this.clearGuessImageTimer(sessionId);
    const presenterId = game.setupParticipantId;
    const fid = game.imageFileId;
    if (fid && presenterId) {
      await deleteGuessTheImageStoredFile(this.dataDirectory, sessionId, fid);
      if (game.participantSetups[presenterId]) {
        game.participantSetups[presenterId] = freshGuessImageParticipantSlot();
      }
    }
    game.imageFileId = null;
    game.status = "setup";
    game.everyoneBetweenRounds = true;
    game.displayPerm = null;
    game.roundStartedAt = null;
    game.locks = {};
    game.results = null;
    game.configured = false;
    game.canonicalDescriptions = ["", "", "", ""];
    game.canonicalCorrectIndex = 0;
    game.selectedRoundParticipantId = null;
    game.setupParticipantId =
      session.participants.find((p) => p.isHost)?.id ?? session.participants[0]!.id;
    session.updatedAt = Date.now();
    await this.persist();
  }

  public async setGuessTheImageSetupParticipant(
    sessionId: string,
    hostParticipantId: string,
    targetParticipantId: string
  ): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    if (!session.participants.some((p) => p.id === hostParticipantId && p.isHost)) {
      throw new Error("Only the host can choose who sets up the round.");
    }
    assertParticipantActiveForGameplay(session, hostParticipantId);
    const target = session.participants.find((p) => p.id === targetParticipantId);
    if (!target) {
      throw new Error("That participant is not in this session.");
    }
    if (!participantIsActive(target)) {
      throw new Error("Setup player must be an active participant.");
    }
    const game = session.games[0];
    if (game?.type !== "guessTheImage" || game.status !== "setup") {
      throw new Error("Setup player can only be changed while the game is in setup.");
    }
    if (game.setupMode === "everyone") {
      throw new Error("That action is only for single-preparer mode.");
    }
    if (game.setupParticipantId === targetParticipantId) {
      return;
    }
    if (game.configured) {
      this.clearGuessImageTimer(sessionId);
      await purgeAllGuessTheImageSessionUploads(this.dataDirectory, sessionId);
      game.imageFileId = null;
      game.canonicalDescriptions = ["", "", "", ""];
      game.canonicalCorrectIndex = 0;
      game.configured = false;
      game.displayPerm = null;
      game.roundStartedAt = null;
      game.locks = {};
      game.results = null;
    }
    game.setupParticipantId = targetParticipantId;
    session.updatedAt = Date.now();
    await this.persist();
  }

  public async setGuessTheImageRoundPresenter(
    sessionId: string,
    hostParticipantId: string,
    targetParticipantId: string | null
  ): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    if (!session.participants.some((p) => p.id === hostParticipantId && p.isHost)) {
      throw new Error("Only the host can choose whose image to use.");
    }
    assertParticipantActiveForGameplay(session, hostParticipantId);
    const game = session.games[0];
    if (game?.type !== "guessTheImage" || game.status !== "setup" || game.setupMode !== "everyone") {
      throw new Error("Round image selection is only available during everyone setup.");
    }
    if (!game.everyoneBetweenRounds && !guessImageEveryoneAllConfigured(session, game)) {
      throw new Error("Wait until every participant has saved their setup.");
    }
    if (targetParticipantId === null) {
      game.selectedRoundParticipantId = null;
      session.updatedAt = Date.now();
      await this.persist();
      return;
    }
    const t = session.participants.find((p) => p.id === targetParticipantId);
    if (!t) {
      throw new Error("That participant is not in this session.");
    }
    if (!participantIsActive(t)) {
      throw new Error("Round presenter must be an active participant.");
    }
    const slot = game.participantSetups[targetParticipantId];
    if (!slot?.configured) {
      throw new Error("That participant has not saved a setup yet.");
    }
    game.selectedRoundParticipantId = targetParticipantId;
    session.updatedAt = Date.now();
    await this.persist();
  }

  private scheduleGuessImageDeadline(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    const game = session?.games[0];
    if (game?.type !== "guessTheImage" || game.status !== "playing" || game.roundStartedAt === null) {
      return;
    }
    this.clearGuessImageTimer(sessionId);
    const deadline = game.roundStartedAt + game.revealDurationMs;
    const delay = Math.max(0, deadline - Date.now());
    const timer = setTimeout(() => {
      void this.finalizeGuessTheImageRound(sessionId).catch(() => {});
    }, delay);
    this.guessImageResolveTimers.set(sessionId, timer);
  }

  private guessTheImageGuesserIds(session: SessionInternal, game: GuessTheImageGameInternal): string[] {
    return activeParticipants(session)
      .filter((p) => p.id !== game.setupParticipantId)
      .map((p) => p.id);
  }

  private allGuessTheImageGuessersLocked(session: SessionInternal, game: GuessTheImageGameInternal): boolean {
    const guesserIds = this.guessTheImageGuesserIds(session, game);
    if (guesserIds.length === 0) {
      return true;
    }
    return guesserIds.every((id) => typeof game.locks[id] !== "undefined");
  }

  public async lockGuessTheImageAnswer(
    sessionId: string,
    participantId: string,
    choiceIndex: number
  ): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    const participant = session.participants.find((p) => p.id === participantId);
    if (!participant) {
      throw new Error("Participant is not in this session.");
    }
    assertParticipantActiveForGameplay(session, participantId);
    const game = session.games[0];
    if (game?.type !== "guessTheImage" || game.status !== "playing") {
      throw new Error("No Guess the image round is open.");
    }
    if (participantId === game.setupParticipantId) {
      throw new Error("The setup player does not submit guesses.");
    }
    if (game.locks[participantId]) {
      throw new Error("You already submitted.");
    }
    const now = Date.now();
    const deadline = (game.roundStartedAt ?? 0) + game.revealDurationMs;
    if (now > deadline) {
      throw new Error("Time is up for this round.");
    }
    if (choiceIndex < 0 || choiceIndex > 3) {
      throw new Error("Invalid choice.");
    }
    game.locks[participantId] = { choiceIndex, lockedAt: now };
    session.updatedAt = Date.now();
    await this.persist();
    if (this.allGuessTheImageGuessersLocked(session, game)) {
      await this.finalizeGuessTheImageRound(sessionId);
    }
  }

  private async finalizeGuessTheImageRound(sessionId: string): Promise<void> {
    this.clearGuessImageTimer(sessionId);
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }
    const game = session.games[0];
    if (game?.type !== "guessTheImage" || game.status !== "playing") {
      return;
    }
    if (game.roundStartedAt === null || !game.displayPerm) {
      return;
    }
    const roundStartedAt = game.roundStartedAt;
    const deadline = roundStartedAt + game.revealDurationMs;
    const perm = game.displayPerm;
    const guesserIds = this.guessTheImageGuesserIds(session, game);
    const correctDisplayIndex = this.guessTheImageCorrectDisplayIndex(game);

    type Row = {
      participantId: string;
      choiceDisplayIndex: number | null;
      correct: boolean;
      elapsedMs: number | null;
      lockedAt: number | null;
    };

    const rows: Row[] = guesserIds.map((id) => {
      const lock = game.locks[id];
      if (!lock) {
        return {
          participantId: id,
          choiceDisplayIndex: null,
          correct: false,
          elapsedMs: null,
          lockedAt: null
        };
      }
      const inTime = lock.lockedAt <= deadline;
      const canonicalChosen = perm[lock.choiceIndex];
      const correct = inTime && canonicalChosen === game.canonicalCorrectIndex;
      const elapsedMs = inTime ? lock.lockedAt - roundStartedAt : null;
      return {
        participantId: id,
        choiceDisplayIndex: lock.choiceIndex,
        correct,
        elapsedMs,
        lockedAt: lock.lockedAt
      };
    });

    const correctInTime = rows.filter((r) => r.correct && r.elapsedMs !== null);
    correctInTime.sort((a, b) => {
      const da = a.elapsedMs ?? 0;
      const db = b.elapsedMs ?? 0;
      if (da !== db) {
        return da - db;
      }
      return (a.lockedAt ?? 0) - (b.lockedAt ?? 0);
    });
    const fastestId = correctInTime[0]?.participantId ?? null;

    const results: GuessTheImageResultInternal[] = rows.map((r) => {
      let pointsAwarded = 0;
      if (r.correct) {
        pointsAwarded = r.participantId === fastestId ? 3 : 1;
        const p = session.participants.find((x) => x.id === r.participantId);
        if (p) {
          p.score += pointsAwarded;
        }
      }
      return {
        participantId: r.participantId,
        choiceDisplayIndex: r.choiceDisplayIndex,
        correct: r.correct,
        elapsedMs: r.elapsedMs,
        pointsAwarded
      };
    });

    const everyone = game.setupMode === "everyone";

    game.status = "finished";
    game.results = results;

    if (everyone) {
      game.selectedRoundParticipantId = null;
    }

    session.updatedAt = Date.now();
    await this.persist();
    this.onSessionUpdated?.(sessionId);
  }

  private applyTwentyQuestionsScores(session: SessionInternal, game: TwentyQuestionsGameInternal): void {
    if (game.scoresApplied) {
      return;
    }
    game.scoresApplied = true;
    if (game.outcome === "team") {
      for (const p of activeParticipants(session)) {
        if (p.id !== game.itemSelectorId) {
          p.score += 1;
        }
      }
    } else if (game.outcome === "selector") {
      const guesserCount = activeParticipants(session).filter((p) => p.id !== game.itemSelectorId).length;
      const sel = session.participants.find((p) => p.id === game.itemSelectorId);
      if (sel && guesserCount > 0) {
        sel.score += guesserCount;
      }
    }
  }

  private finishTwentyQuestions(session: SessionInternal, game: TwentyQuestionsGameInternal): void {
    if (game.secretItem === null) {
      return;
    }
    game.status = "finished";
    if (!game.outcome) {
      game.outcome = "selector";
    }
    this.applyTwentyQuestionsScores(session, game);
  }

  public async setTwentyQuestionsItem(sessionId: string, participantId: string, text: string): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    assertParticipantActiveForGameplay(session, participantId);
    const game = session.games[0];
    if (game?.type !== "twentyQuestions" || game.status !== "waitingForItem") {
      throw new Error("Cannot set the item right now.");
    }
    if (participantId !== game.itemSelectorId) {
      throw new Error("Only the item selector can set the secret.");
    }
    const trimmed = text.trim();
    if (trimmed.length === 0 || trimmed.length > TWENTY_QUESTIONS_ITEM_MAX_CHARS) {
      throw new Error("Invalid item text.");
    }
    game.secretItem = trimmed;
    game.status = "playing";
    game.currentAskerId = twentyQuestionsFirstAskerId(session, game);
    game.questionsUsed = 0;
    game.questionLog = [];
    game.questionDraft = null;
    session.updatedAt = Date.now();
    await this.persist();
  }

  public async setTwentyQuestionsQuestionDraft(
    sessionId: string,
    participantId: string,
    text: string
  ): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    assertParticipantActiveForGameplay(session, participantId);
    const game = session.games[0];
    if (game?.type !== "twentyQuestions" || game.status !== "playing") {
      throw new Error("Cannot update a question draft right now.");
    }
    if (!game.currentAskerId || participantId !== game.currentAskerId) {
      throw new Error("Only the current asker can draft a question.");
    }
    if (twentyQuestionsHasPendingQuestion(game)) {
      throw new Error("Answer the pending question first.");
    }
    const t = text.slice(0, TWENTY_QUESTIONS_QUESTION_MAX_CHARS);
    game.questionDraft = { participantId, text: t };
    session.updatedAt = Date.now();
    await this.persist();
  }

  public async submitTwentyQuestionsQuestion(
    sessionId: string,
    participantId: string,
    text: string
  ): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    assertParticipantActiveForGameplay(session, participantId);
    const game = session.games[0];
    if (game?.type !== "twentyQuestions" || game.status !== "playing") {
      throw new Error("Cannot submit a question right now.");
    }
    if (!game.currentAskerId || participantId !== game.currentAskerId) {
      throw new Error("Not your turn to ask.");
    }
    if (twentyQuestionsHasPendingQuestion(game)) {
      throw new Error("There is already a question waiting for an answer.");
    }
    const trimmed = text.trim();
    if (trimmed.length === 0 || trimmed.length > TWENTY_QUESTIONS_QUESTION_MAX_CHARS) {
      throw new Error("Invalid question.");
    }
    game.questionLog.push({
      id: nanoid(8),
      participantId,
      text: trimmed,
      askedAt: Date.now(),
      answer: null
    });
    game.questionDraft = null;
    session.updatedAt = Date.now();
    await this.persist();
  }

  public async answerTwentyQuestions(
    sessionId: string,
    participantId: string,
    questionId: string,
    answer: "yes" | "no"
  ): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    assertParticipantActiveForGameplay(session, participantId);
    const game = session.games[0];
    if (game?.type !== "twentyQuestions" || game.status !== "playing") {
      throw new Error("Cannot answer right now.");
    }
    if (participantId !== game.itemSelectorId) {
      throw new Error("Only the item selector can answer.");
    }
    const entry = game.questionLog.find((e) => e.id === questionId && e.answer === null);
    if (!entry) {
      throw new Error("No matching open question.");
    }
    entry.answer = answer;
    game.questionsUsed += 1;
    game.questionDraft = null;
    if (game.questionsUsed >= game.maxQuestions) {
      game.outcome = "selector";
      this.finishTwentyQuestions(session, game);
      await this.persist();
      return;
    }
    twentyQuestionsAdvanceAsker(session, game);
    session.updatedAt = Date.now();
    await this.persist();
  }

  public async twentyQuestionsTeamSolved(sessionId: string, participantId: string): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    assertParticipantActiveForGameplay(session, participantId);
    const game = session.games[0];
    if (game?.type !== "twentyQuestions" || game.status !== "playing") {
      throw new Error("Cannot mark solved right now.");
    }
    if (participantId !== game.itemSelectorId) {
      throw new Error("Only the item selector can confirm the team solved it.");
    }
    if (twentyQuestionsHasPendingQuestion(game)) {
      throw new Error("Answer the current question before marking the round solved.");
    }
    game.outcome = "team";
    this.finishTwentyQuestions(session, game);
    session.updatedAt = Date.now();
    await this.persist();
  }

  public async captionThisSetImageProvider(
    sessionId: string,
    participantId: string,
    newProviderId: string
  ): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    assertParticipantActiveForGameplay(session, participantId);
    if (!this.isHost(sessionId, participantId)) {
      throw new Error("Only the host can change the image provider.");
    }
    const game = session.games[0];
    if (game?.type !== "captionThis" || game.status !== "waitingForImage") {
      throw new Error("Cannot change the image provider right now.");
    }
    const newProvider = session.participants.find((p) => p.id === newProviderId);
    if (!newProvider) {
      throw new Error("Participant must be in the session.");
    }
    if (!participantIsActive(newProvider)) {
      throw new Error("Image provider must be an active player.");
    }
    game.imageProviderId = newProviderId;
    session.updatedAt = Date.now();
    await this.persist();
  }

  public async captionThisSubmitImage(
    sessionId: string,
    participantId: string,
    imageFileId: string
  ): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    assertParticipantActiveForGameplay(session, participantId);
    const game = session.games[0];
    if (game?.type !== "captionThis" || game.status !== "waitingForImage") {
      throw new Error("Cannot submit an image right now.");
    }
    if (participantId !== game.imageProviderId) {
      throw new Error("Only the image provider can submit the image.");
    }
    if (game.imageFileId && game.imageFileId !== imageFileId) {
      await deleteCaptionThisStoredFile(this.dataDirectory, sessionId, game.imageFileId);
    }
    game.imageFileId = imageFileId;
    game.status = "collectingCaptions";
    game.captions = {};
    session.updatedAt = Date.now();
    await this.persist();
  }

  public async captionThisSubmitCaption(sessionId: string, participantId: string, text: string): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    assertParticipantActiveForGameplay(session, participantId);
    const game = session.games[0];
    if (game?.type !== "captionThis" || game.status !== "collectingCaptions") {
      throw new Error("Cannot submit a caption right now.");
    }
    if (!session.participants.some((p) => p.id === participantId)) {
      throw new Error("Participant is not in this session.");
    }
    const trimmed = text.trim();
    if (trimmed.length === 0 || trimmed.length > CAPTION_THIS_MAX_CHARS) {
      throw new Error("Invalid caption.");
    }
    game.captions[participantId] = trimmed;
    session.updatedAt = Date.now();
    await this.persist();
  }

  public async captionThisBeginVoting(sessionId: string, participantId: string): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    assertParticipantActiveForGameplay(session, participantId);
    if (!this.isHost(sessionId, participantId)) {
      throw new Error("Only the host can start voting.");
    }
    const game = session.games[0];
    if (game?.type !== "captionThis" || game.status !== "collectingCaptions") {
      throw new Error("Cannot start voting right now.");
    }
    const allIn = activeParticipants(session).every((p) => {
      const c = game.captions[p.id];
      return typeof c === "string" && c.trim().length > 0;
    });
    if (!allIn) {
      throw new Error("Not everyone has submitted a caption yet.");
    }
    const entries: CaptionThisEntryInternal[] = activeParticipants(session).map((p) => ({
      id: nanoid(10),
      authorId: p.id,
      text: game.captions[p.id]!.trim()
    }));
    game.entries = entries;
    game.displayOrder = shuffleEntryIds(entries.map((e) => e.id));
    game.votes = {};
    game.status = "voting";
    session.updatedAt = Date.now();
    await this.persist();
  }

  public async captionThisVote(sessionId: string, participantId: string, entryId: string): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    assertParticipantActiveForGameplay(session, participantId);
    const game = session.games[0];
    if (game?.type !== "captionThis" || game.status !== "voting") {
      throw new Error("Cannot vote right now.");
    }
    if (!session.participants.some((p) => p.id === participantId)) {
      throw new Error("Participant is not in this session.");
    }
    const entry = game.entries.find((e) => e.id === entryId);
    if (!entry) {
      throw new Error("Invalid caption choice.");
    }
    if (entry.authorId === participantId) {
      throw new Error("You cannot vote for your own caption.");
    }
    game.votes[participantId] = entryId;
    session.updatedAt = Date.now();
    const allVoted = activeParticipants(session).every((p) => game.votes[p.id] !== undefined);
    if (allVoted) {
      game.status = "results";
    }
    await this.persist();
  }

  public async captionThisBeginNextRound(
    sessionId: string,
    participantId: string,
    nextImageProviderId: string
  ): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    assertParticipantActiveForGameplay(session, participantId);
    if (!this.isHost(sessionId, participantId)) {
      throw new Error("Only the host can start the next round.");
    }
    const game = session.games[0];
    if (game?.type !== "captionThis" || game.status !== "results") {
      throw new Error("Cannot start the next round right now.");
    }
    const nextProv = session.participants.find((p) => p.id === nextImageProviderId);
    if (!nextProv) {
      throw new Error("Image provider must be in the session.");
    }
    if (!participantIsActive(nextProv)) {
      throw new Error("Image provider must be an active player.");
    }
    if (game.imageFileId) {
      await deleteCaptionThisStoredFile(this.dataDirectory, sessionId, game.imageFileId);
    }
    game.status = "waitingForImage";
    game.imageProviderId = nextImageProviderId;
    game.imageFileId = null;
    game.captions = {};
    game.entries = [];
    game.displayOrder = [];
    game.votes = {};
    game.roundNumber += 1;
    session.updatedAt = Date.now();
    await this.persist();
  }

  private maybeAdvanceApplesToJudging(session: SessionInternal, game: ApplesToApplesGameInternal): void {
    const nonJudges = applesNonJudgeIds(session, game);
    const allIn =
      nonJudges.length > 0 && nonJudges.every((id) => game.submissions[id] !== undefined);
    if (!allIn) {
      return;
    }
    game.entries = nonJudges.map((pid) => ({
      entryId: nanoid(10),
      authorId: pid,
      cardId: game.submissions[pid]!
    }));
    game.displayOrder = shuffleEntryIds(game.entries.map((e) => e.entryId));
    game.status = "judging";
  }

  public async applesToApplesSubmitCard(sessionId: string, participantId: string, cardId: string): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    assertParticipantActiveForGameplay(session, participantId);
    const game = session.games[0];
    if (game?.type !== "applesToApples" || game.status !== "collecting") {
      throw new Error("Cannot play a card right now.");
    }
    const judgeId = applesJudgeId(game);
    if (participantId === judgeId) {
      throw new Error("The judge does not submit a card.");
    }
    const hand = game.hands[participantId];
    if (!hand || !hand.includes(cardId)) {
      throw new Error("That card is not in your hand.");
    }
    if (getApplesResponseText(cardId) === undefined) {
      throw new Error("Unknown card.");
    }
    game.submissions[participantId] = cardId;
    session.updatedAt = Date.now();
    this.maybeAdvanceApplesToJudging(session, game);
    await this.persist();
  }

  public async applesToApplesJudgePick(sessionId: string, participantId: string, entryId: string): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    assertParticipantActiveForGameplay(session, participantId);
    const game = session.games[0];
    if (game?.type !== "applesToApples" || game.status !== "judging") {
      throw new Error("Cannot pick a winner right now.");
    }
    if (participantId !== applesJudgeId(game)) {
      throw new Error("Only the judge can pick the winning card.");
    }
    const entry = game.entries.find((e) => e.entryId === entryId);
    if (!entry) {
      throw new Error("Invalid entry.");
    }
    const winner = session.participants.find((p) => p.id === entry.authorId);
    if (winner) {
      winner.score += 1;
    }
    const winningEntryId = entry.entryId;
    const winningText = getApplesResponseText(entry.cardId) ?? "";
    const winnerParticipantId = entry.authorId;
    const byEntryIdForReveal = new Map(game.entries.map((e) => [e.entryId, e] as const));
    game.roundResultReveal = game.displayOrder
      .map((eid) => {
        const row = byEntryIdForReveal.get(eid);
        if (!row) {
          return null;
        }
        return {
          entryId: row.entryId,
          authorId: row.authorId,
          text: getApplesResponseText(row.cardId) ?? ""
        };
      })
      .filter((row): row is { entryId: string; authorId: string; text: string } => row !== null);
    for (const [, cid] of Object.entries(game.submissions)) {
      game.discardPile.push(cid);
    }
    for (const pid of Object.keys(game.submissions)) {
      const hand = game.hands[pid];
      if (!hand) {
        continue;
      }
      const cid = game.submissions[pid];
      if (!cid) {
        continue;
      }
      const ix = hand.indexOf(cid);
      if (ix >= 0) {
        hand.splice(ix, 1);
      }
    }
    game.submissions = {};
    game.entries = [];
    game.displayOrder = [];
    if (game.mode === "standard") {
      refillApplesHands(session, game);
    }
    game.roundWinnerEntryId = winningEntryId;
    game.roundWinnerParticipantId = winnerParticipantId;
    game.roundWinningText = winningText;
    game.status = "roundResult";
    session.updatedAt = Date.now();
    await this.persist();
  }

  public async applesToApplesBeginNextRound(sessionId: string, participantId: string): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    assertParticipantActiveForGameplay(session, participantId);
    if (!this.isHost(sessionId, participantId)) {
      throw new Error("Only the host can continue the game.");
    }
    const game = session.games[0];
    if (game?.type !== "applesToApples" || game.status !== "roundResult") {
      throw new Error("Cannot advance the round right now.");
    }
    const canContinue = !(game.mode === "finite" && game.roundNumber >= APPLES_TO_APPLES_FINITE_ROUNDS);
    if (!canContinue) {
      game.status = "finished";
      session.updatedAt = Date.now();
      await this.persist();
      return;
    }
    game.roundNumber += 1;
    game.judgeIndex = (game.judgeIndex + 1) % Math.max(1, game.judgeOrder.length);
    const topic = pickApplesTopic(new Set(game.usedTopicIds));
    game.topicId = topic.id;
    game.topicText = topic.text;
    game.usedTopicIds.push(topic.id);
    game.roundWinnerEntryId = null;
    game.roundWinnerParticipantId = null;
    game.roundWinningText = null;
    game.roundResultReveal = null;
    game.status = "collecting";
    session.updatedAt = Date.now();
    await this.persist();
  }

  /** Clear UNO shout banner when the announcer wins or no longer holds exactly one card. */
  private unoSyncAnnouncementBanner(game: UnoGameInternal): void {
    const pid = game.unoAnnouncedParticipantId;
    if (!pid) {
      return;
    }
    const hand = game.hands[pid];
    const len = hand?.length ?? 0;
    if (len !== 1) {
      game.unoAnnouncedParticipantId = null;
    }
  }

  private unoDrawNCards(game: UnoGameInternal, participantId: string, n: number): void {
    const hand = game.hands[participantId];
    if (!hand) {
      return;
    }
    for (let i = 0; i < n; i += 1) {
      refillUnoDrawPileFromDiscard(game.drawPile, game.discardPile);
      if (game.drawPile.length === 0) {
        break;
      }
      hand.push(game.drawPile.pop()!);
    }
  }

  /** When the current turn holder acts, close the UNO catch window without penalty. */
  private unoMaybeClearCatchWindow(game: UnoGameInternal, actorId: string): void {
    const currentId = game.playerOrder[game.currentPlayerIndex];
    if (actorId !== currentId) {
      return;
    }
    if (game.unoCatchOpenFor !== null && actorId !== game.unoCatchOpenFor) {
      game.unoCatchOpenFor = null;
      game.unoCatchAllowedAfterMs = null;
    }
  }

  public async unoPlayCard(
    sessionId: string,
    participantId: string,
    cardId: string,
    chosenColor?: UnoActiveColor
  ): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    assertParticipantActiveForGameplay(session, participantId);
    const g = session.games[0];
    if (g?.type !== "uno" || g.status !== "playing") {
      throw new Error("UNO is not active.");
    }
    this.unoMaybeClearCatchWindow(g, participantId);
    const currentId = g.playerOrder[g.currentPlayerIndex];
    if (currentId !== participantId) {
      throw new Error("Not your turn.");
    }
    const hand = g.hands[participantId];
    if (!hand) {
      throw new Error("No hand.");
    }
    const cardIdx = hand.findIndex((c) => c.id === cardId);
    if (cardIdx < 0) {
      throw new Error("Card not in hand.");
    }
    const played = hand[cardIdx]!;
    if (g.pendingDrawnCardId !== null && played.id !== g.pendingDrawnCardId) {
      throw new Error("You must play the drawn card or pass.");
    }
    const top = g.discardPile[g.discardPile.length - 1]!;
    if (!unoCanPlayCard(played, top, g.activeColor, hand)) {
      throw new Error("Illegal play.");
    }
    if (
      (played.rank === "wild" || played.rank === "wildDrawFour") &&
      (chosenColor === undefined ||
        !["red", "yellow", "green", "blue"].includes(chosenColor))
    ) {
      throw new Error("Choose a color for Wild.");
    }

    hand.splice(cardIdx, 1);
    g.discardPile.push(played);
    g.pendingDrawnCardId = null;

    if (played.rank === "wild" || played.rank === "wildDrawFour") {
      g.activeColor = chosenColor!;
    } else if (played.color !== "wild") {
      g.activeColor = played.color;
    }

    if (played.rank === "drawTwo") {
      const victim = peekNextParticipantId(g.playerOrder, g.currentPlayerIndex, g.direction, 1);
      this.unoDrawNCards(g, victim, 2);
    }
    if (played.rank === "wildDrawFour") {
      const victim = peekNextParticipantId(g.playerOrder, g.currentPlayerIndex, g.direction, 1);
      this.unoDrawNCards(g, victim, 4);
    }

    if (hand.length === 0) {
      g.status = "finished";
      g.winnerParticipantId = participantId;
      if (!g.scoresApplied) {
        g.scoresApplied = true;
        const pts = Math.max(0, activeParticipants(session).length - 1);
        const winner = session.participants.find((p) => p.id === participantId);
        if (winner) {
          winner.score += pts;
        }
      }
      this.unoSyncAnnouncementBanner(g);
      session.updatedAt = Date.now();
      await this.persist();
      return;
    }

    if (hand.length === 1) {
      g.unoCatchOpenFor = participantId;
      g.unoCatchAllowedAfterMs = Date.now() + UNO_MISS_CATCH_DELAY_MS;
    }

    const adv = advanceTurnAfterPlay(g.playerOrder, g.currentPlayerIndex, g.direction, played.rank);
    g.currentPlayerIndex = adv.currentPlayerIndex;
    g.direction = adv.direction;

    this.unoSyncAnnouncementBanner(g);
    session.updatedAt = Date.now();
    await this.persist();
  }

  public async unoDraw(sessionId: string, participantId: string): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    assertParticipantActiveForGameplay(session, participantId);
    const g = session.games[0];
    if (g?.type !== "uno" || g.status !== "playing") {
      throw new Error("UNO is not active.");
    }
    this.unoMaybeClearCatchWindow(g, participantId);
    const currentId = g.playerOrder[g.currentPlayerIndex];
    if (currentId !== participantId) {
      throw new Error("Not your turn.");
    }
    if (g.pendingDrawnCardId !== null) {
      throw new Error("Already drew this turn.");
    }
    const hand = g.hands[participantId];
    if (!hand) {
      throw new Error("No hand.");
    }
    refillUnoDrawPileFromDiscard(g.drawPile, g.discardPile);
    if (g.drawPile.length === 0) {
      throw new Error("No cards to draw.");
    }
    const c = g.drawPile.pop()!;
    hand.push(c);
    g.pendingDrawnCardId = c.id;
    this.unoSyncAnnouncementBanner(g);
    session.updatedAt = Date.now();
    await this.persist();
  }

  public async unoPassAfterDraw(sessionId: string, participantId: string): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    assertParticipantActiveForGameplay(session, participantId);
    const g = session.games[0];
    if (g?.type !== "uno" || g.status !== "playing") {
      throw new Error("UNO is not active.");
    }
    this.unoMaybeClearCatchWindow(g, participantId);
    const currentId = g.playerOrder[g.currentPlayerIndex];
    if (currentId !== participantId) {
      throw new Error("Not your turn.");
    }
    if (g.pendingDrawnCardId === null) {
      throw new Error("Nothing to pass.");
    }
    const n = g.playerOrder.length;
    g.currentPlayerIndex = normPlayerIndex(g.currentPlayerIndex + g.direction, n);
    g.pendingDrawnCardId = null;
    this.unoSyncAnnouncementBanner(g);
    session.updatedAt = Date.now();
    await this.persist();
  }

  public async unoDeclareUno(sessionId: string, participantId: string): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    assertParticipantActiveForGameplay(session, participantId);
    const g = session.games[0];
    if (g?.type !== "uno" || g.status !== "playing") {
      throw new Error("UNO is not active.");
    }
    const hand = g.hands[participantId];
    if (!hand || hand.length !== 1) {
      throw new Error("You can only declare UNO with exactly one card.");
    }
    if (g.unoCatchOpenFor === participantId) {
      g.unoCatchOpenFor = null;
      g.unoCatchAllowedAfterMs = null;
    }
    g.unoAnnouncedParticipantId = participantId;
    this.unoSyncAnnouncementBanner(g);
    session.updatedAt = Date.now();
    await this.persist();
  }

  public async unoCatchPlayer(
    sessionId: string,
    callerParticipantId: string,
    targetParticipantId: string
  ): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    assertParticipantActiveForGameplay(session, callerParticipantId);
    const g = session.games[0];
    if (g?.type !== "uno" || g.status !== "playing") {
      throw new Error("UNO is not active.");
    }
    if (callerParticipantId === targetParticipantId) {
      throw new Error("Cannot catch yourself.");
    }
    if (g.unoCatchOpenFor !== targetParticipantId) {
      throw new Error("That player is not missing UNO.");
    }
    if (
      typeof g.unoCatchAllowedAfterMs === "number" &&
      Number.isFinite(g.unoCatchAllowedAfterMs) &&
      Date.now() < g.unoCatchAllowedAfterMs
    ) {
      throw new Error("Wait before calling out missed UNO.");
    }
    this.unoDrawNCards(g, targetParticipantId, 2);
    g.unoCatchOpenFor = null;
    g.unoCatchAllowedAfterMs = null;
    this.unoSyncAnnouncementBanner(g);
    session.updatedAt = Date.now();
    await this.persist();
  }

  private bsClearPending(game: BsGameInternal): void {
    game.pendingPlayerId = null;
    game.pendingPlayedCards = [];
    game.believedParticipantIds = [];
    game.calledBsParticipantId = null;
  }

  private bsAdvanceToNextActivePlayer(game: BsGameInternal): void {
    const n = game.playerOrder.length;
    if (n === 0) {
      return;
    }
    for (let step = 1; step <= n; step += 1) {
      const idx = (game.currentPlayerIndex + step) % n;
      const pid = game.playerOrder[idx]!;
      if (!game.finishedPlayerIds.includes(pid)) {
        game.currentPlayerIndex = idx;
        return;
      }
    }
  }

  private bsChallengerIds(game: BsGameInternal): string[] {
    const pendingPlayerId = game.pendingPlayerId;
    return game.playerOrder.filter((pid) => pid !== pendingPlayerId && !game.finishedPlayerIds.includes(pid));
  }

  private bsAwardFinishPoints(session: SessionInternal, game: BsGameInternal, participantId: string): void {
    if (game.finishedPlayerIds.includes(participantId)) {
      return;
    }
    const hand = game.hands[participantId] ?? [];
    if (hand.length !== 0) {
      return;
    }
    const activeCount = game.playerOrder.length;
    const points = Math.max(0, activeCount - game.finishedPlayerIds.length);
    const participant = session.participants.find((p) => p.id === participantId);
    if (participant) {
      participant.score += points;
    }
    game.finishedPlayerIds.push(participantId);
  }

  private bsFinalizeGameIfNeeded(session: SessionInternal, game: BsGameInternal): boolean {
    const remaining = game.playerOrder.filter((pid) => !game.finishedPlayerIds.includes(pid));
    if (remaining.length > 2) {
      return false;
    }
    for (const pid of remaining) {
      if (!game.finishedPlayerIds.includes(pid)) {
        game.finishedPlayerIds.push(pid);
      }
    }
    const scores: Record<string, number> = {};
    for (const p of session.participants) {
      scores[p.id] = p.score;
    }
    game.finalScores = scores;
    game.status = "finished";
    this.bsClearPending(game);
    return true;
  }

  private bsCompleteTurn(session: SessionInternal, game: BsGameInternal): void {
    const pendingPlayerId = game.pendingPlayerId;
    if (!pendingPlayerId) {
      throw new Error("No BS turn is awaiting resolution.");
    }
    this.bsAwardFinishPoints(session, game, pendingPlayerId);
    if (this.bsFinalizeGameIfNeeded(session, game)) {
      return;
    }
    game.currentRankIndex = (game.currentRankIndex + 1) % BS_RANKS.length;
    this.bsAdvanceToNextActivePlayer(game);
    game.status = "playing";
    this.bsClearPending(game);
  }

  public async bsPlayCards(sessionId: string, participantId: string, cardIds: string[]): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    assertParticipantActiveForGameplay(session, participantId);
    const g = session.games[0];
    if (g?.type !== "bs" || g.status !== "playing") {
      throw new Error("BS is not in a playable state.");
    }
    const currentPlayerId = g.playerOrder[g.currentPlayerIndex];
    if (currentPlayerId !== participantId) {
      throw new Error("Not your turn.");
    }
    if (cardIds.length < 1 || cardIds.length > 4) {
      throw new Error("Play between 1 and 4 cards.");
    }
    const uniqueCardIds = new Set(cardIds);
    if (uniqueCardIds.size !== cardIds.length) {
      throw new Error("Cannot play duplicate cards.");
    }
    const hand = g.hands[participantId] ?? [];
    const playedCards: BsCard[] = [];
    for (const cardId of cardIds) {
      const idx = hand.findIndex((card) => card.id === cardId);
      if (idx < 0) {
        throw new Error("Card not in hand.");
      }
      const [removed] = hand.splice(idx, 1);
      playedCards.push(removed!);
    }
    g.discardPile.push(...playedCards);
    g.pendingPlayerId = participantId;
    g.pendingPlayedCards = playedCards;
    g.believedParticipantIds = [];
    g.calledBsParticipantId = null;
    g.status = "challenging";
    session.updatedAt = Date.now();
    await this.persist();
  }

  public async bsBelieve(sessionId: string, participantId: string): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    assertParticipantActiveForGameplay(session, participantId);
    const g = session.games[0];
    if (g?.type !== "bs" || g.status !== "challenging") {
      throw new Error("BS is not waiting for belief votes.");
    }
    const challengers = this.bsChallengerIds(g);
    if (!challengers.includes(participantId)) {
      throw new Error("Only opponents can vote on this challenge.");
    }
    if (g.believedParticipantIds.includes(participantId)) {
      throw new Error("You already voted.");
    }
    g.believedParticipantIds.push(participantId);
    if (g.believedParticipantIds.length === challengers.length) {
      this.bsCompleteTurn(session, g);
    }
    session.updatedAt = Date.now();
    await this.persist();
  }

  public async bsCallBS(sessionId: string, participantId: string): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    assertParticipantActiveForGameplay(session, participantId);
    const g = session.games[0];
    if (g?.type !== "bs" || g.status !== "challenging") {
      throw new Error("BS cannot be called right now.");
    }
    const challengers = this.bsChallengerIds(g);
    if (!challengers.includes(participantId)) {
      throw new Error("Only opponents can call BS.");
    }
    if (g.believedParticipantIds.includes(participantId)) {
      throw new Error("You already voted.");
    }
    g.calledBsParticipantId = participantId;
    g.status = "challenged";
    session.updatedAt = Date.now();
    await this.persist();
  }

  public async bsResolveChallenge(sessionId: string, participantId: string, truth: boolean): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    assertParticipantActiveForGameplay(session, participantId);
    if (!session.participants.some((p) => p.id === participantId && p.isHost)) {
      throw new Error("Only the host can resolve BS challenges.");
    }
    const g = session.games[0];
    if (g?.type !== "bs" || g.status !== "challenged") {
      throw new Error("BS challenge is not awaiting host resolution.");
    }
    const pendingPlayerId = g.pendingPlayerId;
    const callerId = g.calledBsParticipantId;
    if (!pendingPlayerId || !callerId) {
      throw new Error("Challenge state is invalid.");
    }
    const recipientId = truth ? callerId : pendingPlayerId;
    const recipientHand = g.hands[recipientId];
    if (!recipientHand) {
      throw new Error("Challenge recipient has no hand.");
    }
    recipientHand.push(...g.discardPile);
    g.discardPile = [];
    this.bsCompleteTurn(session, g);
    session.updatedAt = Date.now();
    await this.persist();
  }

  public async madlibsSubmitWord(sessionId: string, participantId: string, word: string): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    assertParticipantActiveForGameplay(session, participantId);
    const game = session.games[0];
    if (game?.type !== "madlibs" || game.status !== "filling") {
      throw new Error("Madlibs is not waiting for a submission.");
    }
    const nextIndex = game.currentBlankIndex;
    if (nextIndex >= game.words.length) {
      throw new Error("All Madlibs blanks are already filled.");
    }
    const expectedParticipantId = game.fillerParticipantIds[nextIndex];
    if (expectedParticipantId !== participantId) {
      throw new Error("It is not your turn to submit a word.");
    }
    const trimmedWord = word.trim();
    if (!trimmedWord) {
      throw new Error("Please enter a word.");
    }
    game.words[nextIndex] = trimmedWord;
    game.currentBlankIndex += 1;
    if (game.currentBlankIndex >= game.words.length) {
      game.status = "reading";
      const participants = activeParticipants(session).map((entry) => entry.id);
      game.readerParticipantId = madlibsPickReader(participants);
    }
    session.updatedAt = Date.now();
    await this.persist();
  }

  public async madlibsPassRead(sessionId: string, participantId: string): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    assertParticipantActiveForGameplay(session, participantId);
    const game = session.games[0];
    if (game?.type !== "madlibs" || game.status !== "reading") {
      throw new Error("Madlibs is not in reading mode.");
    }
    if (game.readerParticipantId !== participantId) {
      throw new Error("Only the current reader can pass.");
    }
    const participants = activeParticipants(session).map((entry) => entry.id);
    game.readerParticipantId = madlibsPickReader(participants, participantId);
    session.updatedAt = Date.now();
    await this.persist();
  }

  public async madlibsNextRound(sessionId: string, participantId: string): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    assertParticipantActiveForGameplay(session, participantId);
    if (!session.participants.some((participant) => participant.id === participantId && participant.isHost)) {
      throw new Error("Only the host can start the next Madlibs round.");
    }
    const game = session.games[0];
    if (game?.type !== "madlibs" || game.status !== "reading") {
      throw new Error("Madlibs is not ready for the next round.");
    }
    const participants = activeParticipants(session).map((entry) => entry.id);
    if (participants.length < 2) {
      throw new Error("Madlibs needs at least two active players.");
    }
    const nextTemplate = pickMadlibTemplate(game.usedTemplateIds);
    const blankCount = madlibBlankCount(nextTemplate);
    game.status = "filling";
    game.template = nextTemplate;
    game.usedTemplateIds = [...game.usedTemplateIds, nextTemplate.id];
    game.currentBlankIndex = 0;
    game.fillerParticipantIds = madlibsRotateFillers(participants, blankCount);
    game.words = Array.from({ length: blankCount }, () => null);
    game.readerParticipantId = null;
    session.updatedAt = Date.now();
    await this.persist();
  }

  private clearCatchPhraseTimer(sessionId: string): void {
    const existing = this.catchPhraseResolveTimers.get(sessionId);
    if (existing) {
      clearTimeout(existing);
      this.catchPhraseResolveTimers.delete(sessionId);
    }
  }

  private catchPhraseCurrentHolderId(game: CatchPhraseGameInternal): string | null {
    if (game.holderIndex === null || game.holderIndex < 0 || game.holderIndex >= game.passOrder.length) {
      return null;
    }
    return game.passOrder[game.holderIndex] ?? null;
  }

  /** New phrase only; used when passing—timer continues until buzz. */
  private catchPhraseAssignNewClue(game: CatchPhraseGameInternal): void {
    const clue = pickCatchPhraseClue(game.usedClueIds);
    if (!clue) {
      throw new Error("No Catch Phrase clues available.");
    }
    if (game.usedClueIds.includes(clue.id)) {
      game.usedClueIds = [];
    }
    game.usedClueIds.push(clue.id);
    game.currentClueId = clue.id;
    game.currentPhrase = clue.text;
  }

  private catchPhraseStartLiveRound(game: CatchPhraseGameInternal): void {
    this.catchPhraseAssignNewClue(game);
    const now = Date.now();
    const phases = catchPhraseRandomPhaseBoundaries(now);
    game.roundStartedAt = phases.roundStartedAt;
    game.slowPhaseEndsAt = phases.slowPhaseEndsAt;
    game.mediumPhaseEndsAt = phases.mediumPhaseEndsAt;
    game.roundEndsAt = phases.roundEndsAt;
    game.roundPhase = "live";
  }

  private scheduleCatchPhraseDeadline(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    const game = session?.games[0];
    if (game?.type !== "catchPhrase" || game.status !== "playing" || game.roundPhase !== "live" || game.roundEndsAt === null) {
      return;
    }
    this.clearCatchPhraseTimer(sessionId);
    const delay = Math.max(0, game.roundEndsAt - Date.now());
    const timer = setTimeout(() => {
      void this.catchPhraseTimedOut(sessionId).catch(() => {});
    }, delay);
    this.catchPhraseResolveTimers.set(sessionId, timer);
  }

  private async catchPhraseTimedOut(sessionId: string): Promise<void> {
    let session: SessionInternal;
    try {
      session = this.getSessionOrThrow(sessionId);
    } catch {
      return;
    }
    const game = session.games[0];
    if (game?.type !== "catchPhrase" || game.status !== "playing" || game.roundPhase !== "live") {
      return;
    }

    const holderId = this.catchPhraseCurrentHolderId(game);
    if (!holderId) {
      this.clearCatchPhraseTimer(sessionId);
      session.games = [];
      session.updatedAt = Date.now();
      await this.persist();
      this.onSessionUpdated?.(sessionId);
      return;
    }
    const holderTeam = catchPhraseTeamForParticipant(game, holderId);
    if (!holderTeam) {
      this.clearCatchPhraseTimer(sessionId);
      session.games = [];
      session.updatedAt = Date.now();
      await this.persist();
      this.onSessionUpdated?.(sessionId);
      return;
    }

    // Buzzer: the team with the device was giving clues to their own side; the *other* team (not guessing this clue) scores.
    const nonGuessingTeam: "A" | "B" = holderTeam === "A" ? "B" : "A";
    const scoringIds = nonGuessingTeam === "A" ? game.teamAIds : game.teamBIds;
    for (const pid of scoringIds) {
      const participant = session.participants.find((p) => p.id === pid);
      if (participant && participantIsActive(participant)) {
        participant.score += 1;
      }
    }
    game.teamScores[nonGuessingTeam] += 1;

    this.clearCatchPhraseTimer(sessionId);
    game.currentClueId = null;
    game.currentPhrase = null;
    game.roundStartedAt = null;
    game.slowPhaseEndsAt = null;
    game.mediumPhaseEndsAt = null;
    game.roundEndsAt = null;

    if (game.teamScores[nonGuessingTeam] >= CATCH_PHRASE_WIN_SCORE) {
      game.status = "finished";
      game.roundPhase = null;
      game.winnerTeam = nonGuessingTeam;
      session.updatedAt = Date.now();
      await this.persist();
      this.onSessionUpdated?.(sessionId);
      return;
    }

    const nextHolderTeam: "A" | "B" = nonGuessingTeam;
    const currentIndex = game.holderIndex ?? -1;
    const nextIndex = nextCatchPhraseHolderOnTeam(game, currentIndex, nextHolderTeam);
    if (nextIndex === null) {
      session.games = [];
      session.updatedAt = Date.now();
      await this.persist();
      this.onSessionUpdated?.(sessionId);
      return;
    }
    game.holderIndex = nextIndex;
    game.roundPhase = "awaitingRoundStart";
    session.updatedAt = Date.now();
    await this.persist();
    this.onSessionUpdated?.(sessionId);
  }

  public async catchPhraseSetTeams(
    sessionId: string,
    participantId: string,
    teamAIds: string[],
    teamBIds: string[]
  ): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    assertParticipantActiveForGameplay(session, participantId);
    if (!session.participants.some((p) => p.id === participantId && p.isHost)) {
      throw new Error("Only the host can set teams.");
    }
    const game = session.games[0];
    if (game?.type !== "catchPhrase" || game.status !== "teamSetup") {
      throw new Error("Teams can only be edited during setup.");
    }
    validateCatchPhraseTeamRoster(session, teamAIds, teamBIds);
    game.teamAIds = [...teamAIds];
    game.teamBIds = [...teamBIds];
    session.updatedAt = Date.now();
    await this.persist();
  }

  public async catchPhraseBeginPlay(sessionId: string, participantId: string): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    assertParticipantActiveForGameplay(session, participantId);
    if (!session.participants.some((p) => p.id === participantId && p.isHost)) {
      throw new Error("Only the host can start play.");
    }
    const game = session.games[0];
    if (game?.type !== "catchPhrase" || game.status !== "teamSetup") {
      throw new Error("Catch Phrase is not waiting for team setup.");
    }
    validateCatchPhraseTeamRoster(session, game.teamAIds, game.teamBIds);
    const passOrder = buildCatchPhrasePassOrder(session, game.teamAIds, game.teamBIds);
    if (passOrder.length < CATCH_PHRASE_MIN_PLAYERS) {
      throw new Error("Could not create a valid pass order.");
    }

    this.clearCatchPhraseTimer(sessionId);
    game.status = "playing";
    game.roundPhase = "awaitingRoundStart";
    game.passOrder = passOrder;
    game.holderIndex = 0;
    game.currentClueId = null;
    game.currentPhrase = null;
    game.roundStartedAt = null;
    game.slowPhaseEndsAt = null;
    game.mediumPhaseEndsAt = null;
    game.roundEndsAt = null;
    game.teamScores = { A: 0, B: 0 };
    game.winnerTeam = null;
    session.updatedAt = Date.now();
    await this.persist();
  }

  public async catchPhraseStartRound(sessionId: string, participantId: string): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    assertParticipantActiveForGameplay(session, participantId);
    const game = session.games[0];
    if (game?.type !== "catchPhrase" || game.status !== "playing" || game.roundPhase !== "awaitingRoundStart") {
      throw new Error("Catch Phrase is not waiting to start a round.");
    }
    const holderId = this.catchPhraseCurrentHolderId(game);
    if (!holderId || holderId !== participantId) {
      throw new Error("Only the current holder can start this round.");
    }

    this.catchPhraseStartLiveRound(game);
    session.updatedAt = Date.now();
    await this.persist();
    this.scheduleCatchPhraseDeadline(sessionId);
  }

  public async catchPhraseGuessed(sessionId: string, participantId: string): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    assertParticipantActiveForGameplay(session, participantId);
    const game = session.games[0];
    if (game?.type !== "catchPhrase" || game.status !== "playing" || game.roundPhase !== "live") {
      throw new Error("Catch Phrase is not in an active round.");
    }
    const holderId = this.catchPhraseCurrentHolderId(game);
    if (!holderId || holderId !== participantId) {
      throw new Error("Only the current holder can pass.");
    }
    if (game.passOrder.length === 0 || game.holderIndex === null) {
      throw new Error("Pass order is not configured.");
    }

    this.clearCatchPhraseTimer(sessionId);
    game.holderIndex = (game.holderIndex + 1) % game.passOrder.length;
    this.catchPhraseAssignNewClue(game);
    session.updatedAt = Date.now();
    await this.persist();
    this.scheduleCatchPhraseDeadline(sessionId);
  }

  public async yahtzeeToggleHold(sessionId: string, participantId: string, dieIndex: number): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    assertParticipantActiveForGameplay(session, participantId);
    const game = session.games[0];
    if (game?.type !== "yahtzee" || game.status !== "playing") {
      throw new Error("Yahtzee is not in play.");
    }
    if (dieIndex < 0 || dieIndex > 4 || !Number.isInteger(dieIndex)) {
      throw new Error("Invalid die index.");
    }
    if (game.mode === "simultaneous") {
      const rows = game.sheetsByParticipant[participantId] ?? [];
      if (yahtzeePlayerFinished(rows)) {
        throw new Error("You have already finished your scorecard.");
      }
      const heldByParticipant = game.heldByParticipant ?? {};
      const heldCurrent = heldByParticipant[participantId] ?? [false, false, false, false, false];
      const held = [...heldCurrent] as boolean[];
      held[dieIndex] = !held[dieIndex];
      heldByParticipant[participantId] = held as [boolean, boolean, boolean, boolean, boolean];
      game.heldByParticipant = heldByParticipant;
      session.updatedAt = Date.now();
      await this.persist();
      return;
    }
    const currentId = game.playerOrder[game.currentPlayerIndex];
    if (currentId !== participantId) {
      throw new Error("Not your turn.");
    }
    const held = [...game.held] as boolean[];
    held[dieIndex] = !held[dieIndex];
    game.held = held as [boolean, boolean, boolean, boolean, boolean];
    session.updatedAt = Date.now();
    await this.persist();
  }

  public async yahtzeeRoll(sessionId: string, participantId: string): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    assertParticipantActiveForGameplay(session, participantId);
    const game = session.games[0];
    if (game?.type !== "yahtzee" || game.status !== "playing") {
      throw new Error("Yahtzee is not in play.");
    }
    if (game.mode === "simultaneous") {
      const rows = game.sheetsByParticipant[participantId] ?? [];
      if (yahtzeePlayerFinished(rows)) {
        throw new Error("You have already finished your scorecard.");
      }
      const diceByParticipant = game.diceByParticipant ?? {};
      const heldByParticipant = game.heldByParticipant ?? {};
      const rollsUsedByParticipant = game.rollsUsedByParticipant ?? {};
      const dice = diceByParticipant[participantId];
      const held = heldByParticipant[participantId];
      const rollsUsed = rollsUsedByParticipant[participantId] ?? 1;
      if (!dice || !held) {
        throw new Error("Your Yahtzee turn state is missing.");
      }
      if (rollsUsed >= 3) {
        throw new Error("No rolls remaining.");
      }
      diceByParticipant[participantId] = yahtzeeRerollKeepingHeld(dice, held);
      rollsUsedByParticipant[participantId] = rollsUsed === 1 ? 2 : 3;
      game.diceByParticipant = diceByParticipant;
      game.rollsUsedByParticipant = rollsUsedByParticipant;
      session.updatedAt = Date.now();
      await this.persist();
      return;
    }
    const currentId = game.playerOrder[game.currentPlayerIndex];
    if (currentId !== participantId) {
      throw new Error("Not your turn.");
    }
    if (game.rollsUsed >= 3) {
      throw new Error("No rolls remaining.");
    }
    game.dice = yahtzeeRerollKeepingHeld(game.dice, game.held);
    game.rollsUsed = game.rollsUsed === 1 ? 2 : 3;
    session.updatedAt = Date.now();
    await this.persist();
  }

  public async yahtzeeSetPendingCategory(
    sessionId: string,
    participantId: string,
    category: YahtzeeCategory
  ): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    assertParticipantActiveForGameplay(session, participantId);
    const game = session.games[0];
    if (game?.type !== "yahtzee" || game.status !== "playing") {
      throw new Error("Yahtzee is not in play.");
    }
    const rows = game.sheetsByParticipant[participantId] ?? [];
    if (game.mode === "turns") {
      const currentId = game.playerOrder[game.currentPlayerIndex];
      if (currentId !== participantId) {
        throw new Error("Not your turn.");
      }
    } else if (yahtzeePlayerFinished(rows)) {
      throw new Error("You have already finished your scorecard.");
    }
    if (yahtzeeSheetHasCategory(rows, category)) {
      throw new Error("That category is already filled.");
    }
    if (game.mode === "simultaneous") {
      const pendingCategoryByParticipant = game.pendingCategoryByParticipant ?? {};
      pendingCategoryByParticipant[participantId] = category;
      game.pendingCategoryByParticipant = pendingCategoryByParticipant;
    } else {
      game.pendingCategory = category;
    }
    session.updatedAt = Date.now();
    await this.persist();
  }

  private yahtzeeFinalize(session: SessionInternal, game: YahtzeeGameInternal): void {
    if (game.scoresApplied) {
      return;
    }
    const totals: Record<string, number> = {};
    for (const pid of game.playerOrder) {
      totals[pid] = grandTotalFromSheetRows(game.sheetsByParticipant[pid] ?? []);
    }
    const standings = computeYahtzeePlacement(game.playerOrder, totals);
    for (const row of standings) {
      const p = session.participants.find((x) => x.id === row.participantId);
      if (p) {
        p.score += row.award;
      }
    }
    game.scoresApplied = true;
    game.status = "finished";
    game.yahtzeeGrandTotals = totals;
    game.placementAwards = Object.fromEntries(standings.map((s) => [s.participantId, s.award]));
    game.winnerParticipantId = standings[0]?.participantId ?? game.playerOrder[0] ?? "";
    game.pendingCategory = null;
  }

  private yahtzeeAdvanceToNextTurn(game: YahtzeeGameInternal): void {
    const n = game.playerOrder.length;
    if (n === 0) {
      return;
    }
    game.currentPlayerIndex = (game.currentPlayerIndex + 1) % n;
    game.dice = yahtzeeRollFiveDice();
    game.held = [false, false, false, false, false];
    game.rollsUsed = 1;
    game.pendingCategory = null;
  }

  public async yahtzeePassTurn(sessionId: string, participantId: string): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    assertParticipantActiveForGameplay(session, participantId);
    const game = session.games[0];
    if (game?.type !== "yahtzee" || game.status !== "playing") {
      throw new Error("Yahtzee is not in play.");
    }
    const rows = game.sheetsByParticipant[participantId] ?? [];
    if (game.mode === "simultaneous") {
      if (yahtzeePlayerFinished(rows)) {
        throw new Error("You have already finished your scorecard.");
      }
      const pendingCategoryByParticipant = game.pendingCategoryByParticipant ?? {};
      const pendingCategory = pendingCategoryByParticipant[participantId] ?? null;
      if (pendingCategory === null) {
        throw new Error("Choose a scoring row before passing.");
      }
      if (yahtzeeSheetHasCategory(rows, pendingCategory)) {
        throw new Error("That category is already filled.");
      }
      const dice = game.diceByParticipant?.[participantId];
      if (!dice) {
        throw new Error("Your Yahtzee turn state is missing.");
      }
      const points = scoreCategory(dice, pendingCategory);
      const nextRows = [...rows, { category: pendingCategory, points }];
      game.sheetsByParticipant[participantId] = nextRows;
      if (pendingCategory === "yahtzee" && points === 50) {
        game.latestYahtzee = { participantId, createdAtMs: Date.now() };
      }
      if (yahtzeeEveryoneFinished(game)) {
        this.yahtzeeFinalize(session, game);
      } else {
        const diceByParticipant = game.diceByParticipant ?? {};
        const heldByParticipant = game.heldByParticipant ?? {};
        const rollsUsedByParticipant = game.rollsUsedByParticipant ?? {};
        diceByParticipant[participantId] = yahtzeeRollFiveDice();
        heldByParticipant[participantId] = [false, false, false, false, false];
        rollsUsedByParticipant[participantId] = 1;
        pendingCategoryByParticipant[participantId] = null;
        game.diceByParticipant = diceByParticipant;
        game.heldByParticipant = heldByParticipant;
        game.rollsUsedByParticipant = rollsUsedByParticipant;
        game.pendingCategoryByParticipant = pendingCategoryByParticipant;
      }
      session.updatedAt = Date.now();
      await this.persist();
      return;
    }

    const currentId = game.playerOrder[game.currentPlayerIndex];
    if (currentId !== participantId) {
      throw new Error("Not your turn.");
    }
    if (game.pendingCategory === null) {
      throw new Error("Choose a scoring row before passing.");
    }
    if (yahtzeeSheetHasCategory(rows, game.pendingCategory)) {
      throw new Error("That category is already filled.");
    }
    const points = scoreCategory(game.dice, game.pendingCategory);
    const nextRows = [...rows, { category: game.pendingCategory, points }];
    game.sheetsByParticipant[participantId] = nextRows;
    if (game.pendingCategory === "yahtzee" && points === 50) {
      game.latestYahtzee = { participantId, createdAtMs: Date.now() };
    }

    if (yahtzeeEveryoneFinished(game)) {
      this.yahtzeeFinalize(session, game);
    } else {
      this.yahtzeeAdvanceToNextTurn(game);
    }
    session.updatedAt = Date.now();
    await this.persist();
  }

  private scattergoriesAssertHost(session: SessionInternal, participantId: string): void {
    if (!session.participants.some((p) => p.id === participantId && p.isHost)) {
      throw new Error("Only the host can do that.");
    }
    assertParticipantActiveForGameplay(session, participantId);
  }

  private scattergoriesGameOrThrow(session: SessionInternal): ScattergoriesGameInternal {
    const game = session.games[0];
    if (game?.type !== "scattergories") {
      throw new Error("Scattergories is not active.");
    }
    return game;
  }

  private applyScattergoriesList(game: ScattergoriesGameInternal, list: ScattergoriesList): void {
    game.listId = list.id;
    game.listTitle = list.title;
    game.prompts = [...list.prompts];
    if (!game.usedListIds.includes(list.id)) {
      game.usedListIds.push(list.id);
    }
  }

  private scattergoriesEmptyAnswers(promptCount: number): string[] {
    return Array.from({ length: promptCount }, () => "");
  }

  private scattergoriesInitAnswersForRoster(
    session: SessionInternal,
    game: ScattergoriesGameInternal
  ): void {
    const empty = this.scattergoriesEmptyAnswers(game.prompts.length);
    game.answers = {};
    for (const participant of activeParticipants(session)) {
      game.answers[participant.id] = [...empty];
    }
  }

  private clearScattergoriesTimer(sessionId: string): void {
    const existing = this.scattergoriesResolveTimers.get(sessionId);
    if (existing) {
      clearTimeout(existing);
      this.scattergoriesResolveTimers.delete(sessionId);
    }
  }

  private scheduleScattergoriesTimer(sessionId: string, deadlineMs: number, onFire: () => Promise<void>): void {
    this.clearScattergoriesTimer(sessionId);
    const delay = Math.max(0, deadlineMs - Date.now());
    const timer = setTimeout(() => {
      void onFire().catch(() => {});
    }, delay);
    this.scattergoriesResolveTimers.set(sessionId, timer);
  }

  private async scattergoriesTransitionToAnswering(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }
    const game = session.games[0];
    if (game?.type !== "scattergories" || game.status !== "countdown" || !game.letter) {
      return;
    }
    this.clearScattergoriesTimer(sessionId);
    const now = Date.now();
    game.status = "answering";
    game.countdownEndsAt = null;
    game.roundEndsAt = now + game.answerDurationMs;
    this.scattergoriesInitAnswersForRoster(session, game);
    session.updatedAt = now;
    await this.persist();
    this.onSessionUpdated?.(sessionId);
    this.scheduleScattergoriesTimer(sessionId, game.roundEndsAt, () =>
      this.scattergoriesTransitionToReviewing(sessionId)
    );
  }

  private async scattergoriesTransitionToReviewing(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }
    const game = session.games[0];
    if (game?.type !== "scattergories" || game.status !== "answering" || !game.letter) {
      return;
    }
    this.clearScattergoriesTimer(sessionId);
    game.status = "reviewing";
    game.roundEndsAt = null;
    game.currentPromptIndex = 0;
    game.verdictsByPrompt = {};
    this.scattergoriesApplyAutoVerdictsForPrompt(session, game, 0);
    session.updatedAt = Date.now();
    await this.persist();
    this.onSessionUpdated?.(sessionId);
  }

  private scattergoriesAdjustScore(
    session: SessionInternal,
    participantId: string,
    delta: number,
    game: ScattergoriesGameInternal
  ): void {
    if (delta === 0) {
      return;
    }
    const participant = session.participants.find((p) => p.id === participantId);
    if (!participant) {
      return;
    }
    participant.score += delta;
    game.roundScoreDelta[participantId] = (game.roundScoreDelta[participantId] ?? 0) + delta;
  }

  private scattergoriesApplyAutoVerdictsForPrompt(
    session: SessionInternal,
    game: ScattergoriesGameInternal,
    promptIndex: number
  ): void {
    if (!game.verdictsByPrompt[promptIndex]) {
      game.verdictsByPrompt[promptIndex] = {};
    }
    const verdicts = game.verdictsByPrompt[promptIndex]!;
    for (const participant of activeParticipants(session)) {
      const text = game.answers[participant.id]?.[promptIndex] ?? "";
      if (text.trim().length === 0) {
        verdicts[participant.id] = "invalid";
      }
    }
  }

  private scattergoriesIsDuplicateAnswer(
    game: ScattergoriesGameInternal,
    participantId: string,
    promptIndex: number
  ): boolean {
    const answers = game.answers[participantId] ?? [];
    return participantHasDuplicateForPrompt(answers, promptIndex);
  }

  private scattergoriesRevokeVerdictPoints(
    session: SessionInternal,
    game: ScattergoriesGameInternal,
    promptIndex: number,
    participantId: string
  ): void {
    const prior = game.verdictsByPrompt[promptIndex]?.[participantId];
    if (prior !== "valid" || !game.letter) {
      return;
    }
    const text = game.answers[participantId]?.[promptIndex] ?? "";
    const points = countLetterWords(text, game.letter);
    this.scattergoriesAdjustScore(session, participantId, -points, game);
  }

  public async scattergoriesSelectList(
    sessionId: string,
    hostParticipantId: string,
    listId: string
  ): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    this.scattergoriesAssertHost(session, hostParticipantId);
    const game = this.scattergoriesGameOrThrow(session);
    if (game.status !== "idle" && game.status !== "roundComplete") {
      throw new Error("Lists can only be changed before a round starts.");
    }
    const list = getScattergoriesListById(listId);
    if (!list) {
      throw new Error("Unknown Scattergories list.");
    }
    this.applyScattergoriesList(game, list);
    session.updatedAt = Date.now();
    await this.persist();
  }

  public async scattergoriesRandomList(sessionId: string, hostParticipantId: string): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    this.scattergoriesAssertHost(session, hostParticipantId);
    const game = this.scattergoriesGameOrThrow(session);
    if (game.status !== "idle" && game.status !== "roundComplete") {
      throw new Error("Lists can only be changed before a round starts.");
    }
    const list = pickScattergoriesList(new Set(game.usedListIds));
    this.applyScattergoriesList(game, list);
    session.updatedAt = Date.now();
    await this.persist();
  }

  public async scattergoriesDrawLetter(sessionId: string, hostParticipantId: string): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    this.scattergoriesAssertHost(session, hostParticipantId);
    const game = this.scattergoriesGameOrThrow(session);
    if (game.status !== "idle" && game.status !== "roundComplete") {
      throw new Error("Letters can only be drawn before a round starts.");
    }
    const letter = pickScattergoriesLetter(new Set(game.usedLetters));
    game.letter = letter;
    if (!game.usedLetters.includes(letter)) {
      game.usedLetters.push(letter);
    }
    session.updatedAt = Date.now();
    await this.persist();
  }

  public async scattergoriesSetDuration(
    sessionId: string,
    hostParticipantId: string,
    answerDurationMs: number
  ): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    this.scattergoriesAssertHost(session, hostParticipantId);
    const game = this.scattergoriesGameOrThrow(session);
    if (game.status !== "idle" && game.status !== "roundComplete") {
      throw new Error("Duration can only be changed before a round starts.");
    }
    if (![60_000, 90_000, 120_000, 180_000].includes(answerDurationMs)) {
      throw new Error("Invalid answer duration.");
    }
    game.answerDurationMs = answerDurationMs;
    session.updatedAt = Date.now();
    await this.persist();
  }

  public async scattergoriesStartRound(sessionId: string, hostParticipantId: string): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    this.scattergoriesAssertHost(session, hostParticipantId);
    const game = this.scattergoriesGameOrThrow(session);
    if (game.status !== "idle" && game.status !== "roundComplete") {
      throw new Error("A round is already in progress.");
    }
    if (!game.letter) {
      throw new Error("Draw a letter before starting the round.");
    }
    if (game.prompts.length === 0) {
      throw new Error("Select a list before starting the round.");
    }
    this.clearScattergoriesTimer(sessionId);
    game.status = "countdown";
    game.answers = {};
    game.currentPromptIndex = 0;
    game.verdictsByPrompt = {};
    game.roundScoreDelta = {};
    game.roundEndsAt = null;
    const countdownEndsAt = Date.now() + SCATTERGORIES_COUNTDOWN_MS;
    game.countdownEndsAt = countdownEndsAt;
    session.updatedAt = Date.now();
    await this.persist();
    this.scheduleScattergoriesTimer(sessionId, countdownEndsAt, () =>
      this.scattergoriesTransitionToAnswering(sessionId)
    );
  }

  public async scattergoriesUpdateAnswers(
    sessionId: string,
    participantId: string,
    answers: string[]
  ): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    assertParticipantActiveForGameplay(session, participantId);
    const game = this.scattergoriesGameOrThrow(session);
    if (game.status !== "answering") {
      throw new Error("Scattergories is not accepting answers.");
    }
    if (answers.length !== game.prompts.length) {
      throw new Error("Answer count does not match prompts.");
    }
    const sanitized = answers.map((a) => a.slice(0, SCATTERGORIES_ANSWER_MAX_CHARS));
    game.answers[participantId] = sanitized;
    session.updatedAt = Date.now();
    await this.persist();
  }

  public async scattergoriesMarkAnswer(
    sessionId: string,
    hostParticipantId: string,
    promptIndex: number,
    targetParticipantId: string,
    valid: boolean
  ): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    this.scattergoriesAssertHost(session, hostParticipantId);
    const game = this.scattergoriesGameOrThrow(session);
    if (game.status !== "reviewing" || !game.letter) {
      throw new Error("Scattergories is not in the review phase.");
    }
    if (promptIndex !== game.currentPromptIndex) {
      throw new Error("That prompt is not being reviewed.");
    }
    if (promptIndex < 0 || promptIndex >= game.prompts.length) {
      throw new Error("Invalid prompt index.");
    }
    if (!activeParticipants(session).some((p) => p.id === targetParticipantId)) {
      throw new Error("Participant is not active in this session.");
    }
    const answerText = game.answers[targetParticipantId]?.[promptIndex] ?? "";
    if (answerText.trim().length === 0) {
      throw new Error("Blank answers are scored automatically.");
    }
    if (valid && this.scattergoriesIsDuplicateAnswer(game, targetParticipantId, promptIndex)) {
      throw new Error("Duplicate answers cannot be accepted.");
    }
    this.scattergoriesRevokeVerdictPoints(session, game, promptIndex, targetParticipantId);
    if (!game.verdictsByPrompt[promptIndex]) {
      game.verdictsByPrompt[promptIndex] = {};
    }
    game.verdictsByPrompt[promptIndex]![targetParticipantId] = valid ? "valid" : "invalid";
    if (valid) {
      const text = game.answers[targetParticipantId]?.[promptIndex] ?? "";
      const points = countLetterWords(text, game.letter);
      this.scattergoriesAdjustScore(session, targetParticipantId, points, game);
    }
    session.updatedAt = Date.now();
    await this.persist();
  }

  public async scattergoriesNextPrompt(sessionId: string, hostParticipantId: string): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    this.scattergoriesAssertHost(session, hostParticipantId);
    const game = this.scattergoriesGameOrThrow(session);
    if (game.status !== "reviewing" || !game.letter) {
      throw new Error("Scattergories is not in the review phase.");
    }
    const roster = activeParticipants(session);
    const verdicts = game.verdictsByPrompt[game.currentPromptIndex] ?? {};
    const allMarked = roster.every((p) => verdicts[p.id] === "valid" || verdicts[p.id] === "invalid");
    if (!allMarked) {
      throw new Error("Mark every answer before moving on.");
    }
    const lastIndex = game.prompts.length - 1;
    if (game.currentPromptIndex >= lastIndex) {
      game.status = "roundComplete";
      session.updatedAt = Date.now();
      await this.persist();
      return;
    }
    game.currentPromptIndex += 1;
    this.scattergoriesApplyAutoVerdictsForPrompt(session, game, game.currentPromptIndex);
    session.updatedAt = Date.now();
    await this.persist();
  }

  public async scattergoriesNewRound(sessionId: string, hostParticipantId: string): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    this.scattergoriesAssertHost(session, hostParticipantId);
    const game = this.scattergoriesGameOrThrow(session);
    if (game.status !== "roundComplete") {
      throw new Error("Finish reviewing the current round first.");
    }
    this.clearScattergoriesTimer(sessionId);
    game.status = "idle";
    game.letter = null;
    game.countdownEndsAt = null;
    game.roundEndsAt = null;
    game.answers = {};
    game.currentPromptIndex = 0;
    game.verdictsByPrompt = {};
    game.roundScoreDelta = {};
    session.updatedAt = Date.now();
    await this.persist();
  }

  private clearPictionaryTimer(sessionId: string): void {
    const existing = this.pictionaryResolveTimers.get(sessionId);
    if (existing) {
      clearTimeout(existing);
      this.pictionaryResolveTimers.delete(sessionId);
    }
  }

  private schedulePictionaryDrawingDeadline(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    const game = session?.games[0];
    if (game?.type !== "pictionary" || game.status !== "drawing" || game.roundEndsAt === null) {
      return;
    }
    this.clearPictionaryTimer(sessionId);
    const delay = Math.max(0, game.roundEndsAt - Date.now());
    const timer = setTimeout(() => {
      void this.pictionaryDrawingTimedOut(sessionId).catch(() => {});
    }, delay);
    this.pictionaryResolveTimers.set(sessionId, timer);
  }

  private schedulePictionaryRoundBreakEnd(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    const game = session?.games[0];
    if (game?.type !== "pictionary" || game.status !== "roundBreak" || game.roundBreakEndsAt === null) {
      return;
    }
    this.clearPictionaryTimer(sessionId);
    const delay = Math.max(0, game.roundBreakEndsAt - Date.now());
    const timer = setTimeout(() => {
      void this.pictionaryRoundBreakEnded(sessionId).catch(() => {});
    }, delay);
    this.pictionaryResolveTimers.set(sessionId, timer);
  }

  private async pictionaryDrawingTimedOut(sessionId: string): Promise<void> {
    let session: SessionInternal;
    try {
      session = this.getSessionOrThrow(sessionId);
    } catch {
      return;
    }
    const game = session.games[0];
    if (game?.type !== "pictionary" || game.status !== "drawing") {
      return;
    }
    await this.pictionaryEnterRoundBreak(session, game, "timeout");
  }

  private async pictionaryRoundBreakEnded(sessionId: string): Promise<void> {
    let session: SessionInternal;
    try {
      session = this.getSessionOrThrow(sessionId);
    } catch {
      return;
    }
    const game = session.games[0];
    if (game?.type !== "pictionary" || game.status !== "roundBreak") {
      return;
    }
    const nextTeam = game.roundBreakNextTeam;
    if (!nextTeam) {
      session.games = [];
      session.updatedAt = Date.now();
      await this.persist();
      this.onSessionUpdated?.(sessionId);
      return;
    }
    this.pictionaryStartDrawingPhase(session, game, nextTeam);
    session.updatedAt = Date.now();
    await this.persist();
    this.onSessionUpdated?.(sessionId);
    this.schedulePictionaryDrawingDeadline(sessionId);
  }

  private pictionaryStartDrawingPhase(
    session: SessionInternal,
    game: PictionaryGameInternal,
    team: "A" | "B"
  ): void {
    const members = team === "A" ? game.teamAIds : game.teamBIds;
    const drawer = pickPictionaryDrawer(members, game.drawCounts);
    const clue = pickPictionaryClue(game.usedClueIds);
    if (!clue) {
      throw new Error("No clues available.");
    }
    if (game.usedClueIds.includes(clue.id)) {
      game.usedClueIds = [];
    }
    game.usedClueIds.push(clue.id);

    game.status = "drawing";
    game.activeTeam = team;
    game.drawerId = drawer;
    game.currentPrompt = clue.text;
    game.currentClueId = clue.id;
    game.strokes = [];
    const now = Date.now();
    game.roundStartedAt = now;
    game.roundEndsAt = now + game.roundDurationMs;
    game.roundBreakEndsAt = null;
    game.revealedPrompt = null;
    game.lastRoundResult = null;
    game.roundBreakNextTeam = null;
  }

  private async pictionaryEnterRoundBreak(
    session: SessionInternal,
    game: PictionaryGameInternal,
    result: "correct" | "timeout"
  ): Promise<void> {
    if (game.type !== "pictionary" || game.status !== "drawing") {
      return;
    }
    this.clearPictionaryTimer(session.sessionId);

    const drawerId = game.drawerId;
    const prompt = game.currentPrompt ?? "";
    const activeTeam = game.activeTeam;
    if (!activeTeam || !drawerId) {
      return;
    }

    if (result === "correct") {
      const teamIds = activeTeam === "A" ? game.teamAIds : game.teamBIds;
      for (const pid of teamIds) {
        const p = session.participants.find((x) => x.id === pid);
        if (p) {
          p.score += 1;
        }
      }
    }

    game.drawCounts[drawerId] = (game.drawCounts[drawerId] ?? 0) + 1;

    const nextTeam = otherPictionaryTeam(activeTeam);
    const now = Date.now();
    game.status = "roundBreak";
    game.revealedPrompt = prompt;
    game.lastRoundResult = result;
    game.roundBreakNextTeam = nextTeam;
    game.roundBreakEndsAt = now + PICTORY_ROUND_BREAK_MS;
    game.currentPrompt = null;
    game.currentClueId = null;
    game.drawerId = null;
    game.activeTeam = null;
    game.roundStartedAt = null;
    game.roundEndsAt = null;
    game.strokes = [];

    session.updatedAt = Date.now();
    await this.persist();
    this.onSessionUpdated?.(session.sessionId);
    this.schedulePictionaryRoundBreakEnd(session.sessionId);
  }

  public async pictionarySetTeams(
    sessionId: string,
    participantId: string,
    teamAIds: string[],
    teamBIds: string[]
  ): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    assertParticipantActiveForGameplay(session, participantId);
    if (!session.participants.some((p) => p.id === participantId && p.isHost)) {
      throw new Error("Only the host can set teams.");
    }
    const game = session.games[0];
    if (game?.type !== "pictionary" || game.status !== "teamSetup") {
      throw new Error("Teams can only be edited during setup.");
    }
    validatePictionaryTeamRoster(session, teamAIds, teamBIds);
    game.teamAIds = [...teamAIds];
    game.teamBIds = [...teamBIds];
    session.updatedAt = Date.now();
    await this.persist();
  }

  public async pictionaryBeginPlay(sessionId: string, participantId: string): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    assertParticipantActiveForGameplay(session, participantId);
    if (!session.participants.some((p) => p.id === participantId && p.isHost)) {
      throw new Error("Only the host can start play.");
    }
    const game = session.games[0];
    if (game?.type !== "pictionary" || game.status !== "teamSetup") {
      throw new Error("Pictionary is not waiting for team setup.");
    }
    validatePictionaryTeamRoster(session, game.teamAIds, game.teamBIds);
    for (const pid of [...game.teamAIds, ...game.teamBIds]) {
      if (game.drawCounts[pid] === undefined) {
        game.drawCounts[pid] = 0;
      }
    }
    this.clearPictionaryTimer(sessionId);
    const firstTeam: "A" | "B" = Math.random() < 0.5 ? "A" : "B";
    this.pictionaryStartDrawingPhase(session, game, firstTeam);
    session.updatedAt = Date.now();
    await this.persist();
    this.schedulePictionaryDrawingDeadline(sessionId);
  }

  public async pictionaryAppendStroke(
    sessionId: string,
    participantId: string,
    stroke: PictionaryStrokePayload
  ): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    assertParticipantActiveForGameplay(session, participantId);
    const game = session.games[0];
    if (game?.type !== "pictionary" || game.status !== "drawing") {
      throw new Error("Drawing is not active.");
    }
    if (game.drawerId !== participantId) {
      throw new Error("Only the drawer can add strokes.");
    }
    if (stroke.points.length > PICTORY_STROKE_MAX_POINTS) {
      throw new Error("Stroke has too many points.");
    }
    if (game.strokes.length >= PICTORY_MAX_STROKES_PER_ROUND) {
      throw new Error("Stroke limit reached for this round.");
    }
    const width = Math.min(48, Math.max(1, Math.round(stroke.width)));
    game.strokes.push({
      id: nanoid(8),
      tool: stroke.tool,
      width,
      points: stroke.points.map((pt) => ({ x: pt.x, y: pt.y }))
    });
    session.updatedAt = Date.now();
    await this.persist();
  }

  public async pictionaryClearCanvas(sessionId: string, participantId: string): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    assertParticipantActiveForGameplay(session, participantId);
    const game = session.games[0];
    if (game?.type !== "pictionary" || game.status !== "drawing") {
      throw new Error("Drawing is not active.");
    }
    if (game.drawerId !== participantId) {
      throw new Error("Only the drawer can clear the canvas.");
    }
    game.strokes = [];
    session.updatedAt = Date.now();
    await this.persist();
  }

  public async pictionaryTeamGuessed(sessionId: string, participantId: string): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    assertParticipantActiveForGameplay(session, participantId);
    const game = session.games[0];
    if (game?.type !== "pictionary" || game.status !== "drawing") {
      throw new Error("Drawing is not active.");
    }
    if (game.drawerId !== participantId) {
      throw new Error("Only the drawer can confirm a correct guess.");
    }
    await this.pictionaryEnterRoundBreak(session, game, "correct");
  }

  public async pictionaryHostSkipRound(sessionId: string, participantId: string): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    assertParticipantActiveForGameplay(session, participantId);
    if (!session.participants.some((p) => p.id === participantId && p.isHost)) {
      throw new Error("Only the host can skip a round.");
    }
    const game = session.games[0];
    if (game?.type !== "pictionary" || game.status !== "drawing") {
      throw new Error("Nothing to skip right now.");
    }
    await this.pictionaryEnterRoundBreak(session, game, "timeout");
  }

  private toPublicState(session: SessionInternal, viewerParticipantId?: string): SessionState {
    const game = session.games[0];
    const base = {
      sessionId: session.sessionId,
      sessionName: session.sessionName,
      joinCode: session.joinCode,
      participants: session.participants.map((p) => ({
        id: p.id,
        displayName: p.displayName,
        score: p.score,
        isHost: p.isHost,
        isActive: participantIsActive(p)
      }))
    };

    if (!game) {
      return { ...base, activeGame: null, gameState: null };
    }

    if (game.type === "hangman") {
      return {
        ...base,
        activeGame: "hangman",
        gameState: {
          type: "hangman",
          state: {
            puzzleCreatorId: game.puzzleCreatorId,
            maskedWord: game.maskedWord,
            guessedLetters: game.guessedLetters,
            wrongGuessCount: game.wrongGuessCount,
            maxWrongGuesses: game.maxWrongGuesses,
            status: game.status,
            revealedWord: game.status === "won" || game.status === "lost" ? game.secretWord : null,
            mode: game.mode,
            currentTurnId: game.currentTurnId,
            activeSolverId: game.activeSolverId,
            activityLog: game.activityLog
          }
        }
      };
    }

    if (game.type === "twoTruthsLie") {
      return {
        ...base,
        activeGame: "twoTruthsLie",
        gameState: {
          type: "twoTruthsLie",
          state: {
            submissions: game.submissions,
            currentPresenterId: game.currentPresenterId,
            votes: game.votes,
            status: game.status
          }
        }
      };
    }

    if (game.type === "trivia") {
      return {
        ...base,
        activeGame: "trivia",
        gameState: {
          type: "trivia",
          state: {
            questionIndex: game.questionIndex,
            totalQuestions: game.totalQuestions,
            activeQuestion: game.activeQuestion,
            answers: game.answers,
            loading: game.loading,
            status: game.status
          }
        }
      };
    }

    if (game.type === "wouldYouRather") {
      const hostView = Boolean(
        viewerParticipantId && session.participants.some((participant) => participant.id === viewerParticipantId && participant.isHost)
      );
      const answeredParticipantIds = activeParticipants(session)
        .filter((participant) => typeof game.responses[participant.id] === "string")
        .map((participant) => participant.id);
      const optionASelectedParticipantIds = activeParticipants(session)
        .filter((participant) => game.responses[participant.id] === "optionA")
        .map((participant) => participant.id);
      const optionBSelectedParticipantIds = activeParticipants(session)
        .filter((participant) => game.responses[participant.id] === "optionB")
        .map((participant) => participant.id);
      const selectedChoice = viewerParticipantId ? game.responses[viewerParticipantId] ?? null : null;
      const approvedSubmissions = game.submissions.filter((submission) => submission.status === "approved");
      const pendingSubmissions = game.submissions.filter((submission) => submission.status === "pending");
      const approvedSubmissionsRemaining = game.inSubmittedRound
        ? Math.max(0, game.totalQuestions - game.questionIndex)
        : approvedSubmissions.length;
      return {
        ...base,
        activeGame: "wouldYouRather",
        gameState: {
          type: "wouldYouRather",
          state: {
            status: game.status,
            totalQuestions: game.totalQuestions,
            questionIndex: game.questionIndex,
            inSubmittedRound: game.inSubmittedRound,
            allowParticipantSubmissions: game.allowParticipantSubmissions,
            activePrompt: game.activePrompt,
            answeredParticipantIds,
            hasAnswered: Boolean(selectedChoice),
            selectedChoice,
            optionASelectedParticipantIds,
            optionBSelectedParticipantIds,
            results: game.results,
            pendingSubmissionsCount: pendingSubmissions.length,
            approvedSubmissionsRemaining,
            hostPendingSubmissions: hostView
              ? pendingSubmissions.map((submission) => ({
                id: submission.id,
                optionA: submission.optionA,
                optionB: submission.optionB,
                submittedByParticipantId: submission.submittedByParticipantId
              }))
              : [],
            hostApprovedSubmissions: hostView
              ? approvedSubmissions.map((submission) => ({
                id: submission.id,
                optionA: submission.optionA,
                optionB: submission.optionB,
                submittedByParticipantId: submission.submittedByParticipantId
              }))
              : []
          }
        }
      };
    }

    if (game.type === "icebreaker") {
      const submittedParticipantIds =
        game.status === "idle" || game.status === "finished" || game.status === "gatheringPrompts"
          ? []
          : session.participants
            .filter((p) => {
              const s = game.privateSubmissions[p.id];
              return Boolean(s && (s.text.trim().length > 0 || s.imageFileId));
            })
            .map((p) => p.id);
      const revealed =
        game.status === "collecting"
          ? []
          : game.revealed.map((r) => ({
            participantId: r.participantId,
            text: r.text,
            imageUrl: r.imageFileId
              ? `/api/sessions/${session.sessionId}/icebreaker/file/${encodeURIComponent(r.imageFileId)}`
              : null
          }));
      const scaffold = {
        questionIndex: game.questionIndex,
        totalQuestions: game.totalQuestions,
        activeQuestion: game.activeQuestion,
        submittedParticipantIds,
        revealed,
        usedQuestionIds: game.usedQuestionIds
      };
      if (game.status === "idle") {
        return {
          ...base,
          activeGame: "icebreaker",
          gameState: {
            type: "icebreaker",
            state: {
              ...scaffold,
              status: "idle" as const
            }
          }
        };
      }
      if (game.status === "gatheringPrompts") {
        const ppp = game.promptsPerParticipant ?? 1;
        const submittedPromptParticipantIds = session.participants
          .filter((p) => {
            const d = game.promptDraftsByParticipant[p.id];
            return (
              d
              && d.length === ppp
              && d.every(
                (t) => t.trim().length > 0 && t.trim().length <= ICEBREAKER_PROMPT_MAX_CHARS
              )
            );
          })
          .map((p) => p.id);
        return {
          ...base,
          activeGame: "icebreaker",
          gameState: {
            type: "icebreaker",
            state: {
              ...scaffold,
              status: "gatheringPrompts" as const,
              promptsPerParticipant: ppp,
              submittedPromptParticipantIds
            }
          }
        };
      }
      return {
        ...base,
        activeGame: "icebreaker",
        gameState: {
          type: "icebreaker",
          state: {
            ...scaffold,
            status: game.status
          }
        }
      };
    }

    if (game.type === "guessWhoSaidIt") {
      const gwsFile = (fileId: string | null): string | null =>
        fileId
          ? `/api/sessions/${session.sessionId}/guess-who-said-it/file/${encodeURIComponent(fileId)}`
          : null;
      const roundFields = {
        questionIndex: game.questionIndex,
        totalQuestions: game.totalQuestions,
        activeQuestion: game.activeQuestion,
        submittedParticipantIds:
          game.status === "idle"
            ? []
            : activeParticipants(session)
                .filter((p) => {
                  const s = game.privateSubmissions[p.id];
                  return Boolean(s && (s.text.trim().length > 0 || s.imageFileId));
                })
                .map((p) => p.id),
        usedQuestionIds: game.usedQuestionIds
      };
      if (game.status === "idle") {
        return {
          ...base,
          activeGame: "guessWhoSaidIt",
          gameState: {
            type: "guessWhoSaidIt",
            state: {
              ...roundFields,
              status: "idle" as const
            }
          }
        };
      }
      if (game.status === "collecting") {
        return {
          ...base,
          activeGame: "guessWhoSaidIt",
          gameState: {
            type: "guessWhoSaidIt",
            state: {
              ...roundFields,
              status: "collecting" as const
            }
          }
        };
      }
      if (game.status === "votingReady") {
        return {
          ...base,
          activeGame: "guessWhoSaidIt",
          gameState: {
            type: "guessWhoSaidIt",
            state: {
              ...roundFields,
              status: "votingReady" as const
            }
          }
        };
      }
      if (game.status === "voting" && game.votingPrompt) {
        const votedParticipantIds = Object.keys(game.votes);
        const allVotesIn = this.guessWhoAllVotesIn(session, game);
        const hasVoted = Boolean(
          viewerParticipantId && game.votes[viewerParticipantId] !== undefined
        );
        const filterViewer =
          viewerParticipantId && session.participants.some((x) => x.id === viewerParticipantId)
            ? viewerParticipantId
            : null;
        const pr = game.votingPrompt;
        const visibleSlots =
          filterViewer === null
            ? []
            : pr.slots.filter((sl) => sl.authorId !== filterViewer);
        return {
          ...base,
          activeGame: "guessWhoSaidIt",
          gameState: {
            type: "guessWhoSaidIt",
            state: {
              status: "voting" as const,
              usedQuestionIds: game.usedQuestionIds,
              currentQuestionIndex: game.votingQuestionIndex,
              totalQuestions: game.totalQuestions,
              prompt: {
                question: pr.question,
                slots: visibleSlots.map((sl) => ({
                  slotId: sl.slotId,
                  text: sl.text,
                  imageUrl: gwsFile(sl.imageFileId)
                }))
              },
              votedParticipantIds,
              allVotesIn,
              hasVoted
            }
          }
        };
      }
      if (game.status === "promptReveal" && game.promptRevealSnapshot) {
        const snap = game.promptRevealSnapshot;
        const reveal = {
          question: snap.question,
          revealedAnswers: snap.slots.map((sl) => ({
            slotId: sl.slotId,
            authorId: sl.authorId,
            text: sl.text,
            imageUrl: gwsFile(sl.imageFileId)
          })),
          byVoter: snap.byVoter.map((bv) => ({
            voterId: bv.voterId,
            rows: bv.rows.map((r) => ({
              slotId: r.slotId,
              guessedParticipantId: r.guessedParticipantId,
              actualAuthorId: r.actualAuthorId,
              correct: r.correct,
              pointsEarned: r.pointsEarned
            })),
            pointsThisPrompt: bv.pointsThisPrompt
          }))
        };
        return {
          ...base,
          activeGame: "guessWhoSaidIt",
          gameState: {
            type: "guessWhoSaidIt",
            state: {
              status: "promptReveal" as const,
              usedQuestionIds: game.usedQuestionIds,
              currentQuestionIndex: game.votingQuestionIndex,
              totalQuestions: game.totalQuestions,
              reveal
            }
          }
        };
      }
      if (game.status === "roundSummary") {
        const standings = session.participants
          .map((p) => ({
            participantId: p.id,
            correctGuesses: game.cumulativeCorrectByParticipant[p.id] ?? 0
          }))
          .sort((a, b) => b.correctGuesses - a.correctGuesses || a.participantId.localeCompare(b.participantId));
        return {
          ...base,
          activeGame: "guessWhoSaidIt",
          gameState: {
            type: "guessWhoSaidIt",
            state: {
              status: "roundSummary" as const,
              usedQuestionIds: game.usedQuestionIds,
              totalQuestions: game.totalQuestions,
              standings
            }
          }
        };
      }
      throw new Error(`Guess Who Said It could not be projected (status=${game.status}).`);
    }

    if (game.type === "guessTheImage") {
      const imageUrl =
        game.imageFileId
          ? `/api/sessions/${session.sessionId}/guess-the-image/file/${encodeURIComponent(game.imageFileId)}`
          : null;
      if (game.status === "setup") {
        const everyonePeers = activeParticipants(session).map((p) => ({
          participantId: p.id,
          configured: Boolean(game.participantSetups[p.id]?.configured)
        }));
        const everyoneAllConfigured = guessImageEveryoneAllConfigured(session, game);
        let everyoneMySetup: {
          imageUrl: string | null;
          descriptions: [string, string, string, string];
          correctIndex: number;
          revealDurationMs: number;
          configured: boolean;
        } | null = null;
        if (
          viewerParticipantId
          && session.participants.some((participant) => participant.id === viewerParticipantId)
        ) {
          const mine =
            game.participantSetups[viewerParticipantId] ?? freshGuessImageParticipantSlot();
          everyoneMySetup = {
            imageUrl: mine.imageFileId
              ? `/api/sessions/${session.sessionId}/guess-the-image/file/${encodeURIComponent(mine.imageFileId)}`
              : null,
            descriptions: [...mine.canonicalDescriptions],
            correctIndex: mine.canonicalCorrectIndex,
            revealDurationMs: mine.revealDurationMs,
            configured: mine.configured
          };
        }
        if (game.setupMode === "everyone") {
          return {
            ...base,
            activeGame: "guessTheImage",
            gameState: {
              type: "guessTheImage",
              state: {
                status: "setup",
                setupMode: "everyone",
                setupParticipantId: game.setupParticipantId,
                selectedRoundParticipantId: game.selectedRoundParticipantId,
                everyoneBetweenRounds: game.everyoneBetweenRounds === true,
                everyonePeers,
                everyoneMySetup,
                everyoneAllConfigured,
                imageUrl: null,
                descriptions: ["", "", "", ""] as [string, string, string, string],
                correctIndex: 0,
                revealDurationMs: game.revealDurationMs,
                configured: false
              }
            }
          };
        }
        return {
          ...base,
          activeGame: "guessTheImage",
          gameState: {
            type: "guessTheImage",
            state: {
              status: "setup",
              setupMode: "single",
              setupParticipantId: game.setupParticipantId,
              selectedRoundParticipantId: null,
              everyoneBetweenRounds: false,
              everyonePeers: [],
              everyoneMySetup: null,
              everyoneAllConfigured: false,
              imageUrl,
              descriptions: [...game.canonicalDescriptions],
              correctIndex: game.canonicalCorrectIndex,
              revealDurationMs: game.revealDurationMs,
              configured: game.configured
            }
          }
        };
      }
      if (game.status === "playing") {
        const options = this.guessTheImageOptionsFrom(game);
        const guesserIds = this.guessTheImageGuesserIds(session, game);
        const submittedParticipantIds = Object.keys(game.locks).filter((id) => guesserIds.includes(id));
        return {
          ...base,
          activeGame: "guessTheImage",
          gameState: {
            type: "guessTheImage",
            state: {
              status: "playing",
              setupParticipantId: game.setupParticipantId,
              imageUrl: imageUrl ?? "",
              options: [...options],
              roundStartedAt: game.roundStartedAt ?? 0,
              revealDurationMs: game.revealDurationMs,
              submittedParticipantIds
            }
          }
        };
      }
      const options = this.guessTheImageOptionsFrom(game);
      const correctDisplayIndex = this.guessTheImageCorrectDisplayIndex(game);
      const everyoneFinished = game.setupMode === "everyone";
      const finishedResults = (game.results ?? []).map((r) => ({
        participantId: r.participantId,
        choiceDisplayIndex: r.choiceDisplayIndex,
        correct: r.correct,
        elapsedMs: r.elapsedMs,
        pointsAwarded: r.pointsAwarded
      }));
      const finishedBase = {
        status: "finished" as const,
        setupMode: everyoneFinished ? ("everyone" as const) : ("single" as const),
        setupParticipantId: game.setupParticipantId,
        imageUrl,
        options: [...options],
        correctDisplayIndex,
        results: finishedResults,
        revealDurationMs: game.revealDurationMs,
        roundStartedAt: game.roundStartedAt ?? 0
      };
      if (!everyoneFinished) {
        return {
          ...base,
          activeGame: "guessTheImage",
          gameState: {
            type: "guessTheImage",
            state: finishedBase
          }
        };
      }
      const everyonePeers = activeParticipants(session).map((p) => ({
        participantId: p.id,
        configured: Boolean(game.participantSetups[p.id]?.configured)
      }));
      const everyoneAllConfigured = guessImageEveryoneAllConfigured(session, game);
      let everyoneMySetup: {
        imageUrl: string | null;
        descriptions: [string, string, string, string];
        correctIndex: number;
        revealDurationMs: number;
        configured: boolean;
      } | null = null;
      if (
        viewerParticipantId
        && session.participants.some((participant) => participant.id === viewerParticipantId)
      ) {
        const mine =
          game.participantSetups[viewerParticipantId] ?? freshGuessImageParticipantSlot();
        everyoneMySetup = {
          imageUrl: mine.imageFileId
            ? `/api/sessions/${session.sessionId}/guess-the-image/file/${encodeURIComponent(mine.imageFileId)}`
            : null,
          descriptions: [...mine.canonicalDescriptions],
          correctIndex: mine.canonicalCorrectIndex,
          revealDurationMs: mine.revealDurationMs,
          configured: mine.configured
        };
      }
      return {
        ...base,
        activeGame: "guessTheImage",
        gameState: {
          type: "guessTheImage",
          state: {
            ...finishedBase,
            everyoneBetweenRounds: game.everyoneBetweenRounds === true,
            selectedRoundParticipantId: game.selectedRoundParticipantId ?? null,
            everyonePeers,
            everyoneMySetup,
            everyoneAllConfigured
          }
        }
      };
    }

    if (game.type === "twentyQuestions") {
      if (game.status === "waitingForItem") {
        return {
          ...base,
          activeGame: "twentyQuestions",
          gameState: {
            type: "twentyQuestions",
            state: {
              status: "waitingForItem",
              itemSelectorId: game.itemSelectorId,
              maxQuestions: game.maxQuestions
            }
          }
        };
      }
      if (game.status === "playing") {
        return {
          ...base,
          activeGame: "twentyQuestions",
          gameState: {
            type: "twentyQuestions",
            state: {
              status: "playing",
              itemSelectorId: game.itemSelectorId,
              maxQuestions: game.maxQuestions,
              questionsUsed: game.questionsUsed,
              currentAskerId: game.currentAskerId ?? "",
              questionLog: game.questionLog.map((e) => ({
                id: e.id,
                participantId: e.participantId,
                text: e.text,
                askedAt: e.askedAt,
                answer: e.answer
              })),
              questionDraft: game.questionDraft
            }
          }
        };
      }
      const revealedItem = game.secretItem ?? "";
      return {
        ...base,
        activeGame: "twentyQuestions",
        gameState: {
          type: "twentyQuestions",
          state: {
            status: "finished",
            itemSelectorId: game.itemSelectorId,
            maxQuestions: game.maxQuestions,
            questionsUsed: game.questionsUsed,
            outcome: game.outcome ?? "selector",
            revealedItem,
            questionLog: game.questionLog.map((e) => ({
              id: e.id,
              participantId: e.participantId,
              text: e.text,
              askedAt: e.askedAt,
              answer: e.answer === "yes" || e.answer === "no" ? e.answer : "no"
            }))
          }
        }
      };
    }

    if (game.type === "captionThis") {
      const capImageUrl = (fileId: string | null): string | null =>
        fileId
          ? `/api/sessions/${session.sessionId}/caption-this/file/${encodeURIComponent(fileId)}`
          : null;

      if (game.status === "waitingForImage") {
        return {
          ...base,
          activeGame: "captionThis",
          gameState: {
            type: "captionThis",
            state: {
              status: "waitingForImage",
              imageProviderId: game.imageProviderId,
              roundNumber: game.roundNumber
            }
          }
        };
      }

      if (game.status === "collectingCaptions") {
        const submittedCaptionParticipantIds = activeParticipants(session)
          .filter((p) => {
            const c = game.captions[p.id];
            return typeof c === "string" && c.trim().length > 0;
          })
          .map((p) => p.id);
        const allCaptionsIn = activeParticipants(session).every((p) => {
          const c = game.captions[p.id];
          return typeof c === "string" && c.trim().length > 0;
        });
        return {
          ...base,
          activeGame: "captionThis",
          gameState: {
            type: "captionThis",
            state: {
              status: "collectingCaptions",
              imageProviderId: game.imageProviderId,
              imageUrl: capImageUrl(game.imageFileId) ?? "",
              roundNumber: game.roundNumber,
              submittedCaptionParticipantIds,
              allCaptionsIn
            }
          }
        };
      }

      if (game.status === "voting") {
        const byId = new Map(game.entries.map((e) => [e.id, e] as const));
        const displayEntries = game.displayOrder
          .map((id) => byId.get(id))
          .filter((e): e is CaptionThisEntryInternal => Boolean(e))
          .map((e) => ({ entryId: e.id, text: e.text }));
        const myEntry =
          viewerParticipantId && session.participants.some((p) => p.id === viewerParticipantId)
            ? game.entries.find((e) => e.authorId === viewerParticipantId)?.id ?? null
            : null;
        const votedParticipantIds = Object.keys(game.votes);
        const hasVoted = Boolean(viewerParticipantId && game.votes[viewerParticipantId] !== undefined);
        const allVotesIn = activeParticipants(session).every((p) => game.votes[p.id] !== undefined);
        return {
          ...base,
          activeGame: "captionThis",
          gameState: {
            type: "captionThis",
            state: {
              status: "voting",
              imageProviderId: game.imageProviderId,
              imageUrl: capImageUrl(game.imageFileId) ?? "",
              roundNumber: game.roundNumber,
              displayEntries,
              myEntryId: myEntry,
              votedParticipantIds,
              hasVoted,
              allVotesIn
            }
          }
        };
      }

      const tallyMap = new Map<string, number>();
      for (const e of game.entries) {
        tallyMap.set(e.id, 0);
      }
      for (const eid of Object.values(game.votes)) {
        tallyMap.set(eid, (tallyMap.get(eid) ?? 0) + 1);
      }
      const tallies = game.entries.map((e) => ({
        entryId: e.id,
        authorId: e.authorId,
        text: e.text,
        voteCount: tallyMap.get(e.id) ?? 0
      }));
      const maxVotes = tallies.length === 0 ? 0 : Math.max(...tallies.map((t) => t.voteCount));
      const winnerEntryIds = tallies.filter((t) => t.voteCount === maxVotes).map((t) => t.entryId);
      return {
        ...base,
        activeGame: "captionThis",
        gameState: {
          type: "captionThis",
          state: {
            status: "results",
            imageProviderId: game.imageProviderId,
            imageUrl: capImageUrl(game.imageFileId) ?? "",
            roundNumber: game.roundNumber,
            tallies,
            winnerEntryIds
          }
        }
      };
    }

    if (game.type === "pictionary") {
      if (game.status === "teamSetup") {
        return {
          ...base,
          activeGame: "pictionary",
          gameState: {
            type: "pictionary",
            state: {
              status: "teamSetup",
              roundDurationMs: game.roundDurationMs,
              teamAIds: [...game.teamAIds],
              teamBIds: [...game.teamBIds]
            }
          }
        };
      }
      if (game.status === "drawing") {
        const showPrompt = Boolean(
          viewerParticipantId && game.drawerId && viewerParticipantId === game.drawerId
        );
        return {
          ...base,
          activeGame: "pictionary",
          gameState: {
            type: "pictionary",
            state: {
              status: "drawing",
              roundDurationMs: game.roundDurationMs,
              teamAIds: [...game.teamAIds],
              teamBIds: [...game.teamBIds],
              activeTeam: game.activeTeam!,
              drawerId: game.drawerId!,
              roundStartedAt: game.roundStartedAt!,
              roundEndsAt: game.roundEndsAt!,
              strokes: game.strokes.map((s) => ({
                id: s.id,
                tool: s.tool,
                width: s.width,
                points: s.points.map((p) => ({ x: p.x, y: p.y }))
              })),
              myPrompt: showPrompt ? game.currentPrompt : null
            }
          }
        };
      }
      const lastResult = game.lastRoundResult === "correct" ? "correct" : "timeout";
      return {
        ...base,
        activeGame: "pictionary",
        gameState: {
          type: "pictionary",
          state: {
            status: "roundBreak",
            roundDurationMs: game.roundDurationMs,
            teamAIds: [...game.teamAIds],
            teamBIds: [...game.teamBIds],
            revealedPrompt: game.revealedPrompt ?? "",
            lastResult,
            nextRoundStartsAt: game.roundBreakEndsAt ?? Date.now(),
            nextTeam: game.roundBreakNextTeam!
          }
        }
      };
    }

    if (game.type === "catchPhrase") {
      if (game.status === "teamSetup") {
        return {
          ...base,
          activeGame: "catchPhrase",
          gameState: {
            type: "catchPhrase",
            state: {
              status: "teamSetup",
              teamAIds: [...game.teamAIds],
              teamBIds: [...game.teamBIds]
            }
          }
        };
      }

      if (game.status === "playing") {
        const holderId = this.catchPhraseCurrentHolderId(game) ?? "";
        if (game.roundPhase === "awaitingRoundStart") {
          return {
            ...base,
            activeGame: "catchPhrase",
            gameState: {
              type: "catchPhrase",
              state: {
                status: "playing",
                roundPhase: "awaitingRoundStart",
                teamAIds: [...game.teamAIds],
                teamBIds: [...game.teamBIds],
                teamScores: { ...game.teamScores },
                holderId,
                passOrder: [...game.passOrder]
              }
            }
          };
        }

        const showPhrase = Boolean(viewerParticipantId && holderId && viewerParticipantId === holderId);
        const roundStartedAt = game.roundStartedAt ?? Date.now();
        const roundEndsAt = game.roundEndsAt ?? roundStartedAt;
        let slowPhaseEndsAt = game.slowPhaseEndsAt;
        let mediumPhaseEndsAt = game.mediumPhaseEndsAt;
        if (
          slowPhaseEndsAt === null
          || mediumPhaseEndsAt === null
          || !(roundStartedAt < roundEndsAt)
        ) {
          const span = Math.max(1, roundEndsAt - roundStartedAt);
          slowPhaseEndsAt = roundStartedAt + Math.floor(span / 3);
          mediumPhaseEndsAt = roundStartedAt + Math.floor((2 * span) / 3);
        }
        return {
          ...base,
          activeGame: "catchPhrase",
          gameState: {
            type: "catchPhrase",
            state: {
              status: "playing",
              roundPhase: "live",
              teamAIds: [...game.teamAIds],
              teamBIds: [...game.teamBIds],
              teamScores: { ...game.teamScores },
              holderId,
              passOrder: [...game.passOrder],
              roundStartedAt,
              slowPhaseEndsAt,
              mediumPhaseEndsAt,
              roundEndsAt,
              myPhrase: showPhrase ? game.currentPhrase : null
            }
          }
        };
      }

      return {
        ...base,
        activeGame: "catchPhrase",
        gameState: {
          type: "catchPhrase",
          state: {
            status: "finished",
            teamAIds: [...game.teamAIds],
            teamBIds: [...game.teamBIds],
            teamScores: { ...game.teamScores },
            winnerTeam: game.winnerTeam ?? (game.teamScores.A >= game.teamScores.B ? "A" : "B")
          }
        }
      };
    }

    if (game.type === "applesToApples") {
      const judgeId = applesJudgeId(game);
      const viewerId = viewerParticipantId ?? "";

      if (game.status === "finished") {
        return {
          ...base,
          activeGame: "applesToApples",
          gameState: {
            type: "applesToApples",
            state: {
              status: "finished",
              mode: game.mode
            }
          }
        };
      }

      if (game.status === "roundResult") {
        const canContinue = !(
          game.mode === "finite" && game.roundNumber >= APPLES_TO_APPLES_FINITE_ROUNDS
        );
        const revealedSubmissions = (game.roundResultReveal ?? []).map((row) => ({
          entryId: row.entryId,
          participantId: row.authorId,
          text: row.text
        }));
        return {
          ...base,
          activeGame: "applesToApples",
          gameState: {
            type: "applesToApples",
            state: {
              status: "roundResult",
              mode: game.mode,
              topicText: game.topicText,
              winningEntryId: game.roundWinnerEntryId ?? "",
              winnerParticipantId: game.roundWinnerParticipantId ?? "",
              winningText: game.roundWinningText ?? "",
              roundNumber: game.roundNumber,
              revealedSubmissions,
              canContinue
            }
          }
        };
      }

      if (game.status === "judging") {
        const isJudge = viewerId === judgeId;
        const byEntryId = new Map(game.entries.map((e) => [e.entryId, e] as const));
        const options = game.displayOrder
          .map((id) => byEntryId.get(id))
          .filter((e): e is ApplesToApplesEntryInternal => Boolean(e))
          .map((e) => ({
            entryId: e.entryId,
            text: getApplesResponseText(e.cardId) ?? ""
          }));
        return {
          ...base,
          activeGame: "applesToApples",
          gameState: {
            type: "applesToApples",
            state: {
              status: "judging",
              mode: game.mode,
              topicText: game.topicText,
              topicId: game.topicId,
              judgeId,
              roundNumber: game.roundNumber,
              isJudge,
              anonymousOptions: options,
              waitingForJudge: !isJudge
            }
          }
        };
      }

      const nonJudges = applesNonJudgeIds(session, game);
      const submitted = nonJudges.filter((id) => game.submissions[id] !== undefined);
      const isJudge = viewerId === judgeId;
      const handIds = !isJudge && viewerId ? (game.hands[viewerId] ?? []) : [];
      const myHand = handIds
        .map((id) => {
          const text = getApplesResponseText(id);
          return text ? { id, text } : null;
        })
        .filter((c): c is { id: string; text: string } => c !== null);

      return {
        ...base,
        activeGame: "applesToApples",
        gameState: {
          type: "applesToApples",
          state: {
            status: "collecting",
            mode: game.mode,
            topicText: game.topicText,
            topicId: game.topicId,
            judgeId,
            roundNumber: game.roundNumber,
            isJudge,
            submittedNonJudgeIds: submitted,
            allSubmissionsIn: submitted.length === nonJudges.length && nonJudges.length > 0,
            myHand: isJudge ? null : myHand
          }
        }
      };
    }

    if (game.type === "madlibs") {
      const prompts = madlibsBlankPrompts(game.template);
      if (game.status === "filling") {
        const currentPrompt = prompts[game.currentBlankIndex];
        const currentFillerId = game.fillerParticipantIds[game.currentBlankIndex];
        return {
          ...base,
          activeGame: "madlibs",
          gameState: {
            type: "madlibs",
            state: {
              status: "filling",
              templateId: game.template.id,
              templateTitle: game.template.title,
              blankCount: prompts.length,
              currentBlankIndex: game.currentBlankIndex,
              currentPrompt: currentPrompt ?? "noun",
              currentFillerId: currentFillerId ?? "",
              filledCount: game.words.filter((word) => typeof word === "string" && word.trim().length > 0).length
            }
          }
        };
      }

      const filledWords = game.words.map((word) => word ?? "");
      const submissions = prompts.map((prompt, index) => ({
        participantId: game.fillerParticipantIds[index] ?? "",
        prompt,
        word: filledWords[index] ?? ""
      }));
      const activeIds = activeParticipants(session).map((participant) => participant.id);
      const readerParticipantId = game.readerParticipantId ?? activeIds[0] ?? "";
      const canViewStory = Boolean(viewerParticipantId && viewerParticipantId === readerParticipantId);
      return {
        ...base,
        activeGame: "madlibs",
        gameState: {
          type: "madlibs",
          state: {
            status: "reading",
            templateId: game.template.id,
            templateTitle: game.template.title,
            filledStory: canViewStory ? fillMadlibTemplate(game.template, filledWords) : null,
            readerParticipantId,
            submissions: canViewStory ? submissions : []
          }
        }
      };
    }

    if (game.type === "bs") {
      const viewerId = viewerParticipantId ?? "";
      if (game.status === "finished") {
        return {
          ...base,
          activeGame: "bs",
          gameState: {
            type: "bs",
            state: {
              status: "finished",
              scores: game.finalScores
            }
          }
        };
      }
      const currentPlayerId = game.playerOrder[game.currentPlayerIndex] ?? "";
      const handCounts: Record<string, number> = {};
      for (const pid of game.playerOrder) {
        handCounts[pid] = (game.hands[pid] ?? []).length;
      }
      const commonState = {
        currentPlayerId,
        currentRank: bsCurrentRank(game),
        handCounts,
        myHand: viewerId ? [...(game.hands[viewerId] ?? [])] : [],
        discardCount: game.discardPile.length,
        finishedPlayerIds: [...game.finishedPlayerIds]
      };
      if (game.status === "playing") {
        return {
          ...base,
          activeGame: "bs",
          gameState: {
            type: "bs",
            state: {
              status: "playing",
              ...commonState
            }
          }
        };
      }
      if (game.status === "challenging") {
        return {
          ...base,
          activeGame: "bs",
          gameState: {
            type: "bs",
            state: {
              status: "challenging",
              ...commonState,
              playedCount: game.pendingPlayedCards.length,
              believedParticipantIds: [...game.believedParticipantIds],
              calledBsParticipantId: null
            }
          }
        };
      }
      return {
        ...base,
        activeGame: "bs",
        gameState: {
          type: "bs",
          state: {
            status: "challenged",
            ...commonState,
            playedCount: game.pendingPlayedCards.length,
            believedParticipantIds: [...game.believedParticipantIds],
            calledBsParticipantId: game.calledBsParticipantId ?? "",
            revealedCards: [...game.pendingPlayedCards]
          }
        }
      };
    }

    if (game.type === "yahtzee") {
      if (game.status === "finished") {
        const sheets: Record<string, YahtzeeSheetRow[]> = {};
        for (const pid of game.playerOrder) {
          sheets[pid] = [...(game.sheetsByParticipant[pid] ?? [])];
        }
        return {
          ...base,
          activeGame: "yahtzee",
          gameState: {
            type: "yahtzee",
            state: {
              status: "finished",
              mode: game.mode,
              playerOrder: [...game.playerOrder],
              sheetsByParticipant: sheets,
              yahtzeeGrandTotals: { ...(game.yahtzeeGrandTotals ?? {}) },
              placementAwards: { ...(game.placementAwards ?? {}) },
              winnerParticipantId: game.winnerParticipantId ?? ""
            }
          }
        };
      }
      const currentPlayerId = game.playerOrder[game.currentPlayerIndex] ?? "";
      const sheetsClone: Record<string, YahtzeeSheetRow[]> = {};
      for (const pid of game.playerOrder) {
        sheetsClone[pid] = [...(game.sheetsByParticipant[pid] ?? [])];
      }
      const latestYahtzee =
        game.latestYahtzee
        && Date.now() - game.latestYahtzee.createdAtMs <= 3_000
        && game.playerOrder.includes(game.latestYahtzee.participantId)
          ? { ...game.latestYahtzee }
          : null;
      if (game.mode === "simultaneous") {
        const viewerId = viewerParticipantId ?? game.playerOrder[0] ?? "";
        const dice = game.diceByParticipant?.[viewerId] ?? game.dice;
        const held = game.heldByParticipant?.[viewerId] ?? [false, false, false, false, false];
        const rollsUsed = game.rollsUsedByParticipant?.[viewerId] ?? 1;
        const pendingCategory = game.pendingCategoryByParticipant?.[viewerId] ?? null;
        return {
          ...base,
          activeGame: "yahtzee",
          gameState: {
            type: "yahtzee",
            state: {
              status: "playing",
              mode: "simultaneous",
              playerOrder: [...game.playerOrder],
              dice: [...dice] as [number, number, number, number, number],
              held: [...held] as [boolean, boolean, boolean, boolean, boolean],
              rollsUsed,
              pendingCategory,
              sheetsByParticipant: sheetsClone,
              latestYahtzee
            }
          }
        };
      }
      return {
        ...base,
        activeGame: "yahtzee",
        gameState: {
          type: "yahtzee",
          state: {
            status: "playing",
            mode: "turns",
            playerOrder: [...game.playerOrder],
            currentPlayerId,
            dice: [...game.dice] as [number, number, number, number, number],
            held: [...game.held] as [boolean, boolean, boolean, boolean, boolean],
            rollsUsed: game.rollsUsed,
            pendingCategory: game.pendingCategory,
            sheetsByParticipant: sheetsClone,
            latestYahtzee
          }
        }
      };
    }

    if (game.type === "scattergories") {
      const setupFields = {
        listId: game.listId,
        listTitle: game.listTitle,
        prompts: [...game.prompts],
        letter: game.letter,
        answerDurationMs: game.answerDurationMs,
        usedListIds: [...game.usedListIds],
        usedLetters: [...game.usedLetters]
      };
      if (game.status === "idle") {
        return {
          ...base,
          activeGame: "scattergories",
          gameState: {
            type: "scattergories",
            state: {
              ...setupFields,
              status: "idle" as const
            }
          }
        };
      }
      if (game.status === "countdown" && game.letter && game.countdownEndsAt !== null) {
        return {
          ...base,
          activeGame: "scattergories",
          gameState: {
            type: "scattergories",
            state: {
              ...setupFields,
              letter: game.letter,
              status: "countdown" as const,
              countdownEndsAt: game.countdownEndsAt
            }
          }
        };
      }
      if (game.status === "answering" && game.letter && game.roundEndsAt !== null) {
        const maskedAnswers: Record<string, string[]> = {};
        if (viewerParticipantId) {
          maskedAnswers[viewerParticipantId] =
            game.answers[viewerParticipantId] ?? this.scattergoriesEmptyAnswers(game.prompts.length);
        }
        return {
          ...base,
          activeGame: "scattergories",
          gameState: {
            type: "scattergories",
            state: {
              ...setupFields,
              letter: game.letter,
              status: "answering" as const,
              roundEndsAt: game.roundEndsAt,
              answers: maskedAnswers
            }
          }
        };
      }
      if (game.status === "reviewing" && game.letter) {
        const roster = activeParticipants(session);
        const revealedAnswers = roster.map((p) => ({
          participantId: p.id,
          text: game.answers[p.id]?.[game.currentPromptIndex] ?? "",
          isDuplicate: this.scattergoriesIsDuplicateAnswer(game, p.id, game.currentPromptIndex)
        }));
        const promptVerdicts = game.verdictsByPrompt[game.currentPromptIndex] ?? {};
        const verdicts: Record<string, "valid" | "invalid" | null> = {};
        for (const p of roster) {
          const v = promptVerdicts[p.id];
          verdicts[p.id] = v === "valid" || v === "invalid" ? v : null;
        }
        return {
          ...base,
          activeGame: "scattergories",
          gameState: {
            type: "scattergories",
            state: {
              ...setupFields,
              letter: game.letter,
              status: "reviewing" as const,
              currentPromptIndex: game.currentPromptIndex,
              revealedAnswers,
              verdicts
            }
          }
        };
      }
      if (game.status === "roundComplete" && game.letter) {
        const roundScores = activeParticipants(session).map((p) => ({
          participantId: p.id,
          pointsThisRound: game.roundScoreDelta[p.id] ?? 0
        }));
        roundScores.sort((a, b) => b.pointsThisRound - a.pointsThisRound);
        return {
          ...base,
          activeGame: "scattergories",
          gameState: {
            type: "scattergories",
            state: {
              ...setupFields,
              letter: game.letter,
              status: "roundComplete" as const,
              roundScores
            }
          }
        };
      }
      throw new Error(`Invalid scattergories phase: ${game.status}`);
    }

    if (game.type === "uno") {
      const viewerId = viewerParticipantId ?? "";
      if (game.status === "finished") {
        return {
          ...base,
          activeGame: "uno",
          gameState: {
            type: "uno",
            state: {
              status: "finished",
              winnerParticipantId: game.winnerParticipantId ?? ""
            }
          }
        };
      }
      const topDiscard = game.discardPile[game.discardPile.length - 1]!;
      const currentPlayerId = game.playerOrder[game.currentPlayerIndex] ?? "";
      const handCounts: Record<string, number> = {};
      for (const pid of game.playerOrder) {
        handCounts[pid] = (game.hands[pid] ?? []).length;
      }
      const myHand = viewerId ? [...(game.hands[viewerId] ?? [])] : [];
      return {
        ...base,
        activeGame: "uno",
        gameState: {
          type: "uno",
          state: {
            status: "playing",
            currentPlayerId,
            direction: game.direction,
            activeColor: game.activeColor,
            topDiscard,
            handCounts,
            myHand,
            drawPileCount: game.drawPile.length,
            unoCatchOpenFor: game.unoCatchOpenFor,
            unoCatchAllowedAfterMs: game.unoCatchAllowedAfterMs,
            unoAnnouncedParticipantId: game.unoAnnouncedParticipantId,
            currentHasDrawn: game.pendingDrawnCardId !== null
          }
        }
      };
    }

    const _never: never = game;
    throw new Error(`Unknown game type: ${(_never as GameInternal).type}`);
  }
}

export const createSessionService = (): SessionService => {
  const dataDir = process.env.DATA_DIR ?? "./data";
  const store = new FileStore<PersistedState>(`${dataDir}/sessions.json`);
  return new SessionService(store, createTriviaQuestionLoader(), dataDir);
};
