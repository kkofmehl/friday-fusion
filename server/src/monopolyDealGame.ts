import { nanoid } from "nanoid";
import {
  BIRTHDAY_PAYMENT,
  DEBT_COLLECTOR_PAYMENT,
  MONOPOLY_DEAL_EMPTY_HAND_DRAW,
  MONOPOLY_DEAL_MAX_HAND,
  MONOPOLY_DEAL_PLAYS_PER_TURN,
  MONOPOLY_DEAL_STARTING_HAND,
  PROPERTY_COLORS,
  canBankCard,
  getCardDef,
  type PropertyColor
} from "../../shared/monopolyDealData";
import {
  calculateRent,
  canAddHotel,
  canAddHouse,
  canLayWildOnColor,
  canStealWithDealBreaker,
  canStealWithSlyDeal,
  compactColorStorage,
  completePropertySetColors,
  defaultWildColor,
  emptyPropertySets,
  findPlacedCard,
  getColorSets,
  hasHouseEligibleSet,
  hasHotelEligibleSet,
  hasAnyPropertyCards,
  hasWon,
  isCardInCompleteSet,
  isSetComplete,
  mutableColorSets,
  normalizeColorSets,
  placeCardOnColor,
  removePlacedCard,
  rentableColors,
  validatePayment,
  type MonopolyDealCardInstance,
  type PaymentCardRef,
  type PlayerBoard,
  type PlacedPropertyCard,
  type PropertySetsStorage
} from "../../shared/monopolyDealLogic";
import { justSayNoActionLabel } from "../../shared/monopolyDealJustSayNo";
import type {
  MonopolyDealPendingAction,
  MonopolyDealPendingResolution,
  MonopolyDealPlayerBoard,
  MonopolyDealRecentEvent,
  MonopolyDealState
} from "../../shared/contracts";
import { drawCards, shuffledMonopolyDealDeck } from "./monopolyDealDeck";

export type MonopolyDealBoardInternal = {
  bank: MonopolyDealCardInstance[];
  propertySets: PropertySetsStorage;
};

export type MonopolyDealGameInternal = {
  id: string;
  type: "monopolyDeal";
  status: "wagering" | "playing" | "finished";
  playerOrder: string[];
  hands: Record<string, MonopolyDealCardInstance[]>;
  boards: Record<string, MonopolyDealBoardInternal>;
  drawPile: MonopolyDealCardInstance[];
  discardPile: MonopolyDealCardInstance[];
  currentPlayerIndex: number;
  playsRemaining: number;
  drawnThisTurn: boolean;
  hadEmptyHandAtTurnStart: boolean;
  phase: "playing" | "discarding";
  wagers: Record<string, number>;
  submittedWagerIds: string[];
  pot: number;
  pendingResolution: MonopolyDealPendingResolution | null;
  recentEvent: MonopolyDealRecentEvent | null;
  recentEventBatch: MonopolyDealRecentEvent[];
  eventSeq: number;
  winnerHand: MonopolyDealCardInstance[] | null;
  winnerBoard: MonopolyDealPlayerBoard | null;
  winnerParticipantId: string | null;
  scoresApplied: boolean;
  pendingActionRestore: {
    actorId: string;
    discardedCardIds: string[];
    playsConsumed: number;
  } | null;
  undoableBank: { participantId: string; cardId: string } | null;
  justSayNoLate: {
    action: MonopolyDealPendingAction;
    eligiblePlayerIds: string[];
    primaryTargetId?: string;
    affectedPlayerIds?: string[];
  } | null;
  justSayNoUndoBoards: Record<string, MonopolyDealBoardInternal> | null;
};

const boardToPlayerBoard = (
  participantId: string,
  b: MonopolyDealBoardInternal,
  handCount: number
): MonopolyDealPlayerBoard => ({
  participantId,
  bank: [...b.bank],
  propertySets: Object.fromEntries(
    Object.entries(b.propertySets).map(([color, entry]) => {
      const sets = normalizeColorSets(entry);
      return [color, sets.length === 1 ? sets[0]! : sets];
    })
  ) as MonopolyDealPlayerBoard["propertySets"],
  handCount
});

export const createMonopolyDealGame = (playerOrder: string[]): MonopolyDealGameInternal => ({
  id: nanoid(6),
  type: "monopolyDeal",
  status: "wagering",
  playerOrder,
  hands: Object.fromEntries(playerOrder.map((id) => [id, []])),
  boards: Object.fromEntries(playerOrder.map((id) => [id, { bank: [], propertySets: emptyPropertySets() }])),
  drawPile: [],
  discardPile: [],
  currentPlayerIndex: 0,
  playsRemaining: 0,
  drawnThisTurn: false,
  hadEmptyHandAtTurnStart: false,
  phase: "playing",
  wagers: {},
  submittedWagerIds: [],
  pot: 0,
  pendingResolution: null,
  recentEvent: null,
  recentEventBatch: [],
  eventSeq: 0,
  winnerHand: null,
  winnerBoard: null,
  winnerParticipantId: null,
  scoresApplied: false,
  pendingActionRestore: null,
  undoableBank: null,
  justSayNoLate: null,
  justSayNoUndoBoards: null
});

export const monopolyDealPot = (game: MonopolyDealGameInternal): number =>
  Object.values(game.wagers).reduce((sum, v) => sum + v, 0);

const currentPlayerId = (game: MonopolyDealGameInternal): string => game.playerOrder[game.currentPlayerIndex] ?? "";

const getHand = (game: MonopolyDealGameInternal, pid: string): MonopolyDealCardInstance[] => game.hands[pid] ?? [];

const getBoard = (game: MonopolyDealGameInternal, pid: string): MonopolyDealBoardInternal =>
  game.boards[pid] ?? { bank: [], propertySets: emptyPropertySets() };

const removeFromHand = (game: MonopolyDealGameInternal, pid: string, cardId: string): MonopolyDealCardInstance => {
  const cards = getHand(game, pid);
  const idx = cards.findIndex((c) => c.id === cardId);
  if (idx < 0) {
    throw new Error("Card not in hand.");
  }
  return cards.splice(idx, 1)[0]!;
};

const discardAction = (game: MonopolyDealGameInternal, card: MonopolyDealCardInstance): void => {
  game.discardPile.push(card);
};

const usePlay = (game: MonopolyDealGameInternal): void => {
  maybeClearJustSayNoLateForActor(game, currentPlayerId(game));
  assertPlaysRemaining(game);
  game.playsRemaining -= 1;
};

const assertPlaysRemaining = (game: MonopolyDealGameInternal): void => {
  if (game.playsRemaining <= 0) {
    throw new Error("No plays remaining.");
  }
};

const assertCurrentPlayer = (game: MonopolyDealGameInternal, pid: string): void => {
  if (game.status !== "playing") {
    throw new Error("Game is not in play.");
  }
  if (currentPlayerId(game) !== pid) {
    throw new Error("Not your turn.");
  }
  if (game.pendingResolution) {
    throw new Error("Resolve the pending action first.");
  }
};

const JUST_SAY_NO_WINDOW_MS = 5000;

const playerBoard = (game: MonopolyDealGameInternal, pid: string): PlayerBoard => {
  const b = getBoard(game, pid);
  return { bank: b.bank, propertySets: b.propertySets };
};

