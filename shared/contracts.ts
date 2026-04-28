import { z } from "zod";

export const gameTypeSchema = z.enum([
  "hangman",
  "twoTruthsLie",
  "trivia",
  "icebreaker",
  "guessTheImage",
  "twentyQuestions",
  "captionThis",
  "pictionary"
]);
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

/** Max length per line when players submit custom icebreaker questions. */
export const ICEBREAKER_PROMPT_MAX_CHARS = 400;

const icebreakerScaffoldSchema = z.object({
  questionIndex: z.number().int().nonnegative(),
  totalQuestions: z.number().int().positive(),
  activeQuestion: icebreakerQuestionSchema.nullable(),
  submittedParticipantIds: z.array(z.string()),
  revealed: z.array(icebreakerRevealedEntrySchema),
  usedQuestionIds: z.array(z.string())
});

export const icebreakerStateSchema = z.discriminatedUnion("status", [
  icebreakerScaffoldSchema.extend({
    status: z.literal("idle")
  }),
  icebreakerScaffoldSchema.extend({
    status: z.literal("gatheringPrompts"),
    promptsPerParticipant: z.number().int().min(1).max(5),
    submittedPromptParticipantIds: z.array(z.string())
  }),
  icebreakerScaffoldSchema.extend({
    status: z.literal("collecting")
  }),
  icebreakerScaffoldSchema.extend({
    status: z.literal("revealing")
  }),
  icebreakerScaffoldSchema.extend({
    status: z.literal("finished")
  })
]);
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

/** Max length for the secret person/place/thing. */
export const TWENTY_QUESTIONS_ITEM_MAX_CHARS = 200;
/** Max length for a submitted question line. */
export const TWENTY_QUESTIONS_QUESTION_MAX_CHARS = 500;

export const twentyQuestionsLogEntrySchema = z.object({
  id: z.string(),
  participantId: z.string(),
  text: z.string(),
  askedAt: z.number().int(),
  /** `null` means the selector has not answered yet (only one such entry at a time). */
  answer: z.enum(["yes", "no"]).nullable()
});
export type TwentyQuestionsLogEntry = z.infer<typeof twentyQuestionsLogEntrySchema>;

export const twentyQuestionsFinishedLogEntrySchema = twentyQuestionsLogEntrySchema.extend({
  answer: z.enum(["yes", "no"])
});
export type TwentyQuestionsFinishedLogEntry = z.infer<typeof twentyQuestionsFinishedLogEntrySchema>;

export const twentyQuestionsStateSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("waitingForItem"),
    itemSelectorId: z.string(),
    maxQuestions: z.number().int().min(1).max(50)
  }),
  z.object({
    status: z.literal("playing"),
    itemSelectorId: z.string(),
    maxQuestions: z.number().int().min(1).max(50),
    questionsUsed: z.number().int().nonnegative(),
    currentAskerId: z.string(),
    questionLog: z.array(twentyQuestionsLogEntrySchema),
    questionDraft: z
      .object({
        participantId: z.string(),
        text: z.string()
      })
      .nullable()
  }),
  z.object({
    status: z.literal("finished"),
    itemSelectorId: z.string(),
    maxQuestions: z.number().int().min(1).max(50),
    questionsUsed: z.number().int().nonnegative(),
    outcome: z.enum(["team", "selector"]),
    revealedItem: z.string(),
    questionLog: z.array(twentyQuestionsFinishedLogEntrySchema)
  })
]);
export type TwentyQuestionsState = z.infer<typeof twentyQuestionsStateSchema>;

/** Max length for a submitted caption line. */
export const CAPTION_THIS_MAX_CHARS = 500;

export const captionThisCaptionEntrySchema = z.object({
  id: z.string(),
  authorId: z.string(),
  text: z.string()
});
export type CaptionThisCaptionEntry = z.infer<typeof captionThisCaptionEntrySchema>;

export const captionThisVoteTallySchema = z.object({
  entryId: z.string(),
  authorId: z.string(),
  text: z.string(),
  voteCount: z.number().int().nonnegative()
});
export type CaptionThisVoteTally = z.infer<typeof captionThisVoteTallySchema>;

