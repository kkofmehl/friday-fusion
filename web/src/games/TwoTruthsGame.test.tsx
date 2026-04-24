import { render, screen } from "@testing-library/react";
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
  it("highlights the lie and shows vote tallies on reveal", () => {
    render(
      <TwoTruthsGame session={baseSession} currentParticipantId="p2" isHost={false} send={vi.fn()} />
    );
    expect(screen.getAllByText("Lie").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Truth").length).toBe(2);
    expect(screen.getByText(/Alice's truth/)).toBeDefined();
  });
});
