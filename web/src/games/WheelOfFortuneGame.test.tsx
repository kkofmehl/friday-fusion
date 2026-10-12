import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SessionState, WheelOfFortuneState } from "../../../shared/contracts";
import { wheelSpinRotationDeg } from "../../../shared/wheelOfFortuneLogic";
import { WheelOfFortuneGame } from "./WheelOfFortuneGame";

const playingState = (overrides: Partial<Extract<WheelOfFortuneState, { status: "playing" }>> = {}): WheelOfFortuneState => ({
  status: "playing",
  roundIndex: 1,
  category: "Phrase",
  maskedBoard: "_____ _____",
  usedLetters: [],
  currentTurnId: "p1",
  phase: "awaitingAction",
  pendingWedgeIndex: null,
  lastOutcome: "Round 1: Phrase",
  playerOrder: ["p1", "p2"],
  roundMoney: { p1: 0, p2: 0 },
  bankedMoney: { p1: 0, p2: 0 },
  freeSpinTokens: { p1: 0, p2: 0 },
  ...overrides
});

const buildSession = (state: WheelOfFortuneState): SessionState => ({
  sessionId: "s1",
  sessionName: "Test",
  joinCode: "BRIGHT-OTTER",
  participants: [
    { id: "p1", displayName: "Alice", score: 0, isHost: true, isActive: true },
    { id: "p2", displayName: "Bob", score: 0, isHost: false, isActive: true }
  ],
  activeGame: "wheelOfFortune",
  gameState: { type: "wheelOfFortune", state }
});

describe("WheelOfFortuneGame", () => {
  it("lets the current player spin", () => {
    const send = vi.fn();
    render(
      <WheelOfFortuneGame
        session={buildSession(playingState())}
        currentParticipantId="p1"
        isHost
        send={send}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Spin" }));
    expect(send).toHaveBeenCalledWith({ type: "wheelOfFortune:spin", payload: {} });
  });

  it("shows consonant keyboard after a cash spin settles", () => {
    const send = vi.fn();
    render(
      <WheelOfFortuneGame
        session={buildSession(
          playingState({
            phase: "awaitingLetter",
            pendingWedgeIndex: 1,
            lastOutcome: "$800 — call a consonant"
          })
        )}
        currentParticipantId="p1"
        isHost
        send={send}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "L" }));
    expect(send).toHaveBeenCalledWith({
      type: "wheelOfFortune:callConsonant",
      payload: { letter: "L" }
    });
  });

  it("hides spin for non-turn players", () => {
    render(
      <WheelOfFortuneGame
        session={buildSession(playingState())}
        currentParticipantId="p2"
        isHost={false}
        send={vi.fn()}
      />
    );
    expect(screen.queryByRole("button", { name: "Spin" })).toBeNull();
    expect(screen.getByText(/Waiting for other players/)).toBeDefined();
  });

  it("computes synced spin rotation from server timestamps", () => {
    expect(wheelSpinRotationDeg(1000, 1000, 2000, 720)).toBe(0);
    expect(wheelSpinRotationDeg(2000, 1000, 2000, 720)).toBe(720);
    const mid = wheelSpinRotationDeg(1500, 1000, 2000, 720);
    expect(mid).toBeGreaterThan(360);
    expect(mid).toBeLessThan(720);
  });

  it("keeps each puzzle word on one line", () => {
    render(
      <WheelOfFortuneGame
        session={buildSession(playingState({ maskedBoard: "_______ ______" }))}
        currentParticipantId="p2"
        isHost={false}
        send={vi.fn()}
      />
    );
    const words = document.querySelectorAll(".wof-board-word");
    expect(words).toHaveLength(2);
    expect(words[0]?.textContent).toBe("_______");
    expect(words[1]?.textContent).toBe("______");
  });

  it("selects bonus consonants and a vowel before revealing", () => {
    const send = vi.fn();
    render(
      <WheelOfFortuneGame
        session={buildSession({
          status: "bonusLetterPick",
          category: "Thing",
          maskedBoard: "___",
          usedLetters: ["R", "S", "T", "L", "N", "E"],
          bonusPlayerId: "p1",
          playerOrder: ["p1", "p2"],
          roundMoney: { p1: 0, p2: 0 },
          bankedMoney: { p1: 2000, p2: 0 },
          freeSpinTokens: { p1: 0, p2: 0 },
          lastOutcome: "Pick letters"
        })}
        currentParticipantId="p1"
        isHost
        send={send}
      />
    );
    const reveal = screen.getByRole("button", { name: "Reveal letters" }) as HTMLButtonElement;
    expect(reveal.disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "C" }));
    fireEvent.click(screen.getByRole("button", { name: "D" }));
    fireEvent.click(screen.getByRole("button", { name: "M" }));
    expect(screen.getByRole("button", { name: "C" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "O" }));
    expect(reveal.disabled).toBe(false);
    fireEvent.click(reveal);
    expect(send).toHaveBeenCalledWith({
      type: "wheelOfFortune:bonusPickLetters",
      payload: { consonants: ["C", "D", "M"], vowel: "O" }
    });
  });

  it("renders host custom puzzle setup", () => {
    render(
      <WheelOfFortuneGame
        session={buildSession({
          status: "setup",
          puzzleSource: "custom",
          playerOrder: ["p1", "p2"]
        })}
        currentParticipantId="p1"
        isHost
        send={vi.fn()}
      />
    );
    expect(screen.getByText(/Custom puzzles/)).toBeDefined();
    expect(screen.getByRole("button", { name: "Start game" })).toBeDefined();
  });
});