const completeSetSnapshot = (game: MonopolyDealGameInternal, pid: string): Set<PropertyColor> =>
  new Set(completePropertySetColors(playerBoard(game, pid)));

const recordEvent = (game: MonopolyDealGameInternal, event: MonopolyDealRecentEvent): void => {
  game.recentEvent = event;
  game.recentEventBatch.push(event);
  game.eventSeq += 1;
};

const detectNewCompleteSets = (
  game: MonopolyDealGameInternal,
  pid: string,
  before: Set<PropertyColor>
): void => {
  for (const color of completePropertySetColors(playerBoard(game, pid))) {
    if (!before.has(color)) {
      recordEvent(game, { type: "setComplete", playerId: pid, color });
    }
  }
};

const playersWithJustSayNo = (game: MonopolyDealGameInternal, actorId: string): string[] =>
  game.playerOrder.filter(
    (pid) =>
      pid !== actorId && getHand(game, pid).some((c) => getCardDef(c.defId).action === "justSayNo")
  );

const setPendingActionRestore = (
  game: MonopolyDealGameInternal,
  actorId: string,
  discardedCardIds: string[],
  playsConsumed: number
): void => {
  game.pendingActionRestore = { actorId, discardedCardIds, playsConsumed };
};

const clearPendingActionRestore = (game: MonopolyDealGameInternal): void => {
  game.pendingActionRestore = null;
};

const clearUndoableBank = (game: MonopolyDealGameInternal): void => {
  game.undoableBank = null;
};

const cloneBoardInternal = (board: MonopolyDealBoardInternal): MonopolyDealBoardInternal => ({
  bank: board.bank.map((c) => ({ ...c })),
  propertySets: Object.fromEntries(
    Object.entries(board.propertySets).map(([color, entry]) => {
      const sets = normalizeColorSets(entry);
      return [color, sets.length === 1 ? sets[0]! : sets.map((set) => ({
        cards: set.cards.map((c) => ({ ...c })),
        house: set.house,
        hotel: set.hotel
      }))];
    })
  ) as PropertySetsStorage
});

const playersAffectedByAction = (action: MonopolyDealPendingAction): string[] => {
  const ids = new Set<string>([action.actorId]);
  if (action.targetId) {
    ids.add(action.targetId);
  }
  for (const id of action.queueRemaining ?? []) {
    ids.add(id);
  }
  return [...ids];
};

const captureJustSayNoUndoBoards = (
  game: MonopolyDealGameInternal,
  action: MonopolyDealPendingAction
): Record<string, MonopolyDealBoardInternal> => {
  const boards: Record<string, MonopolyDealBoardInternal> = {};
  for (const pid of playersAffectedByAction(action)) {
    boards[pid] = cloneBoardInternal(getBoard(game, pid));
  }
  return boards;
};

const restoreJustSayNoUndoBoards = (game: MonopolyDealGameInternal): void => {
  if (!game.justSayNoUndoBoards) {
    return;
  }
  for (const [pid, board] of Object.entries(game.justSayNoUndoBoards)) {
    game.boards[pid] = cloneBoardInternal(board);
  }
};

const clearPendingResolutionFromAction = (
  game: MonopolyDealGameInternal,
  action: MonopolyDealPendingAction
): void => {
  const pending = game.pendingResolution;
  if (!pending) {
    return;
  }
  if (pending.kind === "selectWildColor" && pending.actorId === action.actorId) {
    game.pendingResolution = null;
    return;
  }
  if (pending.kind === "collectPayment") {
    const queuedPayers =
      action.type === "itsMyBirthday" || (action.type === "rent" && action.chargeAll)
        ? action.queueRemaining ?? []
        : [];
    const payerMatches = pending.payerId === action.targetId || queuedPayers.includes(pending.payerId);
    if (pending.payeeId === action.actorId && payerMatches) {
      game.pendingResolution = null;
    }
  }
};

const clearJustSayNoLateWindow = (game: MonopolyDealGameInternal): void => {
  game.justSayNoLate = null;
  game.justSayNoUndoBoards = null;
};

const maybeClearJustSayNoLateForActor = (game: MonopolyDealGameInternal, actorId: string): void => {
  if (game.justSayNoLate?.action.actorId === actorId) {
    clearJustSayNoLateWindow(game);
  }
};

const openJustSayNoLateWindow = (
  game: MonopolyDealGameInternal,
  action: MonopolyDealPendingAction,
  eligiblePlayerIds: string[],
  primaryTargetId?: string,
  affectedPlayerIds?: string[]
): void => {
  const stillEligible = eligiblePlayerIds.filter((pid) =>
    getHand(game, pid).some((c) => getCardDef(c.defId).action === "justSayNo")
  );
  if (stillEligible.length === 0) {
    clearJustSayNoLateWindow(game);
    return;
  }
  game.justSayNoLate = {
    action,
    eligiblePlayerIds: stillEligible,
    primaryTargetId,
    affectedPlayerIds
  };
};

const undoLateJustSayNo = (game: MonopolyDealGameInternal): void => {
  const late = game.justSayNoLate;
  if (!late) {
    return;
  }
  restoreJustSayNoUndoBoards(game);
  clearPendingResolutionFromAction(game, late.action);
  clearJustSayNoLateWindow(game);
};

const canCancelPendingResolution = (resolution: MonopolyDealPendingResolution | null): boolean =>
  resolution !== null && resolution.kind !== "justSayNo" && resolution.kind !== "collectPayment";

const placeCardOnBoard = (
  board: MonopolyDealBoardInternal,
  placed: PlacedPropertyCard
): void => {
  placeCardOnColor({ bank: board.bank, propertySets: board.propertySets }, placed);
};

const removeCardFromBoard = (
  board: MonopolyDealBoardInternal,
  instanceId: string
): PlacedPropertyCard => removePlacedCard({ bank: board.bank, propertySets: board.propertySets }, instanceId);

const executeForcedDealSwap = (
  game: MonopolyDealGameInternal,
  actorId: string,
  targetId: string,
  theirCardInstanceId: string,
  myCardInstanceId: string
): void => {
  const beforeActor = completeSetSnapshot(game, actorId);
  const actorBoard = getBoard(game, actorId);
  const targetBoard = getBoard(game, targetId);
  const myCard = removeCardFromBoard(actorBoard, myCardInstanceId);
  const theirCard = removeCardFromBoard(targetBoard, theirCardInstanceId);
  placeCardOnBoard(actorBoard, theirCard);
  placeCardOnBoard(targetBoard, myCard);

  recordEvent(game, {
    type: "swap",
    actorId,
    targetId,
    takenCard: theirCard,
    givenCard: myCard
  });
  detectNewCompleteSets(game, actorId, beforeActor);
  const stolenDef = getCardDef(theirCard.defId);
  if (stolenDef.kind === "propertyWildDual" && stolenDef.colors) {
    game.pendingResolution = {
      kind: "selectWildColor",
      actorId,
      cardInstanceId: theirCard.instanceId,
      allowedColors: [...stolenDef.colors],
      fromPropertyColor: theirCard.activeColor
    };
    return;
  }
  if (stolenDef.kind === "propertyWildMulti") {
    game.pendingResolution = {
      kind: "selectWildColor",
      actorId,
      cardInstanceId: theirCard.instanceId,
      allowedColors: [...PROPERTY_COLORS],
      fromPropertyColor: theirCard.activeColor
    };
    return;
  }
  checkWin(game, actorId);
};

