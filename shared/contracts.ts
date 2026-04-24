import { z } from "zod";

export const gameTypeSchema = z.enum(["hangman", "twoTruthsLie", "trivia"]);
export type GameType = z.infer<typeof gameTypeSchema>;

export const participantSchema = z.object({
  id: z.string(),
  displayName: z.string().min(1),
  score: z.number().int(),
  isHost: z.boolean()
});
export type Participant = z.infer<typeof participantSchema>;

export const hangmanModeSchema = z.enum(["team", "turns"]);
export type HangmanMode = z.infer<typeof hangmanModeSchema>;

export const hangmanActivitySchema = z.object({
  kind: z.enum(["letterCorrect", "letterWrong", "solveAttempt", "solveCancelled"]),
  participantId: z.string(),
  letter: z.string().length(1).nullable(),
  createdAt: z.number().int()
});
export type HangmanActivity = z.infer<typeof hangmanActivitySchema>;

export const hangmanStateSchema = z.object({
  puzzleCreatorId: z.string(),
  maskedWord: z.string(),
  guessedLetters: z.array(z.string()),
  wrongGuessCount: z.number().int().nonnegative(),
  maxWrongGuesses: z.number().int().positive(),
  status: z.enum(["waitingForWord", "inProgress", "won", "lost"]),
  revealedWord: z.string().nullable().optional(),
  mode: hangmanModeSchema,
  currentTurnId: z.string().nullable(),
  activeSolverId: z.string().nullable(),
  activityLog: z.array(hangmanActivitySchema)
});
export type HangmanState = z.infer<typeof hangmanStateSchema>;

export const ttlPromptSchema = z.object({
  presenterId: z.string(),
  statements: z.array(z.string()),
  revealed: z.boolean()
});

export const twoTruthsStateSchema = z.object({
  submissions: z.record(
    z.string(),
    z.object({
      statements: z.array(z.string()).length(3),
      lieIndex: z.number().int().min(0).max(2)
    })
  ),
  currentPresenterId: z.string().nullable(),
  votes: z.record(z.string(), z.number().int().min(0).max(2)),
  status: z.enum(["collecting", "voting", "revealed", "finished"])
});
export type TwoTruthsState = z.infer<typeof twoTruthsStateSchema>;

export const triviaQuestionSchema = z.object({
  id: z.string(),
  category: z.string(),
  difficulty: z.enum(["easy", "medium", "hard"]),
  question: z.string(),
  options: z.array(z.string()).length(4),
  correctAnswer: z.string()
});
export type TriviaQuestion = z.infer<typeof triviaQuestionSchema>;

export const triviaStateSchema = z.object({
  questionIndex: z.number().int().nonnegative(),
  totalQuestions: z.number().int().positive(),
  activeQuestion: triviaQuestionSchema.nullable(),
  answers: z.record(z.string(), z.string()),
  status: z.enum(["idle", "questionOpen", "questionClosed", "finished"])
});
export type TriviaState = z.infer<typeof triviaStateSchema>;

export const gameStateSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("hangman"),
    state: hangmanStateSchema
  }),
  z.object({
    type: z.literal("twoTruthsLie"),
    state: twoTruthsStateSchema
  }),
  z.object({
    type: z.literal("trivia"),
    state: triviaStateSchema
  })
]);
export type GameState = z.infer<typeof gameStateSchema>;

export const sessionStateSchema = z.object({
  sessionId: z.string(),
  sessionName: z.string(),
  joinCode: z.string(),
  participants: z.array(participantSchema),
  activeGame: gameTypeSchema.nullable(),
  gameState: gameStateSchema.nullable()
});
export type SessionState = z.infer<typeof sessionStateSchema>;

export const serverEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("session:state"), payload: sessionStateSchema }),
  z.object({
    type: z.literal("session:closed"),
    payload: z.object({ sessionId: z.string(), reason: z.enum(["host_closed", "empty"]) })
  }),
  z.object({ type: z.literal("error"), payload: z.object({ message: z.string() }) }),
  z.object({ type: z.literal("game:message"), payload: z.object({ message: z.string() }) }),
  z.object({ type: z.literal("pong"), payload: z.object({ ts: z.number() }) })
]);
export type ServerEvent = z.infer<typeof serverEventSchema>;

export const gameStartOptionsSchema = z.object({
  hangmanMode: hangmanModeSchema.optional(),
  hangmanCreatorId: z.string().optional()
});
export type GameStartOptions = z.infer<typeof gameStartOptionsSchema>;

export const clientEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("session:hello"), payload: z.object({ sessionId: z.string(), participantId: z.string() }) }),
  z.object({ type: z.literal("session:leave"), payload: z.object({}) }),
  z.object({ type: z.literal("session:close"), payload: z.object({}) }),
  z.object({ type: z.literal("game:end"), payload: z.object({}) }),
  z.object({ type: z.literal("ping"), payload: z.object({ ts: z.number() }) }),
  z.object({
    type: z.literal("game:start"),
    payload: z.object({ game: gameTypeSchema, options: gameStartOptionsSchema.optional() })
  }),
  z.object({ type: z.literal("hangman:setWord"), payload: z.object({ word: z.string().min(1) }) }),
  z.object({ type: z.literal("hangman:guessLetter"), payload: z.object({ letter: z.string().length(1) }) }),
  z.object({ type: z.literal("hangman:solveOpen"), payload: z.object({}) }),
  z.object({ type: z.literal("hangman:solveCancel"), payload: z.object({}) }),
  z.object({ type: z.literal("hangman:solve"), payload: z.object({ guess: z.string().min(1) }) }),
  z.object({ type: z.literal("hangman:setTurn"), payload: z.object({ participantId: z.string() }) }),
  z.object({
    type: z.literal("session:reorderParticipants"),
    payload: z.object({ participantIds: z.array(z.string()) })
  }),
  z.object({
    type: z.literal("truths:submit"),
    payload: z.object({
      statements: z.array(z.string().min(1)).length(3),
      lieIndex: z.number().int().min(0).max(2)
    })
  }),
  z.object({ type: z.literal("truths:beginVoting"), payload: z.object({ presenterId: z.string() }) }),
  z.object({ type: z.literal("truths:vote"), payload: z.object({ lieIndex: z.number().int().min(0).max(2) }) }),
  z.object({ type: z.literal("truths:reveal"), payload: z.object({}) }),
  z.object({ type: z.literal("trivia:start"), payload: z.object({ totalQuestions: z.number().int().positive() }) }),
  z.object({ type: z.literal("trivia:answer"), payload: z.object({ answer: z.string() }) }),
  z.object({ type: z.literal("trivia:closeQuestion"), payload: z.object({}) }),
  z.object({ type: z.literal("trivia:nextQuestion"), payload: z.object({}) })
]);
export type ClientEvent = z.infer<typeof clientEventSchema>;

export const createSessionRequestSchema = z.object({
  displayName: z.string().min(1),
  sessionName: z.string().min(2).max(60).optional()
});
export const joinSessionRequestSchema = z.object({
  joinCode: z.string().min(4),
  displayName: z.string().min(1)
});
