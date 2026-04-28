import { nanoid } from "nanoid";
import {
  CAPTION_THIS_MAX_CHARS,
  ICEBREAKER_PROMPT_MAX_CHARS,
  TWENTY_QUESTIONS_ITEM_MAX_CHARS,
  TWENTY_QUESTIONS_QUESTION_MAX_CHARS,
  type GameStartOptions,
  type GameType,
  type HangmanActivity,
  type HangmanMode,
  type SessionState,
  type TriviaLoadingState,
  type TriviaQuestion
} from "../../shared/contracts";
import { pickIcebreakerQuestions } from "./icebreakerQuestionLoader";
import { purgeAllIcebreakerSessionUploads, purgeIcebreakerQuestionUploads } from "./icebreakerUploads";
import {
  deleteCaptionThisStoredFile,
  purgeAllCaptionThisSessionUploads
} from "./captionThisUploads";
import {
  deleteGuessTheImageStoredFile,
  purgeAllGuessTheImageSessionUploads
} from "./guessTheImageUploads";
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

type GameInternal =
  | HangmanGameInternal
  | TwoTruthsGameInternal
  | TriviaGameInternal
  | IcebreakerGameInternal
  | GuessTheImageGameInternal
  | TwentyQuestionsGameInternal
  | CaptionThisGameInternal;

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
): ParticipantInternal[] => session.participants.filter((p) => p.id !== game.puzzleCreatorId);

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

