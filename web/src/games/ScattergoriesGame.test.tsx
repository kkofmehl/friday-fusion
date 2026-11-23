import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => []
      })
    );
  });

  it("keeps local typing when a stale session echo arrives mid-keystroke", () => {
    const send = vi.fn();
    const roundEndsAt = Date.now() + 60_000;
    const answering = (answers: Record<string, string[]>): ScattergoriesState => ({
      status: "answering",
      listId: "scat-001",
      listTitle: "Around the house",
      prompts: ["Something in the kitchen", "A tool"],
      letter: "S",
      answerDurationMs: 60_000,
      usedListIds: ["scat-001"],
      usedLetters: ["S"],
      roundEndsAt,
      answers
    });
    const { rerender } = render(
      <ScattergoriesGame
        session={sessionWithState(answering({ host: ["", ""] }))}
        currentParticipantId="host"
        isHost
        canPlay
        send={send}
        apiBase="http://localhost:3000"
      />
    );
    const input = screen.getByLabelText(/1\.\s*Something in the kitchen/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Spoo" } });
    expect(input.value).toBe("Spoo");

    // Echo of an older snapshot (and another player's answers) must not wipe local draft.
    rerender(
      <ScattergoriesGame
        session={sessionWithState(
          answering({
            host: ["S"],
            p2: ["Saw"]
          })
        )}
        currentParticipantId="host"
        isHost
        canPlay
        send={send}
        apiBase="http://localhost:3000"
      />
    );
    expect((screen.getByLabelText(/1\.\s*Something in the kitchen/i) as HTMLInputElement).value).toBe(
      "Spoo"
    );

    fireEvent.change(screen.getByLabelText(/1\.\s*Something in the kitchen/i), {
      target: { value: "Spoon" }
    });
    expect((screen.getByLabelText(/1\.\s*Something in the kitchen/i) as HTMLInputElement).value).toBe(
      "Spoon"
    );
  });

  it("resets answer fields when a new answering round starts", () => {
    const send = vi.fn();
    const firstRound: ScattergoriesState = {
      status: "answering",
      listId: "scat-001",
      listTitle: "Around the house",
      prompts: ["Something in the kitchen", "A tool"],
      letter: "S",
      answerDurationMs: 60_000,
      usedListIds: ["scat-001"],
      usedLetters: ["S"],
      roundEndsAt: Date.now() + 60_000,
      answers: { host: ["Spoon", ""] }
    };
    const { rerender } = render(
      <ScattergoriesGame
        session={sessionWithState(firstRound)}
        currentParticipantId="host"
        isHost
        canPlay
        send={send}
        apiBase="http://localhost:3000"
      />
    );
    expect((screen.getByLabelText(/1\.\s*Something in the kitchen/i) as HTMLInputElement).value).toBe(
      "Spoon"
    );

    const nextRound: ScattergoriesState = {
      ...firstRound,
      letter: "T",
      usedLetters: ["S", "T"],
      roundEndsAt: Date.now() + 90_000,
      answers: { host: ["", ""] }
    };
    rerender(
      <ScattergoriesGame
        session={sessionWithState(nextRound)}
        currentParticipantId="host"
        isHost
        canPlay
        send={send}
        apiBase="http://localhost:3000"
      />
    );
    expect((screen.getByLabelText(/1\.\s*Something in the kitchen/i) as HTMLInputElement).value).toBe(
      ""
    );
  });

  it("flushes pending answers when leaving the answering phase", () => {
    vi.useFakeTimers();
    const send = vi.fn();
    const roundEndsAt = Date.now() + 60_000;
    const answering: ScattergoriesState = {
      status: "answering",
      listId: "scat-001",
      listTitle: "Around the house",
      prompts: ["Something in the kitchen"],
      letter: "S",
      answerDurationMs: 60_000,
      usedListIds: ["scat-001"],
      usedLetters: ["S"],
      roundEndsAt,
      answers: { host: [""] }
    };
    const reviewing: ScattergoriesState = {
      status: "reviewing",
      listId: "scat-001",
      listTitle: "Around the house",
      prompts: ["Something in the kitchen"],
      letter: "S",
      answerDurationMs: 60_000,
      usedListIds: ["scat-001"],
      usedLetters: ["S"],
      currentPromptIndex: 0,
      revealedAnswers: [{ participantId: "host", text: "Spoon", isDuplicate: false }],
      verdicts: { host: null },
      awardedPoints: {}
    };
    const { rerender } = render(
      <ScattergoriesGame
        session={sessionWithState(answering)}
        currentParticipantId="host"
        isHost
        canPlay
        send={send}
        apiBase="http://localhost:3000"
      />
    );
    fireEvent.change(screen.getByLabelText(/1\.\s*Something in the kitchen/i), {
      target: { value: "Spoon" }
    });
    expect(send).not.toHaveBeenCalled();
    act(() => {
      rerender(
        <ScattergoriesGame
          session={sessionWithState(reviewing)}
          currentParticipantId="host"
          isHost
          canPlay
          send={send}
          apiBase="http://localhost:3000"
        />
      );
    });
    expect(send).toHaveBeenCalledWith({
      type: "scattergories:updateAnswers",
      payload: { answers: ["Spoon"] }
    });
    vi.useRealTimers();
  });

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

  it("shows invalid styling when the same word is used on multiple prompts", () => {
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
      answers: { host: ["Spoon", ""] }
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
    const kitchen = screen.getByLabelText(/1\.\s*Something in the kitchen/i);
    const tool = screen.getByLabelText(/2\.\s*A tool/i);
    fireEvent.change(kitchen, { target: { value: "Spoon" } });
    fireEvent.change(tool, { target: { value: "spoon" } });
    expect(kitchen.className).toContain("scattergories-input--invalid");
    expect(tool.className).toContain("scattergories-input--invalid");
    fireEvent.change(tool, { target: { value: "Saw" } });
    expect(kitchen.className).not.toContain("scattergories-input--invalid");
    expect(tool.className).not.toContain("scattergories-input--invalid");
  });

  it("disables accept for duplicate answers and auto-scores blanks during review", () => {
    const send = vi.fn();
    const state: ScattergoriesState = {
      status: "reviewing",
      listId: "scat-001",
      listTitle: "Around the house",
      prompts: ["Something in the kitchen", "A tool"],
      letter: "S",
      answerDurationMs: 60_000,
      usedListIds: ["scat-001"],
      usedLetters: ["S"],
      currentPromptIndex: 0,
      revealedAnswers: [
        { participantId: "host", text: "Spoon", isDuplicate: true },
        { participantId: "p2", text: "", isDuplicate: false }
      ],
      verdicts: { host: null, p2: "invalid" },
      awardedPoints: {}
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
    expect(screen.getByText(/duplicate word/i)).toBeTruthy();
    expect(screen.getByText(/no point \(blank\)/i)).toBeTruthy();
    const acceptHost = screen.getByRole("button", { name: /accept answer from host/i });
    expect((acceptHost as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: /accept answer from guest/i })).toBeNull();
    const nextBtn = screen.getByRole("button", { name: /next prompt|finish round/i });
    expect((nextBtn as HTMLButtonElement).disabled).toBe(true);
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
        { participantId: "host", text: "Spoon", isDuplicate: false },
        { participantId: "p2", text: "Soup", isDuplicate: false }
      ],
      verdicts: { host: "valid", p2: null },
      awardedPoints: { host: 1 }
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

  it("shows a points input for multi-word answers and sends the edited total on accept", () => {
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
        { participantId: "p2", text: "Silly Silo", isDuplicate: false },
        { participantId: "host", text: "Spoon", isDuplicate: false }
      ],
      verdicts: { host: null, p2: null },
      awardedPoints: {}
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
    const multiInput = screen.getByLabelText(/points for guest/i) as HTMLInputElement;
    expect(multiInput.value).toBe("2");
    expect(screen.queryByLabelText(/points for host/i)).toBeNull();
    fireEvent.change(multiInput, { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: /accept answer from guest/i }));
    expect(send).toHaveBeenCalledWith({
      type: "scattergories:markAnswer",
      payload: {
        promptIndex: 0,
        participantId: "p2",
        valid: true,
        points: 1
      }
    });
    fireEvent.click(screen.getByRole("button", { name: /accept answer from host/i }));
    expect(send).toHaveBeenCalledWith({
      type: "scattergories:markAnswer",
      payload: {
        promptIndex: 0,
        participantId: "host",
        valid: true
      }
    });
  });
});
