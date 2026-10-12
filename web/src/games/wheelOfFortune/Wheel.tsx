import { useEffect, useRef, useState } from "react";
import {
  WHEEL_DEGREES_PER_WEDGE,
  WHEEL_WEDGES,
  WHEEL_WEDGE_COUNT,
  wheelSpinRotationDeg
} from "../../../../shared/wheelOfFortuneLogic";
import "./wheel.css";

const SIZE = 320;
const CX = SIZE / 2;
const CY = SIZE / 2;
const OUTER_R = 148;
const INNER_R = 42;
const LABEL_R = 98;

function polar(cx: number, cy: number, r: number, angleDeg: number): { x: number; y: number } {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function wedgePath(index: number): string {
  const start = index * WHEEL_DEGREES_PER_WEDGE;
  const end = start + WHEEL_DEGREES_PER_WEDGE;
  const a = polar(CX, CY, OUTER_R, start);
  const b = polar(CX, CY, OUTER_R, end);
  const large = WHEEL_DEGREES_PER_WEDGE > 180 ? 1 : 0;
  return `M ${CX} ${CY} L ${a.x} ${a.y} A ${OUTER_R} ${OUTER_R} 0 ${large} 1 ${b.x} ${b.y} Z`;
}

export function WheelOfFortuneWheel({
  rotationDeg,
  spinning,
  highlightIndex
}: {
  /** Absolute clockwise rotation from resting (degrees). */
  rotationDeg: number;
  spinning: boolean;
  highlightIndex: number | null;
}): JSX.Element {
  return (
    <div className={`wof-wheel-wrap${spinning ? " is-spinning" : ""}`} aria-hidden={false}>
      <div className="wof-flipper" aria-hidden="true" />
      <svg
        className="wof-wheel-svg"
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        width="100%"
        role="img"
        aria-label="Wheel of Fortune"
        style={{ transform: `rotate(${rotationDeg}deg)` }}
      >
        <circle cx={CX} cy={CY} r={OUTER_R + 6} className="wof-outer-rim" />
        {WHEEL_WEDGES.map((wedge, index) => {
          const mid = index * WHEEL_DEGREES_PER_WEDGE + WHEEL_DEGREES_PER_WEDGE / 2;
          const labelPos = polar(CX, CY, LABEL_R, mid);
          const peg = polar(CX, CY, OUTER_R + 2, index * WHEEL_DEGREES_PER_WEDGE);
          const isHi = highlightIndex === index && !spinning;
          return (
            <g key={index}>
              <path
                d={wedgePath(index)}
                fill={wedge.color}
                className={isHi ? "wof-wedge is-lit" : "wof-wedge"}
                stroke="#1a237e"
                strokeWidth={1}
              />
              <circle cx={peg.x} cy={peg.y} r={3.2} className="wof-peg" />
              <text
                x={labelPos.x}
                y={labelPos.y}
                className={
                  wedge.kind === "bankrupt" || wedge.kind === "loseATurn"
                    ? "wof-wedge-label special"
                    : "wof-wedge-label"
                }
                transform={`rotate(${mid} ${labelPos.x} ${labelPos.y})`}
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {wedge.kind === "bankrupt"
                  ? "BANKRUPT"
                  : wedge.kind === "loseATurn"
                    ? "LOSE A TURN"
                    : wedge.freeSpin
                      ? `$${wedge.value}★`
                      : `$${wedge.value}`}
              </text>
            </g>
          );
        })}
        <circle cx={CX} cy={CY} r={INNER_R} className="wof-hub" />
        <text x={CX} y={CY - 6} className="wof-hub-text" textAnchor="middle">
          WHEEL
        </text>
        <text x={CX} y={CY + 10} className="wof-hub-text small" textAnchor="middle">
          of FORTUNE
        </text>
      </svg>
    </div>
  );
}

/** Syncs wheel rotation to server spin timestamps for all clients. */
export function useSyncedWheelRotation(opts: {
  spinning: boolean;
  spinStartedAt: number | null;
  spinEndsAt: number | null;
  finalRotationDeg: number | null;
  restingRotationDeg: number;
}): number {
  const { spinning, spinStartedAt, spinEndsAt, finalRotationDeg, restingRotationDeg } = opts;
  const [rotation, setRotation] = useState(restingRotationDeg);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!spinning || spinStartedAt == null || spinEndsAt == null || finalRotationDeg == null) {
      setRotation(restingRotationDeg);
      return;
    }
    const tick = () => {
      const now = Date.now();
      setRotation(wheelSpinRotationDeg(now, spinStartedAt, spinEndsAt, finalRotationDeg));
      if (now < spinEndsAt) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [spinning, spinStartedAt, spinEndsAt, finalRotationDeg, restingRotationDeg]);

  return rotation;
}

export { WHEEL_WEDGE_COUNT, WHEEL_DEGREES_PER_WEDGE };
