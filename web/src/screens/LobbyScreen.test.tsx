import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SessionState } from "../../../shared/contracts";
import { LobbyScreen } from "./LobbyScreen";

const buildSession = (): SessionState => ({
  sessionId: "s1",
  sessionName: "Test",
  joinCode: "BRIGHT-OTTER",
  participants: [
    { id: "p1", displayName: "Alice", score: 0, isHost: true },
    { id: "p2", displayName: "Bob", score: 0, isHost: false },
    { id: "p3", displayName: "Carol", score: 0, isHost: false }
  ],
  activeGame: null,
  gameState: null
});

describe("LobbyScreen", () => {
  it("sends selected creator and mode when starting hangman", () => {
    const send = vi.fn();
    render(
      <LobbyScreen session={buildSession()} currentParticipantId="p1" isHost send={send} />
    );

    fireEvent.click(screen.getByDisplayValue("turns"));
    fireEvent.change(screen.getByLabelText("Puzzle creator"), { target: { value: "p3" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Start" })[0]!);

    expect(send).toHaveBeenCalledWith({
      type: "game:start",
      payload: { game: "hangman", options: { hangmanMode: "turns", hangmanCreatorId: "p3" } }
    });
  });
});
