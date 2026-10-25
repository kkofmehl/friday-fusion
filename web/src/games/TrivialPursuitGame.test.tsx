import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SessionState, TrivialPursuitState } from "../../../shared/contracts";
import { emptyWedges } from "../../../shared/trivialPursuitLogic";
import { TrivialPursuitGame } from "./TrivialPursuitGame";

const baseState = (overrides: Partial<TrivialPursuitState> = {}): TrivialPursuitState => ({
  status: "playing",
  phase: "rolling",
  wedgeMode: "fast",
  playerOrder: ["p1", "p2"],
  players: [
    { participantId: "p1", spaceId: "hub", wedges: emptyWedges(), choiceHelpsRemaining: 5 },
    { participantId: "p2", spaceId: "hub", wedges: emptyWedges(), choiceHelpsRemaining: 5 }
  ],
  currentTurnId: "p1",
  readerId: null,
  lastDieRoll: null,
  legalMoveSpaceIds: [],
  activeCategory: null,
  activeQuestion: null,
  questionShownAt: null,
  choicesShownAt: null,
  clockEndsAt: null,
  answerRevealed: false,
  finalCategoryChooserId: null,
  awaitingHubReturn: false,
  winnerParticipantId: null,
  lastOutcome: null,
  questionError: null,
  ...overrides
});

const buildSession = (state: TrivialPursuitState): SessionState => ({
  sessionId: "s1",
  sessionName: "Test",
  joinCode: "BRIGHT-OTTER",
  participants: [
    { id: "p1", displayName: "Alice", score: 0, isHost: true, isActive: true },
    { id: "p2", displayName: "Bob", score: 0, isHost: false, isActive: true }
  ],
  activeGame: "trivialPursuit",
  gameState: { type: "trivialPursuit", state }
});

