import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionState } from "../../../shared/contracts";
import { GuessTheImageGame } from "./GuessTheImageGame";

const guessImageSingleSetupDefaults = (): {
  setupMode: "single";
  everyoneBetweenRounds: boolean;
  selectedRoundParticipantId: string | null;
  everyonePeers: { participantId: string; configured: boolean }[];
  everyoneMySetup: null;
  everyoneAllConfigured: boolean;
} => ({
  setupMode: "single",
  everyoneBetweenRounds: false,
  selectedRoundParticipantId: null,
  everyonePeers: [],
  everyoneMySetup: null,
  everyoneAllConfigured: false
});

const baseSession = (overrides: Partial<SessionState> = {}): SessionState => ({
  sessionId: "s1",
  sessionName: "Test",
  joinCode: "BRIGHT-OTTER",
  participants: [
    { id: "p1", displayName: "Alice", score: 0, isHost: true },
    { id: "p2", displayName: "Bob", score: 0, isHost: false }
  ],
  activeGame: "guessTheImage",
  gameState: {
    type: "guessTheImage",
    state: {
      status: "setup",
      ...guessImageSingleSetupDefaults(),
      setupParticipantId: "p1",
      imageUrl: null,
      descriptions: ["", "", "", ""],
      correctIndex: 0,
      revealDurationMs: 60_000,
      configured: false
    }
  },
  ...overrides
});

describe("GuessTheImageGame", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ fileId: "shot.png" })
      } as Response)
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sends configure after upload when host saves setup", async () => {
    const send = vi.fn();
    render(
      <GuessTheImageGame
        session={baseSession()}
        currentParticipantId="p1"
        isHost
        send={send}
        apiBase="http://localhost:3000"
      />
    );
    const file = new File([new Uint8Array([1, 2, 3])], "pic.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Image"), { target: { files: [file] } });
    fireEvent.change(screen.getByLabelText("Option 1"), { target: { value: "Cat" } });
    fireEvent.change(screen.getByLabelText("Option 2"), { target: { value: "Dog" } });
    fireEvent.change(screen.getByLabelText("Option 3"), { target: { value: "Bird" } });
    fireEvent.change(screen.getByLabelText("Option 4"), { target: { value: "Fish" } });
    fireEvent.click(screen.getByRole("button", { name: "Save setup" }));
    await vi.waitFor(() => {
      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "guessImage:configure",
          payload: expect.objectContaining({
            imageFileId: "shot.png",
            descriptions: ["Cat", "Dog", "Bird", "Fish"],
            correctIndex: 0,
            revealDurationMs: 60_000
          })
        })
      );
    });
  });

  it("shows waiting for the setup player when host assigned someone else", () => {
    const session = baseSession({
      gameState: {
        type: "guessTheImage",
        state: {
          status: "setup",
          ...guessImageSingleSetupDefaults(),
          setupParticipantId: "p2",
          imageUrl: null,
          descriptions: ["", "", "", ""],
          correctIndex: 0,
          revealDurationMs: 60_000,
          configured: false
        }
      }
    });
    const { container } = render(
      <GuessTheImageGame session={session} currentParticipantId="p1" isHost send={vi.fn()} apiBase="http://localhost:3000" />
    );
    expect(container.querySelector(".guess-image.card p strong")?.textContent).toBe("Bob");
    expect(screen.queryByLabelText("Option 1")).toBeNull();
    expect(screen.getByLabelText("Who prepares this round?")).toBeTruthy();
  });

  it("sends start round when host clicks start", () => {
    const send = vi.fn();
    const session = baseSession({
      gameState: {
        type: "guessTheImage",
        state: {
          status: "setup",
          ...guessImageSingleSetupDefaults(),
          setupParticipantId: "p1",
          imageUrl: "/api/sessions/s1/guess-the-image/file/x.png",
          descriptions: ["A", "B", "C", "D"],
          correctIndex: 0,
          revealDurationMs: 60_000,
          configured: true
        }
      }
    });
    render(
      <GuessTheImageGame session={session} currentParticipantId="p1" isHost send={send} apiBase="http://localhost:3000" />
    );
    fireEvent.click(screen.getByRole("button", { name: "Start round" }));
    expect(send).toHaveBeenCalledWith({ type: "guessImage:startRound", payload: {} });
  });

  it("everyone mode finished: host sees next image vs start new round", () => {
    const send = vi.fn();
    const session = baseSession({
      gameState: {
        type: "guessTheImage",
        state: {
          status: "finished",
          setupMode: "everyone",
          setupParticipantId: "p2",
          imageUrl: null,
          options: ["A", "B", "C", "D"],
          correctDisplayIndex: 0,
          results: [],
          revealDurationMs: 60_000,
          roundStartedAt: Date.now() - 60_000
        }
      }
    });
    render(
      <GuessTheImageGame session={session} currentParticipantId="p1" isHost send={send} apiBase="http://localhost:3000" />
    );
    fireEvent.click(screen.getByRole("button", { name: "Select next image to guess" }));
    expect(send).toHaveBeenCalledWith({ type: "guessImage:beginNextRoundSelection", payload: {} });
    fireEvent.click(screen.getByRole("button", { name: "Start new round" }));
    expect(send).toHaveBeenCalledWith({ type: "guessImage:backToSetup", payload: {} });
  });

  it("sends backToSetup when host sets up a new round after finished", () => {
    const send = vi.fn();
    const session = baseSession({
      gameState: {
        type: "guessTheImage",
        state: {
          status: "finished",
          setupMode: "single",
          setupParticipantId: "p1",
          imageUrl: "/api/sessions/s1/guess-the-image/file/x.png",
          options: ["A", "B", "C", "D"],
          correctDisplayIndex: 0,
          results: [
            {
              participantId: "p2",
              choiceDisplayIndex: 1,
              correct: false,
              elapsedMs: 100,
              pointsAwarded: 0
            }
          ],
          revealDurationMs: 60_000,
          roundStartedAt: Date.now() - 60_000
        }
      }
    });
    render(
      <GuessTheImageGame session={session} currentParticipantId="p1" isHost send={send} apiBase="http://localhost:3000" />
    );
    fireEvent.click(screen.getByRole("button", { name: "New image (setup)" }));
    expect(send).toHaveBeenCalledWith({ type: "guessImage:backToSetup", payload: {} });
  });

  it("sends lock with display index for a player", () => {
    const send = vi.fn();
    const session = baseSession({
      gameState: {
        type: "guessTheImage",
        state: {
          status: "playing",
          setupParticipantId: "p1",
          imageUrl: "/api/sessions/s1/guess-the-image/file/x.png",
          options: ["Alpha", "Beta", "Gamma", "Delta"],
          roundStartedAt: Date.now() - 1000,
          revealDurationMs: 60_000,
          submittedParticipantIds: []
        }
      }
    });
    render(
      <GuessTheImageGame session={session} currentParticipantId="p2" isHost={false} send={send} apiBase="http://localhost:3000" />
    );
    fireEvent.click(screen.getByRole("button", { name: "Gamma" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit answer" }));
    expect(send).toHaveBeenCalledWith({ type: "guessImage:lock", payload: { choiceIndex: 2 } });
  });
});
