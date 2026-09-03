import { useState, type JSX } from "react";
import type {
  ClientEvent,
  SessionState,
  SplendorCardView,
  SplendorGemColorContract,
  SplendorTokenCountsView,
  SplendorTokenColorContract
} from "../../../shared/contracts";
import {
  SPLENDOR_GEM_COLORS,
  SPLENDOR_GEM_LABELS,
  SPLENDOR_TOKEN_COLORS,
  SPLENDOR_TOKEN_LABELS,
  emptyTokenCounts
} from "../../../shared/splendorData";
import { canAffordCard, canTakeSameColor } from "../../../shared/splendorLogic";
import { AvatarShower } from "../components/AvatarShower";
import { PlayerName } from "../components/PlayerName";

type Mode = "idle" | "takeDifferent" | "takeSame" | "returnTokens";

function tokenTotal(tokens: SplendorTokenCountsView): number {
  return SPLENDOR_TOKEN_COLORS.reduce((sum, c) => sum + (tokens[c] ?? 0), 0);
}

function CostPips({ cost }: { cost: SplendorCardView["cost"] }): JSX.Element {
  return (
    <div className="splendor-cost">
      {SPLENDOR_GEM_COLORS.filter((c) => (cost[c] ?? 0) > 0).map((color) => (
        <span
          key={color}
          className={`splendor-pip splendor-pip--${color}`}
          title={`${cost[color]} ${SPLENDOR_GEM_LABELS[color]}`}
        >
          {cost[color]}
        </span>
      ))}
    </div>
  );
}

function DevelopmentCardFace({
  card,
  className,
  count
}: {
  card: SplendorCardView;
  className?: string;
  count?: number;
}): JSX.Element {
  return (
    <div
      className={["splendor-card", `splendor-card--${card.bonus}`, className].filter(Boolean).join(" ")}
      aria-hidden="true"
    >
      <div className="splendor-card-top">
        <span className="splendor-card-prestige">{card.prestige > 0 ? card.prestige : ""}</span>
        {count && count > 1 ? <span className="splendor-card-stack-count">{count}</span> : null}
      </div>
    </div>
  );
}

