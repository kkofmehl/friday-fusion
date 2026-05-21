import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SessionState } from "../../../shared/contracts";
import { PlayerList } from "./PlayerList";

const buildSession = (overrides: Partial<SessionState> = {}): SessionState => ({
  sessionId: "s1",
  sessionName: "Test",
  joinCode: "BRIGHT-OTTER",
  participants: [
    { id: "p1", displayName: "Alice", score: 5, isHost: true, isActive: true },
    { id: "p2", displayName: "Bob", score: 3, isHost: false, isActive: true }
  ],
  activeGame: null,
  gameState: null,
  ...overrides
});

describe("PlayerList score editing", () => {
  it("host opening score edit broadcasts beginScoreEdit and shows the editing notice for everyone", () => {
    const send = vi.fn();
    const { rerender } = render(
      <PlayerList session={buildSession()} currentParticipantId="p1" isHost send={send} />
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit score for Bob" }));

    expect(send).toHaveBeenCalledWith({
      type: "session:beginScoreEdit",
      payload: { participantId: "p2" }
    });

    rerender(
      <PlayerList
        session={buildSession({ scoreEditingParticipantId: "p2" })}
        currentParticipantId="p1"
        isHost
        send={send}
      />
    );

    expect(screen.getByRole("status").textContent).toContain("The host is updating the score...");
  });

  it("host can save an updated score and cancel broadcasts cancelScoreEdit", () => {
    const send = vi.fn();
    render(<PlayerList session={buildSession()} currentParticipantId="p1" isHost send={send} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit score for Bob" }));
    fireEvent.change(screen.getByLabelText("Score for Bob"), { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(send).toHaveBeenCalledWith({
      type: "session:setScore",
      payload: { participantId: "p2", score: 12 }
    });

    send.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Edit score for Bob" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(send).toHaveBeenCalledWith({ type: "session:cancelScoreEdit", payload: {} });
  });

  it("non-host sees the editing notice but cannot edit scores", () => {
    render(
      <PlayerList
        session={buildSession({ scoreEditingParticipantId: "p2" })}
        currentParticipantId="p2"
      />
    );

    expect(screen.getByRole("status").textContent).toContain("The host is updating the score...");
    expect(screen.queryByRole("button", { name: "Edit score for Bob" })).toBeNull();
    expect(screen.getByText("3")).toBeTruthy();
  });

  it("keeps the editing notice while session updates change the send function identity", () => {
    const send = vi.fn();
    const { rerender } = render(
      <PlayerList
        session={buildSession({ scoreEditingParticipantId: "p2" })}
        currentParticipantId="p2"
      />
    );

    expect(screen.getByRole("status").textContent).toContain("The host is updating the score...");

    rerender(
      <PlayerList
        session={buildSession({
          scoreEditingParticipantId: "p2",
          participants: [
            { id: "p1", displayName: "Alice", score: 6, isHost: true, isActive: true },
            { id: "p2", displayName: "Bob", score: 3, isHost: false, isActive: true }
          ]
        })}
        currentParticipantId="p2"
        send={vi.fn()}
      />
    );

    expect(send).not.toHaveBeenCalledWith({ type: "session:cancelScoreEdit", payload: {} });
    expect(screen.getByRole("status").textContent).toContain("The host is updating the score...");
  });

  it("shows a profile star and opens profile callback", () => {
    const onViewProfile = vi.fn();
    render(
      <PlayerList
        session={buildSession({
          participants: [
            { id: "p1", displayName: "Alice", score: 5, isHost: true, isActive: true, hasProfile: true },
            { id: "p2", displayName: "Bob", score: 3, isHost: false, isActive: true }
          ]
        })}
        currentParticipantId="p1"
        onViewProfile={onViewProfile}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "View profile for Alice" }));
    expect(onViewProfile).toHaveBeenCalledWith("p1");
  });
});
