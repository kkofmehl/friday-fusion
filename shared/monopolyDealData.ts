import { z } from "zod";

export const MONOPOLY_DEAL_DECK_SIZE = 106;
export const MONOPOLY_DEAL_STARTING_HAND = 5;
export const MONOPOLY_DEAL_DRAW_PER_TURN = 2;
export const MONOPOLY_DEAL_EMPTY_HAND_DRAW = 5;
export const MONOPOLY_DEAL_PLAYS_PER_TURN = 3;
export const MONOPOLY_DEAL_MAX_HAND = 7;
export const MONOPOLY_DEAL_SETS_TO_WIN = 3;
export const MONOPOLY_DEAL_MIN_WAGER = 1;

export const propertyColorSchema = z.enum([
  "brown",
  "lightBlue",
  "pink",
  "orange",
  "red",
  "yellow",
  "green",
  "darkBlue",
  "railroad",
  "utility"
]);
export type PropertyColor = z.infer<typeof propertyColorSchema>;

export const PROPERTY_COLORS: readonly PropertyColor[] = [
  "brown",
  "lightBlue",
  "pink",
  "orange",
  "red",
  "yellow",
  "green",
  "darkBlue",
  "railroad",
  "utility"
] as const;

export const PROPERTY_SET_SIZES: Record<PropertyColor, number> = {
  brown: 2,
  lightBlue: 3,
  pink: 3,
  orange: 3,
  red: 3,
  yellow: 3,
  green: 3,
  darkBlue: 2,
  railroad: 4,
  utility: 2
};

/** Rent by number of cards owned in the set (index 0 = 1 card). */
export const PROPERTY_RENT_TABLES: Record<PropertyColor, readonly number[]> = {
  brown: [1, 2],
  lightBlue: [1, 2, 3],
  pink: [1, 2, 4],
  orange: [1, 3, 5],
  red: [2, 3, 6],
  yellow: [2, 4, 6],
  green: [2, 4, 7],
  darkBlue: [3, 8],
  railroad: [1, 2, 3, 4],
  utility: [1, 2]
};

export const PROPERTY_COLOR_LABELS: Record<PropertyColor, string> = {
  brown: "Brown",
  lightBlue: "Light Blue",
  pink: "Pink",
  orange: "Orange",
  red: "Red",
  yellow: "Yellow",
  green: "Green",
  darkBlue: "Dark Blue",
  railroad: "Railroad",
  utility: "Utility"
};

export const PROPERTY_COLOR_HEX: Record<PropertyColor, string> = {
  brown: "#6B3A2A",
  lightBlue: "#87CEEB",
  pink: "#FF69B4",
  orange: "#FF8C00",
  red: "#E31837",
  yellow: "#FFD700",
  green: "#00843D",
  darkBlue: "#003087",
  railroad: "#1A1A1A",
  utility: "#90EE90"
};

export const actionTypeSchema = z.enum([
  "dealBreaker",
  "justSayNo",
  "slyDeal",
  "forcedDeal",
  "debtCollector",
  "itsMyBirthday",
  "passGo",
  "house",
  "hotel",
  "doubleTheRent"
]);
export type ActionType = z.infer<typeof actionTypeSchema>;

export const cardKindSchema = z.enum([
  "money",
  "property",
  "propertyWildDual",
  "propertyWildMulti",
  "action",
  "rent"
]);
export type CardKind = z.infer<typeof cardKindSchema>;

export type MonopolyDealCardDef = {
  defId: string;
  kind: CardKind;
  name: string;
  /** Monetary value when banked (0 = not bankable as money for multi-wild). */
  value: number;
  color?: PropertyColor;
  colors?: readonly PropertyColor[];
  action?: ActionType;
  propertyName?: string;
};

const prop = (
  defId: string,
  color: PropertyColor,
  propertyName: string,
  value: number
): MonopolyDealCardDef => ({
  defId,
  kind: "property",
  name: propertyName,
  value,
  color,
  propertyName
});

const dualWild = (
  defId: string,
  colors: readonly [PropertyColor, PropertyColor],
  value: number
): MonopolyDealCardDef => ({
  defId,
  kind: "propertyWildDual",
  name: "Property Wild Card",
  value,
  colors
});

const money = (defId: string, value: number): MonopolyDealCardDef => ({
  defId,
  kind: "money",
  name: `$${value}M`,
  value
});