const executePendingAction = (game: MonopolyDealGameInternal, action: MonopolyDealPendingAction): void => {
  switch (action.type) {
    case "slyDeal":
      stealProperty(game, action.actorId, action.targetId!, action.cardInstanceId!, "Sly Deal");
      break;
    case "dealBreaker":
      stealFullSet(game, action.actorId, action.targetId!, action.propertyColor!);
      break;
    case "forcedDeal":
      executeForcedDealSwap(
        game,
        action.actorId,
        action.targetId!,
        action.theirCardInstanceId!,
        action.myCardInstanceId!
      );
      break;
    case "debtCollector":
      startPayment(game, action.targetId!, action.actorId, DEBT_COLLECTOR_PAYMENT, "Debt Collector");
      break;
    case "rent": {
      const pb = playerBoard(game, action.actorId);
      let amount = calculateRent(pb, action.rentColor!);
      if (action.doubleRent) {
        amount *= 2;
      }
      if (amount > 0 && action.targetId) {
        const reason = action.chargeAll
          ? `Rent (${action.rentColor}) — all players`
          : `Rent (${action.rentColor})`;
        startPayment(game, action.targetId, action.actorId, amount, reason, action.queueRemaining ?? []);
      }
      break;
    }
    case "itsMyBirthday":
      startPayment(
        game,
        action.targetId!,
        action.actorId,
        BIRTHDAY_PAYMENT,
        "It's My Birthday",
        action.queueRemaining ?? []
      );
      break;
    default:
      break;
  }
};

export const monopolyDealMaybeExpireJustSayNo = (game: MonopolyDealGameInternal): void => {
  const resolution = game.pendingResolution;
  if (!resolution || resolution.kind !== "justSayNo") {
    return;
  }
  if (Date.now() >= resolution.expiresAt) {
    if (!resolution.canCounter) {
      game.pendingResolution = null;
      return;
    }
    const action = resolution.action;
    game.justSayNoUndoBoards = captureJustSayNoUndoBoards(game, action);
    game.pendingResolution = null;
    executePendingAction(game, action);
    openJustSayNoLateWindow(
      game,
      action,
      resolution.eligiblePlayerIds,
      resolution.primaryTargetId,
      resolution.affectedPlayerIds
    );
  }
};

const tickPending = (game: MonopolyDealGameInternal): void => {
  monopolyDealMaybeExpireJustSayNo(game);
};

const offerJustSayNoOrExecute = (game: MonopolyDealGameInternal, action: MonopolyDealPendingAction): void => {
  clearPendingActionRestore(game);
  const eligible = playersWithJustSayNo(game, action.actorId);
  if (eligible.length === 0) {
    executePendingAction(game, action);
    return;
  }
  const affectedPlayerIds =
    action.type === "itsMyBirthday" || (action.type === "rent" && action.chargeAll)
      ? [action.targetId!, ...(action.queueRemaining ?? [])].filter(Boolean)
      : action.targetId
        ? [action.targetId]
        : undefined;
  game.pendingResolution = {
    kind: "justSayNo",
    action,
    eligiblePlayerIds: eligible,
    primaryTargetId: action.targetId,
    affectedPlayerIds,
    canCounter: true,
    expiresAt: Date.now() + JUST_SAY_NO_WINDOW_MS
  };
};

const checkWin = (game: MonopolyDealGameInternal, pid: string): void => {
  const b = getBoard(game, pid);
  if (hasWon({ bank: b.bank, propertySets: b.propertySets })) {
    game.status = "finished";
    game.winnerParticipantId = pid;
    game.winnerHand = [...getHand(game, pid)];
    game.winnerBoard = boardToPlayerBoard(pid, getBoard(game, pid), getHand(game, pid).length);
  }
};

const beginTurnDraw = (game: MonopolyDealGameInternal): void => {
  const pid = currentPlayerId(game);
  const cards = getHand(game, pid);
  game.hadEmptyHandAtTurnStart = cards.length === 0;
  const count = game.hadEmptyHandAtTurnStart ? MONOPOLY_DEAL_EMPTY_HAND_DRAW : 2;
  cards.push(...drawCards(game.drawPile, game.discardPile, count));
  game.drawnThisTurn = true;
  game.playsRemaining = MONOPOLY_DEAL_PLAYS_PER_TURN;
  game.phase = "playing";
};

export const monopolyDealSetWager = (
  game: MonopolyDealGameInternal,
  participantId: string,
  amount: number,
  maxWager: number
): void => {
  if (game.status !== "wagering") {
    throw new Error("Wagering is closed.");
  }
  if (!game.playerOrder.includes(participantId)) {
    throw new Error("Not in this game.");
  }
  if (amount < 1 || amount > maxWager) {
    throw new Error(`Wager must be between 1 and ${maxWager}.`);
  }
  game.wagers[participantId] = amount;
  if (!game.submittedWagerIds.includes(participantId)) {
    game.submittedWagerIds.push(participantId);
  }
  game.pot = monopolyDealPot(game);
};

export const monopolyDealStartAfterWagers = (game: MonopolyDealGameInternal): void => {
  if (game.status !== "wagering") {
    throw new Error("Game already started.");
  }
  if (!game.playerOrder.every((id) => game.submittedWagerIds.includes(id))) {
    throw new Error("All players must submit a wager.");
  }
  const deck = shuffledMonopolyDealDeck();
  for (const pid of game.playerOrder) {
    game.hands[pid] = deck.splice(0, MONOPOLY_DEAL_STARTING_HAND);
  }
  game.drawPile = deck;
  game.status = "playing";
  game.currentPlayerIndex = 0;
  beginTurnDraw(game);
};

export const monopolyDealBankCard = (game: MonopolyDealGameInternal, participantId: string, cardId: string): void => {
  tickPending(game);
  assertCurrentPlayer(game, participantId);
  assertPlaysRemaining(game);
  const card = removeFromHand(game, participantId, cardId);
  const def = getCardDef(card.defId);
  if (!canBankCard(def)) {
    getHand(game, participantId).push(card);
    throw new Error("This card cannot be banked.");
  }
  getBoard(game, participantId).bank.push(card);
  usePlay(game);
  game.undoableBank = { participantId, cardId: card.id };
};

export const monopolyDealUndoBank = (game: MonopolyDealGameInternal, participantId: string): void => {
  tickPending(game);
  assertCurrentPlayer(game, participantId);
  if (!game.undoableBank || game.undoableBank.participantId !== participantId) {
    throw new Error("Nothing to undo.");
  }
  const board = getBoard(game, participantId);
  const idx = board.bank.findIndex((c) => c.id === game.undoableBank!.cardId);
  if (idx < 0) {
    throw new Error("Banked card not found.");
  }
  const card = board.bank.splice(idx, 1)[0]!;
  getHand(game, participantId).push(card);
  game.playsRemaining += 1;
  game.undoableBank = null;
};

