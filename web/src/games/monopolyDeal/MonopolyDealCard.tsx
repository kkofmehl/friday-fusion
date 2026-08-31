import type { JSX, ReactNode } from "react";
import type { MonopolyDealCardInstance, MonopolyDealPropertyColor } from "../../../../shared/contracts";
import { formatMillions, getCardHelpText } from "../../../../shared/monopolyDealCardHelp";
import {
  PROPERTY_RENT_TABLES,
  PROPERTY_SET_SIZES,
  getCardDef,
  type MonopolyDealCardDef
} from "../../../../shared/monopolyDealData";
import { COLOR_HEX, COLOR_LABEL, COLOR_TEXT } from "./colors";
import { CardHelpTooltip } from "./CardHelpTooltip";
import { ActionCardArt, actionCardModifier } from "./ActionCardArt";

type CardProps = {
  card: MonopolyDealCardInstance;
  activeColor?: MonopolyDealPropertyColor;
  compact?: boolean;
  selected?: boolean;
  disabled?: boolean;
  showHelp?: boolean;
  onClick?: () => void;
  onDoubleClick?: () => void;
};

function CardShell({
  className,
  helpText,
  compact,
  disabled,
  showHelp = true,
  onClick,
  onDoubleClick,
  children
}: {
  className: string;
  helpText: string;
  compact?: boolean;
  disabled?: boolean;
  showHelp?: boolean;
  onClick?: () => void;
  onDoubleClick?: () => void;
  children: ReactNode;
}): JSX.Element {
  return (
    <button
      type="button"
      className={[className, disabled ? "md-card--disabled" : ""].filter(Boolean).join(" ")}
      onClick={disabled ? undefined : onClick}
      onDoubleClick={disabled ? undefined : onDoubleClick}
      disabled={disabled}
      aria-disabled={disabled || undefined}
    >
      {children}
      {showHelp ? <CardHelpTooltip helpText={helpText} compact={compact} /> : null}
    </button>
  );
}

function RentTable({ color, compact }: { color: MonopolyDealPropertyColor; compact?: boolean }): JSX.Element {
  const rents = PROPERTY_RENT_TABLES[color];
  const setSize = PROPERTY_SET_SIZES[color];
  return (
    <div className="md-rent-table">
      {rents.map((rent, idx) => (
        <div key={idx} className="md-rent-row">
          <span>{idx + 1}</span>
          <span>{formatMillions(rent)}</span>
        </div>
      ))}
      {!compact ? <div className="md-color-swatch" style={{ background: COLOR_HEX[color] }} title={COLOR_LABEL[color]} /> : null}
    </div>
  );
}

function RentColorBar({ colors }: { colors: readonly MonopolyDealPropertyColor[] }): JSX.Element {
  return (
    <div className="md-rent-colors" aria-hidden>
      {colors.map((color) => (
        <span
          key={color}
          className="md-rent-color-segment"
          style={{ background: COLOR_HEX[color], color: COLOR_TEXT[color] }}
          title={COLOR_LABEL[color]}
        />
      ))}
    </div>
  );
}

function PropertyFace({ def, color }: { def: MonopolyDealCardDef; color: MonopolyDealPropertyColor }): JSX.Element {
  return (
    <>
      <div className="md-card-value">{formatMillions(def.value)}</div>
      <div className="md-card-title" style={{ background: COLOR_HEX[color], color: COLOR_TEXT[color] }}>
        {def.propertyName ?? COLOR_LABEL[color]}
      </div>
      <RentTable color={color} />
    </>
  );
}

