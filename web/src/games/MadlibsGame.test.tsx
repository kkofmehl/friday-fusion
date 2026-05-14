import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SessionState } from "../../../shared/contracts";
import { MadlibsGame } from "./MadlibsGame";

const baseSession = (overrides: Partial<SessionState> = {}): SessionState => ({
  sessionId: "s1",
  sessionName: "Test",
  joinCode: "TEST",
  participants: [
    { id: "a", displayName: "Ann", score: 0, isHost: true, isActive: true },
    { id: "b", displayName: "Bob", score: 0, isHost: false, isActive: true },
    { id: "c", displayName: "Cara", score: 0, isHost: false, isActive: true }
  ],
  activeGame: "madlibs",
  gameState: {
    type: "madlibs",
    state: {
      status: "filling",
      templateId: "road-trip",
      templateTitle: "Road Trip",
      blankCount: 4,
      currentBlankIndex: 1,
      currentPrompt: "adjective",
      currentFillerId: "b",
      filledCount: 1
    }
  },
  ...overrides
});

describe("MadlibsGame", () => {
  it("lets the active filler submit a trimmed word", () => {
    const send = vi.fn();
    render(
      <MadlibsGame session={baseSession()} currentParticipantId="b" isHost={false} send={send} />
    );
    fireEvent.change(screen.getByLabelText("Your word"), { target: { value: "  bright  " } });
    fireEvent.click(screen.getByRole("button", { name: "Submit word" }));
    expect(send).toHaveBeenCalledWith({
      type: "madlibs:submitWord",
      payload: { word: "bright" }
    });
  });

  it("shows waiting copy when it is someone else's turn", () => {
    render(
      <MadlibsGame session={baseSession()} currentParticipantId="a" isHost send={vi.fn()} />
    );
    expect(screen.getByText(/Waiting for/i).textContent).toContain("Bob");
  });

  it("hides story and submissions for non-reader in reading mode", () => {
    const session = baseSession({
      gameState: {
        type: "madlibs",
        state: {
          status: "reading",
          templateId: "office-email",
          templateTitle: "Office Email",
          filledStory: "Hello team, please bring your otter to the office.",
          readerParticipantId: "c",
          submissions: [
            { participantId: "a", prompt: "noun", word: "otter" },
            { participantId: "b", prompt: "place", word: "office" }
          ]
        }
      }
    });
    render(
      <MadlibsGame session={session} currentParticipantId="a" isHost send={vi.fn()} />
    );
    expect(screen.queryByLabelText("Filled Madlib story")).toBeNull();
    expect(screen.queryByLabelText("Madlibs submissions")).toBeNull();
    expect(screen.getByText(/Waiting for/i).textContent).toContain("Cara");
  });

  it("shows story and submissions for current reader", () => {
    const session = baseSession({
      gameState: {
        type: "madlibs",
        state: {
          status: "reading",
          templateId: "office-email",
          templateTitle: "Office Email",
          filledStory: "Hello team, please bring your otter to the office.",
          readerParticipantId: "c",
          submissions: [
            { participantId: "a", prompt: "noun", word: "otter" },
            { participantId: "b", prompt: "place", word: "office" }
          ]
        }
      }
    });
    render(
      <MadlibsGame session={session} currentParticipantId="c" isHost={false} send={vi.fn()} />
    );
    expect(screen.getByLabelText("Filled Madlib story").textContent).toContain("bring your otter");
    expect(screen.getByLabelText("Madlibs submissions").textContent).toContain("noun");
    expect(screen.getByLabelText("Madlibs submissions").textContent).toContain("Ann");
    expect(screen.getByLabelText("Madlibs submissions").textContent).toContain("Bob");
  });

  it("shows pass only for the reader and dispatches pass", () => {
    const send = vi.fn();
    const session = baseSession({
      gameState: {
        type: "madlibs",
        state: {
          status: "reading",
          templateId: "office-email",
          templateTitle: "Office Email",
          filledStory: "Story text",
          readerParticipantId: "c",
          submissions: [{ participantId: "a", prompt: "noun", word: "otter" }]
        }
      }
    });
    const { rerender } = render(
      <MadlibsGame session={session} currentParticipantId="a" isHost send={send} />
    );
    expect(screen.queryByRole("button", { name: "Pass to another reader" })).toBeNull();

    rerender(
      <MadlibsGame session={session} currentParticipantId="c" isHost={false} send={send} />
    );
    fireEvent.click(screen.getByRole("button", { name: "Pass to another reader" }));
    expect(send).toHaveBeenCalledWith({ type: "madlibs:passRead", payload: {} });
  });

  it("shows next-round button for host and dispatches event", () => {
    const send = vi.fn();
    const session = baseSession({
      gameState: {
        type: "madlibs",
        state: {
          status: "reading",
          templateId: "office-email",
          templateTitle: "Office Email",
          filledStory: "Story text",
          readerParticipantId: "c",
          submissions: [{ participantId: "a", prompt: "noun", word: "otter" }]
        }
      }
    });
    render(
      <MadlibsGame session={session} currentParticipantId="a" isHost send={send} />
    );
    fireEvent.click(screen.getByRole("button", { name: "Next Madlib" }));
    expect(send).toHaveBeenCalledWith({ type: "madlibs:nextRound", payload: {} });
  });
});
