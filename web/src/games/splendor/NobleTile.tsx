import type { JSX } from "react";
import type { SplendorNobleView } from "../../../../shared/contracts";
import { CostGems } from "./marks";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter((part) => part.length > 0 && part.toLowerCase() !== "of" && part.toLowerCase() !== "de")
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function NobleTile({
  noble,
  onClick,
  eligible = false,
  splendorId
}: {
  noble: SplendorNobleView;
  onClick?: () => void;
  eligible?: boolean;
  splendorId?: string;
}): JSX.Element {
  const className = [
    "splendor-noble",
    onClick ? "splendor-noble--choice" : "",
    eligible ? "splendor-noble--eligible" : ""
  ]
    .filter(Boolean)
    .join(" ");
  const body = (
    <>
      <span className="splendor-noble-prestige">3</span>
      <span className="splendor-noble-crest" aria-hidden="true">
        <svg viewBox="0 0 64 48">
          <path d="M6 40h52M10 40V22l8 8 8-16 6 12 6-10 8 14v10" />
          <circle cx="32" cy="14" r="3" />
        </svg>
        <span>{initials(noble.name)}</span>
      </span>
      <span className="splendor-noble-name">{noble.name}</span>
      <CostGems cost={noble.requirements} compact />
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        className={className}
        onClick={onClick}
        data-splendor-id={splendorId}
        aria-label={`Choose noble ${noble.name}, 3 points`}
      >
        {body}
      </button>
    );
  }
  return (
    <div className={className} data-splendor-id={splendorId}>
      {body}
    </div>
  );
}