const action = (defId: string, actionType: ActionType, name: string, value: number): MonopolyDealCardDef => ({
  defId,
  kind: "action",
  name,
  value,
  action: actionType
});

const rent = (
  defId: string,
  name: string,
  colors: readonly PropertyColor[],
  value: number
): MonopolyDealCardDef => ({
  defId,
  kind: "rent",
  name,
  value,
  colors
});

/** Static registry of all 106 playable card definitions. */
export const MONOPOLY_DEAL_CARD_DEFS: readonly MonopolyDealCardDef[] = [
  // Money — 20
  ...Array.from({ length: 6 }, (_, i) => money(`money-1m-${i}`, 1)),
  ...Array.from({ length: 5 }, (_, i) => money(`money-2m-${i}`, 2)),
  ...Array.from({ length: 3 }, (_, i) => money(`money-3m-${i}`, 3)),
  ...Array.from({ length: 3 }, (_, i) => money(`money-4m-${i}`, 4)),
  ...Array.from({ length: 2 }, (_, i) => money(`money-5m-${i}`, 5)),
  money("money-10m-0", 10),

  // Property — 28
  prop("prop-brown-mediterranean", "brown", "Mediterranean Ave", 1),
  prop("prop-brown-baltic", "brown", "Baltic Ave", 1),
  prop("prop-lightBlue-oriental", "lightBlue", "Oriental Ave", 1),
  prop("prop-lightBlue-vermont", "lightBlue", "Vermont Ave", 1),
  prop("prop-lightBlue-connecticut", "lightBlue", "Connecticut Ave", 1),
  prop("prop-pink-stcharles", "pink", "St. Charles Place", 2),
  prop("prop-pink-states", "pink", "States Ave", 2),
  prop("prop-pink-virginia", "pink", "Virginia Ave", 2),
  prop("prop-orange-stjames", "orange", "St. James Place", 2),
  prop("prop-orange-tennessee", "orange", "Tennessee Ave", 2),
  prop("prop-orange-newyork", "orange", "New York Ave", 2),
  prop("prop-red-kentucky", "red", "Kentucky Ave", 3),
  prop("prop-red-indiana", "red", "Indiana Ave", 3),
  prop("prop-red-illinois", "red", "Illinois Ave", 3),
  prop("prop-yellow-atlantic", "yellow", "Atlantic Ave", 3),
  prop("prop-yellow-ventnor", "yellow", "Ventnor Ave", 3),
  prop("prop-yellow-marvin", "yellow", "Marvin Gardens", 3),
  prop("prop-green-pacific", "green", "Pacific Ave", 4),
  prop("prop-green-northcarolina", "green", "North Carolina Ave", 4),
  prop("prop-green-pennsylvania", "green", "Pennsylvania Ave", 4),
  prop("prop-darkBlue-parkplace", "darkBlue", "Park Place", 4),
  prop("prop-darkBlue-boardwalk", "darkBlue", "Boardwalk", 4),
  prop("prop-railroad-reading", "railroad", "Reading Railroad", 2),
  prop("prop-railroad-pennsylvania", "railroad", "Pennsylvania Railroad", 2),
  prop("prop-railroad-bo", "railroad", "B&O Railroad", 2),
  prop("prop-railroad-short", "railroad", "Short Line", 2),
  prop("prop-utility-electric", "utility", "Electric Company", 2),
  prop("prop-utility-water", "utility", "Water Works", 2),

  // Property wildcards — 11
  dualWild("wild-brown-lightBlue", ["brown", "lightBlue"], 1),
  dualWild("wild-pink-orange-0", ["pink", "orange"], 2),
  dualWild("wild-pink-orange-1", ["pink", "orange"], 2),
  dualWild("wild-red-yellow-0", ["red", "yellow"], 3),
  dualWild("wild-red-yellow-1", ["red", "yellow"], 3),
  dualWild("wild-green-darkBlue", ["green", "darkBlue"], 4),
  dualWild("wild-railroad-green", ["railroad", "green"], 2),
  dualWild("wild-utility-railroad", ["utility", "railroad"], 2),
  dualWild("wild-lightBlue-railroad", ["lightBlue", "railroad"], 1),
  {
    defId: "wild-multi-0",
    kind: "propertyWildMulti",
    name: "Property Wild Card",
    value: 0
  },
  {
    defId: "wild-multi-1",
    kind: "propertyWildMulti",
    name: "Property Wild Card",
    value: 0
  },

  // Rent — 13
  rent("rent-brown-lightBlue-0", "Brown / Light Blue Rent", ["brown", "lightBlue"], 1),
  rent("rent-brown-lightBlue-1", "Brown / Light Blue Rent", ["brown", "lightBlue"], 1),
  rent("rent-pink-orange-0", "Pink / Orange Rent", ["pink", "orange"], 2),
  rent("rent-pink-orange-1", "Pink / Orange Rent", ["pink", "orange"], 2),
  rent("rent-red-yellow-0", "Red / Yellow Rent", ["red", "yellow"], 3),
  rent("rent-red-yellow-1", "Red / Yellow Rent", ["red", "yellow"], 3),
  rent("rent-green-darkBlue-0", "Green / Dark Blue Rent", ["green", "darkBlue"], 3),
  rent("rent-green-darkBlue-1", "Green / Dark Blue Rent", ["green", "darkBlue"], 3),
  rent("rent-railroad-utility-0", "Railroad / Utility Rent", ["railroad", "utility"], 2),
  rent("rent-railroad-utility-1", "Railroad / Utility Rent", ["railroad", "utility"], 2),
  rent("rent-wild-0", "Wild Rent", [...PROPERTY_COLORS], 3),
  rent("rent-wild-1", "Wild Rent", [...PROPERTY_COLORS], 3),
  rent("rent-wild-2", "Wild Rent", [...PROPERTY_COLORS], 3),

  // Actions — 34
  ...Array.from({ length: 2 }, (_, i) => action(`action-dealBreaker-${i}`, "dealBreaker", "Deal Breaker", 5)),
  ...Array.from({ length: 3 }, (_, i) => action(`action-justSayNo-${i}`, "justSayNo", "Just Say No", 4)),
  ...Array.from({ length: 3 }, (_, i) => action(`action-slyDeal-${i}`, "slyDeal", "Sly Deal", 3)),
  ...Array.from({ length: 3 }, (_, i) => action(`action-forcedDeal-${i}`, "forcedDeal", "Forced Deal", 3)),
  ...Array.from({ length: 3 }, (_, i) => action(`action-debtCollector-${i}`, "debtCollector", "Debt Collector", 3)),
  ...Array.from({ length: 3 }, (_, i) => action(`action-itsMyBirthday-${i}`, "itsMyBirthday", "It's My Birthday", 2)),
  ...Array.from({ length: 10 }, (_, i) => action(`action-passGo-${i}`, "passGo", "Pass Go", 1)),
  ...Array.from({ length: 3 }, (_, i) => action(`action-house-${i}`, "house", "House", 3)),
  ...Array.from({ length: 2 }, (_, i) => action(`action-hotel-${i}`, "hotel", "Hotel", 4)),
  ...Array.from({ length: 2 }, (_, i) => action(`action-doubleTheRent-${i}`, "doubleTheRent", "Double the Rent", 1))
];

