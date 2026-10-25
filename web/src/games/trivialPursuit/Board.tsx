import { useState } from "react";
import type { TrivialPursuitPlayerPublic, TrivialPursuitWedges } from "../../../../shared/contracts";
import {
  TRIVIAL_PURSUIT_CATEGORIES,
  TRIVIAL_PURSUIT_CATEGORY_COLORS,
  TRIVIAL_PURSUIT_CATEGORY_LABELS,
  TRIVIAL_PURSUIT_HUB_ID,
  TRIVIAL_PURSUIT_SPACES,
  type TrivialPursuitCategory,
  type TrivialPursuitSpace
} from "../../../../shared/trivialPursuitLogic";

const CX = 100;
const CY = 100;
const SPOKE_RADII = [28, 40, 52, 64] as const;
const HQ_RADIUS = 78;
const RING_RADIUS = 92;
const HUB_R = 17;
const TOKEN_COLORS = ["#c62828", "#1565c0", "#2e7d32", "#6a1b9a", "#ef6c00", "#00838f"];

export function spacePosition(space: TrivialPursuitSpace): { x: number; y: number } {
  if (space.kind === "hub") {
    return { x: CX, y: CY };
  }
  const spoke = space.spokeIndex ?? 0;
  const angleDeg = -90 + spoke * 60;
  const angle = (angleDeg * Math.PI) / 180;

  if (space.spokeDepth != null) {
    const radius = SPOKE_RADII[space.spokeDepth] ?? 40;
    return { x: CX + Math.cos(angle) * radius, y: CY + Math.sin(angle) * radius };
  }

  if (space.kind === "headquarters") {
    return { x: CX + Math.cos(angle) * HQ_RADIUS, y: CY + Math.sin(angle) * HQ_RADIUS };
  }

  const slot = space.ringSlot ?? 0;
  const ringAngleDeg = angleDeg + 12 + slot * 12;
  const ringAngle = (ringAngleDeg * Math.PI) / 180;
  return {
    x: CX + Math.cos(ringAngle) * RING_RADIUS,
    y: CY + Math.sin(ringAngle) * RING_RADIUS
  };
}

function spaceFill(space: TrivialPursuitSpace): string {
  if (space.kind === "hub") return "#0d47a1";
  if (space.kind === "rollAgain") return "#f5f7fa";
  if (space.category) return TRIVIAL_PURSUIT_CATEGORY_COLORS[space.category];
  return "#90a4ae";
}

function polar(angleDeg: number, radius: number): { x: number; y: number } {
  const a = (angleDeg * Math.PI) / 180;
  return { x: CX + Math.cos(a) * radius, y: CY + Math.sin(a) * radius };
}

