import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionState, YahtzeeMode, YahtzeeSheetRow } from "../../../shared/contracts";
import { YahtzeeGame } from "./YahtzeeGame";
import { YAHTZEE_DICE_SOUND_STORAGE_KEY } from "./yahtzeeDiceRollSound";

const playingSession = (myRows: YahtzeeSheetRow[] = [], mode: YahtzeeMode = "turns"): SessionState => ({
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
      mode,
      playerOrder: ["p1", "p2"],
      currentPlayerId: "p1",
      dice: [2, 2, 3, 4, 5],
      held: [false, false, false, false, false],
      rollsUsed: 1,
      pendingCategory: null,
      sheetsByParticipant: { p1: myRows, p2: [] },
      latestYahtzee: null
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

  it("shows running upper total and marks bonus target when met", () => {
    const send = vi.fn();
    render(
      <YahtzeeGame
        session={playingSession([
          { category: "ones", points: 3 },
          { category: "twos", points: 6 },
          { category: "threes", points: 9 },
          { category: "fours", points: 12 },
          { category: "fives", points: 15 },
          { category: "sixes", points: 18 }
        ])}
        currentParticipantId="p1"
        isHost
        canPlay
        send={send}
      />
    );
    expect(screen.getByText(/Upper section:/i)).toBeTruthy();
    expect(screen.getByText("63 / 63")).toBeTruthy();
    expect(screen.getByText(/Bonus target met/i)).toBeTruthy();
  });

  it("shows live progress and yahtzee announcement in simultaneous mode", () => {
    const send = vi.fn();
    const session = playingSession([], "simultaneous");
    if (session.gameState?.type !== "yahtzee" || session.gameState.state.status !== "playing") {
      throw new Error("expected yahtzee playing");
    }
    session.gameState.state.latestYahtzee = { participantId: "p2", createdAtMs: Date.now() };
    render(<YahtzeeGame session={session} currentParticipantId="p1" isHost canPlay send={send} />);
    expect(screen.getByText(/Simultaneous mode/i)).toBeTruthy();
    expect(screen.getByText(/Live progress/i)).toBeTruthy();
    expect(screen.getByText(/Bob got a YAHTZEE!/i)).toBeTruthy();
  });
});
