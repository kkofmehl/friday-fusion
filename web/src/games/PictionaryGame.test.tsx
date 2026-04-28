import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { SessionState } from "../../../shared/contracts";
import { PictionaryGame } from "./PictionaryGame";

beforeAll(() => {
  const stub2d = {
    setTransform: vi.fn(),
    fillStyle: "",
    fillRect: vi.fn(),
    lineCap: "",
    lineJoin: "",
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    globalCompositeOperation: "source-over"
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (this: HTMLCanvasElement, type) {
    if (type === "2d") {
      return stub2d as unknown as CanvasRenderingContext2D;
    }
    return null;
  });
});

afterAll(() => {
  vi.restoreAllMocks();
});

const baseSession = (): SessionState => ({
  sessionId: "s1",
  sessionName: "Test",
  joinCode: "TEST-CODE",
  participants: [
    { id: "p1", displayName: "Alice", score: 0, isHost: true },
    { id: "p2", displayName: "Bob", score: 0, isHost: false }
  ],
  activeGame: "pictionary",
  gameState: null
});

describe("PictionaryGame", () => {
  it("shows team setup and lets host save teams", () => {
    const send = vi.fn();
    const session: SessionState = {
      ...baseSession(),
      gameState: {
        type: "pictionary",
        state: {
          status: "teamSetup",
          roundDurationMs: 60_000,
          teamAIds: [],
          teamBIds: []
        }
      }
    };
    render(<PictionaryGame session={session} currentParticipantId="p1" isHost send={send} />);
    const aliceRow = screen.getByText(/Alice/).closest("li");
    if (!aliceRow) {
      throw new Error("expected Alice row");
    }
    fireEvent.click(within(aliceRow).getByRole("radio", { name: /^Team A$/i }));
    fireEvent.click(screen.getByRole("button", { name: /Save team lineup/i }));
    expect(send).toHaveBeenCalledWith({
      type: "pictionary:setTeams",
      payload: { teamAIds: ["p1"], teamBIds: [] }
    });
  });

  it("drawer sees prompt; other player does not", () => {
    const send = vi.fn();
    const drawingState = {
      status: "drawing" as const,
      roundDurationMs: 60_000,
      teamAIds: ["p1"],
      teamBIds: ["p2"],
      activeTeam: "A" as const,
      drawerId: "p1",
      roundStartedAt: Date.now(),
      roundEndsAt: Date.now() + 60_000,
      strokes: [],
      myPrompt: "Moon landing"
    };
    const { rerender } = render(
      <PictionaryGame
        session={{
          ...baseSession(),
          gameState: { type: "pictionary", state: { ...drawingState, myPrompt: "Moon landing" } }
        }}
        currentParticipantId="p1"
        isHost
        send={send}
      />
    );
    expect(screen.getByText(/Moon landing/i)).toBeTruthy();

    rerender(
      <PictionaryGame
        session={{
          ...baseSession(),
          gameState: { type: "pictionary", state: { ...drawingState, myPrompt: null } }
        }}
        currentParticipantId="p2"
        isHost={false}
        send={send}
      />
    );
    expect(screen.queryByText(/Moon landing/i)).toBeNull();
    expect(screen.getByText(/Alice is drawing/i)).toBeTruthy();
  });

  it("drawer guess button sends teamGuessed", () => {
    const send = vi.fn();
    render(
      <PictionaryGame
        session={{
          ...baseSession(),
          gameState: {
            type: "pictionary",
            state: {
              status: "drawing",
              roundDurationMs: 60_000,
              teamAIds: ["p1"],
              teamBIds: ["p2"],
              activeTeam: "A",
              drawerId: "p1",
              roundStartedAt: Date.now(),
              roundEndsAt: Date.now() + 60_000,
              strokes: [],
              myPrompt: "Cat"
            }
          }
        }}
        currentParticipantId="p1"
        isHost
        send={send}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /Someone on my team guessed it/i }));
    expect(send).toHaveBeenCalledWith({ type: "pictionary:teamGuessed", payload: {} });
  });
});
