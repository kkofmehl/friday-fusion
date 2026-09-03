import { nanoid } from "nanoid";
import type {
  SplendorCardView,
  SplendorNobleView,
  SplendorPending,
  SplendorPlayerPublic,
  SplendorState,
  SplendorTokenCountsView
} from "../../shared/contracts";
import {
  SPLENDOR_CARDS_BY_TIER,
  SPLENDOR_GEM_COLORS,
  SPLENDOR_MAX_PLAYERS,
  SPLENDOR_MIN_PLAYERS,
  SPLENDOR_NOBLES,
  emptyGemCounts,
  emptyTokenCounts,
  gemSupplyForPlayerCount,
  goldSupplyForPlayerCount,
  marketSlotsForPlayerCount,
  nobleCountForPlayerCount,
  prestigeToEndForPlayerCount,
  getSplendorCard,
  getSplendorNoble,
  totalTokens,
  type SplendorGemColor,
  type SplendorTier,
  type SplendorTokenColor
} from "../../shared/splendorData";
import {
  addTokens,
  bonusesFromPurchasedCards,
  canAffordCard,
  canReserveMore,
  canTakeSameColor,
  computeAutoPayment,
  eligibleNobles,
  playerPrestige,
  resolveSplendorWinners,
  subtractTokens,
  tokensToReturnCount,
  triggersEndGame,
  validatePayment,
  type SplendorTokenCounts
} from "../../shared/splendorLogic";

export type SplendorPlayerInternal = {
  tokens: SplendorTokenCounts;
  purchasedCardIds: string[];
  reservedCardIds: string[];
  nobleIds: string[];
};

export type SplendorGameInternal = {
  id: string;
  type: "splendor";
  status: "playing" | "finished";
  playerOrder: string[];
  currentPlayerIndex: number;
  bank: SplendorTokenCounts;
  decks: Record<SplendorTier, string[]>;
  market: Record<SplendorTier, (string | null)[]>;
  nobleIds: string[];
  players: Record<string, SplendorPlayerInternal>;
  pending: SplendorPending | null;
  prestigeToEnd: number;
  /** Player who first hit the prestige threshold; finish until the player before them has acted. */
  finalRoundAnchorPlayerId: string | null;
  /** Players who have completed a turn after the end was triggered (including the triggerer). */
  finalRoundCompletedIds: string[];
  winnerParticipantIds: string[] | null;
  scoresApplied: boolean;
};

const shuffle = <T>(items: T[]): T[] => {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j]!, next[i]!];
  }
  return next;
};

const cardView = (cardId: string): SplendorCardView => {
  const card = getSplendorCard(cardId);
  if (!card) {
    throw new Error(`Unknown Splendor card: ${cardId}`);
  }
  return {
    id: card.id,
    tier: card.tier,
    bonus: card.bonus,
    prestige: card.prestige,
    cost: { ...card.cost }
  };
};

const nobleView = (nobleId: string): SplendorNobleView => {
  const noble = getSplendorNoble(nobleId);
  if (!noble) {
    throw new Error(`Unknown Splendor noble: ${nobleId}`);
  }
  return {
    id: noble.id,
    name: noble.name,
    prestige: 3,
    requirements: { ...noble.requirements }
  };
};

const cloneTokens = (tokens: SplendorTokenCounts): SplendorTokenCountsView => ({
  white: tokens.white,
  blue: tokens.blue,
  green: tokens.green,
  red: tokens.red,
  black: tokens.black,
  gold: tokens.gold
});

const playerPublic = (participantId: string, player: SplendorPlayerInternal): SplendorPlayerPublic => {
  const bonuses = bonusesFromPurchasedCards(player.purchasedCardIds);
  const purchasedByBonus: SplendorPlayerPublic["purchasedByBonus"] = {
    white: [],
    blue: [],
    green: [],
    red: [],
    black: []
  };
  for (const id of player.purchasedCardIds) {
    const card = getSplendorCard(id);
    if (card) {
      purchasedByBonus[card.bonus].push(cardView(id));
    }
  }
  return {
    participantId,
    tokens: cloneTokens(player.tokens),
    bonuses,
    prestige: playerPrestige(player.purchasedCardIds, player.nobleIds),
    purchasedCardCount: player.purchasedCardIds.length,
    reservedCount: player.reservedCardIds.length,
    nobles: player.nobleIds.map(nobleView),
    purchasedByBonus
  };
};

const refillMarketSlot = (game: SplendorGameInternal, tier: SplendorTier, slot: number): void => {
  const top = game.decks[tier].shift() ?? null;
  game.market[tier][slot] = top;
};

const assertPlaying = (game: SplendorGameInternal): void => {
  if (game.status !== "playing") {
    throw new Error("Splendor game is already finished.");
  }
};

