export const SPLENDOR_PRESTIGE_TO_END = 15;
export const SPLENDOR_PRESTIGE_TO_END_LARGE = 12;
export const SPLENDOR_MAX_TOKENS = 10;
export const SPLENDOR_MAX_RESERVED = 3;
export const SPLENDOR_MARKET_SLOTS = 4;
export const SPLENDOR_MARKET_SLOTS_LARGE = 5;
export const SPLENDOR_GOLD_SUPPLY = 5;
export const SPLENDOR_NOBLE_PRESTIGE = 3;
export const SPLENDOR_MIN_PLAYERS = 2;
export const SPLENDOR_MAX_PLAYERS = 6;
export const SPLENDOR_LARGE_TABLE_PLAYER_COUNT = 5;

/** Gem colors for tokens and card bonuses (excludes gold). */
export type SplendorGemColor = "white" | "blue" | "green" | "red" | "black";
export type SplendorTokenColor = SplendorGemColor | "gold";
export type SplendorTier = 1 | 2 | 3;

export const SPLENDOR_GEM_COLORS: readonly SplendorGemColor[] = [
  "white",
  "blue",
  "green",
  "red",
  "black"
] as const;

export const SPLENDOR_TOKEN_COLORS: readonly SplendorTokenColor[] = [
  ...SPLENDOR_GEM_COLORS,
  "gold"
] as const;

export const SPLENDOR_GEM_LABELS: Record<SplendorGemColor, string> = {
  white: "Diamond",
  blue: "Sapphire",
  green: "Emerald",
  red: "Ruby",
  black: "Onyx"
};

export const SPLENDOR_TOKEN_LABELS: Record<SplendorTokenColor, string> = {
  ...SPLENDOR_GEM_LABELS,
  gold: "Gold"
};

export const SPLENDOR_GEM_HEX: Record<SplendorGemColor, string> = {
  white: "#F5F5F5",
  blue: "#2F6FED",
  green: "#2E9B57",
  red: "#D64545",
  black: "#2A2A2A"
};

/** Tokens per gem color by player count (gold always SPLENDOR_GOLD_SUPPLY). */
export const SPLENDOR_GEM_SUPPLY_BY_PLAYERS: Record<2 | 3 | 4, number> = {
  2: 4,
  3: 5,
  4: 7
};

export type SplendorGemCost = Partial<Record<SplendorGemColor, number>>;

export type SplendorCardDef = {
  id: string;
  tier: SplendorTier;
  bonus: SplendorGemColor;
  prestige: number;
  cost: SplendorGemCost;
};

export type SplendorNobleDef = {
  id: string;
  name: string;
  prestige: typeof SPLENDOR_NOBLE_PRESTIGE;
  requirements: SplendorGemCost;
};

type RawCardRow = {
  red: number;
  green: number;
  blue: number;
  white: number;
  black: number;
  bonusIndex: number;
  points: number;
};

const BONUS_BY_INDEX: readonly SplendorGemColor[] = ["red", "green", "blue", "white", "black"];

