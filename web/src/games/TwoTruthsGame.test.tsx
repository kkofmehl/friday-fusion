import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SessionState } from "../../../shared/contracts";
import { TwoTruthsGame } from "./TwoTruthsGame";

const baseSession: SessionState = {
  sessionId: "s1",
  sessionName: "Test",
  joinCode: "BRIGHT-OTTER",
  participants: [
    { id: "p1", displayName: "Alice", score: 0, isHost: true },
    { id: "p2", displayName: "Bob", score: 0, isHost: false }
  ],
  activeGame: "twoTruthsLie",
  gameState: {
    type: "twoTruthsLie",
    state: {
      submissions: {
        p1: { statements: ["I climbed Kilimanjaro", "I have two dogs", "I hate pizza"], lieIndex: 2 }
      },
      currentPresenterId: "p1",
      votes: { p2: 1 },
      status: "revealed"
    }
  }
};

describe("TwoTruthsGame", () => {
  it("uses neutral placeholder copy for all statement inputs", () => {
    const collectingSession: SessionState = {
      ...baseSession,
      gameState: {
        type: "twoTruthsLie",
        state: {
          submissions: {},
          currentPresenterId: null,
          votes: {},
          status: "collecting"
        }
      }
    };

    render(
      <TwoTruthsGame session={collectingSession} currentParticipantId="p2" isHost={false} send={vi.fn()} />
    );

    expect(screen.getAllByPlaceholderText("Place your truth or lie here")).toHaveLength(3);
  });

  it("highlights the lie and shows vote tallies on reveal", () => {
    render(
      <TwoTruthsGame session={baseSession} currentParticipantId="p2" isHost={false} send={vi.fn()} />
    );
    expect(screen.getAllByText("Lie").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Truth").length).toBe(2);
    expect(screen.getByText(/Alice's truth/)).toBeDefined();
    expect(screen.getByText("Voted by: Bob")).toBeDefined();
    expect(screen.getAllByText("Voted by: No one")).toHaveLength(2);
  });

  it("disables voting controls after a player has cast their vote", () => {
    const votingSession: SessionState = {
      ...baseSession,
      gameState: {
        type: "twoTruthsLie",
        state: {
          submissions: {
            p1: { statements: ["A", "B", "C"], lieIndex: 1 }
          },
          currentPresenterId: "p1",
          votes: { p2: 2 },
          status: "voting"
        }
      }
    };

    render(
      <TwoTruthsGame session={votingSession} currentParticipantId="p2" isHost={false} send={vi.fn()} />
    );

    expect(screen.getByRole("button", { name: "Vote cast" }).hasAttribute("disabled")).toBe(true);
    const optionButtons = screen.getAllByRole("button").filter((button) =>
      button.className.includes("truths-option")
    );
    optionButtons.forEach((button) => expect(button.hasAttribute("disabled")).toBe(true));
  });

  it("lets the host pick the next presenter after reveal", () => {
    const send = vi.fn();
    const revealSession: SessionState = {
      ...baseSession,
      participants: [
        { id: "p1", displayName: "Alice", score: 0, isHost: true },
        { id: "p2", displayName: "Bob", score: 0, isHost: false },
        { id: "p3", displayName: "Cara", score: 0, isHost: false }
      ],
      gameState: {
        type: "twoTruthsLie",
        state: {
          submissions: {
            p1: { statements: ["A", "B", "C"], lieIndex: 1 },
            p2: { statements: ["D", "E", "F"], lieIndex: 0 },
            p3: { statements: ["G", "H", "I"], lieIndex: 2 }
          },
          currentPresenterId: "p1",
          votes: { p2: 2, p3: 2 },
          status: "revealed"
        }
      }
    };

    render(
      <TwoTruthsGame session={revealSession} currentParticipantId="p1" isHost={true} send={send} />
    );

    expect(screen.queryByText("Play another round")).toBeNull();
    expect(screen.getByRole("button", { name: "Start next presenter" }).hasAttribute("disabled")).toBe(
      false
    );
    expect(screen.queryByRole("option", { name: "Alice" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Start next presenter" }));
    expect(send).toHaveBeenCalledWith({
      type: "truths:beginVoting",
      payload: { presenterId: "p2" }
    });
  });
});
