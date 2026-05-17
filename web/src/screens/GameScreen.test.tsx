import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SessionState } from "../../../shared/contracts";
import { GameScreen } from "./GameScreen";

const buildSession = (overrides: Partial<SessionState> = {}): SessionState => ({
  sessionId: "s1",
  sessionName: "Test",
  joinCode: "BRIGHT-OTTER",
  participants: [
    { id: "p1", displayName: "Host", score: 0, isHost: true, isActive: true },
    { id: "p2", displayName: "Guest", score: 0, isHost: false, isActive: true }
  ],
  activeGame: "yahtzee",
  gameState: null,
  ...overrides
});

describe("GameScreen", () => {
  it("renders current game icon beneath the players card", () => {
    render(
      <GameScreen
        session={buildSession()}
        currentParticipantId="p1"
        isHost
        canPlay
        send={vi.fn()}
        apiBase="http://localhost:3000"
      />
    );

    const iconPanel = screen.getByLabelText(/current game icon/i);
    const icon = iconPanel.querySelector("img.game-side-icon-image");
    expect(icon).not.toBeNull();
    expect(icon?.getAttribute("src")).toBe("/game_icons/yahtzee.png");
  });
});