function wedgePath(startDeg: number, endDeg: number, radius: number): string {
  const s = polar(startDeg, radius);
  const e = polar(endDeg, radius);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${CX} ${CY} L ${s.x} ${s.y} A ${radius} ${radius} 0 ${large} 1 ${e.x} ${e.y} Z`;
}

function spokeLanePath(spokeIndex: number): string {
  const angleDeg = -90 + spokeIndex * 60;
  const inner = polar(angleDeg, HUB_R + 1);
  const outer = polar(angleDeg, HQ_RADIUS - 1);
  return `M ${inner.x} ${inner.y} L ${outer.x} ${outer.y}`;
}

function ringTrackPath(): string {
  const outer = 100;
  const inner = 84;
  return [
    `M ${CX} ${CY - outer}`,
    `A ${outer} ${outer} 0 1 1 ${CX - 0.01} ${CY - outer}`,
    `L ${CX - 0.01} ${CY - inner}`,
    `A ${inner} ${inner} 0 1 0 ${CX} ${CY - inner}`,
    "Z"
  ].join(" ");
}

function spaceSize(space: TrivialPursuitSpace): number {
  if (space.kind === "hub") return HUB_R;
  if (space.kind === "headquarters") return 9.5;
  if (space.kind === "rollAgain") return 6.4;
  return 5.8;
}

function DiceGlyph({ x, y }: { x: number; y: number }): JSX.Element {
  return (
    <g transform={`translate(${x} ${y})`} className="tp-dice-glyph" pointerEvents="none">
      <rect x={-3.2} y={-3.2} width={6.4} height={6.4} rx={1.1} fill="#263238" />
      <circle cx={-1.2} cy={-1.2} r={0.7} fill="#eceff1" />
      <circle cx={1.2} cy={1.2} r={0.7} fill="#eceff1" />
      <circle cx={1.2} cy={-1.2} r={0.7} fill="#eceff1" />
      <circle cx={-1.2} cy={1.2} r={0.7} fill="#eceff1" />
      <circle cx={0} cy={0} r={0.7} fill="#eceff1" />
    </g>
  );
}

function HubPie({
  isLegal,
  onClick
}: {
  isLegal: boolean;
  onClick: () => void;
}): JSX.Element {
  return (
    <g
      className={`tp-hub${isLegal ? " is-legal" : ""}`}
      onClick={onClick}
      data-testid={`tp-space-${TRIVIAL_PURSUIT_HUB_ID}`}
      role="button"
      tabIndex={isLegal ? 0 : -1}
      onKeyDown={(e) => {
        if (isLegal && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onClick();
        }
      }}
    >
      {TRIVIAL_PURSUIT_CATEGORIES.map((cat, i) => {
        const start = -90 + i * 60;
        const end = start + 60;
        return (
          <path
            key={cat}
            d={wedgePath(start, end, HUB_R)}
            fill={TRIVIAL_PURSUIT_CATEGORY_COLORS[cat]}
            className="tp-hub-wedge"
          />
        );
      })}
      <circle cx={CX} cy={CY} r={HUB_R} className="tp-hub-ring" fill="none" />
      <circle cx={CX} cy={CY} r={5.5} className="tp-hub-core" />
    </g>
  );
}

function SpacePlate({
  space,
  isLegal,
  onClick
}: {
  space: TrivialPursuitSpace;
  isLegal: boolean;
  onClick: () => void;
}): JSX.Element | null {
  if (space.kind === "hub") return null;
  const { x, y } = spacePosition(space);
  const size = spaceSize(space);
  const angleDeg = -90 + (space.spokeIndex ?? 0) * 60;
  const rotate =
    space.ringSlot != null
      ? angleDeg + 12 + space.ringSlot * 12 + 90
      : angleDeg + 90;

  return (
    <g
      className={`tp-space-group${isLegal ? " is-legal" : ""}${
        space.kind === "headquarters" ? " is-hq" : ""
      }${space.kind === "rollAgain" ? " is-roll-again" : ""}`}
      transform={`translate(${x} ${y}) rotate(${rotate})`}
      onClick={onClick}
      data-testid={`tp-space-${space.id}`}
      role="button"
      tabIndex={isLegal ? 0 : -1}
      onKeyDown={(e) => {
        if (isLegal && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onClick();
        }
      }}
    >
      {isLegal && (
        <rect
          className="tp-space-glow"
          x={-size - 1.8}
          y={-size - 1.8}
          width={(size + 1.8) * 2}
          height={(size + 1.8) * 2}
          rx={2.4}
        />
      )}
      <rect
        className="tp-space"
        x={-size}
        y={-size}
        width={size * 2}
        height={size * 2}
        rx={space.kind === "headquarters" ? 2.4 : 1.6}
        fill={spaceFill(space)}
      />
      {space.kind === "headquarters" && (
        <polygon
          className="tp-hq-mark"
          points={`0,${-size + 2.2} ${size - 2.4},${size - 2.4} ${-size + 2.4},${size - 2.4}`}
        />
      )}
      {space.kind === "rollAgain" && <DiceGlyph x={0} y={0} />}
    </g>
  );
}

function wedgePathAt(
  wedges: TrivialPursuitWedges | Record<TrivialPursuitCategory, boolean>,
  radius: number
): { cat: TrivialPursuitCategory; d: string }[] {
  return TRIVIAL_PURSUIT_CATEGORIES.flatMap((cat, wedgeIndex) => {
    if (!wedges[cat]) return [];
    const start = (wedgeIndex * 60 - 90) * (Math.PI / 180);
    const end = ((wedgeIndex + 1) * 60 - 90) * (Math.PI / 180);
    const d = [
      "M 0 0",
      `L ${Math.cos(start) * radius} ${Math.sin(start) * radius}`,
      `A ${radius} ${radius} 0 0 1 ${Math.cos(end) * radius} ${Math.sin(end) * radius}`,
      "Z"
    ].join(" ");
    return [{ cat, d }];
  });
}

/** Enlarged token art for the hover card (HTML SVG). */
export function TokenPreviewArt({
  color,
  wedges
}: {
  color: string;
  wedges: TrivialPursuitWedges | Record<TrivialPursuitCategory, boolean>;
}): JSX.Element {
  return (
    <svg className="tp-token-preview-art" viewBox="-24 -24 48 48" aria-hidden>
      <circle cx="1.5" cy="2.5" r="20" className="tp-token-shadow" />
      <circle r="19" fill={color} />
      {wedgePathAt(wedges, 14.5).map(({ cat, d }) => (
        <path key={cat} d={d} fill={TRIVIAL_PURSUIT_CATEGORY_COLORS[cat]} className="tp-wedge-slice" />
      ))}
      <circle r="19" fill="none" className="tp-token-rim" strokeWidth="2.2" />
    </svg>
  );
}

function PlayerToken({
  player,
  index,
  isTurn,
  stackIndex,
  stackCount,
  onHoverChange
}: {
  player: TrivialPursuitPlayerPublic;
  index: number;
  isTurn: boolean;
  stackIndex: number;
  stackCount: number;
  onHoverChange: (participantId: string | null, anchor: { x: number; y: number } | null) => void;
}): JSX.Element {
  const space =
    TRIVIAL_PURSUIT_SPACES.find((s) => s.id === player.spaceId)
    ?? TRIVIAL_PURSUIT_SPACES.find((s) => s.id === TRIVIAL_PURSUIT_HUB_ID)!;
  const base = spacePosition(space);
  const x = base.x + (stackIndex - (stackCount - 1) / 2) * 4.5;
  const y = base.y - 0.5;
  const color = TOKEN_COLORS[index % TOKEN_COLORS.length]!;
  const wedges = player.wedges;

  return (
    <g
      key={player.participantId}
      transform={`translate(${x} ${y})`}
      className={`tp-token-group${isTurn ? " is-turn" : ""}`}
      data-testid={`tp-token-${player.participantId}`}
      onMouseEnter={() => onHoverChange(player.participantId, { x, y })}
      onMouseLeave={() => onHoverChange(null, null)}
      onFocus={() => onHoverChange(player.participantId, { x, y })}
      onBlur={() => onHoverChange(null, null)}
      role="img"
      tabIndex={0}
      aria-label={`Player token`}
    >
      <circle className="tp-token-shadow" r={4.6} cx={0.4} cy={0.7} />
      <circle className="tp-token" r={4.4} fill={color} />
      {wedgePathAt(wedges, 3.3).map(({ cat, d }) => (
        <path
          key={cat}
          className="tp-wedge-slice"
          d={d}
          fill={TRIVIAL_PURSUIT_CATEGORY_COLORS[cat]}
        />
      ))}
      <circle className="tp-token-rim" r={4.4} fill="none" />
      {/* Larger invisible hit target for easier hover */}
      <circle r={7} fill="transparent" className="tp-token-hit" />
    </g>
  );
}

export function TrivialPursuitBoard({
  players,
  currentTurnId,
  legalMoveSpaceIds,
  onSpaceClick,
  playerNames
}: {
  players: TrivialPursuitPlayerPublic[];
  currentTurnId: string | null;
  legalMoveSpaceIds: readonly string[];
  onSpaceClick: (spaceId: string) => void;
  playerNames: Record<string, string>;
}): JSX.Element {
  const legal = new Set(legalMoveSpaceIds);
  const tokensBySpace = new Map<string, string[]>();
  for (const p of players) {
    const list = tokensBySpace.get(p.spaceId) ?? [];
    list.push(p.participantId);
    tokensBySpace.set(p.spaceId, list);
  }

  const [hover, setHover] = useState<{
    participantId: string;
    x: number;
    y: number;
  } | null>(null);

  const hoveredPlayer = hover
    ? players.find((p) => p.participantId === hover.participantId) ?? null
    : null;
  const hoveredIndex = hoveredPlayer
    ? players.findIndex((p) => p.participantId === hoveredPlayer.participantId)
    : -1;
  const ownedCats = hoveredPlayer
    ? TRIVIAL_PURSUIT_CATEGORIES.filter((c) => hoveredPlayer.wedges[c])
    : [];

  return (
    <div className="tp-board-stage">
      <svg
        className="tp-board"
        viewBox="0 0 200 200"
        role="group"
        aria-label="Trivial Pursuit board"
        data-testid="tp-board"
      >
        <defs>
          <radialGradient id="tp-felt-grad" cx="50%" cy="40%" r="70%">
            <stop offset="0%" stopColor="#1e4d9c" />
            <stop offset="55%" stopColor="#0d3a7a" />
            <stop offset="100%" stopColor="#062448" />
          </radialGradient>
          <linearGradient id="tp-rim-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#c4a574" />
            <stop offset="45%" stopColor="#8b6914" />
            <stop offset="100%" stopColor="#5d4037" />
          </linearGradient>
          <filter id="tp-soft-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="1.2" stdDeviation="1.4" floodOpacity="0.35" />
          </filter>
        </defs>

        <circle cx={CX} cy={CY} r={99} fill="url(#tp-rim-grad)" className="tp-wood-rim" />
        <circle cx={CX} cy={CY} r={94.5} fill="url(#tp-felt-grad)" className="tp-felt" />
        <path d={ringTrackPath()} className="tp-track-bed" />
        {TRIVIAL_PURSUIT_CATEGORIES.map((_, i) => (
          <path key={`spoke-lane-${i}`} d={spokeLanePath(i)} className="tp-spoke-lane" />
        ))}

        <HubPie
          isLegal={legal.has(TRIVIAL_PURSUIT_HUB_ID)}
          onClick={() => onSpaceClick(TRIVIAL_PURSUIT_HUB_ID)}
        />

        {TRIVIAL_PURSUIT_SPACES.filter((s) => s.kind !== "hub").map((space) => (
          <SpacePlate
            key={space.id}
            space={space}
            isLegal={legal.has(space.id)}
            onClick={() => onSpaceClick(space.id)}
          />
        ))}

        {players.map((player, index) => {
          const stack = tokensBySpace.get(player.spaceId) ?? [];
          const stackIndex = Math.max(0, stack.indexOf(player.participantId));
          return (
            <PlayerToken
              key={player.participantId}
              player={player}
              index={index}
              isTurn={player.participantId === currentTurnId}
              stackIndex={stackIndex}
              stackCount={stack.length}
              onHoverChange={(participantId, anchor) => {
                if (!participantId || !anchor) {
                  setHover(null);
                  return;
                }
                setHover({ participantId, x: anchor.x, y: anchor.y });
              }}
            />
          );
        })}
      </svg>

      {hover && hoveredPlayer && (
        <div
          className="tp-token-popover"
          data-testid="tp-token-popover"
          style={{
            left: `${(hover.x / 200) * 100}%`,
            top: `${(hover.y / 200) * 100}%`
          }}
          role="dialog"
          aria-label={playerNames[hoveredPlayer.participantId] ?? "Player"}
        >
          <p className="tp-token-popover-name">
            {playerNames[hoveredPlayer.participantId] ?? "Player"}
          </p>
          <TokenPreviewArt
            color={TOKEN_COLORS[Math.max(0, hoveredIndex) % TOKEN_COLORS.length]!}
            wedges={hoveredPlayer.wedges}
          />
          <ul className="tp-token-popover-wedges">
            {ownedCats.length === 0 ? (
              <li className="tp-token-popover-empty">No wedges yet</li>
            ) : (
              ownedCats.map((cat) => (
                <li key={cat}>
                  <span
                    className="tp-wedge-chip is-owned"
                    style={{ background: TRIVIAL_PURSUIT_CATEGORY_COLORS[cat] }}
                  />
                  {TRIVIAL_PURSUIT_CATEGORY_LABELS[cat]}
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

export { TOKEN_COLORS };
