import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SessionState } from "../../../shared/contracts";
import { LobbyScreen } from "./LobbyScreen";

const buildSession = (overrides: Partial<SessionState> = {}): SessionState => ({
  sessionId: "s1",
  sessionName: "Test",
  joinCode: "BRIGHT-OTTER",
  participants: [
    { id: "p1", displayName: "Alice", score: 0, isHost: true },
    { id: "p2", displayName: "Bob", score: 0, isHost: false },
    { id: "p3", displayName: "Carol", score: 0, isHost: false }
  ],
  activeGame: null,
  gameState: null,
  ...overrides
});

describe("LobbyScreen", () => {
  it("sends selected creator and mode when starting hangman", () => {
    const send = vi.fn();
    render(
      <LobbyScreen session={buildSession()} currentParticipantId="p1" isHost send={send} />
    );

    fireEvent.click(screen.getByDisplayValue("turns"));
    fireEvent.change(screen.getByLabelText("Puzzle creator"), { target: { value: "p3" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Start" })[0]!);

    expect(send).toHaveBeenCalledWith({
      type: "game:start",
      payload: { game: "hangman", options: { hangmanMode: "turns", hangmanCreatorId: "p3" } }
    });
  });

  it("sends item selector and max questions when starting 20 Questions", () => {
    const send = vi.fn();
    render(
      <LobbyScreen session={buildSession()} currentParticipantId="p1" isHost send={send} />
    );

    const twentyCard = screen.getByRole("heading", { name: "20 Questions" }).closest("article");
    if (!twentyCard) throw new Error("expected 20 Questions card");
    fireEvent.change(twentyCard.querySelector("#twenty-q-selector-select")!, { target: { value: "p2" } });
    fireEvent.change(twentyCard.querySelector("#twenty-q-max-questions")!, { target: { value: "15" } });
    fireEvent.click(twentyCard.querySelector(".btn-primary")!);

    expect(send).toHaveBeenCalledWith({
      type: "game:start",
      payload: {
        game: "twentyQuestions",
        options: { twentyQuestionsItemSelectorId: "p2", twentyQuestionsMaxQuestions: 15 }
      }
    });
  });

  it("sends image provider when starting Caption This", () => {
    const send = vi.fn();
    render(
      <LobbyScreen session={buildSession()} currentParticipantId="p1" isHost send={send} />
    );

    const card = screen.getByRole("heading", { name: "Caption This" }).closest("article");
    if (!card) throw new Error("expected Caption This card");
    fireEvent.change(card.querySelector("#caption-this-provider-select")!, { target: { value: "p3" } });
    fireEvent.click(card.querySelector(".btn-primary")!);

    expect(send).toHaveBeenCalledWith({
      type: "game:start",
      payload: { game: "captionThis", options: { captionThisImageProviderId: "p3" } }
    });
  });

  it("shows guest game wishes to the host under the players list", () => {
    render(
      <LobbyScreen
        session={buildSession({
          lobbyGamePreferences: { p2: "trivia" }
        })}
        currentParticipantId="p1"
        isHost
        send={vi.fn()}
      />
    );

    const list = screen.getByRole("list", { name: /what guests want to play next/i });
    expect(list.textContent).toContain("Bob wants to play Trivia");
  });

  it("sends lobby:setGamePreference when a guest clicks I want to play this", () => {
    const send = vi.fn();
    render(
      <LobbyScreen session={buildSession()} currentParticipantId="p2" isHost={false} send={send} />
    );

    const captionCard = screen.getByRole("heading", { name: "Caption This" }).closest("article");
    if (!captionCard) throw new Error("expected Caption This card");
    fireEvent.click(captionCard.querySelector(".lobby-want-game")!);

    expect(send).toHaveBeenCalledWith({
      type: "lobby:setGamePreference",
      payload: { game: "captionThis" }
    });
  });
});
