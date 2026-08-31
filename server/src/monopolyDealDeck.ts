import { MONOPOLY_DEAL_CARD_DEFS, MONOPOLY_DEAL_DECK_SIZE } from "../../shared/monopolyDealData";
import type { MonopolyDealCardInstance } from "../../shared/monopolyDealLogic";

const shuffleInPlace = <T>(items: T[]): T[] => {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
  return items;
};

export const buildMonopolyDealDeck = (): MonopolyDealCardInstance[] =>
  MONOPOLY_DEAL_CARD_DEFS.map((def, index) => ({
    id: `${def.defId}#${index}`,
    defId: def.defId
  }));

export const validateMonopolyDealDeckSize = (deck: MonopolyDealCardInstance[]): void => {
  if (deck.length !== MONOPOLY_DEAL_DECK_SIZE) {
    throw new Error(`Expected ${MONOPOLY_DEAL_DECK_SIZE} Monopoly Deal cards, got ${deck.length}`);
  }
};

export const shuffledMonopolyDealDeck = (): MonopolyDealCardInstance[] => {
  const deck = buildMonopolyDealDeck();
  shuffleInPlace(deck);
  return deck;
};

export const refillDrawPileFromDiscard = (
  drawPile: MonopolyDealCardInstance[],
  discardPile: MonopolyDealCardInstance[]
): void => {
  if (drawPile.length > 0 || discardPile.length === 0) {
    return;
  }
  const rest = discardPile.splice(0);
  shuffleInPlace(rest);
  for (const card of rest) {
    drawPile.push(card);
  }
};

export const drawCards = (
  drawPile: MonopolyDealCardInstance[],
  discardPile: MonopolyDealCardInstance[],
  count: number
): MonopolyDealCardInstance[] => {
  const drawn: MonopolyDealCardInstance[] = [];
  for (let i = 0; i < count; i += 1) {
    refillDrawPileFromDiscard(drawPile, discardPile);
    const card = drawPile.pop();
    if (!card) {
      break;
    }
    drawn.push(card);
  }
  return drawn;
};
