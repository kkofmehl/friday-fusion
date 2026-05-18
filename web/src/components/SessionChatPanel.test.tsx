import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SessionChatMessage } from "../../../shared/contracts";
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

describe("SessionChatPanel", () => {
  it("sends a trimmed chat message and clears the input", () => {
    const onSendMessage = vi.fn();
    render(
      <SessionChatPanel
        messages={[]}
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

  it("sends emoji reaction when an emoji button is clicked", () => {
    const onSendReaction = vi.fn();
    render(
      <SessionChatPanel
        messages={[]}
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
        currentParticipantId="p1"
        onSendMessage={vi.fn()}
        onSendReaction={vi.fn()}
      />
    );

    expect(screen.getByText("First")).toBeDefined();
    expect(screen.getByText("Second")).toBeDefined();
  });
});
