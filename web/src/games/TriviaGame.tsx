import { useEffect, useMemo, useState } from "react";
import type {
  ClientEvent,
  SessionState,
  TriviaCategory,
  TriviaDifficulty
} from "../../../shared/contracts";

const DIFFICULTY_ORDER: TriviaDifficulty[] = ["easy", "medium", "hard"];
const clampQuestionCount = (value: number): number => {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(500, Math.floor(value)));
};

export function TriviaGame({
  session,
  currentParticipantId,
  isHost,
  send,
  apiBase
}: {
  session: SessionState;
  currentParticipantId: string;
  isHost: boolean;
  send: (event: ClientEvent) => void;
  apiBase: string;
}): JSX.Element | null {
  const [triviaCount, setTriviaCount] = useState(5);
  const [pickedAnswer, setPickedAnswer] = useState<string | null>(null);
  const [categorySelection, setCategorySelection] = useState<string>("all");
  const [selectedDifficulties, setSelectedDifficulties] = useState<TriviaDifficulty[]>([
    "easy",
    "medium",
    "hard"
  ]);
  const [categories, setCategories] = useState<TriviaCategory[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState(false);

  if (session.gameState?.type !== "trivia") return null;
  const state = session.gameState.state;
  const myAnswer = state.answers[currentParticipantId] ?? null;
  const question = state.activeQuestion;
  const totalParticipants = session.participants.length;
  const answeredCount = session.participants.filter((participant) => state.answers[participant.id]).length;
  const everyoneAnswered = totalParticipants > 0 && answeredCount >= totalParticipants;

  const statusLabel =
    state.status === "idle"
      ? "Not started"
      : state.status === "questionOpen"
      ? `Question ${state.questionIndex + 1} of ${state.totalQuestions}`
      : state.status === "loading"
      ? "Loading questions"
      : state.status === "questionClosed"
      ? "Reviewing"
      : "Finished";

  useEffect(() => {
    if (!isHost) return;
    let cancelled = false;
    setIsLoadingCategories(true);
    fetch(`${apiBase}/api/trivia/categories`)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Category fetch failed (${response.status})`);
        }
        const payload = (await response.json()) as TriviaCategory[];
        if (!cancelled) {
          setCategories(payload);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCategories([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingCategories(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [apiBase, isHost]);

  const selectedDifficultySet = useMemo(() => new Set(selectedDifficulties), [selectedDifficulties]);
  const toggleDifficulty = (difficulty: TriviaDifficulty) => {
    setSelectedDifficulties((current) => {
      if (current.includes(difficulty)) {
        if (current.length === 1) {
          return current;
        }
        return DIFFICULTY_ORDER.filter((item) => item !== difficulty && current.includes(item));
      }
      return DIFFICULTY_ORDER.filter((item) => item === difficulty || current.includes(item));
    });
  };

  const startRound = () => {
    const difficulties = DIFFICULTY_ORDER.filter((difficulty) => selectedDifficultySet.has(difficulty));
    if (difficulties.length === 0) {
      return;
    }
    const categoryMode = categorySelection === "all" ? "all" : "single";
    send({
      type: "trivia:start",
      payload: {
        totalQuestions: clampQuestionCount(triviaCount),
        categoryMode,
        categoryId: categoryMode === "single" ? Number(categorySelection) : undefined,
        difficulties
      }
    });
  };

  const pickOption = (option: string) => {
    if (state.status !== "questionOpen") return;
    if (myAnswer) return;
    setPickedAnswer(option);
    send({ type: "trivia:answer", payload: { answer: option } });
  };

  if (state.status === "idle" && !question) {
    return (
      <section className="card game-card-trivia">
        <header className="card-head">
          <h2>Trivia</h2>
          <span className="pill pill-status pill-status-idle">Not started</span>
        </header>
        {isHost ? (
          <div className="trivia-setup">
            <label htmlFor="trivia-count">How many questions?</label>
            <input
              id="trivia-count"
              type="number"
              min={1}
              max={500}
              value={triviaCount}
              onChange={(event) => setTriviaCount(clampQuestionCount(Number(event.target.value)))}
            />
            <label htmlFor="trivia-category">Category</label>
            <select
              id="trivia-category"
              value={categorySelection}
              onChange={(event) => setCategorySelection(event.target.value)}
            >
              <option value="all">All categories</option>
              {categories.map((category) => (
                <option key={category.id} value={String(category.id)}>
                  {category.name}
                </option>
              ))}
            </select>
            {isLoadingCategories && <p className="trivia-setup-note">Loading categories...</p>}
            <fieldset className="trivia-difficulty-picker">
              <legend>Difficulty</legend>
              {DIFFICULTY_ORDER.map((difficulty) => (
                <label key={difficulty} className="trivia-difficulty-option">
                  <input
                    type="checkbox"
                    checked={selectedDifficultySet.has(difficulty)}
                    onChange={() => toggleDifficulty(difficulty)}
                  />
                  <span>{difficulty}</span>
                </label>
              ))}
            </fieldset>
            <button
              type="button"
              className="btn btn-primary"
              onClick={startRound}
              disabled={selectedDifficulties.length === 0}
            >
              Start round
            </button>
          </div>
        ) : (
          <p>Waiting for host to start the round...</p>
        )}
      </section>
    );
  }

  if (state.status === "loading") {
    const totalCalls = state.loading?.totalCalls ?? 1;
    const completedCalls = Math.min(state.loading?.completedCalls ?? 0, totalCalls);
    const percent = Math.round((completedCalls / totalCalls) * 100);
    return (
      <section className="card game-card-trivia">
        <header className="card-head">
          <h2>Trivia</h2>
          <span className="pill pill-status pill-status-idle">Building round</span>
        </header>
        <div className="trivia-loading">
          <p>{state.loading?.message ?? "Loading trivia questions..."}</p>
          <progress max={totalCalls} value={completedCalls} />
          <p className="trivia-loading-progress">
            {completedCalls}/{totalCalls} API calls complete ({percent}%)
          </p>
        </div>
      </section>
    );
  }

  if (state.status === "finished") {
    return (
      <section className="card game-card-trivia">
        <header className="card-head">
          <h2>Trivia</h2>
          <span className="pill pill-status pill-status-finished">Finished</span>
        </header>
        <p>That's it for this round. Check the scoreboard!</p>
        {isHost && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => send({ type: "game:start", payload: { game: "trivia" } })}
          >
            Play again
          </button>
        )}
      </section>
    );
  }

  return (
    <section className="card game-card-trivia">
      <header className="card-head">
        <h2>Trivia</h2>
        <span className={`pill pill-status pill-status-${state.status}`}>{statusLabel}</span>
      </header>

      {question && (
        <div className="trivia-question">
          <div className="trivia-meta">
            <span className="tag tag-neutral">{question.category}</span>
            <span className={`tag tag-difficulty tag-difficulty-${question.difficulty}`}>
              {question.difficulty}
            </span>
          </div>
          <h3 className="trivia-prompt">{question.question}</h3>

          <div className="trivia-options">
            {question.options.map((option) => {
              const isMyAnswer = myAnswer === option || pickedAnswer === option;
              const isCorrect = state.status === "questionClosed" && option === question.correctAnswer;
              const isWrongPick =
                state.status === "questionClosed" && isMyAnswer && option !== question.correctAnswer;
              const disabled = state.status !== "questionOpen" || Boolean(myAnswer);
              return (
                <button
                  key={option}
                  type="button"
                  className={[
                    "trivia-option",
                    isMyAnswer ? "is-picked" : "",
                    isCorrect ? "is-correct" : "",
                    isWrongPick ? "is-wrong" : ""
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  disabled={disabled}
                  onClick={() => pickOption(option)}
                >
                  {option}
                </button>
              );
            })}
          </div>

          {state.status === "questionOpen" && (
            <p>
              {everyoneAnswered
                ? isHost
                  ? "Everyone has answered. You can check answers now."
                  : "Everyone has answered. Waiting for the host to check answers."
                : `${answeredCount}/${totalParticipants} answered`}
            </p>
          )}

          {state.status === "questionClosed" && (
            <div className="trivia-review">
              <p>
                Correct answer: <strong>{question.correctAnswer}</strong>
              </p>
              <ul className="trivia-review-list">
                {Object.entries(state.answers).map(([participantId, answer]) => {
                  const participant = session.participants.find((p) => p.id === participantId);
                  const correct = answer === question.correctAnswer;
                  return (
                    <li key={participantId}>
                      <span>{participant?.displayName ?? participantId}</span>
                      <span className={correct ? "tag tag-truth" : "tag tag-lie"}>
                        {correct ? "Correct" : answer}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}

      {isHost && (
        <div className="row">
          {state.status === "questionOpen" && everyoneAnswered && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => send({ type: "trivia:closeQuestion", payload: {} })}
            >
              Check answers
            </button>
          )}
          {state.status === "questionClosed" && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => send({ type: "trivia:nextQuestion", payload: {} })}
            >
              Next question
            </button>
          )}
        </div>
      )}
    </section>
  );
}
