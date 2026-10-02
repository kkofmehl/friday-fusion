import type { JSX } from "react";
import type { SplendorCardView, SplendorGemColorContract } from "../../../../shared/contracts";
import { SPLENDOR_GEM_COLORS, SPLENDOR_GEM_LABELS } from "../../../../shared/splendorData";
import { CostGems, GemMark } from "./marks";

const TIER_ROMAN = { 1: "I", 2: "II", 3: "III" } as const;

export function DevelopmentCard({
  card,
  selected = false,
  affordable = false,
  unaffordable = false,
  disabled = false,
  onClick,
  splendorId
}: {
  card: SplendorCardView;
  selected?: boolean;
  affordable?: boolean;
  unaffordable?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  splendorId?: string;
}): JSX.Element {
  const costText = SPLENDOR_GEM_COLORS.filter((color) => (card.cost[color] ?? 0) > 0)
    .map((color) => `${card.cost[color]} ${SPLENDOR_GEM_LABELS[color]}`)
    .join(", ");
  return (
    <button
      type="button"
      className={[
        "splendor-card",
        `splendor-card--${card.bonus}`,
        `splendor-card--tier-${card.tier}`,
        selected ? "splendor-card--selected" : "",
        affordable ? "splendor-card--affordable" : "",
        unaffordable ? "splendor-card--unaffordable" : ""
      ]
        .filter(Boolean)
        .join(" ")}
      disabled={disabled}
      onClick={onClick}
      data-splendor-id={splendorId}
      aria-label={`Tier ${card.tier} ${SPLENDOR_GEM_LABELS[card.bonus]} card, ${card.prestige} points${costText ? `, costs ${costText}` : ""}`}
    >
      <CardBody card={card} />
    </button>
  );
}

export function DevelopmentCardFace({
  card,
  count,
  splendorId
}: {
  card: SplendorCardView;
  count?: number;
  splendorId?: string;
}): JSX.Element {
  return (
    <div
      className={[
        "splendor-card",
        "splendor-card--mini",
        `splendor-card--${card.bonus}`,
        `splendor-card--tier-${card.tier}`
      ].join(" ")}
      data-splendor-id={splendorId}
      aria-hidden="true"
    >
      <CardBody card={card} count={count} mini />
    </div>
  );
}

function CardBody({
  card,
  count,
  mini = false
}: {
  card: SplendorCardView;
  count?: number;
  mini?: boolean;
}): JSX.Element {
  return (
    <>
      <div className="splendor-card-top">
        <span className="splendor-card-prestige">{card.prestige > 0 ? card.prestige : ""}</span>
        {count && count > 1 ? <span className="splendor-card-stack-count">{count}</span> : null}
      </div>
      <div className="splendor-card-art">
        <GemMark color={card.bonus} />
      </div>
      {mini ? null : (
        <div className="splendor-card-foot">
          <CostGems cost={card.cost} />
          <span className="splendor-card-tier">{TIER_ROMAN[card.tier]}</span>
        </div>
      )}
    </>
  );
}

export function PurchasedCardStacks({
  participantId,
  purchasedByBonus,
  compact = false
}: {
  participantId: string;
  purchasedByBonus: Record<SplendorGemColorContract, SplendorCardView[]>;
  compact?: boolean;
}): JSX.Element {
  const columns = SPLENDOR_GEM_COLORS.filter((color) => purchasedByBonus[color].length > 0);
  if (columns.length === 0) {
    return <p className="splendor-hint">No cards yet.</p>;
  }
  return (
    <div className={["splendor-stacks", compact ? "splendor-stacks--compact" : ""].filter(Boolean).join(" ")}>
      {columns.map((color) => {
        const cards = purchasedByBonus[color];
        const visibleStack = cards.slice(-3);
        return (
          <div key={color} className="splendor-stack" title={`${cards.length} ${SPLENDOR_GEM_LABELS[color]} cards`}>
            <div className="splendor-stack-cards">
              {visibleStack.map((card, index) => {
                const top = index === visibleStack.length - 1;
                return (
                  <DevelopmentCardFace
                    key={`${card.id}-${index}`}
                    card={card}
                    count={top ? cards.length : undefined}
                    splendorId={top ? `owned:${participantId}:${card.id}` : undefined}
                  />
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function DeckPile({
  tier,
  count,
  disabled,
  onReserve
}: {
  tier: 1 | 2 | 3;
  count: number;
  disabled: boolean;
  onReserve: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      className={[
        "splendor-deck",
        `splendor-deck--tier-${tier}`,
        count < 1 ? "splendor-deck--empty" : ""
      ]
        .filter(Boolean)
        .join(" ")}
      data-splendor-id={`deck:${tier}`}
      disabled={disabled || count < 1}
      onClick={onReserve}
      aria-label={`Reserve from tier ${tier} deck, ${count} remaining`}
    >
      <span className="splendor-deck-ornament" aria-hidden="true" />
      <span className="splendor-deck-label">Tier {TIER_ROMAN[tier]}</span>
      <span className="splendor-deck-count">{count}</span>
    </button>
  );
}