describe("TrivialPursuitGame", () => {
  it("lets the current player roll and hides roll for others", () => {
    const send = vi.fn();
    const { rerender } = render(
      <TrivialPursuitGame
        session={buildSession(baseState())}
        currentParticipantId="p1"
        isHost
        send={send}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Roll" }));
    expect(send).toHaveBeenCalledWith({ type: "trivialPursuit:roll", payload: {} });

    rerender(
      <TrivialPursuitGame
        session={buildSession(baseState())}
        currentParticipantId="p2"
        isHost={false}
        send={send}
      />
    );
    expect(screen.queryByRole("button", { name: "Roll" })).toBeNull();
    expect(screen.getByText(/Waiting for/i)).toBeTruthy();
  });

  it("hides question text from the answerer until shown", () => {
    render(
      <TrivialPursuitGame
        session={buildSession(
          baseState({
            phase: "reading",
            currentTurnId: "p1",
            readerId: "p2",
            activeCategory: "geography",
            activeQuestion: {
              id: "q1",
              category: "geography",
              text: null,
              correctAnswer: null,
              choices: null
            }
          })
        )}
        currentParticipantId="p1"
        isHost
        send={vi.fn()}
      />
    );
    expect(screen.getByText(/being read aloud/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Reveal Question" })).toBeNull();
    expect(screen.getByRole("button", { name: "Request answers (5 left)" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Reveal answer" })).toBeNull();
  });

  it("shows reader controls for Reveal Question and Reveal answer, not Request answers", () => {
    const send = vi.fn();
    render(
      <TrivialPursuitGame
        session={buildSession(
          baseState({
            phase: "reading",
            currentTurnId: "p1",
            readerId: "p2",
            activeCategory: "geography",
            activeQuestion: {
              id: "q1",
              category: "geography",
              text: "Capital of France?",
              correctAnswer: null,
              choices: ["Paris", "London", "Berlin", "Madrid"]
            }
          })
        )}
        currentParticipantId="p2"
        isHost={false}
        send={send}
      />
    );
    expect(screen.getByText("Capital of France?")).toBeTruthy();
    expect(screen.getByTestId("tp-choices").textContent).toMatch(/Paris/);
    fireEvent.click(screen.getByRole("button", { name: "Reveal Question" }));
    expect(send).toHaveBeenCalledWith({ type: "trivialPursuit:showQuestion", payload: {} });
    expect(screen.queryByRole("button", { name: /Request answers/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Reveal answer" }));
    expect(send).toHaveBeenCalledWith({ type: "trivialPursuit:reveal", payload: {} });
  });

  it("lets the answerer request choices and shows them unmarked after a help is spent", () => {
    const send = vi.fn();
    const { rerender } = render(
      <TrivialPursuitGame
        session={buildSession(
          baseState({
            phase: "reading",
            currentTurnId: "p1",
            readerId: "p2",
            questionShownAt: 1_000,
            activeCategory: "geography",
            activeQuestion: {
              id: "q1",
              category: "geography",
              text: "Capital of France?",
              correctAnswer: null,
              choices: null
            }
          })
        )}
        currentParticipantId="p1"
        isHost
        send={send}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Request answers (5 left)" }));
    expect(send).toHaveBeenCalledWith({ type: "trivialPursuit:requestChoices", payload: {} });

    rerender(
      <TrivialPursuitGame
        session={buildSession(
          baseState({
            phase: "reading",
            currentTurnId: "p1",
            readerId: "p2",
            questionShownAt: 1_000,
            choicesShownAt: 1_500,
            players: [
              { participantId: "p1", spaceId: "hub", wedges: emptyWedges(), choiceHelpsRemaining: 4 },
              { participantId: "p2", spaceId: "hub", wedges: emptyWedges(), choiceHelpsRemaining: 5 }
            ],
            activeCategory: "geography",
            activeQuestion: {
              id: "q1",
              category: "geography",
              text: "Capital of France?",
              correctAnswer: null,
              choices: ["Paris", "London", "Berlin", "Madrid"]
            }
          })
        )}
        currentParticipantId="p1"
        isHost
        send={send}
      />
    );
    expect(screen.getByTestId("tp-choices").textContent).toMatch(/Paris/);
    expect(screen.getByTestId("tp-choices").querySelector(".is-correct")).toBeNull();
    expect(screen.queryByRole("button", { name: /Request answers/i })).toBeNull();
  });

  it("highlights the correct choice after reveal for everyone", () => {
    render(
      <TrivialPursuitGame
        session={buildSession(
          baseState({
            phase: "judging",
            currentTurnId: "p1",
            readerId: "p2",
            answerRevealed: true,
            activeCategory: "geography",
            activeQuestion: {
              id: "q1",
              category: "geography",
              text: "Capital of France?",
              correctAnswer: "Paris",
              choices: ["London", "Paris", "Berlin", "Madrid"]
            }
          })
        )}
        currentParticipantId="p1"
        isHost
        send={vi.fn()}
      />
    );
    expect(screen.getByTestId("tp-choices").querySelector(".is-correct")?.textContent).toBe("Paris");
    expect(screen.getByText(/Correct answer: Paris/i)).toBeTruthy();
  });

  it("shows Clock after the delay and keeps countdown at zero", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    const send = vi.fn();
    const shownAt = 1_000_000;
    const { rerender } = render(
      <TrivialPursuitGame
        session={buildSession(
          baseState({
            phase: "reading",
            currentTurnId: "p1",
            readerId: "p2",
            questionShownAt: shownAt,
            activeCategory: "history",
            activeQuestion: {
              id: "q2",
              category: "history",
              text: "Who?",
              correctAnswer: null,
              choices: ["Them", "Us", "You", "Me"]
            }
          })
        )}
        currentParticipantId="p2"
        isHost={false}
        send={send}
      />
    );

    expect((screen.getByRole("button", { name: "Clock" }) as HTMLButtonElement).disabled).toBe(true);
    act(() => {
      vi.setSystemTime(shownAt + 10_000);
      vi.advanceTimersByTime(300);
    });
    expect((screen.getByRole("button", { name: "Clock" }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Clock" }));
    expect(send).toHaveBeenCalledWith({ type: "trivialPursuit:startClock", payload: {} });

    rerender(
      <TrivialPursuitGame
        session={buildSession(
          baseState({
            phase: "judging",
            currentTurnId: "p1",
            readerId: "p2",
            questionShownAt: shownAt,
            clockEndsAt: shownAt + 5_000,
            answerRevealed: true,
            activeCategory: "history",
            activeQuestion: {
              id: "q2",
              category: "history",
              text: "Who?",
              correctAnswer: "Them",
              choices: ["Them", "Us", "You", "Me"]
            }
          })
        )}
        currentParticipantId="p2"
        isHost={false}
        send={send}
      />
    );
    act(() => {
      vi.setSystemTime(shownAt + 60_000);
      vi.advanceTimersByTime(300);
    });
    expect(screen.getByText(/Time's up/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Correct" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Incorrect" })).toBeTruthy();
    vi.useRealTimers();
  });

  it("highlights legal spaces for the mover", () => {
    const send = vi.fn();
    render(
      <TrivialPursuitGame
        session={buildSession(
          baseState({
            phase: "choosingMove",
            lastDieRoll: 1,
            legalMoveSpaceIds: ["spoke-0-0"]
          })
        )}
        currentParticipantId="p1"
        isHost
        send={send}
      />
    );
    fireEvent.click(screen.getByTestId("tp-space-spoke-0-0"));
    expect(send).toHaveBeenCalledWith({
      type: "trivialPursuit:move",
      payload: { spaceId: "spoke-0-0" }
    });
  });

  it("renders the polished board with hub and track", () => {
    render(
      <TrivialPursuitGame
        session={buildSession(baseState())}
        currentParticipantId="p1"
        isHost
        send={vi.fn()}
      />
    );
    expect(screen.getByTestId("tp-board")).toBeTruthy();
    expect(screen.getByTestId("tp-space-hub")).toBeTruthy();
    expect(screen.getByTestId("tp-space-hq-0")).toBeTruthy();
    expect(screen.getByTestId("tp-space-ring-0-1")).toBeTruthy();
  });

  it("shows the active wedge mode", () => {
    const { rerender } = render(
      <TrivialPursuitGame
        session={buildSession(baseState({ wedgeMode: "fast" }))}
        currentParticipantId="p1"
        isHost
        send={vi.fn()}
      />
    );
    expect(screen.getByTestId("tp-wedge-mode").textContent).toMatch(/Fast wedges/i);
    rerender(
      <TrivialPursuitGame
        session={buildSession(baseState({ wedgeMode: "classic" }))}
        currentParticipantId="p1"
        isHost
        send={vi.fn()}
      />
    );
    expect(screen.getByTestId("tp-wedge-mode").textContent).toMatch(/Classic wedges/i);
  });

  it("shows an end-of-game standings screen with the winner", () => {
    const winnerWedges = emptyWedges();
    for (const key of Object.keys(winnerWedges) as (keyof typeof winnerWedges)[]) {
      winnerWedges[key] = true;
    }
    const other = emptyWedges();
    other.geography = true;
    render(
      <TrivialPursuitGame
        session={buildSession(
          baseState({
            status: "finished",
            phase: "finished",
            winnerParticipantId: "p1",
            lastOutcome: "Correct — game won!",
            players: [
              { participantId: "p1", spaceId: "hub", wedges: winnerWedges, choiceHelpsRemaining: 3 },
              { participantId: "p2", spaceId: "spoke-0-0", wedges: other, choiceHelpsRemaining: 5 }
            ]
          })
        )}
        currentParticipantId="p2"
        isHost={false}
        send={vi.fn()}
      />
    );
    expect(screen.getByTestId("tp-finished")).toBeTruthy();
    expect(screen.getByText(/Game over/i)).toBeTruthy();
    expect(screen.getByText(/wins!/i)).toBeTruthy();
    expect(screen.getByTestId("tp-standing-p1").textContent).toMatch(/Winner/);
    expect(screen.getByTestId("tp-standing-p1").textContent).toMatch(/\+2/);
    expect(screen.getByTestId("tp-standing-p2").textContent).toMatch(/1\/6/);
    expect(screen.queryByRole("button", { name: "Roll" })).toBeNull();
  });

  it("lists only earned wedge colors beside player names", () => {
    const wedges = emptyWedges();
    wedges.geography = true;
    wedges.history = true;
    render(
      <TrivialPursuitGame
        session={buildSession(
          baseState({
            players: [
              { participantId: "p1", spaceId: "hub", wedges, choiceHelpsRemaining: 5 },
              { participantId: "p2", spaceId: "hub", wedges: emptyWedges(), choiceHelpsRemaining: 5 }
            ]
          })
        )}
        currentParticipantId="p1"
        isHost
        send={vi.fn()}
      />
    );
    const row = screen.getByTestId("tp-player-row-p1");
    expect(row.querySelectorAll(".tp-wedge-chip")).toHaveLength(2);
    expect(screen.getByTestId("tp-player-row-p2").textContent).toMatch(/0/);
  });

  it("shows a player popover when hovering a board token", () => {
    const wedges = emptyWedges();
    wedges.scienceAndNature = true;
    render(
      <TrivialPursuitGame
        session={buildSession(
          baseState({
            players: [
              { participantId: "p1", spaceId: "hub", wedges, choiceHelpsRemaining: 5 },
              { participantId: "p2", spaceId: "hub", wedges: emptyWedges(), choiceHelpsRemaining: 5 }
            ]
          })
        )}
        currentParticipantId="p1"
        isHost
        send={vi.fn()}
      />
    );
    expect(screen.queryByTestId("tp-token-popover")).toBeNull();
    fireEvent.mouseEnter(screen.getByTestId("tp-token-p1"));
    const popover = screen.getByTestId("tp-token-popover");
    expect(popover.textContent).toMatch(/Alice/);
    expect(popover.textContent).toMatch(/Science/i);
    fireEvent.mouseLeave(screen.getByTestId("tp-token-p1"));
    expect(screen.queryByTestId("tp-token-popover")).toBeNull();
  });
});
