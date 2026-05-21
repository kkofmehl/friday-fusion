import {
  GAME_ATTRIBUTE_DEFINITIONS,
  type GameAttribute,
  type GameAttributeDefinition
} from "../../../shared/gameAttributes";

function defFor(attribute: GameAttribute): GameAttributeDefinition {
  const found = GAME_ATTRIBUTE_DEFINITIONS.find((d) => d.id === attribute);
  if (!found) {
    throw new Error(`Unknown game attribute: ${attribute}`);
  }
  return found;
}

function titleFor(def: GameAttributeDefinition): string {
  return `${def.label}. ${def.description}`;
}

export function GameAttributeIcon({
  attribute,
  className = "game-attribute-icon-svg"
}: {
  attribute: GameAttribute;
  className?: string;
}): JSX.Element {
  const common = {
    className,
    viewBox: "0 0 20 20",
    width: 16,
    height: 16,
    "aria-hidden": true as const
  };

  switch (attribute) {
    case "scorable":
      return (
        <svg {...common}>
          <path
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M6.5 3.5h7L14 6h-8L6.5 3.5zM5 6h10v2.5a5 5 0 0 1-10 0V6zM10 11v3.5M8 14.5h4"
          />
        </svg>
      );
    case "game":
      return (
        <svg {...common}>
          <rect
            x="4.5"
            y="4.5"
            width="5"
            height="5"
            rx="0.8"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.35"
          />
          <rect
            x="10.5"
            y="10.5"
            width="5"
            height="5"
            rx="0.8"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.35"
          />
          <circle cx="7" cy="7" r="0.9" fill="currentColor" />
          <circle cx="13" cy="13" r="0.9" fill="currentColor" />
        </svg>
      );
    case "activity":
      return (
        <svg {...common}>
          <path
            fill="none"
            stroke="currentColor"
            strokeWidth="1.35"
            strokeLinejoin="round"
            d="M4.5 6.5a2.2 2.2 0 0 1 2.2-2.2h4.6a2.2 2.2 0 0 1 2.2 2.2v5.2a2.2 2.2 0 0 1-2.2 2.2H6.7a2.2 2.2 0 0 1-2.2-2.2V6.5z"
          />
          <path
            fill="none"
            stroke="currentColor"
            strokeWidth="1.35"
            strokeLinecap="round"
            d="M6.5 9.5h3M6.5 12h5"
          />
        </svg>
      );
    case "team":
      return (
        <svg {...common}>
          <circle cx="7" cy="6.2" r="1.6" fill="none" stroke="currentColor" strokeWidth="1.25" />
          <path
            fill="none"
            stroke="currentColor"
            strokeWidth="1.25"
            strokeLinecap="round"
            d="M4.2 14.5c.4-2 1.6-3.1 2.8-3.1s2.4 1.1 2.8 3.1"
          />
          <circle cx="13.5" cy="5.5" r="1.35" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <path
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
            d="M11.2 13.8c.35-1.6 1.2-2.5 2.3-2.5s1.95.9 2.3 2.5"
          />
        </svg>
      );
    case "short":
      return (
        <svg {...common}>
          <circle cx="10" cy="10" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.35" />
          <path fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" d="M10 6.2v3.8l2.2 1.2" />
        </svg>
      );
    case "long":
      return (
        <svg {...common}>
          <path
            fill="none"
            stroke="currentColor"
            strokeWidth="1.35"
            strokeLinecap="round"
            d="M7 4.5v11M13 4.5v11M7 7h6M7 10h6M7 13h6"
          />
          <path fill="none" stroke="currentColor" strokeWidth="1.2" d="M6 4.5h8v11H6z" opacity="0.35" />
        </svg>
      );
    default: {
      const _exhaustive: never = attribute;
      return _exhaustive;
    }
  }
}

export function GameAttributeBadge({ attribute }: { attribute: GameAttribute }): JSX.Element {
  const def = defFor(attribute);
  const title = titleFor(def);
  return (
    <span
      className={`game-attribute-badge game-attribute-${attribute}`}
      title={title}
      aria-label={title}
    >
      <span className="game-attribute-icon" aria-hidden>
        <GameAttributeIcon attribute={attribute} />
      </span>
      <span className="game-attribute-badge-label">{def.shortLabel}</span>
    </span>
  );
}

export function GameAttributeLegend(): JSX.Element {
  return (
    <div className="game-attribute-legend" aria-label="Game attribute legend">
      <p className="game-attribute-legend-intro">Each card shows how the mode tends to play:</p>
      <ul className="game-attribute-legend-list">
        {GAME_ATTRIBUTE_DEFINITIONS.map((def) => (
          <li key={def.id} className={`game-attribute-legend-item game-attribute-${def.id}`}>
            <span className="game-attribute-icon game-attribute-legend-icon" aria-hidden>
              <GameAttributeIcon attribute={def.id} />
            </span>
            <span className="game-attribute-legend-text">
              <span className="game-attribute-legend-label">{def.label}</span>
              <span className="game-attribute-legend-desc">{def.description}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
