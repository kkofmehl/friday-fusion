import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SessionState } from "../../../shared/contracts";
import { TurnOrderPanel } from "./TurnOrderPanel";

const buildSession = (): SessionState => ({
  sessionId: "s1",
  sessionName: "Test",
  joinCode: "BRIGHT-OTTER",
  participants: [
    { id: "p1", displayName: "Alice", score: 0, isHost: true },
    { id: "p2", displayName: "Bob", score: 0, isHost: false },
    { id: "p3", displayName: "Carol", score: 0, isHost: false }
  ],
  activeGame: "hangman",
  gameState: {
    type: "hangman",
    state: {
      puzzleCreatorId: "p1",
      maskedWord: "C_T",
      guessedLetters: ["C", "T"],
      wrongGuessCount: 0,
      maxWrongGuesses: 6,
      status: "inProgress",
      revealedWord: null,
      mode: "turns",
      currentTurnId: "p2",
      activeSolverId: null,
      activityLog: []
    }
  }
});

describe("TurnOrderPanel", () => {
  it("lists non-creator guessers in session order", () => {
    render(
      <TurnOrderPanel
        session={buildSession()}
        currentParticipantId="p2"
        puzzleCreatorId="p1"
        currentTurnId="p2"
        isHost={false}
        send={vi.fn()}
      />
    );
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]?.textContent).toContain("Bob");
    expect(items[1]?.textContent).toContain("Carol");
    expect(screen.queryByText("Alice")).toBeNull();
  });

  it("sends hangman:setTurn when the host clicks a different guesser", () => {
    const send = vi.fn();
    render(
      <TurnOrderPanel
        session={buildSession()}
        currentParticipantId="p1"
        puzzleCreatorId="p1"
        currentTurnId="p2"
        isHost
        send={send}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /Carol/ }));
    expect(send).toHaveBeenCalledWith({
      type: "hangman:setTurn",
      payload: { participantId: "p3" }
    });
  });

  it("does not fire setTurn when clicking the already-current guesser", () => {
    const send = vi.fn();
    render(
      <TurnOrderPanel
        session={buildSession()}
        currentParticipantId="p1"
        puzzleCreatorId="p1"
        currentTurnId="p2"
        isHost
        send={send}
      />
    );
    fireEvent.click(screen.getByRole("button", { pressed: true }));
    expect(send).not.toHaveBeenCalled();
  });

  it("non-host sees entries as non-interactive", () => {
    render(
      <TurnOrderPanel
        session={buildSession()}
        currentParticipantId="p2"
        puzzleCreatorId="p1"
        currentTurnId="p2"
        isHost={false}
        send={vi.fn()}
      />
    );
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryByText(/Drag to reorder/)).toBeNull();
  });

  it("reorders participants on drop and sends session:reorderParticipants with the full order", () => {
    const send = vi.fn();
    render(
      <TurnOrderPanel
        session={buildSession()}
        currentParticipantId="p1"
        puzzleCreatorId="p1"
        currentTurnId="p2"
        isHost
        send={send}
      />
    );
    const items = screen.getAllByRole("listitem");
    const dataTransfer = { effectAllowed: "", dropEffect: "", setData: vi.fn(), getData: vi.fn() };
    fireEvent.dragStart(items[0]!, { dataTransfer });
    fireEvent.dragOver(items[1]!, { dataTransfer });
    fireEvent.drop(items[1]!, { dataTransfer });

    expect(send).toHaveBeenCalledWith({
      type: "session:reorderParticipants",
      payload: { participantIds: ["p1", "p3", "p2"] }
    });
  });
});
