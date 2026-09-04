import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SessionState } from "../../../shared/contracts";
import { FriendlyFeudGame } from "./FriendlyFeudGame";

const sixPlayers = [
  { id: "a", displayName: "Ann", score: 0, isHost: true, isActive: true },
  { id: "b", displayName: "Bob", score: 0, isHost: false, isActive: true },
  { id: "c", displayName: "Cara", score: 0, isHost: false, isActive: true },
  { id: "d", displayName: "Dan", score: 0, isHost: false, isActive: true },
  { id: "e", displayName: "Eve", score: 0, isHost: false, isActive: true },
  { id: "f", displayName: "Fay", score: 0, isHost: false, isActive: true }
];

const feudSession = (overrides: Partial<SessionState> = {}): SessionState => ({
  sessionId: "s1",
  sessionName: "Test",
  joinCode: "TEST",
  participants: sixPlayers,
  activeGame: "friendlyFeud",
  gameState: {
    type: "friendlyFeud",
    state: {
      status: "teamSetup",
      teamAIds: [],
      teamBIds: []
    }
  },
  ...overrides
});

describe("FriendlyFeudGame", () => {
  it("saves draft teams then begins play when host starts", () => {
    const send = vi.fn();
    render(
      <FriendlyFeudGame session={feudSession()} currentParticipantId="a" isHost send={send} />
    );
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(6);
    for (let i = 0; i < 3; i++) {
      fireEvent.click(within(rows[i]!).getByRole("radio", { name: "Team A" }));
    }
    for (let i = 3; i < 6; i++) {
      fireEvent.click(within(rows[i]!).getByRole("radio", { name: "Team B" }));
    }
    fireEvent.click(screen.getByRole("button", { name: "Start Friendly Feud" }));
    expect(send).toHaveBeenNthCalledWith(1, {
      type: "friendlyFeud:setTeams",
      payload: { teamAIds: ["a", "b", "c"], teamBIds: ["d", "e", "f"] }
    });
    expect(send).toHaveBeenNthCalledWith(2, { type: "friendlyFeud:beginPlay", payload: {} });
  });

  it("shows a waiting message for non-hosts during team setup", () => {
    render(
      <FriendlyFeudGame
        session={feudSession()}
        currentParticipantId="b"
        isHost={false}
        send={vi.fn()}
      />
    );
    expect(screen.getByText(/Only the host can assign teams/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Start Friendly Feud" })).toBeNull();
  });

  it("gates buzz and guess controls to the current face-off actor", () => {
    const send = vi.fn();
    const now = Date.now();
    const faceOff = feudSession({
      gameState: {
        type: "friendlyFeud",
        state: {
          status: "faceOff",
          teamAIds: ["a", "b", "c"],
          teamBIds: ["d", "e", "f"],
          teamScores: { A: 0, B: 0 },
          roundIndex: 0,
          multiply: 1,
          question: "Name something fun",
          board: [{ revealed: false }, { revealed: false }, { revealed: false }],
          pot: 0,
          strikes: 0,
          lastGuess: null,
          faceOffPlayerAId: "a",
          faceOffPlayerBId: "d",
          buzzedParticipantId: null,
          answeringParticipantId: null,
          awaitingSecondAnswer: false,
          buzzOpensAt: now - 100,
          answerEndsAt: null
        }
      }
    });

    const { rerender } = render(
      <FriendlyFeudGame session={faceOff} currentParticipantId="a" isHost send={send} />
    );
    expect(screen.getByRole("button", { name: "Buzz!" })).toBeTruthy();
    expect(screen.queryByLabelText(/Your answer/i)).toBeNull();

    rerender(
      <FriendlyFeudGame session={faceOff} currentParticipantId="b" isHost={false} send={send} />
    );
    expect(screen.queryByRole("button", { name: "Buzz!" })).toBeNull();

    const answering = feudSession({
      gameState: {
        type: "friendlyFeud",
        state: {
          status: "faceOff",
          teamAIds: ["a", "b", "c"],
          teamBIds: ["d", "e", "f"],
          teamScores: { A: 0, B: 0 },
          roundIndex: 0,
          multiply: 1,
          question: "Name something fun",
          board: [{ revealed: false }, { revealed: false }, { revealed: false }],
          pot: 0,
          strikes: 0,
          lastGuess: null,
          faceOffPlayerAId: "a",
          faceOffPlayerBId: "d",
          buzzedParticipantId: "a",
          answeringParticipantId: "a",
          awaitingSecondAnswer: false,
          buzzOpensAt: now - 100,
          answerEndsAt: now + 7_000
        }
      }
    });
    rerender(
      <FriendlyFeudGame session={answering} currentParticipantId="a" isHost send={send} />
    );
    expect(screen.queryByRole("button", { name: "Buzz!" })).toBeNull();
    expect(screen.getByText(/Answer timer/i)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Your answer/i), { target: { value: "TV" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(send).toHaveBeenCalledWith({
      type: "friendlyFeud:submitGuess",
      payload: { guess: "TV" }
    });
  });

  it("hides Buzz during the opening countdown", () => {
    const now = Date.now();
    render(
      <FriendlyFeudGame
        session={feudSession({
          gameState: {
            type: "friendlyFeud",
            state: {
              status: "faceOff",
              teamAIds: ["a", "b", "c"],
              teamBIds: ["d", "e", "f"],
              teamScores: { A: 0, B: 0 },
              roundIndex: 0,
              multiply: 1,
              question: "Name something fun",
              board: [{ revealed: false }, { revealed: false }],
              pot: 0,
              strikes: 0,
              lastGuess: null,
              faceOffPlayerAId: "a",
              faceOffPlayerBId: "d",
              buzzedParticipantId: null,
              answeringParticipantId: null,
              awaitingSecondAnswer: false,
              buzzOpensAt: now + 3_000,
              answerEndsAt: null
            }
          }
        })}
        currentParticipantId="a"
        isHost
        send={vi.fn()}
      />
    );
    expect(screen.queryByRole("button", { name: "Buzz!" })).toBeNull();
    expect(screen.getByText(/Get ready/i)).toBeTruthy();
  });

  it("keeps the board up after a round until the host continues", () => {
    const send = vi.fn();
    const reveal = feudSession({
      gameState: {
        type: "friendlyFeud",
        state: {
          status: "roundReveal",
          teamAIds: ["a", "b", "c"],
          teamBIds: ["d", "e", "f"],
          teamScores: { A: 65, B: 0 },
          roundIndex: 0,
          multiply: 1,
          question: "Name something fun",
          board: [
            { revealed: true, ans: "TV", pnt: 40 },
            { revealed: true, ans: "Sports", pnt: 25 }
          ],
          pot: 65,
          strikes: 0,
          lastGuess: null,
          awardedTeam: "A",
          awardedPoints: 65
        }
      }
    });

    const { rerender } = render(
      <FriendlyFeudGame session={reveal} currentParticipantId="a" isHost send={send} />
    );
    expect(screen.getByText(/Team A scored 65 Family Feud points/i)).toBeTruthy();
    expect(screen.getByTestId("friendly-feud-slot-0")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(send).toHaveBeenCalledWith({ type: "friendlyFeud:continue", payload: {} });

    rerender(
      <FriendlyFeudGame session={reveal} currentParticipantId="b" isHost={false} send={vi.fn()} />
    );
    expect(screen.getByText(/Waiting for the host to continue/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();
  });

  it("renders finished recap with round-by-round results", () => {
    render(
      <FriendlyFeudGame
        session={feudSession({
          gameState: {
            type: "friendlyFeud",
            state: {
              status: "finished",
              teamAIds: ["a", "b", "c"],
              teamBIds: ["d", "e", "f"],
              teamScores: { A: 120, B: 40 },
              winnerTeams: ["A"],
              roundResults: [
                {
                  roundIndex: 0,
                  question: "Name something people watch",
                  awardedTeam: "A",
                  awardedPoints: 65
                },
                {
                  roundIndex: 1,
                  question: "Name a fruit",
                  awardedTeam: "B",
                  awardedPoints: 40
                },
                {
                  roundIndex: 2,
                  question: "Name a color",
                  awardedTeam: "A",
                  awardedPoints: 55
                }
              ]
            }
          }
        })}
        currentParticipantId="a"
        isHost
        send={vi.fn()}
      />
    );
    expect(screen.getByRole("status").textContent).toMatch(/Team A.*wins/i);
    expect(screen.getByText("Round-by-round")).toBeTruthy();
    expect(screen.getByText("Name something people watch")).toBeTruthy();
    expect(screen.getByText("Name a fruit")).toBeTruthy();
    expect(screen.getByText(/Friday Fusion points/i)).toBeTruthy();
  });
});
