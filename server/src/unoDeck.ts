import { UNO_DECK_SIZE, type UnoCard, type UnoColor, type UnoRank } from "../../shared/contracts";

const COLORS: Exclude<UnoColor, "wild">[] = ["red", "yellow", "green", "blue"];

const shuffleInPlace = <T>(items: T[]): T[] => {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
  return items;
};

const numRank = (n: number): UnoRank => {
  if (n < 0 || n > 9 || !Number.isInteger(n)) {
    throw new Error(`Invalid UNO number rank: ${n}`);
  }
  return n as UnoRank;
};

/**
 * Builds a standard 108-card UNO deck (stable ids for persistence).
 * One 0 and two of each 1–9 per color; two Skip, Reverse, Draw Two per color; four Wild; four Wild Draw Four.
 */
export const buildUnoDeck = (): UnoCard[] => {
  const out: UnoCard[] = [];

  for (const color of COLORS) {
    out.push({ id: `${color}-0`, color, rank: numRank(0) });
    for (let n = 1; n <= 9; n += 1) {
      out.push({ id: `${color}-${n}-a`, color, rank: numRank(n) });
      out.push({ id: `${color}-${n}-b`, color, rank: numRank(n) });
    }
    for (const rank of ["skip", "reverse", "drawTwo"] as const) {
      out.push({ id: `${color}-${rank}-a`, color, rank });
      out.push({ id: `${color}-${rank}-b`, color, rank });
    }
  }

  for (let i = 0; i < 4; i += 1) {
    out.push({ id: `wild-${i}`, color: "wild", rank: "wild" });
    out.push({ id: `wild-draw-four-${i}`, color: "wild", rank: "wildDrawFour" });
  }

  return out;
};

export const validateUnoDeckSize = (deck: UnoCard[]): void => {
  if (deck.length !== UNO_DECK_SIZE) {
    throw new Error(`Expected ${UNO_DECK_SIZE} UNO cards, got ${deck.length}`);
  }
};

/** Returns a new shuffled deck (Fisher–Yates). */
export const shuffledUnoDeck = (): UnoCard[] => {
  const deck = buildUnoDeck();
  shuffleInPlace(deck);
  return deck;
};
