import {
  SPLENDOR_GEM_COLORS,
  SPLENDOR_MAX_RESERVED,
  SPLENDOR_MAX_TOKENS,
  SPLENDOR_PRESTIGE_TO_END,
  emptyGemCounts,
  emptyTokenCounts,
  getSplendorCard,
  getSplendorNoble,
  totalTokens,
  type SplendorCardDef,
  type SplendorGemColor,
  type SplendorGemCost,
  type SplendorNobleDef,
  type SplendorTokenColor
} from "./splendorData";

export type SplendorBonusCounts = Record<SplendorGemColor, number>;
export type SplendorTokenCounts = Record<SplendorTokenColor, number>;

export function bonusesFromPurchasedCards(purchasedCardIds: readonly string[]): SplendorBonusCounts {
  const bonuses = emptyGemCounts();
  for (const id of purchasedCardIds) {
    const card = getSplendorCard(id);
    if (card) {
      bonuses[card.bonus] += 1;
    }
  }
  return bonuses;
}

export function prestigeFromPurchasedCards(purchasedCardIds: readonly string[]): number {
  let total = 0;
  for (const id of purchasedCardIds) {
    const card = getSplendorCard(id);
    if (card) {
      total += card.prestige;
    }
  }
  return total;
}

export function prestigeFromNobles(nobleIds: readonly string[]): number {
  let total = 0;
  for (const id of nobleIds) {
    const noble = getSplendorNoble(id);
    if (noble) {
      total += noble.prestige;
    }
  }
  return total;
}

export function playerPrestige(purchasedCardIds: readonly string[], nobleIds: readonly string[]): number {
  return prestigeFromPurchasedCards(purchasedCardIds) + prestigeFromNobles(nobleIds);
}

/** Remaining cost after permanent bonuses (cannot go below 0 per color). */
export function remainingCostAfterBonuses(
  cost: SplendorGemCost,
  bonuses: SplendorBonusCounts
): SplendorBonusCounts {
  const remaining = emptyGemCounts();
  for (const color of SPLENDOR_GEM_COLORS) {
    const need = cost[color] ?? 0;
    remaining[color] = Math.max(0, need - (bonuses[color] ?? 0));
  }
  return remaining;
}

export function goldNeededForRemaining(
  remaining: SplendorBonusCounts,
  tokens: SplendorTokenCounts
): number {
  let shortfall = 0;
  for (const color of SPLENDOR_GEM_COLORS) {
    const need = remaining[color] ?? 0;
    const have = tokens[color] ?? 0;
    if (have < need) {
      shortfall += need - have;
    }
  }
  return shortfall;
}

export function canAffordCard(
  card: SplendorCardDef,
  tokens: SplendorTokenCounts,
  bonuses: SplendorBonusCounts
): boolean {
  const remaining = remainingCostAfterBonuses(card.cost, bonuses);
  const goldNeed = goldNeededForRemaining(remaining, tokens);
  return goldNeed <= (tokens.gold ?? 0);
}

/**
 * Auto payment: spend matching gems first, then gold for shortfalls.
 * Returns null if unaffordable.
 */
export function computeAutoPayment(
  card: SplendorCardDef,
  tokens: SplendorTokenCounts,
  bonuses: SplendorBonusCounts
): SplendorTokenCounts | null {
  if (!canAffordCard(card, tokens, bonuses)) {
    return null;
  }
  const remaining = remainingCostAfterBonuses(card.cost, bonuses);
  const payment = emptyTokenCounts();
  let goldUsed = 0;
  for (const color of SPLENDOR_GEM_COLORS) {
    const need = remaining[color] ?? 0;
    const have = tokens[color] ?? 0;
    const fromColor = Math.min(need, have);
    payment[color] = fromColor;
    goldUsed += need - fromColor;
  }
  payment.gold = goldUsed;
  return payment;
}

