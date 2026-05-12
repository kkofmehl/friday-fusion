import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { UnoGame } from "./UnoGame";
import type { SessionState } from "../../../shared/contracts";

const baseSession = (over: Partial<SessionState> = {}): SessionState => ({
  sessionId: "s1",
  sessionName: "Test",
  joinCode: "TEST",
  participants: [
    { id: "a", displayName: "Ann", score: 0, isHost: true, isActive: true },
    { id: "b", displayName: "Bob", score: 0, isHost: false, isActive: true }
  ],
  activeGame: "uno",
  gameState: {
    type: "uno",
    state: {
      status: "playing",
      currentPlayerId: "a",
      direction: 1,
      activeColor: "red",
      topDiscard: { id: "d0", color: "red", rank: 3 },
      handCounts: { a: 3, b: 4 },
      myHand: [
        { id: "c1", color: "red", rank: 5 },
        { id: "c2", color: "blue", rank: 3 }
      ],
      drawPileCount: 90,
      unoCatchOpenFor: null,
      unoCatchAllowedAfterMs: null,
      unoAnnouncedParticipantId: null,
      currentHasDrawn: false
    }
  },
  ...over
});

describe("UnoGame", () => {
  it("renders draw and shows your turn", () => {
    const send = vi.fn();
    render(
      <UnoGame
        session={baseSession()}
        currentParticipantId="a"
        isHost
        canPlay
        send={send}
      />
    );
    expect(screen.getByText("Your turn")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Draw a card/i })).toBeTruthy();
  });

  it("shows UNO announcement banner", () => {
    const send = vi.fn();
    const session = baseSession({
      gameState: {
        type: "uno",
        state: {
          status: "playing",
          currentPlayerId: "a",
          direction: 1,
          activeColor: "red",
          topDiscard: { id: "d0", color: "red", rank: 3 },
          handCounts: { a: 1, b: 4 },
          myHand: [{ id: "c1", color: "red", rank: 5 }],
          drawPileCount: 90,
          unoCatchOpenFor: null,
          unoCatchAllowedAfterMs: null,
          unoAnnouncedParticipantId: "b",
          currentHasDrawn: false
        }
      }
    });
    render(
      <UnoGame session={session} currentParticipantId="a" isHost canPlay send={send} />
    );
    expect(screen.getByRole("status").textContent).toMatch(/Bob called UNO/i);
  });

  it("hides catch action until delay elapses", () => {
    const send = vi.fn();
    const future = Date.now() + 8000;
    const session = baseSession({
      gameState: {
        type: "uno",
        state: {
          status: "playing",
          currentPlayerId: "a",
          direction: 1,
          activeColor: "red",
          topDiscard: { id: "d0", color: "red", rank: 3 },
          handCounts: { a: 3, b: 1 },
          myHand: [
            { id: "c1", color: "red", rank: 5 },
            { id: "c2", color: "blue", rank: 3 }
          ],
          drawPileCount: 90,
          unoCatchOpenFor: "b",
          unoCatchAllowedAfterMs: future,
          unoAnnouncedParticipantId: null,
          currentHasDrawn: false
        }
      }
    });
    render(
      <UnoGame session={session} currentParticipantId="a" isHost canPlay send={send} />
    );
    expect(screen.queryByRole("button", { name: /Catch missed UNO/i })).toBeNull();
    expect(screen.getByText(/Missed UNO can be called in/i)).toBeTruthy();
  });

  it("shows winner banner and host deal button on finished state (hooks stable)", () => {
    const send = vi.fn();
    const session = baseSession({
      participants: [
        { id: "a", displayName: "Ann", score: 0, isHost: true, isActive: true },
        { id: "b", displayName: "Bob", score: 5, isHost: false, isActive: true }
      ],
      gameState: {
        type: "uno",
        state: { status: "finished", winnerParticipantId: "b" }
      }
    });
    render(
      <UnoGame session={session} currentParticipantId="a" isHost canPlay send={send} />
    );
    expect(screen.getByRole("status").textContent).toMatch(/Winner/i);
    expect(screen.getByRole("status").textContent).toMatch(/Bob/);
    expect(screen.getByText(/score is now/i).textContent).toMatch(/5/);
    const deal = screen.getByRole("button", { name: /Deal new hand/i });
    deal.click();
    expect(send).toHaveBeenCalledWith({ type: "game:start", payload: { game: "uno" } });
  });

  it("finished state as guest shows no deal button", () => {
    const send = vi.fn();
    const session = baseSession({
      gameState: {
        type: "uno",
        state: { status: "finished", winnerParticipantId: "a" }
      }
    });
    render(
      <UnoGame session={session} currentParticipantId="b" isHost={false} canPlay send={send} />
    );
    expect(screen.queryByRole("button", { name: /Deal new hand/i })).toBeNull();
  });
});
