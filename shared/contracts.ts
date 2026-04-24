import { z } from "zod";

export const gameTypeSchema = z.enum(["hangman", "twoTruthsLie", "trivia", "icebreaker", "guessTheImage"]);
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

export const triviaDifficultySchema = z.enum(["easy", "medium", "hard"]);
export type TriviaDifficulty = z.infer<typeof triviaDifficultySchema>;

export const triviaCategoryModeSchema = z.enum(["all", "single"]);
export type TriviaCategoryMode = z.infer<typeof triviaCategoryModeSchema>;

export const triviaRoundConfigSchema = z
  .object({
    totalQuestions: z.number().int().positive(),
    categoryMode: triviaCategoryModeSchema,
    categoryId: z.number().int().positive().optional(),
    difficulties: z.array(triviaDifficultySchema).min(1)
  })
  .superRefine((value, ctx) => {
    if (value.categoryMode === "single" && typeof value.categoryId !== "number") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["categoryId"],
        message: "categoryId is required when categoryMode is single."
      });
    }
  });
export type TriviaRoundConfig = z.infer<typeof triviaRoundConfigSchema>;

export const triviaLoadingSchema = z.object({
  totalCalls: z.number().int().positive(),
  completedCalls: z.number().int().nonnegative(),
  message: z.string()
});
export type TriviaLoadingState = z.infer<typeof triviaLoadingSchema>;

export const triviaCategorySchema = z.object({
  id: z.number().int().positive(),
  name: z.string()
});
export type TriviaCategory = z.infer<typeof triviaCategorySchema>;

export const triviaStateSchema = z.object({
  questionIndex: z.number().int().nonnegative(),
  totalQuestions: z.number().int().positive(),
  activeQuestion: triviaQuestionSchema.nullable(),
  answers: z.record(z.string(), z.string()),
  loading: triviaLoadingSchema.nullable(),
  status: z.enum(["idle", "loading", "questionOpen", "questionClosed", "finished"])
});
export type TriviaState = z.infer<typeof triviaStateSchema>;

export const icebreakerQuestionSchema = z.object({
  id: z.string(),
  text: z.string()
});
export type IcebreakerQuestion = z.infer<typeof icebreakerQuestionSchema>;

export const icebreakerRevealedEntrySchema = z.object({
  participantId: z.string(),
  text: z.string(),
  imageUrl: z.string().nullable()
});
export type IcebreakerRevealedEntry = z.infer<typeof icebreakerRevealedEntrySchema>;

export const icebreakerStateSchema = z.object({
  questionIndex: z.number().int().nonnegative(),
  totalQuestions: z.number().int().positive(),
  activeQuestion: icebreakerQuestionSchema.nullable(),
  submittedParticipantIds: z.array(z.string()),
  revealed: z.array(icebreakerRevealedEntrySchema),
  usedQuestionIds: z.array(z.string()),
  status: z.enum(["idle", "collecting", "revealing", "finished"])
});
export type IcebreakerState = z.infer<typeof icebreakerStateSchema>;

export const icebreakerRoundConfigSchema = z.object({
  totalQuestions: z.number().int().positive()
});
export type IcebreakerRoundConfig = z.infer<typeof icebreakerRoundConfigSchema>;

export const guessTheImageResultEntrySchema = z.object({
  participantId: z.string(),
  choiceDisplayIndex: z.number().int().min(0).max(3).nullable(),
  correct: z.boolean(),
  elapsedMs: z.number().int().nullable(),
  pointsAwarded: z.number().int()
});
export type GuessTheImageResultEntry = z.infer<typeof guessTheImageResultEntrySchema>;

const guessTheImageEveryonePeerSchema = z.object({
  participantId: z.string(),
  configured: z.boolean()
});

const guessTheImageEveryoneMySetupSchema = z.object({
  imageUrl: z.string().nullable(),
  descriptions: z.array(z.string()).length(4),
  correctIndex: z.number().int().min(0).max(3),
  revealDurationMs: z.number().int().positive(),
  configured: z.boolean()
});

