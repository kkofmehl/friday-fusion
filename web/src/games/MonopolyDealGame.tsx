import { useEffect, useRef, useState, type JSX } from "react";
import type {
  ClientEvent,
  MonopolyDealCardInstance,
  MonopolyDealPaymentRef,
  MonopolyDealPlayerBoard,
  MonopolyDealPropertyColor,
  MonopolyDealState,
  SessionState
} from "../../../shared/contracts";
import { getCardDef, canBankCard } from "../../../shared/monopolyDealData";
import { PlayerName } from "../components/PlayerName";
import { activeParticipants } from "../utils/participants";
import { MonopolyDealCard } from "./monopolyDeal/MonopolyDealCard";
import { OpponentBoard } from "./monopolyDeal/OpponentBoard";
import { COLOR_LABEL } from "./monopolyDeal/colors";
import { isSetComplete, getSet, completePropertySetColors, paymentValue, hasPayableAssets, rentableColors, canAddHouse, canAddHotel, canTogglePaymentRef, paymentSelectionTotal, hasHouseEligibleSet, hasHotelEligibleSet, findPlacedCard, canPlayAsAction, hasSelectedAllRequiredPayment } from "../../../shared/monopolyDealLogic";
import { EventPanel } from "./monopolyDeal/EventPanel";
import { SetBonusIcons } from "./monopolyDeal/SetBonusIcons";
import { JustSayNoPanel } from "./monopolyDeal/JustSayNoPanel";
import { PropertyColorButton } from "./monopolyDeal/PropertyColorButton";
import { eachBoardPropertySet } from "./monopolyDeal/boardUtils";
import { PROPERTY_COLORS } from "../../../shared/monopolyDealData";

