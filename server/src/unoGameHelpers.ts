import type { UnoActiveColor, UnoCard } from "../../shared/contracts";

export const isColoredNumberCard = (c: UnoCard): boolean =>
  c.color !== "wild" && typeof c.rank === "number";

const ranksEqual = (a: UnoCard["rank"], b: UnoCard["rank"]): boolean => a === b;

export const handHasMatchingColor = (
  hand: UnoCard[],
  activeColor: UnoActiveColor,
  excludeCardId?: string
): boolean =>
  hand.some((c) => c.id !== excludeCardId && c.color !== "wild" && c.color === activeColor);

/** Whether `handCard` can be legally played on top of `topDiscard` with current `activeColor`. */
export const unoCanPlayCard = (
  handCard: UnoCard,
  topDiscard: UnoCard,
  activeColor: UnoActiveColor,
  fullHand: UnoCard[]
): boolean => {
  if (handCard.rank === "wildDrawFour") {
    return !handHasMatchingColor(fullHand, activeColor, handCard.id);
  }
  if (handCard.rank === "wild") {
    return true;
  }
  if (handCard.color !== "wild" && handCard.color === activeColor) {
    return true;
  }
  if (topDiscard.color !== "wild") {
    if (ranksEqual(handCard.rank, topDiscard.rank)) {
      return true;
    }
  }
  return false;
};

export const normPlayerIndex = (idx: number, n: number): number => ((idx % n) + n) % n;

export const shuffleUnoCardsInPlace = (cards: UnoCard[]): void => {
  for (let i = cards.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j]!, cards[i]!];
  }
};

/** When draw is empty, shuffle discard (except top card) back into draw pile. */
export const refillUnoDrawPileFromDiscard = (drawPile: UnoCard[], discardPile: UnoCard[]): void => {
  if (drawPile.length > 0 || discardPile.length <= 1) {
    return;
  }
  const top = discardPile.pop()!;
  const rest = discardPile.splice(0);
  shuffleUnoCardsInPlace(rest);
  for (const c of rest) {
    drawPile.push(c);
  }
  discardPile.push(top);
};

/** Advance turn after `playedCard` was played by player at `currentPlayerIndex` (before advance). */
export const advanceTurnAfterPlay = (
  playerOrder: string[],
  currentPlayerIndex: number,
  direction: 1 | -1,
  playedRank: UnoCard["rank"]
): { currentPlayerIndex: number; direction: 1 | -1 } => {
  const n = playerOrder.length;
  let dir = direction;
  let idx = currentPlayerIndex;

  if (playedRank === "reverse") {
    dir = (dir * -1) as 1 | -1;
    if (n === 2) {
      return { currentPlayerIndex: idx, direction: dir };
    }
    idx = normPlayerIndex(idx + dir, n);
    return { currentPlayerIndex: idx, direction: dir };
  }

  let steps = 1;
  if (playedRank === "skip" || playedRank === "drawTwo" || playedRank === "wildDrawFour") {
    steps = 2;
  }
  for (let s = 0; s < steps; s += 1) {
    idx = normPlayerIndex(idx + dir, n);
  }
  return { currentPlayerIndex: idx, direction: dir };
};

/** Participant id `steps` ahead (1 = immediate next) in current direction. */
export const peekNextParticipantId = (
  playerOrder: string[],
  currentPlayerIndex: number,
  direction: 1 | -1,
  steps: number
): string => {
  const n = playerOrder.length;
  let idx = currentPlayerIndex;
  for (let s = 0; s < steps; s += 1) {
    idx = normPlayerIndex(idx + direction, n);
  }
  return playerOrder[idx]!;
};
