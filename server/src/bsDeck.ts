import type { BsCard, BsRank, BsSuit } from "../../shared/contracts";

const BS_SUITS: BsSuit[] = ["clubs", "diamonds", "hearts", "spades"];
const BS_RANKS: BsRank[] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

const shuffleInPlace = <T>(items: T[]): T[] => {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
  return items;
};

/** Builds a standard 52-card deck with stable ids for persistence. */
export const buildBsDeck = (): BsCard[] => {
  const out: BsCard[] = [];
  for (const suit of BS_SUITS) {
    for (const rank of BS_RANKS) {
      out.push({
        id: `${suit}-${rank}`,
        suit,
        rank
      });
    }
  }
  return out;
};

export const shuffledBsDeck = (): BsCard[] => {
  const deck = buildBsDeck();
  shuffleInPlace(deck);
  return deck;
};
