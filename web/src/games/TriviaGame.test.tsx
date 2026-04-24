import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionState, TriviaState } from "../../../shared/contracts";
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
      loading: null,
      status: "questionOpen"
    }
  }
};

const requireTriviaState = (state: SessionState): TriviaState => {
  if (state.gameState?.type !== "trivia") {
    throw new Error("Expected trivia game state");
  }
  return state.gameState.state;
};

describe("TriviaGame", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => []
    } as Response));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sends an answer when an option is clicked", () => {
    const send = vi.fn();
    render(
      <TriviaGame session={session} currentParticipantId="p2" isHost={false} send={send} apiBase="http://localhost:3000" />
    );
    fireEvent.click(screen.getByRole("button", { name: "Mars" }));
    expect(send).toHaveBeenCalledWith({ type: "trivia:answer", payload: { answer: "Mars" } });
  });

  it("highlights the correct answer after close", () => {
    const baseTriviaState = requireTriviaState(session);
    const closedSession: SessionState = {
      ...session,
      gameState: {
        type: "trivia",
        state: {
          ...baseTriviaState,
          answers: { p2: "Mars" },
          loading: null,
          status: "questionClosed"
        }
      }
    };
    render(
      <TriviaGame
        session={closedSession}
        currentParticipantId="p2"
        isHost={false}
        send={vi.fn()}
        apiBase="http://localhost:3000"
      />
    );
    expect(screen.getByText(/Correct answer:/)).toBeDefined();
  });

  it("only shows the host check button after everyone answers", () => {
    const hostView = (stateOverrides: Partial<TriviaState>): SessionState => ({
      ...session,
      gameState: {
        type: "trivia",
        state: {
          questionIndex: 0,
          totalQuestions: 3,
          activeQuestion: question,
          answers: {},
          loading: null,
          status: "questionOpen",
          ...stateOverrides
        }
      }
    });

    const { rerender } = render(
      <TriviaGame
        session={hostView({ answers: { p2: "Mars" } })}
        currentParticipantId="p1"
        isHost={true}
        send={vi.fn()}
        apiBase="http://localhost:3000"
      />
    );
    expect(screen.queryByRole("button", { name: "Check answers" })).toBeNull();
    expect(screen.getByText("1/2 answered")).toBeDefined();

    rerender(
      <TriviaGame
        session={hostView({ answers: { p1: "Earth", p2: "Mars" } })}
        currentParticipantId="p1"
        isHost={true}
        send={vi.fn()}
        apiBase="http://localhost:3000"
      />
    );
    expect(screen.getByRole("button", { name: "Check answers" })).toBeDefined();
    expect(screen.getByText("Everyone has answered. You can check answers now.")).toBeDefined();
  });

  it("sends selected setup options when host starts a round", () => {
    const send = vi.fn();
    const idleSession: SessionState = {
      ...session,
      gameState: {
        type: "trivia",
        state: {
          questionIndex: 0,
          totalQuestions: 5,
          activeQuestion: null,
          answers: {},
          loading: null,
          status: "idle"
        }
      }
    };
    render(
      <TriviaGame
        session={idleSession}
        currentParticipantId="p1"
        isHost={true}
        send={send}
        apiBase="http://localhost:3000"
      />
    );
    fireEvent.change(screen.getByLabelText("How many questions?"), { target: { value: "10" } });
    fireEvent.click(screen.getByLabelText("medium"));
    fireEvent.click(screen.getByLabelText("hard"));
    fireEvent.click(screen.getByRole("button", { name: "Start round" }));
    expect(send).toHaveBeenCalledWith({
      type: "trivia:start",
      payload: {
        totalQuestions: 10,
        categoryMode: "all",
        categoryId: undefined,
        difficulties: ["easy"]
      }
    });
  });

  it("shows progress while the round is loading", () => {
    const loadingSession: SessionState = {
      ...session,
      gameState: {
        type: "trivia",
        state: {
          questionIndex: 0,
          totalQuestions: 10,
          activeQuestion: null,
          answers: {},
          loading: {
            totalCalls: 3,
            completedCalls: 1,
            message: "Loaded batch 1 of 3."
          },
          status: "loading"
        }
      }
    };
    render(
      <TriviaGame
        session={loadingSession}
        currentParticipantId="p1"
        isHost={true}
        send={vi.fn()}
        apiBase="http://localhost:3000"
      />
    );
    expect(screen.getByText("Loaded batch 1 of 3.")).toBeDefined();
    expect(screen.getByText("1/3 API calls complete (33%)")).toBeDefined();
    expect(screen.getByRole("progressbar")).toBeDefined();
  });
});