export const monopolyDealLayProperty = (
  game: MonopolyDealGameInternal,
  participantId: string,
  cardId: string,
  color: PropertyColor
): void => {
  tickPending(game);
  clearUndoableBank(game);
  assertCurrentPlayer(game, participantId);
  assertPlaysRemaining(game);
  const before = completeSetSnapshot(game, participantId);
  const card = removeFromHand(game, participantId, cardId);
  const def = getCardDef(card.defId);
  if (!canLayWildOnColor(def, color)) {
    getHand(game, participantId).push(card);
    throw new Error("Cannot lay this card on that color.");
  }
  const b = getBoard(game, participantId);
  placeCardOnColor({ bank: b.bank, propertySets: b.propertySets }, { instanceId: card.id, defId: card.defId, activeColor: color });
  usePlay(game);
  detectNewCompleteSets(game, participantId, before);
  checkWin(game, participantId);
};

export const monopolyDealLayPropertyWithResolution = (
  game: MonopolyDealGameInternal,
  participantId: string,
  cardId: string
): void => {
  tickPending(game);
  assertCurrentPlayer(game, participantId);
  const card = getHand(game, participantId).find((c) => c.id === cardId);
  if (!card) {
    throw new Error("Card not in hand.");
  }
  const def = getCardDef(card.defId);
  if (def.kind === "propertyWildMulti") {
    game.pendingResolution = {
      kind: "selectWildColor",
      actorId: participantId,
      cardInstanceId: cardId,
      allowedColors: [...PROPERTY_COLORS]
    };
    return;
  }
  const color = defaultWildColor(def);
  if (!color) {
    throw new Error("Choose a color for this property.");
  }
  monopolyDealLayProperty(game, participantId, cardId, color);
};

const assignWildColorOnBoard = (
  game: MonopolyDealGameInternal,
  participantId: string,
  instanceId: string,
  fromColor: PropertyColor,
  toColor: PropertyColor
): void => {
  const board = getBoard(game, participantId);
  const playerBoard = { bank: board.bank, propertySets: board.propertySets };
  const found = findPlacedCard(playerBoard, instanceId);
  if (!found || found.color !== fromColor) {
    throw new Error("Card not found.");
  }
  const placed = removePlacedCard(playerBoard, instanceId);
  const def = getCardDef(placed.defId);
  if (!canLayWildOnColor(def, toColor)) {
    placeCardOnColor(playerBoard, placed);
    throw new Error("Invalid color for this wild.");
  }
  placed.activeColor = toColor;
  placeCardOnColor(playerBoard, placed);
  checkWin(game, participantId);
};

export const monopolyDealSelectWildColor = (
  game: MonopolyDealGameInternal,
  participantId: string,
  color: PropertyColor
): void => {
  tickPending(game);
  const resolution = game.pendingResolution;
  if (!resolution || resolution.kind !== "selectWildColor") {
    throw new Error("No wild color selection pending.");
  }
  if (resolution.actorId !== participantId) {
    throw new Error("Not your selection.");
  }
  game.pendingResolution = null;
  if (resolution.fromPropertyColor) {
    assignWildColorOnBoard(game, participantId, resolution.cardInstanceId, resolution.fromPropertyColor, color);
    return;
  }
  monopolyDealLayProperty(game, participantId, resolution.cardInstanceId, color);
};

export const monopolyDealFlipWild = (
  game: MonopolyDealGameInternal,
  participantId: string,
  instanceId: string,
  propertyColor: PropertyColor,
  newColor: PropertyColor
): void => {
  tickPending(game);
  clearUndoableBank(game);
  assertCurrentPlayer(game, participantId);
  assertPlaysRemaining(game);
  const b = getBoard(game, participantId);
  const playerBoard = { bank: b.bank, propertySets: b.propertySets };
  const found = findPlacedCard(playerBoard, instanceId);
  if (!found || found.color !== propertyColor) {
    throw new Error("Card not in set.");
  }
  const def = getCardDef(found.card.defId);
  if (def.kind !== "propertyWildDual") {
    throw new Error("Only dual wild cards can be flipped.");
  }
  if (!def.colors?.includes(newColor) || newColor === found.card.activeColor) {
    throw new Error("Invalid flip color.");
  }
  const before = completeSetSnapshot(game, participantId);
  assignWildColorOnBoard(game, participantId, instanceId, propertyColor, newColor);
  detectNewCompleteSets(game, participantId, before);
  usePlay(game);
};

export const monopolyDealMoveWild = (
  game: MonopolyDealGameInternal,
  participantId: string,
  instanceId: string,
  fromColor: PropertyColor,
  toColor: PropertyColor
): void => {
  assertCurrentPlayer(game, participantId);
  assertPlaysRemaining(game);
  const b = getBoard(game, participantId);
  const playerBoard = { bank: b.bank, propertySets: b.propertySets };
  const found = findPlacedCard(playerBoard, instanceId);
  if (!found || found.color !== fromColor) {
    throw new Error("Card not in source set.");
  }
  const def = getCardDef(found.card.defId);
  if (def.kind !== "propertyWildDual" && def.kind !== "propertyWildMulti") {
    throw new Error("Only wild property cards can be moved.");
  }
  if (!canLayWildOnColor(def, toColor)) {
    throw new Error("Cannot move wild to that color.");
  }
  const before = completeSetSnapshot(game, participantId);
  const placed = removePlacedCard(playerBoard, instanceId);
  placed.activeColor = toColor;
  placeCardOnColor(playerBoard, placed);
  detectNewCompleteSets(game, participantId, before);
  checkWin(game, participantId);
  usePlay(game);
};

const startPayment = (
  game: MonopolyDealGameInternal,
  payerId: string,
  payeeId: string,
  amountDue: number,
  reason: string,
  queueRemaining: string[] = []
): void => {
  game.pendingResolution = { kind: "collectPayment", payerId, payeeId, amountDue, reason, queueRemaining };
};

const transferPayment = (
  game: MonopolyDealGameInternal,
  payerId: string,
  payeeId: string,
  refs: PaymentCardRef[],
  amountDue: number
): void => {
  const payerBoard = getBoard(game, payerId);
  const payeeBoard = getBoard(game, payeeId);
  const validated = validatePayment(amountDue, refs, {
    bank: payerBoard.bank,
    propertySets: payerBoard.propertySets
  });
  if (!validated.ok) {
    throw new Error(validated.reason);
  }
  for (const ref of refs) {
    if (ref.zone === "bank") {
      const idx = payerBoard.bank.findIndex((c) => c.id === ref.instanceId);
      if (idx < 0) {
        throw new Error("Bank card not found.");
      }
      payeeBoard.bank.push(payerBoard.bank.splice(idx, 1)[0]!);
    } else if (ref.zone === "property" && ref.propertyColor) {
      const playerBoard = { bank: payerBoard.bank, propertySets: payerBoard.propertySets };
      const placed = removePlacedCard(playerBoard, ref.instanceId);
      placeCardOnColor({ bank: payeeBoard.bank, propertySets: payeeBoard.propertySets }, placed);
    }
  }
};

const advancePaymentQueue = (
  game: MonopolyDealGameInternal,
  payeeId: string,
  queueRemaining: string[],
  amountDue: number,
  reason: string
): void => {
  if (queueRemaining.length > 0) {
    startPayment(game, queueRemaining[0]!, payeeId, amountDue, reason, queueRemaining.slice(1));
  }
};

