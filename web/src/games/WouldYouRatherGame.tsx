import { useEffect, useMemo, useState } from "react";
import {
  WOULD_YOU_RATHER_OPTION_MAX_CHARS,
  type ClientEvent,
  type SessionState
} from "../../../shared/contracts";
import { activeParticipants } from "../utils/participants";

const ratio = (value: number, total: number): number => {
  if (total <= 0) return 0;
  return Math.round((value / total) * 100);
};

const OPTION_COLORS = [
  "#fef3c7",
  "#fee2e2",
  "#dbeafe",
  "#dcfce7",
  "#ede9fe",
  "#fce7f3",
  "#cffafe",
  "#fef9c3"
];

const pickDistinctOptionColors = (): { optionA: string; optionB: string } => {
  if (OPTION_COLORS.length < 2) {
    return { optionA: "#f1f5f9", optionB: "#e2e8f0" };
  }
  const firstIndex = Math.floor(Math.random() * OPTION_COLORS.length);
  let secondIndex = Math.floor(Math.random() * OPTION_COLORS.length);
  while (secondIndex === firstIndex) {
    secondIndex = Math.floor(Math.random() * OPTION_COLORS.length);
  }
  return {
    optionA: OPTION_COLORS[firstIndex]!,
    optionB: OPTION_COLORS[secondIndex]!
  };
};

