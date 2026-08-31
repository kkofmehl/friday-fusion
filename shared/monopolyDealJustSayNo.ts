import type { MonopolyDealPendingAction } from "./contracts";
import { PROPERTY_COLOR_LABELS } from "./monopolyDealData";

export function justSayNoPrimaryTargetId(action: MonopolyDealPendingAction): string | undefined {
  return action.targetId;
}

function colorLabel(color: string | undefined): string {
  return color ? (PROPERTY_COLOR_LABELS[color as keyof typeof PROPERTY_COLOR_LABELS] ?? color) : "property";
}

export function justSayNoActionLabel(action: MonopolyDealPendingAction): string {
  switch (action.type) {
    case "dealBreaker":
      return "Deal Breaker";
    case "slyDeal":
      return "Sly Deal";
    case "forcedDeal":
      return "Forced Deal";
    case "debtCollector":
      return "Debt Collector";
    case "itsMyBirthday":
      return "It's My Birthday";
    case "rent":
      return action.doubleRent ? "Double Rent" : "Rent";
    default:
      return "Action";
  }
}

export function justSayNoPrompt(action: MonopolyDealPendingAction): string {
  switch (action.type) {
    case "dealBreaker":
      return `is playing Deal Breaker and wants your ${colorLabel(action.propertyColor)} set`;
    case "slyDeal":
      return "is playing Sly Deal and wants to steal one of your properties";
    case "forcedDeal":
      return "is playing Forced Deal and wants to swap properties with you";
    case "debtCollector":
      return "is playing Debt Collector and is asking you to pay 5M";
    case "itsMyBirthday":
      return "is playing It's My Birthday — all other players must pay 2M";
    case "rent":
      if (action.chargeAll) {
        return `is charging all players rent on their ${colorLabel(action.rentColor)} properties`;
      }
      return `is charging you rent on their ${colorLabel(action.rentColor)} properties`;
    default:
      return "is playing an action against you";
  }
}

export function justSayNoTargetsEveryone(action: MonopolyDealPendingAction): boolean {
  return action.type === "itsMyBirthday" || (action.type === "rent" && Boolean(action.chargeAll));
}
