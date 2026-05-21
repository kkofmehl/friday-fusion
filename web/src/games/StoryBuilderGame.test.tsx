import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SessionState } from "../../../shared/contracts";
import { StoryBuilderGame } from "./StoryBuilderGame";

const baseSession = (gameState: SessionState["gameState"]): SessionState => ({
  sessionId: "s1",
  sessionName: "Test",
  joinCode: "TEST-CODE",
  participants: [
    { id: "a", displayName: "Ann", score: 0, isHost: true, isActive: true },
    { id: "b", displayName: "Bob", score: 0, isHost: false, isActive: true }
  ],
  activeGame: "storyBuilder",
  gameState
});

describe("StoryBuilderGame", () => {
  it("shows textarea when it is the current writer's turn", () => {
    const send = vi.fn();
    render(
      <StoryBuilderGame
        session={baseSession({
          type: "storyBuilder",
          state: {
            status: "building",
            mode: "stock",
            firstTurnParticipantId: "b",
            currentTurnParticipantId: "b",
            lastSentence: "The lighthouse dimmed once.",
            sentenceCount: 1,
            isFirstSentence: false
          }
        })}
        currentParticipantId="b"
        isHost={false}
        canPlay
        send={send}
      />
    );

    fireEvent.change(screen.getByLabelText("Your sentence"), { target: { value: "Bob writes next." } });
    fireEvent.click(screen.getByRole("button", { name: "Add sentence" }));

    expect(send).toHaveBeenCalledWith({
      type: "storyBuilder:submitSentence",
      payload: { sentence: "Bob writes next." }
    });
  });

  it("shows waiting copy when it is not the user's turn", () => {
    render(
      <StoryBuilderGame
        session={baseSession({
          type: "storyBuilder",
          state: {
            status: "building",
            mode: "stock",
            firstTurnParticipantId: "b",
            currentTurnParticipantId: "b",
            lastSentence: null,
            sentenceCount: 1,
            isFirstSentence: false
          }
        })}
        currentParticipantId="a"
        isHost
        canPlay
        send={vi.fn()}
      />
    );

    expect(screen.getByText("Bob", { selector: "strong" })).toBeDefined();
    expect(screen.getByText(/to add a sentence/i)).toBeDefined();
    expect(screen.queryByLabelText("Your sentence")).toBeNull();
  });

  it("shows reveal and New story for host when complete", () => {
    const send = vi.fn();
    render(
      <StoryBuilderGame
        session={baseSession({
          type: "storyBuilder",
          state: {
            status: "complete",
            mode: "stock",
            firstTurnParticipantId: "a",
            fullStory: "Line one Line two.",
            sentences: [
              { participantId: null, text: "Line one." },
              { participantId: "b", text: "Line two." }
            ]
          }
        })}
        currentParticipantId="a"
        isHost
        canPlay
        send={send}
      />
    );

    const story = screen.getByLabelText("Completed story");
    expect(story.textContent).toContain("Line one Line two.");
    expect(screen.getByLabelText("Sentences by author")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "New story" }));
    expect(send).toHaveBeenCalledWith({ type: "storyBuilder:newStory", payload: {} });
  });

  it("renders reveal block for reduced-motion (animation disabled via CSS)", () => {
    render(
      <StoryBuilderGame
        session={baseSession({
          type: "storyBuilder",
          state: {
            status: "complete",
            mode: "scratch",
            firstTurnParticipantId: "a",
            fullStory: "Done.",
            sentences: [{ participantId: "a", text: "Done." }]
          }
        })}
        currentParticipantId="b"
        isHost={false}
        canPlay
        send={vi.fn()}
      />
    );

    const reveal = screen.getByLabelText("Completed story");
    expect(reveal.className.includes("story-builder-reveal")).toBe(true);
  });
});
