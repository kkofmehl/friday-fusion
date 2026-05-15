import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionState } from "../../../shared/contracts";
import { YahtzeeGame } from "./YahtzeeGame";
import { YAHTZEE_DICE_SOUND_STORAGE_KEY } from "./yahtzeeDiceRollSound";

const playingSession = (): SessionState => ({
  sessionId: "s",
  sessionName: "Test",
  joinCode: "CODE",
  participants: [
    { id: "p1", displayName: "Alice", score: 0, isHost: true, isActive: true },
    { id: "p2", displayName: "Bob", score: 3, isHost: false, isActive: true }
  ],
  activeGame: "yahtzee",
  gameState: {
    type: "yahtzee",
    state: {
      status: "playing",
      playerOrder: ["p1", "p2"],
      currentPlayerId: "p1",
      dice: [2, 2, 3, 4, 5],
      held: [false, false, false, false, false],
      rollsUsed: 1,
      pendingCategory: null,
      sheetsByParticipant: { p1: [], p2: [] }
    }
  },
  lobbyGamePreferences: {}
});

describe("YahtzeeGame", () => {
  beforeEach(() => {
    window.localStorage.removeItem(YAHTZEE_DICE_SOUND_STORAGE_KEY);
  });

  afterEach(() => {
    window.localStorage.removeItem(YAHTZEE_DICE_SOUND_STORAGE_KEY);
  });

  it("disables Pass turn until a scoring row is selected", () => {
    const send = vi.fn();
    render(
      <YahtzeeGame session={playingSession()} currentParticipantId="p1" isHost canPlay send={send} />
    );
    const passBtn = screen.getByRole("button", { name: /Pass turn/i });
    expect(passBtn.hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /Select Aces — would score 0 points/i }));
    expect(send).toHaveBeenCalledWith({ type: "yahtzee:setPendingCategory", payload: { category: "ones" } });
  });

  it("shows This game totals and FF session score separately", () => {
    const send = vi.fn();
    render(
      <YahtzeeGame session={playingSession()} currentParticipantId="p1" isHost canPlay send={send} />
    );
    expect(screen.getByText(/This game \(sheet total\)/i)).toBeTruthy();
    expect(screen.getByText(/FF: 3/)).toBeTruthy();
  });

  it("persists dice sound off to localStorage", () => {
    const send = vi.fn();
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    render(
      <YahtzeeGame session={playingSession()} currentParticipantId="p1" isHost canPlay send={send} />
    );
    fireEvent.click(screen.getByRole("checkbox", { name: /Dice sound/i }));
    expect(setItem).toHaveBeenCalledWith(YAHTZEE_DICE_SOUND_STORAGE_KEY, "0");
    setItem.mockRestore();
  });
});
