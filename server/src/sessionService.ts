import { nanoid } from "nanoid";
import {
  type GameStartOptions,
  type GameType,
  type HangmanMode,
  type SessionState,
  type TriviaQuestion,
  triviaQuestionSchema
} from "../../shared/contracts";
import questions from "./data/triviaQuestions.json";
import { FileStore } from "./storage/fileStore";

const triviaQuestions: TriviaQuestion[] = triviaQuestionSchema.array().parse(questions);

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
  questionIndex: number;
  activeQuestion: TriviaQuestion | null;
  answers: Record<string, string>;
  status: "idle" | "questionOpen" | "questionClosed" | "finished";
};

type GameInternal = HangmanGameInternal | TwoTruthsGameInternal | TriviaGameInternal;

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

const shuffle = <T>(input: T[]): T[] => {
  const copy = [...input];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
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

const ensureGameShape = (game: GameInternal & { mode?: HangmanMode }): GameInternal => {
  if (game.type === "hangman") {
    return {
      ...game,
      id: game.id ?? nanoid(6),
      mode: game.mode ?? "team",
      currentTurnId: game.currentTurnId ?? null
    };
  }
  return { ...game, id: game.id ?? nanoid(6) };
};

export class SessionService {
  private sessions = new Map<string, SessionInternal>();
  private readonly store: FileStore<PersistedState>;

  public constructor(store: FileStore<PersistedState>) {
    this.store = store;
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
          ? legacy.games
          : legacy.game
            ? [ensureGameShape(legacy.game)]
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

  public getState(sessionId: string): SessionState {
    const session = this.getSessionOrThrow(sessionId);
    return this.toPublicState(session);
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
    session.updatedAt = Date.now();
    let next: GameInternal;
    if (game === "hangman") {
      const creatorId = session.participants.find((participant) => participant.isHost)?.id
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
        currentTurnId: null
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
    } else {
      next = {
        id: nanoid(6),
        type: "trivia",
        questions: [],
        questionIndex: 0,
        activeQuestion: null,
        answers: {},
        status: "idle"
      };
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
    this.sessions.delete(sessionId);
    await this.persist();
  }

  public async closeSessionUnchecked(sessionId: string): Promise<boolean> {
    if (!this.sessions.has(sessionId)) {
      return false;
    }
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

  public async startTrivia(sessionId: string, totalQuestions: number): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    const game = session.games[0];
    if (game?.type !== "trivia") {
      throw new Error("Trivia game is not active.");
    }
    const picked = shuffle(triviaQuestions).slice(0, Math.max(1, Math.min(totalQuestions, triviaQuestions.length)));
    game.questions = picked;
    game.questionIndex = 0;
    game.activeQuestion = picked[0] ?? null;
    game.answers = {};
    game.status = picked[0] ? "questionOpen" : "finished";
    session.updatedAt = Date.now();
    await this.persist();
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
        this.sessions.delete(sessionId);
        changed = true;
      }
    }
    if (changed) {
      await this.persist();
    }
  }

  private toPublicState(session: SessionInternal): SessionState {
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
            currentTurnId: game.currentTurnId
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

    return {
      ...base,
      activeGame: "trivia",
      gameState: {
        type: "trivia",
        state: {
          questionIndex: game.questionIndex,
          totalQuestions: game.questions.length || 1,
          activeQuestion: game.activeQuestion,
          answers: game.answers,
          status: game.status
        }
      }
    };
  }
}

export const createSessionService = (): SessionService => {
  const dataDir = process.env.DATA_DIR ?? "./data";
  const store = new FileStore<PersistedState>(`${dataDir}/sessions.json`);
  return new SessionService(store);
};
