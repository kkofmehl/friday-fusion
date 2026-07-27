import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SessionState } from "../../../shared/contracts";
import { WordleGame } from "./WordleGame";

const emptyPlayer = {
  evaluations: [] as ("absent" | "present" | "correct")[][],
  status: "racing" as const,
  guessCount: 0,
  finishedAt: null as number | null
};

const baseSession = (overrides: Partial<SessionState> = {}): SessionState => ({
  sessionId: "s1",
  sessionName: "Test",
  joinCode: "TEST",
  participants: [
    { id: "a", displayName: "Ann", score: 0, isHost: true, isActive: true },
    { id: "b", displayName: "Bob", score: 0, isHost: false, isActive: true }
  ],
  activeGame: "wordle",
  gameState: {
    type: "wordle",
    state: {
      status: "idle",
      players: {},
      usedAnswers: []
    }
  },
  ...overrides
});

describe("WordleGame", () => {
  it("lets the host start a race from idle", () => {
    const send = vi.fn();
    render(
      <WordleGame
        session={baseSession()}
        currentParticipantId="a"
        isHost
        canPlay
        send={send}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /start race/i }));
    expect(send).toHaveBeenCalledWith({ type: "wordle:startRound", payload: {} });
  });

  it("shows countdown", () => {
    render(
      <WordleGame
        session={baseSession({
          gameState: {
            type: "wordle",
            state: {
              status: "countdown",
              countdownEndsAt: Date.now() + 2500,
              players: { a: emptyPlayer, b: emptyPlayer },
              usedAnswers: ["crane"]
            }
          }
        })}
        currentParticipantId="a"
        isHost
        canPlay
        send={vi.fn()}
      />
    );
    expect(document.querySelector(".wordle-countdown")?.textContent).toMatch(/^(3|2|1|Go!)$/);
  });

  it("submits a guess from the keyboard during racing", () => {
    const send = vi.fn();
    render(
      <WordleGame
        session={baseSession({
          gameState: {
            type: "wordle",
            state: {
              status: "racing",
              startedAt: Date.now() - 1000,
              players: {
                a: emptyPlayer,
                b: {
                  evaluations: [["absent", "present", "correct", "absent", "absent"]],
                  status: "racing",
                  guessCount: 1,
                  finishedAt: null
                }
              },
              myGuesses: [],
              usedAnswers: ["crane"]
            }
          }
        })}
        currentParticipantId="a"
        isHost
        canPlay
        send={send}
      />
    );

    expect(screen.getByRole("grid", { name: /your wordle board/i })).toBeTruthy();
    expect(screen.getByLabelText(/other players/i)).toBeTruthy();
    for (const letter of ["C", "R", "A", "N", "E"]) {
      fireEvent.click(screen.getByRole("button", { name: letter }));
    }
    fireEvent.click(screen.getByRole("button", { name: /enter/i }));
    expect(send).toHaveBeenCalledWith({ type: "wordle:submitGuess", payload: { guess: "crane" } });
  });

  it("shows summary rankings after round complete", () => {
    render(
      <WordleGame
        session={baseSession({
          gameState: {
            type: "wordle",
            state: {
              status: "roundComplete",
              startedAt: Date.now() - 10_000,
              answer: "crane",
              standings: [
                {
                  participantId: "a",
                  place: 1,
                  solved: true,
                  guessCount: 2,
                  elapsedMs: 4000,
                  ffPoints: 2
                },
                {
                  participantId: "b",
                  place: 2,
                  solved: false,
                  guessCount: 6,
                  elapsedMs: 9000,
                  ffPoints: 1
                }
              ],
              placementAwards: { a: 2, b: 1 },
              players: {
                a: {
                  evaluations: [
                    ["absent", "absent", "absent", "absent", "absent"],
                    ["correct", "correct", "correct", "correct", "correct"]
                  ],
                  status: "solved",
                  guessCount: 2,
                  finishedAt: Date.now() - 6000
                },
                b: {
                  evaluations: Array.from({ length: 6 }, () => [
                    "absent",
                    "absent",
                    "absent",
                    "absent",
                    "absent"
                  ] as ("absent" | "present" | "correct")[]),
                  status: "failed",
                  guessCount: 6,
                  finishedAt: Date.now() - 1000
                }
              },
              myGuesses: ["slate", "crane"],
              usedAnswers: ["crane"]
            }
          }
        })}
        currentParticipantId="a"
        isHost
        canPlay
        send={vi.fn()}
      />
    );

    expect(screen.getByText(/the word was/i).textContent).toMatch(/CRANE/);
    expect(screen.getByLabelText(/round rankings/i)).toBeTruthy();
    expect(screen.getByText(/\+2 FF/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /start next race/i })).toBeTruthy();
  });
});
