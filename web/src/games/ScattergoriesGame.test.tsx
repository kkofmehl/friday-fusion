import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ScattergoriesState, SessionState } from "../../../shared/contracts";
import { ScattergoriesGame } from "./ScattergoriesGame";

const baseParticipants = [
  { id: "host", displayName: "Host", score: 0, isHost: true, isActive: true },
  { id: "p2", displayName: "Guest", score: 0, isHost: false, isActive: true }
];

function sessionWithState(state: ScattergoriesState): SessionState {
  return {
    sessionId: "s1",
    sessionName: "Test",
    joinCode: "TEST-CODE",
    participants: baseParticipants,
    activeGame: "scattergories",
    gameState: { type: "scattergories", state }
  };
}

describe("ScattergoriesGame", () => {
  it("shows invalid styling when answer does not start with the letter", () => {
    const send = vi.fn();
    const state: ScattergoriesState = {
      status: "answering",
      listId: "scat-001",
      listTitle: "Around the house",
      prompts: ["Something in the kitchen", "A tool"],
      letter: "S",
      answerDurationMs: 60_000,
      usedListIds: ["scat-001"],
      usedLetters: ["S"],
      roundEndsAt: Date.now() + 60_000,
      answers: { host: ["", ""] }
    };
    render(
      <ScattergoriesGame
        session={sessionWithState(state)}
        currentParticipantId="host"
        isHost
        canPlay
        send={send}
        apiBase="http://localhost:3000"
      />
    );
    const input = screen.getByLabelText(/1\.\s*Something in the kitchen/i);
    fireEvent.change(input, { target: { value: "Apple" } });
    expect(input.className).toContain("scattergories-input--invalid");
    fireEvent.change(input, { target: { value: "Spoon" } });
    expect(input.className).not.toContain("scattergories-input--invalid");
  });

  it("disables next prompt until every answer is marked", () => {
    const send = vi.fn();
    const state: ScattergoriesState = {
      status: "reviewing",
      listId: "scat-001",
      listTitle: "Around the house",
      prompts: ["Something in the kitchen"],
      letter: "S",
      answerDurationMs: 60_000,
      usedListIds: ["scat-001"],
      usedLetters: ["S"],
      currentPromptIndex: 0,
      revealedAnswers: [
        { participantId: "host", text: "Spoon" },
        { participantId: "p2", text: "Soup" }
      ],
      verdicts: { host: "valid", p2: null }
    };
    render(
      <ScattergoriesGame
        session={sessionWithState(state)}
        currentParticipantId="host"
        isHost
        canPlay
        send={send}
        apiBase="http://localhost:3000"
      />
    );
    const nextBtn = screen.getByRole("button", { name: /next prompt|finish round/i });
    expect((nextBtn as HTMLButtonElement).disabled).toBe(true);
  });
});