/** Base-game catalog (40 / 30 / 20). Costs from community-verified tables. */
const RAW_CARDS: readonly RawCardRow[] = [
  // Tier 1 (40)
  { red: 0, green: 0, blue: 0, white: 3, black: 0, bonusIndex: 0, points: 0 },
  { red: 3, green: 0, blue: 0, white: 0, black: 0, bonusIndex: 1, points: 0 },
  { red: 0, green: 0, blue: 0, white: 0, black: 3, bonusIndex: 2, points: 0 },
  { red: 0, green: 0, blue: 3, white: 0, black: 0, bonusIndex: 3, points: 0 },
  { red: 0, green: 3, blue: 0, white: 0, black: 0, bonusIndex: 4, points: 0 },
  { red: 0, green: 1, blue: 2, white: 0, black: 0, bonusIndex: 0, points: 0 },
  { red: 0, green: 0, blue: 1, white: 2, black: 0, bonusIndex: 1, points: 0 },
  { red: 0, green: 0, blue: 0, white: 1, black: 2, bonusIndex: 2, points: 0 },
  { red: 2, green: 0, blue: 0, white: 0, black: 1, bonusIndex: 3, points: 0 },
  { red: 1, green: 2, blue: 0, white: 0, black: 0, bonusIndex: 4, points: 0 },
  { red: 0, green: 0, blue: 0, white: 4, black: 0, bonusIndex: 0, points: 1 },
  { red: 0, green: 0, blue: 0, white: 0, black: 4, bonusIndex: 1, points: 1 },
  { red: 4, green: 0, blue: 0, white: 0, black: 0, bonusIndex: 2, points: 1 },
  { red: 0, green: 4, blue: 0, white: 0, black: 0, bonusIndex: 3, points: 1 },
  { red: 0, green: 0, blue: 4, white: 0, black: 0, bonusIndex: 4, points: 1 },
  { red: 2, green: 0, blue: 0, white: 2, black: 0, bonusIndex: 0, points: 0 },
  { red: 2, green: 0, blue: 2, white: 0, black: 0, bonusIndex: 1, points: 0 },
  { red: 0, green: 2, blue: 0, white: 0, black: 2, bonusIndex: 2, points: 0 },
  { red: 0, green: 0, blue: 2, white: 0, black: 2, bonusIndex: 3, points: 0 },
  { red: 0, green: 2, blue: 0, white: 2, black: 0, bonusIndex: 4, points: 0 },
  { red: 0, green: 1, blue: 1, white: 1, black: 1, bonusIndex: 0, points: 0 },
  { red: 1, green: 0, blue: 1, white: 1, black: 1, bonusIndex: 1, points: 0 },
  { red: 1, green: 1, blue: 0, white: 1, black: 1, bonusIndex: 2, points: 0 },
  { red: 1, green: 1, blue: 1, white: 0, black: 1, bonusIndex: 3, points: 0 },
  { red: 1, green: 1, blue: 1, white: 1, black: 0, bonusIndex: 4, points: 0 },
  { red: 0, green: 1, blue: 1, white: 2, black: 1, bonusIndex: 0, points: 0 },
  { red: 1, green: 0, blue: 1, white: 1, black: 2, bonusIndex: 1, points: 0 },
  { red: 2, green: 1, blue: 0, white: 1, black: 1, bonusIndex: 2, points: 0 },
  { red: 1, green: 2, blue: 1, white: 0, black: 1, bonusIndex: 3, points: 0 },
  { red: 1, green: 1, blue: 2, white: 1, black: 0, bonusIndex: 4, points: 0 },
  { red: 0, green: 1, blue: 0, white: 2, black: 2, bonusIndex: 0, points: 0 },
  { red: 2, green: 0, blue: 1, white: 0, black: 2, bonusIndex: 1, points: 0 },
  { red: 2, green: 2, blue: 0, white: 1, black: 0, bonusIndex: 2, points: 0 },
  { red: 0, green: 2, blue: 2, white: 0, black: 1, bonusIndex: 3, points: 0 },
  { red: 1, green: 0, blue: 2, white: 2, black: 0, bonusIndex: 4, points: 0 },
  { red: 1, green: 0, blue: 0, white: 1, black: 3, bonusIndex: 0, points: 0 },
  { red: 0, green: 1, blue: 3, white: 1, black: 0, bonusIndex: 1, points: 0 },
  { red: 1, green: 3, blue: 1, white: 0, black: 0, bonusIndex: 2, points: 0 },
  { red: 0, green: 0, blue: 1, white: 3, black: 1, bonusIndex: 3, points: 0 },
  { red: 3, green: 1, blue: 0, white: 0, black: 1, bonusIndex: 4, points: 0 },
  // Tier 2 (30)
  { red: 0, green: 0, blue: 0, white: 0, black: 5, bonusIndex: 0, points: 2 },
  { red: 0, green: 5, blue: 0, white: 0, black: 0, bonusIndex: 1, points: 2 },
  { red: 0, green: 0, blue: 5, white: 0, black: 0, bonusIndex: 2, points: 2 },
  { red: 5, green: 0, blue: 0, white: 0, black: 0, bonusIndex: 3, points: 2 },
  { red: 0, green: 0, blue: 0, white: 5, black: 0, bonusIndex: 4, points: 2 },
  { red: 6, green: 0, blue: 0, white: 0, black: 0, bonusIndex: 0, points: 3 },
  { red: 0, green: 6, blue: 0, white: 0, black: 0, bonusIndex: 1, points: 3 },
  { red: 0, green: 0, blue: 6, white: 0, black: 0, bonusIndex: 2, points: 3 },
  { red: 0, green: 0, blue: 0, white: 6, black: 0, bonusIndex: 3, points: 3 },
  { red: 0, green: 0, blue: 0, white: 0, black: 6, bonusIndex: 4, points: 3 },
  { red: 0, green: 0, blue: 0, white: 3, black: 5, bonusIndex: 0, points: 2 },
  { red: 0, green: 3, blue: 5, white: 0, black: 0, bonusIndex: 1, points: 2 },
  { red: 0, green: 0, blue: 3, white: 5, black: 0, bonusIndex: 2, points: 2 },
  { red: 5, green: 0, blue: 0, white: 0, black: 3, bonusIndex: 3, points: 2 },
  { red: 3, green: 5, blue: 0, white: 0, black: 0, bonusIndex: 4, points: 2 },
  { red: 0, green: 2, blue: 4, white: 1, black: 0, bonusIndex: 0, points: 2 },
  { red: 0, green: 0, blue: 2, white: 4, black: 1, bonusIndex: 1, points: 2 },
  { red: 1, green: 0, blue: 0, white: 2, black: 4, bonusIndex: 2, points: 2 },
  { red: 4, green: 1, blue: 0, white: 0, black: 2, bonusIndex: 3, points: 2 },
  { red: 2, green: 4, blue: 1, white: 0, black: 0, bonusIndex: 4, points: 2 },
  { red: 2, green: 0, blue: 0, white: 2, black: 3, bonusIndex: 0, points: 1 },
  { red: 0, green: 0, blue: 3, white: 2, black: 2, bonusIndex: 1, points: 1 },
  { red: 3, green: 2, blue: 2, white: 0, black: 0, bonusIndex: 2, points: 1 },
  { red: 2, green: 3, blue: 0, white: 0, black: 2, bonusIndex: 3, points: 1 },
  { red: 0, green: 2, blue: 2, white: 3, black: 0, bonusIndex: 4, points: 1 },
  { red: 2, green: 0, blue: 3, white: 0, black: 3, bonusIndex: 0, points: 1 },
  { red: 3, green: 2, blue: 0, white: 3, black: 0, bonusIndex: 1, points: 1 },
  { red: 0, green: 3, blue: 2, white: 0, black: 3, bonusIndex: 2, points: 1 },
  { red: 3, green: 0, blue: 3, white: 2, black: 0, bonusIndex: 3, points: 1 },
  { red: 0, green: 3, blue: 0, white: 3, black: 2, bonusIndex: 4, points: 1 },
  // Tier 3 (20)
  { red: 0, green: 7, blue: 0, white: 0, black: 0, bonusIndex: 0, points: 4 },
  { red: 0, green: 0, blue: 7, white: 0, black: 0, bonusIndex: 1, points: 4 },
  { red: 0, green: 0, blue: 0, white: 7, black: 0, bonusIndex: 2, points: 4 },
  { red: 0, green: 0, blue: 0, white: 0, black: 7, bonusIndex: 3, points: 4 },
  { red: 7, green: 0, blue: 0, white: 0, black: 0, bonusIndex: 4, points: 4 },
  { red: 3, green: 7, blue: 0, white: 0, black: 0, bonusIndex: 0, points: 5 },
  { red: 0, green: 3, blue: 7, white: 0, black: 0, bonusIndex: 1, points: 5 },
  { red: 0, green: 0, blue: 3, white: 7, black: 0, bonusIndex: 2, points: 5 },
  { red: 0, green: 0, blue: 0, white: 3, black: 7, bonusIndex: 3, points: 5 },
  { red: 7, green: 0, blue: 0, white: 0, black: 3, bonusIndex: 4, points: 5 },
  { red: 3, green: 6, blue: 3, white: 0, black: 0, bonusIndex: 0, points: 4 },
  { red: 0, green: 3, blue: 6, white: 3, black: 0, bonusIndex: 1, points: 4 },
  { red: 0, green: 0, blue: 3, white: 6, black: 3, bonusIndex: 2, points: 4 },
  { red: 3, green: 0, blue: 0, white: 3, black: 6, bonusIndex: 3, points: 4 },
  { red: 6, green: 3, blue: 0, white: 0, black: 3, bonusIndex: 4, points: 4 },
  { red: 0, green: 3, blue: 5, white: 3, black: 3, bonusIndex: 0, points: 3 },
  { red: 3, green: 0, blue: 3, white: 5, black: 3, bonusIndex: 1, points: 3 },
  { red: 3, green: 3, blue: 0, white: 3, black: 5, bonusIndex: 2, points: 3 },
  { red: 5, green: 3, blue: 3, white: 0, black: 3, bonusIndex: 3, points: 3 },
  { red: 3, green: 5, blue: 3, white: 3, black: 0, bonusIndex: 4, points: 3 }
];