export const captionThisStateSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("waitingForImage"),
    imageProviderId: z.string(),
    roundNumber: z.number().int().positive()
  }),
  z.object({
    status: z.literal("collectingCaptions"),
    imageProviderId: z.string(),
    imageUrl: z.string(),
    roundNumber: z.number().int().positive(),
    submittedCaptionParticipantIds: z.array(z.string()),
    allCaptionsIn: z.boolean()
  }),
  z.object({
    status: z.literal("voting"),
    imageProviderId: z.string(),
    imageUrl: z.string(),
    roundNumber: z.number().int().positive(),
    /** Shuffled; text only — use `myEntryId` to disable voting on your caption. */
    displayEntries: z.array(
      z.object({
        entryId: z.string(),
        text: z.string()
      })
    ),
    /** The caption entry authored by the viewing participant, if any. */
    myEntryId: z.string().nullable(),
    /** Who has cast a vote (choices hidden until results). */
    votedParticipantIds: z.array(z.string()),
    /** Whether the current viewer has voted yet. */
    hasVoted: z.boolean(),
    /** All participants have submitted a vote. */
    allVotesIn: z.boolean()
  }),
  z.object({
    status: z.literal("results"),
    imageProviderId: z.string(),
    imageUrl: z.string(),
    roundNumber: z.number().int().positive(),
    tallies: z.array(captionThisVoteTallySchema),
    winnerEntryIds: z.array(z.string())
  })
]);
export type CaptionThisState = z.infer<typeof captionThisStateSchema>;

/** Per-draw timer bounds (ms) for Pictionary; server clamps `game:start` options to this range. */
export const PICTORY_ROUND_DURATION_MIN_MS = 30_000;
export const PICTORY_ROUND_DURATION_MAX_MS = 300_000;
export const PICTORY_ROUND_DURATION_DEFAULT_MS = 90_000;
/** Max points per stroke segment (normalized 0–1 coords). */
export const PICTORY_STROKE_MAX_POINTS = 400;
/** Max saved strokes per drawing round (server-enforced). */
export const PICTORY_MAX_STROKES_PER_ROUND = 250;

export const pictionaryPointSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1)
});
export type PictionaryPoint = z.infer<typeof pictionaryPointSchema>;

export const pictionaryStrokePayloadSchema = z.object({
  tool: z.enum(["pen", "eraser"]),
  width: z.number().min(1).max(48),
  points: z.array(pictionaryPointSchema).min(1).max(PICTORY_STROKE_MAX_POINTS)
});
export type PictionaryStrokePayload = z.infer<typeof pictionaryStrokePayloadSchema>;

export const pictionarySavedStrokeSchema = pictionaryStrokePayloadSchema.extend({
  id: z.string().min(1)
});
export type PictionarySavedStroke = z.infer<typeof pictionarySavedStrokeSchema>;

export const pictionaryTeamIdSchema = z.enum(["A", "B"]);
export type PictionaryTeamId = z.infer<typeof pictionaryTeamIdSchema>;

export const pictionaryStateSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("teamSetup"),
    roundDurationMs: z.number().int().min(PICTORY_ROUND_DURATION_MIN_MS).max(PICTORY_ROUND_DURATION_MAX_MS),
    teamAIds: z.array(z.string()),
    teamBIds: z.array(z.string())
  }),
  z.object({
    status: z.literal("drawing"),
    roundDurationMs: z.number().int().min(PICTORY_ROUND_DURATION_MIN_MS).max(PICTORY_ROUND_DURATION_MAX_MS),
    teamAIds: z.array(z.string()),
    teamBIds: z.array(z.string()),
    activeTeam: pictionaryTeamIdSchema,
    drawerId: z.string(),
    roundStartedAt: z.number().int(),
    roundEndsAt: z.number().int(),
    strokes: z.array(pictionarySavedStrokeSchema),
    /** Only the current drawer receives the prompt over the socket; always null for HTTP snapshot and other viewers. */
    myPrompt: z.string().nullable()
  }),
  z.object({
    status: z.literal("roundBreak"),
    roundDurationMs: z.number().int().min(PICTORY_ROUND_DURATION_MIN_MS).max(PICTORY_ROUND_DURATION_MAX_MS),
    teamAIds: z.array(z.string()),
    teamBIds: z.array(z.string()),
    revealedPrompt: z.string(),
    lastResult: z.enum(["correct", "timeout"]),
    nextRoundStartsAt: z.number().int(),
    /** Which team draws after the break ends. */
    nextTeam: pictionaryTeamIdSchema
  })
]);
export type PictionaryState = z.infer<typeof pictionaryStateSchema>;

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
  }),
  z.object({
    type: z.literal("twentyQuestions"),
    state: twentyQuestionsStateSchema
  }),
  z.object({
    type: z.literal("captionThis"),
    state: captionThisStateSchema
  }),
  z.object({
    type: z.literal("pictionary"),
    state: pictionaryStateSchema
  })
]);
export type GameState = z.infer<typeof gameStateSchema>;

export const sessionStateSchema = z.object({
  sessionId: z.string(),
  sessionName: z.string(),
  joinCode: z.string(),
  participants: z.array(participantSchema),
  activeGame: gameTypeSchema.nullable(),
  gameState: gameStateSchema.nullable(),
  /** Non-host lobby votes for which game to play next (participantId -> game); absent or empty when unavailable. */
  lobbyGamePreferences: z.record(z.string(), gameTypeSchema).optional()
});
export type SessionState = z.infer<typeof sessionStateSchema>;

