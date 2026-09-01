import {
  BIRTHDAY_PAYMENT,
  DEBT_COLLECTOR_PAYMENT,
  HOTEL_BONUS,
  HOUSE_BONUS,
  MONOPOLY_DEAL_SETS_TO_WIN,
  PROPERTY_RENT_TABLES,
  PROPERTY_SET_SIZES,
  PROPERTY_COLORS,
  type MonopolyDealCardDef,
  type PropertyColor,
  canBankCard,
  getCardDef,
  isPropertyCard,
  supportsHouseHotel
} from "./monopolyDealData";

export type MonopolyDealCardInstance = {
  id: string;
  defId: string;
};

export type PlacedPropertyCard = {
  instanceId: string;
  defId: string;
  /** Active color for wild cards. */
  activeColor: PropertyColor;
};

export type PropertySetState = {
  cards: PlacedPropertyCard[];
  house: boolean;
  hotel: boolean;
};

export type PropertySetsStorage = Partial<Record<PropertyColor, PropertySetState | PropertySetState[]>>;

export type PlayerBoard = {
  bank: MonopolyDealCardInstance[];
  propertySets: PropertySetsStorage;
};

export function emptyPropertySets(): PropertySetsStorage {
  return {};
}

function cloneSet(set: PropertySetState): PropertySetState {
  return {
    cards: set.cards.map((c) => ({ ...c })),
    house: set.house,
    hotel: set.hotel
  };
}

export function normalizeColorSets(entry: PropertySetState | PropertySetState[] | undefined): PropertySetState[] {
  if (!entry) {
    return [];
  }
  return (Array.isArray(entry) ? entry : [entry]).map(cloneSet);
}

export function getColorSets(board: PlayerBoard, color: PropertyColor): PropertySetState[] {
  return normalizeColorSets(board.propertySets[color]);
}

export function mutableColorSets(board: PlayerBoard, color: PropertyColor): PropertySetState[] {
  const entry = board.propertySets[color];
  if (!entry) {
    const created: PropertySetState[] = [];
    board.propertySets[color] = created;
    return created;
  }
  if (Array.isArray(entry)) {
    return entry;
  }
  const sets = [entry];
  board.propertySets[color] = sets;
  return sets;
}

export function setColorSets(board: PlayerBoard, color: PropertyColor, sets: PropertySetState[]): void {
  if (sets.length === 0) {
    delete board.propertySets[color];
    return;
  }
  board.propertySets[color] = sets.length === 1 ? sets[0]! : sets;
  compactColorStorage(board, color);
}

export function placementSetForColor(board: PlayerBoard, color: PropertyColor): PropertySetState {
  const sets = mutableColorSets(board, color);
  const incomplete = sets.find((set) => !isSetComplete(set, color));
  if (incomplete) {
    return incomplete;
  }
  const next = { cards: [], house: false, hotel: false };
  sets.push(next);
  return next;
}

export function removePlacedCard(
  board: PlayerBoard,
  instanceId: string
): PlacedPropertyCard {
  for (const color of PROPERTY_COLORS) {
    const sets = mutableColorSets(board, color);
    for (let setIndex = 0; setIndex < sets.length; setIndex += 1) {
      const set = sets[setIndex]!;
      const idx = set.cards.findIndex((c) => c.instanceId === instanceId);
      if (idx >= 0) {
        const placed = set.cards.splice(idx, 1)[0]!;
        if (set.cards.length === 0) {
          sets.splice(setIndex, 1);
        }
        if (sets.length === 0) {
          delete board.propertySets[color];
        } else {
          compactColorStorage(board, color);
        }
        return placed;
      }
    }
  }
  throw new Error("Property not found.");
}

export function totalCardsForColor(board: PlayerBoard, color: PropertyColor): number {
  return getColorSets(board, color).reduce((sum, set) => sum + set.cards.length, 0);
}

export function findPlacedCard(
  board: PlayerBoard,
  instanceId: string
): { color: PropertyColor; setIndex: number; card: PlacedPropertyCard } | null {
  for (const color of PROPERTY_COLORS) {
    const sets = getColorSets(board, color);
    for (let setIndex = 0; setIndex < sets.length; setIndex += 1) {
      const card = sets[setIndex]!.cards.find((c) => c.instanceId === instanceId);
      if (card) {
        return { color, setIndex, card: { ...card } };
      }
    }
  }
  return null;
}

