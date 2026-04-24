import { useCallback, useEffect, useState } from "react";
import type { ClipboardEvent } from "react";
import type { ClientEvent, SessionState } from "../../../shared/contracts";
import { imageFileFromClipboard } from "../utils/imageClipboardPaste";

const clampQuestionCount = (value: number): number => {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(500, Math.floor(value)));
};

export function IcebreakerGame({
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
  const [questionCount, setQuestionCount] = useState(5);
  const [answerText, setAnswerText] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [revealTargetId, setRevealTargetId] = useState("");
  const [submitBusy, setSubmitBusy] = useState(false);

  const icebreakerGame = session.gameState?.type === "icebreaker" ? session.gameState : null;
  const state = icebreakerGame?.state;
  const mySubmitted = (state?.submittedParticipantIds ?? []).includes(currentParticipantId);

  useEffect(() => {
    if (!pendingFile) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(pendingFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pendingFile]);

  useEffect(() => {
    if (state?.status !== "collecting") {
      return;
    }
    setAnswerText("");
    setPendingFile(null);
    setSubmitBusy(false);
  }, [state?.questionIndex, state?.status]);

  const handlePasteImage = useCallback(
    (event: ClipboardEvent) => {
      if (mySubmitted || state?.status !== "collecting" || submitBusy) {
        return;
      }
      const file = imageFileFromClipboard(event);
      if (!file) {
        return;
      }
      event.preventDefault();
      setPendingFile(file);
    },
    [mySubmitted, state?.status, submitBusy]
  );

  useEffect(() => {
    if (!state || state.status !== "revealing") {
      setRevealTargetId("");
      return;
    }
    const remaining = session.participants.filter(
      (p) =>
        state.submittedParticipantIds.includes(p.id) && !state.revealed.some((r) => r.participantId === p.id)
    );
    const next = remaining[0]?.id ?? "";
    setRevealTargetId((current) => {
      if (current && remaining.some((p) => p.id === current)) {
        return current;
      }
      return next;
    });
  }, [state?.status, state?.revealed, state?.submittedParticipantIds, session.participants]);

  if (!icebreakerGame || !state) {
    return null;
  }

  const question = state.activeQuestion;
  const totalParticipants = session.participants.length;
  const submittedCount = state.submittedParticipantIds.length;
  const everyoneSubmitted =
    totalParticipants > 0 && session.participants.every((p) => state.submittedParticipantIds.includes(p.id));

  const startRound = () => {
    send({
      type: "icebreaker:startRound",
      payload: { totalQuestions: clampQuestionCount(questionCount) }
    });
  };

  const submitAnswer = async () => {
    const text = answerText.trim();
    let imageFileId: string | null = null;
    if (pendingFile) {
      setSubmitBusy(true);
      try {
        const body = new FormData();
        body.append("participantId", currentParticipantId);
        body.append("file", pendingFile);
        const response = await fetch(`${apiBase}/api/sessions/${session.sessionId}/icebreaker/upload`, {
          method: "POST",
          body
        });
        const payload = (await response.json().catch(() => ({}))) as { fileId?: string; message?: string };
        if (!response.ok) {
          throw new Error(payload.message ?? `Upload failed (${response.status})`);
        }
        if (!payload.fileId) {
          throw new Error("Upload did not return a file id.");
        }
        imageFileId = payload.fileId;
      } catch {
        setSubmitBusy(false);
        return;
      }
      setSubmitBusy(false);
    }
    if (text.length === 0 && !imageFileId) {
      return;
    }
    send({ type: "icebreaker:submit", payload: { text, imageFileId } });
  };

  const statusLabel =
    state.status === "idle"
      ? "Not started"
      : state.status === "collecting"
        ? `Question ${state.questionIndex + 1} of ${state.totalQuestions}`
        : state.status === "revealing"
          ? "Revealing"
          : "Finished";

  if (state.status === "idle") {
    return (
      <section className="card game-card-icebreaker">
        <header className="card-head">
          <h2>Icebreaker Questions</h2>
          <span className="pill pill-status pill-status-idle">{statusLabel}</span>
        </header>
        {isHost ? (
          <div className="icebreaker-setup trivia-setup">
            <label htmlFor="icebreaker-count">How many questions?</label>
            <input
              id="icebreaker-count"
              type="number"
              min={1}
              max={500}
              value={questionCount}
              onChange={(event) => setQuestionCount(clampQuestionCount(Number(event.target.value)))}
            />
            <button type="button" className="btn btn-primary" onClick={startRound}>
              Start round
            </button>
          </div>
        ) : (
          <p>Waiting for the host to start the round...</p>
        )}
      </section>
    );
  }

  if (state.status === "finished") {
    return (
      <section className="card game-card-icebreaker">
        <header className="card-head">
          <h2>Icebreaker Questions</h2>
          <span className="pill pill-status pill-status-finished">{statusLabel}</span>
        </header>
        {state.revealed.length > 0 && (
          <ul className="icebreaker-revealed-list">
            {state.revealed.map((entry) => {
              const participant = session.participants.find((p) => p.id === entry.participantId);
              return (
                <li key={entry.participantId} className="icebreaker-reveal-card">
                  <strong>{participant?.displayName ?? entry.participantId}</strong>
                  {entry.text.trim().length > 0 && <p>{entry.text}</p>}
                  {entry.imageUrl && (
                    <img
                      className="icebreaker-reveal-img"
                      src={`${apiBase}${entry.imageUrl}`}
                      alt=""
                      loading="lazy"
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <p className="icebreaker-finished-note">That is the end of this round.</p>
        {isHost && (
          <button type="button" className="btn btn-primary" onClick={startRound}>
            Play again
          </button>
        )}
      </section>
    );
  }

  return (
    <section className="card game-card-icebreaker">
      <header className="card-head">
        <h2>Icebreaker Questions</h2>
        <span className={`pill pill-status pill-status-${state.status}`}>{statusLabel}</span>
      </header>

      {question && (
        <div className="icebreaker-question">
          <h3 className="trivia-prompt">{question.text}</h3>

          {state.status === "collecting" && (
            <div className="icebreaker-answer-form" onPaste={handlePasteImage}>
              {!mySubmitted ? (
                <>
                  <label htmlFor="icebreaker-answer">Your answer</label>
                  <textarea
                    id="icebreaker-answer"
                    className="icebreaker-textarea"
                    rows={4}
                    value={answerText}
                    onChange={(event) => setAnswerText(event.target.value)}
                    onPaste={handlePasteImage}
                    placeholder="Share your answer, attach an image below, or paste an image (⌘V / Ctrl+V) here"
                  />
                  <p className="icebreaker-paste-hint">JPEG, PNG, GIF, or WebP — from file or clipboard.</p>
                  <label htmlFor="icebreaker-image" className="icebreaker-file-label">
                    Optional image
                  </label>
                  <input
                    id="icebreaker-image"
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    onChange={(event) => setPendingFile(event.target.files?.[0] ?? null)}
                  />
                  {previewUrl && (
                    <img className="icebreaker-preview" src={previewUrl} alt="" />
                  )}
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={submitBusy || (answerText.trim().length === 0 && !pendingFile)}
                    onClick={() => void submitAnswer()}
                  >
                    {submitBusy ? "Uploading…" : "Submit"}
                  </button>
                </>
              ) : (
                <div className="icebreaker-submitted-self">
                  <p>You have submitted your answer.</p>
                  {answerText.trim().length > 0 && <p className="icebreaker-self-text">{answerText}</p>}
                  {previewUrl && <img className="icebreaker-preview" src={previewUrl} alt="" />}
                </div>
              )}
              <p className="icebreaker-progress">
                {everyoneSubmitted
                  ? isHost
                    ? "Everyone has submitted. Begin reveals when you are ready."
                    : "Everyone has submitted. Waiting for the host…"
                  : `${submittedCount}/${totalParticipants} submitted`}
              </p>
            </div>
          )}

          {state.status === "revealing" && (
            <div className="icebreaker-reveal-stage">
              <ul className="icebreaker-revealed-list">
                {state.revealed.map((entry) => {
                  const participant = session.participants.find((p) => p.id === entry.participantId);
                  return (
                    <li key={entry.participantId} className="icebreaker-reveal-card">
                      <strong>{participant?.displayName ?? entry.participantId}</strong>
                      {entry.text.trim().length > 0 && <p>{entry.text}</p>}
                      {entry.imageUrl && (
                        <img
                          className="icebreaker-reveal-img"
                          src={`${apiBase}${entry.imageUrl}`}
                          alt=""
                          loading="lazy"
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}

      {isHost && state.status === "collecting" && everyoneSubmitted && (
        <div className="row">
          <button type="button" className="btn btn-ghost" onClick={() => send({ type: "icebreaker:beginReveals", payload: {} })}>
            Begin reveals
          </button>
        </div>
      )}

      {isHost && state.status === "revealing" && (
        <div className="icebreaker-host-controls">
          <div className="row icebreaker-reveal-row">
            <label htmlFor="icebreaker-reveal-select">Reveal next</label>
            <select
              id="icebreaker-reveal-select"
              value={revealTargetId}
              onChange={(event) => setRevealTargetId(event.target.value)}
            >
              <option value="">Choose a player</option>
              {session.participants
                .filter(
                  (p) =>
                    state.submittedParticipantIds.includes(p.id) &&
                    !state.revealed.some((r) => r.participantId === p.id)
                )
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.displayName}
                  </option>
                ))}
            </select>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={!revealTargetId}
              onClick={() => {
                send({ type: "icebreaker:reveal", payload: { participantId: revealTargetId } });
              }}
            >
              Reveal
            </button>
          </div>
          <div className="row">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                const stillToReveal = session.participants.filter(
                  (p) =>
                    state.submittedParticipantIds.includes(p.id) &&
                    !state.revealed.some((r) => r.participantId === p.id)
                );
                if (stillToReveal.length > 0) {
                  const proceed = window.confirm(
                    "There are still presenters left, are you sure you want to proceed to the next question?"
                  );
                  if (!proceed) {
                    return;
                  }
                }
                send({ type: "icebreaker:nextQuestion", payload: {} });
              }}
            >
              Next question
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
