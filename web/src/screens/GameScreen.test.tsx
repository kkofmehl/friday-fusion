import { fireEvent, render, screen } from "@testing-library/react";
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

  it("renders memory game icon when memory is active", () => {
    render(
      <GameScreen
        session={buildSession({
          activeGame: "memory",
          gameState: {
            type: "memory",
            state: {
              phase: "playing",
              boardSize: "30",
              cols: 6,
              rows: 5,
              currentPlayerId: "p1",
              flippedCardIds: [],
              scores: { p1: 0, p2: 0 },
              cards: []
            }
          }
        })}
        currentParticipantId="p1"
        isHost
        canPlay
        send={vi.fn()}
        apiBase="http://localhost:3000"
      />
    );

    const iconPanel = screen.getByLabelText(/current game icon/i);
    const icon = iconPanel.querySelector("img.game-side-icon-image");
    expect(icon?.getAttribute("src")).toBe("/game_icons/memory.png");
  });

  it("renders wordle game icon when wordle is active", () => {
    render(
      <GameScreen
        session={buildSession({
          activeGame: "wordle",
          gameState: {
            type: "wordle",
            state: {
              status: "idle",
              players: {},
              usedAnswers: []
            }
          }
        })}
        currentParticipantId="p1"
        isHost
        canPlay
        send={vi.fn()}
        apiBase="http://localhost:3000"
      />
    );

    const iconPanel = screen.getByLabelText(/current game icon/i);
    const icon = iconPanel.querySelector("img.game-side-icon-image");
    expect(icon?.getAttribute("src")).toBe("/game_icons/wordle.png");
  });

  it("opens profile panel when Create/Load Profile is clicked", () => {
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

    expect(screen.queryByRole("heading", { name: "My Profile" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Create/Load Profile" }));
    expect(screen.getByRole("heading", { name: "My Profile" })).toBeDefined();
  });

  it("shows Next in queue for the host when the session queue is non-empty", () => {
    const send = vi.fn();
    render(
      <GameScreen
        session={buildSession({
          sessionGameQueue: [{ id: "q1", game: "trivia" }]
        })}
        currentParticipantId="p1"
        isHost
        canPlay
        send={send}
        apiBase="http://localhost:3000"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Next in queue" }));
    expect(send).toHaveBeenCalledWith({ type: "queue:next", payload: {} });
  });

  it("hides Next in queue when the session queue is empty", () => {
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

    expect(screen.queryByRole("button", { name: "Next in queue" })).toBeNull();
  });

  it("renders the Monopoly Deal action feed below the game icon", () => {
    render(
      <GameScreen
        session={buildSession({
          activeGame: "monopolyDeal",
          gameState: {
            type: "monopolyDeal",
            state: {
              status: "playing",
              currentPlayerId: "p1",
              playsRemaining: 2,
              drawPileCount: 80,
              discardCount: 1,
              boards: [
                { participantId: "p1", bank: [], propertySets: {}, handCount: 5 },
                { participantId: "p2", bank: [], propertySets: {}, handCount: 5 }
              ],
              myHand: [],
              pot: 2,
              wagers: { p1: 1, p2: 1 },
              pendingResolution: null,
              phase: "playing",
              recentEvent: null,
              recentEvents: [],
              eventSeq: 1,
              canCancelPendingAction: false,
              undoableBankCardId: null,
              actionLog: [{ id: "e1", actorId: "p1", summary: "banked 3M (3M)" }],
              justSayNoLate: null
            }
          }
        })}
        currentParticipantId="p1"
        isHost
        canPlay
        send={vi.fn()}
        apiBase="http://localhost:3000"
      />
    );

    const feed = screen.getByLabelText(/game action feed/i);
    expect(feed).toBeTruthy();
    expect(feed.textContent).toMatch(/banked 3M/i);
    expect(feed.textContent).toMatch(/Host/i);
  });
});
