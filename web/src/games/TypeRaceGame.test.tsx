import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SessionState } from "../../../shared/contracts";
import { TypeRaceGame } from "./TypeRaceGame";

const emptyPlayer = {
  status: "racing" as const,
  finishedAt: null as number | null
};

const prompt = {
  id: "tr-001",
  text: "Friday nights used to mean scrambling for plans at the last minute."
};

const baseSession = (overrides: Partial<SessionState> = {}): SessionState => ({
  sessionId: "s1",
  sessionName: "Test",
  joinCode: "TEST",
  participants: [
    { id: "a", displayName: "Ann", score: 0, isHost: true, isActive: true },
    { id: "b", displayName: "Bob", score: 0, isHost: false, isActive: true }
  ],
  activeGame: "typeRace",
  gameState: {
    type: "typeRace",
    state: {
      status: "idle",
      players: {},
      usedPromptIds: []
    }
  },
  ...overrides
});

describe("TypeRaceGame", () => {
  it("lets the host start a race from idle", () => {
    const send = vi.fn();
    render(
      <TypeRaceGame
        session={baseSession()}
        currentParticipantId="a"
        isHost
        canPlay
        send={send}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /start race/i }));
    expect(send).toHaveBeenCalledWith({ type: "typeRace:startRound", payload: {} });
  });

  it("shows a disabled textarea during countdown", () => {
    render(
      <TypeRaceGame
        session={baseSession({
          gameState: {
            type: "typeRace",
            state: {
              status: "countdown",
              countdownEndsAt: Date.now() + 2500,
              prompt,
              players: { a: emptyPlayer, b: emptyPlayer },
              usedPromptIds: [prompt.id]
            }
          }
        })}
        currentParticipantId="a"
        isHost
        canPlay
        send={vi.fn()}
      />
    );

    const input = screen.getByLabelText(/type the paragraph/i) as HTMLTextAreaElement;
    expect(input.disabled).toBe(true);
    expect((screen.getByRole("button", { name: /^finished$/i }) as HTMLButtonElement).disabled).toBe(
      true
    );
  });

  it("shows a textarea and Finished without accuracy feedback while racing", () => {
    const send = vi.fn();
    render(
      <TypeRaceGame
        session={baseSession({
          gameState: {
            type: "typeRace",
            state: {
              status: "racing",
              startedAt: Date.now() - 1000,
              prompt,
              players: { a: emptyPlayer, b: emptyPlayer },
              usedPromptIds: [prompt.id]
            }
          }
        })}
        currentParticipantId="a"
        isHost
        canPlay
        send={send}
      />
    );

    expect(screen.getByLabelText(/race prompt/i).textContent).toContain("Friday nights");
    const input = screen.getByLabelText(/type the paragraph/i) as HTMLTextAreaElement;
    expect(input.tagName).toBe("TEXTAREA");
    expect(input.disabled).toBe(false);
    expect(document.activeElement).toBe(input);
    expect(screen.queryByText(/accuracy/i)).toBeNull();
    expect(screen.queryByText(/%/)).toBeNull();

    fireEvent.paste(input, { clipboardData: { getData: () => prompt.text } });
    expect(input.value).toBe("");

    fireEvent.change(input, { target: { value: "typed text" } });
    fireEvent.click(screen.getByRole("button", { name: /^finished$/i }));
    expect(send).toHaveBeenCalledWith({
      type: "typeRace:finish",
      payload: { text: "typed text" }
    });
  });

  it("names the winner on the results screen with highlighted winner row", () => {
    const { container } = render(
      <TypeRaceGame
        session={baseSession({
          gameState: {
            type: "typeRace",
            state: {
              status: "results",
              startedAt: Date.now() - 10_000,
              prompt,
              winnerIds: ["a"],
              standings: [
                {
                  participantId: "a",
                  place: 1,
                  finished: true,
                  elapsedMs: 4000,
                  errors: 0,
                  correct: prompt.text.length,
                  accuracy: 1,
                  penaltyMs: 0,
                  adjustedMs: 4000,
                  wordsPerMinute: 72.5,
                  submittedText: prompt.text,
                  ffPoints: 1
                },
                {
                  participantId: "b",
                  place: 2,
                  finished: true,
                  elapsedMs: 7000,
                  errors: 2,
                  correct: prompt.text.length - 2,
                  accuracy: 0.97,
                  penaltyMs: 1000,
                  adjustedMs: 8000,
                  wordsPerMinute: 40,
                  submittedText: "almost",
                  ffPoints: 0
                }
              ],
              players: {
                a: { status: "finished", finishedAt: Date.now() - 6000 },
                b: { status: "finished", finishedAt: Date.now() - 3000 }
              },
              usedPromptIds: [prompt.id]
            }
          }
        })}
        currentParticipantId="a"
        isHost
        canPlay
        send={vi.fn()}
      />
    );

    expect(screen.getByText(/winner/i).textContent).toMatch(/Ann/i);
    expect(screen.getByLabelText(/race rankings/i)).toBeTruthy();
    expect(screen.getByText(/\+1 FF/)).toBeTruthy();
    expect(screen.getByText(/72\.5 WPM/)).toBeTruthy();
    expect(container.querySelectorAll(".type-race-standing-row.is-winner")).toHaveLength(1);
  });
});
