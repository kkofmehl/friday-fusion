import type {
  SplendorCardView,
  SplendorGemColorContract,
  SplendorPlayerPublic,
  SplendorState,
  SplendorTokenColorContract,
  SplendorTokenCountsView
} from "../../../../shared/contracts";
import { SPLENDOR_TOKEN_COLORS } from "../../../../shared/splendorData";

export type SplendorPresentationEvent =
  | {
      type: "cardPurchased";
      cardId: string;
      participantId: string;
      bonus: SplendorGemColorContract;
      from: "market" | "reserved" | "hidden";
      tier: 1 | 2 | 3;
    }
  | {
      type: "cardReserved";
      cardId: string | null;
      participantId: string;
      tier: 1 | 2 | 3 | null;
      from: "market" | "deck";
    }
  | {
      type: "tokensGained";
      participantId: string;
      color: SplendorTokenColorContract;
      amount: number;
    }
  | {
      type: "tokensSpent";
      participantId: string;
      color: SplendorTokenColorContract;
      amount: number;
    }
  | {
      type: "nobleAcquired";
      nobleId: string;
      participantId: string;
      name: string;
    }
  | {
      type: "scoreChanged";
      participantId: string;
      from: number;
      to: number;
      milestone: boolean;
    }
  | { type: "turnChanged"; participantId: string }
  | { type: "finalRound"; participantId: string }
  | { type: "gameFinished"; winnerParticipantIds: string[] };

type MarketSlot = { tier: 1 | 2 | 3; card: SplendorCardView };

function playersById(state: SplendorState): Map<string, SplendorPlayerPublic> {
  return new Map(state.players.map((player) => [player.participantId, player]));
}

function purchasedIndex(state: SplendorState): Map<string, { participantId: string; card: SplendorCardView }> {
  const index = new Map<string, { participantId: string; card: SplendorCardView }>();
  for (const player of state.players) {
    for (const cards of Object.values(player.purchasedByBonus)) {
      for (const card of cards) {
        index.set(card.id, { participantId: player.participantId, card });
      }
    }
  }
  return index;
}

function progressScore(state: SplendorState): number {
  return state.players.reduce(
    (sum, player) => sum + player.purchasedCardCount + player.nobles.length,
    0
  );
}

function marketIndex(
  state: Extract<SplendorState, { status: "playing" }>
): Map<string, MarketSlot> {
  const index = new Map<string, MarketSlot>();
  for (const tier of [1, 2, 3] as const) {
    for (const card of state.market[tier]) {
      if (card) {
        index.set(card.id, { tier, card });
      }
    }
  }
  return index;
}

function tokenDelta(
  events: SplendorPresentationEvent[],
  participantId: string,
  before: SplendorTokenCountsView,
  after: SplendorTokenCountsView
): void {
  for (const color of SPLENDOR_TOKEN_COLORS) {
    const amount = (after[color] ?? 0) - (before[color] ?? 0);
    if (amount > 0) {
      events.push({ type: "tokensGained", participantId, color, amount });
    } else if (amount < 0) {
      events.push({ type: "tokensSpent", participantId, color, amount: -amount });
    }
  }
}

