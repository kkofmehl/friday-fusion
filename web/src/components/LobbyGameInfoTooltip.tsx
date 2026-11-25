import { useCallback, useState, type FocusEvent, type JSX, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { GameAttributeBadge } from "./GameAttributeBadge";
import type { GameAttribute } from "../../../shared/gameAttributes";
import { clampLobbyGameInfoTooltipLeft } from "./lobbyGameInfoTooltipPosition";

export function GameBetaBadge(): JSX.Element {
  return (
    <span className="tag tag-beta" aria-label="Beta release">
      Beta
    </span>
  );
}

export function LobbyGameInfoTooltip({
  gameTitle,
  description,
  attributes,
  beta = false
}: {
  gameTitle: string;
  description: string;
  attributes: readonly GameAttribute[];
  beta?: boolean;
}): JSX.Element {
  const [tip, setTip] = useState<{ left: number; top: number; width: number } | null>(null);

  const showFromRect = useCallback((rect: DOMRect): void => {
    const { left, width } = clampLobbyGameInfoTooltipLeft(
      rect.left + rect.width / 2,
      window.innerWidth
    );
    setTip({ left, top: rect.bottom, width });
  }, []);

  const showFromMouse = useCallback(
    (event: MouseEvent<HTMLButtonElement>): void => {
      showFromRect(event.currentTarget.getBoundingClientRect());
    },
    [showFromRect]
  );

  const showFromFocus = useCallback(
    (event: FocusEvent<HTMLButtonElement>): void => {
      showFromRect(event.currentTarget.getBoundingClientRect());
    },
    [showFromRect]
  );

  const hide = useCallback((): void => {
    setTip(null);
  }, []);

  return (
    <>
      <button
        type="button"
        className="lobby-game-info-btn"
        aria-label={`About ${gameTitle}`}
        onMouseEnter={showFromMouse}
        onMouseLeave={hide}
        onFocus={showFromFocus}
        onBlur={hide}
      >
        <span className="lobby-game-info-icon" aria-hidden>
          i
        </span>
      </button>
      {tip
        ? createPortal(
            <div
              className="lobby-game-info-tooltip"
              role="tooltip"
              style={{ left: tip.left, top: tip.top, width: tip.width }}
            >
              <p className="lobby-game-info-tooltip-desc">{description}</p>
              <ul className="lobby-game-info-tooltip-tags" aria-label={`${gameTitle} attributes`}>
                {beta ? (
                  <li>
                    <GameBetaBadge />
                  </li>
                ) : null}
                {attributes.map((attr) => (
                  <li key={attr}>
                    <GameAttributeBadge attribute={attr} />
                  </li>
                ))}
              </ul>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
