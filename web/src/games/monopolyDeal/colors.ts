import type { MonopolyDealPropertyColor } from "../../../../shared/contracts";
import { PROPERTY_COLOR_HEX, PROPERTY_COLOR_LABELS } from "../../../../shared/monopolyDealData";

export const COLOR_HEX: Record<MonopolyDealPropertyColor, string> = PROPERTY_COLOR_HEX;

export const COLOR_LABEL: Record<MonopolyDealPropertyColor, string> = PROPERTY_COLOR_LABELS;

export const COLOR_TEXT: Record<MonopolyDealPropertyColor, string> = {
  brown: "#fff",
  lightBlue: "#111",
  pink: "#111",
  orange: "#111",
  red: "#fff",
  yellow: "#111",
  green: "#fff",
  darkBlue: "#fff",
  railroad: "#fff",
  utility: "#111"
};
