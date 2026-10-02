import { useRef, useState, type JSX } from "react";
import type {
  ClientEvent,
  SessionState,
  SplendorCardView,
  SplendorGemColorContract,
  SplendorTokenCountsView,
  SplendorTokenColorContract
} from "../../../shared/contracts";
import {
  SPLENDOR_TOKEN_COLORS,
  SPLENDOR_TOKEN_LABELS,
  emptyTokenCounts
} from "../../../shared/splendorData";
import { canAffordCard, canTakeSameColor } from "../../../shared/splendorLogic";
import { AvatarShower } from "../components/AvatarShower";
import { PlayerName } from "../components/PlayerName";
import { DeckPile, DevelopmentCard, PurchasedCardStacks } from "./splendor/DevelopmentCard";
import { NobleTile } from "./splendor/NobleTile";
import { ScoreValue } from "./splendor/ScoreValue";
import { SplendorNotices, TokenChip } from "./splendor/TokenChip";
import { useSplendorMotion } from "./splendor/useSplendorMotion";
import "./splendor/splendor.css";

type Mode = "idle" | "takeDifferent" | "takeSame" | "returnTokens";

function tokenTotal(tokens: SplendorTokenCountsView): number {
  return SPLENDOR_TOKEN_COLORS.reduce((sum, color) => sum + (tokens[color] ?? 0), 0);
}