export const monopolyDealSubmitPayment = (
  game: MonopolyDealGameInternal,
  participantId: string,
  refs: PaymentCardRef[]
): void => {
  const resolution = game.pendingResolution;
  if (!resolution || resolution.kind !== "collectPayment") {
    throw new Error("No payment due.");
  }
  if (resolution.payerId !== participantId) {
    throw new Error("Not your payment.");
  }
  if (resolution.amountDue <= 0) {
    game.pendingResolution = null;
    advancePaymentQueue(game, resolution.payeeId, resolution.queueRemaining, resolution.amountDue, resolution.reason);
    return;
  }
  if (refs.length === 0) {
    recordEvent(game, {
      type: "payment",
      payerId: participantId,
      payeeId: resolution.payeeId,
      amount: 0,
      reason: resolution.reason
    });
    game.pendingResolution = null;
    advancePaymentQueue(game, resolution.payeeId, resolution.queueRemaining, resolution.amountDue, resolution.reason);
    return;
  }
  const payerBoard = getBoard(game, participantId);
  const validated = validatePayment(resolution.amountDue, refs, {
    bank: payerBoard.bank,
    propertySets: payerBoard.propertySets
  });
  if (!validated.ok) {
    throw new Error(validated.reason);
  }
  transferPayment(game, participantId, resolution.payeeId, refs, resolution.amountDue);
  recordEvent(game, {
    type: "payment",
    payerId: participantId,
    payeeId: resolution.payeeId,
    amount: validated.total,
    reason: resolution.reason
  });
  game.pendingResolution = null;
  advancePaymentQueue(game, resolution.payeeId, resolution.queueRemaining, resolution.amountDue, resolution.reason);
};

const stealProperty = (
  game: MonopolyDealGameInternal,
  actorId: string,
  targetId: string,
  instanceId: string,
  actionName: string
): void => {
  const beforeActor = completeSetSnapshot(game, actorId);
  const targetBoard = getBoard(game, targetId);
  const targetPlayerBoard = { bank: targetBoard.bank, propertySets: targetBoard.propertySets };
  const found = findPlacedCard(targetPlayerBoard, instanceId);
  if (!found) {
    throw new Error("Property not found.");
  }
  const set = getColorSets(targetPlayerBoard, found.color)[found.setIndex];
  if (!set || !canStealWithSlyDeal(set, found.color)) {
    throw new Error("Cannot steal from a complete set.");
  }
  const placed = removePlacedCard(targetPlayerBoard, instanceId);
  const actorBoard = getBoard(game, actorId);
  placeCardOnColor({ bank: actorBoard.bank, propertySets: actorBoard.propertySets }, placed);
  detectNewCompleteSets(game, actorId, beforeActor);
  recordEvent(game, { type: "steal", actorId, targetId, actionName, card: placed });
  checkWin(game, actorId);
};

const stealFullSet = (game: MonopolyDealGameInternal, actorId: string, targetId: string, color: PropertyColor): void => {
  const beforeActor = completeSetSnapshot(game, actorId);
  const targetBoard = getBoard(game, targetId);
  const targetPlayerBoard = { bank: targetBoard.bank, propertySets: targetBoard.propertySets };
  const sets = mutableColorSets(targetPlayerBoard, color);
  const setIndex = sets.findIndex((set) => canStealWithDealBreaker(set, color));
  if (setIndex < 0) {
    throw new Error("Set is not complete.");
  }
  const stolen = sets.splice(setIndex, 1)[0]!;
  if (sets.length === 0) {
    delete targetPlayerBoard.propertySets[color];
  } else {
    compactColorStorage(targetPlayerBoard, color);
  }
  const actorBoard = getBoard(game, actorId);
  const actorPlayerBoard = { bank: actorBoard.bank, propertySets: actorBoard.propertySets };
  const actorSets = mutableColorSets(actorPlayerBoard, color);
  actorSets.push({
    cards: stolen.cards.map((c) => ({ ...c })),
    house: stolen.house,
    hotel: stolen.hotel
  });
  compactColorStorage(actorPlayerBoard, color);
  detectNewCompleteSets(game, actorId, beforeActor);
  recordEvent(game, {
    type: "setStolen",
    actorId,
    targetId,
    color
  });
  checkWin(game, actorId);
};

const addHouse = (game: MonopolyDealGameInternal, actorId: string, color: PropertyColor): void => {
  const b = getBoard(game, actorId);
  const playerBoard = { bank: b.bank, propertySets: b.propertySets };
  const sets = mutableColorSets(playerBoard, color);
  const setIndex = sets.findIndex((set) => canAddHouse(set, color));
  if (setIndex < 0) {
    throw new Error("Cannot add house to this set.");
  }
  sets[setIndex] = { ...sets[setIndex]!, house: true };
};

const addHotel = (game: MonopolyDealGameInternal, actorId: string, color: PropertyColor): void => {
  const b = getBoard(game, actorId);
  const playerBoard = { bank: b.bank, propertySets: b.propertySets };
  const sets = mutableColorSets(playerBoard, color);
  const setIndex = sets.findIndex((set) => canAddHotel(set, color));
  if (setIndex < 0) {
    throw new Error("Cannot add hotel to this set.");
  }
  sets[setIndex] = { ...sets[setIndex]!, hotel: true };
};

const chargeRent = (
  game: MonopolyDealGameInternal,
  actorId: string,
  targetId: string | undefined,
  color: PropertyColor,
  doubleRent: boolean
): void => {
  if (!targetId) {
    game.pendingResolution = {
      kind: "selectTarget",
      actorId,
      actionType: "rent",
      rentColors: [color],
      doubleRent
    };
    return;
  }
  const pb: PlayerBoard = {
    bank: getBoard(game, actorId).bank,
    propertySets: getBoard(game, actorId).propertySets
  };
  let amount = calculateRent(pb, color);
  if (doubleRent) {
    amount *= 2;
  }
  if (amount <= 0) {
    return;
  }
  offerJustSayNoOrExecute(game, {
    type: "rent",
    actorId,
    targetId,
    rentColor: color,
    doubleRent
  });
};

const chargeRentAll = (
  game: MonopolyDealGameInternal,
  actorId: string,
  color: PropertyColor,
  doubleRent: boolean
): void => {
  const pb: PlayerBoard = {
    bank: getBoard(game, actorId).bank,
    propertySets: getBoard(game, actorId).propertySets
  };
  let amount = calculateRent(pb, color);
  if (doubleRent) {
    amount *= 2;
  }
  if (amount <= 0) {
    return;
  }
  const others = game.playerOrder.filter((id) => id !== actorId);
  if (others.length === 0) {
    return;
  }
  offerJustSayNoOrExecute(game, {
    type: "rent",
    actorId,
    targetId: others[0]!,
    rentColor: color,
    doubleRent,
    chargeAll: true,
    queueRemaining: others.slice(1)
  });
};

