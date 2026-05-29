import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { isEmojiStormTrigger } from "../../../shared/contracts";
import type { Participant, SessionChatMessage } from "../../../shared/contracts";
import { SessionChatPanel } from "./SessionChatPanel";

const buildMessage = (overrides: Partial<SessionChatMessage> = {}): SessionChatMessage => ({
  id: "m1",
  sessionId: "s1",
  participantId: "p1",
  displayName: "Host",
  text: "Hi",
  createdAt: Date.now(),
  ...overrides
});

const participants: Participant[] = [
  { id: "p1", displayName: "Host", score: 0, isHost: true, isActive: true },
  { id: "p2", displayName: "Guest", score: 0, isHost: false, isActive: true }
];

describe("SessionChatPanel", () => {
  it("sends a trimmed chat message and clears the input", () => {
    const onSendMessage = vi.fn();
    render(
      <SessionChatPanel
        messages={[]}
        participants={participants}
        currentParticipantId="p1"
        onSendMessage={onSendMessage}
        onSendReaction={vi.fn()}
      />
    );

    const input = screen.getByLabelText("Chat message") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "  hello there  " } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onSendMessage).toHaveBeenCalledWith("hello there");
    expect(input.value).toBe("");
  });

  it("submits the emojistorm trigger like any other chat message", () => {
    const onSendMessage = vi.fn();
    render(
      <SessionChatPanel
        messages={[]}
        participants={participants}
        currentParticipantId="p1"
        onSendMessage={onSendMessage}
        onSendReaction={vi.fn()}
      />
    );

    const input = screen.getByLabelText("Chat message") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "  EMOJISTORM  " } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onSendMessage).toHaveBeenCalledWith("EMOJISTORM");
    expect(input.value).toBe("");
    expect(isEmojiStormTrigger("EMOJISTORM")).toBe(true);
  });

  it("sends emoji reaction when an emoji button is clicked", () => {
    const onSendReaction = vi.fn();
    render(
      <SessionChatPanel
        messages={[]}
        participants={participants}
        currentParticipantId="p1"
        onSendMessage={vi.fn()}
        onSendReaction={onSendReaction}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Send 😀 reaction" }));
    expect(onSendReaction).toHaveBeenCalledWith("😀");
  });

  it("renders incoming chat messages", () => {
    render(
      <SessionChatPanel
        messages={[
          buildMessage({ id: "m1", participantId: "p1", displayName: "Host", text: "First" }),
          buildMessage({ id: "m2", participantId: "p2", displayName: "Guest", text: "Second" })
        ]}
        participants={participants}
        currentParticipantId="p1"
        onSendMessage={vi.fn()}
        onSendReaction={vi.fn()}
      />
    );

    expect(screen.getByText("First")).toBeDefined();
    expect(screen.getByText("Second")).toBeDefined();
  });
});
