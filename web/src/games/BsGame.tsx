import { useEffect, useMemo, useState, type JSX } from "react";
import type { BsCard, ClientEvent, SessionState } from "../../../shared/contracts";
import { PlayerName } from "../components/PlayerName";
import { activeParticipants } from "../utils/participants";

const SUIT_SYMBOL: Record<BsCard["suit"], string> = {
  clubs: "♣",
  diamonds: "♦",
  hearts: "♥",
  spades: "♠"
};

function cardLabel(card: BsCard): string {
  return `${card.rank}${SUIT_SYMBOL[card.suit]}`;
}

const RANK_ORDER: Record<BsCard["rank"], number> = {
  A: 1,
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
  "10": 10,
  J: 11,
  Q: 12,
  K: 13
};

const SUIT_ORDER: Record<BsCard["suit"], number> = {
  clubs: 1,
  diamonds: 2,
  hearts: 3,
  spades: 4
};

function sortBsCards(cards: BsCard[]): BsCard[] {
  return [...cards].sort((a, b) => {
    const byRank = RANK_ORDER[a.rank] - RANK_ORDER[b.rank];
    if (byRank !== 0) {
      return byRank;
    }
    return SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit];
  });
}

export function BsGame({
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
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const game = session.gameState?.type === "bs" ? session.gameState : null;
  if (!game) {
    return null;
  }
  const state = game.state;
  const roster = activeParticipants(session.participants);
  const nameFor = (id: string): string => roster.find((p) => p.id === id)?.displayName ?? "Player";
  const nameNode = (id: string, size: "xs" | "sm" | "md" | "lg" | "xl" = "sm"): JSX.Element => (
    <PlayerName participantId={id} participants={session.participants} size={size} inline />
  );

  const isCurrentPlayer =
    state.status !== "finished" && state.currentPlayerId === currentParticipantId;

  const myVote =
    state.status === "challenging" || state.status === "challenged"
      ? state.calledBsParticipantId === currentParticipantId
        ? "called"
        : state.believedParticipantIds.includes(currentParticipantId)
          ? "believed"
          : null
      : null;

  const toggleCard = (cardId: string): void => {
    if (!canPlay || state.status !== "playing" || !isCurrentPlayer) {
      return;
    }
    setSelectedCardIds((prev) => {
      if (prev.includes(cardId)) {
        return prev.filter((id) => id !== cardId);
      }
      if (prev.length >= 4) {
        return prev;
      }
      return [...prev, cardId];
    });
  };

  const playSelected = (): void => {
    if (selectedCardIds.length < 1 || selectedCardIds.length > 4) {
      return;
    }
    send({ type: "bs:playCards", payload: { cardIds: selectedCardIds } });
    setSelectedCardIds([]);
  };

  const scoreRows = useMemo(() => {
    if (state.status !== "finished") {
      return [];
    }
    return [...session.participants].sort((a, b) => (state.scores[b.id] ?? b.score) - (state.scores[a.id] ?? a.score));
  }, [session.participants, state]);

  const sortedMyHand = useMemo(() => {
    if (state.status === "finished") {
      return [];
    }
    return sortBsCards(state.myHand);
  }, [state]);

  const challengedRevealUi = useMemo(() => {
    if (state.status !== "challenged") {
      return null;
    }
    const allRevealedMatchCall = state.revealedCards.every((c) => c.rank === state.currentRank);
    return {
      allRevealedMatchCall,
      revealedText: state.revealedCards.map((card) => cardLabel(card)).join(", "),
      callRank: state.currentRank
    };
  }, [state]);

  const canSelectCards = state.status === "playing" && isCurrentPlayer && canPlay;

  useEffect(() => {
    if (!canSelectCards && selectedCardIds.length > 0) {
      setSelectedCardIds([]);
    }
  }, [canSelectCards, selectedCardIds.length]);

  return (
    <section className="card game-surface" aria-label="BS">
      <header className="card-head">
        <h2>BS</h2>
        <div className="card-head-tags">
          <span className="pill pill-muted">Discard pile: {state.status === "finished" ? 0 : state.discardCount}</span>
          {state.status === "finished" ? (
            <span className="pill pill-muted">Game over</span>
          ) : (
            <span className="pill pill-muted">
              {isCurrentPlayer ? "Your turn" : <PlayerName participantId={state.currentPlayerId} participants={session.participants} size="md" inline />}
            </span>
          )}
        </div>
      </header>

      {state.status !== "finished" ? (
        <div
          className={`game-area-turn${
            state.status === "playing" && isCurrentPlayer ? " game-area-turn--active" : ""
          }`}
        >
          <div className="bs-my-hand" aria-label="Your hand">
            <h3 className="uno-hand-title">Your cards</h3>
            <ul className="bs-hand-list">
              {sortedMyHand.map((card) => {
                const selected = selectedCardIds.includes(card.id);
                return (
                  <li key={card.id}>
                    <button
                      type="button"
                      className={`bs-card bs-card--${card.suit}${selected ? " bs-card--selected" : ""}`}
                      onClick={() => toggleCard(card.id)}
                      disabled={!canSelectCards}
                    >
                      {cardLabel(card)}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          {state.status === "playing" && (
            <>
              <p>
                Current call is <strong>{state.currentRank}</strong>. The active player verbally says what they played.
              </p>
              {isCurrentPlayer ? (
                <>
                  <p>Select 1-4 cards from your hand, then click Play.</p>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={!canSelectCards || selectedCardIds.length < 1 || selectedCardIds.length > 4}
                    onClick={playSelected}
                  >
                    Play selected cards
                  </button>
                </>
              ) : (
                <p>Waiting for {nameNode(state.currentPlayerId, "sm")} to play cards.</p>
              )}
            </>
          )}

          {state.status === "challenging" && (
            <>
              <p>
                {nameNode(state.currentPlayerId, "sm")} played <strong>{state.playedCount}</strong> card
                {state.playedCount === 1 ? "" : "s"} as <strong>{state.currentRank}</strong>.
              </p>
              {isCurrentPlayer ? (
                <p>Waiting for other players to believe or call BS.</p>
              ) : (
                <div className="card-footer card-footer-actions">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={!canPlay || myVote !== null}
                    onClick={() => send({ type: "bs:believe", payload: {} })}
                  >
                    I believe them
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={!canPlay || myVote !== null}
                    onClick={() => send({ type: "bs:callBS", payload: {} })}
                  >
                    That&apos;s BS!
                  </button>
                </div>
              )}
            </>
          )}

          {state.status === "challenged" && challengedRevealUi && (
            <>
              <p>
                {nameNode(state.calledBsParticipantId, "sm")} called BS on {nameNode(state.currentPlayerId, "sm")}.
              </p>
              <p>
                Call was <strong>{challengedRevealUi.callRank}</strong>, revealed cards:{" "}
                {challengedRevealUi.revealedText}
              </p>
              {isHost ? (
                <div className="card-footer card-footer-actions">
                  <button
                    type="button"
                    className={`btn btn-secondary${
                      challengedRevealUi.allRevealedMatchCall ? " bs-host-resolve-btn--suggested" : ""
                    }`}
                    onClick={() => send({ type: "bs:resolveChallenge", payload: { truth: true } })}
                  >
                    Truth was told
                  </button>
                  <button
                    type="button"
                    className={`btn btn-primary${
                      challengedRevealUi.allRevealedMatchCall ? "" : " bs-host-resolve-btn--suggested"
                    }`}
                    onClick={() => send({ type: "bs:resolveChallenge", payload: { truth: false } })}
                  >
                    That was BS
                  </button>
                </div>
              ) : (
                <p>Waiting for host to resolve this challenge.</p>
              )}
            </>
          )}
        </div>
      ) : (
        <>
          <p>The game is over. Last two players receive 0 points.</p>
          <ul className="players-list" aria-label="Final scores">
            {scoreRows.map((participant) => (
              <li key={participant.id} className="player-row">
                <div className="player-identity">
                  <span className="player-name">
                    <PlayerName participant={participant} size="xs" inline />
                  </span>
                </div>
                <div className="player-row-right">
                  <span className="player-score">{state.scores[participant.id] ?? participant.score}</span>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
