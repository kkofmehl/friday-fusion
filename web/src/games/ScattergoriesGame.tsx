import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  SCATTERGORIES_ANSWER_DURATIONS_MS,
  SCATTERGORIES_ANSWER_MAX_CHARS,
  type ClientEvent,
  type ScattergoriesListSummary,
  type SessionState
} from "../../../shared/contracts";
import { isScattergoriesDuplicateAt } from "../../../shared/scattergoriesDuplicates";
import { countLetterWords } from "../../../shared/scattergoriesScoring";
import { activeParticipants } from "../utils/participants";

const DURATION_LABELS: Record<number, string> = {
  60_000: "60 seconds",
  90_000: "90 seconds",
  120_000: "2 minutes",
  180_000: "3 minutes"
};

function answerFailsLetterCheck(text: string, letter: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return false;
  }
  return trimmed[0]!.toUpperCase() !== letter.toUpperCase();
}

export function ScattergoriesGame({
  session,
  currentParticipantId,
  isHost,
  canPlay,
  send,
  apiBase
}: {
  session: SessionState;
  currentParticipantId: string;
  isHost: boolean;
  canPlay: boolean;
  send: (event: ClientEvent) => void;
  apiBase: string;
}): JSX.Element | null {
  const game = session.gameState?.type === "scattergories" ? session.gameState : null;
  const state = game?.state;
  const [lists, setLists] = useState<ScattergoriesListSummary[]>([]);
  const [localAnswers, setLocalAnswers] = useState<string[]>([]);
  const [, setTick] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isHost) {
      return;
    }
    let cancelled = false;
    fetch(`${apiBase}/api/scattergories/lists`)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`List fetch failed (${response.status})`);
        }
        return (await response.json()) as ScattergoriesListSummary[];
      })
      .then((payload) => {
        if (!cancelled) {
          setLists(payload);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLists([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [apiBase, isHost]);

  useEffect(() => {
    if (!state || state.status !== "answering") {
      return;
    }
    const mine = state.answers[currentParticipantId];
    if (mine) {
      setLocalAnswers(mine);
    } else {
      setLocalAnswers(Array.from({ length: state.prompts.length }, () => ""));
    }
  }, [state, currentParticipantId]);

  useEffect(() => {
    if (state?.status !== "countdown" && state?.status !== "answering") {
      return;
    }
    const id = window.setInterval(() => setTick((t) => t + 1), 250);
    return () => window.clearInterval(id);
  }, [state?.status]);

  const pushAnswers = useCallback(
    (answers: string[]) => {
      if (!canPlay) {
        return;
      }
      send({ type: "scattergories:updateAnswers", payload: { answers } });
    },
    [canPlay, send]
  );

  const schedulePush = useCallback(
    (answers: string[]) => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      debounceRef.current = setTimeout(() => {
        pushAnswers(answers);
      }, 300);
    },
    [pushAnswers]
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const roster = useMemo(() => activeParticipants(session.participants), [session.participants]);
  const nameFor = (id: string): string =>
    roster.find((p) => p.id === id)?.displayName ?? "Player";

  if (!game || !state) {
    return null;
  }

  const statusLabel =
    state.status === "idle"
      ? "Setup"
      : state.status === "countdown"
      ? "Get ready"
      : state.status === "answering"
      ? "Go!"
      : state.status === "reviewing"
      ? `Review ${state.currentPromptIndex + 1} / ${state.prompts.length}`
      : "Round complete";

  const setupPanel = () => (
    <>
      {isHost ? (
        <div className="scattergories-setup">
          <div className="scattergories-setup-row">
            <label className="scattergories-label" htmlFor="scattergories-list">
              Category card
            </label>
            <div className="scattergories-setup-controls">
              <select
                id="scattergories-list"
                className="scattergories-select"
                value={state.listId}
                onChange={(e) =>
                  send({ type: "scattergories:selectList", payload: { listId: e.target.value } })
                }
              >
                {lists.length === 0 ? (
                  <option value={state.listId}>{state.listTitle}</option>
                ) : (
                  lists.map((list) => (
                    <option key={list.id} value={list.id}>
                      {list.title}
                    </option>
                  ))
                )}
              </select>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => send({ type: "scattergories:randomList", payload: {} })}
              >
                Random card
              </button>
            </div>
          </div>
          <div className="scattergories-setup-row">
            <span className="scattergories-label">Round letter</span>
            <div className="scattergories-letter-row">
              <span className="scattergories-letter" aria-live="polite">
                {state.letter ?? "—"}
              </span>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => send({ type: "scattergories:drawLetter", payload: {} })}
              >
                Draw letter
              </button>
            </div>
          </div>
          <div className="scattergories-setup-row">
            <label className="scattergories-label" htmlFor="scattergories-duration">
              Answer time
            </label>
            <select
              id="scattergories-duration"
              className="scattergories-select"
              value={state.answerDurationMs}
              onChange={(e) =>
                send({
                  type: "scattergories:setDuration",
                  payload: {
                    answerDurationMs: Number(e.target.value) as (typeof SCATTERGORIES_ANSWER_DURATIONS_MS)[number]
                  }
                })
              }
            >
              {SCATTERGORIES_ANSWER_DURATIONS_MS.map((ms) => (
                <option key={ms} value={ms}>
                  {DURATION_LABELS[ms]}
                </option>
              ))}
            </select>
          </div>
          <ul className="scattergories-prompt-preview" aria-label="Prompts on this card">
            {state.prompts.map((prompt, i) => (
              <li key={prompt}>
                <span className="scattergories-prompt-num">{i + 1}.</span> {prompt}
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!state.letter}
            onClick={() => send({ type: "scattergories:startRound", payload: {} })}
          >
            Start round
          </button>
        </div>
      ) : (
        <p className="mode-option-hint">Waiting for the host to set up the round…</p>
      )}
    </>
  );

  if (state.status === "idle") {
    return (
      <section className="card game-card-scattergories">
        <header className="card-head">
          <h2>Scattergories</h2>
          <span className="pill pill-status">{statusLabel}</span>
        </header>
        {setupPanel()}
      </section>
    );
  }

  if (state.status === "roundComplete") {
    return (
      <section className="card game-card-scattergories">
        <header className="card-head">
          <h2>Scattergories</h2>
          <span className="pill pill-status pill-status-finished">{statusLabel}</span>
        </header>
        <p className="scattergories-round-summary">
          Letter <strong>{state.letter}</strong> · {state.listTitle}
        </p>
        <ol className="scattergories-standings">
          {state.roundScores.map((row, i) => (
            <li key={row.participantId} className="scattergories-standing-row">
              <span className="scattergories-standing-rank">{i + 1}.</span>
              <span>{nameFor(row.participantId)}</span>
              <span className="scattergories-standing-pts">+{row.pointsThisRound} this round</span>
            </li>
          ))}
        </ol>
        <p className="scores-note">Session scores are in the sidebar.</p>
        {isHost ? (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => send({ type: "scattergories:newRound", payload: {} })}
          >
            New round
          </button>
        ) : (
          <p className="mode-option-hint">Waiting for the host to start another round…</p>
        )}
      </section>
    );
  }

  if (state.status === "countdown") {
    const msLeft = Math.max(0, state.countdownEndsAt - Date.now());
    const seconds = Math.ceil(msLeft / 1000) || 1;
    return (
      <section className="card game-card-scattergories">
        <header className="card-head">
          <h2>Scattergories</h2>
          <span className="pill pill-status">{statusLabel}</span>
        </header>
        <p className="scattergories-meta">
          <span className="scattergories-letter scattergories-letter--inline">{state.letter}</span>
          <span>{state.listTitle}</span>
        </p>
        <p className="scattergories-countdown" aria-live="polite">
          {seconds}
        </p>
      </section>
    );
  }

  if (state.status === "reviewing") {
    const prompt = state.prompts[state.currentPromptIndex] ?? "";
    const allMarked = roster.every(
      (p) => state.verdicts[p.id] === "valid" || state.verdicts[p.id] === "invalid"
    );
    const isLast = state.currentPromptIndex + 1 >= state.prompts.length;

    return (
      <section className="card game-card-scattergories">
        <header className="card-head">
          <h2>Scattergories</h2>
          <span className="pill pill-status pill-status-revealing">{statusLabel}</span>
        </header>
        <p className="scattergories-meta">
          <span className="scattergories-letter scattergories-letter--inline">{state.letter}</span>
          <span>{state.listTitle}</span>
        </p>
        <h3 className="scattergories-review-prompt">
          {state.currentPromptIndex + 1}. {prompt}
        </h3>
        <ul className="scattergories-review-list">
          {state.revealedAnswers.map((row) => {
            const verdict = state.verdicts[row.participantId];
            const isBlank = row.text.trim().length === 0;
            const preview =
              verdict === "valid" ? countLetterWords(row.text, state.letter) : 0;
            return (
              <li
                key={row.participantId}
                className={`scattergories-review-row${
                  row.isDuplicate ? " scattergories-review-row--duplicate" : ""
                }`}
              >
                <div className="scattergories-review-main">
                  <strong>{nameFor(row.participantId)}</strong>
                  <span className="scattergories-review-answer">
                    {isBlank ? <em>(blank)</em> : row.text}
                  </span>
                  {row.isDuplicate && (
                    <span className="scattergories-duplicate-badge">Duplicate word</span>
                  )}
                  {isBlank && (
                    <span className="scattergories-auto-verdict">No point (blank)</span>
                  )}
                  {preview > 0 && (
                    <span className="scattergories-points-preview">+{preview}</span>
                  )}
                </div>
                {isHost && !isBlank && (
                  <div className="scattergories-verdicts">
                    <button
                      type="button"
                      className={`scattergories-verdict-btn scattergories-verdict-btn--valid${
                        verdict === "valid" ? " is-active" : ""
                      }`}
                      aria-label={`Accept answer from ${nameFor(row.participantId)}`}
                      disabled={row.isDuplicate}
                      title={row.isDuplicate ? "Duplicate answers cannot be accepted" : undefined}
                      onClick={() =>
                        send({
                          type: "scattergories:markAnswer",
                          payload: {
                            promptIndex: state.currentPromptIndex,
                            participantId: row.participantId,
                            valid: true
                          }
                        })
                      }
                    >
                      ✓
                    </button>
                    <button
                      type="button"
                      className={`scattergories-verdict-btn scattergories-verdict-btn--invalid${
                        verdict === "invalid" ? " is-active" : ""
                      }`}
                      aria-label={`Reject answer from ${nameFor(row.participantId)}`}
                      onClick={() =>
                        send({
                          type: "scattergories:markAnswer",
                          payload: {
                            promptIndex: state.currentPromptIndex,
                            participantId: row.participantId,
                            valid: false
                          }
                        })
                      }
                    >
                      ✗
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {isHost && (
          <button
            type="button"
            className="btn btn-primary"
            disabled={!allMarked}
            onClick={() => send({ type: "scattergories:nextPrompt", payload: {} })}
          >
            {isLast ? "Finish round" : "Next prompt"}
          </button>
        )}
        {!isHost && (
          <p className="mode-option-hint">The host is scoring answers for this prompt.</p>
        )}
      </section>
    );
  }

  if (state.status === "answering") {
    const msLeft = Math.max(0, state.roundEndsAt - Date.now());
    const timerPct = Math.min(100, (msLeft / state.answerDurationMs) * 100);
    const secondsLeft = Math.ceil(msLeft / 1000);

    const onAnswerChange = (index: number, value: string) => {
      const next = [...localAnswers];
      next[index] = value.slice(0, SCATTERGORIES_ANSWER_MAX_CHARS);
      setLocalAnswers(next);
      schedulePush(next);
    };

    return (
      <section className="card game-card-scattergories">
        <header className="card-head">
          <h2>Scattergories</h2>
          <span className="pill pill-status pill-status-collecting">{statusLabel}</span>
        </header>
        <p className="scattergories-meta">
          <span className="scattergories-letter scattergories-letter--inline">{state.letter}</span>
          <span>{state.listTitle}</span>
        </p>
        <div className="scattergories-timer-subtle" aria-label="Time remaining">
          <div className="scattergories-timer-bar">
            <div className="scattergories-timer-fill" style={{ width: `${timerPct}%` }} />
          </div>
          <span className="scattergories-timer-text">{secondsLeft}s</span>
        </div>
        <ol className="scattergories-answer-grid">
          {state.prompts.map((prompt, index) => {
            const value = localAnswers[index] ?? "";
            const invalidLetter = answerFailsLetterCheck(value, state.letter);
            const invalidDuplicate = isScattergoriesDuplicateAt(localAnswers, index);
            const invalid = invalidLetter || invalidDuplicate;
            return (
              <li key={prompt} className="scattergories-answer-row">
                <label className="scattergories-answer-label" htmlFor={`scat-ans-${index}`}>
                  <span className="scattergories-prompt-num">{index + 1}.</span> {prompt}
                </label>
                <input
                  id={`scat-ans-${index}`}
                  type="text"
                  className={`scattergories-input${invalid ? " scattergories-input--invalid" : ""}`}
                  aria-invalid={invalid || undefined}
                  title={
                    invalidDuplicate
                      ? "Each answer must be a different word"
                      : invalidLetter
                      ? `Must start with ${state.letter}`
                      : undefined
                  }
                  value={value}
                  maxLength={SCATTERGORIES_ANSWER_MAX_CHARS}
                  disabled={!canPlay}
                  autoComplete="off"
                  onChange={(e) => onAnswerChange(index, e.target.value)}
                />
              </li>
            );
          })}
        </ol>
      </section>
    );
  }

  return null;
}