export function isCardInCompleteSet(board: PlayerBoard, instanceId: string): boolean {
  const found = findPlacedCard(board, instanceId);
  if (!found) {
    return false;
  }
  const set = getColorSets(board, found.color)[found.setIndex];
  return Boolean(set && isSetComplete(set, found.color));
}

export function compactColorStorage(board: PlayerBoard, color: PropertyColor): void {
  const entry = board.propertySets[color];
  if (!entry) {
    return;
  }
  const size = PROPERTY_SET_SIZES[color];
  const sets = mutableColorSets(board, color).filter((set) => set.cards.length > 0);
  const complete = sets.filter((set) => isSetComplete(set, color));
  const incomplete = sets.filter((set) => !isSetComplete(set, color));
  const packed: PropertySetState[] = complete.map((set) => ({
    cards: set.cards,
    house: set.house,
    hotel: set.hotel
  }));
  if (incomplete.length === 1) {
    packed.push({
      cards: incomplete[0]!.cards,
      house: incomplete[0]!.house,
      hotel: incomplete[0]!.hotel
    });
  } else if (incomplete.length > 1) {
    const pool = incomplete.flatMap((set) => [...set.cards]);
    let house = incomplete.some((set) => set.house);
    let hotel = incomplete.some((set) => set.hotel);
    while (pool.length >= size) {
      packed.push({
        cards: pool.splice(0, size),
        house,
        hotel
      });
      house = false;
      hotel = false;
    }
    if (pool.length > 0) {
      packed.push({ cards: pool, house, hotel });
    }
  }
  if (packed.length === 0) {
    delete board.propertySets[color];
    return;
  }
  board.propertySets[color] = packed.length === 1 ? packed[0]! : packed;
}

export function placeCardOnColor(board: PlayerBoard, placed: PlacedPropertyCard): void {
  const set = placementSetForColor(board, placed.activeColor);
  set.cards.push(placed);
  compactColorStorage(board, placed.activeColor);
}

export function getSet(board: PlayerBoard, color: PropertyColor): PropertySetState {
  const sets = getColorSets(board, color);
  return {
    cards: sets.flatMap((set) => set.cards),
    house: sets.some((set) => set.house),
    hotel: sets.some((set) => set.hotel)
  };
}

export function countCardsInSet(set: PropertySetState): number {
  return set.cards.length;
}

export function hasStandardPropertyInSet(set: PropertySetState): boolean {
  return set.cards.some((c) => getCardDef(c.defId).kind === "property");
}

export function isSetComplete(set: PropertySetState, color: PropertyColor): boolean {
  return set.cards.length >= PROPERTY_SET_SIZES[color];
}

export function countCompleteSets(board: PlayerBoard): number {
  let count = 0;
  for (const color of PROPERTY_COLORS) {
    for (const set of getColorSets(board, color)) {
      if (isSetComplete(set, color)) {
        count += 1;
      }
    }
  }
  return count;
}

export function completePropertySetColors(board: PlayerBoard): PropertyColor[] {
  const colors: PropertyColor[] = [];
  for (const color of PROPERTY_COLORS) {
    if (getColorSets(board, color).some((set) => isSetComplete(set, color))) {
      colors.push(color);
    }
  }
  return colors;
}

export function hasWon(board: PlayerBoard): boolean {
  return countCompleteSets(board) >= MONOPOLY_DEAL_SETS_TO_WIN;
}

export function calculateRent(
  board: PlayerBoard,
  color: PropertyColor,
  cardCount?: number
): number {
  const sets = getColorSets(board, color);
  const count = cardCount ?? totalCardsForColor(board, color);
  if (count < 1) {
    return 0;
  }
  const table = PROPERTY_RENT_TABLES[color];
  const idx = Math.min(count, table.length) - 1;
  let rent = table[idx] ?? 0;
  if (supportsHouseHotel(color)) {
    for (const set of sets) {
      if (isSetComplete(set, color)) {
        if (set.house) {
          rent += HOUSE_BONUS;
        }
        if (set.hotel) {
          rent += HOTEL_BONUS;
        }
      }
    }
  }
  return rent;
}