function costFromRow(row: RawCardRow): SplendorGemCost {
  const cost: SplendorGemCost = {};
  if (row.white > 0) cost.white = row.white;
  if (row.blue > 0) cost.blue = row.blue;
  if (row.green > 0) cost.green = row.green;
  if (row.red > 0) cost.red = row.red;
  if (row.black > 0) cost.black = row.black;
  return cost;
}

function buildCards(): SplendorCardDef[] {
  return RAW_CARDS.map((row, index) => {
    const tier: SplendorTier = index < 40 ? 1 : index < 70 ? 2 : 3;
    const bonus = BONUS_BY_INDEX[row.bonusIndex]!;
    return {
      id: `d${tier}-${String(index + 1).padStart(2, "0")}`,
      tier,
      bonus,
      prestige: row.points,
      cost: costFromRow(row)
    };
  });
}

export const SPLENDOR_CARDS: readonly SplendorCardDef[] = buildCards();

export const SPLENDOR_CARDS_BY_ID: ReadonlyMap<string, SplendorCardDef> = new Map(
  SPLENDOR_CARDS.map((card) => [card.id, card])
);

export const SPLENDOR_CARDS_BY_TIER: Record<SplendorTier, readonly SplendorCardDef[]> = {
  1: SPLENDOR_CARDS.filter((c) => c.tier === 1),
  2: SPLENDOR_CARDS.filter((c) => c.tier === 2),
  3: SPLENDOR_CARDS.filter((c) => c.tier === 3)
};

