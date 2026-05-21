import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SessionState } from "../../../shared/contracts";
import { MemoryGame } from "./MemoryGame";

const baseSession = (overrides: Partial<SessionState> = {}): SessionState => ({
  sessionId: "s1",
  sessionName: "Test",
  joinCode: "TEST",
  participants: [
    { id: "a", displayName: "Ann", score: 0, isHost: true, isActive: true },
    { id: "b", displayName: "Bob", score: 0, isHost: false, isActive: true }
  ],
  activeGame: "memory",
  gameState: {
    type: "memory",
    state: {
      phase: "playing",
      boardSize: "30",
      cols: 6,
      rows: 5,
      currentPlayerId: "a",
      flippedCardIds: [],
      scores: { a: 0, b: 0 },
      cards: Array.from({ length: 30 }, (_, i) => ({
        id: `c${i}`,
        status: "hidden" as const
      }))
    }
  },
  ...overrides
});

describe("MemoryGame", () => {
  it("renders grid of face-down cards", () => {
    const send = vi.fn();
    render(
      <MemoryGame session={baseSession()} currentParticipantId="a" canPlay send={send} />
    );
    const grid = screen.getByRole("grid", { name: /memory cards/i });
    const buttons = grid.querySelectorAll("button.memory-card--btn");
    expect(buttons.length).toBe(30);
  });

  it("sends flip when active player clicks a hidden card", () => {
    const send = vi.fn();
    render(
      <MemoryGame session={baseSession()} currentParticipantId="a" canPlay send={send} />
    );
    const grid = screen.getByRole("grid", { name: /memory cards/i });
    const first = grid.querySelector("button.memory-card--btn");
    expect(first).not.toBeNull();
    fireEvent.click(first!);
    expect(send).toHaveBeenCalledWith({ type: "memory:flipCard", payload: { cardId: "c0" } });
  });

  it("does not flip when not your turn", () => {
    const send = vi.fn();
    render(
      <MemoryGame session={baseSession()} currentParticipantId="b" canPlay send={send} />
    );
    const grid = screen.getByRole("grid", { name: /memory cards/i });
    const first = grid.querySelector("button.memory-card--btn");
    expect(first).not.toBeNull();
    fireEvent.click(first!);
    expect(send).not.toHaveBeenCalled();
  });

  it("disables cards while resolving", () => {
    const send = vi.fn();
    const session = baseSession({
      gameState: {
        type: "memory",
        state: {
          phase: "resolving",
          boardSize: "30",
          cols: 6,
          rows: 5,
          currentPlayerId: "a",
          flippedCardIds: ["c0", "c1"],
          scores: { a: 0, b: 0 },
          resolveEndsAtMs: Date.now() + 2000,
          cards: [
            { id: "c0", status: "shown", iconSrc: "/game_icons/trivia.png", symbolId: "trivia" },
            { id: "c1", status: "shown", iconSrc: "/game_icons/hangman.png", symbolId: "hangman" },
            ...Array.from({ length: 28 }, (_, i) => ({
              id: `c${i + 2}`,
              status: "hidden" as const
            }))
          ]
        }
      }
    });
    render(<MemoryGame session={session} currentParticipantId="a" canPlay send={send} />);
    const grid = screen.getByRole("grid", { name: /memory cards/i });
    const hiddenBtn = grid.querySelector("button.memory-card--btn.memory-card--btn:not(.is-face-up)");
    expect(hiddenBtn?.hasAttribute("disabled")).toBe(true);
  });
});