/** Row returned by `GET /api/active-sessions` and `activeSessions:updated` websocket payloads. */
export const activeSessionSummarySchema = z.object({
  sessionId: z.string(),
  sessionName: z.string(),
  joinCode: z.string(),
  participantCount: z.number().int()
});
export type ActiveSessionSummary = z.infer<typeof activeSessionSummarySchema>;

export const serverEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("session:state"), payload: sessionStateSchema }),
  z.object({
    type: z.literal("session:closed"),
    payload: z.object({ sessionId: z.string(), reason: z.enum(["host_closed", "empty"]) })
  }),
  z.object({
    type: z.literal("activeSessions:updated"),
    payload: z.object({ sessions: z.array(activeSessionSummarySchema) })
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
  guessImageSetupMode: z.enum(["single", "everyone"]).optional(),
  /** 20 Questions: who picks the secret item and answers yes/no (defaults to host if omitted). */
  twentyQuestionsItemSelectorId: z.string().optional(),
  /** 20 Questions: question budget for the round (default 20, clamped server-side to 1–50). */
  twentyQuestionsMaxQuestions: z.number().int().min(1).max(50).optional(),
  /** Caption This: who uploads the image for the first round (defaults to host). */
  captionThisImageProviderId: z.string().optional(),
  /** Pictionary: ms per drawing turn (server clamps to PICTORY_ROUND_DURATION_*). */
  pictionaryRoundDurationMs: z.number().int().positive().optional()
});
export type GameStartOptions = z.infer<typeof gameStartOptionsSchema>;

export const clientEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("session:hello"), payload: z.object({ sessionId: z.string(), participantId: z.string() }) }),
  z.object({ type: z.literal("lobby:subscribe"), payload: z.object({}) }),
  z.object({
    type: z.literal("lobby:setGamePreference"),
    payload: z.object({ game: gameTypeSchema })
  }),
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
    type: z.literal("icebreaker:beginPromptGathering"),
    payload: z.object({ promptsPerParticipant: z.number().int().min(1).max(5) })
  }),
  z.object({
    type: z.literal("icebreaker:submitPrompts"),
    payload: z.object({ texts: z.array(z.string()) })
  }),
  z.object({ type: z.literal("icebreaker:startCustomRound"), payload: z.object({}) }),
  z.object({ type: z.literal("icebreaker:returnToSetup"), payload: z.object({}) }),
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
  }),
  z.object({
    type: z.literal("twentyQuestions:setItem"),
    payload: z.object({ text: z.string().min(1).max(TWENTY_QUESTIONS_ITEM_MAX_CHARS) })
  }),
  z.object({
    type: z.literal("twentyQuestions:questionDraft"),
    payload: z.object({ text: z.string().max(TWENTY_QUESTIONS_QUESTION_MAX_CHARS) })
  }),
  z.object({
    type: z.literal("twentyQuestions:submitQuestion"),
    payload: z.object({ text: z.string().min(1).max(TWENTY_QUESTIONS_QUESTION_MAX_CHARS) })
  }),
  z.object({
    type: z.literal("twentyQuestions:answer"),
    payload: z.object({
      questionId: z.string().min(1),
      answer: z.enum(["yes", "no"])
    })
  }),
  z.object({ type: z.literal("twentyQuestions:teamSolved"), payload: z.object({}) }),
  z.object({
    type: z.literal("captionThis:setImageProvider"),
    payload: z.object({ participantId: z.string().min(1) })
  }),
  z.object({
    type: z.literal("captionThis:submitImage"),
    payload: z.object({ imageFileId: z.string().min(1) })
  }),
  z.object({
    type: z.literal("captionThis:submitCaption"),
    payload: z.object({ text: z.string().min(1).max(CAPTION_THIS_MAX_CHARS) })
  }),
  z.object({ type: z.literal("captionThis:beginVoting"), payload: z.object({}) }),
  z.object({
    type: z.literal("captionThis:vote"),
    payload: z.object({ entryId: z.string().min(1) })
  }),
  z.object({
    type: z.literal("captionThis:beginNextRound"),
    payload: z.object({ imageProviderId: z.string().min(1) })
  }),
  z.object({
    type: z.literal("pictionary:setTeams"),
    payload: z.object({
      teamAIds: z.array(z.string()),
      teamBIds: z.array(z.string())
    })
  }),
  z.object({ type: z.literal("pictionary:beginPlay"), payload: z.object({}) }),
  z.object({
    type: z.literal("pictionary:appendStroke"),
    payload: pictionaryStrokePayloadSchema
  }),
  z.object({ type: z.literal("pictionary:clearCanvas"), payload: z.object({}) }),
  z.object({ type: z.literal("pictionary:teamGuessed"), payload: z.object({}) }),
  z.object({ type: z.literal("pictionary:hostSkipRound"), payload: z.object({}) })
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