const assertNoPending = (game: SplendorGameInternal): void => {
  if (game.pending) {
    throw new Error("Resolve the pending Splendor action first.");
  }
};

const assertCurrentPlayer = (game: SplendorGameInternal, participantId: string): void => {
  const current = game.playerOrder[game.currentPlayerIndex];
  if (current !== participantId) {
    throw new Error("It is not your turn.");
  }
};

const getPlayer = (game: SplendorGameInternal, participantId: string): SplendorPlayerInternal => {
  const player = game.players[participantId];
  if (!player) {
    throw new Error("Player is not in this Splendor game.");
  }
  return player;
};

const beginNobleOrAdvance = (game: SplendorGameInternal, participantId: string): void => {
  const player = getPlayer(game, participantId);
  const bonuses = bonusesFromPurchasedCards(player.purchasedCardIds);
  const eligible = eligibleNobles(game.nobleIds, bonuses);
  if (eligible.length === 1) {
    const noble = eligible[0]!;
    game.nobleIds = game.nobleIds.filter((id) => id !== noble.id);
    player.nobleIds.push(noble.id);
    finishTurn(game, participantId);
    return;
  }
  if (eligible.length > 1) {
    game.pending = {
      type: "chooseNoble",
      participantId,
      nobleIds: eligible.map((n) => n.id)
    };
    return;
  }
  finishTurn(game, participantId);
};

const afterMainAction = (game: SplendorGameInternal, participantId: string): void => {
  const player = getPlayer(game, participantId);
  const excess = tokensToReturnCount(player.tokens);
  if (excess > 0) {
    game.pending = {
      type: "returnTokens",
      participantId,
      mustReturn: excess
    };
    return;
  }
  beginNobleOrAdvance(game, participantId);
};

const finishTurn = (game: SplendorGameInternal, participantId: string): void => {
  const player = getPlayer(game, participantId);
  const prestige = playerPrestige(player.purchasedCardIds, player.nobleIds);

  if (!game.finalRoundAnchorPlayerId && triggersEndGame(prestige, game.prestigeToEnd)) {
    game.finalRoundAnchorPlayerId = participantId;
    game.finalRoundCompletedIds = [participantId];
  } else if (game.finalRoundAnchorPlayerId) {
    if (!game.finalRoundCompletedIds.includes(participantId)) {
      game.finalRoundCompletedIds.push(participantId);
    }
  }

  if (
    game.finalRoundAnchorPlayerId &&
    game.finalRoundCompletedIds.length >= game.playerOrder.length
  ) {
    endGame(game);
    return;
  }

  game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.playerOrder.length;
  game.pending = null;
};

const endGame = (game: SplendorGameInternal): void => {
  const standings = game.playerOrder.map((participantId) => {
    const player = getPlayer(game, participantId);
    return {
      participantId,
      prestige: playerPrestige(player.purchasedCardIds, player.nobleIds),
      purchasedCardCount: player.purchasedCardIds.length,
      reservedCardCount: player.reservedCardIds.length
    };
  });
  game.winnerParticipantIds = resolveSplendorWinners(standings);
  game.status = "finished";
  game.pending = null;
};

export const createSplendorGame = (playerOrder: string[]): SplendorGameInternal => {
  if (playerOrder.length < SPLENDOR_MIN_PLAYERS || playerOrder.length > SPLENDOR_MAX_PLAYERS) {
    throw new Error("Splendor needs 2 to 6 active players.");
  }
  const marketSlots = marketSlotsForPlayerCount(playerOrder.length);
  const gemSupply = gemSupplyForPlayerCount(playerOrder.length);
  const bank = emptyTokenCounts();
  for (const color of SPLENDOR_GEM_COLORS) {
    bank[color] = gemSupply;
  }
  bank.gold = goldSupplyForPlayerCount(playerOrder.length);

  const decks: Record<SplendorTier, string[]> = {
    1: shuffle(SPLENDOR_CARDS_BY_TIER[1].map((c) => c.id)),
    2: shuffle(SPLENDOR_CARDS_BY_TIER[2].map((c) => c.id)),
    3: shuffle(SPLENDOR_CARDS_BY_TIER[3].map((c) => c.id))
  };

  const market: Record<SplendorTier, (string | null)[]> = {
    1: Array.from({ length: marketSlots }, () => decks[1].shift() ?? null),
    2: Array.from({ length: marketSlots }, () => decks[2].shift() ?? null),
    3: Array.from({ length: marketSlots }, () => decks[3].shift() ?? null)
  };

  const nobleCount = nobleCountForPlayerCount(playerOrder.length);
  const nobleIds = shuffle(SPLENDOR_NOBLES.map((n) => n.id)).slice(0, nobleCount);

  const players: Record<string, SplendorPlayerInternal> = {};
  for (const id of playerOrder) {
    players[id] = {
      tokens: emptyTokenCounts(),
      purchasedCardIds: [],
      reservedCardIds: [],
      nobleIds: []
    };
  }

  return {
    id: nanoid(6),
    type: "splendor",
    status: "playing",
    playerOrder,
    currentPlayerIndex: 0,
    bank,
    decks,
    market,
    nobleIds,
    players,
    pending: null,
    prestigeToEnd: prestigeToEndForPlayerCount(playerOrder.length),
    finalRoundAnchorPlayerId: null,
    finalRoundCompletedIds: [],
    winnerParticipantIds: null,
    scoresApplied: false
  };
};