export function SplendorGame({
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
  const [mode, setMode] = useState<Mode>("idle");
  const [selectedColors, setSelectedColors] = useState<SplendorGemColorContract[]>([]);
  const [returnDraft, setReturnDraft] = useState<SplendorTokenCountsView>(emptyTokenCounts());
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [selectedSource, setSelectedSource] = useState<"market" | "reserved" | null>(null);
  const [selectedTier, setSelectedTier] = useState<1 | 2 | 3 | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const game = session.gameState?.type === "splendor" ? session.gameState.state : null;
  const { notices } = useSplendorMotion(game, currentParticipantId, rootRef);

  if (!game) {
    return null;
  }

  const nameNode = (id: string, size: "xs" | "sm" | "md" | "lg" | "xl" = "sm"): JSX.Element => (
    <PlayerName participantId={id} participants={session.participants} size={size} inline />
  );

  const resetSelection = (): void => {
    setMode("idle");
    setSelectedColors([]);
    setSelectedCardId(null);
    setSelectedSource(null);
    setSelectedTier(null);
    setReturnDraft(emptyTokenCounts());
  };

  if (game.status === "finished") {
    const winners = game.winnerParticipantIds;
    const winnerParticipants = winners
      .map((id) => session.participants.find((participant) => participant.id === id))
      .filter(Boolean);
    const ranking = game.players.slice().sort((a, b) => b.prestige - a.prestige);
    return (
      <div ref={rootRef} className="splendor-game splendor-game--finished">
        <SplendorNotices notices={notices} />
        <section className="splendor-results" aria-label="Final standings">
          <p className="splendor-kicker">Final tableau</p>
          <h2 className="splendor-results-title">{winners.length > 1 ? "Shared victory!" : "Winner!"}</h2>
          <div className="splendor-winner-names">
            {winners.map((id) => (
              <span key={id} className="splendor-winner-name">
                {nameNode(id, "lg")}
              </span>
            ))}
          </div>
          <ol className="splendor-rank-list">
            {ranking.map((player) => {
              const place = ranking.findIndex((entry) => entry.prestige === player.prestige) + 1;
              const winner = winners.includes(player.participantId);
              return (
                <li
                  key={player.participantId}
                  className={winner ? "splendor-rank splendor-rank--winner" : "splendor-rank"}
                  data-splendor-id={`result:${player.participantId}`}
                >
                  <span className="splendor-rank-place">{place}</span>
                  <span>
                    {nameNode(player.participantId)}
                    <span className="splendor-hint">
                      {player.purchasedCardCount} cards
                      {player.nobles.length > 0 ? ` · ${player.nobles.map((noble) => noble.name).join(", ")}` : ""}
                    </span>
                  </span>
                  <span className="splendor-rank-score" data-splendor-id={`score:${player.participantId}`}>
                    <ScoreValue value={player.prestige} from={winner ? 0 : undefined} />
                    <span className="splendor-hint"> pts</span>
                  </span>
                </li>
              );
            })}
          </ol>
          {isHost ? (
            <button
              type="button"
              className="splendor-btn splendor-btn--primary"
              onClick={() => send({ type: "game:start", payload: { game: "splendor" } })}
            >
              Play again
            </button>
          ) : (
            <p className="splendor-results-note">The host can start another game.</p>
          )}
        </section>
        <AvatarShower
          avatars={winnerParticipants
            .map((participant) => participant!.avatar)
            .filter((avatar): avatar is NonNullable<typeof avatar> => Boolean(avatar))}
          variant="rain"
          active
        />
      </div>
    );
  }

  const me = game.players.find((player) => player.participantId === currentParticipantId);
  const isMyTurn = game.currentPlayerId === currentParticipantId;
  const pendingMine =
    game.pending && game.pending.participantId === currentParticipantId ? game.pending : null;
  const canAct = Boolean(canPlay && isMyTurn && !pendingMine && mode === "idle");
  const myBonuses = me?.bonuses ?? { white: 0, blue: 0, green: 0, red: 0, black: 0 };
  const myTokens = me?.tokens ?? emptyTokenCounts();

  const findSelectedCard = (): SplendorCardView | null => {
    if (!selectedCardId || !selectedSource) {
      return null;
    }
    if (selectedSource === "market" && selectedTier) {
      return game.market[selectedTier].find((card) => card?.id === selectedCardId) ?? null;
    }
    if (selectedSource === "reserved") {
      return game.myReserved.find((card) => card.id === selectedCardId) ?? null;
    }
    return null;
  };

  const selectedCard = findSelectedCard();
  const selectedAffordable = selectedCard ? canAffordCard(selectedCard, myTokens, myBonuses) : false;
  const eligibleNobleIds =
    pendingMine?.type === "chooseNoble" ? new Set(pendingMine.nobleIds) : new Set<string>();

  const selectMarketCard = (tier: 1 | 2 | 3, card: SplendorCardView): void => {
    if (!canAct) {
      return;
    }
    setSelectedCardId(card.id);
    setSelectedSource("market");
    setSelectedTier(tier);
    setMode("idle");
  };

  const selectReservedCard = (card: SplendorCardView): void => {
    if (!canAct) {
      return;
    }
    setSelectedCardId(card.id);
    setSelectedSource("reserved");
    setSelectedTier(null);
  };

  const toggleDifferentColor = (color: SplendorGemColorContract): void => {
    if (game.bank[color] < 1) {
      return;
    }
    setSelectedColors((prev) => {
      if (prev.includes(color)) {
        return prev.filter((entry) => entry !== color);
      }
      if (prev.length >= 3) {
        return prev;
      }
      return [...prev, color];
    });
  };

  const confirmTakeDifferent = (): void => {
    if (selectedColors.length < 1) {
      return;
    }
    send({ type: "splendor:takeDifferentGems", payload: { colors: selectedColors } });
    resetSelection();
  };

  const confirmTakeSame = (color: SplendorGemColorContract): void => {
    send({ type: "splendor:takeSameGems", payload: { color } });
    resetSelection();
  };

  const buySelected = (): void => {
    if (!selectedCardId || !selectedSource) {
      return;
    }
    send({
      type: "splendor:buyCard",
      payload: {
        source: selectedSource,
        cardId: selectedCardId,
        tier: selectedSource === "market" ? selectedTier ?? undefined : undefined
      }
    });
    resetSelection();
  };

  const reserveSelected = (): void => {
    if (!selectedCardId || selectedSource !== "market" || !selectedTier) {
      return;
    }
    if ((me?.reservedCount ?? 0) >= 3) {
      return;
    }
    send({
      type: "splendor:reserveCard",
      payload: { source: "market", tier: selectedTier, cardId: selectedCardId }
    });
    resetSelection();
  };

  const reserveFromDeck = (tier: 1 | 2 | 3): void => {
    if (!canAct || game.deckCounts[tier] < 1 || (me?.reservedCount ?? 0) >= 3) {
      return;
    }
    send({ type: "splendor:reserveCard", payload: { source: "deck", tier } });
    resetSelection();
  };

  const adjustReturn = (color: SplendorTokenColorContract, delta: number): void => {
    setReturnDraft((prev) => {
      const next = { ...prev };
      next[color] = Math.max(0, Math.min(myTokens[color], (prev[color] ?? 0) + delta));
      return next;
    });
  };

  const confirmReturn = (): void => {
    if (pendingMine?.type !== "returnTokens") {
      return;
    }
    if (tokenTotal(returnDraft) !== pendingMine.mustReturn) {
      return;
    }
    send({ type: "splendor:returnTokens", payload: { tokens: returnDraft } });
    resetSelection();
  };

  const renderTier = (tier: 1 | 2 | 3): JSX.Element => (
    <div className="splendor-tier" key={tier}>
      <div className="splendor-tier-label">
        <span>Tier {tier}</span>
      </div>
      <div className="splendor-tier-row">
        <DeckPile
          tier={tier}
          count={game.deckCounts[tier]}
          disabled={!canAct || (me?.reservedCount ?? 0) >= 3}
          onReserve={() => reserveFromDeck(tier)}
        />
        {game.market[tier].map((card, index) =>
          card ? (
            <DevelopmentCard
              key={card.id}
              card={card}
              splendorId={`card:${card.id}`}
              selected={selectedCardId === card.id && selectedSource === "market"}
              affordable={canAct && canAffordCard(card, myTokens, myBonuses)}
              unaffordable={canAct && !canAffordCard(card, myTokens, myBonuses)}
              disabled={!canAct}
              onClick={() => selectMarketCard(tier, card)}
            />
          ) : (
            <div key={`empty-${tier}-${index}`} className="splendor-card splendor-card--empty" />
          )
        )}
      </div>
    </div>
  );

  return (
    <div
      ref={rootRef}
      className={["splendor-game", isMyTurn ? "splendor-game--my-turn" : ""].filter(Boolean).join(" ")}
    >
      <SplendorNotices notices={notices} />
      {game.players.some((player) => player.participantId !== currentParticipantId) ? (
        <section className="splendor-opponents" aria-label="Other players">
          {game.players
            .filter((player) => player.participantId !== currentParticipantId)
            .map((player) => (
              <article
                key={player.participantId}
                className={[
                  "splendor-opponent",
                  player.participantId === game.currentPlayerId ? "splendor-opponent--turn" : ""
                ]
                  .filter(Boolean)
                  .join(" ")}
                data-splendor-id={`seat:${player.participantId}`}
              >
                <header className="splendor-opponent-head">
                  <h3>{nameNode(player.participantId)}</h3>
                  <span className="splendor-prestige" data-splendor-id={`score:${player.participantId}`}>
                    <ScoreValue value={player.prestige} /> pts
                  </span>
                </header>
                <div className="splendor-token-row">
                  {SPLENDOR_TOKEN_COLORS.map((color) =>
                    player.tokens[color] > 0 ? (
                      <TokenChip
                        key={color}
                        color={color}
                        count={player.tokens[color]}
                        size="xs"
                        splendorId={`tokens:${player.participantId}:${color}`}
                      />
                    ) : null
                  )}
                </div>
                <PurchasedCardStacks
                  participantId={player.participantId}
                  purchasedByBonus={player.purchasedByBonus}
                  compact
                />
                <footer className="splendor-opponent-meta">
                  {player.nobles.map((noble) => (
                    <span
                      key={noble.id}
                      className="splendor-noble-chip"
                      data-splendor-id={`noble-owned:${player.participantId}:${noble.id}`}
                    >
                      {noble.name}
                    </span>
                  ))}
                  {player.reservedCount > 0 ? (
                    <span className="splendor-reserved-count">Reserved: {player.reservedCount}</span>
                  ) : null}
                </footer>
              </article>
            ))}
        </section>
      ) : null}

      <div className="splendor-table">
        <header className="splendor-head">
          <div>
            <p className="splendor-kicker">Development</p>
            <h2>Splendor</h2>
            <p className="splendor-sub">
              First to {game.prestigeToEnd} prestige ends the round. Current turn: {nameNode(game.currentPlayerId)}
              {game.finalRoundAnchorPlayerId ? " · Final round!" : ""}
            </p>
          </div>
          <div>
            <span className={isMyTurn ? "splendor-turn-badge splendor-turn-badge--mine" : "splendor-turn-badge"}>
              {isMyTurn ? "Your turn" : "Waiting"}
            </span>
            {!isMyTurn && canPlay ? (
              <p className="splendor-wait">Waiting for {nameNode(game.currentPlayerId)}…</p>
            ) : null}
          </div>
        </header>

        <section className="splendor-nobles" aria-label="Nobles">
          <h3 className="splendor-section-label">Nobles</h3>
          <div className="splendor-noble-row">
            {game.nobles.map((noble) => (
              <NobleTile
                key={noble.id}
                noble={noble}
                eligible={eligibleNobleIds.has(noble.id)}
                splendorId={`noble:${noble.id}`}
              />
            ))}
          </div>
        </section>

        <div className="splendor-table-main">
          <section className="splendor-market" aria-label="Development cards">
            {[3, 2, 1].map((tier) => renderTier(tier as 1 | 2 | 3))}
          </section>

          <section className="splendor-bank" aria-label="Gem bank">
            <h3 className="splendor-section-label">Bank</h3>
            <div className="splendor-token-row">
              {SPLENDOR_TOKEN_COLORS.map((color) => (
                <TokenChip
                  key={color}
                  color={color}
                  count={game.bank[color]}
                  splendorId={`bank:${color}`}
                  selected={
                    mode === "takeDifferent" &&
                    color !== "gold" &&
                    selectedColors.includes(color as SplendorGemColorContract)
                  }
                  disabled={
                    !canPlay ||
                    !isMyTurn ||
                    Boolean(pendingMine) ||
                    (mode === "takeDifferent" && (color === "gold" || game.bank[color] < 1)) ||
                    (mode === "takeSame" &&
                      (color === "gold" || !canTakeSameColor(game.bank[color as SplendorGemColorContract])))
                  }
                  onClick={
                    mode === "takeDifferent" && color !== "gold"
                      ? () => toggleDifferentColor(color)
                      : mode === "takeSame" && color !== "gold"
                        ? () => confirmTakeSame(color)
                        : undefined
                  }
                />
              ))}
            </div>
          </section>
        </div>

        {canPlay && isMyTurn && !pendingMine ? (
          <section className="splendor-actions" aria-label="Your actions">
            {mode === "idle" ? (
              <>
                <button type="button" className="splendor-btn splendor-btn--primary" onClick={() => setMode("takeDifferent")}>
                  Take different gems
                </button>
                <button type="button" className="splendor-btn splendor-btn--ghost" onClick={() => setMode("takeSame")}>
                  Take 2 of one color
                </button>
                {selectedCardId && selectedSource === "market" ? (
                  <>
                    <button
                      type="button"
                      className="splendor-btn splendor-btn--primary"
                      disabled={!selectedAffordable}
                      onClick={buySelected}
                    >
                      Buy card
                    </button>
                    <button
                      type="button"
                      className="splendor-btn splendor-btn--ghost"
                      disabled={(me?.reservedCount ?? 0) >= 3}
                      onClick={reserveSelected}
                    >
                      Reserve card
                    </button>
                  </>
                ) : null}
                {selectedCardId && selectedSource === "reserved" ? (
                  <button
                    type="button"
                    className="splendor-btn splendor-btn--primary"
                    disabled={!selectedAffordable}
                    onClick={buySelected}
                  >
                    Buy reserved
                  </button>
                ) : null}
                {selectedCardId ? (
                  <button type="button" className="splendor-btn splendor-btn--ghost" onClick={resetSelection}>
                    Clear selection
                  </button>
                ) : null}
              </>
            ) : null}
            {mode === "takeDifferent" ? (
              <>
                <p className="splendor-hint">Select 1–3 different colors from the bank, then confirm.</p>
                <button
                  type="button"
                  className="splendor-btn splendor-btn--primary"
                  disabled={selectedColors.length < 1}
                  onClick={confirmTakeDifferent}
                >
                  Confirm ({selectedColors.length})
                </button>
                <button type="button" className="splendor-btn splendor-btn--ghost" onClick={resetSelection}>
                  Cancel
                </button>
              </>
            ) : null}
            {mode === "takeSame" ? (
              <>
                <p className="splendor-hint">Click a color in the bank that has at least 4 tokens.</p>
                <button type="button" className="splendor-btn splendor-btn--ghost" onClick={resetSelection}>
                  Cancel
                </button>
              </>
            ) : null}
          </section>
        ) : null}
      </div>

      {pendingMine?.type === "returnTokens" ? (
        <section className="splendor-pending" aria-label="Return tokens">
          <h3>Return {pendingMine.mustReturn} {pendingMine.mustReturn === 1 ? "token" : "tokens"}</h3>
          <p className="splendor-hint">You may hold at most 10 gems.</p>
          <div className="splendor-return-grid">
            {SPLENDOR_TOKEN_COLORS.map((color) => (
              <div key={color} className="splendor-return-row">
                <TokenChip color={color} count={myTokens[color]} size="sm" />
                <button
                  type="button"
                  className="splendor-btn splendor-btn--ghost"
                  disabled={(returnDraft[color] ?? 0) >= myTokens[color]}
                  onClick={() => adjustReturn(color, 1)}
                  aria-label={`Return one more ${SPLENDOR_TOKEN_LABELS[color]}`}
                >
                  +
                </button>
                <span>{returnDraft[color] ?? 0}</span>
                <button
                  type="button"
                  className="splendor-btn splendor-btn--ghost"
                  disabled={(returnDraft[color] ?? 0) < 1}
                  onClick={() => adjustReturn(color, -1)}
                  aria-label={`Return one fewer ${SPLENDOR_TOKEN_LABELS[color]}`}
                >
                  −
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="splendor-btn splendor-btn--primary"
            disabled={tokenTotal(returnDraft) !== pendingMine.mustReturn}
            onClick={confirmReturn}
          >
            Return {tokenTotal(returnDraft)} / {pendingMine.mustReturn}
          </button>
        </section>
      ) : null}

      {pendingMine?.type === "chooseNoble" ? (
        <section className="splendor-pending" aria-label="Choose noble">
          <h3>Choose a noble</h3>
          <div className="splendor-noble-row">
            {game.nobles
              .filter((noble) => pendingMine.nobleIds.includes(noble.id))
              .map((noble) => (
                <NobleTile
                  key={noble.id}
                  noble={noble}
                  eligible
                  onClick={() => send({ type: "splendor:chooseNoble", payload: { nobleId: noble.id } })}
                />
              ))}
          </div>
        </section>
      ) : null}

      {me ? (
        <section
          className={["splendor-my-board", isMyTurn ? "splendor-my-board--turn" : ""].filter(Boolean).join(" ")}
          aria-label="Your board"
          data-splendor-id={`seat:${me.participantId}`}
        >
          <header className="splendor-player-head">
            <h3>Your board</h3>
            <span className="splendor-prestige" data-splendor-id={`score:${me.participantId}`}>
              <ScoreValue value={me.prestige} /> pts
            </span>
          </header>
          <div className="splendor-token-row">
            {SPLENDOR_TOKEN_COLORS.map((color) => (
              <TokenChip
                key={color}
                color={color}
                count={me.tokens[color]}
                size="sm"
                splendorId={`tokens:${me.participantId}:${color}`}
              />
            ))}
          </div>
          <div className="splendor-my-cards">
            <h4>Your cards</h4>
            <PurchasedCardStacks participantId={me.participantId} purchasedByBonus={me.purchasedByBonus} />
          </div>
          {me.nobles.length > 0 ? (
            <div className="splendor-player-nobles">
              {me.nobles.map((noble) => (
                <span
                  key={noble.id}
                  className="splendor-noble-chip"
                  data-splendor-id={`noble-owned:${me.participantId}:${noble.id}`}
                >
                  {noble.name}
                </span>
              ))}
            </div>
          ) : null}
          {game.myReserved.length > 0 ? (
            <div className="splendor-reserved">
              <h4>Your reserved ({game.myReserved.length})</h4>
              <div className="splendor-tier-row">
                {game.myReserved.map((card) => (
                  <DevelopmentCard
                    key={card.id}
                    card={card}
                    splendorId={`reserved:${card.id}`}
                    selected={selectedCardId === card.id && selectedSource === "reserved"}
                    affordable={canAct && canAffordCard(card, myTokens, myBonuses)}
                    unaffordable={canAct && !canAffordCard(card, myTokens, myBonuses)}
                    disabled={!canAct}
                    onClick={() => selectReservedCard(card)}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {!canPlay ? <p className="splendor-hint">You are benched and cannot take turns this game.</p> : null}
    </div>
  );
}
