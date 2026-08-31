import type { MonopolyDealPlayerBoard, MonopolyDealPropertyColor, MonopolyDealPropertySet } from "../../../../shared/contracts";
import { normalizeColorSets, type PropertySetState } from "../../../../shared/monopolyDealLogic";

export function eachBoardPropertySet(
  propertySets: MonopolyDealPlayerBoard["propertySets"],
  visit: (color: MonopolyDealPropertyColor, set: PropertySetState, groupIndex: number) => void
): void {
  for (const [color, entry] of Object.entries(propertySets) as [
    MonopolyDealPropertyColor,
    MonopolyDealPropertySet | MonopolyDealPropertySet[] | undefined
  ][]) {
    if (!entry) {
      continue;
    }
    normalizeColorSets(entry).forEach((set, groupIndex) => visit(color, set, groupIndex));
  }
}