export const projectSplendorState = (
  game: SplendorGameInternal,
  viewerParticipantId: string
): SplendorState => {
  const players = game.playerOrder.map((id) => playerPublic(id, getPlayer(game, id)));

  if (game.status === "finished") {
    const prestigeByParticipant: Record<string, number> = {};
    for (const p of players) {
      prestigeByParticipant[p.participantId] = p.prestige;
    }
    return {
      status: "finished",
      winnerParticipantIds: game.winnerParticipantIds ?? [],
      players,
      prestigeByParticipant
    };
  }

  const myReserved =
    viewerParticipantId && game.players[viewerParticipantId]
      ? game.players[viewerParticipantId]!.reservedCardIds.map(cardView)
      : [];

  return {
    status: "playing",
    playerOrder: [...game.playerOrder],
    currentPlayerId: game.playerOrder[game.currentPlayerIndex] ?? "",
    bank: cloneTokens(game.bank),
    market: {
      1: game.market[1].map((id) => (id ? cardView(id) : null)),
      2: game.market[2].map((id) => (id ? cardView(id) : null)),
      3: game.market[3].map((id) => (id ? cardView(id) : null))
    },
    deckCounts: {
      1: game.decks[1].length,
      2: game.decks[2].length,
      3: game.decks[3].length
    },
    nobles: game.nobleIds.map(nobleView),
    players,
    myReserved,
    pending: game.pending ? { ...game.pending } : null,
    prestigeToEnd: game.prestigeToEnd,
    finalRoundAnchorPlayerId: game.finalRoundAnchorPlayerId
  };
};

export const splendorTakeDifferentGems = (
  game: SplendorGameInternal,
  participantId: string,
  colors: SplendorGemColor[]
): void => {
  assertPlaying(game);
  assertNoPending(game);
  assertCurrentPlayer(game, participantId);
  if (colors.length < 1 || colors.length > 3) {
    throw new Error("Take 1 to 3 different gem colors.");
  }
  const unique = new Set(colors);
  if (unique.size !== colors.length) {
    throw new Error("Gem colors must be different.");
  }
  for (const color of colors) {
    if ((game.bank[color] ?? 0) < 1) {
      throw new Error(`Not enough ${color} tokens in the bank.`);
    }
  }
  const player = getPlayer(game, participantId);
  for (const color of colors) {
    game.bank[color] -= 1;
    player.tokens[color] += 1;
  }
  afterMainAction(game, participantId);
};

export const splendorTakeSameGems = (
  game: SplendorGameInternal,
  participantId: string,
  color: SplendorGemColor
): void => {
  assertPlaying(game);
  assertNoPending(game);
  assertCurrentPlayer(game, participantId);
  if (!canTakeSameColor(game.bank[color] ?? 0)) {
    throw new Error("Need at least 4 tokens of that color in the bank.");
  }
  const player = getPlayer(game, participantId);
  game.bank[color] -= 2;
  player.tokens[color] += 2;
  afterMainAction(game, participantId);
};

export const splendorReserveCard = (
  game: SplendorGameInternal,
  participantId: string,
  source: "market" | "deck",
  tier: SplendorTier,
  cardId?: string
): void => {
  assertPlaying(game);
  assertNoPending(game);
  assertCurrentPlayer(game, participantId);
  const player = getPlayer(game, participantId);
  if (!canReserveMore(player.reservedCardIds.length)) {
    throw new Error("You may reserve at most 3 cards.");
  }

  let reservedId: string | null = null;
  if (source === "market") {
    if (!cardId) {
      throw new Error("cardId is required when reserving from the market.");
    }
    const slot = game.market[tier].findIndex((id) => id === cardId);
    if (slot < 0) {
      throw new Error("That card is not available in the market.");
    }
    reservedId = cardId;
    game.market[tier][slot] = null;
    refillMarketSlot(game, tier, slot);
  } else {
    const top = game.decks[tier].shift() ?? null;
    if (!top) {
      throw new Error("That deck is empty.");
    }
    reservedId = top;
  }

  player.reservedCardIds.push(reservedId);
  if ((game.bank.gold ?? 0) > 0) {
    game.bank.gold -= 1;
    player.tokens.gold += 1;
  }
  afterMainAction(game, participantId);
};