function PurchasedCardStacks({
  purchasedByBonus,
  compact = false
}: {
  purchasedByBonus: Record<SplendorGemColorContract, SplendorCardView[]>;
  compact?: boolean;
}): JSX.Element {
  const columns = SPLENDOR_GEM_COLORS.filter((color) => purchasedByBonus[color].length > 0);
  if (columns.length === 0) {
    return <p className="splendor-hint">No cards yet.</p>;
  }
  return (
    <div className={["splendor-stacks", compact ? "splendor-stacks--compact" : ""].filter(Boolean).join(" ")}>
      {columns.map((color) => {
        const cards = purchasedByBonus[color];
        const visibleStack = cards.slice(-3);
        return (
          <div key={color} className="splendor-stack" title={`${cards.length} ${SPLENDOR_GEM_LABELS[color]} cards`}>
            <div className="splendor-stack-cards">
              {visibleStack.map((card, index) => (
                <DevelopmentCardFace
                  key={`${card.id}-${index}`}
                  card={card}
                  className="splendor-card--mini"
                  count={index === visibleStack.length - 1 ? cards.length : undefined}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DevelopmentCard({
  card,
  selected,
  affordable,
  disabled,
  onClick
}: {
  card: SplendorCardView;
  selected?: boolean;
  affordable?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      className={[
        "splendor-card",
        `splendor-card--${card.bonus}`,
        selected ? "splendor-card--selected" : "",
        affordable ? "splendor-card--affordable" : "",
        disabled ? "splendor-card--disabled" : ""
      ]
        .filter(Boolean)
        .join(" ")}
      disabled={disabled}
      onClick={onClick}
      aria-label={`Tier ${card.tier} ${SPLENDOR_GEM_LABELS[card.bonus]} card, ${card.prestige} points`}
    >
      <div className="splendor-card-top">
        <span className="splendor-card-prestige">{card.prestige > 0 ? card.prestige : ""}</span>
      </div>
      <CostPips cost={card.cost} />
      <span className="splendor-card-tier">T{card.tier}</span>
    </button>
  );
}

function TokenChip({
  color,
  count,
  selected,
  disabled,
  onClick
}: {
  color: SplendorTokenColorContract;
  count: number;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}): JSX.Element {
  if (onClick) {
    return (
      <button
        type="button"
        className={[
          "splendor-token",
          `splendor-token--${color}`,
          selected ? "splendor-token--selected" : "",
          disabled ? "splendor-token--disabled" : ""
        ]
          .filter(Boolean)
          .join(" ")}
        disabled={disabled}
        onClick={onClick}
        title={SPLENDOR_TOKEN_LABELS[color]}
      >
        <span className="splendor-token-count">{count}</span>
      </button>
    );
  }
  return (
    <div
      className={["splendor-token", `splendor-token--${color}`].join(" ")}
      title={SPLENDOR_TOKEN_LABELS[color]}
    >
      <span className="splendor-token-count">{count}</span>
    </div>
  );
}

export function SplendorGame({
  session,
  currentParticipantId,
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

  const game = session.gameState?.type === "splendor" ? session.gameState.state : null;
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
      .map((id) => session.participants.find((p) => p.id === id))
      .filter(Boolean);
    return (
      <div className="splendor-game splendor-game--finished">
        <div className="splendor-winner-banner">
          <p className="splendor-winner-title">{winners.length > 1 ? "Shared victory!" : "Winner!"}</p>
          <div className="splendor-winner-names">
            {winners.map((id) => (
              <span key={id} className="splendor-winner-name">
                {nameNode(id, "lg")}
              </span>
            ))}
          </div>
          <p className="splendor-winner-score">
            {winners.map((id) => `${game.prestigeByParticipant[id] ?? 0} prestige`).join(" · ")}
          </p>
        </div>
        <AvatarShower
          avatars={winnerParticipants
            .map((p) => p!.avatar)
            .filter((avatar): avatar is NonNullable<typeof avatar> => Boolean(avatar))}
          variant="rain"
          active
        />
        <ul className="splendor-final-list">
          {game.players
            .slice()
            .sort((a, b) => b.prestige - a.prestige)
            .map((p) => (
              <li key={p.participantId}>
                {nameNode(p.participantId)} — {p.prestige} pts ({p.purchasedCardCount} cards)
              </li>
            ))}
        </ul>
      </div>
    );
  }

  const me = game.players.find((p) => p.participantId === currentParticipantId);
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
      return game.market[selectedTier].find((c) => c?.id === selectedCardId) ?? null;
    }
    if (selectedSource === "reserved") {
      return game.myReserved.find((c) => c.id === selectedCardId) ?? null;
    }
    return null;
  };

  const selectedCard = findSelectedCard();
  const selectedAffordable = selectedCard
    ? canAffordCard(selectedCard, myTokens, myBonuses)
    : false;

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
        return prev.filter((c) => c !== color);
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
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={!canAct || game.deckCounts[tier] < 1 || (me?.reservedCount ?? 0) >= 3}
          onClick={() => reserveFromDeck(tier)}
        >
          Reserve deck ({game.deckCounts[tier]})
        </button>
      </div>
      <div className="splendor-tier-row">
        {game.market[tier].map((card, idx) =>
          card ? (
            <DevelopmentCard
              key={card.id}
              card={card}
              selected={selectedCardId === card.id && selectedSource === "market"}
              affordable={canAct && canAffordCard(card, myTokens, myBonuses)}
              disabled={!canAct}
              onClick={() => selectMarketCard(tier, card)}
            />
          ) : (
            <div key={`empty-${tier}-${idx}`} className="splendor-card splendor-card--empty" />
          )
        )}
      </div>
    </div>
  );

  return (
    <div className="splendor-game">
      <header className="splendor-head">
        <div>
          <h2>Splendor</h2>
          <p className="splendor-sub">
            First to {game.prestigeToEnd} prestige ends the round. Current turn: {nameNode(game.currentPlayerId)}
            {game.finalRoundAnchorPlayerId ? " · Final round!" : ""}
          </p>
        </div>
        {!isMyTurn && canPlay ? (
          <p className="splendor-wait">Waiting for {nameNode(game.currentPlayerId)}…</p>
        ) : null}
      </header>

      {game.players.some((p) => p.participantId !== currentParticipantId) ? (
        <section className="splendor-opponents" aria-label="Other players">
          {game.players
            .filter((p) => p.participantId !== currentParticipantId)
            .map((player) => (
              <article
                key={player.participantId}
                className={[
                  "splendor-opponent",
                  player.participantId === game.currentPlayerId ? "splendor-opponent--turn" : ""
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <header className="splendor-opponent-head">
                  <h3>{nameNode(player.participantId)}</h3>
                  <span className="splendor-prestige">{player.prestige} pts</span>
                </header>
                <div className="splendor-token-row splendor-token-row--xs">
                  {SPLENDOR_TOKEN_COLORS.map((color) =>
                    player.tokens[color] > 0 ? (
                      <TokenChip key={color} color={color} count={player.tokens[color]} />
                    ) : null
                  )}
                </div>
                <PurchasedCardStacks purchasedByBonus={player.purchasedByBonus} compact />
                <footer className="splendor-opponent-meta">
                  {player.nobles.length > 0 ? (
                    <span className="splendor-opponent-nobles">
                      {player.nobles.map((n) => n.name).join(", ")}
                    </span>
                  ) : null}
                  {player.reservedCount > 0 ? (
                    <span className="splendor-reserved-count">Reserved: {player.reservedCount}</span>
                  ) : null}
                </footer>
              </article>
            ))}
        </section>
      ) : null}

      <section className="splendor-nobles" aria-label="Nobles">
        <h3>Nobles</h3>
        <div className="splendor-noble-row">
          {game.nobles.map((noble) => (
            <div key={noble.id} className="splendor-noble">
              <strong>3</strong>
              <div className="splendor-noble-reqs">
                {SPLENDOR_GEM_COLORS.filter((c) => (noble.requirements[c] ?? 0) > 0).map((color) => (
                  <span key={color} className={`splendor-pip splendor-pip--${color}`}>
                    {noble.requirements[color]}
                  </span>
                ))}
              </div>
              <span className="splendor-noble-name">{noble.name}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="splendor-bank" aria-label="Gem bank">
        <h3>Bank</h3>
        <div className="splendor-token-row">
          {SPLENDOR_TOKEN_COLORS.map((color) => (
            <TokenChip
              key={color}
              color={color}
              count={game.bank[color]}
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

      <section className="splendor-market" aria-label="Development cards">
        {[3, 2, 1].map((tier) => renderTier(tier as 1 | 2 | 3))}
      </section>

      {canPlay && isMyTurn && !pendingMine ? (
        <section className="splendor-actions" aria-label="Your actions">
          {mode === "idle" ? (
            <>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setMode("takeDifferent")}>
                Take different gems
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMode("takeSame")}>
                Take 2 of one color
              </button>
              {selectedCardId && selectedSource === "market" ? (
                <>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={!selectedAffordable}
                    onClick={buySelected}
                  >
                    Buy card
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
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
                  className="btn btn-primary btn-sm"
                  disabled={!selectedAffordable}
                  onClick={buySelected}
                >
                  Buy reserved
                </button>
              ) : null}
              {selectedCardId ? (
                <button type="button" className="btn btn-ghost btn-sm" onClick={resetSelection}>
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
                className="btn btn-primary btn-sm"
                disabled={selectedColors.length < 1}
                onClick={confirmTakeDifferent}
              >
                Confirm ({selectedColors.length})
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={resetSelection}>
                Cancel
              </button>
            </>
          ) : null}
          {mode === "takeSame" ? (
            <>
              <p className="splendor-hint">Click a color in the bank that has at least 4 tokens.</p>
              <button type="button" className="btn btn-ghost btn-sm" onClick={resetSelection}>
                Cancel
              </button>
            </>
          ) : null}
        </section>
      ) : null}

      {pendingMine?.type === "returnTokens" ? (
        <section className="splendor-pending" aria-label="Return tokens">
          <h3>Return {pendingMine.mustReturn} token(s)</h3>
          <p className="splendor-hint">You may hold at most 10 gems.</p>
          <div className="splendor-return-grid">
            {SPLENDOR_TOKEN_COLORS.map((color) => (
              <div key={color} className="splendor-return-row">
                <TokenChip color={color} count={myTokens[color]} />
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={(returnDraft[color] ?? 0) >= myTokens[color]}
                  onClick={() => adjustReturn(color, 1)}
                >
                  +
                </button>
                <span>{returnDraft[color] ?? 0}</span>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={(returnDraft[color] ?? 0) < 1}
                  onClick={() => adjustReturn(color, -1)}
                >
                  −
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="btn btn-primary"
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
              .filter((n) => pendingMine.nobleIds.includes(n.id))
              .map((noble) => (
                <button
                  key={noble.id}
                  type="button"
                  className="splendor-noble splendor-noble--choice"
                  onClick={() =>
                    send({ type: "splendor:chooseNoble", payload: { nobleId: noble.id } })
                  }
                >
                  <strong>3</strong>
                  <div className="splendor-noble-reqs">
                    {SPLENDOR_GEM_COLORS.filter((c) => (noble.requirements[c] ?? 0) > 0).map(
                      (color) => (
                        <span key={color} className={`splendor-pip splendor-pip--${color}`}>
                          {noble.requirements[color]}
                        </span>
                      )
                    )}
                  </div>
                  <span className="splendor-noble-name">{noble.name}</span>
                </button>
              ))}
          </div>
        </section>
      ) : null}

      {me ? (
        <section
          className={[
            "splendor-my-board",
            isMyTurn ? "splendor-my-board--turn" : ""
          ]
            .filter(Boolean)
            .join(" ")}
          aria-label="Your board"
        >
          <header className="splendor-player-head">
            <h3>Your board</h3>
            <span className="splendor-prestige">{me.prestige} pts</span>
          </header>
          <div className="splendor-token-row splendor-token-row--sm">
            {SPLENDOR_TOKEN_COLORS.map((color) => (
              <TokenChip key={color} color={color} count={me.tokens[color]} />
            ))}
          </div>
          <div className="splendor-my-cards">
            <h4>Your cards</h4>
            <PurchasedCardStacks purchasedByBonus={me.purchasedByBonus} />
          </div>
          {me.nobles.length > 0 ? (
            <div className="splendor-player-nobles">
              {me.nobles.map((n) => (
                <span key={n.id} className="splendor-noble-chip">
                  {n.name}
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
                    selected={selectedCardId === card.id && selectedSource === "reserved"}
                    affordable={canAct && canAffordCard(card, myTokens, myBonuses)}
                    disabled={!canAct}
                    onClick={() => selectReservedCard(card)}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {!canPlay ? (
        <p className="splendor-hint">You are benched and cannot take turns this game.</p>
      ) : null}
    </div>
  );
}