export const guessTheImageStateSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("setup"),
    /** `single`: one designated player prepares. `everyone`: each player saves their own setup; host picks whose image to play. */
    setupMode: z.enum(["single", "everyone"]),
    setupParticipantId: z.string(),
    /** Everyone mode: after a finished round, host chose "next image" — saved setups are reused without a full prep wave. */
    everyoneBetweenRounds: z.boolean(),
    /** Everyone mode: host chooses which saved setup becomes the round (required before start). */
    selectedRoundParticipantId: z.string().nullable(),
    everyonePeers: z.array(guessTheImageEveryonePeerSchema),
    /** Per-viewer: only the socket recipient's own draft (null on HTTP snapshot). */
    everyoneMySetup: guessTheImageEveryoneMySetupSchema.nullable(),
    everyoneAllConfigured: z.boolean(),
    /** Single mode: shared draft. In everyone mode, placeholders — use everyoneMySetup for your own. */
    imageUrl: z.string().nullable(),
    descriptions: z.array(z.string()).length(4),
    correctIndex: z.number().int().min(0).max(3),
    revealDurationMs: z.number().int().positive(),
    configured: z.boolean()
  }),
  z.object({
    status: z.literal("playing"),
    setupParticipantId: z.string(),
    imageUrl: z.string(),
    options: z.array(z.string()).length(4),
    roundStartedAt: z.number().int(),
    revealDurationMs: z.number().int().positive(),
    submittedParticipantIds: z.array(z.string())
  }),
  z.object({
    status: z.literal("finished"),
    /** Present for Guess the image finished state (distinguishes everyone vs single post-round actions). */
    setupMode: z.enum(["single", "everyone"]),
    setupParticipantId: z.string(),
    /** Cleared after the round ends (image file is removed from server storage). */
    imageUrl: z.string().nullable(),
    options: z.array(z.string()).length(4),
    correctDisplayIndex: z.number().int().min(0).max(3),
    results: z.array(guessTheImageResultEntrySchema),
    revealDurationMs: z.number().int().positive(),
    roundStartedAt: z.number().int()
  })
]);
export type GuessTheImageState = z.infer<typeof guessTheImageStateSchema>;

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
  }),
  z.object({
    type: z.literal("icebreaker"),
    state: icebreakerStateSchema
  }),
  z.object({
    type: z.literal("guessTheImage"),
    state: guessTheImageStateSchema
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
  hangmanCreatorId: z.string().optional(),
  /** Guess the image: who uploads the image and enters descriptions for the first round (defaults to host). */
  guessImageSetupParticipantId: z.string().optional(),
  /** Guess the image: when `everyone`, each player prepares their own image; host then picks which one to play. */
  guessImageSetupMode: z.enum(["single", "everyone"]).optional()
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
  z.object({ type: z.literal("trivia:start"), payload: triviaRoundConfigSchema }),
  z.object({ type: z.literal("trivia:answer"), payload: z.object({ answer: z.string() }) }),
  z.object({ type: z.literal("trivia:closeQuestion"), payload: z.object({}) }),
  z.object({ type: z.literal("trivia:nextQuestion"), payload: z.object({}) }),
  z.object({ type: z.literal("icebreaker:startRound"), payload: icebreakerRoundConfigSchema }),
  z.object({
    type: z.literal("icebreaker:submit"),
    payload: z.object({
      text: z.string(),
      imageFileId: z.string().nullable()
    })
  }),
  z.object({ type: z.literal("icebreaker:beginReveals"), payload: z.object({}) }),
  z.object({ type: z.literal("icebreaker:reveal"), payload: z.object({ participantId: z.string() }) }),
  z.object({ type: z.literal("icebreaker:nextQuestion"), payload: z.object({}) }),
  z.object({
    type: z.literal("guessImage:configure"),
    payload: z.object({
      imageFileId: z.string().min(1),
      descriptions: z.array(z.string().min(1)).length(4),
      correctIndex: z.number().int().min(0).max(3),
      revealDurationMs: z.number().int().min(10_000).max(120_000)
    })
  }),
  z.object({ type: z.literal("guessImage:startRound"), payload: z.object({}) }),
  z.object({
    type: z.literal("guessImage:setRoundPresenter"),
    payload: z.object({ participantId: z.string().nullable() })
  }),
  z.object({
    type: z.literal("guessImage:setSetupParticipant"),
    payload: z.object({ participantId: z.string().min(1) })
  }),
  z.object({ type: z.literal("guessImage:backToSetup"), payload: z.object({}) }),
  z.object({ type: z.literal("guessImage:beginNextRoundSelection"), payload: z.object({}) }),
  z.object({
    type: z.literal("guessImage:lock"),
    payload: z.object({ choiceIndex: z.number().int().min(0).max(3) })
  })
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