export const monopolyDealPlayAction = (
  game: MonopolyDealGameInternal,
  participantId: string,
  cardId: string,
  options?: {
    doubleRentCardId?: string;
    targetId?: string;
    rentColor?: PropertyColor;
    propertyColor?: PropertyColor;
    cardInstanceId?: string;
  }
): void => {
  tickPending(game);
  if (options?.doubleRentCardId) {
    monopolyDealPlayRentWithDouble(game, participantId, cardId, options.doubleRentCardId, options);
    return;
  }

  assertCurrentPlayer(game, participantId);
  assertPlaysRemaining(game);
  const card = removeFromHand(game, participantId, cardId);
  const def = getCardDef(card.defId);

  if (def.kind === "action" && def.action === "passGo") {
    getHand(game, participantId).push(...drawCards(game.drawPile, game.discardPile, 2));
    discardAction(game, card);
    usePlay(game);
    clearUndoableBank(game);
    return;
  }

  if (def.kind === "action" && def.action === "justSayNo") {
    getHand(game, participantId).push(card);
    throw new Error("Just Say No is played in response to an action.");
  }

  if (def.kind === "action" && def.action === "doubleTheRent") {
    getHand(game, participantId).push(card);
    throw new Error("Play Double the Rent together with a rent card.");
  }

  if (def.kind === "rent" && def.colors) {
    const pickable = rentableColors(playerBoard(game, participantId), def.colors);
    if (pickable.length === 0) {
      getHand(game, participantId).push(card);
      throw new Error("You need a matching property set to charge rent.");
    }
  }

  if (def.kind === "action" && def.action === "house") {
    const board = playerBoard(game, participantId);
    const eligible = PROPERTY_COLORS.some((color) => hasHouseEligibleSet(board, color));
    if (!eligible) {
      getHand(game, participantId).push(card);
      throw new Error("No complete set eligible for a house.");
    }
  }

  if (def.kind === "action" && def.action === "hotel") {
    const board = playerBoard(game, participantId);
    const eligible = PROPERTY_COLORS.some((color) => hasHotelEligibleSet(board, color));
    if (!eligible) {
      getHand(game, participantId).push(card);
      throw new Error("No complete set with a house eligible for a hotel.");
    }
  }

  discardAction(game, card);
  usePlay(game);
  clearUndoableBank(game);

  if (def.kind === "action" && def.action === "itsMyBirthday") {
    const others = game.playerOrder.filter((id) => id !== participantId);
    if (others.length > 0) {
      offerJustSayNoOrExecute(game, {
        type: "itsMyBirthday",
        actorId: participantId,
        targetId: others[0]!,
        queueRemaining: others.slice(1)
      });
    }
    return;
  }

  if (def.kind === "action" && def.action === "debtCollector") {
    if (!options?.targetId) {
      setPendingActionRestore(game, participantId, [card.id], 1);
      game.pendingResolution = { kind: "selectTarget", actorId: participantId, actionType: "debtCollector" };
      return;
    }
    offerJustSayNoOrExecute(game, {
      type: "debtCollector",
      actorId: participantId,
      targetId: options.targetId
    });
    return;
  }

  if (def.kind === "action" && def.action === "slyDeal") {
    if (!options?.targetId || !options.cardInstanceId) {
      setPendingActionRestore(game, participantId, [card.id], 1);
      game.pendingResolution = { kind: "selectTarget", actorId: participantId, actionType: "slyDeal" };
      return;
    }
    offerJustSayNoOrExecute(game, {
      type: "slyDeal",
      actorId: participantId,
      targetId: options.targetId,
      cardInstanceId: options.cardInstanceId
    });
    return;
  }

  if (def.kind === "action" && def.action === "dealBreaker") {
    if (!options?.targetId || !options.propertyColor) {
      setPendingActionRestore(game, participantId, [card.id], 1);
      game.pendingResolution = {
        kind: "selectTarget",
        actorId: participantId,
        actionType: "dealBreaker",
        discardedCardId: card.id
      };
      return;
    }
    offerJustSayNoOrExecute(game, {
      type: "dealBreaker",
      actorId: participantId,
      targetId: options.targetId,
      propertyColor: options.propertyColor
    });
    return;
  }

  if (def.kind === "action" && def.action === "forcedDeal") {
    if (!options?.targetId || !options.cardInstanceId) {
      setPendingActionRestore(game, participantId, [card.id], 1);
      game.pendingResolution = { kind: "selectTarget", actorId: participantId, actionType: "forcedDeal" };
      return;
    }
    const targetBoard = getBoard(game, options.targetId);
    const targetPlayerBoard = { bank: targetBoard.bank, propertySets: targetBoard.propertySets };
    if (isCardInCompleteSet(targetPlayerBoard, options.cardInstanceId)) {
      throw new Error("Cannot take a property from a complete set.");
    }
    const found = findPlacedCard(targetPlayerBoard, options.cardInstanceId);
    if (!found) {
      throw new Error("Target property not found.");
    }
    const targetCard = found.card;
    game.pendingResolution = {
      kind: "forcedDealPickMine",
      actorId: participantId,
      targetId: options.targetId,
      targetCard
    };
    return;
  }

  if (def.kind === "action" && def.action === "house") {
    if (!options?.propertyColor) {
      setPendingActionRestore(game, participantId, [card.id], 1);
      game.pendingResolution = { kind: "selectTarget", actorId: participantId, actionType: "house" };
      return;
    }
    addHouse(game, participantId, options.propertyColor);
    return;
  }

  if (def.kind === "action" && def.action === "hotel") {
    if (!options?.propertyColor) {
      setPendingActionRestore(game, participantId, [card.id], 1);
      game.pendingResolution = { kind: "selectTarget", actorId: participantId, actionType: "hotel" };
      return;
    }
    addHotel(game, participantId, options.propertyColor);
    return;
  }

  if (def.kind === "rent" && def.colors) {
    if (!options?.rentColor) {
      const pickable = rentableColors(playerBoard(game, participantId), def.colors);
      setPendingActionRestore(game, participantId, [card.id], 1);
      game.pendingResolution = { kind: "selectRentColor", actorId: participantId, colors: pickable, cardInstanceId: card.id };
      return;
    }
    chargeRent(game, participantId, options.targetId, options.rentColor, false);
  }
};

export const monopolyDealPlayRentWithDouble = (
  game: MonopolyDealGameInternal,
  participantId: string,
  rentCardId: string,
  doubleRentCardId: string,
  options?: { rentColor?: PropertyColor; targetId?: string }
): void => {
  tickPending(game);
  assertCurrentPlayer(game, participantId);
  assertPlaysRemaining(game);
  const rentCard = getHand(game, participantId).find((c) => c.id === rentCardId);
  const doubleCard = getHand(game, participantId).find((c) => c.id === doubleRentCardId);
  if (!rentCard || !doubleCard) {
    throw new Error("Rent cards not in hand.");
  }
  const rentDef = getCardDef(rentCard.defId);
  const doubleDef = getCardDef(doubleCard.defId);
  if (rentDef.kind !== "rent" || !rentDef.colors) {
    throw new Error("Not a rent card.");
  }
  if (doubleDef.kind !== "action" || doubleDef.action !== "doubleTheRent") {
    throw new Error("Not a Double the Rent card.");
  }
  const pickable = rentableColors(playerBoard(game, participantId), rentDef.colors);
  if (pickable.length === 0) {
    throw new Error("You need a matching property set to charge rent.");
  }
  const discardedDouble = removeFromHand(game, participantId, doubleRentCardId);
  discardAction(game, discardedDouble);
  const discardedRent = removeFromHand(game, participantId, rentCardId);
  discardAction(game, discardedRent);
  usePlay(game);
  clearUndoableBank(game);
  if (!options?.rentColor) {
    setPendingActionRestore(game, participantId, [discardedDouble.id, discardedRent.id], 1);
    game.pendingResolution = {
      kind: "selectRentColor",
      actorId: participantId,
      colors: pickable,
      cardInstanceId: discardedRent.id,
      doubleRentCardId: discardedDouble.id
    };
    return;
  }
  chargeRent(game, participantId, options.targetId, options.rentColor, true);
};