export const splendorBuyCard = (
  game: SplendorGameInternal,
  participantId: string,
  source: "market" | "reserved",
  cardId: string,
  tier?: SplendorTier,
  paymentInput?: SplendorTokenCounts
): void => {
  assertPlaying(game);
  assertNoPending(game);
  assertCurrentPlayer(game, participantId);
  const player = getPlayer(game, participantId);
  const card = getSplendorCard(cardId);
  if (!card) {
    throw new Error("Unknown card.");
  }

  let marketSlot = -1;
  if (source === "market") {
    const useTier = tier ?? card.tier;
    if (useTier !== card.tier) {
      throw new Error("Card tier mismatch.");
    }
    marketSlot = game.market[useTier].findIndex((id) => id === cardId);
    if (marketSlot < 0) {
      throw new Error("That card is not available in the market.");
    }
  } else {
    if (!player.reservedCardIds.includes(cardId)) {
      throw new Error("That card is not in your reserved cards.");
    }
  }

  const bonuses = bonusesFromPurchasedCards(player.purchasedCardIds);
  if (!canAffordCard(card, player.tokens, bonuses)) {
    throw new Error("You cannot afford that card.");
  }
  const payment =
    paymentInput ??
    computeAutoPayment(card, player.tokens, bonuses);
  if (!payment || !validatePayment(card, payment, player.tokens, bonuses)) {
    throw new Error("Invalid payment.");
  }

  player.tokens = subtractTokens(player.tokens, payment);
  game.bank = addTokens(game.bank, payment);

  if (source === "market") {
    const useTier = tier ?? card.tier;
    game.market[useTier][marketSlot] = null;
    refillMarketSlot(game, useTier, marketSlot);
  } else {
    player.reservedCardIds = player.reservedCardIds.filter((id) => id !== cardId);
  }
  player.purchasedCardIds.push(cardId);
  afterMainAction(game, participantId);
};

export const splendorReturnTokens = (
  game: SplendorGameInternal,
  participantId: string,
  tokens: SplendorTokenCounts
): void => {
  assertPlaying(game);
  if (game.pending?.type !== "returnTokens" || game.pending.participantId !== participantId) {
    throw new Error("You are not returning tokens right now.");
  }
  const player = getPlayer(game, participantId);
  let returning = 0;
  for (const color of [...SPLENDOR_GEM_COLORS, "gold"] as SplendorTokenColor[]) {
    const amount = tokens[color] ?? 0;
    if (amount < 0 || amount > (player.tokens[color] ?? 0)) {
      throw new Error("Invalid token return.");
    }
    returning += amount;
  }
  if (returning !== game.pending.mustReturn) {
    throw new Error(`Return exactly ${game.pending.mustReturn} token(s).`);
  }
  player.tokens = subtractTokens(player.tokens, tokens);
  game.bank = addTokens(game.bank, tokens);
  if (totalTokens(player.tokens) > 10) {
    throw new Error("You still have more than 10 tokens.");
  }
  game.pending = null;
  beginNobleOrAdvance(game, participantId);
};

export const splendorChooseNoble = (
  game: SplendorGameInternal,
  participantId: string,
  nobleId: string
): void => {
  assertPlaying(game);
  if (game.pending?.type !== "chooseNoble" || game.pending.participantId !== participantId) {
    throw new Error("You are not choosing a noble right now.");
  }
  if (!game.pending.nobleIds.includes(nobleId)) {
    throw new Error("That noble is not available to choose.");
  }
  if (!game.nobleIds.includes(nobleId)) {
    throw new Error("That noble is no longer available.");
  }
  const player = getPlayer(game, participantId);
  game.nobleIds = game.nobleIds.filter((id) => id !== nobleId);
  player.nobleIds.push(nobleId);
  game.pending = null;
  finishTurn(game, participantId);
};

/** Test helper: force prestige end without full playthrough. */
export const splendorDebugSetPurchased = (
  game: SplendorGameInternal,
  participantId: string,
  purchasedCardIds: string[]
): void => {
  getPlayer(game, participantId).purchasedCardIds = [...purchasedCardIds];
};

export const emptySplendorPlayer = (): SplendorPlayerInternal => ({
  tokens: emptyTokenCounts(),
  purchasedCardIds: [],
  reservedCardIds: [],
  nobleIds: []
});

export { emptyGemCounts };
