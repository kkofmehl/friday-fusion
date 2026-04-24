import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SessionState } from "../../../shared/contracts";
import { HangmanGame } from "./HangmanGame";

const buildSession = (overrides: Partial<SessionState["gameState"] & { type: "hangman" }> = {}): SessionState => ({
  sessionId: "s1",
  sessionName: "Test",
  joinCode: "BRIGHT-OTTER",
  participants: [
    { id: "p1", displayName: "Alice", score: 0, isHost: true },
    { id: "p2", displayName: "Bob", score: 0, isHost: false },
    { id: "p3", displayName: "Carol", score: 0, isHost: false }
  ],
  activeGame: "hangman",
  gameState: {
    type: "hangman",
    state: {
      puzzleCreatorId: "p1",
      maskedWord: "C_T",
      guessedLetters: ["C", "T"],
      wrongGuessCount: 0,
      maxWrongGuesses: 6,
      status: "inProgress",
      revealedWord: null,
      mode: "team",
      currentTurnId: null,
      activeSolverId: null,
      activityLog: [],
      ...overrides
    } as any
  }
});

describe("HangmanGame", () => {
  it("disables already guessed letters and sends new guesses", () => {
    const send = vi.fn();
    render(
      <HangmanGame
        session={buildSession()}
        currentParticipantId="p2"
        isHost={false}
        send={send}
      />
    );
    const usedC = screen.getByRole("button", { name: "C" });
    expect((usedC as HTMLButtonElement).disabled).toBe(true);

    const letterA = screen.getByRole("button", { name: "A" });
    fireEvent.click(letterA);
    expect(send).toHaveBeenCalledWith({ type: "hangman:guessLetter", payload: { letter: "A" } });
  });

  it("shows the revealed word when the round ends", () => {
    const session = buildSession({
      status: "won",
      maskedWord: "CAT",
      guessedLetters: ["C", "A", "T"],
      revealedWord: "CAT"
    } as any);
    render(
      <HangmanGame session={session} currentParticipantId="p2" isHost={false} send={vi.fn()} />
    );
    expect(screen.getByText(/You cracked it!/)).toBeDefined();
    expect(screen.getByText("CAT")).toBeDefined();
  });

  it("in turns mode only lets the active guesser press letters", () => {
    const send = vi.fn();
    const session = buildSession({ mode: "turns", currentTurnId: "p3" } as any);
    render(
      <HangmanGame session={session} currentParticipantId="p2" isHost={false} send={send} />
    );

    expect(screen.getByText(/Waiting on/)).toBeDefined();
    expect(screen.getAllByText("Carol").length).toBeGreaterThan(0);

    const letterA = screen.getByRole("button", { name: "A" }) as HTMLButtonElement;
    expect(letterA.disabled).toBe(true);
    fireEvent.click(letterA);
    expect(send).not.toHaveBeenCalled();
  });

  it("exposes a Solve button for the active guesser that sends hangman:solve", () => {
    const send = vi.fn();
    const session = buildSession({ mode: "turns", currentTurnId: "p2" } as any);
    render(
      <HangmanGame session={session} currentParticipantId="p2" isHost={false} send={send} />
    );

    const solveBtn = screen.getByRole("button", { name: "Solve" }) as HTMLButtonElement;
    expect(solveBtn.disabled).toBe(false);
    fireEvent.click(solveBtn);

    const input = screen.getByLabelText(/Type the full answer/);
    expect((input as HTMLInputElement).getAttribute("placeholder")).toBe("Type guess here");
    fireEvent.change(input, { target: { value: "  george washington " } });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(send).toHaveBeenCalledWith({
      type: "hangman:solve",
      payload: { guess: "george washington" }
    });
  });

  it("hides the Solve button from non-active guessers in turns mode", () => {
    const session = buildSession({ mode: "turns", currentTurnId: "p3" } as any);
    render(
      <HangmanGame session={session} currentParticipantId="p2" isHost={false} send={vi.fn()} />
    );
    const solveBtn = screen.getByRole("button", { name: "Solve" }) as HTMLButtonElement;
    expect(solveBtn.disabled).toBe(true);
  });

  it("in turns mode enables the keyboard for the active guesser", () => {
    const send = vi.fn();
    const session = buildSession({ mode: "turns", currentTurnId: "p2" } as any);
    render(
      <HangmanGame session={session} currentParticipantId="p2" isHost={false} send={send} />
    );
    expect(screen.getByText(/Your turn/)).toBeDefined();

    const letterA = screen.getByRole("button", { name: "A" }) as HTMLButtonElement;
    expect(letterA.disabled).toBe(false);
    fireEvent.click(letterA);
    expect(send).toHaveBeenCalledWith({ type: "hangman:guessLetter", payload: { letter: "A" } });
  });

  it("locks team mode input for non-solver while someone is attempting solve", () => {
    const send = vi.fn();
    const session = buildSession({ mode: "team", activeSolverId: "p3", currentTurnId: null } as any);
    render(
      <HangmanGame session={session} currentParticipantId="p2" isHost={false} send={send} />
    );

    const letterA = screen.getByRole("button", { name: "A" }) as HTMLButtonElement;
    const solveBtn = screen.getByRole("button", { name: "Solve" }) as HTMLButtonElement;
    expect(letterA.disabled).toBe(true);
    expect(solveBtn.disabled).toBe(true);
  });

  it("renders activity feed entries for correct, wrong, and solve events", () => {
    const session = buildSession({
      mode: "team",
      activityLog: [
        { kind: "letterCorrect", participantId: "p2", letter: "A", createdAt: 1 },
        { kind: "letterWrong", participantId: "p3", letter: "Z", createdAt: 2 },
        { kind: "solveAttempt", participantId: "p2", letter: null, createdAt: 3 }
      ]
    } as any);
    render(
      <HangmanGame session={session} currentParticipantId="p2" isHost={false} send={vi.fn()} />
    );

    expect(screen.getByText("Bob guessed A right")).toBeDefined();
    expect(screen.getByText("Carol guessed Z wrong")).toBeDefined();
    expect(screen.getByText("Bob is attempting to solve the puzzle")).toBeDefined();
  });

  it("offers a rotated default creator for the next round when game is over", () => {
    const send = vi.fn();
    const session = buildSession({
      status: "won",
      revealedWord: "CAT",
      mode: "turns",
      puzzleCreatorId: "p1",
      activityLog: []
    } as any);
    render(
      <HangmanGame session={session} currentParticipantId="p1" isHost send={send} />
    );

    const nextCreator = screen.getByLabelText("Next puzzle creator") as HTMLSelectElement;
    expect(nextCreator.value).toBe("p2");
    fireEvent.click(screen.getByRole("button", { name: "Play another round" }));
    expect(send).toHaveBeenCalledWith({
      type: "game:start",
      payload: {
        game: "hangman",
        options: {
          hangmanMode: "turns",
          hangmanCreatorId: "p2"
        }
      }
    });
  });
});