export function MonopolyDealCard({
  card,
  activeColor,
  compact,
  selected,
  disabled,
  showHelp = true,
  onClick,
  onDoubleClick
}: CardProps): JSX.Element {
  const def = getCardDef(card.defId);
  const helpText = getCardHelpText(def);
  const className = ["md-card", compact ? "md-card--compact" : "", selected ? "md-card--selected" : ""]
    .filter(Boolean)
    .join(" ");

  if (def.kind === "money") {
    return (
      <CardShell
        className={`${className} md-card--money md-card--money-${def.value}`}
        helpText={helpText}
        compact={compact}
        disabled={disabled}
        showHelp={showHelp}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
      >
        <div className="md-money-inner">
          <span className="md-money-value">{formatMillions(def.value)}</span>
          <span className="md-money-label">Million</span>
        </div>
      </CardShell>
    );
  }

  if (def.kind === "property" && def.color) {
    return (
      <CardShell className={className} helpText={helpText} compact={compact} disabled={disabled} showHelp={showHelp} onClick={onClick} onDoubleClick={onDoubleClick}>
        <PropertyFace def={def} color={def.color} />
      </CardShell>
    );
  }

  if (def.kind === "propertyWildDual" && def.colors) {
    const top = activeColor ?? def.colors[0]!;
    const bottom = def.colors.find((c) => c !== top) ?? def.colors[1]!;
    return (
      <CardShell
        className={`${className} md-card--dual-wild`}
        helpText={helpText}
        compact={compact}
        disabled={disabled}
        showHelp={showHelp}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
      >
        <div className="md-card-value">{formatMillions(def.value)}</div>
        <div className="md-dual-top" style={{ background: COLOR_HEX[top], color: COLOR_TEXT[top] }}>
          <span>Wild</span>
        </div>
        <div className="md-dual-body">
          <RentTable color={top} compact={compact} />
        </div>
        <div className="md-dual-bottom" style={{ background: COLOR_HEX[bottom], color: COLOR_TEXT[bottom] }}>
          Wild
        </div>
      </CardShell>
    );
  }

  if (def.kind === "propertyWildMulti") {
    return (
      <CardShell
        className={`${className} md-card--multi-wild`}
        helpText={helpText}
        compact={compact}
        disabled={disabled}
        showHelp={showHelp}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
      >
        <div className="md-card-value">{formatMillions(def.value)}</div>
        <div className="md-multi-band">Any Property</div>
        <div className="md-multi-body">Wild Card</div>
      </CardShell>
    );
  }

  if (def.kind === "rent" && def.colors) {
    const isWildRent = def.colors.length > 2;
    return (
      <CardShell className={`${className} md-card--rent`} helpText={helpText} compact={compact} disabled={disabled} showHelp={showHelp} onClick={onClick} onDoubleClick={onDoubleClick}>
        <div className="md-card-value">{formatMillions(def.value)}</div>
        <div className="md-rent-header">Rent</div>
        <RentColorBar colors={isWildRent ? def.colors.slice(0, 10) : def.colors} />
        {!isWildRent ? (
          <div className="md-rent-labels">
            {def.colors.map((c) => (
              <span key={c} style={{ color: COLOR_HEX[c] }}>
                {COLOR_LABEL[c]}
              </span>
            ))}
          </div>
        ) : (
          <div className="md-rent-labels md-rent-labels--wild">Any set</div>
        )}
      </CardShell>
    );
  }

  if (def.kind === "action") {
    const isHouse = def.action === "house";
    const isHotel = def.action === "hotel";
    const isPassGo = def.action === "passGo";
    const actionModifier = def.action ? actionCardModifier(def.action) : "";
    return (
      <CardShell
        className={`${className} md-card--action ${actionModifier}`.trim()}
        helpText={helpText}
        compact={compact}
        disabled={disabled}
        showHelp={showHelp}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
      >
        <div className="md-card-value">{formatMillions(def.value)}</div>
        {isHouse ? (
          <div className="md-action-icon md-action-icon--house" aria-hidden>
            <svg viewBox="0 0 24 24" width="36" height="36">
              <path
                fill="currentColor"
                d="M12 3 3 11h2v9h6v-6h2v6h6v-9h2L12 3zm0 2.8 6 5.4V18h-2v-6H8v6H6v-6.8l6-5.4z"
              />
            </svg>
          </div>
        ) : isHotel ? (
          <div className="md-action-icon md-action-icon--hotel" aria-hidden>
            <svg viewBox="0 0 24 24" width="36" height="36">
              <path
                fill="currentColor"
                d="M4 20V8l8-5 8 5v12H4zm2-2h12v-8.7l-6-3.75-6 3.75V18zm3-2h2v-2H9v2zm4 0h2v-2h-2v2zm-4-3h2v-2H9v2zm4 0h2v-2h-2v2z"
              />
            </svg>
          </div>
        ) : (
          <ActionCardArt action={def.action} />
        )}
        <div className="md-action-name">{def.name}</div>
        {isPassGo ? <div className="md-action-subtitle">(Draw Two Cards)</div> : null}
      </CardShell>
    );
  }

  return (
    <CardShell className={className} helpText={helpText} compact={compact} disabled={disabled} showHelp={showHelp} onClick={onClick}>
      {def.name}
    </CardShell>
  );
}
