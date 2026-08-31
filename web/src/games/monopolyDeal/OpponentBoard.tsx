import { useState, type JSX } from "react";
import type { MonopolyDealCardInstance, MonopolyDealPlayerBoard, MonopolyDealPropertyColor } from "../../../../shared/contracts";
import { formatMillions } from "../../../../shared/monopolyDealCardHelp";
import { countCompleteSets } from "../../../../shared/monopolyDealLogic";
import { getCardDef } from "../../../../shared/monopolyDealData";
import { COLOR_HEX, COLOR_LABEL } from "./colors";
import { MonopolyDealCard } from "./MonopolyDealCard";
import { eachBoardPropertySet } from "./boardUtils";

function propertyColorForCard(card: MonopolyDealCardInstance, activeColor?: MonopolyDealPropertyColor): MonopolyDealPropertyColor {
  const def = getCardDef(card.defId);
  if (activeColor) {
    return activeColor;
  }
  if (def.kind === "property" && def.color) {
    return def.color;
  }
  if (def.kind === "propertyWildDual" && def.colors?.[0]) {
    return def.colors[0];
  }
  return "brown";
}

function MiniChip({
  card,
  activeColor,
  onClick
}: {
  card: MonopolyDealCardInstance;
  activeColor?: MonopolyDealPropertyColor;
  onClick?: () => void;
}): JSX.Element {
  const [hover, setHover] = useState(false);
  const def = getCardDef(card.defId);
  const Tag = onClick ? "button" : "div";

  let face: JSX.Element;
  if (def.kind === "money") {
    face = <span className="md-mini-chip md-mini-chip--money">{formatMillions(def.value)}</span>;
  } else if (def.kind === "property" || def.kind === "propertyWildDual" || def.kind === "propertyWildMulti") {
    const color = propertyColorForCard(card, activeColor);
    face = (
      <span
        className="md-mini-chip md-mini-chip--property"
        style={{ background: COLOR_HEX[color] }}
        title={COLOR_LABEL[color]}
      />
    );
  } else {
    face = <span className="md-mini-chip md-mini-chip--action">{formatMillions(def.value)}</span>;
  }

  return (
    <div
      className="md-mini-chip-wrap"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <Tag type={onClick ? "button" : undefined} className="md-mini-chip-btn" onClick={onClick}>
        {face}
      </Tag>
      {hover ? (
        <div className="md-mini-card-preview">
          <MonopolyDealCard card={card} activeColor={activeColor} compact showHelp={false} />
        </div>
      ) : null}
    </div>
  );
}

export function OpponentBoard({
  board,
  onPropertyClick
}: {
  board: MonopolyDealPlayerBoard;
  onPropertyClick?: (instanceId: string) => void;
}): JSX.Element {
  const propertyCards: { card: MonopolyDealCardInstance; activeColor: MonopolyDealPropertyColor }[] = [];
  eachBoardPropertySet(board.propertySets, (_color, set) => {
    for (const placed of set.cards) {
      propertyCards.push({
        card: { id: placed.instanceId, defId: placed.defId },
        activeColor: placed.activeColor
      });
    }
  });

  const completeSets = countCompleteSets({ bank: board.bank, propertySets: board.propertySets });

  return (
    <div className="md-opponent-layout">
      <div className="md-mini-section">
        <span className="md-section-label">Bank ({board.bank.length})</span>
        <div className="md-mini-row">
          {board.bank.length === 0 ? <span className="md-mini-empty">—</span> : null}
          {board.bank.map((card) => (
            <MiniChip key={card.id} card={card} />
          ))}
        </div>
      </div>
      <div className="md-mini-section">
        <span className="md-section-label">Properties ({propertyCards.length})</span>
        <div className="md-mini-row">
          {propertyCards.length === 0 ? <span className="md-mini-empty">—</span> : null}
          {propertyCards.map(({ card, activeColor }) => (
            <MiniChip
              key={card.id}
              card={card}
              activeColor={activeColor}
              onClick={onPropertyClick ? () => onPropertyClick(card.id) : undefined}
            />
          ))}
        </div>
      </div>
      <div className="md-mini-section">
        <span className="md-section-label">Sets ({completeSets})</span>
        <div className="md-mini-row">
          {completeSets === 0 ? <span className="md-mini-empty">—</span> : <span className="md-mini-sets-count">{completeSets}</span>}
        </div>
      </div>
    </div>
  );
}

export { MiniChip };
