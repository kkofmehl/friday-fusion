import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionState } from "../../../shared/contracts";
import { GuessWhoSaidItGame } from "./GuessWhoSaidItGame";

const idleSession = (): SessionState => ({
  sessionId: "s1",
  sessionName: "Test",
  joinCode: "BRIGHT-OTTER",
  participants: [
    { id: "p1", displayName: "Alice", score: 0, isHost: true },
    { id: "p2", displayName: "Bob", score: 0, isHost: false }
  ],
  activeGame: "guessWhoSaidIt",
  gameState: {
    type: "guessWhoSaidIt",
    state: {
      questionIndex: 0,
      totalQuestions: 1,
      activeQuestion: null,
      submittedParticipantIds: [],
      usedQuestionIds: [],
      status: "idle"
    }
  }
});

describe("GuessWhoSaidItGame", () => {
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
      <GuessWhoSaidItGame
        session={idleSession()}
        currentParticipantId="p1"
        isHost
        send={send}
        apiBase="http://localhost:3000"
      />
    );
    fireEvent.change(screen.getByLabelText("How many prompts?"), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: "Start round" }));
    expect(send).toHaveBeenCalledWith({ type: "guessWhoSaidIt:startRound", payload: { totalQuestions: 4 } });
  });

  it("sends beginVoting from votingReady when host clicks", () => {
    const send = vi.fn();
    const session: SessionState = {
      ...idleSession(),
      gameState: {
        type: "guessWhoSaidIt",
        state: {
          questionIndex: 1,
          totalQuestions: 1,
          activeQuestion: null,
          submittedParticipantIds: [],
          usedQuestionIds: [],
          status: "votingReady"
        }
      }
    };
    render(
      <GuessWhoSaidItGame session={session} currentParticipantId="p1" isHost send={send} apiBase="" />
    );
    fireEvent.click(screen.getByRole("button", { name: "Begin guessing" }));
    expect(send).toHaveBeenCalledWith({ type: "guessWhoSaidIt:beginVoting", payload: {} });
  });

  it("submits votes when all slots selected (other players only)", () => {
    const send = vi.fn();
    const session: SessionState = {
      ...idleSession(),
      gameState: {
        type: "guessWhoSaidIt",
        state: {
          status: "voting",
          usedQuestionIds: [],
          currentQuestionIndex: 0,
          totalQuestions: 1,
          prompt: {
            question: { id: "q1", text: "Worst job?" },
            slots: [
              { slotId: "slot-a", text: "Foo", imageUrl: null },
              { slotId: "slot-b", text: "Bar", imageUrl: null }
            ]
          },
          votedParticipantIds: [],
          allVotesIn: false,
          hasVoted: false
        }
      }
    };
    render(
      <GuessWhoSaidItGame session={session} currentParticipantId="p1" isHost send={send} apiBase="" />
    );
    const selects = screen.getAllByRole("combobox");
    // p1 only sees p2 in the list (cannot guess self)
    fireEvent.change(selects[0]!, { target: { value: "p2" } });
    fireEvent.change(selects[1]!, { target: { value: "p2" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit my guesses" }));
    expect(send).toHaveBeenCalledWith({
      type: "guessWhoSaidIt:setVotes",
      payload: { votes: { "slot-a": "p2", "slot-b": "p2" } }
    });
  });

  it("sends advancePrompt from promptReveal when host continues", () => {
    const send = vi.fn();
    const session: SessionState = {
      ...idleSession(),
      gameState: {
        type: "guessWhoSaidIt",
        state: {
          status: "promptReveal",
          usedQuestionIds: ["q1"],
          currentQuestionIndex: 0,
          totalQuestions: 2,
          reveal: {
            question: { id: "q1", text: "Test?" },
            revealedAnswers: [
              { slotId: "s1", authorId: "p1", text: "A", imageUrl: null },
              { slotId: "s2", authorId: "p2", text: "B", imageUrl: null }
            ],
            byVoter: [
              {
                voterId: "p1",
                rows: [
                  {
                    slotId: "s2",
                    guessedParticipantId: "p2",
                    actualAuthorId: "p2",
                    correct: true,
                    pointsEarned: 1
                  }
                ],
                pointsThisPrompt: 1
              },
              {
                voterId: "p2",
                rows: [
                  {
                    slotId: "s1",
                    guessedParticipantId: "p1",
                    actualAuthorId: "p1",
                    correct: true,
                    pointsEarned: 1
                  }
                ],
                pointsThisPrompt: 1
              }
            ]
          }
        }
      }
    };
    render(
      <GuessWhoSaidItGame session={session} currentParticipantId="p1" isHost send={send} apiBase="" />
    );
    fireEvent.click(screen.getByRole("button", { name: "Next prompt" }));
    expect(send).toHaveBeenCalledWith({ type: "guessWhoSaidIt:advancePrompt", payload: {} });
  });

  it("shows final summary button label on last prompt reveal", () => {
    const send = vi.fn();
    const session: SessionState = {
      ...idleSession(),
      gameState: {
        type: "guessWhoSaidIt",
        state: {
          status: "promptReveal",
          usedQuestionIds: ["q1"],
          currentQuestionIndex: 0,
          totalQuestions: 1,
          reveal: {
            question: { id: "q1", text: "Only?" },
            revealedAnswers: [{ slotId: "s1", authorId: "p2", text: "Hi", imageUrl: null }],
            byVoter: [
              {
                voterId: "p1",
                rows: [
                  {
                    slotId: "s1",
                    guessedParticipantId: "p2",
                    actualAuthorId: "p2",
                    correct: true,
                    pointsEarned: 1
                  }
                ],
                pointsThisPrompt: 1
              }
            ]
          }
        }
      }
    };
    render(
      <GuessWhoSaidItGame session={session} currentParticipantId="p1" isHost send={send} apiBase="" />
    );
    fireEvent.click(screen.getByRole("button", { name: "View final summary" }));
    expect(send).toHaveBeenCalledWith({ type: "guessWhoSaidIt:advancePrompt", payload: {} });
  });

  it("shows standings on round summary", () => {
    const session: SessionState = {
      ...idleSession(),
      gameState: {
        type: "guessWhoSaidIt",
        state: {
          status: "roundSummary",
          usedQuestionIds: ["q1"],
          totalQuestions: 1,
          standings: [
            { participantId: "p1", correctGuesses: 2 },
            { participantId: "p2", correctGuesses: 1 }
          ]
        }
      }
    };
    render(
      <GuessWhoSaidItGame
        session={session}
        currentParticipantId="p1"
        isHost={false}
        send={vi.fn()}
        apiBase=""
      />
    );
    expect(screen.getByText("Alice")).toBeTruthy();
    expect(screen.getByText("2 correct")).toBeTruthy();
    expect(screen.getByText("Bob")).toBeTruthy();
    expect(screen.getByText("1 correct")).toBeTruthy();
  });
});