const ensureGameShape = (
  game: GameInternal & {
    mode?: HangmanMode;
    usedQuestionIds?: string[];
    loading?: TriviaLoadingState | null;
    totalQuestions?: number;
    privateSubmissions?: Record<string, { text: string; imageFileId: string | null }>;
    revealed?: IcebreakerRevealedInternal[];
  }
): GameInternal => {
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
  return { ...game, id: game.id ?? nanoid(6) };
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

const twentyQuestionsGuesserIds = (session: SessionInternal, game: TwentyQuestionsGameInternal): string[] =>
  session.participants.filter((p) => p.id !== game.itemSelectorId).map((p) => p.id);

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
  Object.fromEntries(session.participants.map((p) => [p.id, freshGuessImageParticipantSlot()]));

const guessImageEveryoneAllConfigured = (
  session: SessionInternal,
  game: GuessTheImageGameInternal
): boolean =>
  session.participants.length > 0 &&
  session.participants.every((p) => Boolean(game.participantSetups[p.id]?.configured));

export class SessionService {
  private sessions = new Map<string, SessionInternal>();
  private readonly store: FileStore<PersistedState>;
  private readonly triviaQuestionLoader: TriviaQuestionLoader;
  private readonly dataDirectory: string;
  private onSessionUpdated?: (sessionId: string) => void;
  private readonly guessImageResolveTimers = new Map<string, ReturnType<typeof setTimeout>>();

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
    const game = session.games[0];
    if (game?.type !== "icebreaker" || game.status !== "collecting") {
      throw new Error("Icebreaker is not accepting uploads.");
    }
    if (!session.participants.some((p) => p.id === participantId)) {
      throw new Error("Participant is not in this session.");
    }
    return { questionIndex: game.questionIndex };
  }

  public assertGuessTheImageUploadAllowed(sessionId: string, participantId: string): void {
    const session = this.getSessionOrThrow(sessionId);
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
      if (game.status !== "setup") {
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
          updatedAt: session.updatedAt ?? Date.now()
        };
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
          for (const p of s.participants) {
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
      participants: [{ id: participantId, displayName, isHost: true, score: 0 }],
      games: [],
      updatedAt: Date.now()
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
    if (!existing) {
      session.participants.push({
        id: participantId,
        displayName,
        isHost: false,
        score: 0
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
    return this.toPublicState(session, viewerParticipantId);
  }

  public isHost(sessionId: string, participantId: string): boolean {
    const session = this.getSessionOrThrow(sessionId);
    return Boolean(session.participants.find((participant) => participant.id === participantId && participant.isHost));
  }

  public async startGame(
    sessionId: string,
    game: GameType,
    options: GameStartOptions = {}
  ): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    const previousGame = session.games[0];
    if (previousGame?.type === "guessTheImage") {
      this.clearGuessImageTimer(sessionId);
      await purgeAllGuessTheImageSessionUploads(this.dataDirectory, sessionId);
    }
    if (previousGame?.type === "captionThis") {
      await purgeAllCaptionThisSessionUploads(this.dataDirectory, sessionId);
    }
    const previousTrivia = session.games.find((entry): entry is TriviaGameInternal => entry.type === "trivia");
    session.updatedAt = Date.now();
    let next: GameInternal;
    if (game === "hangman") {
      const requestedCreatorId = options.hangmanCreatorId;
      if (requestedCreatorId && !session.participants.some((participant) => participant.id === requestedCreatorId)) {
        throw new Error("Puzzle creator must be in this session.");
      }
      const creatorId = requestedCreatorId
        ?? session.participants.find((participant) => participant.isHost)?.id
        ?? session.participants[0]?.id;
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
    } else if (game === "guessTheImage") {
      const hostId = session.participants.find((p) => p.isHost)?.id ?? session.participants[0]?.id;
      if (!hostId) {
        throw new Error("No participants in session.");
      }
      const requestedSetup = options.guessImageSetupParticipantId;
      const setupParticipantId =
        requestedSetup && session.participants.some((p) => p.id === requestedSetup) ? requestedSetup : hostId;
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
      if (session.participants.length < 2) {
        throw new Error("20 Questions needs at least two players.");
      }
      const requestedSelector = options.twentyQuestionsItemSelectorId;
      const itemSelectorId =
        requestedSelector && session.participants.some((p) => p.id === requestedSelector)
          ? requestedSelector
          : (session.participants.find((p) => p.isHost)?.id ?? session.participants[0]!.id);
      const guessers = session.participants.filter((p) => p.id !== itemSelectorId);
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
      if (session.participants.length < 2) {
        throw new Error("Caption This needs at least two players.");
      }
      const requestedProvider = options.captionThisImageProviderId;
      const imageProviderId =
        requestedProvider && session.participants.some((p) => p.id === requestedProvider)
          ? requestedProvider
          : (session.participants.find((p) => p.isHost)?.id ?? session.participants[0]!.id);
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
    const active = session.games[0];
    if (active?.type === "icebreaker") {
      await purgeAllIcebreakerSessionUploads(this.dataDirectory, sessionId);
    }
    if (active?.type === "guessTheImage") {
      this.clearGuessImageTimer(sessionId);
      await purgeAllGuessTheImageSessionUploads(this.dataDirectory, sessionId);
    }
    if (active?.type === "captionThis") {
      await purgeAllCaptionThisSessionUploads(this.dataDirectory, sessionId);
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
    this.clearGuessImageTimer(sessionId);
    await purgeAllIcebreakerSessionUploads(this.dataDirectory, sessionId);
    await purgeAllGuessTheImageSessionUploads(this.dataDirectory, sessionId);
    await purgeAllCaptionThisSessionUploads(this.dataDirectory, sessionId);
    this.sessions.delete(sessionId);
    await this.persist();
  }

  public async closeSessionUnchecked(sessionId: string): Promise<boolean> {
    if (!this.sessions.has(sessionId)) {
      return false;
    }
    this.clearGuessImageTimer(sessionId);
    await purgeAllIcebreakerSessionUploads(this.dataDirectory, sessionId);
    await purgeAllGuessTheImageSessionUploads(this.dataDirectory, sessionId);
    await purgeAllCaptionThisSessionUploads(this.dataDirectory, sessionId);
    this.sessions.delete(sessionId);
    await this.persist();
    return true;
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

    if (session.participants.length === 0) {
      this.clearGuessImageTimer(sessionId);
      await purgeAllIcebreakerSessionUploads(this.dataDirectory, sessionId);
      await purgeAllGuessTheImageSessionUploads(this.dataDirectory, sessionId);
      await purgeAllCaptionThisSessionUploads(this.dataDirectory, sessionId);
      this.sessions.delete(sessionId);
      await this.persist();
      return { sessionDeleted: true };
    }

    // Host left: promote the oldest remaining participant so the session
    // still has someone able to close it / end games.
    if (!session.participants.some((p) => p.isHost)) {
      session.participants[0]!.isHost = true;
    }

    // A hangman round might have pointed at the leaver as puzzle creator or as
    // the current turn. Either situation makes the game unrecoverable, so we
    // drop the active game and push the session back to the lobby.
    const activeHangman = session.games.find((entry) => entry.type === "hangman") as
      | HangmanGameInternal
      | undefined;
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

    const activeGuess = session.games[0];
    if (activeGuess?.type === "guessTheImage") {
      delete activeGuess.locks[participantId];
      delete activeGuess.participantSetups[participantId];
      if (activeGuess.selectedRoundParticipantId === participantId) {
        activeGuess.selectedRoundParticipantId = null;
      }
      if (activeGuess.setupMode === "single" && activeGuess.setupParticipantId === participantId) {
        activeGuess.setupParticipantId =
          session.participants.find((p) => p.isHost)?.id ?? session.participants[0]!.id;
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
      if (activeCap.imageProviderId === participantId || session.participants.length < 2) {
        session.games = [];
        await purgeAllCaptionThisSessionUploads(this.dataDirectory, sessionId);
      } else if (activeCap.status === "voting" || activeCap.status === "results") {
        session.games = [];
        await purgeAllCaptionThisSessionUploads(this.dataDirectory, sessionId);
      } else if (activeCap.status === "collectingCaptions") {
        delete activeCap.captions[participantId];
      }
    }

    await this.persist();
    return { sessionDeleted: false };
  }

  public async setHangmanWord(sessionId: string, participantId: string, word: string): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
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
    const game = session.games[0];
    if (game?.type !== "trivia" || game.status !== "questionOpen") {
      throw new Error("No trivia question is open.");
    }
    game.answers[participantId] = answer;
    session.updatedAt = Date.now();
    await this.persist();
  }

  public async closeTriviaQuestion(sessionId: string): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    const game = session.games[0];
    if (game?.type !== "trivia" || game.status !== "questionOpen" || !game.activeQuestion) {
      throw new Error("No trivia question is open.");
    }
    const allParticipantsAnswered = session.participants.every(
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

  public async nextTriviaQuestion(sessionId: string): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
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

  public async cleanupStaleSessions(maxAgeMs: number): Promise<void> {
    const now = Date.now();
    let changed = false;
    for (const [sessionId, session] of this.sessions.entries()) {
      if (now - session.updatedAt > maxAgeMs) {
        await purgeAllIcebreakerSessionUploads(this.dataDirectory, sessionId);
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
    const game = session.games[0];
    if (game?.type !== "icebreaker" || game.status !== "gatheringPrompts") {
      throw new Error("Icebreaker is not ready to start from submitted questions.");
    }
    const expected = game.promptsPerParticipant;
    if (typeof expected !== "number") {
      throw new Error("Invalid prompt gathering configuration.");
    }
    const pool: Array<{ id: string; text: string }> = [];
    for (const p of session.participants) {
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
    const game = session.games[0];
    if (game?.type !== "icebreaker" || game.status !== "collecting") {
      throw new Error("Icebreaker is not ready for reveals.");
    }
    const valid = (s: { text: string; imageFileId: string | null }): boolean =>
      s.text.trim().length > 0 || Boolean(s.imageFileId);
    const allReady = session.participants.every((p) => {
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
    const perm = game.displayPerm!;
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
    const game = session.games[0];
    if (game?.type !== "guessTheImage") {
      throw new Error("Guess the image is not active.");
    }
    if (game.status !== "setup") {
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
    game.status = "setup";
    game.everyoneBetweenRounds = true;
    game.imageFileId = null;
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
    if (!session.participants.some((p) => p.id === targetParticipantId)) {
      throw new Error("That participant is not in this session.");
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
    if (!session.participants.some((p) => p.id === targetParticipantId)) {
      throw new Error("That participant is not in this session.");
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
    return session.participants.filter((p) => p.id !== game.setupParticipantId).map((p) => p.id);
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
    const playedFileId = game.imageFileId;
    const presenterId = game.setupParticipantId;

    game.status = "finished";
    game.results = results;
    game.imageFileId = null;

    if (everyone) {
      game.selectedRoundParticipantId = null;
      if (playedFileId) {
        await deleteGuessTheImageStoredFile(this.dataDirectory, sessionId, playedFileId);
      }
      if (presenterId && game.participantSetups[presenterId]) {
        game.participantSetups[presenterId] = freshGuessImageParticipantSlot();
      }
    }

    session.updatedAt = Date.now();
    await this.persist();
    if (!everyone) {
      await purgeAllGuessTheImageSessionUploads(this.dataDirectory, sessionId);
    }
    this.onSessionUpdated?.(sessionId);
  }

  private applyTwentyQuestionsScores(session: SessionInternal, game: TwentyQuestionsGameInternal): void {
    if (game.scoresApplied) {
      return;
    }
    game.scoresApplied = true;
    if (game.outcome === "team") {
      for (const p of session.participants) {
        if (p.id !== game.itemSelectorId) {
          p.score += 1;
        }
      }
    } else if (game.outcome === "selector") {
      const guesserCount = session.participants.filter((p) => p.id !== game.itemSelectorId).length;
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
    if (!this.isHost(sessionId, participantId)) {
      throw new Error("Only the host can change the image provider.");
    }
    const game = session.games[0];
    if (game?.type !== "captionThis" || game.status !== "waitingForImage") {
      throw new Error("Cannot change the image provider right now.");
    }
    if (!session.participants.some((p) => p.id === newProviderId)) {
      throw new Error("Participant must be in the session.");
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
    if (!this.isHost(sessionId, participantId)) {
      throw new Error("Only the host can start voting.");
    }
    const game = session.games[0];
    if (game?.type !== "captionThis" || game.status !== "collectingCaptions") {
      throw new Error("Cannot start voting right now.");
    }
    const allIn = session.participants.every((p) => {
      const c = game.captions[p.id];
      return typeof c === "string" && c.trim().length > 0;
    });
    if (!allIn) {
      throw new Error("Not everyone has submitted a caption yet.");
    }
    const entries: CaptionThisEntryInternal[] = session.participants.map((p) => ({
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
    const allVoted = session.participants.every((p) => game.votes[p.id] !== undefined);
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
    if (!this.isHost(sessionId, participantId)) {
      throw new Error("Only the host can start the next round.");
    }
    const game = session.games[0];
    if (game?.type !== "captionThis" || game.status !== "results") {
      throw new Error("Cannot start the next round right now.");
    }
    if (!session.participants.some((p) => p.id === nextImageProviderId)) {
      throw new Error("Image provider must be in the session.");
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

  private toPublicState(session: SessionInternal, viewerParticipantId?: string): SessionState {
    const game = session.games[0];
    const base = {
      sessionId: session.sessionId,
      sessionName: session.sessionName,
      joinCode: session.joinCode,
      participants: session.participants
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

    if (game.type === "guessTheImage") {
      const imageUrl =
        game.imageFileId
          ? `/api/sessions/${session.sessionId}/guess-the-image/file/${encodeURIComponent(game.imageFileId)}`
          : null;
      if (game.status === "setup") {
        const everyonePeers = session.participants.map((p) => ({
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
      return {
        ...base,
        activeGame: "guessTheImage",
        gameState: {
          type: "guessTheImage",
          state: {
            status: "finished",
            setupMode: game.setupMode === "everyone" ? "everyone" : "single",
            setupParticipantId: game.setupParticipantId,
            imageUrl,
            options: [...options],
            correctDisplayIndex,
            results: (game.results ?? []).map((r) => ({
              participantId: r.participantId,
              choiceDisplayIndex: r.choiceDisplayIndex,
              correct: r.correct,
              elapsedMs: r.elapsedMs,
              pointsAwarded: r.pointsAwarded
            })),
            revealDurationMs: game.revealDurationMs,
            roundStartedAt: game.roundStartedAt ?? 0
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
        const submittedCaptionParticipantIds = session.participants
          .filter((p) => {
            const c = game.captions[p.id];
            return typeof c === "string" && c.trim().length > 0;
          })
          .map((p) => p.id);
        const allCaptionsIn = session.participants.every((p) => {
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
              allVotesIn: false
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

    const _never: never = game;
    throw new Error(`Unknown game type: ${(_never as GameInternal).type}`);
  }
}

export const createSessionService = (): SessionService => {
  const dataDir = process.env.DATA_DIR ?? "./data";
  const store = new FileStore<PersistedState>(`${dataDir}/sessions.json`);
  return new SessionService(store, createTriviaQuestionLoader(), dataDir);
};
