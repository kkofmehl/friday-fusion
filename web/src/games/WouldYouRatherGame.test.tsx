import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SessionState, WouldYouRatherState } from "../../../shared/contracts";
import { WouldYouRatherGame } from "./WouldYouRatherGame";

const baseState: WouldYouRatherState = {
  status: "questionOpen",
  totalQuestions: 3,
  questionIndex: 0,
  inSubmittedRound: false,
  allowParticipantSubmissions: true,
  activePrompt: {
    id: "wyr-1",
    optionA: "only text friends",
    optionB: "only call friends",
    source: "library",
    submittedByParticipantId: null
  },
  answeredParticipantIds: [],
  hasAnswered: false,
  selectedChoice: null,
  optionASelectedParticipantIds: [],
  optionBSelectedParticipantIds: [],
  results: null,
  pendingSubmissionsCount: 1,
  approvedSubmissionsRemaining: 0,
  hostPendingSubmissions: [
    {
      id: "sub-1",
      optionA: "camp in the woods",
      optionB: "stay in a city hotel",
      submittedByParticipantId: "p2"
    }
  ],
  hostApprovedSubmissions: []
};

const buildSession = (state: WouldYouRatherState): SessionState => ({
  sessionId: "s1",
  sessionName: "Friday",
  joinCode: "FRIDAY-TEAM",
  participants: [
    { id: "p1", displayName: "Host", score: 0, isHost: true, isActive: true },
    { id: "p2", displayName: "Player", score: 0, isHost: false, isActive: true }
  ],
  activeGame: "wouldYouRather",
  gameState: { type: "wouldYouRather", state }
});

describe("WouldYouRatherGame", () => {
  it("sends answer events for options and pass", () => {
    const send = vi.fn();
    render(
      <WouldYouRatherGame session={buildSession(baseState)} currentParticipantId="p2" isHost={false} send={send} />
    );
    fireEvent.click(screen.getByRole("button", { name: "only text friends" }));
    fireEvent.click(screen.getByRole("button", { name: "Pass" }));
    expect(send).toHaveBeenCalledWith({ type: "wouldYouRather:answer", payload: { choice: "optionA" } });
    expect(send).toHaveBeenCalledWith({ type: "wouldYouRather:answer", payload: { choice: "pass" } });
  });

  it("allows players to submit custom prompts", () => {
    const send = vi.fn();
    render(
      <WouldYouRatherGame session={buildSession(baseState)} currentParticipantId="p2" isHost={false} send={send} />
    );
    fireEvent.change(screen.getByLabelText("This thing"), { target: { value: "eat only spicy food" } });
    fireEvent.change(screen.getByLabelText("That thing"), { target: { value: "eat only sweet food" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit custom prompt" }));
    expect(send).toHaveBeenCalledWith({
      type: "wouldYouRather:submitPrompt",
      payload: { optionA: "eat only spicy food", optionB: "eat only sweet food" }
    });
  });

  it("shows host moderation actions and start submitted controls", () => {
    const send = vi.fn();
    const hostState: WouldYouRatherState = {
      ...baseState,
      status: "finished",
      activePrompt: null,
      approvedSubmissionsRemaining: 2,
      hostApprovedSubmissions: [
        {
          id: "sub-2",
          optionA: "always be early",
          optionB: "always be on time",
          submittedByParticipantId: "p2"
        }
      ]
    };
    render(<WouldYouRatherGame session={buildSession(hostState)} currentParticipantId="p1" isHost={true} send={send} />);
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    fireEvent.click(screen.getByRole("button", { name: /Start approved submitted prompts/ }));
    expect(send).toHaveBeenCalledWith({
      type: "wouldYouRather:reviewSubmission",
      payload: { submissionId: "sub-1", decision: "approve" }
    });
    expect(send).toHaveBeenCalledWith({ type: "wouldYouRather:startSubmittedRound", payload: {} });
  });
});
