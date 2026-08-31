import type { JSX, ReactNode } from "react";
import type { MonopolyDealPropertyColor } from "../../../../shared/contracts";
import { COLOR_HEX, COLOR_TEXT } from "./colors";

export function PropertyColorButton({
  color,
  onClick,
  children
}: {
  color: MonopolyDealPropertyColor;
  onClick: () => void;
  children: ReactNode;
}): JSX.Element {
  return (
    <button
      type="button"
      className="md-btn md-btn--property-color"
      style={{ background: COLOR_HEX[color], color: COLOR_TEXT[color], borderColor: COLOR_HEX[color] }}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
