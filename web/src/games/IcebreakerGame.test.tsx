import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionState } from "../../../shared/contracts";
import { IcebreakerGame } from "./IcebreakerGame";

const baseSession = (): SessionState => ({
  sessionId: "s1",
  sessionName: "Test",
  joinCode: "BRIGHT-OTTER",
  participants: [
    { id: "p1", displayName: "Alice", score: 0, isHost: true },
    { id: "p2", displayName: "Bob", score: 0, isHost: false }
  ],
  activeGame: "icebreaker",
  gameState: {
    type: "icebreaker",
    state: {
      questionIndex: 0,
      totalQuestions: 2,
      activeQuestion: { id: "ib-1", text: "What makes you smile?" },
      submittedParticipantIds: [],
      revealed: [],
      usedQuestionIds: ["ib-1"],
      status: "idle"
    }
  }
});

describe("IcebreakerGame", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ fileId: "abc.png" })
      } as Response)
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sends startRound when host starts from idle", () => {
    const send = vi.fn();
    render(
      <IcebreakerGame
        session={baseSession()}
        currentParticipantId="p1"
        isHost
        send={send}
        apiBase="http://localhost:3000"
      />
    );
    fireEvent.change(screen.getByLabelText("How many questions?"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Start round" }));
    expect(send).toHaveBeenCalledWith({ type: "icebreaker:startRound", payload: { totalQuestions: 3 } });
  });

  it("sends submit with text when no image", () => {
    const send = vi.fn();
    const session: SessionState = {
      ...baseSession(),
      gameState: {
        type: "icebreaker",
        state: {
          questionIndex: 0,
          totalQuestions: 2,
          activeQuestion: { id: "ib-1", text: "What makes you smile?" },
          submittedParticipantIds: [],
          revealed: [],
          usedQuestionIds: ["ib-1"],
          status: "collecting"
        }
      }
    };
    render(
      <IcebreakerGame
        session={session}
        currentParticipantId="p2"
        isHost={false}
        send={send}
        apiBase="http://localhost:3000"
      />
    );
    fireEvent.change(screen.getByLabelText("Your answer"), { target: { value: "Sunshine" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(send).toHaveBeenCalledWith({
      type: "icebreaker:submit",
      payload: { text: "Sunshine", imageFileId: null }
    });
  });

  it("confirms before next question when a submitted player has not been revealed", () => {
    const send = vi.fn();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const session: SessionState = {
      ...baseSession(),
      gameState: {
        type: "icebreaker",
        state: {
          questionIndex: 0,
          totalQuestions: 2,
          activeQuestion: { id: "ib-1", text: "Q" },
          submittedParticipantIds: ["p1", "p2"],
          revealed: [{ participantId: "p1", text: "A", imageUrl: null }],
          usedQuestionIds: ["ib-1"],
          status: "revealing"
        }
      }
    };
    render(
      <IcebreakerGame session={session} currentParticipantId="p1" isHost send={send} apiBase="http://localhost:3000" />
    );
    fireEvent.click(screen.getByRole("button", { name: "Next question" }));
    expect(confirmSpy).toHaveBeenCalledWith(
      "There are still presenters left, are you sure you want to proceed to the next question?"
    );
    expect(send).not.toHaveBeenCalled();

    confirmSpy.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Next question" }));
    expect(send).toHaveBeenCalledWith({ type: "icebreaker:nextQuestion", payload: {} });
  });

  it("skips confirm for next question when every submission has been revealed", () => {
    const send = vi.fn();
    const confirmSpy = vi.spyOn(window, "confirm");
    const session: SessionState = {
      ...baseSession(),
      gameState: {
        type: "icebreaker",
        state: {
          questionIndex: 0,
          totalQuestions: 2,
          activeQuestion: { id: "ib-1", text: "Q" },
          submittedParticipantIds: ["p1", "p2"],
          revealed: [
            { participantId: "p1", text: "A", imageUrl: null },
            { participantId: "p2", text: "B", imageUrl: null }
          ],
          usedQuestionIds: ["ib-1"],
          status: "revealing"
        }
      }
    };
    render(
      <IcebreakerGame session={session} currentParticipantId="p1" isHost send={send} apiBase="http://localhost:3000" />
    );
    fireEvent.click(screen.getByRole("button", { name: "Next question" }));
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith({ type: "icebreaker:nextQuestion", payload: {} });
  });
});
