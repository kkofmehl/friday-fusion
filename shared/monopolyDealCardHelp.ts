import { PROPERTY_COLOR_LABELS, type MonopolyDealCardDef, type PropertyColor } from "./monopolyDealData";

export function formatMillions(value: number): string {
  return `${value}M`;
}

const colorList = (colors: readonly PropertyColor[]): string =>
  colors.map((c) => PROPERTY_COLOR_LABELS[c]).join(" or ");

export function getCardHelpText(def: MonopolyDealCardDef): string {
  if (def.kind === "money") {
    return `Bank for ${formatMillions(def.value)}. Money cards can only go in your bank.`;
  }
  if (def.kind === "property" && def.color) {
    return `Lay in your property area as ${PROPERTY_COLOR_LABELS[def.color]}. Charge rent based on how many you own in that color.`;
  }
  if (def.kind === "propertyWildDual" && def.colors) {
    return `Wild property — use as ${colorList(def.colors)}. Flip or move it during your turn (costs 1 play).`;
  }
  if (def.kind === "propertyWildMulti") {
    return "Wild property — use as any color. Moving it between sets costs 1 play. Cannot be banked.";
  }
  if (def.kind === "rent" && def.colors) {
    if (def.colors.length > 2) {
      return "Charge one player rent on any of your property sets.";
    }
    return `Charge all other players rent on your ${colorList(def.colors)} properties.`;
  }
  switch (def.action) {
    case "passGo":
      return "Draw 2 cards immediately. Can also be banked for 1M.";
    case "itsMyBirthday":
      return "Each other player pays you 2M. Can be banked for 2M.";
    case "debtCollector":
      return "One player of your choice pays you 5M. Can be banked for 3M.";
    case "slyDeal":
      return "Steal one property from any player (not from a complete set). Can be banked for 3M.";
    case "forcedDeal":
      return "Swap one of your properties with one from another player. Can be banked for 3M.";
    case "dealBreaker":
      return "Steal a complete property set from any player. Can be banked for 5M.";
    case "house":
      return "Add to a complete set (not Railroad/Utility). Adds +3M to rent. Can be banked for 3M.";
    case "hotel":
      return "Add to a complete set that has a House. Adds +4M to rent. Can be banked for 4M.";
    case "doubleTheRent":
      return "Play with a Rent card to double the rent charged. Can be banked for 1M.";
    case "justSayNo":
      return "Cancel an action played against you. Can be countered with another Just Say No.";
    default:
      return def.name;
  }
}