export function cardMonetaryValue(def: MonopolyDealCardDef): number {
  return def.value;
}

export function totalBankValue(bank: MonopolyDealCardInstance[]): number {
  return bank.reduce((sum, c) => sum + cardMonetaryValue(getCardDef(c.defId)), 0);
}

export function canLayAsProperty(def: MonopolyDealCardDef): boolean {
  return isPropertyCard(def);
}

export function wildColorsForDef(def: MonopolyDealCardDef): PropertyColor[] {
  if (def.kind === "property") {
    return def.color ? [def.color] : [];
  }
  if (def.kind === "propertyWildDual" && def.colors) {
    return [...def.colors];
  }
  if (def.kind === "propertyWildMulti") {
    return [];
  }
  return [];
}

export function canLayWildOnColor(def: MonopolyDealCardDef, color: PropertyColor): boolean {
  if (def.kind === "property") {
    return def.color === color;
  }
  if (def.kind === "propertyWildDual" && def.colors) {
    return def.colors.includes(color);
  }
  if (def.kind === "propertyWildMulti") {
    return true;
  }
  return false;
}

export function defaultWildColor(def: MonopolyDealCardDef): PropertyColor | null {
  if (def.kind === "property" && def.color) {
    return def.color;
  }
  if (def.kind === "propertyWildDual" && def.colors?.[0]) {
    return def.colors[0];
  }
  return null;
}

export function canStealWithSlyDeal(set: PropertySetState, color: PropertyColor): boolean {
  if (set.cards.length === 0) {
    return false;
  }
  return !isSetComplete(set, color);
}

export function canStealWithDealBreaker(set: PropertySetState, color: PropertyColor): boolean {
  return isSetComplete(set, color);
}

export function canAddHouse(set: PropertySetState, color: PropertyColor): boolean {
  return isSetComplete(set, color) && supportsHouseHotel(color) && !set.house;
}

export function canAddHotel(set: PropertySetState, color: PropertyColor): boolean {
  return isSetComplete(set, color) && supportsHouseHotel(color) && set.house && !set.hotel;
}

export type StrippedSetBuilding = {
  color: PropertyColor;
  house: boolean;
  hotel: boolean;
};

/** Remove house/hotel from any incomplete set. Buildings on complete sets are left in place. */
export function stripBuildingsFromIncompleteSets(board: PlayerBoard): StrippedSetBuilding[] {
  const stripped: StrippedSetBuilding[] = [];
  for (const color of PROPERTY_COLORS) {
    const sets = mutableColorSets(board, color);
    for (const set of sets) {
      if (!isSetComplete(set, color) && (set.house || set.hotel)) {
        stripped.push({ color, house: set.house, hotel: set.hotel });
        set.house = false;
        set.hotel = false;
      }
    }
    compactColorStorage(board, color);
  }
  return stripped;
}

export type PaymentCardRef = {
  zone: "bank" | "property";
  instanceId: string;
  propertyColor?: PropertyColor;
};

export function paymentValue(ref: PaymentCardRef, board: PlayerBoard): number {
  if (ref.zone === "bank") {
    const card = board.bank.find((c) => c.id === ref.instanceId);
    if (!card) {
      return 0;
    }
    return cardMonetaryValue(getCardDef(card.defId));
  }
  if (ref.zone === "property" && ref.propertyColor) {
    const placed = findPlacedCard(board, ref.instanceId)?.card;
    if (!placed) {
      return 0;
    }
    return cardMonetaryValue(getCardDef(placed.defId));
  }
  return 0;
}

export function rentableColors(board: PlayerBoard, colors: readonly PropertyColor[]): PropertyColor[] {
  return colors.filter((color) => totalCardsForColor(board, color) > 0);
}

export function hasHouseEligibleSet(board: PlayerBoard, color: PropertyColor): boolean {
  return supportsHouseHotel(color) && getColorSets(board, color).some((set) => canAddHouse(set, color));
}

export function hasHotelEligibleSet(board: PlayerBoard, color: PropertyColor): boolean {
  return supportsHouseHotel(color) && getColorSets(board, color).some((set) => canAddHotel(set, color));
}