export function diffSplendorView(
  prev: SplendorState,
  next: SplendorState,
  viewerId: string
): SplendorPresentationEvent[] {
  if (next.status === "playing" && progressScore(next) < progressScore(prev)) {
    return [];
  }

  const events: SplendorPresentationEvent[] = [];
  const prevPlayers = playersById(prev);
  const nextPlayers = playersById(next);
  const prevPurchased = purchasedIndex(prev);
  const nextPurchased = purchasedIndex(next);
  const prevMarket = prev.status === "playing" ? marketIndex(prev) : new Map<string, MarketSlot>();
  const nextMarket = next.status === "playing" ? marketIndex(next) : null;
  const prevReserved = new Map(
    (prev.status === "playing" ? prev.myReserved : []).map((card) => [card.id, card])
  );
  const nextReserved =
    next.status === "playing" ? next.myReserved : [];
  const reservedFor = new Set<string>();
  const threshold = prev.status === "playing" ? prev.prestigeToEnd : Number.POSITIVE_INFINITY;

  for (const [cardId, owned] of nextPurchased) {
    if (prevPurchased.has(cardId)) {
      continue;
    }
    const fromMarket = prevMarket.get(cardId);
    const fromReserved = prevReserved.get(cardId);
    events.push({
      type: "cardPurchased",
      cardId,
      participantId: owned.participantId,
      bonus: owned.card.bonus,
      tier: owned.card.tier,
      from: fromMarket ? "market" : fromReserved ? "reserved" : "hidden"
    });
  }

  if (next.status === "playing") {
    for (const card of nextReserved) {
      if (prevReserved.has(card.id)) {
        continue;
      }
      const slot = prevMarket.get(card.id);
      events.push({
        type: "cardReserved",
        cardId: card.id,
        participantId: viewerId,
        tier: slot?.tier ?? card.tier,
        from: slot ? "market" : "deck"
      });
      reservedFor.add(viewerId);
    }

    if (nextMarket) {
      for (const [cardId, slot] of prevMarket) {
        if (nextMarket.has(cardId) || nextPurchased.has(cardId) || nextReserved.some((card) => card.id === cardId)) {
          continue;
        }
        const participantId = playerWhoReserved(prevPlayers, nextPlayers) ?? actingPlayer(prev, next);
        events.push({
          type: "cardReserved",
          cardId,
          participantId,
          tier: slot.tier,
          from: "market"
        });
        reservedFor.add(participantId);
      }
    }

    for (const player of next.players) {
      const before = prevPlayers.get(player.participantId);
      if (!before || player.reservedCount <= before.reservedCount || reservedFor.has(player.participantId)) {
        continue;
      }
      events.push({
        type: "cardReserved",
        cardId: null,
        participantId: player.participantId,
        tier: null,
        from: "deck"
      });
    }
  }

  for (const player of next.players) {
    const before = prevPlayers.get(player.participantId);
    if (!before) {
      continue;
    }
    tokenDelta(events, player.participantId, before.tokens, player.tokens);
    const beforeNobles = new Map(before.nobles.map((noble) => [noble.id, noble]));
    for (const noble of player.nobles) {
      if (!beforeNobles.has(noble.id)) {
        events.push({
          type: "nobleAcquired",
          nobleId: noble.id,
          participantId: player.participantId,
          name: noble.name
        });
      }
    }
    if (player.prestige !== before.prestige) {
      events.push({
        type: "scoreChanged",
        participantId: player.participantId,
        from: before.prestige,
        to: player.prestige,
        milestone: before.prestige < threshold && player.prestige >= threshold
      });
    }
  }

  if (prev.status === "playing" && next.status === "playing" && prev.currentPlayerId !== next.currentPlayerId) {
    events.push({ type: "turnChanged", participantId: next.currentPlayerId });
  }

  if (
    prev.status === "playing" &&
    next.status === "playing" &&
    !prev.finalRoundAnchorPlayerId &&
    next.finalRoundAnchorPlayerId
  ) {
    events.push({ type: "finalRound", participantId: next.finalRoundAnchorPlayerId });
  }

  if (next.status === "finished" && prev.status !== "finished") {
    events.push({ type: "gameFinished", winnerParticipantIds: [...next.winnerParticipantIds] });
  }

  return events;
}

function actingPlayer(prev: SplendorState, next: SplendorState): string {
  if (prev.status === "playing") {
    return prev.currentPlayerId;
  }
  if (next.status === "playing") {
    return next.currentPlayerId;
  }
  return next.players[0]?.participantId ?? "";
}

function playerWhoReserved(
  prevPlayers: Map<string, SplendorPlayerPublic>,
  nextPlayers: Map<string, SplendorPlayerPublic>
): string | null {
  for (const [id, player] of nextPlayers) {
    const before = prevPlayers.get(id);
    if (before && player.reservedCount > before.reservedCount) {
      return id;
    }
  }
  return null;
}
