/** Preferred tooltip width before viewport clamping (matches CSS `min(18rem, …)`). */
export const LOBBY_GAME_INFO_TOOLTIP_MAX_WIDTH_PX = 18 * 16;
export const LOBBY_GAME_INFO_TOOLTIP_VIEWPORT_PAD_PX = 12;

export function clampLobbyGameInfoTooltipLeft(
  anchorCenterX: number,
  viewportWidth: number,
  tipMaxWidthPx: number = LOBBY_GAME_INFO_TOOLTIP_MAX_WIDTH_PX,
  padPx: number = LOBBY_GAME_INFO_TOOLTIP_VIEWPORT_PAD_PX
): { left: number; width: number } {
  const width = Math.min(tipMaxWidthPx, Math.max(0, viewportWidth - padPx * 2));
  let left = anchorCenterX - width / 2;
  left = Math.max(padPx, Math.min(left, viewportWidth - width - padPx));
  return { left, width };
}
