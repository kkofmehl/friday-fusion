import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SplendorGame } from "./SplendorGame";
import type { SessionState, SplendorState } from "../../../shared/contracts";
import { emptyTokenCounts } from "../../../shared/splendorData";

const sampleCard = {
  id: "d1-01",
  tier: 1 as const,
  bonus: "red" as const,
  prestige: 0,
  cost: { white: 3 }
};

const playingState = (): Extract<SplendorState, { status: "playing" }> => ({
  status: "playing",
  playerOrder: ["a", "b"],
  currentPlayerId: "a",
  bank: { white: 4, blue: 4, green: 4, red: 4, black: 4, gold: 5 },
  market: {
    1: [sampleCard, null, null, null],
    2: [null, null, null, null],
    3: [null, null, null, null]
  },
  deckCounts: { 1: 36, 2: 30, 3: 20 },
  nobles: [
    {
      id: "noble-mary",
      name: "Mary Stuart",
      prestige: 3,
      requirements: { green: 4, red: 4 }
    }
  ],
  players: [
    {
      participantId: "a",
      tokens: emptyTokenCounts(),
      bonuses: { white: 0, blue: 0, green: 0, red: 0, black: 0 },
      prestige: 0,
      purchasedCardCount: 0,
      reservedCount: 0,
      nobles: [],
      purchasedByBonus: { white: [], blue: [], green: [], red: [], black: [] }
    },
    {
      participantId: "b",
      tokens: emptyTokenCounts(),
      bonuses: { white: 0, blue: 0, green: 0, red: 0, black: 0 },
      prestige: 0,
      purchasedCardCount: 0,
      reservedCount: 0,
      nobles: [],
      purchasedByBonus: { white: [], blue: [], green: [], red: [], black: [] }
    }
  ],
  myReserved: [],
  pending: null,
  finalRoundAnchorPlayerId: null
});

const baseSession = (state: SplendorState = playingState()): SessionState => ({
  sessionId: "s1",
  sessionName: "Test",
  joinCode: "TEST",
  participants: [
    { id: "a", displayName: "Ann", score: 0, isHost: true, isActive: true },
    { id: "b", displayName: "Bob", score: 0, isHost: false, isActive: true }
  ],
  activeGame: "splendor",
  gameState: { type: "splendor", state }
});

describe("SplendorGame", () => {
  it("shows take-gems actions on your turn", () => {
    const send = vi.fn();
    render(
      <SplendorGame
        session={baseSession()}
        currentParticipantId="a"
        isHost
        canPlay
        send={send}
      />
    );
    expect(screen.getByRole("button", { name: /Take different gems/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Take different gems/i }));
    expect(screen.getByText(/Select 1–3 different colors/i)).toBeTruthy();
  });

  it("does not show action buttons when it is not your turn", () => {
    const state = playingState();
    state.currentPlayerId = "b";
    render(
      <SplendorGame
        session={baseSession(state)}
        currentParticipantId="a"
        isHost
        canPlay
        send={vi.fn()}
      />
    );
    expect(screen.queryByRole("button", { name: /Take different gems/i })).toBeNull();
    expect(screen.getByText(/Waiting for/i)).toBeTruthy();
  });

  it("shows return-token pending UI", () => {
    const state = playingState();
    state.pending = { type: "returnTokens", participantId: "a", mustReturn: 1 };
    state.players[0]!.tokens = { white: 4, blue: 4, green: 3, red: 0, black: 0, gold: 0 };
    const send = vi.fn();
    render(
      <SplendorGame
        session={baseSession(state)}
        currentParticipantId="a"
        isHost
        canPlay
        send={send}
      />
    );
    expect(screen.getByText(/Return 1 token/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Take different gems/i })).toBeNull();
  });

  it("renders finished winners", () => {
    render(
      <SplendorGame
        session={baseSession({
          status: "finished",
          winnerParticipantIds: ["a"],
          players: playingState().players.map((p) =>
            p.participantId === "a" ? { ...p, prestige: 16 } : { ...p, prestige: 10 }
          ),
          prestigeByParticipant: { a: 16, b: 10 }
        })}
        currentParticipantId="a"
        isHost
        canPlay
        send={vi.fn()}
      />
    );
    expect(screen.getByText(/Winner!/i)).toBeTruthy();
  });

  it("shows compact opponent strip and a full board for the current player", () => {
    const state = playingState();
    state.players[1]!.purchasedByBonus.red = [
      { id: "d1-02", tier: 1, bonus: "red", prestige: 0, cost: { black: 3 } },
      { id: "d1-03", tier: 1, bonus: "red", prestige: 1, cost: { white: 4 } }
    ];
    state.players[1]!.bonuses.red = 2;
    state.players[1]!.prestige = 1;
    const { container } = render(
      <SplendorGame
        session={baseSession(state)}
        currentParticipantId="a"
        isHost
        canPlay
        send={vi.fn()}
      />
    );
    expect(screen.getByLabelText("Your board")).toBeTruthy();
    expect(screen.getByLabelText("Other players")).toBeTruthy();
    expect(screen.getByText("Bob")).toBeTruthy();
    expect(container.querySelector(".splendor-card-stack-count")?.textContent).toBe("2");
    expect(container.querySelector(".splendor-opponent .splendor-cost")).toBeNull();
  });
});