const defById = new Map(MONOPOLY_DEAL_CARD_DEFS.map((d) => [d.defId, d]));

export function getCardDef(defId: string): MonopolyDealCardDef {
  const def = defById.get(defId);
  if (!def) {
    throw new Error(`Unknown Monopoly Deal card def: ${defId}`);
  }
  return def;
}

export function canBankCard(def: MonopolyDealCardDef): boolean {
  if (def.kind === "property" || def.kind === "propertyWildMulti") {
    return false;
  }
  return def.value > 0;
}

export function isPropertyCard(def: MonopolyDealCardDef): boolean {
  return def.kind === "property" || def.kind === "propertyWildDual" || def.kind === "propertyWildMulti";
}

export function supportsHouseHotel(color: PropertyColor): boolean {
  return color !== "railroad" && color !== "utility";
}

export const ACTION_BANK_VALUES: Partial<Record<ActionType, number>> = {
  dealBreaker: 5,
  justSayNo: 4,
  slyDeal: 3,
  forcedDeal: 3,
  debtCollector: 3,
  itsMyBirthday: 2,
  passGo: 1,
  house: 3,
  hotel: 4,
  doubleTheRent: 1
};

export const BIRTHDAY_PAYMENT = 2;
export const DEBT_COLLECTOR_PAYMENT = 5;
export const HOUSE_BONUS = 3;
export const HOTEL_BONUS = 4;
