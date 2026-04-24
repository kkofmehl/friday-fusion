import { useState } from "react";
import type { ClientEvent, SessionState } from "../../../shared/contracts";

export function TriviaGame({
  session,
  currentParticipantId,
  isHost,
  send
}: {
  session: SessionState;
  currentParticipantId: string;
  isHost: boolean;
  send: (event: ClientEvent) => void;
}): JSX.Element | null {
  const [triviaCount, setTriviaCount] = useState(5);
  const [pickedAnswer, setPickedAnswer] = useState<string | null>(null);

  if (session.gameState?.type !== "trivia") return null;
  const state = session.gameState.state;
  const myAnswer = state.answers[currentParticipantId] ?? null;
  const question = state.activeQuestion;

  const statusLabel =
    state.status === "idle"
      ? "Not started"
      : state.status === "questionOpen"
      ? `Question ${state.questionIndex + 1} of ${state.totalQuestions}`
      : state.status === "questionClosed"
      ? "Reviewing"
      : "Finished";

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
              max={20}
              value={triviaCount}
              onChange={(event) => setTriviaCount(Number(event.target.value))}
            />
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => send({ type: "trivia:start", payload: { totalQuestions: triviaCount } })}
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
          {state.status === "questionOpen" && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => send({ type: "trivia:closeQuestion", payload: {} })}
            >
              Close question
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
