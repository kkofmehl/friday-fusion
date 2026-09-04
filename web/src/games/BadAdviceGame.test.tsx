import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SessionState } from "../../../shared/contracts";
import { BadAdviceGame } from "./BadAdviceGame";

const players = [
  { id: "a", displayName: "Ann", score: 0, isHost: true, isActive: true },
  { id: "b", displayName: "Bob", score: 0, isHost: false, isActive: true }
];

const baseSession = (overrides: Partial<SessionState> = {}): SessionState => ({
  sessionId: "s1",
  sessionName: "Test",
  joinCode: "TEST",
  participants: players,
  activeGame: "badAdvice",
  gameState: {
    type: "badAdvice",
    state: {
      status: "collecting",
      roundNumber: 1,
      totalRounds: 5,
      prompt: { id: "ba-001", text: "How do I go about buying a car?" },
      submittedParticipantIds: [],
      allAdviceIn: false,
      myAdvice: null
    }
  },
  ...overrides
});

describe("BadAdviceGame", () => {
  it("submits advice from the collecting phase", () => {
    const send = vi.fn();
    render(
      <BadAdviceGame session={baseSession()} currentParticipantId="a" isHost send={send} />
    );
    fireEvent.change(screen.getByLabelText(/Your worst advice/i), {
      target: { value: "Never check the odometer." }
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit advice" }));
    expect(send).toHaveBeenCalledWith({
      type: "badAdvice:submitAdvice",
      payload: { text: "Never check the odometer." }
    });
  });

  it("lets host start voting early once two people have submitted", () => {
    const send = vi.fn();
    render(
      <BadAdviceGame
        session={baseSession({
          gameState: {
            type: "badAdvice",
            state: {
              status: "collecting",
              roundNumber: 1,
              totalRounds: 5,
              prompt: { id: "ba-001", text: "How do I go about buying a car?" },
              submittedParticipantIds: ["a", "b"],
              allAdviceIn: true,
              myAdvice: "Never check the odometer."
            }
          }
        })}
        currentParticipantId="a"
        isHost
        send={send}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Start voting" }));
    expect(send).toHaveBeenCalledWith({ type: "badAdvice:beginVoting", payload: {} });
  });

  it("casts a vote during the voting phase", () => {
    const send = vi.fn();
    render(
      <BadAdviceGame
        session={baseSession({
          gameState: {
            type: "badAdvice",
            state: {
              status: "voting",
              roundNumber: 1,
              totalRounds: 5,
              prompt: { id: "ba-001", text: "How do I go about buying a car?" },
              displayEntries: [
                { entryId: "e1", text: "My advice" },
                { entryId: "e2", text: "Other advice" }
              ],
              myEntryId: "e1",
              votedParticipantIds: [],
              hasVoted: false,
              allVotesIn: false
            }
          }
        })}
        currentParticipantId="a"
        isHost={false}
        send={send}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Vote for this" }));
    expect(send).toHaveBeenCalledWith({
      type: "badAdvice:vote",
      payload: { entryId: "e2" }
    });
  });

  it("advances from results when the host clicks next round", () => {
    const send = vi.fn();
    render(
      <BadAdviceGame
        session={baseSession({
          gameState: {
            type: "badAdvice",
            state: {
              status: "results",
              roundNumber: 1,
              totalRounds: 5,
              prompt: { id: "ba-001", text: "How do I go about buying a car?" },
              tallies: [
                { entryId: "e1", authorId: "a", text: "Mine", voteCount: 0 },
                { entryId: "e2", authorId: "b", text: "Theirs", voteCount: 1 }
              ],
              winnerEntryIds: ["e2"]
            }
          }
        })}
        currentParticipantId="a"
        isHost
        send={send}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Next round" }));
    expect(send).toHaveBeenCalledWith({ type: "badAdvice:beginNextRound", payload: {} });
  });
});
