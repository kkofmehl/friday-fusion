import type { JSX } from "react";
import type { ClientEvent, MemoryCardPublic, SessionState } from "../../../shared/contracts";
import { getMemorySymbolById } from "../../../shared/memorySymbols";

export function MemoryGame({
  session,
  currentParticipantId,
  canPlay,
  send
}: {
  session: SessionState;
  currentParticipantId: string;
  canPlay: boolean;
  send: (event: ClientEvent) => void;
}): JSX.Element | null {
  if (session.gameState?.type !== "memory") {
    return null;
  }
  const state = session.gameState.state;
  const me = session.participants.find((p) => p.id === currentParticipantId);

  const scoreRows = session.participants
    .filter((p) => p.isActive !== false)
    .map((p) => ({
      id: p.id,
      name: p.displayName,
      points: state.scores[p.id] ?? 0
    }))
    .sort((a, b) => b.points - a.points);

  const onFlip = (card: MemoryCardPublic): void => {
    if (!canPlay || state.phase !== "playing") {
      return;
    }
    if (state.currentPlayerId !== currentParticipantId) {
      return;
    }
    if (card.status !== "hidden") {
      return;
    }
    send({ type: "memory:flipCard", payload: { cardId: card.id } });
  };

  const renderFace = (card: MemoryCardPublic): JSX.Element => {
    const src = card.iconSrc ?? getMemorySymbolById(card.symbolId ?? "")?.iconSrc;
    if (src) {
      return <img className="memory-card-icon" src={src} alt="" decoding="async" />;
    }
    return <span className="memory-card-fallback">?</span>;
  };

  if (state.phase === "finished") {
    const rows = session.participants
      .filter((p) => p.isActive !== false)
      .map((p) => ({
        id: p.id,
        name: p.displayName,
        points: state.finalScores[p.id] ?? state.scores[p.id] ?? 0
      }))
      .sort((a, b) => b.points - a.points);
    return (
      <div className="memory-game memory-game--finished">
        <header className="memory-head">
          <h2>Memory</h2>
          <p className="memory-sub">All pairs found.</p>
        </header>
        <div className="memory-board memory-board--static">
          {state.cards.map((card) => (
            <div key={card.id} className="memory-card memory-card--matched" aria-hidden="true">
              <div className="memory-card-inner">{renderFace(card)}</div>
            </div>
          ))}
        </div>
        <section className="memory-leaderboard" aria-label="Final scores">
          <h3>Scores</h3>
          <ol className="memory-lb-list">
            {rows.map((row, idx) => (
              <li key={row.id} className="memory-lb-row">
                <span className="memory-lb-rank">{idx + 1}.</span>
                <span className="memory-lb-name">{row.name}</span>
                <span className="memory-lb-pts">{row.points}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    );
  }

  const isMyTurn = state.currentPlayerId === currentParticipantId;
  const turnName = session.participants.find((p) => p.id === state.currentPlayerId)?.displayName ?? "Player";
  const boardLabel = state.boardSize === "36" ? "36 cards" : "30 cards";

  return (
    <div className="memory-game">
      <header className="memory-head">
        <h2>Memory</h2>
        <p className="memory-sub">
          {state.phase === "resolving"
            ? "No match — cards flip back in a moment."
            : isMyTurn
              ? "Your turn — pick two cards."
              : `Waiting on ${turnName}.`}
        </p>
      </header>

      <div className="memory-meta">
        <span className="pill pill-muted">{boardLabel}</span>
        {state.phase === "resolving" && typeof state.resolveEndsAtMs === "number" ? (
          <span className="pill pill-muted">Flipping back…</span>
        ) : null}
      </div>

      <ul className="memory-scores" aria-label="Match scores this game">
        {scoreRows.map((row) => (
          <li key={row.id} className={row.id === currentParticipantId ? "memory-score is-me" : "memory-score"}>
            <span className="memory-score-name">{row.name}</span>
            <span className="memory-score-val">{row.points}</span>
          </li>
        ))}
      </ul>

      <div className="memory-board" role="grid" aria-label="Memory cards">
        {state.cards.map((card) => {
          const faceUp = card.status === "shown" || card.status === "matched";
          const clickable =
            canPlay && state.phase === "playing" && isMyTurn && card.status === "hidden" && me?.isActive !== false;
          return (
            <button
              key={card.id}
              type="button"
              className={`memory-card memory-card--btn${faceUp ? " is-face-up" : ""}${
                card.status === "matched" ? " memory-card--matched" : ""
              }${clickable ? " is-clickable" : ""}`}
              onClick={() => onFlip(card)}
              disabled={!clickable}
              aria-label={faceUp ? "Revealed card" : "Hidden card"}
            >
              <span className="memory-card-inner">
                {faceUp ? renderFace(card) : <span className="memory-card-back" aria-hidden="true" />}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