export const monopolyDealSelectTarget = (
  game: MonopolyDealGameInternal,
  participantId: string,
  payload: { targetId?: string; propertyColor?: PropertyColor; cardInstanceId?: string }
): void => {
  tickPending(game);
  const resolution = game.pendingResolution;
  if (resolution?.kind === "selectRentColor" && payload.propertyColor) {
    monopolyDealSelectRentColor(game, participantId, payload.propertyColor, payload.targetId);
    return;
  }
  if (resolution?.kind === "selectWildColor" && payload.propertyColor) {
    monopolyDealSelectWildColor(game, participantId, payload.propertyColor);
    return;
  }
  if (resolution?.kind === "forcedDealPickMine") {
    if (!payload.cardInstanceId) {
      throw new Error("Choose a property to swap.");
    }
    monopolyDealForcedDealPickMine(game, participantId, payload.cardInstanceId);
    return;
  }
  if (!resolution || resolution.kind !== "selectTarget") {
    throw new Error("No target selection pending.");
  }
  if (resolution.actorId !== participantId) {
    throw new Error("Not your selection.");
  }
  if (resolution.actionType === "debtCollector" && payload.targetId) {
    game.pendingResolution = null;
    offerJustSayNoOrExecute(game, {
      type: "debtCollector",
      actorId: participantId,
      targetId: payload.targetId
    });
    return;
  }
  if (resolution.actionType === "slyDeal" && payload.targetId && payload.cardInstanceId) {
    game.pendingResolution = null;
    offerJustSayNoOrExecute(game, {
      type: "slyDeal",
      actorId: participantId,
      targetId: payload.targetId,
      cardInstanceId: payload.cardInstanceId
    });
    return;
  }
  if (resolution.actionType === "dealBreaker" && payload.targetId && payload.propertyColor) {
    game.pendingResolution = null;
    offerJustSayNoOrExecute(game, {
      type: "dealBreaker",
      actorId: participantId,
      targetId: payload.targetId,
      propertyColor: payload.propertyColor
    });
    return;
  }
  if (resolution.actionType === "dealBreaker" && payload.targetId && !resolution.targetId) {
    const targetBoard = getBoard(game, payload.targetId);
    if (completePropertySetColors({ bank: targetBoard.bank, propertySets: targetBoard.propertySets }).length === 0) {
      throw new Error("That player has no complete sets.");
    }
    game.pendingResolution = { ...resolution, targetId: payload.targetId };
    return;
  }
  if (resolution.actionType === "dealBreaker" && resolution.targetId && payload.propertyColor) {
    game.pendingResolution = null;
    offerJustSayNoOrExecute(game, {
      type: "dealBreaker",
      actorId: participantId,
      targetId: resolution.targetId,
      propertyColor: payload.propertyColor
    });
    return;
  }
  if (resolution.actionType === "slyDeal" && payload.targetId && !resolution.targetId && !payload.cardInstanceId) {
    game.pendingResolution = { ...resolution, targetId: payload.targetId };
    return;
  }
  if (resolution.actionType === "slyDeal" && resolution.targetId && payload.cardInstanceId) {
    game.pendingResolution = null;
    offerJustSayNoOrExecute(game, {
      type: "slyDeal",
      actorId: participantId,
      targetId: resolution.targetId,
      cardInstanceId: payload.cardInstanceId
    });
    return;
  }
  if (resolution.actionType === "forcedDeal" && payload.targetId && !resolution.targetId && !payload.cardInstanceId) {
    const targetBoard = getBoard(game, payload.targetId);
    const hasProperty = hasAnyPropertyCards({ bank: targetBoard.bank, propertySets: targetBoard.propertySets });
    if (!hasProperty) {
      throw new Error("That player has no properties to swap.");
    }
    game.pendingResolution = { ...resolution, targetId: payload.targetId };
    return;
  }
  if (resolution.actionType === "forcedDeal" && resolution.targetId && payload.cardInstanceId) {
    const targetBoard = getBoard(game, resolution.targetId);
    const targetPlayerBoard = { bank: targetBoard.bank, propertySets: targetBoard.propertySets };
    if (isCardInCompleteSet(targetPlayerBoard, payload.cardInstanceId)) {
      throw new Error("Cannot take a property from a complete set.");
    }
    const found = findPlacedCard(targetPlayerBoard, payload.cardInstanceId);
    if (!found) {
      throw new Error("Target property not found.");
    }
    game.pendingResolution = {
      kind: "forcedDealPickMine",
      actorId: participantId,
      targetId: resolution.targetId,
      targetCard: found.card
    };
    return;
  }
  if (resolution.actionType === "rent" && payload.targetId && resolution.rentColors?.[0]) {
    game.pendingResolution = null;
    chargeRent(
      game,
      participantId,
      payload.targetId,
      resolution.rentColors[0],
      Boolean(resolution.doubleRent ?? resolution.doubleRentCardId)
    );
    return;
  }
  if (resolution.actionType === "house" && payload.propertyColor) {
    game.pendingResolution = null;
    addHouse(game, participantId, payload.propertyColor);
    return;
  }
  if (resolution.actionType === "hotel" && payload.propertyColor) {
    game.pendingResolution = null;
    addHotel(game, participantId, payload.propertyColor);
    return;
  }
  throw new Error("Invalid target selection.");
};

export const monopolyDealForcedDealPickMine = (
  game: MonopolyDealGameInternal,
  participantId: string,
  cardInstanceId: string
): void => {
  tickPending(game);
  const resolution = game.pendingResolution;
  if (!resolution || resolution.kind !== "forcedDealPickMine") {
    throw new Error("No forced deal pending.");
  }
  if (resolution.actorId !== participantId) {
    throw new Error("Not your selection.");
  }
  const actorBoard = getBoard(game, participantId);
  const actorPlayerBoard = { bank: actorBoard.bank, propertySets: actorBoard.propertySets };
  if (isCardInCompleteSet(actorPlayerBoard, cardInstanceId)) {
    throw new Error("Cannot swap a property from a complete set.");
  }
  if (!findPlacedCard(actorPlayerBoard, cardInstanceId)) {
    throw new Error("Choose one of your properties.");
  }
  game.pendingResolution = null;
  offerJustSayNoOrExecute(game, {
    type: "forcedDeal",
    actorId: participantId,
    targetId: resolution.targetId,
    theirCardInstanceId: resolution.targetCard.instanceId,
    myCardInstanceId: cardInstanceId
  });
};

