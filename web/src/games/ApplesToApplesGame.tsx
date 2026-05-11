import type { ClientEvent, SessionState } from "../../../shared/contracts";
import { activeParticipants } from "../utils/participants";

export function ApplesToApplesGame({
  session,
  currentParticipantId,
  isHost,
  canPlay,
  send
}: {
  session: SessionState;
  currentParticipantId: string;
  isHost: boolean;
  canPlay: boolean;
  send: (event: ClientEvent) => void;
}): JSX.Element | null {
  const game = session.gameState?.type === "applesToApples" ? session.gameState : null;
  const state = game?.state;
  if (!state) {
    return null;
  }

  const roster = activeParticipants(session.participants);
  const nameFor = (id: string): string => roster.find((p) => p.id === id)?.displayName ?? "Player";

  if (state.status === "finished") {
    return (
      <section className="card game-surface" aria-label="Apples to Apples finished">
        <header className="card-head">
          <h2>Apples to Apples</h2>
          <span className="pill pill-muted">Game over</span>
        </header>
        <p>Final scores are in the player list.</p>
        <p className="mode-option-hint">
          Phrases are original stock cards in the server JSON—expand the libraries anytime.
        </p>
      </section>
    );
  }

  if (state.status === "roundResult") {
    return (
      <section className="card game-surface" aria-label="Apples to Apples round result">
        <header className="card-head">
          <h2>Round {state.roundNumber} result</h2>
          <span className="pill pill-muted">{state.mode === "finite" ? "Finite" : "Standard"}</span>
        </header>
        <p>
          Topic was: <strong>{state.topicText}</strong>
        </p>
        <p>
          Winning card: <strong>{state.winningText}</strong>
        </p>
        <p>
          Winner: <strong>{nameFor(state.winnerParticipantId)}</strong>
        </p>
        {isHost && (
          <div className="card-footer card-footer-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => send({ type: "applesToApples:beginNextRound", payload: {} })}
            >
              {state.canContinue ? "Next round" : "End game"}
            </button>
          </div>
        )}
        {!isHost && !state.canContinue && (
          <p className="mode-option-hint">The host will end the game when ready.</p>
        )}
      </section>
    );
  }

  if (state.status === "judging") {
    return (
      <section className="card game-surface" aria-label="Apples to Apples judging">
        <header className="card-head">
          <h2>Pick a winner</h2>
          <span className="pill pill-muted">Round {state.roundNumber}</span>
        </header>
        <p className="apples-topic">
          Topic: <strong>{state.topicText}</strong>
        </p>
        {state.isJudge ? (
          <>
            <p>Choose the response you like best (authors are hidden):</p>
            <ul className="apples-option-list">
              {state.anonymousOptions?.map((opt) => (
                <li key={opt.entryId}>
                  <button
                    type="button"
                    className="btn btn-secondary apples-option-btn"
                    disabled={!canPlay}
                    onClick={() =>
                      send({ type: "applesToApples:judgePick", payload: { entryId: opt.entryId } })
                    }
                  >
                    {opt.text}
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="mode-option-hint">Waiting for {nameFor(state.judgeId)} to pick a winner…</p>
        )}
      </section>
    );
  }

  const submitted = state.submittedNonJudgeIds.includes(currentParticipantId);
  const modeLabel = state.mode === "finite" ? "Finite — 6 rounds, no redraw" : "Standard — refill hand each round";

  return (
    <section className="card game-surface" aria-label="Apples to Apples">
      <header className="card-head">
        <h2>Apples to Apples</h2>
        <span className="pill pill-muted">
          Round {state.roundNumber} · {modeLabel}
        </span>
      </header>
      <p className="apples-topic">
        Topic: <strong>{state.topicText}</strong>
      </p>
      <p>
        Judge: <strong>{nameFor(state.judgeId)}</strong>
      </p>
      {state.isJudge ? (
        <p className="mode-option-hint">You are judging this round. Wait while everyone else plays a card.</p>
      ) : (
        <>
          <p>Play one card from your hand that fits the topic—any way you want.</p>
          <div className="apples-hand">
            {(state.myHand ?? []).map((card) => (
              <button
                key={card.id}
                type="button"
                className="btn btn-secondary apples-hand-card"
                disabled={!canPlay || submitted}
                onClick={() => send({ type: "applesToApples:submitCard", payload: { cardId: card.id } })}
              >
                {card.text}
              </button>
            ))}
          </div>
          {submitted && <p className="mode-option-hint">You’re in. Waiting for other players…</p>}
          {!submitted && state.allSubmissionsIn && (
            <p className="mode-option-hint">Everyone submitted—judge is about to see the cards.</p>
          )}
        </>
      )}
    </section>
  );
}
