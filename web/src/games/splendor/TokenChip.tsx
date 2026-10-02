import { useEffect, useRef, type JSX } from "react";
import type { SplendorTokenColorContract } from "../../../../shared/contracts";
import { SPLENDOR_TOKEN_LABELS } from "../../../../shared/splendorData";
import { fadeIn } from "./animate";
import { GemMark } from "./marks";
import type { SplendorNotice } from "./useSplendorMotion";

export function TokenChip({
  color,
  count,
  selected = false,
  disabled = false,
  onClick,
  size = "md",
  splendorId
}: {
  color: SplendorTokenColorContract;
  count: number;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  size?: "md" | "sm" | "xs";
  splendorId?: string;
}): JSX.Element {
  const className = [
    "splendor-token",
    `splendor-token--${color}`,
    `splendor-token--${size}`,
    selected ? "splendor-token--selected" : "",
    disabled ? "splendor-token--disabled" : "",
    count === 0 ? "splendor-token--empty" : ""
  ]
    .filter(Boolean)
    .join(" ");
  const label = `${SPLENDOR_TOKEN_LABELS[color]}, ${count}`;
  const body = (
    <>
      <GemMark color={color} />
      <span className="splendor-token-count">{count}</span>
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        className={className}
        disabled={disabled}
        onClick={onClick}
        aria-label={label}
        aria-pressed={selected}
        data-splendor-id={splendorId}
      >
        {body}
      </button>
    );
  }
  return (
    <div className={className} title={SPLENDOR_TOKEN_LABELS[color]} data-splendor-id={splendorId}>
      {body}
    </div>
  );
}

export function SplendorNotices({ notices }: { notices: SplendorNotice[] }): JSX.Element | null {
  if (notices.length === 0) {
    return null;
  }
  return (
    <div className="splendor-notices" aria-live="polite">
      {notices.map((notice) => (
        <Notice key={notice.id} notice={notice} />
      ))}
    </div>
  );
}

function Notice({ notice }: { notice: SplendorNotice }): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) {
      fadeIn(ref.current);
    }
  }, []);
  return (
    <div ref={ref} className="splendor-notice" role="status" data-notice-id={notice.id}>
      {notice.text}
    </div>
  );
}
