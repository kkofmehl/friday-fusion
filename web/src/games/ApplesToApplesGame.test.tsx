import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SessionState } from "../../../shared/contracts";
import { ApplesToApplesGame } from "./ApplesToApplesGame";

const baseSession = (): SessionState => ({
  sessionId: "s1",
  sessionName: "Test",
  joinCode: "BRIGHT-OTTER",
  participants: [
    { id: "p1", displayName: "Alice", score: 0, isHost: true, isActive: true },
    { id: "p2", displayName: "Bob", score: 0, isHost: false, isActive: true },
    { id: "p3", displayName: "Cara", score: 0, isHost: false, isActive: true }
  ],
  activeGame: "applesToApples",
  gameState: {
    type: "applesToApples",
    state: {
      status: "collecting",
      mode: "standard",
      topicText: "Absurd",
      topicId: "t1",
      judgeId: "p1",
      roundNumber: 1,
      isJudge: false,
      submittedNonJudgeIds: [],
      allSubmissionsIn: false,
      myHand: [
        { id: "c1", text: "Rubber duck" },
        { id: "c2", text: "Traffic jam" }
      ]
    }
  }
});

describe("ApplesToApplesGame", () => {
  it("sends submitCard when a non-judge picks a hand card", () => {
    const send = vi.fn();
    render(
      <ApplesToApplesGame
        session={baseSession()}
        currentParticipantId="p2"
        isHost={false}
        canPlay
        send={send}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /Rubber duck/i }));
    expect(send).toHaveBeenCalledWith({
      type: "applesToApples:submitCard",
      payload: { cardId: "c1" }
    });
  });

  it("shows all submitted cards to non-judges while the judge decides", () => {
    const session: SessionState = {
      ...baseSession(),
      gameState: {
        type: "applesToApples",
        state: {
          status: "judging",
          mode: "standard",
          topicText: "Absurd",
          topicId: "t1",
          judgeId: "p1",
          roundNumber: 1,
          isJudge: false,
          anonymousOptions: [
            { entryId: "e1", text: "Rubber duck" },
            { entryId: "e2", text: "Elevator music" }
          ],
          waitingForJudge: true
        }
      }
    };
    render(
      <ApplesToApplesGame session={session} currentParticipantId="p2" isHost={false} canPlay send={vi.fn()} />
    );
    expect(screen.getByText("Rubber duck")).toBeTruthy();
    expect(screen.getByText("Elevator music")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Rubber duck/i })).toBeNull();
  });

  it("sends judgePick when the judge selects an anonymous option", () => {
    const send = vi.fn();
    const session: SessionState = {
      ...baseSession(),
      gameState: {
        type: "applesToApples",
        state: {
          status: "judging",
          mode: "standard",
          topicText: "Absurd",
          topicId: "t1",
          judgeId: "p1",
          roundNumber: 1,
          isJudge: true,
          anonymousOptions: [
            { entryId: "e1", text: "Rubber duck" },
            { entryId: "e2", text: "Elevator music" }
          ],
          waitingForJudge: false
        }
      }
    };
    render(
      <ApplesToApplesGame
        session={session}
        currentParticipantId="p1"
        isHost
        canPlay
        send={send}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /Elevator music/i }));
    expect(send).toHaveBeenCalledWith({
      type: "applesToApples:judgePick",
      payload: { entryId: "e2" }
    });
  });

  it("host sends beginNextRound from round result", () => {
    const send = vi.fn();
    const session: SessionState = {
      ...baseSession(),
      gameState: {
        type: "applesToApples",
        state: {
          status: "roundResult",
          mode: "finite",
          topicText: "Absurd",
          winningEntryId: "e1",
          winnerParticipantId: "p2",
          winningText: "Rubber duck",
          roundNumber: 2,
          revealedSubmissions: [
            { entryId: "e1", participantId: "p2", text: "Rubber duck" },
            { entryId: "e2", participantId: "p3", text: "Elevator music" }
          ],
          canContinue: true
        }
      }
    };
    render(
      <ApplesToApplesGame session={session} currentParticipantId="p1" isHost canPlay send={send} />
    );
    fireEvent.click(screen.getByRole("button", { name: /Next round/i }));
    expect(send).toHaveBeenCalledWith({ type: "applesToApples:beginNextRound", payload: {} });
  });
});
