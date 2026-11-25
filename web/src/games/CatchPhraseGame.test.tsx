import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SessionState } from "../../../shared/contracts";
import { CatchPhraseGame } from "./CatchPhraseGame";

const catchPhraseSession = (overrides: Partial<SessionState> = {}): SessionState => ({
  sessionId: "s1",
  sessionName: "Test",
  joinCode: "TEST",
  participants: [
    { id: "a", displayName: "Ann", score: 0, isHost: true, isActive: true },
    { id: "b", displayName: "Bob", score: 0, isHost: false, isActive: true },
    { id: "c", displayName: "Cara", score: 0, isHost: false, isActive: true },
    { id: "d", displayName: "Dan", score: 0, isHost: false, isActive: true }
  ],
  activeGame: "catchPhrase",
  gameState: {
    type: "catchPhrase",
    state: {
      status: "teamSetup",
      teamAIds: [],
      teamBIds: []
    }
  },
  ...overrides
});

describe("CatchPhraseGame", () => {
  it("sends setTeams with draft roster before beginPlay when starting from team setup", () => {
    const send = vi.fn();
    render(
      <CatchPhraseGame
        session={catchPhraseSession()}
        currentParticipantId="a"
        isHost
        send={send}
      />
    );
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(4);
    fireEvent.click(within(rows[0]).getByRole("radio", { name: "Team A" }));
    fireEvent.click(within(rows[1]).getByRole("radio", { name: "Team A" }));
    fireEvent.click(within(rows[2]).getByRole("radio", { name: "Team B" }));
    fireEvent.click(within(rows[3]).getByRole("radio", { name: "Team B" }));
    fireEvent.click(screen.getByRole("button", { name: "Start Catch Phrase" }));
    expect(send).toHaveBeenNthCalledWith(1, {
      type: "catchPhrase:setTeams",
      payload: { teamAIds: ["a", "b"], teamBIds: ["c", "d"] }
    });
    expect(send).toHaveBeenNthCalledWith(2, { type: "catchPhrase:beginPlay", payload: {} });
  });

  it("shows a waiting message for non-hosts during team setup", () => {
    render(
      <CatchPhraseGame
        session={catchPhraseSession()}
        currentParticipantId="b"
        isHost={false}
        send={vi.fn()}
      />
    );
    expect(screen.getByText(/Only the host can assign teams/i)).toBeTruthy();
    expect(screen.queryByRole("listitem")).toBeNull();
    expect(screen.queryByRole("button", { name: "Start Catch Phrase" })).toBeNull();
  });

  it("persists beep sound off to localStorage", () => {
    vi.spyOn(Storage.prototype, "getItem").mockReturnValue(null);
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const t0 = Date.now();
    const session = catchPhraseSession({
      gameState: {
        type: "catchPhrase",
        state: {
          status: "playing",
          roundPhase: "live",
          teamAIds: ["a", "b"],
          teamBIds: ["c", "d"],
          teamScores: { A: 0, B: 0 },
          holderId: "a",
          passOrder: ["a", "b", "c", "d"],
          roundStartedAt: t0 - 5_000,
          slowPhaseEndsAt: t0 + 15_000,
          mediumPhaseEndsAt: t0 + 35_000,
          roundEndsAt: t0 + 60_000,
          myPhrase: "moon",
          clueSkipsRemaining: 1
        }
      }
    });
    render(<CatchPhraseGame session={session} currentParticipantId="a" isHost send={vi.fn()} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /beep sound/i }));
    expect(setItem).toHaveBeenCalledWith("fridayFusion.catchPhraseBeepSound", "0");
    vi.restoreAllMocks();
  });

  it("lets the holder request a new clue when a skip remains", () => {
    const send = vi.fn();
    const t0 = Date.now();
    render(
      <CatchPhraseGame
        session={catchPhraseSession({
          gameState: {
            type: "catchPhrase",
            state: {
              status: "playing",
              roundPhase: "live",
              teamAIds: ["a", "b"],
              teamBIds: ["c", "d"],
              teamScores: { A: 0, B: 0 },
              holderId: "a",
              passOrder: ["a", "b", "c", "d"],
              roundStartedAt: t0 - 5_000,
              slowPhaseEndsAt: t0 + 15_000,
              mediumPhaseEndsAt: t0 + 35_000,
              roundEndsAt: t0 + 60_000,
              myPhrase: "moon",
              clueSkipsRemaining: 1
            }
          }
        })}
        currentParticipantId="a"
        isHost
        send={send}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /new clue/i }));
    expect(send).toHaveBeenCalledWith({ type: "catchPhrase:skipClue", payload: {} });
  });

  it("disables new clue after the skip is used and hides it for non-holders", () => {
    const t0 = Date.now();
    const liveBase = {
      status: "playing" as const,
      roundPhase: "live" as const,
      teamAIds: ["a", "b"],
      teamBIds: ["c", "d"],
      teamScores: { A: 0, B: 0 },
      holderId: "a",
      passOrder: ["a", "b", "c", "d"],
      roundStartedAt: t0 - 5_000,
      slowPhaseEndsAt: t0 + 15_000,
      mediumPhaseEndsAt: t0 + 35_000,
      roundEndsAt: t0 + 60_000,
      myPhrase: "moon" as string | null,
      clueSkipsRemaining: 0 as const
    };
    const { rerender } = render(
      <CatchPhraseGame
        session={catchPhraseSession({
          gameState: { type: "catchPhrase", state: liveBase }
        })}
        currentParticipantId="a"
        isHost
        send={vi.fn()}
      />
    );
    expect((screen.getByRole("button", { name: /skip used this turn/i }) as HTMLButtonElement).disabled).toBe(true);

    rerender(
      <CatchPhraseGame
        session={catchPhraseSession({
          gameState: {
            type: "catchPhrase",
            state: { ...liveBase, clueSkipsRemaining: 1, myPhrase: null }
          }
        })}
        currentParticipantId="b"
        isHost={false}
        send={vi.fn()}
      />
    );
    expect(screen.queryByRole("button", { name: /new clue/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /skip used/i })).toBeNull();
  });
});