export function validatePayment(
  card: SplendorCardDef,
  payment: SplendorTokenCounts,
  tokens: SplendorTokenCounts,
  bonuses: SplendorBonusCounts
): boolean {
  for (const color of [...SPLENDOR_GEM_COLORS, "gold"] as const) {
    if ((payment[color] ?? 0) < 0 || (payment[color] ?? 0) > (tokens[color] ?? 0)) {
      return false;
    }
  }
  const remaining = remainingCostAfterBonuses(card.cost, bonuses);
  let goldAvailable = payment.gold ?? 0;
  for (const color of SPLENDOR_GEM_COLORS) {
    const need = remaining[color] ?? 0;
    const paid = payment[color] ?? 0;
    if (paid > need) {
      return false;
    }
    const gap = need - paid;
    if (gap > goldAvailable) {
      return false;
    }
    goldAvailable -= gap;
  }
  // No leftover gold required — overpaying with gold is allowed only if total covers exactly via gems+gold
  // Prefer exact: gold spent must equal shortfall after gem tokens
  const shortfall = goldNeededForRemaining(remaining, {
    ...emptyTokenCounts(),
    white: payment.white ?? 0,
    blue: payment.blue ?? 0,
    green: payment.green ?? 0,
    red: payment.red ?? 0,
    black: payment.black ?? 0,
    gold: 0
  });
  return (payment.gold ?? 0) === shortfall;
}

export function canTakeSameColor(bankCount: number): boolean {
  return bankCount >= 4;
}

export function canReserveMore(reservedCount: number): boolean {
  return reservedCount < SPLENDOR_MAX_RESERVED;
}

export function tokensExceedLimit(tokens: SplendorTokenCounts): boolean {
  return totalTokens(tokens) > SPLENDOR_MAX_TOKENS;
}

export function tokensToReturnCount(tokens: SplendorTokenCounts): number {
  return Math.max(0, totalTokens(tokens) - SPLENDOR_MAX_TOKENS);
}

export function nobleEligible(noble: SplendorNobleDef, bonuses: SplendorBonusCounts): boolean {
  for (const color of SPLENDOR_GEM_COLORS) {
    const need = noble.requirements[color] ?? 0;
    if ((bonuses[color] ?? 0) < need) {
      return false;
    }
  }
  return true;
}

export function eligibleNobles(
  availableNobleIds: readonly string[],
  bonuses: SplendorBonusCounts
): SplendorNobleDef[] {
  const result: SplendorNobleDef[] = [];
  for (const id of availableNobleIds) {
    const noble = getSplendorNoble(id);
    if (noble && nobleEligible(noble, bonuses)) {
      result.push(noble);
    }
  }
  return result;
}

export function triggersEndGame(prestige: number): boolean {
  return prestige >= SPLENDOR_PRESTIGE_TO_END;
}

export type SplendorStanding = {
  participantId: string;
  prestige: number;
  purchasedCardCount: number;
  reservedCardCount: number;
};

/**
 * Highest prestige wins. Tie → fewest purchased cards. Still tied → fewest reserved. Else share.
 */
export function resolveSplendorWinners(standings: readonly SplendorStanding[]): string[] {
  if (standings.length === 0) {
    return [];
  }
  let best = standings[0]!;
  for (const row of standings.slice(1)) {
    if (row.prestige > best.prestige) {
      best = row;
      continue;
    }
    if (row.prestige < best.prestige) {
      continue;
    }
    if (row.purchasedCardCount < best.purchasedCardCount) {
      best = row;
      continue;
    }
    if (row.purchasedCardCount > best.purchasedCardCount) {
      continue;
    }
    if (row.reservedCardCount < best.reservedCardCount) {
      best = row;
    }
  }
  return standings
    .filter(
      (row) =>
        row.prestige === best.prestige &&
        row.purchasedCardCount === best.purchasedCardCount &&
        row.reservedCardCount === best.reservedCardCount
    )
    .map((row) => row.participantId);
}

export function subtractTokens(
  from: SplendorTokenCounts,
  payment: SplendorTokenCounts
): SplendorTokenCounts {
  const next = { ...from };
  for (const color of [...SPLENDOR_GEM_COLORS, "gold"] as const) {
    next[color] = (next[color] ?? 0) - (payment[color] ?? 0);
  }
  return next;
}

export function addTokens(
  into: SplendorTokenCounts,
  payment: SplendorTokenCounts
): SplendorTokenCounts {
  const next = { ...into };
  for (const color of [...SPLENDOR_GEM_COLORS, "gold"] as const) {
    next[color] = (next[color] ?? 0) + (payment[color] ?? 0);
  }
  return next;
}
