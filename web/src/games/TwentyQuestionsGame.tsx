import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import type { ClientEvent, SessionState } from "../../../shared/contracts";
import {
  TWENTY_QUESTIONS_ITEM_MAX_CHARS,
  TWENTY_QUESTIONS_QUESTION_MAX_CHARS
} from "../../../shared/contracts";

const DRAFT_DEBOUNCE_MS = 120;

export function TwentyQuestionsGame({
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
  const game = session.gameState?.type === "twentyQuestions" ? session.gameState : null;
  const [itemText, setItemText] = useState("");
  const [questionInput, setQuestionInput] = useState("");
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushDraftTimer = useCallback(() => {
    if (draftTimerRef.current) {
      clearTimeout(draftTimerRef.current);
      draftTimerRef.current = null;
    }
  }, []);

  useEffect(
    () => () => {
      flushDraftTimer();
    },
    [flushDraftTimer]
  );

  useEffect(() => {
    if (!game || game.state.status !== "playing") {
      return;
    }
    const st = game.state;
    const pending = st.questionLog.some((e) => e.answer === null);
    if (pending || st.currentAskerId !== currentParticipantId) {
      flushDraftTimer();
      setQuestionInput("");
    }
  }, [game, currentParticipantId, flushDraftTimer]);

  if (!game) {
    return null;
  }

  const state = game.state;
  const selector = session.participants.find((p) => p.id === state.itemSelectorId);
  const selectorName = selector?.displayName ?? "Item selector";
  const isSelector = currentParticipantId === state.itemSelectorId;

  const scheduleDraftSend = (text: string) => {
    flushDraftTimer();
    draftTimerRef.current = setTimeout(() => {
      draftTimerRef.current = null;
      send({ type: "twentyQuestions:questionDraft", payload: { text } });
    }, DRAFT_DEBOUNCE_MS);
  };

  if (state.status === "waitingForItem") {
    const submitItem = (event: FormEvent) => {
      event.preventDefault();
      const trimmed = itemText.trim();
      if (!trimmed) return;
      send({ type: "twentyQuestions:setItem", payload: { text: trimmed } });
      setItemText("");
    };

    return (
      <div className="twenty-questions card">
        <header className="card-head">
          <h2>20 Questions</h2>
          <p className="mode-option-hint">
            Up to {state.maxQuestions} question{state.maxQuestions === 1 ? "" : "s"}. {selectorName} picks the secret.
          </p>
        </header>
        {isSelector ? (
          <form className="twenty-questions-stack" onSubmit={submitItem}>
            <label htmlFor="twenty-q-item">Select a person, place, or thing.</label>
            <textarea
              id="twenty-q-item"
              className="icebreaker-textarea"
              rows={3}
              maxLength={TWENTY_QUESTIONS_ITEM_MAX_CHARS}
              value={itemText}
              onChange={(event) => setItemText(event.target.value)}
              placeholder="Only you will see this until the round ends."
            />
            <button type="submit" className="btn btn-primary">
              OK — start game
            </button>
          </form>
        ) : (
          <p className="twenty-questions-muted">Waiting for {selectorName} to choose the secret item…</p>
        )}
      </div>
    );
  }

  if (state.status === "finished") {
    const teamWon = state.outcome === "team";
    return (
      <div className="twenty-questions card">
        <header className="card-head">
          <h2>Round over</h2>
        </header>
        <p>{teamWon ? "The team guessed it in time." : "The team used all questions without solving it."}</p>
        <p>
          <strong>It was:</strong> {state.revealedItem}
        </p>
        <p className="twenty-questions-muted">
          {isHost ? "Use Restart game or End game in the sidebar." : "Waiting for the host…"}
        </p>
      </div>
    );
  }

  const pending = state.questionLog.find((entry) => entry.answer === null);
  const isAsker = state.currentAskerId === currentParticipantId;
  const asker = session.participants.find((p) => p.id === state.currentAskerId);

  const submitQuestion = (event: FormEvent) => {
    event.preventDefault();
    if (!isAsker || pending) return;
    const trimmed = questionInput.trim();
    if (!trimmed) return;
    flushDraftTimer();
    send({ type: "twentyQuestions:submitQuestion", payload: { text: trimmed } });
    setQuestionInput("");
  };

  const onQuestionChange = (value: string) => {
    const clipped = value.slice(0, TWENTY_QUESTIONS_QUESTION_MAX_CHARS);
    setQuestionInput(clipped);
    if (isAsker && !pending) {
      scheduleDraftSend(clipped);
    }
  };

  return (
    <div className="twenty-questions card">
      <header className="card-head">
        <h2>20 Questions</h2>
        <p className="mode-option-hint">
          Questions used: {state.questionsUsed} / {state.maxQuestions}. Oracle: {selectorName}
        </p>
      </header>

      <section className="twenty-questions-stack" aria-live="polite">
        <p>
          <strong>Turn to ask:</strong> {asker?.displayName ?? "—"}
        </p>
        {state.questionDraft && (
          <div className="twenty-questions-draft">
            <span className="twenty-questions-muted">Typing…</span>{" "}
            <span>
              {session.participants.find((p) => p.id === state.questionDraft!.participantId)?.displayName ?? "Someone"}
              : {state.questionDraft.text || "(empty)"}
            </span>
          </div>
        )}
      </section>

      {pending && (
        <div className="twenty-questions-stack twenty-questions-pending">
          <p>
            <strong>Open question:</strong> {pending.text}
          </p>
          {isSelector ? (
            <div className="twenty-questions-btn-row">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() =>
                  send({
                    type: "twentyQuestions:answer",
                    payload: { questionId: pending.id, answer: "yes" }
                  })
                }
              >
                Yes
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() =>
                  send({
                    type: "twentyQuestions:answer",
                    payload: { questionId: pending.id, answer: "no" }
                  })
                }
              >
                No
              </button>
            </div>
          ) : (
            <p className="twenty-questions-muted">Waiting for {selectorName} to answer yes or no.</p>
          )}
        </div>
      )}

      {isAsker && !pending && (
        <form className="twenty-questions-stack" onSubmit={submitQuestion}>
          <label htmlFor="twenty-q-question">Your question</label>
          <textarea
            id="twenty-q-question"
            className="icebreaker-textarea"
            rows={2}
            maxLength={TWENTY_QUESTIONS_QUESTION_MAX_CHARS}
            value={questionInput}
            onChange={(event) => onQuestionChange(event.target.value)}
          />
          <button type="submit" className="btn btn-primary">
            OK — send question
          </button>
        </form>
      )}

      {isSelector && !pending && (
        <div className="twenty-questions-stack">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => send({ type: "twentyQuestions:teamSolved", payload: {} })}
          >
            Team guessed the item
          </button>
          <p className="twenty-questions-muted twenty-questions-hint">
            Use when everyone has figured it out (no open question).
          </p>
        </div>
      )}

      <section className="twenty-questions-log">
        <h3>Questions so far</h3>
        {state.questionLog.length === 0 ? (
          <p className="twenty-questions-muted">None yet.</p>
        ) : (
          <ol className="twenty-questions-log-list">
            {state.questionLog.map((entry) => {
              const who = session.participants.find((p) => p.id === entry.participantId)?.displayName ?? "Player";
              const ans =
                entry.answer === null ? "…" : entry.answer === "yes" ? "Yes" : "No";
              return (
                <li key={entry.id}>
                  <span className="twenty-questions-log-who">{who}:</span> {entry.text}{" "}
                  <span className="twenty-questions-muted">— {ans}</span>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}
