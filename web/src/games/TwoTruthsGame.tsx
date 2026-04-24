import { FormEvent, useEffect, useMemo, useState } from "react";
import type { ClientEvent, SessionState } from "../../../shared/contracts";

export function TwoTruthsGame({
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
  const [statements, setStatements] = useState<[string, string, string]>(["", "", ""]);
  const [lieIndex, setLieIndex] = useState(0);
  const [selectedPresenter, setSelectedPresenter] = useState("");
  const [voteIndex, setVoteIndex] = useState<number | null>(null);

  const truthState = session.gameState?.type === "twoTruthsLie" ? session.gameState.state : null;

  const presenter = useMemo(() => {
    if (!truthState?.currentPresenterId) return null;
    return session.participants.find((p) => p.id === truthState.currentPresenterId) ?? null;
  }, [session.participants, truthState?.currentPresenterId]);

  const presenterSubmission = truthState?.currentPresenterId
    ? truthState.submissions[truthState.currentPresenterId]
    : null;

  useEffect(() => {
    if (!truthState) return;
    if (!selectedPresenter) {
      const first = Object.keys(truthState.submissions)[0];
      if (first) setSelectedPresenter(first);
    }
  }, [truthState, selectedPresenter]);

  useEffect(() => {
    if (truthState?.status !== "voting") {
      setVoteIndex(null);
    }
  }, [truthState?.status]);

  if (!truthState) return null;

  const mySubmission = truthState.submissions[currentParticipantId];
  const isPresenter = truthState.currentPresenterId === currentParticipantId;

  const submitStatements = (event: FormEvent) => {
    event.preventDefault();
    if (statements.some((s) => !s.trim())) return;
    send({
      type: "truths:submit",
      payload: {
        statements: statements.map((s) => s.trim()),
        lieIndex
      }
    });
  };

  const castVote = () => {
    if (voteIndex === null) return;
    send({ type: "truths:vote", payload: { lieIndex: voteIndex } });
  };

  const tallyForStatement = (index: number): number =>
    Object.values(truthState.votes).filter((v) => v === index).length;

  const statusLabel =
    truthState.status === "collecting"
      ? "Collecting statements"
      : truthState.status === "voting"
      ? "Voting"
      : truthState.status === "revealed"
      ? "Revealed"
      : "Finished";

  const submittedCount = Object.keys(truthState.submissions).length;

  return (
    <section className="card game-card-truths">
      <header className="card-head">
        <h2>Two Truths and a Lie</h2>
        <span className={`pill pill-status pill-status-${truthState.status}`}>{statusLabel}</span>
      </header>

      {truthState.status === "collecting" && (
        <div className="truths-phase">
          {mySubmission ? (
            <div className="truths-submitted">
              <p>Submitted! Waiting for others...</p>
              <ol className="truths-recap">
                {mySubmission.statements.map((statement, index) => (
                  <li key={index} className={index === mySubmission.lieIndex ? "is-lie" : ""}>
                    {statement}
                    {index === mySubmission.lieIndex && <span className="tag tag-lie">your lie</span>}
                  </li>
                ))}
              </ol>
              <p className="truths-progress">
                {submittedCount} of {session.participants.length} submitted
              </p>
            </div>
          ) : (
            <form onSubmit={submitStatements} className="truths-form">
              <p className="truths-hint">Two truths, one lie. Enter three statements and flag the lie.</p>
              {statements.map((statement, index) => (
                <label key={index} className="truths-field">
                  <span>Statement {index + 1}</span>
                  <input
                    value={statement}
                    onChange={(event) => {
                      const next = [...statements] as [string, string, string];
                      next[index] = event.target.value;
                      setStatements(next);
                    }}
                    placeholder={`Something ${index === 0 ? "true" : index === 1 ? "true" : "false"} about you`}
                    required
                  />
                </label>
              ))}
              <label className="truths-field">
                <span>Which one is the lie?</span>
                <select
                  value={lieIndex}
                  onChange={(event) => setLieIndex(Number(event.target.value))}
                >
                  <option value={0}>Statement 1</option>
                  <option value={1}>Statement 2</option>
                  <option value={2}>Statement 3</option>
                </select>
              </label>
              <button type="submit" className="btn btn-primary">
                Submit
              </button>
            </form>
          )}

          {isHost && (
            <div className="truths-host-controls">
              <h3>Host controls</h3>
              <label className="truths-field">
                <span>Pick a presenter</span>
                <select
                  value={selectedPresenter}
                  onChange={(event) => setSelectedPresenter(event.target.value)}
                >
                  <option value="">Select...</option>
                  {Object.keys(truthState.submissions).map((participantId) => {
                    const participant = session.participants.find((p) => p.id === participantId);
                    return (
                      <option key={participantId} value={participantId}>
                        {participant?.displayName ?? participantId}
                      </option>
                    );
                  })}
                </select>
              </label>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!selectedPresenter}
                onClick={() => send({ type: "truths:beginVoting", payload: { presenterId: selectedPresenter } })}
              >
                Begin voting
              </button>
            </div>
          )}
        </div>
      )}

      {truthState.status === "voting" && presenterSubmission && (
        <div className="truths-phase">
          <div className="truths-voting">
            <h3>
              {presenter ? `${presenter.displayName}'s statements` : "Statements"}
            </h3>
            {isPresenter ? (
              <p className="truths-hint">You're the presenter — sit back and watch!</p>
            ) : (
              <p className="truths-hint">Pick the statement you think is the lie.</p>
            )}
            <div className="truths-options">
              {presenterSubmission.statements.map((statement, index) => (
                <button
                  key={index}
                  type="button"
                  className={`truths-option${voteIndex === index ? " is-selected" : ""}`}
                  onClick={() => setVoteIndex(index)}
                  disabled={isPresenter}
                >
                  <span className="truths-option-index">{index + 1}</span>
                  <span>{statement}</span>
                </button>
              ))}
            </div>
            {!isPresenter && (
              <button
                type="button"
                className="btn btn-primary"
                disabled={voteIndex === null}
                onClick={castVote}
              >
                Cast vote
              </button>
            )}
            {isHost && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => send({ type: "truths:reveal", payload: {} })}
              >
                Reveal results
              </button>
            )}
          </div>
        </div>
      )}

      {truthState.status === "revealed" && presenterSubmission && (
        <div className="truths-phase">
          <div className="truths-reveal">
            <h3>
              {presenter ? `${presenter.displayName}'s truth` : "Reveal"}
            </h3>
            <ol className="truths-reveal-list">
              {presenterSubmission.statements.map((statement, index) => {
                const isLie = index === presenterSubmission.lieIndex;
                const count = tallyForStatement(index);
                return (
                  <li key={index} className={isLie ? "is-lie" : "is-truth"}>
                    <div className="truths-reveal-row">
                      <span className="truths-option-index">{index + 1}</span>
                      <span className="truths-reveal-text">{statement}</span>
                      <span className={`tag ${isLie ? "tag-lie" : "tag-truth"}`}>
                        {isLie ? "Lie" : "Truth"}
                      </span>
                    </div>
                    <div className="truths-tally">
                      {count} {count === 1 ? "vote" : "votes"}
                    </div>
                  </li>
                );
              })}
            </ol>
            {isHost && (
              <div className="row">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => send({ type: "game:start", payload: { game: "twoTruthsLie" } })}
                >
                  Play another round
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