export function MonopolyDealGame({
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
  const game = session.gameState?.type === "monopolyDeal" ? session.gameState.state : null;

  const roster = activeParticipants(session.participants);
  const nameNode = (id: string): JSX.Element => (
    <PlayerName participantId={id} participants={session.participants} size="sm" inline />
  );

  if (!game) {
    return null;
  }

  if (game.status === "wagering") {
    return (
      <WageringPanel
        game={game}
        currentParticipantId={currentParticipantId}
        isHost={isHost}
        canPlay={canPlay}
        send={send}
        nameNode={nameNode}
        roster={roster}
      />
    );
  }

  if (game.status === "finished") {
    return (
      <div className="md-game md-game--finished">
        <div className="md-finished-hero">
          <div className="md-finished-trophy" aria-hidden>
            🏆
          </div>
          <h2 className="md-finished-title">
            <PlayerName participantId={game.winnerParticipantId} participants={session.participants} size="lg" inline />{" "}
            wins Monopoly Deal!
          </h2>
          <p className="md-finished-pot">
            Took the pot: <strong>{game.pot} pts</strong>
          </p>
        </div>
        {game.winnerBoard ? (
          <div className="md-finished-board">
            <h3>Winner&apos;s board</h3>
            <FinishedBoardDisplay board={game.winnerBoard} hand={game.winnerHand} />
          </div>
        ) : game.winnerHand.length > 0 ? (
          <div className="md-finished-hand">
            <h3>Winner&apos;s hand</h3>
            <div className="md-card-row">
              {game.winnerHand.map((card) => (
                <MonopolyDealCard key={card.id} card={card} compact showHelp={false} />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <MonopolyDealPlayingView
      game={game}
      session={session}
      currentParticipantId={currentParticipantId}
      canPlay={canPlay}
      send={send}
      roster={roster}
      nameNode={nameNode}
    />
  );
}

function layColorsForCard(card: MonopolyDealCardInstance | undefined): MonopolyDealPropertyColor[] {
  if (!card) {
    return [];
  }
  const def = getCardDef(card.defId);
  if (def.kind === "property" && def.color) {
    return [def.color];
  }
  if (def.kind === "propertyWildDual" && def.colors) {
    return [...def.colors];
  }
  if (def.kind === "propertyWildMulti") {
    return Object.keys(COLOR_LABEL) as MonopolyDealPropertyColor[];
  }
  return [];
}

function MonopolyDealPlayingView({
  game,
  session,
  currentParticipantId,
  canPlay,
  send,
  roster,
  nameNode
}: {
  game: Extract<MonopolyDealState, { status: "playing" }>;
  session: SessionState;
  currentParticipantId: string;
  canPlay: boolean;
  send: (event: ClientEvent) => void;
  roster: SessionState["participants"];
  nameNode: (id: string) => JSX.Element;
}): JSX.Element {
  const [selectedHandIds, setSelectedHandIds] = useState<string[]>([]);
  const [selectedBoardWild, setSelectedBoardWild] = useState<{
    instanceId: string;
    propertyColor: MonopolyDealPropertyColor;
  } | null>(null);
  const [paymentSelection, setPaymentSelection] = useState<MonopolyDealPaymentRef[]>([]);
  const [showEndTurnConfirm, setShowEndTurnConfirm] = useState(false);
  const autoEndTimerRef = useRef<number | null>(null);

  const isMyTurn = game.currentPlayerId === currentParticipantId;
  const myBoard = game.boards.find((b) => b.participantId === currentParticipantId);
  const pending = game.pendingResolution;
  const justSayNoPending = pending?.kind === "justSayNo" ? pending : null;
  const isDiscarding = isMyTurn && canPlay && game.phase === "discarding" && !pending;
  const canSelectHandCards =
    isMyTurn && canPlay && game.playsRemaining > 0 && !pending && game.phase === "playing";
  const canInteractWithHand = canSelectHandCards || isDiscarding;
  const cardsToDiscard = Math.max(0, game.myHand.length - 7);
  const shouldPulseEndTurn = isMyTurn && canPlay && game.playsRemaining === 0 && !pending && game.phase === "playing";
  const canEndTurn = isMyTurn && canPlay && !pending && game.phase === "playing";
  const paymentBoard = myBoard ? { bank: myBoard.bank, propertySets: myBoard.propertySets } : null;
  const paymentSelectedTotal =
    paymentBoard && pending?.kind === "collectPayment"
      ? paymentSelection.reduce((sum, ref) => sum + paymentValue(ref, paymentBoard), 0)
      : 0;
  const canSubmitPayment =
    pending?.kind === "collectPayment" &&
    Boolean(paymentBoard) &&
    (paymentSelectedTotal >= pending.amountDue ||
      hasSelectedAllRequiredPayment(paymentBoard!, paymentSelection));
  const mustPaySomething =
    myBoard && pending?.kind === "collectPayment"
      ? hasPayableAssets({ bank: myBoard.bank, propertySets: myBoard.propertySets })
      : false;

  useEffect(() => {
    if (!canInteractWithHand) {
      setSelectedHandIds([]);
      setSelectedBoardWild(null);
    }
  }, [canInteractWithHand]);

  useEffect(() => {
    if (!shouldPulseEndTurn) {
      if (autoEndTimerRef.current !== null) {
        window.clearTimeout(autoEndTimerRef.current);
        autoEndTimerRef.current = null;
      }
      return;
    }
    autoEndTimerRef.current = window.setTimeout(() => {
      send({ type: "monopolyDeal:endTurn", payload: {} });
    }, 5000);
    return () => {
      if (autoEndTimerRef.current !== null) {
        window.clearTimeout(autoEndTimerRef.current);
        autoEndTimerRef.current = null;
      }
    };
  }, [shouldPulseEndTurn, send]);

  const toggleHandCard = (id: string): void => {
    if (isDiscarding) {
      setSelectedBoardWild(null);
      setSelectedHandIds((prev) => (prev.includes(id) ? prev.filter((cardId) => cardId !== id) : [...prev, id]));
      return;
    }
    if (!canSelectHandCards) {
      return;
    }
    setSelectedBoardWild(null);
    setSelectedHandIds((prev) => (prev.includes(id) ? [] : [id]));
  };

  const canFlipBoardWild =
    isMyTurn && canPlay && game.playsRemaining > 0 && !pending && game.phase === "playing";

  const flipSelectedBoardWild = (): void => {
    if (!canFlipBoardWild || !selectedBoardWild || !myBoard) {
      return;
    }
    const found = findPlacedCard(
      { bank: myBoard.bank, propertySets: myBoard.propertySets },
      selectedBoardWild.instanceId
    );
    const placed = found?.card;
    if (!placed || !found) {
      return;
    }
    const def = getCardDef(placed.defId);
    if (def.kind !== "propertyWildDual" || !def.colors) {
      return;
    }
    const newColor = def.colors.find((color) => color !== placed.activeColor);
    if (!newColor) {
      return;
    }
    send({
      type: "monopolyDeal:flipWild",
      payload: {
        instanceId: placed.instanceId,
        propertyColor: found.color,
        newColor
      }
    });
    setSelectedBoardWild(null);
  };

  const handleEndTurn = (): void => {
    if (!canEndTurn) {
      return;
    }
    if (game.playsRemaining > 0) {
      setShowEndTurnConfirm(true);
      return;
    }
    send({ type: "monopolyDeal:endTurn", payload: {} });
  };

  const bankCard = (cardId: string): void => {
    if (!canSelectHandCards) {
      return;
    }
    send({ type: "monopolyDeal:bankCard", payload: { cardId } });
    setSelectedHandIds([]);
  };

  const selectedCards = game.myHand.filter((c) => selectedHandIds.includes(c.id));
  const selectedCard = selectedCards[0];
  const selectedDef = selectedCard ? getCardDef(selectedCard.defId) : null;
  const isRentSelected = selectedDef?.kind === "rent";
  const doubleRentCard = game.myHand.find((c) => getCardDef(c.defId).action === "doubleTheRent");
  const layColorsForSelected = layColorsForCard(selectedCard);
  const playerBoardForRent = myBoard ? { bank: myBoard.bank, propertySets: myBoard.propertySets } : null;
  const canPlayRentAction = (): boolean => {
    if (!selectedCard || !selectedDef?.colors || !playerBoardForRent) {
      return false;
    }
    return rentableColors(playerBoardForRent, selectedDef.colors).length > 0;
  };
  const canPlaySelectedAction = (): boolean => {
    if (!selectedCard || !selectedDef || !playerBoardForRent) {
      return false;
    }
    if (selectedDef.kind === "rent") {
      return canPlayRentAction();
    }
    if (selectedDef.action === "house") {
      return PROPERTY_COLORS.some((color) => hasHouseEligibleSet(playerBoardForRent, color));
    }
    if (selectedDef.action === "hotel") {
      return PROPERTY_COLORS.some((color) => hasHotelEligibleSet(playerBoardForRent, color));
    }
    return canPlayAsAction(selectedDef);
  };

  const selectedBoardWildDef =
    selectedBoardWild && myBoard
      ? (() => {
          const placed = findPlacedCard(
            { bank: myBoard.bank, propertySets: myBoard.propertySets },
            selectedBoardWild.instanceId
          )?.card;
          return placed ? getCardDef(placed.defId) : null;
        })()
      : null;
  const selectedBoardWildFlipColor =
    selectedBoardWild && myBoard && selectedBoardWildDef?.kind === "propertyWildDual"
      ? selectedBoardWildDef.colors?.find((color) => {
          const placed = findPlacedCard(
            { bank: myBoard.bank, propertySets: myBoard.propertySets },
            selectedBoardWild.instanceId
          )?.card;
          return placed ? color !== placed.activeColor : false;
        })
      : undefined;

  const bankSelected = (): void => {
    const card = selectedCards[0];
    if (!card) {
      return;
    }
    bankCard(card.id);
  };

  const laySelected = (color: MonopolyDealPropertyColor): void => {
    if (!canSelectHandCards) {
      return;
    }
    const card = selectedCards[0];
    if (!card) {
      return;
    }
    send({ type: "monopolyDeal:layProperty", payload: { cardId: card.id, color } });
    setSelectedHandIds([]);
  };

  const playSelectedAction = (): void => {
    if (!canSelectHandCards) {
      return;
    }
    const card = selectedCards[0];
    if (!card) {
      return;
    }
    send({ type: "monopolyDeal:playAction", payload: { cardId: card.id } });
    setSelectedHandIds([]);
  };

  const playSelectedRentWithDouble = (): void => {
    if (!canSelectHandCards || !selectedCard || !doubleRentCard) {
      return;
    }
    send({
      type: "monopolyDeal:playAction",
      payload: { cardId: selectedCard.id, doubleRentCardId: doubleRentCard.id }
    });
    setSelectedHandIds([]);
  };

  const submitPayment = (): void => {
    if (!canSubmitPayment) {
      return;
    }
    send({ type: "monopolyDeal:submitPayment", payload: { cards: paymentSelection } });
  };

  const skipPayment = (): void => {
    send({ type: "monopolyDeal:submitPayment", payload: { cards: [] } });
  };

  useEffect(() => {
    if (pending?.kind !== "collectPayment" || pending.payerId !== currentParticipantId) {
      setPaymentSelection([]);
    }
  }, [pending, currentParticipantId]);

  const opponentBoards = game.boards.filter((board) => board.participantId !== currentParticipantId);
  const propertyPickTargetId =
    pending?.kind === "selectTarget" &&
    pending.actorId === currentParticipantId &&
    (pending.actionType === "forcedDeal" || pending.actionType === "slyDeal")
      ? pending.targetId ?? null
      : null;

  return (
    <div className="md-game">
      <div className="md-top-bar">
        <div className="md-pot-badge">Pot: {game.pot} pts</div>
        <div className="md-turn-info">
          Turn: {nameNode(game.currentPlayerId)} · Draw pile: {game.drawPileCount}
        </div>
      </div>

      {pending?.kind === "collectPayment" && pending.payerId === currentParticipantId ? (
        <div className="md-modal md-modal--paying">
          <h3>
            Pay {pending.amountDue}M to <PlayerName participantId={pending.payeeId} participants={session.participants} size="sm" inline />
          </h3>
          <p>{pending.reason}</p>
          <PaymentPicker
            board={myBoard}
            selection={paymentSelection}
            amountDue={pending.amountDue}
            onToggle={(ref) => {
              setPaymentSelection((prev) => {
                const key = `${ref.zone}:${ref.propertyColor ?? ""}:${ref.instanceId}`;
                const exists = prev.some(
                  (r) => `${r.zone}:${r.propertyColor ?? ""}:${r.instanceId}` === key
                );
                if (exists) {
                  return prev.filter((r) => `${r.zone}:${r.propertyColor ?? ""}:${r.instanceId}` !== key);
                }
                return [...prev, ref];
              });
            }}
          />
          <div className="md-payment-actions">
            <button type="button" className="md-btn" disabled={!canSubmitPayment} onClick={submitPayment}>
              Pay selected
            </button>
            {!mustPaySomething ? (
              <button type="button" className="md-btn md-btn--ghost" onClick={skipPayment}>
                Pay nothing
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {justSayNoPending || game.justSayNoLate ? (
        <JustSayNoPanel
          pending={justSayNoPending ?? undefined}
          late={game.justSayNoLate}
          currentParticipantId={currentParticipantId}
          myHand={game.myHand}
          participants={session.participants}
          send={send}
        />
      ) : null}

      <div className="md-play-layout">
        <div className="md-main-column">
          {myBoard ? (
            <div className="md-player-board md-player-board--me">
              <div className="md-player-name">
                {nameNode(myBoard.participantId)}
                {myBoard.participantId === game.currentPlayerId ? " (turn)" : ""} · {myBoard.handCount} in hand
              </div>
              <div className="md-bank">
                <span className="md-section-label">Bank</span>
                <div className="md-card-row">
                  {myBoard.bank.map((c) => (
                    <div key={c.id} className="md-banked-card-wrap">
                      <MonopolyDealCard card={c} compact />
                      {game.undoableBankCardId === c.id ? (
                        <button
                          type="button"
                          className="md-bank-undo"
                          aria-label="Undo banking this card"
                          onClick={() => send({ type: "monopolyDeal:undoBank", payload: {} })}
                        >
                          ×
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
              <div className="md-properties">
                <span className="md-section-label">Properties</span>
                <div className="md-property-sets">
                  {myBoard
                    ? (() => {
                        const groups: JSX.Element[] = [];
                        eachBoardPropertySet(myBoard.propertySets, (color, set, groupIndex) => {
                          groups.push(
                            <div
                              key={`${color}-${groupIndex}`}
                              className={`md-property-set${isSetComplete(set, color) ? " md-property-set--complete" : ""}`}
                            >
                              <div className="md-set-label">
                                {COLOR_LABEL[color]}
                                {groupIndex > 0 ? ` #${groupIndex + 1}` : ""}
                                <SetBonusIcons house={set.house} hotel={set.hotel} />
                              </div>
                              <div className="md-card-row">
                                {set.cards.map((c) => {
                                  const cardDef = getCardDef(c.defId);
                                  const isDualWild = cardDef.kind === "propertyWildDual";
                                  const isSelectedWild =
                                    selectedBoardWild?.instanceId === c.instanceId &&
                                    selectedBoardWild.propertyColor === color;
                                  return (
                                    <MonopolyDealCard
                                      key={c.instanceId}
                                      card={{ id: c.instanceId, defId: c.defId }}
                                      activeColor={c.activeColor}
                                      compact
                                      selected={isSelectedWild}
                                      disabled={!canFlipBoardWild || !isDualWild}
                                      onClick={
                                        isDualWild && canFlipBoardWild
                                          ? () => {
                                              setSelectedHandIds([]);
                                              setSelectedBoardWild(
                                                isSelectedWild
                                                  ? null
                                                  : { instanceId: c.instanceId, propertyColor: color }
                                              );
                                            }
                                          : undefined
                                      }
                                    />
                                  );
                                })}
                              </div>
                            </div>
                          );
                        });
                        return groups;
                      })()
                    : null}
                </div>
              </div>
            </div>
          ) : null}

          {canPlay ? (
            <div className={`md-hand-panel${!canSelectHandCards && isMyTurn && game.phase === "playing" ? " md-hand-panel--locked" : ""}`}>
          <EventPanel
            event={game.recentEvent}
            events={game.recentEvents}
            eventSeq={game.eventSeq}
            participants={session.participants}
          />
          {canEndTurn ? (
            <div className="md-end-turn-wrap">
              <button
                type="button"
                className={`md-btn md-btn--end-turn${shouldPulseEndTurn ? " md-btn--pulse" : ""}`}
                onClick={handleEndTurn}
              >
                <span className="md-end-turn-label">End turn</span>
                {isMyTurn ? (
                  <span className="md-plays-remaining">
                    {game.playsRemaining} play{game.playsRemaining === 1 ? "" : "s"} left
                  </span>
                ) : null}
              </button>
              {showEndTurnConfirm ? (
                <div className="md-modal md-modal--confirm md-modal--inline" role="dialog" aria-modal="true">
                  <h3>End turn early?</h3>
                  <p>You still have {game.playsRemaining} play{game.playsRemaining === 1 ? "" : "s"} left.</p>
                  <div className="md-confirm-actions">
                    <button type="button" className="md-btn" onClick={() => setShowEndTurnConfirm(false)}>
                      Keep playing
                    </button>
                    <button
                      type="button"
                      className="md-btn md-btn--danger"
                      onClick={() => {
                        setShowEndTurnConfirm(false);
                        send({ type: "monopolyDeal:endTurn", payload: {} });
                      }}
                    >
                      End turn
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="md-hand-header">
            <span>Your hand ({game.myHand.length})</span>
            {isDiscarding ? (
              <span className="md-hand-hint">
                Discard at least {cardsToDiscard} card{cardsToDiscard === 1 ? "" : "s"} (max 7 in hand)
              </span>
            ) : null}
            {shouldPulseEndTurn ? <span className="md-hand-hint">No plays left — ending turn in 5s…</span> : null}
            {isDiscarding ? (
              <button
                type="button"
                className="md-btn"
                disabled={selectedHandIds.length < cardsToDiscard}
                onClick={() => {
                  if (selectedHandIds.length >= cardsToDiscard) {
                    send({ type: "monopolyDeal:discard", payload: { cardIds: selectedHandIds } });
                    setSelectedHandIds([]);
                  }
                }}
              >
                Discard selected
              </button>
            ) : null}
          </div>
          <div className="md-card-row md-hand-row">
            {game.myHand.map((card) => {
              const def = getCardDef(card.defId);
              const bankable = canBankCard(def);
              return (
                <MonopolyDealCard
                  key={card.id}
                  card={card}
                  selected={selectedHandIds.includes(card.id)}
                  disabled={!canInteractWithHand}
                  onClick={() => toggleHandCard(card.id)}
                  onDoubleClick={() => {
                    if (def.kind === "property" && def.color && canSelectHandCards) {
                      send({ type: "monopolyDeal:layProperty", payload: { cardId: card.id, color: def.color } });
                      setSelectedHandIds([]);
                      return;
                    }
                    if (bankable) {
                      bankCard(card.id);
                    }
                  }}
                />
              );
            })}
          </div>
          {canSelectHandCards && selectedCards.length === 1 ? (
            <div className="md-hand-actions">
              {canBankCard(getCardDef(selectedCards[0]!.defId)) ? (
                <button type="button" className="md-btn" onClick={bankSelected}>
                  Bank
                </button>
              ) : null}
              {layColorsForSelected.length > 0 ? (
                layColorsForSelected.map((color) => (
                  <PropertyColorButton key={color} color={color} onClick={() => laySelected(color)}>
                    Lay {COLOR_LABEL[color]}
                  </PropertyColorButton>
                ))
              ) : null}
              {isRentSelected ? (
                <>
                  <button type="button" className="md-btn" disabled={!canPlayRentAction()} onClick={playSelectedAction}>
                    Play Rent Action
                  </button>
                  {doubleRentCard ? (
                    <button
                      type="button"
                      className="md-btn"
                      disabled={!canPlayRentAction()}
                      onClick={playSelectedRentWithDouble}
                    >
                      Play Rent Action 2x
                    </button>
                  ) : null}
                </>
              ) : selectedDef && canPlayAsAction(selectedDef) ? (
                <button type="button" className="md-btn" disabled={!canPlaySelectedAction()} onClick={playSelectedAction}>
                  Play action
                </button>
              ) : null}
            </div>
          ) : null}
          {canFlipBoardWild && selectedBoardWild && selectedBoardWildFlipColor ? (
            <div className="md-hand-actions">
              <PropertyColorButton color={selectedBoardWildFlipColor} onClick={flipSelectedBoardWild}>
                Flip wild to {COLOR_LABEL[selectedBoardWildFlipColor]}
              </PropertyColorButton>
            </div>
          ) : null}
            </div>
          ) : null}
        </div>

        <aside className="md-opponents-column">
          {opponentBoards.map((board) => (
            <div key={board.participantId} className="md-player-board md-player-board--opponent">
              <div className="md-player-name">
                {nameNode(board.participantId)}
                {board.participantId === game.currentPlayerId ? " (turn)" : ""} · {board.handCount} in hand
              </div>
              <OpponentBoard
                board={board}
                onPropertyClick={
                  board.participantId === propertyPickTargetId
                    ? (instanceId) =>
                        send({
                          type: "monopolyDeal:selectTarget",
                          payload: { cardInstanceId: instanceId }
                        })
                    : undefined
                }
              />
            </div>
          ))}
        </aside>
      </div>

      {pending && pending.kind !== "collectPayment" ? (
        <ResolutionPanel
          game={game}
          pending={pending}
          currentParticipantId={currentParticipantId}
          send={send}
          roster={roster}
          canCancel={game.canCancelPendingAction}
        />
      ) : null}
    </div>
  );
}

function WageringPanel({
  game,
  currentParticipantId,
  isHost,
  canPlay,
  send,
  nameNode,
  roster
}: {
  game: Extract<MonopolyDealState, { status: "wagering" }>;
  currentParticipantId: string;
  isHost: boolean;
  canPlay: boolean;
  send: (event: ClientEvent) => void;
  nameNode: (id: string) => JSX.Element;
  roster: SessionState["participants"];
}): JSX.Element {
  const [wager, setWager] = useState(1);
  const submitted = game.submittedWagerIds.includes(currentParticipantId);
  const me = roster.find((p) => p.id === currentParticipantId);
  const maxWager = Math.max(1, me?.score ?? 0);
  const activeIds = roster.map((p) => p.id);
  const allIn = activeIds.length > 0 && activeIds.every((id) => game.submittedWagerIds.includes(id));

  return (
    <div className="md-game md-wagering">
      <h2>Place your wager</h2>
      <p>Minimum 1 Friday Fusion point (max {maxWager} based on your score). Winner takes the pot.</p>
      <div className="md-pot-badge">Current pot: {game.pot} pts</div>
      {canPlay ? (
        <div className="md-wager-form">
          <input
            type="number"
            min={1}
            max={maxWager}
            value={wager}
            onChange={(e) => setWager(Math.min(maxWager, Math.max(1, Number(e.target.value) || 1)))}
          />
          <button
            type="button"
            className="md-btn"
            disabled={submitted}
            onClick={() => send({ type: "monopolyDeal:setWager", payload: { amount: wager } })}
          >
            {submitted ? "Wager locked" : "Submit wager"}
          </button>
        </div>
      ) : null}
      <ul className="md-wager-list">
        {Object.entries(game.wagers).map(([pid, amount]) => (
          <li key={pid}>
            {nameNode(pid)}: {amount} pts
          </li>
        ))}
      </ul>
      {isHost && canPlay ? (
        <button
          type="button"
          className="md-btn"
          disabled={!allIn}
          onClick={() => send({ type: "monopolyDeal:startAfterWagers", payload: {} })}
        >
          Start game
        </button>
      ) : null}
    </div>
  );
}

function ResolutionPanel({
  game,
  pending,
  currentParticipantId,
  send,
  roster,
  canCancel
}: {
  game: Extract<MonopolyDealState, { status: "playing" }>;
  pending: NonNullable<Extract<MonopolyDealState, { status: "playing" }>["pendingResolution"]>;
  currentParticipantId: string;
  send: (event: ClientEvent) => void;
  roster: SessionState["participants"];
  canCancel: boolean;
}): JSX.Element | null {
  if (pending.kind === "forcedDealPickMine" && pending.actorId === currentParticipantId) {
    const myBoard = game.boards.find((b) => b.participantId === currentParticipantId);
    const myProperties: { instanceId: string; defId: string; activeColor: MonopolyDealPropertyColor; card: MonopolyDealCardInstance }[] =
      [];
    if (myBoard) {
      eachBoardPropertySet(myBoard.propertySets, (color, set) => {
        if (isSetComplete(set, color)) {
          return;
        }
        for (const c of set.cards) {
          myProperties.push({
            instanceId: c.instanceId,
            defId: c.defId,
            activeColor: c.activeColor,
            card: { id: c.instanceId, defId: c.defId }
          });
        }
      });
    }

    return (
      <div className="md-modal">
        <h3>Choose your property to swap</h3>
        {myProperties.length === 0 ? <p>You have no properties to swap.</p> : null}
        <div className="md-card-row">
          {myProperties.map((c) => (
            <MonopolyDealCard
              key={c.instanceId}
              card={c.card}
              activeColor={c.activeColor}
              compact
              onClick={() =>
                send({
                  type: "monopolyDeal:selectTarget",
                  payload: { cardInstanceId: c.instanceId }
                })
              }
            />
          ))}
        </div>
        <CancelResolutionButton send={send} canCancel={canCancel} />
      </div>
    );
  }

  if (pending.kind === "selectTarget" && pending.actorId === currentParticipantId) {
    if (pending.actionType === "dealBreaker" && !pending.targetId) {
      const eligible = roster.filter((p) => {
        if (p.id === currentParticipantId) {
          return false;
        }
        const board = game.boards.find((b) => b.participantId === p.id);
        return board ? completePropertySetColors({ bank: board.bank, propertySets: board.propertySets }).length > 0 : false;
      });

      return (
        <div className="md-modal">
          <h3>Choose a player with a complete set</h3>
          <div className="md-target-list">
            {eligible.map((p) => (
              <button
                key={p.id}
                type="button"
                className="md-btn"
                onClick={() => send({ type: "monopolyDeal:selectTarget", payload: { targetId: p.id } })}
              >
                <PlayerName participantId={p.id} participants={roster} size="sm" inline />
              </button>
            ))}
          </div>
          {eligible.length === 0 ? <p>No opponents have a complete set.</p> : null}
          <CancelResolutionButton send={send} canCancel={canCancel} />
        </div>
      );
    }

    if (pending.actionType === "dealBreaker" && pending.targetId) {
      const targetBoard = game.boards.find((b) => b.participantId === pending.targetId);
      const completeSets = targetBoard
        ? completePropertySetColors({ bank: targetBoard.bank, propertySets: targetBoard.propertySets })
        : [];

      return (
        <div className="md-modal">
          <h3>Choose a complete set to steal</h3>
          {completeSets.map((color) => (
            <button
              key={color}
              type="button"
              className="md-btn"
              onClick={() => send({ type: "monopolyDeal:selectTarget", payload: { propertyColor: color } })}
            >
              {COLOR_LABEL[color]} set
            </button>
          ))}
          {completeSets.length === 0 ? <p>No complete sets available.</p> : null}
          <CancelResolutionButton send={send} canCancel={canCancel} />
        </div>
      );
    }

    if (pending.actionType === "forcedDeal" && pending.targetId) {
      return (
        <div className="md-modal">
          <h3>Choose a property to take</h3>
          <p>Click a colored property chip on their board, or pick below.</p>
          <TargetPropertyPicker game={game} targetId={pending.targetId} send={send} excludeCompleteSets />
          <CancelResolutionButton send={send} canCancel={canCancel} />
        </div>
      );
    }

    if (pending.actionType === "slyDeal" && pending.targetId) {
      return (
        <div className="md-modal">
          <h3>Choose a property to steal</h3>
          <p>Cannot steal from a complete set.</p>
          <TargetPropertyPicker game={game} targetId={pending.targetId} send={send} stealableOnly />
          <CancelResolutionButton send={send} canCancel={canCancel} />
        </div>
      );
    }

    if (pending.actionType === "house" || pending.actionType === "hotel") {
      const myBoard = game.boards.find((b) => b.participantId === currentParticipantId);
      const playerBoard = myBoard ? { bank: myBoard.bank, propertySets: myBoard.propertySets } : null;
      const eligible = playerBoard
        ? PROPERTY_COLORS.filter((color) =>
            pending.actionType === "house"
              ? hasHouseEligibleSet(playerBoard, color)
              : hasHotelEligibleSet(playerBoard, color)
          )
        : [];

      return (
        <div className="md-modal">
          <h3>{pending.actionType === "house" ? "Add House to which set?" : "Add Hotel to which set?"}</h3>
          {eligible.map((color) => (
            <PropertyColorButton
              key={color}
              color={color}
              onClick={() => send({ type: "monopolyDeal:selectTarget", payload: { propertyColor: color } })}
            >
              {COLOR_LABEL[color]}
            </PropertyColorButton>
          ))}
          <CancelResolutionButton send={send} canCancel={canCancel} />
        </div>
      );
    }

    if (pending.actionType === "rent" && pending.rentColors?.length) {
      return (
        <div className="md-modal">
          <h3>Who pays rent?</h3>
          <div className="md-target-list">
            {roster
              .filter((p) => p.id !== currentParticipantId)
              .map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="md-btn"
                  onClick={() => send({ type: "monopolyDeal:selectTarget", payload: { targetId: p.id } })}
                >
                  <PlayerName participantId={p.id} participants={roster} size="sm" inline />
                </button>
              ))}
          </div>
          <CancelResolutionButton send={send} canCancel={canCancel} />
        </div>
      );
    }

    return (
      <div className="md-modal">
        <h3>Choose target</h3>
        <div className="md-target-list">
          {roster
            .filter((p) => p.id !== currentParticipantId)
            .map((p) => (
              <button
                key={p.id}
                type="button"
                className="md-btn"
                onClick={() => send({ type: "monopolyDeal:selectTarget", payload: { targetId: p.id } })}
              >
                <PlayerName participantId={p.id} participants={roster} size="sm" inline />
              </button>
            ))}
        </div>
        <CancelResolutionButton send={send} canCancel={canCancel} />
      </div>
    );
  }

  if (pending.kind === "selectRentColor" && pending.actorId === currentParticipantId) {
    return (
      <div className="md-modal">
        <h3>Choose rent color</h3>
        {pending.colors.map((color) => (
          <PropertyColorButton
            key={color}
            color={color}
            onClick={() => send({ type: "monopolyDeal:selectTarget", payload: { propertyColor: color } })}
          >
            {COLOR_LABEL[color]}
          </PropertyColorButton>
        ))}
        <CancelResolutionButton send={send} canCancel={canCancel} />
      </div>
    );
  }

  if (pending.kind === "selectWildColor" && pending.actorId === currentParticipantId) {
    const assigningStolenWild = Boolean(pending.fromPropertyColor);
    return (
      <div className="md-modal">
        <h3>{assigningStolenWild ? "Play as which color?" : "Choose wild color"}</h3>
        {pending.allowedColors.map((color) => (
          <PropertyColorButton
            key={color}
            color={color}
            onClick={() => send({ type: "monopolyDeal:selectTarget", payload: { propertyColor: color } })}
          >
            {assigningStolenWild ? `Play as ${COLOR_LABEL[color]}` : COLOR_LABEL[color]}
          </PropertyColorButton>
        ))}
        <CancelResolutionButton send={send} canCancel={canCancel} />
      </div>
    );
  }

  if (pending.kind === "justSayNo") {
    return null;
  }

  return null;
}

function CancelResolutionButton({
  send,
  canCancel
}: {
  send: (event: ClientEvent) => void;
  canCancel: boolean;
}): JSX.Element | null {
  if (!canCancel) {
    return null;
  }
  return (
    <button type="button" className="md-btn md-btn--ghost" onClick={() => send({ type: "monopolyDeal:cancelResolution", payload: {} })}>
      Cancel action
    </button>
  );
}

function TargetPropertyPicker({
  game,
  targetId,
  send,
  stealableOnly,
  excludeCompleteSets = false
}: {
  game: Extract<MonopolyDealState, { status: "playing" }>;
  targetId: string;
  send: (event: ClientEvent) => void;
  stealableOnly?: boolean;
  excludeCompleteSets?: boolean;
}): JSX.Element | null {
  const targetBoard = game.boards.find((b) => b.participantId === targetId);
  if (!targetBoard) {
    return null;
  }

  const cards: {
    instanceId: string;
    defId: string;
    activeColor: MonopolyDealPropertyColor;
  }[] = [];
  eachBoardPropertySet(targetBoard.propertySets, (color, set) => {
    if (stealableOnly && isSetComplete(set, color)) {
      return;
    }
    if (excludeCompleteSets && isSetComplete(set, color)) {
      return;
    }
    for (const c of set.cards) {
      cards.push(c);
    }
  });

  return (
    <div className="md-card-row">
      {cards.map((c) => (
        <MonopolyDealCard
          key={c.instanceId}
          card={{ id: c.instanceId, defId: c.defId }}
          activeColor={c.activeColor}
          compact
          onClick={() => send({ type: "monopolyDeal:selectTarget", payload: { cardInstanceId: c.instanceId } })}
        />
      ))}
    </div>
  );
}

function PaymentPicker({
  board,
  selection,
  amountDue,
  onToggle
}: {
  board: MonopolyDealPlayerBoard | undefined;
  selection: MonopolyDealPaymentRef[];
  amountDue: number;
  onToggle: (ref: MonopolyDealPaymentRef) => void;
}): JSX.Element | null {
  if (!board) {
    return null;
  }
  const playerBoard = { bank: board.bank, propertySets: board.propertySets };
  const selectedTotal = paymentSelectionTotal(selection, playerBoard);
  const allRequiredSelected = hasSelectedAllRequiredPayment(playerBoard, selection);
  const isShort = selectedTotal < amountDue && !allRequiredSelected;
  const bankExhausted =
    board.bank.length === 0 || board.bank.every((card) => selection.some((r) => r.zone === "bank" && r.instanceId === card.id));

  return (
    <div className="md-payment-picker">
      <p className={isShort ? "md-payment-total md-payment-total--short" : "md-payment-total"}>
        Selected: {selectedTotal}M (need {amountDue}M{isShort ? "+" : ""})
        {allRequiredSelected && selectedTotal < amountDue ? " — that's all you can pay" : ""}
      </p>
      {!bankExhausted ? <p className="md-payment-hint">Select all money in your bank before using properties.</p> : null}
      <div className="md-card-row">
        {board.bank.map((card) => {
          const ref = { zone: "bank" as const, instanceId: card.id };
          const selected = selection.some((r) => r.zone === "bank" && r.instanceId === card.id);
          const canToggle = canTogglePaymentRef(amountDue, selection, playerBoard, ref);
          return (
            <MonopolyDealCard
              key={card.id}
              card={card}
              compact
              selected={selected}
              disabled={!canToggle && !selected}
              onClick={() => {
                if (canToggle) {
                  onToggle(ref);
                }
              }}
            />
          );
        })}
      </div>
      {(() => {
        const propertyCards: JSX.Element[] = [];
        eachBoardPropertySet(board.propertySets, (color, set) => {
          for (const c of set.cards) {
            const ref = { zone: "property" as const, instanceId: c.instanceId, propertyColor: color };
            const selected = selection.some(
              (r) => r.zone === "property" && r.instanceId === c.instanceId && r.propertyColor === color
            );
            const canToggle = canTogglePaymentRef(amountDue, selection, playerBoard, ref);
            propertyCards.push(
              <MonopolyDealCard
                key={c.instanceId}
                card={{ id: c.instanceId, defId: c.defId }}
                activeColor={c.activeColor}
                compact
                selected={selected}
                disabled={!canToggle && !selected}
                onClick={() => {
                  if (canToggle) {
                    onToggle(ref);
                  }
                }}
              />
            );
          }
        });
        return propertyCards;
      })()}
    </div>
  );
}

function FinishedBoardDisplay({
  board,
  hand
}: {
  board: MonopolyDealPlayerBoard;
  hand: MonopolyDealCardInstance[];
}): JSX.Element {
  return (
    <div className="md-finished-board-layout">
      <div className="md-bank">
        <span className="md-section-label">Bank ({board.bank.length})</span>
        <div className="md-card-row">
          {board.bank.length === 0 ? <span className="md-mini-empty">—</span> : null}
          {board.bank.map((card) => (
            <MonopolyDealCard key={card.id} card={card} compact showHelp={false} />
          ))}
        </div>
      </div>
      <div className="md-properties">
        <span className="md-section-label">Properties</span>
        <div className="md-property-sets">
          {(() => {
            const groups: JSX.Element[] = [];
            eachBoardPropertySet(board.propertySets, (color, set, groupIndex) => {
              groups.push(
                <div
                  key={`${color}-${groupIndex}`}
                  className={`md-property-set${isSetComplete(set, color) ? " md-property-set--complete" : ""}`}
                >
                  <div className="md-set-label">
                    {COLOR_LABEL[color]}
                    {groupIndex > 0 ? ` #${groupIndex + 1}` : ""}
                    <SetBonusIcons house={set.house} hotel={set.hotel} />
                  </div>
                  <div className="md-card-row">
                    {set.cards.map((c) => (
                      <MonopolyDealCard
                        key={c.instanceId}
                        card={{ id: c.instanceId, defId: c.defId }}
                        activeColor={c.activeColor}
                        compact
                        showHelp={false}
                      />
                    ))}
                  </div>
                </div>
              );
            });
            return groups;
          })()}
        </div>
      </div>
      {hand.length > 0 ? (
        <div className="md-finished-hand">
          <span className="md-section-label">Hand ({hand.length})</span>
          <div className="md-card-row">
            {hand.map((card) => (
              <MonopolyDealCard key={card.id} card={card} compact showHelp={false} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