export const monopolyDealCancelResolution = (game: MonopolyDealGameInternal, participantId: string): void => {
  const resolution = game.pendingResolution;
  const restore = game.pendingActionRestore;
  if (!resolution || !restore) {
    throw new Error("Nothing to cancel.");
  }
  if (!canCancelPendingResolution(resolution)) {
    throw new Error("Cannot cancel this action.");
  }
  if (restore.actorId !== participantId) {
    throw new Error("Not your action.");
  }
  for (const cardId of restore.discardedCardIds) {
    const idx = game.discardPile.findIndex((c) => c.id === cardId);
    if (idx >= 0) {
      const card = game.discardPile.splice(idx, 1)[0]!;
      getHand(game, participantId).push(card);
    }
  }
  game.playsRemaining += restore.playsConsumed;
  game.pendingResolution = null;
  clearPendingActionRestore(game);
};

export const monopolyDealSelectRentColor = (
  game: MonopolyDealGameInternal,
  participantId: string,
  color: PropertyColor,
  targetId?: string
): void => {
  tickPending(game);
  const resolution = game.pendingResolution;
  if (!resolution || resolution.kind !== "selectRentColor") {
    throw new Error("No rent color selection pending.");
  }
  if (resolution.actorId !== participantId) {
    throw new Error("Not your selection.");
  }
  const rentCard = game.discardPile.find((c) => c.id === resolution.cardInstanceId);
  const rentColors = rentCard ? getCardDef(rentCard.defId).colors : undefined;
  const doubleRent = Boolean(resolution.doubleRentCardId);
  game.pendingResolution = null;
  if (rentColors && rentColors.length === 2) {
    chargeRentAll(game, participantId, color, doubleRent);
    return;
  }
  chargeRent(game, participantId, targetId, color, doubleRent);
};

export const monopolyDealRespondJustSayNo = (
  game: MonopolyDealGameInternal,
  participantId: string,
  useCardId: string | null
): void => {
  tickPending(game);

  if (game.justSayNoLate) {
    if (!useCardId) {
      return;
    }
    if (!game.justSayNoLate.eligiblePlayerIds.includes(participantId)) {
      throw new Error("You cannot counter this action.");
    }
    const card = removeFromHand(game, participantId, useCardId);
    const def = getCardDef(card.defId);
    if (def.action !== "justSayNo") {
      getHand(game, participantId).push(card);
      throw new Error("Not a Just Say No card.");
    }
    discardAction(game, card);
    const lateAction = game.justSayNoLate.action;
    recordEvent(game, {
      type: "justSayNo",
      playerId: participantId,
      actorId: lateAction.actorId,
      targetId: lateAction.targetId,
      actionLabel: justSayNoActionLabel(lateAction)
    });
    undoLateJustSayNo(game);
    return;
  }

  const resolution = game.pendingResolution;
  if (!resolution || resolution.kind !== "justSayNo") {
    return;
  }
  if (!useCardId) {
    const canAccept = resolution.canCounter
      ? resolution.primaryTargetId === participantId || resolution.action.actorId === participantId
      : resolution.action.actorId === participantId;
    if (!canAccept) {
      throw new Error("You cannot respond to this action.");
    }
    const action = resolution.action;
    game.pendingResolution = null;
    if (resolution.canCounter) {
      executePendingAction(game, action);
    }
    return;
  }
  if (!resolution.eligiblePlayerIds.includes(participantId)) {
    throw new Error("You cannot counter this action.");
  }
  const card = removeFromHand(game, participantId, useCardId);
  const def = getCardDef(card.defId);
  if (def.action !== "justSayNo") {
    getHand(game, participantId).push(card);
    throw new Error("Not a Just Say No card.");
  }
  discardAction(game, card);
  recordEvent(game, {
    type: "justSayNo",
    playerId: participantId,
    actorId: resolution.action.actorId,
    targetId: resolution.action.targetId,
    actionLabel: justSayNoActionLabel(resolution.action)
  });
  const eligible = playersWithJustSayNo(game, participantId);
  if (eligible.length > 0) {
    game.pendingResolution = {
      kind: "justSayNo",
      action: resolution.action,
      eligiblePlayerIds: eligible,
      primaryTargetId: resolution.primaryTargetId,
      affectedPlayerIds: resolution.affectedPlayerIds,
      canCounter: !resolution.canCounter,
      expiresAt: Date.now() + JUST_SAY_NO_WINDOW_MS
    };
    return;
  }
  game.pendingResolution = null;
  if (!resolution.canCounter) {
    executePendingAction(game, resolution.action);
  }
};

export const monopolyDealDiscard = (
  game: MonopolyDealGameInternal,
  participantId: string,
  cardIds: string[]
): void => {
  if (game.status !== "playing" || currentPlayerId(game) !== participantId) {
    throw new Error("Not your turn.");
  }
  if (game.phase !== "discarding") {
    throw new Error("Not in discard phase.");
  }
  for (const id of cardIds) {
    game.discardPile.unshift(removeFromHand(game, participantId, id));
  }
  if (getHand(game, participantId).length <= MONOPOLY_DEAL_MAX_HAND) {
    monopolyDealEndTurn(game, participantId);
  }
};

export const monopolyDealEndTurn = (game: MonopolyDealGameInternal, participantId: string): void => {
  if (game.status !== "playing") {
    return;
  }
  if (currentPlayerId(game) !== participantId) {
    throw new Error("Not your turn.");
  }
  if (game.pendingResolution) {
    throw new Error("Resolve pending action first.");
  }
  maybeClearJustSayNoLateForActor(game, participantId);
  if (getHand(game, participantId).length > MONOPOLY_DEAL_MAX_HAND) {
    game.phase = "discarding";
    return;
  }
  clearUndoableBank(game);
  game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.playerOrder.length;
  game.drawnThisTurn = false;
  beginTurnDraw(game);
};

export const projectMonopolyDealState = (game: MonopolyDealGameInternal, viewerId: string): MonopolyDealState => {
  if (game.status === "wagering") {
    return {
      status: "wagering",
      wagers: { ...game.wagers },
      submittedWagerIds: [...game.submittedWagerIds],
      pot: game.pot
    };
  }
  if (game.status === "finished") {
    const winnerId = game.winnerParticipantId ?? "";
    const winnerBoard =
      game.winnerBoard ??
      (winnerId ? boardToPlayerBoard(winnerId, getBoard(game, winnerId), getHand(game, winnerId).length) : null);
    return {
      status: "finished",
      winnerParticipantId: winnerId,
      winnerHand: game.winnerHand ?? [],
      winnerBoard,
      pot: game.pot,
      wagers: { ...game.wagers }
    };
  }
  const recentEvents = [...game.recentEventBatch];
  game.recentEventBatch = [];
  return {
    status: "playing",
    currentPlayerId: currentPlayerId(game),
    playsRemaining: game.playsRemaining,
    drawPileCount: game.drawPile.length,
    discardCount: game.discardPile.length,
    boards: game.playerOrder.map((pid) => boardToPlayerBoard(pid, getBoard(game, pid), getHand(game, pid).length)),
    myHand: viewerId ? [...getHand(game, viewerId)] : [],
    pot: game.pot,
    wagers: { ...game.wagers },
    pendingResolution: game.pendingResolution,
    phase: game.phase,
    recentEvent: game.recentEvent,
    recentEvents,
    eventSeq: game.eventSeq,
    canCancelPendingAction:
      game.pendingActionRestore?.actorId === viewerId && canCancelPendingResolution(game.pendingResolution),
    undoableBankCardId:
      game.undoableBank?.participantId === viewerId ? game.undoableBank.cardId : null,
    justSayNoLate: game.justSayNoLate
  };
};
