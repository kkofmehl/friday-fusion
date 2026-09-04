import { useEffect, useState } from "react";
import {
  BAD_ADVICE_MAX_CHARS,
  type ClientEvent,
  type SessionState
} from "../../../shared/contracts";
import { PlayerName } from "../components/PlayerName";
import { activeParticipants } from "../utils/participants";

export function BadAdviceGame({
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
  const game = session.gameState?.type === "badAdvice" ? session.gameState : null;
  const state = game?.state;
  const [adviceDraft, setAdviceDraft] = useState("");

  useEffect(() => {
    setAdviceDraft("");
  }, [state?.status, state && "roundNumber" in state ? state.roundNumber : 0]);

  if (!state) {
    return null;
  }

  const roster = activeParticipants(session.participants);

  if (state.status === "collecting") {
    const mineSubmitted = state.submittedParticipantIds.includes(currentParticipantId);
    return (
      <section className="card card-game-inner">
        <header className="card-head">
          <h2>Bad Advice</h2>
          <span className="pill pill-muted">
            Round {state.roundNumber} / {state.totalRounds}
          </span>
        </header>
        <p className="game-lede">{state.prompt.text}</p>
        <p className="mode-option-hint">
          Submitted {state.submittedParticipantIds.length} / {roster.length} — give your <em>worst</em> advice.
        </p>
        {mineSubmitted ? (
          <p className="game-lede">You’ve submitted your advice. Waiting for others…</p>
        ) : (
          <div className="stack gap-sm">
            <label htmlFor="bad-advice-line">Your worst advice</label>
            <textarea
              id="bad-advice-line"
              className="input-textarea"
              rows={3}
              maxLength={BAD_ADVICE_MAX_CHARS}
              value={adviceDraft}
              onChange={(e) => setAdviceDraft(e.target.value)}
              placeholder="Make it terrible…"
            />
            <button
              type="button"
              className="btn btn-primary"
              disabled={adviceDraft.trim().length === 0}
              onClick={() =>
                send({
                  type: "badAdvice:submitAdvice",
                  payload: { text: adviceDraft.trim() }
                })
              }
            >
              Submit advice
            </button>
          </div>
        )}
        {isHost && state.submittedParticipantIds.length >= 2 && (
          <div className="card-footer card-footer-actions" style={{ marginTop: "1rem" }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => send({ type: "badAdvice:beginVoting", payload: {} })}
            >
              {state.allAdviceIn ? "Start voting" : "Start voting early"}
            </button>
          </div>
        )}
        {isHost && state.submittedParticipantIds.length < 2 && (
          <p className="mode-option-hint">Need at least two submissions before voting.</p>
        )}
      </section>
    );
  }

  if (state.status === "voting") {
    return (
      <section className="card card-game-inner">
        <header className="card-head">
          <h2>Vote</h2>
          <span className="pill pill-muted">
            Round {state.roundNumber} / {state.totalRounds}
          </span>
        </header>
        <p className="game-lede">{state.prompt.text}</p>
        <p className="mode-option-hint">
          Votes in: {state.votedParticipantIds.length} / {roster.length} — pick your favorite worst advice.
        </p>
        {state.hasVoted ? <p className="game-lede">Thanks — your vote is in.</p> : null}
        <ul className="caption-this-entry-list">
          {state.displayEntries.map((row) => {
            const own = row.entryId === state.myEntryId;
            const canVote = !own && !state.hasVoted;
            return (
              <li key={row.entryId} className="caption-this-entry">
                <blockquote className="caption-this-quote">{row.text}</blockquote>
                {own ? (
                  <span className="pill pill-muted">Your advice</span>
                ) : (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={!canVote}
                    onClick={() =>
                      send({
                        type: "badAdvice:vote",
                        payload: { entryId: row.entryId }
                      })
                    }
                  >
                    Vote for this
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    );
  }

  if (state.status === "finished") {
    const sorted = [...state.tallies].sort((a, b) => b.voteCount - a.voteCount);
    return (
      <section className="card card-game-inner">
        <header className="card-head">
          <h2>Bad Advice complete</h2>
          <span className="pill pill-muted">{state.totalRounds} rounds</span>
        </header>
        {state.lastPrompt ? <p className="game-lede">Last prompt: {state.lastPrompt.text}</p> : null}
        <ol className="caption-this-results">
          {sorted.map((t) => {
            const won = state.winnerEntryIds.includes(t.entryId);
            return (
              <li key={t.entryId} className={won ? "caption-this-result-row is-winner" : "caption-this-result-row"}>
                <span className="caption-this-result-votes">{t.voteCount}</span>
                <div>
                  <div className="caption-this-result-text">{t.text}</div>
                  <div className="caption-this-result-author">
                    <PlayerName
                      participantId={t.authorId}
                      participants={session.participants}
                      size={won ? "lg" : "xs"}
                      inline
                    />
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
        <p className="mode-option-hint">Host can end the game or start another from the side rail.</p>
      </section>
    );
  }

  // results
  const sorted = [...state.tallies].sort((a, b) => b.voteCount - a.voteCount);
  const isLastRound = state.roundNumber >= state.totalRounds;
  return (
    <section className="card card-game-inner">
      <header className="card-head">
        <h2>Results</h2>
        <span className="pill pill-muted">
          Round {state.roundNumber} / {state.totalRounds}
        </span>
      </header>
      <p className="game-lede">{state.prompt.text}</p>
      <ol className="caption-this-results">
        {sorted.map((t) => {
          const won = state.winnerEntryIds.includes(t.entryId);
          return (
            <li key={t.entryId} className={won ? "caption-this-result-row is-winner" : "caption-this-result-row"}>
              <span className="caption-this-result-votes">{t.voteCount}</span>
              <div>
                <div className="caption-this-result-text">{t.text}</div>
                <div className="caption-this-result-author">
                  <PlayerName
                    participantId={t.authorId}
                    participants={session.participants}
                    size={won ? "lg" : "xs"}
                    inline
                  />
                  {won ? <span className="pill">+1 FF</span> : null}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      {isHost && (
        <div className="card-footer card-footer-actions" style={{ marginTop: "1rem" }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => send({ type: "badAdvice:beginNextRound", payload: {} })}
          >
            {isLastRound ? "Finish game" : "Next round"}
          </button>
        </div>
      )}
    </section>
  );
}
