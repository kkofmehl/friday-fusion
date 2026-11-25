import { describe, expect, it } from "vitest";
import { clampLobbyGameInfoTooltipLeft } from "./lobbyGameInfoTooltipPosition";

describe("clampLobbyGameInfoTooltipLeft", () => {
  it("centers under the anchor when there is room", () => {
    const { left, width } = clampLobbyGameInfoTooltipLeft(400, 1000, 288, 12);
    expect(width).toBe(288);
    expect(left).toBe(400 - 144);
  });

  it("shifts left when the tooltip would overflow the right edge", () => {
    const { left, width } = clampLobbyGameInfoTooltipLeft(980, 1000, 288, 12);
    expect(width).toBe(288);
    expect(left).toBe(1000 - 288 - 12);
  });

  it("shifts right when the tooltip would overflow the left edge", () => {
    const { left, width } = clampLobbyGameInfoTooltipLeft(20, 1000, 288, 12);
    expect(width).toBe(288);
    expect(left).toBe(12);
  });

  it("shrinks width when the viewport is narrower than the preferred tip", () => {
    const { left, width } = clampLobbyGameInfoTooltipLeft(100, 200, 288, 12);
    expect(width).toBe(200 - 24);
    expect(left).toBe(12);
  });
});
