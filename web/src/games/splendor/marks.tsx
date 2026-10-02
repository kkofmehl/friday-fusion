import type { JSX } from "react";
import type {
  SplendorCardView,
  SplendorTokenColorContract
} from "../../../../shared/contracts";
import { SPLENDOR_GEM_COLORS, SPLENDOR_TOKEN_LABELS } from "../../../../shared/splendorData";

export function GemMark({
  color,
  className
}: {
  color: SplendorTokenColorContract;
  className?: string;
}): JSX.Element {
  return (
    <svg
      className={["splendor-gem", `splendor-gem--${color}`, className].filter(Boolean).join(" ")}
      viewBox="0 0 32 32"
      aria-hidden="true"
    >
      {color === "white" ? <Diamond /> : null}
      {color === "blue" ? <Sapphire /> : null}
      {color === "green" ? <Emerald /> : null}
      {color === "red" ? <Ruby /> : null}
      {color === "black" ? <Onyx /> : null}
      {color === "gold" ? <Gold /> : null}
    </svg>
  );
}

function Diamond(): JSX.Element {
  return (
    <>
      <polygon points="16,2 27,11 23,29 9,29 5,11" />
      <polygon points="16,6 23,12 16,16 9,12" className="splendor-gem-shine" />
      <polygon points="9,12 5,11 9,29 16,16" className="splendor-gem-shade" />
    </>
  );
}

function Sapphire(): JSX.Element {
  return (
    <>
      <ellipse cx="16" cy="17" rx="11" ry="12" />
      <ellipse cx="13" cy="12" rx="4" ry="3" className="splendor-gem-shine" />
      <path d="M10 20c2 3 10 4 13 1" className="splendor-gem-cut" />
    </>
  );
}

function Emerald(): JSX.Element {
  return (
    <>
      <polygon points="8,4 24,4 29,11 29,22 24,28 8,28 3,22 3,11" />
      <rect x="11" y="10" width="10" height="12" className="splendor-gem-shine" />
      <polygon points="3,11 8,4 11,10 8,22 3,22" className="splendor-gem-shade" />
    </>
  );
}

function Ruby(): JSX.Element {
  return (
    <>
      <polygon points="16,2 28,12 24,28 8,28 4,12" />
      <polygon points="16,8 23,13 16,18 9,13" className="splendor-gem-shine" />
      <polygon points="9,13 4,12 8,28 16,18" className="splendor-gem-shade" />
    </>
  );
}

function Onyx(): JSX.Element {
  return (
    <>
      <polygon points="16,2 28,9 28,23 16,30 4,23 4,9" />
      <polygon points="16,7 23,11 16,16 9,11" className="splendor-gem-shine" />
      <polygon points="4,9 9,11 9,24 16,30 4,23" className="splendor-gem-shade" />
    </>
  );
}

function Gold(): JSX.Element {
  return (
    <>
      <circle cx="16" cy="16" r="13" />
      <circle cx="16" cy="16" r="9" className="splendor-gem-shade" />
      <path d="M16 9l1.6 3.6H21l-2.8 2.2 1.1 3.6L16 16.3 12.7 18.4 13.8 14.8 11 12.6h3.4z" className="splendor-gem-shine" />
    </>
  );
}

export function CostGems({
  cost,
  compact = false
}: {
  cost: SplendorCardView["cost"];
  compact?: boolean;
}): JSX.Element {
  const entries = SPLENDOR_GEM_COLORS.filter((color) => (cost[color] ?? 0) > 0);
  return (
    <div className={compact ? "splendor-cost splendor-cost--compact" : "splendor-cost"}>
      {entries.map((color) => (
        <span
          key={color}
          className={`splendor-pip splendor-pip--${color}`}
          title={`${cost[color]} ${SPLENDOR_TOKEN_LABELS[color]}`}
        >
          <GemMark color={color} />
          <span>{cost[color]}</span>
        </span>
      ))}
    </div>
  );
}