export function WouldYouRatherGame({
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
  if (session.gameState?.type !== "wouldYouRather") {
    return null;
  }
  const state = session.gameState.state;
  const roster = activeParticipants(session.participants);
  const totalParticipants = roster.length;
  const answeredCount = state.answeredParticipantIds.filter((id) => roster.some((participant) => participant.id === id)).length;
  const everyoneAnswered = totalParticipants > 0 && answeredCount >= totalParticipants;
  const [optionA, setOptionA] = useState("");
  const [optionB, setOptionB] = useState("");
  const [optionColors, setOptionColors] = useState(() => pickDistinctOptionColors());

  const submissionAuthors = useMemo(
    () =>
      new Map(
        session.participants.map((participant) => [participant.id, participant.displayName])
      ),
    [session.participants]
  );

  const canSubmitCustomPrompt =
    state.allowParticipantSubmissions && optionA.trim().length > 0 && optionB.trim().length > 0 && optionA.trim() !== optionB.trim();

  const submitPrompt = () => {
    const trimmedA = optionA.trim();
    const trimmedB = optionB.trim();
    if (!trimmedA || !trimmedB || trimmedA === trimmedB) {
      return;
    }
    send({
      type: "wouldYouRather:submitPrompt",
      payload: { optionA: trimmedA, optionB: trimmedB }
    });
    setOptionA("");
    setOptionB("");
  };

  const statusLabel =
    state.status === "questionOpen"
      ? `${state.inSubmittedRound ? "Submitted" : "Library"} prompt ${Math.min(state.questionIndex + 1, state.totalQuestions)} of ${state.totalQuestions}`
      : state.status === "results"
      ? "Results"
      : "Round complete";

  useEffect(() => {
    if (state.activePrompt) {
      setOptionColors(pickDistinctOptionColors());
    }
  }, [state.activePrompt?.id]);

  const optionAChooserNames = roster
    .filter((participant) => state.optionASelectedParticipantIds.includes(participant.id))
    .map((participant) => participant.displayName);
  const optionBChooserNames = roster
    .filter((participant) => state.optionBSelectedParticipantIds.includes(participant.id))
    .map((participant) => participant.displayName);

  return (
    <section className="card game-card-icebreaker">
      <header className="card-head">
        <h2>Would You Rather</h2>
        <span className={`pill pill-status pill-status-${state.status}`}>{statusLabel}</span>
      </header>

      {state.activePrompt && (
        <div className="trivia-question">
          <h3 className="trivia-prompt">
            Would you rather <strong>{state.activePrompt.optionA}</strong> or <strong>{state.activePrompt.optionB}</strong>?
          </h3>
          <div className="trivia-options wyr-main-options">
            <button
              type="button"
              className={`trivia-option wyr-main-option ${state.selectedChoice === "optionA" ? "is-picked" : ""} ${state.status === "results" ? "wyr-main-option-results" : ""}`}
              style={{ backgroundColor: optionColors.optionA }}
              disabled={state.status !== "questionOpen" || state.hasAnswered}
              onClick={() => send({ type: "wouldYouRather:answer", payload: { choice: "optionA" } })}
            >
              {state.status === "results" && state.results ? (
                <span className="wyr-result-content">
                  <span className="wyr-result-title">{state.activePrompt.optionA}</span>
                  <span className="wyr-result-percent">
                    {ratio(state.results.optionACount, state.results.totalResponses)}%
                  </span>
                  <span className="wyr-result-names">
                    {optionAChooserNames.length > 0 ? optionAChooserNames.join(", ") : "No one selected this"}
                  </span>
                </span>
              ) : (
                state.activePrompt.optionA
              )}
            </button>
            <button
              type="button"
              className={`trivia-option wyr-main-option ${state.selectedChoice === "optionB" ? "is-picked" : ""} ${state.status === "results" ? "wyr-main-option-results" : ""}`}
              style={{ backgroundColor: optionColors.optionB }}
              disabled={state.status !== "questionOpen" || state.hasAnswered}
              onClick={() => send({ type: "wouldYouRather:answer", payload: { choice: "optionB" } })}
            >
              {state.status === "results" && state.results ? (
                <span className="wyr-result-content">
                  <span className="wyr-result-title">{state.activePrompt.optionB}</span>
                  <span className="wyr-result-percent">
                    {ratio(state.results.optionBCount, state.results.totalResponses)}%
                  </span>
                  <span className="wyr-result-names">
                    {optionBChooserNames.length > 0 ? optionBChooserNames.join(", ") : "No one selected this"}
                  </span>
                </span>
              ) : (
                state.activePrompt.optionB
              )}
            </button>
          </div>
          <div className="row">
            <button
              type="button"
              className="btn btn-ghost"
              disabled={state.status !== "questionOpen" || state.hasAnswered}
              onClick={() => send({ type: "wouldYouRather:answer", payload: { choice: "pass" } })}
            >
              Pass
            </button>
          </div>
          {state.status === "questionOpen" && (
            <p>
              {state.hasAnswered
                ? "Answer locked in. Waiting for everyone else."
                : "Pick either option or pass if you'd rather skip this one."}
            </p>
          )}
        </div>
      )}

      {state.status === "questionOpen" && (
        <p>
          {everyoneAnswered
            ? isHost
              ? "Everyone answered. Click Next prompt to reveal results."
              : "Everyone answered. Waiting for the host to reveal results."
            : `${answeredCount}/${totalParticipants} answered`}
        </p>
      )}

      {state.status === "results" && state.results && (
        <div className="row">
          {isHost ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => send({ type: "wouldYouRather:nextPrompt", payload: {} })}
            >
              Next prompt
            </button>
          ) : (
            <p>Waiting for the host to continue...</p>
          )}
        </div>
      )}

      {state.status === "finished" && (
        <div className="trivia-review">
          {state.inSubmittedRound ? (
            <p>Submitted prompts are complete.</p>
          ) : (
            <p>Configured prompts are complete.</p>
          )}
          {!state.inSubmittedRound && state.approvedSubmissionsRemaining > 0 && (
            isHost ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => send({ type: "wouldYouRather:startSubmittedRound", payload: {} })}
              >
                Start approved submitted prompts ({state.approvedSubmissionsRemaining})
              </button>
            ) : (
              <p>Waiting for the host to decide whether to run submitted prompts.</p>
            )
          )}
        </div>
      )}

      {state.allowParticipantSubmissions && (
        <>
          <hr className="wyr-divider" />
          <section className="wyr-custom-form">
            <h3>Submit your own &quot;Would You Rather&quot;</h3>
            <label htmlFor="wyr-option-a">This thing</label>
            <input
            id="wyr-option-a"
            type="text"
            className="wyr-custom-input"
            maxLength={WOULD_YOU_RATHER_OPTION_MAX_CHARS}
            value={optionA}
            onChange={(event) => setOptionA(event.target.value)}
          />
            <label htmlFor="wyr-option-b">That thing</label>
            <input
            id="wyr-option-b"
            type="text"
            className="wyr-custom-input"
            maxLength={WOULD_YOU_RATHER_OPTION_MAX_CHARS}
            value={optionB}
            onChange={(event) => setOptionB(event.target.value)}
          />
            <div className="row">
              <button type="button" className="btn btn-ghost" disabled={!canSubmitCustomPrompt} onClick={submitPrompt}>
                Submit custom prompt
              </button>
              <p className="icebreaker-progress">Pending: {state.pendingSubmissionsCount}</p>
            </div>
          </section>
        </>
      )}

      {isHost && (
        <section className="trivia-review">
          <h3>Submitted prompt moderation</h3>
          {state.hostPendingSubmissions.length === 0 ? (
            <p>No pending submissions.</p>
          ) : (
            <ul className="trivia-review-list">
              {state.hostPendingSubmissions.map((submission) => (
                <li key={submission.id}>
                  <span>
                    {submission.optionA} / {submission.optionB}
                    {" — "}
                    {submissionAuthors.get(submission.submittedByParticipantId) ?? submission.submittedByParticipantId}
                  </span>
                  <span className="row">
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() =>
                        send({
                          type: "wouldYouRather:reviewSubmission",
                          payload: { submissionId: submission.id, decision: "approve" }
                        })
                      }
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() =>
                        send({
                          type: "wouldYouRather:reviewSubmission",
                          payload: { submissionId: submission.id, decision: "reject" }
                        })
                      }
                    >
                      Reject
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p>Approved submissions: {state.hostApprovedSubmissions.length}</p>
        </section>
      )}
    </section>
  );
}