export const SPLENDOR_NOBLES: readonly SplendorNobleDef[] = [
  { id: "noble-mary", name: "Mary Stuart", prestige: 3, requirements: { green: 4, red: 4 } },
  { id: "noble-machiavelli", name: "Machiavelli", prestige: 3, requirements: { white: 4, blue: 4 } },
  { id: "noble-isabella", name: "Isabella of Castile", prestige: 3, requirements: { black: 4, white: 4 } },
  { id: "noble-suleiman", name: "Suleiman", prestige: 3, requirements: { green: 4, blue: 4 } },
  { id: "noble-henry", name: "Henry VIII", prestige: 3, requirements: { black: 4, green: 4 } },
  { id: "noble-charles", name: "Charles V", prestige: 3, requirements: { black: 3, red: 3, white: 3 } },
  { id: "noble-catherine", name: "Catherine de Medici", prestige: 3, requirements: { green: 3, red: 3, blue: 3 } },
  { id: "noble-anne", name: "Anne of Brittany", prestige: 3, requirements: { green: 3, white: 3, blue: 3 } },
  { id: "noble-elisabeth", name: "Elisabeth of Austria", prestige: 3, requirements: { white: 3, black: 3, blue: 3 } },
  { id: "noble-francis", name: "Francis I", prestige: 3, requirements: { green: 3, black: 3, red: 3 } }
];

export const SPLENDOR_NOBLES_BY_ID: ReadonlyMap<string, SplendorNobleDef> = new Map(
  SPLENDOR_NOBLES.map((noble) => [noble.id, noble])
);

export function getSplendorCard(id: string): SplendorCardDef | undefined {
  return SPLENDOR_CARDS_BY_ID.get(id);
}

export function getSplendorNoble(id: string): SplendorNobleDef | undefined {
  return SPLENDOR_NOBLES_BY_ID.get(id);
}

export function emptyGemCounts(): Record<SplendorGemColor, number> {
  return { white: 0, blue: 0, green: 0, red: 0, black: 0 };
}

export function emptyTokenCounts(): Record<SplendorTokenColor, number> {
  return { white: 0, blue: 0, green: 0, red: 0, black: 0, gold: 0 };
}

export function totalTokens(tokens: Record<SplendorTokenColor, number>): number {
  return SPLENDOR_TOKEN_COLORS.reduce((sum, color) => sum + (tokens[color] ?? 0), 0);
}

export function gemSupplyForPlayerCount(playerCount: number): number {
  if (playerCount < SPLENDOR_MIN_PLAYERS || playerCount > SPLENDOR_MAX_PLAYERS) {
    throw new Error("Splendor supports 2 to 6 players.");
  }
  const base =
    playerCount === 2 ? 4 : playerCount === 3 ? 5 : 7;
  const extraPlayers = Math.max(0, playerCount - 4);
  return base + extraPlayers * 2;
}

export function goldSupplyForPlayerCount(playerCount: number): number {
  if (playerCount < SPLENDOR_MIN_PLAYERS || playerCount > SPLENDOR_MAX_PLAYERS) {
    throw new Error("Splendor supports 2 to 6 players.");
  }
  return SPLENDOR_GOLD_SUPPLY + Math.max(0, playerCount - 4);
}

export function marketSlotsForPlayerCount(playerCount: number): number {
  if (playerCount < SPLENDOR_MIN_PLAYERS || playerCount > SPLENDOR_MAX_PLAYERS) {
    throw new Error("Splendor supports 2 to 6 players.");
  }
  return playerCount >= SPLENDOR_LARGE_TABLE_PLAYER_COUNT
    ? SPLENDOR_MARKET_SLOTS_LARGE
    : SPLENDOR_MARKET_SLOTS;
}

export function prestigeToEndForPlayerCount(playerCount: number): number {
  if (playerCount < SPLENDOR_MIN_PLAYERS || playerCount > SPLENDOR_MAX_PLAYERS) {
    throw new Error("Splendor supports 2 to 6 players.");
  }
  return playerCount >= SPLENDOR_LARGE_TABLE_PLAYER_COUNT
    ? SPLENDOR_PRESTIGE_TO_END_LARGE
    : SPLENDOR_PRESTIGE_TO_END;
}

export function nobleCountForPlayerCount(playerCount: number): number {
  return playerCount + 1;
}
