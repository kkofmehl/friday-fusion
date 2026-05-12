import { useEffect, useState, type JSX } from "react";
import type { ClientEvent, SessionState, UnoActiveColor, UnoCard } from "../../../shared/contracts";
import { activeParticipants } from "../utils/participants";

const RANK_LABEL: Record<string, string> = {
  skip: "Skip",
  reverse: "Rev",
  drawTwo: "+2",
  wild: "Wild",
  wildDrawFour: "+4"
};

function cardLabel(card: UnoCard): string {
  if (typeof card.rank === "number") {
    return String(card.rank);
  }
  return RANK_LABEL[card.rank] ?? String(card.rank);
}

function cardToneClass(card: UnoCard): string {
  if (card.color === "wild") {
    return "uno-card--wild";
  }
  return `uno-card--${card.color}`;
}

export function UnoGame({
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
  const [wildPickId, setWildPickId] = useState<string | null>(null);
  const [, setCatchGateTick] = useState(0);

  const uno = session.gameState?.type === "uno" ? session.gameState : null;
  const state = uno?.state;
  const playing =
    uno && state && state.status === "playing"
      ? state
      : null;

  const catchAllowedAfter = playing?.unoCatchAllowedAfterMs ?? null;
  const catchTargetId = playing?.unoCatchOpenFor ?? null;

  useEffect(() => {
    if (catchAllowedAfter == null || Date.now() >= catchAllowedAfter) {
      return;
    }
    const id = window.setInterval(() => {
      setCatchGateTick((n) => n + 1);
      if (Date.now() >= catchAllowedAfter) {
        clearInterval(id);
      }
    }, 200);
    return () => clearInterval(id);
  }, [catchAllowedAfter, catchTargetId]);

  if (!uno || !state) {
    return null;
  }

  const roster = activeParticipants(session.participants);
  const nameFor = (id: string): string => roster.find((p) => p.id === id)?.displayName ?? "Player";

  if (state.status === "finished") {
    const winnerId = state.winnerParticipantId;
    const winnerParticipant = session.participants.find((p) => p.id === winnerId);
    const winnerScore = winnerParticipant?.score ?? 0;
    const youWon = winnerId === currentParticipantId;

    return (
      <section className="card game-surface" aria-label="UNO finished">
        <div className="uno-winner-banner" role="status">
          <p className="uno-winner-title">Hand over</p>
          <p className="uno-winner-name">
            {youWon ? (
              <>
                You won, <strong>{nameFor(winnerId)}</strong>!
              </>
            ) : (
              <>
                Winner: <strong>{nameFor(winnerId)}</strong>
              </>
            )}
          </p>
          <p className="uno-winner-score">
            {nameFor(winnerId)}&rsquo;s score is now <strong>{winnerScore}</strong> (everyone else&rsquo;s totals are in the player list).
          </p>
        </div>
        <header className="card-head">
          <h2>UNO</h2>
          <span className="pill pill-muted">Game over</span>
        </header>
        {isHost ? (
          <div className="card-footer card-footer-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => send({ type: "game:start", payload: { game: "uno" } })}
            >
              Deal new hand
            </button>
            <p className="mode-option-hint uno-host-finished-hint">
              Or use <strong>Restart game</strong> in the player panel to start fresh with the same players.
            </p>
          </div>
        ) : (
          <p className="mode-option-hint">The host can deal a new hand when everyone is ready.</p>
        )}
      </section>
    );
  }

  if (!playing) {
    return null;
  }

  const isMyTurn = playing.currentPlayerId === currentParticipantId;
  const catchName = catchTargetId ? nameFor(catchTargetId) : null;
  const canCatch = Boolean(catchTargetId && catchTargetId !== currentParticipantId && canPlay);

  const catchDelayActive = Boolean(
    catchTargetId &&
      typeof catchAllowedAfter === "number" &&
      Number.isFinite(catchAllowedAfter) &&
      Date.now() < catchAllowedAfter
  );
  const catchWaitSeconds =
    catchDelayActive && typeof catchAllowedAfter === "number"
      ? Math.max(0, Math.ceil((catchAllowedAfter - Date.now()) / 1000))
      : 0;
  const canCatchNow = canCatch && !catchDelayActive;

  const announceId = playing.unoAnnouncedParticipantId;
  const playPlain = (card: UnoCard): void => {
    send({ type: "uno:playCard", payload: { cardId: card.id } });
    setWildPickId(null);
  };

  const playWild = (cardId: string, color: UnoActiveColor): void => {
    send({ type: "uno:playCard", payload: { cardId, chosenColor: color } });
    setWildPickId(null);
  };

  const onCardClick = (card: UnoCard): void => {
    if (!canPlay || !isMyTurn) {
      return;
    }
    if (wildPickId && wildPickId !== card.id) {
      setWildPickId(null);
    }
    if (card.rank === "wild" || card.rank === "wildDrawFour") {
      setWildPickId(card.id);
      return;
    }
    playPlain(card);
  };

  return (
    <section className="card game-surface" aria-label="UNO">
      <header className="card-head">
        <h2>UNO</h2>
        <span className="pill pill-muted">{isMyTurn ? "Your turn" : `${nameFor(playing.currentPlayerId)}'s turn`}</span>
      </header>

      <div className="uno-table">
        {announceId ? (
          <div className="uno-announce-banner" role="status">
            <strong>{nameFor(announceId)}</strong> called UNO!
          </div>
        ) : null}

        <div className="uno-piles">
          <div className="uno-pile uno-draw-stack" aria-label="Draw pile">
            <span className="uno-pile-label">Draw</span>
            <span className="uno-pile-count">{playing.drawPileCount}</span>
          </div>
          <div className="uno-active-swatch" title="Current color">
            <span className="uno-pile-label">Color</span>
            <span className={`uno-swatch uno-swatch--${playing.activeColor}`} />
          </div>
          <div className="uno-discard" aria-label="Top discard">
            <span className="uno-pile-label">Discard</span>
            <div className={`uno-card uno-card--large ${cardToneClass(playing.topDiscard)}`}>
              <span className="uno-card-face">{cardLabel(playing.topDiscard)}</span>
            </div>
          </div>
        </div>

        <div className="uno-actions">
          {isMyTurn && !playing.currentHasDrawn && (
            <button
              type="button"
              className="btn btn-secondary"
              disabled={!canPlay}
              onClick={() => send({ type: "uno:draw", payload: {} })}
            >
              Draw a card
            </button>
          )}
          {isMyTurn && playing.currentHasDrawn && (
            <button
              type="button"
              className="btn btn-secondary"
              disabled={!canPlay}
              onClick={() => send({ type: "uno:passAfterDraw", payload: {} })}
            >
              Pass (keep hand)
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary"
            disabled={!canPlay || playing.myHand.length !== 1}
            onClick={() => send({ type: "uno:declareUno", payload: {} })}
          >
            UNO!
          </button>
          {canCatchNow && catchTargetId && (
            <button
              type="button"
              className="btn btn-ghost"
              disabled={!canPlay}
              onClick={() =>
                send({ type: "uno:catchPlayer", payload: { targetParticipantId: catchTargetId } })
              }
            >
              Catch missed UNO ({catchName})
            </button>
          )}
          {canCatch && catchDelayActive && (
            <span className="uno-catch-wait-hint" aria-live="polite">
              Missed UNO can be called in {catchWaitSeconds}s…
            </span>
          )}
        </div>

        {wildPickId && isMyTurn && (
          <div className="uno-wild-picker" role="group" aria-label="Choose wild color">
            <p className="uno-wild-hint">Pick a color for your wild card.</p>
            <div className="uno-wild-colors">
              {(["red", "yellow", "green", "blue"] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`btn uno-wild-color-btn uno-wild-color-btn--${c}`}
                  disabled={!canPlay}
                  onClick={() => playWild(wildPickId, c)}
                >
                  {c}
                </button>
              ))}
            </div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setWildPickId(null)}>
              Cancel
            </button>
          </div>
        )}

        <div className="uno-my-hand" aria-label="Your hand">
          <h3 className="uno-hand-title">Your cards</h3>
          <ul className="uno-hand-list">
            {playing.myHand.map((card) => (
              <li key={card.id}>
                <button
                  type="button"
                  className={`uno-card uno-card--hand ${cardToneClass(card)}${
                    wildPickId === card.id ? " uno-card--picked" : ""
                  }`}
                  disabled={!canPlay || !isMyTurn}
                  onClick={() => onCardClick(card)}
                >
                  <span className="uno-card-face">{cardLabel(card)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        {!canPlay && <p className="mode-option-hint">You are benched and cannot play this round.</p>}
        {isHost && (
          <p className="mode-option-hint">Host can restart or end the game from the player panel.</p>
        )}
      </div>
    </section>
  );
}
