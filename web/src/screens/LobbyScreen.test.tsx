import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SessionState } from "../../../shared/contracts";
import { LobbyScreen } from "./LobbyScreen";

const buildSession = (overrides: Partial<SessionState> = {}): SessionState => ({
  sessionId: "s1",
  sessionName: "Test",
  joinCode: "BRIGHT-OTTER",
  participants: [
    { id: "p1", displayName: "Alice", score: 0, isHost: true, isActive: true },
    { id: "p2", displayName: "Bob", score: 0, isHost: false, isActive: true },
    { id: "p3", displayName: "Carol", score: 0, isHost: false, isActive: true }
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

    const hangmanCard = screen.getByRole("heading", { name: "Hangman" }).closest("article");
    if (!hangmanCard) throw new Error("expected Hangman card");
    fireEvent.click(hangmanCard.querySelector('input[name="hangman-mode"][value="turns"]')!);
    fireEvent.change(hangmanCard.querySelector("#hangman-creator-select")!, { target: { value: "p3" } });
    fireEvent.click(hangmanCard.querySelector(".btn-primary")!);

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

  it("sends Would You Rather setup including submission toggle", () => {
    const send = vi.fn();
    render(<LobbyScreen session={buildSession()} currentParticipantId="p1" isHost send={send} />);

    const card = screen.getByRole("heading", { name: "Would You Rather" }).closest("article");
    if (!card) throw new Error("expected Would You Rather card");
    fireEvent.change(card.querySelector("#would-you-rather-count")!, { target: { value: "12" } });
    fireEvent.click(card.querySelector('input[type="checkbox"]')!);
    fireEvent.click(card.querySelector(".btn-primary")!);

    expect(send).toHaveBeenCalledWith({
      type: "game:start",
      payload: {
        game: "wouldYouRather",
        options: {
          wouldYouRatherTotalQuestions: 12,
          wouldYouRatherAllowParticipantSubmissions: false
        }
      }
    });
  });

  it("sends selected mode when starting Yahtzee", () => {
    const send = vi.fn();
    render(<LobbyScreen session={buildSession()} currentParticipantId="p1" isHost send={send} />);

    const yahtzeeCard = screen.getByRole("heading", { name: "Yahtzee" }).closest("article");
    if (!yahtzeeCard) throw new Error("expected Yahtzee card");
    fireEvent.click(yahtzeeCard.querySelector('input[name="yahtzee-mode"][value="simultaneous"]')!);
    fireEvent.click(yahtzeeCard.querySelector(".btn-primary")!);

    expect(send).toHaveBeenCalledWith({
      type: "game:start",
      payload: { game: "yahtzee", options: { yahtzeeMode: "simultaneous" } }
    });
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

  it("renders game icons from the game_icons directory", () => {
    render(<LobbyScreen session={buildSession()} currentParticipantId="p1" isHost send={vi.fn()} />);

    const expectedIcons: Array<[name: string, iconPath: string]> = [
      ["Hangman", "/game_icons/hangman.png"],
      ["Two Truths and a Lie", "/game_icons/two_truths_and_one_lie.png"],
      ["Trivia", "/game_icons/trivia.png"],
      ["Icebreaker Questions", "/game_icons/ice_breaker_questions.png"],
      ["Guess Who Said It?", "/game_icons/guess_who_said_it.png"],
      ["Guess the image", "/game_icons/guess_the_image.png"],
      ["20 Questions", "/game_icons/20_questions.png"],
      ["Caption This", "/game_icons/caption_this.png"],
      ["Pictionary", "/game_icons/pictionary.png"],
      ["Apples to Apples", "/game_icons/apples_to_apples.png"],
      ["UNO", "/game_icons/uno.png"],
      ["BS", "/game_icons/bs.png"],
      ["Madlibs", "/game_icons/madlibs.png"],
      ["Catch Phrase", "/game_icons/catchphrase.png"],
      ["Yahtzee", "/game_icons/yahtzee.png"],
      ["Scattergories", "/game_icons/scattegories.png"]
    ];

    for (const [gameName, iconPath] of expectedIcons) {
      const card = screen.getByRole("heading", { name: gameName }).closest("article");
      if (!card) throw new Error(`expected ${gameName} card`);
      const icon = card.querySelector("img.game-card-icon");
      expect(icon).not.toBeNull();
      expect(icon?.getAttribute("src")).toBe(iconPath);
    }
  });

  it("shows bench notice instead of game picker when a game runs and the guest is benched", () => {
    render(
      <LobbyScreen
        session={buildSession({
          activeGame: "trivia",
          gameState: null,
          participants: [
            { id: "p1", displayName: "Alice", score: 0, isHost: true, isActive: true },
            { id: "p2", displayName: "Bob", score: 0, isHost: false, isActive: false }
          ]
        })}
        currentParticipantId="p2"
        isHost={false}
        send={vi.fn()}
      />
    );

    expect(screen.getByRole("heading", { name: "Game in progress" })).toBeDefined();
    expect(screen.queryByRole("heading", { name: "Choose a game" })).toBeNull();
  });
});
