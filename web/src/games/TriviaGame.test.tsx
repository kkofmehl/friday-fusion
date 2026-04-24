import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SessionState } from "../../../shared/contracts";
import { TriviaGame } from "./TriviaGame";

const question = {
  id: "q1",
  category: "science",
  difficulty: "easy" as const,
  question: "What planet is known as the Red Planet?",
  options: ["Earth", "Mars", "Jupiter", "Venus"],
  correctAnswer: "Mars"
};

const session: SessionState = {
  sessionId: "s1",
  sessionName: "Test",
  joinCode: "BRIGHT-OTTER",
  participants: [
    { id: "p1", displayName: "Alice", score: 0, isHost: true },
    { id: "p2", displayName: "Bob", score: 0, isHost: false }
  ],
  activeGame: "trivia",
  gameState: {
    type: "trivia",
    state: {
      questionIndex: 0,
      totalQuestions: 3,
      activeQuestion: question,
      answers: {},
      status: "questionOpen"
    }
  }
};

describe("TriviaGame", () => {
  it("sends an answer when an option is clicked", () => {
    const send = vi.fn();
    render(
      <TriviaGame session={session} currentParticipantId="p2" isHost={false} send={send} />
    );
    fireEvent.click(screen.getByRole("button", { name: "Mars" }));
    expect(send).toHaveBeenCalledWith({ type: "trivia:answer", payload: { answer: "Mars" } });
  });

  it("highlights the correct answer after close", () => {
    const closedSession: SessionState = {
      ...session,
      gameState: {
        type: "trivia",
        state: {
          ...session.gameState!.type === "trivia" ? (session.gameState!.state as any) : {},
          answers: { p2: "Mars" },
          status: "questionClosed"
        } as any
      }
    };
    render(
      <TriviaGame session={closedSession} currentParticipantId="p2" isHost={false} send={vi.fn()} />
    );
    expect(screen.getByText(/Correct answer:/)).toBeDefined();
  });
});
