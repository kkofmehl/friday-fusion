import { useCallback, useState, type FocusEvent, type JSX, type MouseEvent } from "react";
import { createPortal } from "react-dom";

export function CardHelpTooltip({
  helpText,
  compact
}: {
  helpText: string;
  compact?: boolean;
}): JSX.Element {
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null);

  const showFromMouse = useCallback((event: MouseEvent<HTMLSpanElement>): void => {
    const rect = event.currentTarget.getBoundingClientRect();
    setTip({ x: rect.left + rect.width / 2, y: rect.top });
  }, []);

  const showFromFocus = useCallback((event: FocusEvent<HTMLSpanElement>): void => {
    const rect = event.currentTarget.getBoundingClientRect();
    setTip({ x: rect.left + rect.width / 2, y: rect.top });
  }, []);

  const hide = useCallback((): void => {
    setTip(null);
  }, []);

  return (
    <>
      <span
        className={`md-card-info${compact ? " md-card-info--compact" : ""}`}
        aria-label="Card help"
        onMouseEnter={showFromMouse}
        onMouseLeave={hide}
        onFocus={showFromFocus}
        onBlur={hide}
        onClick={(event) => event.stopPropagation()}
      >
        <span className="md-card-info-icon" aria-hidden>
          i
        </span>
      </span>
      {tip
        ? createPortal(
            <div
              className="md-card-tooltip md-card-tooltip--floating"
              role="tooltip"
              style={{ left: tip.x, top: tip.y }}
            >
              {helpText}
            </div>,
            document.body
          )
        : null}
    </>
  );
}
