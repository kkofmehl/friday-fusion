import { useCallback, useEffect, useMemo, useState } from "react";
import type { ClipboardEvent } from "react";
import type { ClientEvent, SessionState } from "../../../shared/contracts";
import { imageFileFromClipboard } from "../utils/imageClipboardPaste";
import { activeParticipants } from "../utils/participants";

const clampQuestionCount = (value: number): number => {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(500, Math.floor(value)));
};

export function GuessWhoSaidItGame({
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
  const [submitBusy, setSubmitBusy] = useState(false);
  const [draftVotes, setDraftVotes] = useState<Record<string, string>>({});

  const gws = session.gameState?.type === "guessWhoSaidIt" ? session.gameState : null;
  const state = gws?.state;

  useEffect(() => {
    if (!pendingFile) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(pendingFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pendingFile]);

  const collectingKey =
    state?.status === "collecting" ? state.questionIndex : -1;
  useEffect(() => {
    if (state?.status !== "collecting") {
      return;
    }
    setAnswerText("");
    setPendingFile(null);
    setSubmitBusy(false);
  }, [collectingKey, state?.status]);

  const votingResetKey =
    state?.status === "voting"
      ? `${state.currentQuestionIndex}-${state.prompt.question.id}`
      : "";
  useEffect(() => {
    if (state?.status === "voting") {
      setDraftVotes({});
    }
  }, [state?.status, votingResetKey]);

  const handlePasteImage = useCallback(
    (event: ClipboardEvent) => {
      const mySubmitted =
        state?.status === "collecting" && state.submittedParticipantIds.includes(currentParticipantId);
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
    [currentParticipantId, state, submitBusy]
  );

  const voteSlotIds = useMemo(() => {
    if (state?.status !== "voting") {
      return [] as string[];
    }
    return state.prompt.slots.map((sl) => sl.slotId);
  }, [state]);

  if (!gws || !state) {
    return null;
  }

  const question = state.status === "collecting" ? state.activeQuestion : null;
  const roster = activeParticipants(session.participants);
  const totalParticipants = roster.length;
  const submittedCount =
    state.status === "collecting"
      ? state.submittedParticipantIds.filter((id) => roster.some((p) => p.id === id)).length
      : 0;
  const everyoneSubmitted =
    state.status === "collecting" &&
    totalParticipants > 0 &&
    roster.every((p) => state.submittedParticipantIds.includes(p.id));

  const guessOptions = roster.filter((p) => p.id !== currentParticipantId);

  const votesComplete =
    state.status === "voting" &&
    voteSlotIds.length > 0 &&
    voteSlotIds.every((id) => Boolean(draftVotes[id]?.trim()));

  const startRound = () => {
    send({
      type: "guessWhoSaidIt:startRound",
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
        const response = await fetch(`${apiBase}/api/sessions/${session.sessionId}/guess-who-said-it/upload`, {
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
    send({ type: "guessWhoSaidIt:submitAnswer", payload: { text, imageFileId } });
  };

  const statusLabel =
    state.status === "idle"
      ? "Not started"
      : state.status === "collecting"
        ? `Prompt ${state.questionIndex + 1} of ${state.totalQuestions}`
        : state.status === "votingReady"
          ? "Ready to guess"
          : state.status === "voting"
            ? `Guess ${state.currentQuestionIndex + 1} of ${state.totalQuestions}`
            : state.status === "promptReveal"
              ? `Results ${state.currentQuestionIndex + 1} of ${state.totalQuestions}`
              : state.status === "roundSummary"
                ? "Round complete"
                : "—";

  const myAnswerSubmitted =
    state.status === "collecting" && state.submittedParticipantIds.includes(currentParticipantId);

  const submitGuesses = () => {
    if (state.status !== "voting" || !votesComplete) {
      return;
    }
    send({ type: "guessWhoSaidIt:setVotes", payload: { votes: { ...draftVotes } } });
  };

  const displayName = (id: string): string =>
    session.participants.find((p) => p.id === id)?.displayName ?? id;

  if (state.status === "idle") {
    return (
      <section className="card game-card-guess-who">
        <header className="card-head">
          <h2>Guess Who Said It?</h2>
          <span className="pill pill-status pill-status-idle">{statusLabel}</span>
        </header>
        {isHost ? (
          <div className="trivia-setup icebreaker-idle-wizard">
            <label htmlFor="guess-who-count">How many prompts?</label>
            <input
              id="guess-who-count"
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

  if (state.status === "roundSummary") {
    return (
      <section className="card game-card-guess-who">
        <header className="card-head">
          <h2>Guess Who Said It?</h2>
          <span className="pill pill-status pill-status-finished">{statusLabel}</span>
        </header>
        <p className="guess-who-summary-intro">
          Total correct guesses across all {state.totalQuestions} prompts (one point per correct match).
        </p>
        <ol className="guess-who-standings">
          {state.standings.map((row, i) => {
            const p = session.participants.find((x) => x.id === row.participantId);
            return (
              <li key={row.participantId} className="guess-who-standing-row">
                <span className="guess-who-standing-rank">{i + 1}.</span>
                <span className="guess-who-standing-name">{p?.displayName ?? row.participantId}</span>
                <span className="guess-who-standing-score">{row.correctGuesses} correct</span>
              </li>
            );
          })}
        </ol>
        <p className="scores-note">Session scores are updated in the sidebar.</p>
        {isHost && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => send({ type: "guessWhoSaidIt:returnToSetup", payload: {} })}
          >
            Play again
          </button>
        )}
      </section>
    );
  }

  if (state.status === "promptReveal") {
    const { reveal } = state;
    const mine = reveal.byVoter.find((v) => v.voterId === currentParticipantId);
    const isLastPrompt = state.currentQuestionIndex + 1 >= state.totalQuestions;
    return (
      <section className="card game-card-guess-who">
        <header className="card-head">
          <h2>Guess Who Said It?</h2>
          <span className="pill pill-status pill-status-revealing">{statusLabel}</span>
        </header>

        <div className="guess-who-reveal-header">
          <h3 className="trivia-prompt">{reveal.question.text}</h3>
          <p className="guess-who-reveal-sub">Who actually said what — points for this prompt are already added.</p>
        </div>

        <div className="guess-who-reveal-answers">
          <h4 className="guess-who-section-title">Answers</h4>
          <ul className="guess-who-reveal-cards">
            {reveal.revealedAnswers.map((ans) => (
              <li key={ans.slotId} className="guess-who-reveal-card">
                <div className="guess-who-reveal-author">{displayName(ans.authorId)}</div>
                {ans.text.trim().length > 0 && <p>{ans.text}</p>}
                {ans.imageUrl && (
                  <img
                    className="icebreaker-reveal-img"
                    src={`${apiBase}${ans.imageUrl}`}
                    alt=""
                    loading="lazy"
                  />
                )}
              </li>
            ))}
          </ul>
        </div>

        {mine && (
          <div className="guess-who-your-results">
            <h4 className="guess-who-section-title">Your guesses</h4>
            <ul className="guess-who-your-rows">
              {mine.rows.map((row) => (
                <li key={row.slotId} className={`guess-who-your-row${row.correct ? " is-correct" : " is-wrong"}`}>
                  <span className="guess-who-your-mark">{row.correct ? "✓" : "✗"}</span>
                  <span>
                    You guessed <strong>{displayName(row.guessedParticipantId)}</strong> — actually{" "}
                    <strong>{displayName(row.actualAuthorId)}</strong>
                  </span>
                  {row.pointsEarned > 0 && <span className="guess-who-points-pill">+{row.pointsEarned}</span>}
                </li>
              ))}
            </ul>
            <p className="guess-who-points-subtotal">
              Points this prompt: <strong>{mine.pointsThisPrompt}</strong>
            </p>
          </div>
        )}

        <details className="guess-who-all-voters">
          <summary>Everyone&apos;s results this prompt</summary>
          <div className="guess-who-voter-grid">
            {reveal.byVoter.map((bv) => (
              <div key={bv.voterId} className="guess-who-voter-block">
                <strong>{displayName(bv.voterId)}</strong>
                <span className="guess-who-voter-pts">{bv.pointsThisPrompt} pt{bv.pointsThisPrompt === 1 ? "" : "s"}</span>
              </div>
            ))}
          </div>
        </details>

        {isHost && (
          <div className="guess-who-host-next">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => send({ type: "guessWhoSaidIt:advancePrompt", payload: {} })}
            >
              {isLastPrompt ? "View final summary" : "Next prompt"}
            </button>
          </div>
        )}
      </section>
    );
  }

  if (state.status === "votingReady") {
    return (
      <section className="card game-card-guess-who">
        <header className="card-head">
          <h2>Guess Who Said It?</h2>
          <span className="pill pill-status pill-status-collecting">{statusLabel}</span>
        </header>
        <p className="guess-who-voting-ready-msg">
          Everyone has answered every prompt. The host will walk through each prompt one at a time. You won&apos;t see
          your own answer when guessing — only other players&apos;.
        </p>
        {isHost && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => send({ type: "guessWhoSaidIt:beginVoting", payload: {} })}
          >
            Begin guessing
          </button>
        )}
      </section>
    );
  }

  if (state.status === "voting") {
    return (
      <section className="card game-card-guess-who">
        <header className="card-head">
          <h2>Guess Who Said It?</h2>
          <span className="pill pill-status pill-status-voting">{statusLabel}</span>
        </header>
        <p className="guess-who-voting-hint">
          For each answer shown, pick who you think said it. Your own answer isn&apos;t listed. You can&apos;t guess
          yourself for someone else&apos;s answer.
        </p>
        <div className="guess-who-voting-board">
          <h3 className="trivia-prompt">{state.prompt.question.text}</h3>
          {state.prompt.slots.length === 0 ? (
            <p className="guess-who-no-slots">Nothing to guess here (snapshot).</p>
          ) : (
            <ul className="guess-who-slot-list">
              {state.prompt.slots.map((sl) => (
                <li key={sl.slotId} className="guess-who-slot-card">
                  <div className="guess-who-slot-body">
                    {sl.text.trim().length > 0 && <p>{sl.text}</p>}
                    {sl.imageUrl && (
                      <img
                        className="icebreaker-reveal-img"
                        src={`${apiBase}${sl.imageUrl}`}
                        alt=""
                        loading="lazy"
                      />
                    )}
                  </div>
                  <label className="guess-who-guess-label">
                    Who said this?
                    <select
                      value={draftVotes[sl.slotId] ?? ""}
                      onChange={(event) =>
                        setDraftVotes((prev) => ({ ...prev, [sl.slotId]: event.target.value }))
                      }
                    >
                      <option value="">Choose…</option>
                      {guessOptions.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.displayName}
                        </option>
                      ))}
                    </select>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
        {!state.hasVoted ? (
          <button type="button" className="btn btn-primary" disabled={!votesComplete} onClick={submitGuesses}>
            Submit my guesses
          </button>
        ) : (
          <p className="guess-who-voted-self">You have submitted your guesses.</p>
        )}
        <p className="icebreaker-progress">
          {state.allVotesIn
            ? "Everyone has guessed. Tallying results…"
            : `${state.votedParticipantIds.length}/${totalParticipants} guessed this prompt`}
        </p>
      </section>
    );
  }

  return (
    <section className="card game-card-guess-who">
      <header className="card-head">
        <h2>Guess Who Said It?</h2>
        <span className={`pill pill-status pill-status-${state.status}`}>{statusLabel}</span>
      </header>

      {question && (
        <div className="icebreaker-question">
          <h3 className="trivia-prompt">{question.text}</h3>

          <div className="icebreaker-answer-form" onPaste={handlePasteImage}>
            {!myAnswerSubmitted ? (
              <>
                <label htmlFor="guess-who-answer">Your answer</label>
                <textarea
                  id="guess-who-answer"
                  className="icebreaker-textarea"
                  rows={4}
                  value={answerText}
                  onChange={(event) => setAnswerText(event.target.value)}
                  onPaste={handlePasteImage}
                  placeholder="Share your answer, attach an image below, or paste an image (⌘V / Ctrl+V) here"
                />
                <p className="icebreaker-paste-hint">JPEG, PNG, GIF, or WebP — from file or clipboard.</p>
                <label htmlFor="guess-who-image" className="icebreaker-file-label">
                  Optional image
                </label>
                <input
                  id="guess-who-image"
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  onChange={(event) => setPendingFile(event.target.files?.[0] ?? null)}
                />
                {previewUrl && <img className="icebreaker-preview" src={previewUrl} alt="" />}
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
                ? "Everyone answered this prompt. On to the next one…"
                : `${submittedCount}/${totalParticipants} answered this prompt`}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