export function hasAnyPropertyCards(board: PlayerBoard): boolean {
  return PROPERTY_COLORS.some((color) => totalCardsForColor(board, color) > 0);
}

export function isWildPropertyDef(def: MonopolyDealCardDef): boolean {
  return def.kind === "propertyWildDual" || def.kind === "propertyWildMulti";
}

function paymentRefKey(ref: PaymentCardRef): string {
  return `${ref.zone}:${ref.propertyColor ?? ""}:${ref.instanceId}`;
}

export function requiredPaymentRefs(board: PlayerBoard): PaymentCardRef[] {
  const refs: PaymentCardRef[] = board.bank.map((card) => ({ zone: "bank" as const, instanceId: card.id }));
  for (const color of PROPERTY_COLORS) {
    for (const set of getColorSets(board, color)) {
      for (const card of set.cards) {
        if (!isWildPropertyDef(getCardDef(card.defId))) {
          refs.push({ zone: "property", instanceId: card.instanceId, propertyColor: color });
        }
      }
    }
  }
  return refs;
}

export function hasSelectedAllRequiredPayment(board: PlayerBoard, refs: PaymentCardRef[]): boolean {
  return requiredPaymentRefs(board).every((req) => refs.some((ref) => paymentRefKey(ref) === paymentRefKey(req)));
}

export function hasPayableAssets(board: PlayerBoard): boolean {
  return requiredPaymentRefs(board).length > 0;
}

export function allBankCardsSelected(board: PlayerBoard, refs: PaymentCardRef[]): boolean {
  if (board.bank.length === 0) {
    return true;
  }
  return board.bank.every((card) => refs.some((ref) => ref.zone === "bank" && ref.instanceId === card.id));
}

export function paymentSelectionTotal(refs: PaymentCardRef[], board: PlayerBoard): number {
  return refs.reduce((sum, ref) => sum + paymentValue(ref, board), 0);
}

export function canTogglePaymentRef(
  amountDue: number,
  refs: PaymentCardRef[],
  board: PlayerBoard,
  ref: PaymentCardRef
): boolean {
  const key = paymentRefKey(ref);
  const isSelected = refs.some((r) => paymentRefKey(r) === key);
  if (isSelected) {
    return true;
  }
  if (paymentSelectionTotal(refs, board) >= amountDue) {
    return false;
  }
  if (ref.zone === "bank") {
    return true;
  }
  if (!allBankCardsSelected(board, refs)) {
    return false;
  }
  return paymentSelectionTotal(refs, board) < amountDue;
}

export function validatePayment(
  amountDue: number,
  refs: PaymentCardRef[],
  board: PlayerBoard
): { ok: true; total: number } | { ok: false; reason: string } {
  if (amountDue <= 0) {
    return { ok: true, total: 0 };
  }
  if (refs.some((ref) => ref.zone === "property") && !allBankCardsSelected(board, refs)) {
    return { ok: false, reason: "Select all money in your bank before using properties." };
  }
  const seen = new Set<string>();
  let total = 0;
  for (const ref of refs) {
    const key = paymentRefKey(ref);
    if (seen.has(key)) {
      return { ok: false, reason: "Duplicate payment card." };
    }
    seen.add(key);
    const val = paymentValue(ref, board);
    if (val <= 0) {
      return { ok: false, reason: "Invalid payment card." };
    }
    total += val;
  }
  if (total < amountDue && !hasSelectedAllRequiredPayment(board, refs)) {
    return { ok: false, reason: `Payment of ${total}M is less than ${amountDue}M due.` };
  }
  return { ok: true, total };
}

export function getBirthdayPaymentAmount(): number {
  return BIRTHDAY_PAYMENT;
}

export function getDebtCollectorPaymentAmount(): number {
  return DEBT_COLLECTOR_PAYMENT;
}

export function canPlayAsAction(def: MonopolyDealCardDef): boolean {
  if (def.kind === "rent") {
    return true;
  }
  if (def.kind !== "action") {
    return false;
  }
  return def.action !== "justSayNo" && def.action !== "doubleTheRent";
}

export function assertBankable(def: MonopolyDealCardDef): void {
  if (!canBankCard(def)) {
    throw new Error(`${def.name} cannot be banked.`);
  }
}
