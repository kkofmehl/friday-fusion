import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionState } from "../../shared/contracts";
import { SessionService } from "./sessionService";
import { FileStore } from "./storage/fileStore";

const createService = async (): Promise<{ service: SessionService; tempDir: string }> => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "fusion-test-"));
  const store = new FileStore<{ sessions: any[] }>(path.join(tempDir, "sessions.json"));
  const service = new SessionService(store, undefined, tempDir);
  await service.load();
  return { service, tempDir };
};

describe("SessionService", () => {
  let tempDir = "";

  beforeEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = "";
    }
  });

  it("creates and joins session", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    const created = await setup.service.createSession("Host");
    expect(created.joinCode).toMatch(/^[A-Z0-9]+(?:-[A-Z0-9]+)+$/);

    const joined = await setup.service.joinSession(created.joinCode, "Guest");
    expect(joined.sessionId).toBe(created.sessionId);
    const state = setup.service.getState(created.sessionId);
    expect(state.participants).toHaveLength(2);
  });

  it("creates session with requested session name", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    const created = await setup.service.createSession("Host", "Friday Fusion Crew");
    expect(created.joinCode).toBe("FRIDAY-FUSION-CREW");
    expect(created.sessionName).toBe("Friday Fusion Crew");
  });

  it("lists active sessions for dropdown", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    await setup.service.createSession("Host", "Alpha Team");
    await setup.service.createSession("Host", "Bravo Team");
    const activeSessions = setup.service.listActiveSessions();
    expect(activeSessions.length).toBe(2);
    expect(activeSessions[0]?.sessionName).toBeTruthy();
    expect(activeSessions[0]?.joinCode).toMatch(/^[A-Z0-9-]+$/);
  });

  it("rejects invalid join codes", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    await expect(setup.service.joinSession("ZZZZZZ", "Guest")).rejects.toThrow("Invalid join code.");
  });

  it("keeps duplicate display names deterministic", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    const created = await setup.service.createSession("Host");
    const first = await setup.service.joinSession(created.joinCode, "Sam");
    const second = await setup.service.joinSession(created.joinCode, "Sam");
    expect(second.participantId).toBe(first.participantId);
  });

  it("progresses hangman wrong guesses", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    const created = await setup.service.createSession("Host");
    const joined = await setup.service.joinSession(created.joinCode, "Guest");
    await setup.service.startGame(created.sessionId, "hangman");
    await setup.service.setHangmanWord(created.sessionId, created.participantId, "CAT");
    await setup.service.guessHangmanLetter(created.sessionId, joined.participantId, "Z");
    const state = setup.service.getState(created.sessionId);
    if (!state.gameState || state.gameState.type !== "hangman") {
      throw new Error("Expected hangman state");
    }
    expect(state.gameState.state.wrongGuessCount).toBe(1);
  });

  it("uses host-selected hangman creator when provided", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    const host = await setup.service.createSession("Host");
    const guest = await setup.service.joinSession(host.joinCode, "Guest");
    await setup.service.startGame(host.sessionId, "hangman", {
      hangmanMode: "team",
      hangmanCreatorId: guest.participantId
    });
    const state = setup.service.getState(host.sessionId);
    if (state.gameState?.type !== "hangman") throw new Error("expected hangman");
    expect(state.gameState.state.puzzleCreatorId).toBe(guest.participantId);
  });

  it("rejects hangman creator ids that are not in the session", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    const host = await setup.service.createSession("Host");
    await expect(
      setup.service.startGame(host.sessionId, "hangman", {
        hangmanCreatorId: "missing-player"
      })
    ).rejects.toThrow("Puzzle creator must be in this session.");
  });

  it("scores two truths and a lie", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    const host = await setup.service.createSession("Host");
    const player = await setup.service.joinSession(host.joinCode, "Player");
    await setup.service.startGame(host.sessionId, "twoTruthsLie");
    await setup.service.submitTwoTruths(host.sessionId, host.participantId, ["A", "B", "C"], 2);
    await setup.service.beginVoting(host.sessionId, host.participantId);
    await setup.service.voteLie(host.sessionId, player.participantId, 1);
    await setup.service.revealTwoTruths(host.sessionId);
    const state = setup.service.getState(host.sessionId);
    const presenter = state.participants.find((participant) => participant.id === host.participantId);
    expect(presenter?.score).toBeGreaterThan(0);
  });

  it("awards trivia points for correct answers", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    const host = await setup.service.createSession("Host");
    const player = await setup.service.joinSession(host.joinCode, "Player");
    await setup.service.startGame(host.sessionId, "trivia");
    await setup.service.startTrivia(host.sessionId, 1);
    const state = setup.service.getState(host.sessionId);
    if (!state.gameState || state.gameState.type !== "trivia" || !state.gameState.state.activeQuestion) {
      throw new Error("Expected trivia state");
    }
    await setup.service.submitTriviaAnswer(
      host.sessionId,
      player.participantId,
      state.gameState.state.activeQuestion.correctAnswer
    );
    await setup.service.submitTriviaAnswer(
      host.sessionId,
      host.participantId,
      state.gameState.state.activeQuestion.options[0]!
    );
    await setup.service.closeTriviaQuestion(host.sessionId);
    const scored = setup.service.getState(host.sessionId);
    const participant = scored.participants.find((item) => item.id === player.participantId);
    expect(participant?.score).toBe(1);
  });

  it("requires all participants to answer before checking trivia answers", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    const host = await setup.service.createSession("Host");
    const player = await setup.service.joinSession(host.joinCode, "Player");
    await setup.service.startGame(host.sessionId, "trivia");
    await setup.service.startTrivia(host.sessionId, 1);
    const state = setup.service.getState(host.sessionId);
    if (!state.gameState || state.gameState.type !== "trivia" || !state.gameState.state.activeQuestion) {
      throw new Error("Expected trivia state");
    }
    await setup.service.submitTriviaAnswer(
      host.sessionId,
      player.participantId,
      state.gameState.state.activeQuestion.correctAnswer
    );
    await expect(setup.service.closeTriviaQuestion(host.sessionId)).rejects.toThrow(
      "Not all participants have answered."
    );
  });

  it("loads trivia with filter options and exposes loading progress updates", async () => {
    const localTempDir = await mkdtemp(path.join(os.tmpdir(), "fusion-test-"));
    tempDir = localTempDir;
    const store = new FileStore<{ sessions: any[] }>(path.join(localTempDir, "sessions.json"));
    let seenConfig: unknown;
    const snapshots: SessionState[] = [];
    const service = new SessionService(
      store,
      async (config, _excludedQuestionIds, onProgress) => {
        seenConfig = config;
        await onProgress?.({
          totalCalls: 3,
          completedCalls: 1,
          message: "Loaded batch 1 of 3."
        });
        return [
          {
            id: "q-test",
            category: "Science & Nature",
            difficulty: "easy",
            question: "What is H2O?",
            options: ["Water", "Rock", "Air", "Fire"],
            correctAnswer: "Water"
          }
        ];
      },
      localTempDir
    );
    await service.load();
    service.setStateUpdateListener((sessionId) => {
      snapshots.push(service.getState(sessionId));
    });

    const host = await service.createSession("Host");
    await service.startGame(host.sessionId, "trivia");
    await service.startTrivia(host.sessionId, {
      totalQuestions: 10,
      categoryMode: "single",
      categoryId: 17,
      difficulties: ["easy", "hard"]
    });

    expect(seenConfig).toEqual({
      totalQuestions: 10,
      categoryMode: "single",
      categoryId: 17,
      difficulties: ["easy", "hard"]
    });
    const loadingSnapshot = snapshots.find(
      (state) =>
        state.gameState?.type === "trivia"
        && state.gameState.state.status === "loading"
        && state.gameState.state.loading?.completedCalls === 1
    );
    expect(loadingSnapshot?.gameState?.type).toBe("trivia");
    if (loadingSnapshot?.gameState?.type !== "trivia") {
      throw new Error("expected trivia loading snapshot");
    }
    expect(loadingSnapshot.gameState.state.loading?.completedCalls).toBe(1);

    const finalState = service.getState(host.sessionId);
    if (finalState.gameState?.type !== "trivia") throw new Error("expected trivia");
    expect(finalState.gameState.state.status).toBe("questionOpen");
    expect(finalState.gameState.state.totalQuestions).toBe(10);
    expect(finalState.gameState.state.loading).toBeNull();
  });

  it("removes participant and deletes session when last participant leaves", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    const host = await setup.service.createSession("Host");
    const guest = await setup.service.joinSession(host.joinCode, "Guest");

    const firstResult = await setup.service.removeParticipant(host.sessionId, guest.participantId);
    expect(firstResult.sessionDeleted).toBe(false);
    expect(setup.service.getState(host.sessionId).participants).toHaveLength(1);

    const secondResult = await setup.service.removeParticipant(host.sessionId, host.participantId);
    expect(secondResult.sessionDeleted).toBe(true);
    expect(() => setup.service.getState(host.sessionId)).toThrow("Session not found.");
  });

  it("lets the host close the session for everyone", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    const host = await setup.service.createSession("Host");
    const guest = await setup.service.joinSession(host.joinCode, "Guest");

    await expect(setup.service.closeSession(host.sessionId, guest.participantId)).rejects.toThrow(
      "Only the host can close the session."
    );
    await setup.service.closeSession(host.sessionId, host.participantId);
    expect(() => setup.service.getState(host.sessionId)).toThrow("Session not found.");
  });

  it("ends the active game and returns the session to the lobby", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    const host = await setup.service.createSession("Host");
    await setup.service.joinSession(host.joinCode, "Guest");
    await setup.service.startGame(host.sessionId, "hangman");
    expect(setup.service.getState(host.sessionId).activeGame).toBe("hangman");

    await setup.service.endActiveGame(host.sessionId, host.participantId);
    const state = setup.service.getState(host.sessionId);
    expect(state.activeGame).toBeNull();
    expect(state.gameState).toBeNull();
  });

  it("rejects ending the active game by a non-host", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    const host = await setup.service.createSession("Host");
    const guest = await setup.service.joinSession(host.joinCode, "Guest");
    await setup.service.startGame(host.sessionId, "hangman");
    await expect(setup.service.endActiveGame(host.sessionId, guest.participantId)).rejects.toThrow(
      "Only the host can end the game."
    );
  });

  it("awards the creator one point in team-mode hangman when guessers lose", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    const host = await setup.service.createSession("Host");
    const guest = await setup.service.joinSession(host.joinCode, "Guest");
    await setup.service.startGame(host.sessionId, "hangman", { hangmanMode: "team" });
    await setup.service.setHangmanWord(host.sessionId, host.participantId, "AB");
    for (const letter of ["Z", "Y", "X", "W", "V", "U"]) {
      await setup.service.guessHangmanLetter(host.sessionId, guest.participantId, letter);
    }
    const state = setup.service.getState(host.sessionId);
    if (state.gameState?.type !== "hangman") throw new Error("expected hangman");
    expect(state.gameState.state.status).toBe("lost");
    const creator = state.participants.find((p) => p.id === host.participantId);
    expect(creator?.score).toBe(1);
  });

  it("rotates turns and scores per-letter in turn-based hangman", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    const host = await setup.service.createSession("Host");
    const guestOne = await setup.service.joinSession(host.joinCode, "Guest1");
    const guestTwo = await setup.service.joinSession(host.joinCode, "Guest2");
    await setup.service.startGame(host.sessionId, "hangman", { hangmanMode: "turns" });
    await setup.service.setHangmanWord(host.sessionId, host.participantId, "AB");

    const startState = setup.service.getState(host.sessionId);
    if (startState.gameState?.type !== "hangman") throw new Error("expected hangman");
    expect(startState.gameState.state.mode).toBe("turns");
    expect(startState.gameState.state.currentTurnId).toBe(guestOne.participantId);

    await expect(
      setup.service.guessHangmanLetter(host.sessionId, guestTwo.participantId, "A")
    ).rejects.toThrow("Not your turn.");

    await setup.service.guessHangmanLetter(host.sessionId, guestOne.participantId, "A");
    let state = setup.service.getState(host.sessionId);
    if (state.gameState?.type !== "hangman") throw new Error("expected hangman");
    expect(state.gameState.state.currentTurnId).toBe(guestTwo.participantId);
    expect(state.participants.find((p) => p.id === guestOne.participantId)?.score).toBe(1);

    await setup.service.guessHangmanLetter(host.sessionId, guestTwo.participantId, "B");
    state = setup.service.getState(host.sessionId);
    expect(state.gameState?.state.status).toBe("won");
    const guestTwoFinal = state.participants.find((p) => p.id === guestTwo.participantId);
    expect(guestTwoFinal?.score).toBe(1 + 3);
  });

  it("assigns the first turn to a guesser who joins after a turn-mode round has started", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    const host = await setup.service.createSession("Host");
    await setup.service.startGame(host.sessionId, "hangman", { hangmanMode: "turns" });
    await setup.service.setHangmanWord(host.sessionId, host.participantId, "HELLO");

    let state = setup.service.getState(host.sessionId);
    if (state.gameState?.type !== "hangman") throw new Error("expected hangman");
    expect(state.gameState.state.currentTurnId).toBeNull();

    const guest = await setup.service.joinSession(host.joinCode, "Guest");
    state = setup.service.getState(host.sessionId);
    if (state.gameState?.type !== "hangman") throw new Error("expected hangman");
    expect(state.gameState.state.currentTurnId).toBe(guest.participantId);

    await setup.service.guessHangmanLetter(host.sessionId, guest.participantId, "H");
    state = setup.service.getState(host.sessionId);
    if (state.gameState?.type !== "hangman") throw new Error("expected hangman");
    expect(state.gameState.state.guessedLetters).toContain("H");
  });

  it("lets the host override the current guesser in turns mode", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    const host = await setup.service.createSession("Host");
    const guestOne = await setup.service.joinSession(host.joinCode, "Guest1");
    const guestTwo = await setup.service.joinSession(host.joinCode, "Guest2");
    await setup.service.startGame(host.sessionId, "hangman", { hangmanMode: "turns" });
    await setup.service.setHangmanWord(host.sessionId, host.participantId, "HI");

    let state = setup.service.getState(host.sessionId);
    if (state.gameState?.type !== "hangman") throw new Error("expected hangman");
    expect(state.gameState.state.currentTurnId).toBe(guestOne.participantId);

    await setup.service.setHangmanTurn(host.sessionId, host.participantId, guestTwo.participantId);
    state = setup.service.getState(host.sessionId);
    if (state.gameState?.type !== "hangman") throw new Error("expected hangman");
    expect(state.gameState.state.currentTurnId).toBe(guestTwo.participantId);
  });

  it("rejects host turn overrides to the puzzle creator or non-hosts", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    const host = await setup.service.createSession("Host");
    const guestOne = await setup.service.joinSession(host.joinCode, "Guest1");
    await setup.service.startGame(host.sessionId, "hangman", { hangmanMode: "turns" });
    await setup.service.setHangmanWord(host.sessionId, host.participantId, "HI");

    await expect(
      setup.service.setHangmanTurn(host.sessionId, host.participantId, host.participantId)
    ).rejects.toThrow("Puzzle creator cannot take a turn.");
    await expect(
      setup.service.setHangmanTurn(host.sessionId, guestOne.participantId, guestOne.participantId)
    ).rejects.toThrow("Only the host can override the current guesser.");
  });

  it("lets the host reorder participants (turn order)", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    const host = await setup.service.createSession("Host");
    const guestOne = await setup.service.joinSession(host.joinCode, "Guest1");
    const guestTwo = await setup.service.joinSession(host.joinCode, "Guest2");

    await setup.service.reorderParticipants(host.sessionId, host.participantId, [
      host.participantId,
      guestTwo.participantId,
      guestOne.participantId
    ]);
    const state = setup.service.getState(host.sessionId);
    expect(state.participants.map((p) => p.id)).toEqual([
      host.participantId,
      guestTwo.participantId,
      guestOne.participantId
    ]);

    await expect(
      setup.service.reorderParticipants(host.sessionId, guestOne.participantId, [
        guestOne.participantId,
        host.participantId,
        guestTwo.participantId
      ])
    ).rejects.toThrow("Only the host can reorder participants.");

    await expect(
      setup.service.reorderParticipants(host.sessionId, host.participantId, [
        host.participantId,
        guestOne.participantId
      ])
    ).rejects.toThrow(/does not match/i);
  });

  it("penalizes the guesser whose wrong guess completes the hangman in turns mode", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    const host = await setup.service.createSession("Host");
    const guestOne = await setup.service.joinSession(host.joinCode, "Guest1");
    const guestTwo = await setup.service.joinSession(host.joinCode, "Guest2");
    await setup.service.startGame(host.sessionId, "hangman", { hangmanMode: "turns" });
    await setup.service.setHangmanWord(host.sessionId, host.participantId, "Z");

    const wrongLetters = ["A", "B", "C", "D", "E", "F"];
    const guesserOrder = [guestOne, guestTwo, guestOne, guestTwo, guestOne, guestTwo];
    for (let i = 0; i < wrongLetters.length; i += 1) {
      await setup.service.guessHangmanLetter(
        host.sessionId,
        guesserOrder[i]!.participantId,
        wrongLetters[i]!
      );
    }

    const state = setup.service.getState(host.sessionId);
    expect(state.gameState?.state.status).toBe("lost");
    const lastWrong = state.participants.find((p) => p.id === guestTwo.participantId);
    expect(lastWrong?.score).toBe(-5);
    const otherGuesser = state.participants.find((p) => p.id === guestOne.participantId);
    expect(otherGuesser?.score).toBe(0);
    const creator = state.participants.find((p) => p.id === host.participantId);
    expect(creator?.score).toBe(5);
  });

  it("awards +3 on a correct solve in turns mode and ignores spaces/punctuation", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    const host = await setup.service.createSession("Host");
    const guest = await setup.service.joinSession(host.joinCode, "Guest");
    await setup.service.startGame(host.sessionId, "hangman", { hangmanMode: "turns" });
    await setup.service.setHangmanWord(host.sessionId, host.participantId, "GEORGE WASHINGTON");

    await setup.service.solveHangman(host.sessionId, guest.participantId, "georgewashington");

    const state = setup.service.getState(host.sessionId);
    if (state.gameState?.type !== "hangman") throw new Error("expected hangman");
    expect(state.gameState.state.status).toBe("won");
    expect(state.gameState.state.revealedWord).toBe("GEORGE WASHINGTON");
    const solver = state.participants.find((p) => p.id === guest.participantId);
    expect(solver?.score).toBe(3);
  });

  it("treats an incorrect solve in turns mode as a wrong guess and rotates the turn", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    const host = await setup.service.createSession("Host");
    const guestOne = await setup.service.joinSession(host.joinCode, "Guest1");
    const guestTwo = await setup.service.joinSession(host.joinCode, "Guest2");
    await setup.service.startGame(host.sessionId, "hangman", { hangmanMode: "turns" });
    await setup.service.setHangmanWord(host.sessionId, host.participantId, "HELLO");

    await setup.service.solveHangman(host.sessionId, guestOne.participantId, "WORLD");

    const state = setup.service.getState(host.sessionId);
    if (state.gameState?.type !== "hangman") throw new Error("expected hangman");
    expect(state.gameState.state.status).toBe("inProgress");
    expect(state.gameState.state.wrongGuessCount).toBe(1);
    expect(state.gameState.state.guessedLetters).toEqual([]);
    expect(state.gameState.state.maskedWord).toBe("_____");
    expect(state.gameState.state.currentTurnId).toBe(guestTwo.participantId);
    const solver = state.participants.find((p) => p.id === guestOne.participantId);
    expect(solver?.score).toBe(0);
  });

  it("penalizes the solver whose incorrect solve completes the hangman in turns mode", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    const host = await setup.service.createSession("Host");
    const guestOne = await setup.service.joinSession(host.joinCode, "Guest1");
    const guestTwo = await setup.service.joinSession(host.joinCode, "Guest2");
    await setup.service.startGame(host.sessionId, "hangman", { hangmanMode: "turns" });
    await setup.service.setHangmanWord(host.sessionId, host.participantId, "Z");

    const wrongLetters = ["A", "B", "C", "D", "E"];
    const guesserOrder = [guestOne, guestTwo, guestOne, guestTwo, guestOne];
    for (let i = 0; i < wrongLetters.length; i += 1) {
      await setup.service.guessHangmanLetter(
        host.sessionId,
        guesserOrder[i]!.participantId,
        wrongLetters[i]!
      );
    }

    await setup.service.solveHangman(host.sessionId, guestTwo.participantId, "NOPE");

    const state = setup.service.getState(host.sessionId);
    if (state.gameState?.type !== "hangman") throw new Error("expected hangman");
    expect(state.gameState.state.status).toBe("lost");
    expect(state.gameState.state.wrongGuessCount).toBe(6);
    const loser = state.participants.find((p) => p.id === guestTwo.participantId);
    expect(loser?.score).toBe(-5);
    const other = state.participants.find((p) => p.id === guestOne.participantId);
    expect(other?.score).toBe(0);
    const creator = state.participants.find((p) => p.id === host.participantId);
    expect(creator?.score).toBe(5);
  });

  it("tracks team-mode solve lock lifecycle and activity feed", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    const host = await setup.service.createSession("Host");
    const guestOne = await setup.service.joinSession(host.joinCode, "Guest1");
    const guestTwo = await setup.service.joinSession(host.joinCode, "Guest2");
    await setup.service.startGame(host.sessionId, "hangman", { hangmanMode: "team" });
    await setup.service.setHangmanWord(host.sessionId, host.participantId, "AB");

    await setup.service.openHangmanSolve(host.sessionId, guestOne.participantId);
    await expect(
      setup.service.guessHangmanLetter(host.sessionId, guestTwo.participantId, "Z")
    ).rejects.toThrow("Another player is attempting to solve.");

    let state = setup.service.getState(host.sessionId);
    if (state.gameState?.type !== "hangman") throw new Error("expected hangman");
    expect(state.gameState.state.activeSolverId).toBe(guestOne.participantId);
    expect(state.gameState.state.activityLog.at(-1)?.kind).toBe("solveAttempt");

    await setup.service.cancelHangmanSolve(host.sessionId, guestOne.participantId);
    await setup.service.guessHangmanLetter(host.sessionId, guestTwo.participantId, "Z");
    state = setup.service.getState(host.sessionId);
    if (state.gameState?.type !== "hangman") throw new Error("expected hangman");
    expect(state.gameState.state.activeSolverId).toBeNull();
    expect(state.gameState.state.activityLog.at(-2)?.kind).toBe("solveCancelled");
    expect(state.gameState.state.activityLog.at(-1)?.kind).toBe("letterWrong");
  });

  it("reopens team-mode board after a wrong solve submit", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    const host = await setup.service.createSession("Host");
    const guestOne = await setup.service.joinSession(host.joinCode, "Guest1");
    const guestTwo = await setup.service.joinSession(host.joinCode, "Guest2");
    await setup.service.startGame(host.sessionId, "hangman", { hangmanMode: "team" });
    await setup.service.setHangmanWord(host.sessionId, host.participantId, "AB");

    await setup.service.openHangmanSolve(host.sessionId, guestOne.participantId);
    await setup.service.solveHangman(host.sessionId, guestOne.participantId, "NOPE");
    let state = setup.service.getState(host.sessionId);
    if (state.gameState?.type !== "hangman") throw new Error("expected hangman");
    expect(state.gameState.state.status).toBe("inProgress");
    expect(state.gameState.state.activeSolverId).toBeNull();

    await setup.service.guessHangmanLetter(host.sessionId, guestTwo.participantId, "A");
    state = setup.service.getState(host.sessionId);
    if (state.gameState?.type !== "hangman") throw new Error("expected hangman");
    expect(state.gameState.state.maskedWord).toBe("A_");
    expect(state.gameState.state.activityLog.at(-1)?.kind).toBe("letterCorrect");
  });

  it("requires the current turn player to open solve in turns mode and logs the attempt", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    const host = await setup.service.createSession("Host");
    const guestOne = await setup.service.joinSession(host.joinCode, "Guest1");
    const guestTwo = await setup.service.joinSession(host.joinCode, "Guest2");
    await setup.service.startGame(host.sessionId, "hangman", { hangmanMode: "turns" });
    await setup.service.setHangmanWord(host.sessionId, host.participantId, "AB");

    await expect(
      setup.service.openHangmanSolve(host.sessionId, guestTwo.participantId)
    ).rejects.toThrow("Not your turn.");

    await setup.service.openHangmanSolve(host.sessionId, guestOne.participantId);
    const state = setup.service.getState(host.sessionId);
    if (state.gameState?.type !== "hangman") throw new Error("expected hangman");
    expect(state.gameState.state.activeSolverId).toBe(guestOne.participantId);
    expect(state.gameState.state.activityLog.at(-1)?.kind).toBe("solveAttempt");
  });

  it("awards +1 to every guesser on a correct solve in team mode", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    const host = await setup.service.createSession("Host");
    const guestOne = await setup.service.joinSession(host.joinCode, "Guest1");
    const guestTwo = await setup.service.joinSession(host.joinCode, "Guest2");
    await setup.service.startGame(host.sessionId, "hangman", { hangmanMode: "team" });
    await setup.service.setHangmanWord(host.sessionId, host.participantId, "HELLO");

    await setup.service.solveHangman(host.sessionId, guestOne.participantId, "hello");

    const state = setup.service.getState(host.sessionId);
    if (state.gameState?.type !== "hangman") throw new Error("expected hangman");
    expect(state.gameState.state.status).toBe("won");
    expect(state.participants.find((p) => p.id === guestOne.participantId)?.score).toBe(1);
    expect(state.participants.find((p) => p.id === guestTwo.participantId)?.score).toBe(1);
    expect(state.participants.find((p) => p.id === host.participantId)?.score).toBe(0);
  });

  it("rejects solve attempts from the puzzle creator", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    const host = await setup.service.createSession("Host");
    await setup.service.joinSession(host.joinCode, "Guest");
    await setup.service.startGame(host.sessionId, "hangman", { hangmanMode: "team" });
    await setup.service.setHangmanWord(host.sessionId, host.participantId, "HI");

    await expect(
      setup.service.solveHangman(host.sessionId, host.participantId, "HI")
    ).rejects.toThrow("Puzzle creator cannot guess.");
  });

  it("avoids repeated trivia questions in a round", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    const host = await setup.service.createSession("Host");
    await setup.service.startGame(host.sessionId, "trivia");
    await setup.service.startTrivia(host.sessionId, 5);
    const seen = new Set<string>();
    for (let i = 0; i < 5; i += 1) {
      const state = setup.service.getState(host.sessionId);
      if (!state.gameState || state.gameState.type !== "trivia" || !state.gameState.state.activeQuestion) {
        break;
      }
      expect(seen.has(state.gameState.state.activeQuestion.id)).toBe(false);
      seen.add(state.gameState.state.activeQuestion.id);
      await setup.service.submitTriviaAnswer(
        host.sessionId,
        host.participantId,
        state.gameState.state.activeQuestion.options[0]!
      );
      await setup.service.closeTriviaQuestion(host.sessionId);
      await setup.service.nextTriviaQuestion(host.sessionId);
    }
  });

  it("tracks used trivia questions across trivia rounds in a session", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    const host = await setup.service.createSession("Host");
    await setup.service.startGame(host.sessionId, "trivia");
    await setup.service.startTrivia(host.sessionId, 4);
    const seen = new Set<string>();
    for (let i = 0; i < 4; i += 1) {
      const state = setup.service.getState(host.sessionId);
      if (!state.gameState || state.gameState.type !== "trivia" || !state.gameState.state.activeQuestion) {
        break;
      }
      const question = state.gameState.state.activeQuestion;
      seen.add(question.id);
      const hostAnswer = state.gameState.state.activeQuestion.options[0]!;
      await setup.service.submitTriviaAnswer(host.sessionId, host.participantId, hostAnswer);
      await setup.service.closeTriviaQuestion(host.sessionId);
      await setup.service.nextTriviaQuestion(host.sessionId);
    }

    await setup.service.startGame(host.sessionId, "trivia");
    await setup.service.startTrivia(host.sessionId, 4);
    const nextState = setup.service.getState(host.sessionId);
    if (!nextState.gameState || nextState.gameState.type !== "trivia" || !nextState.gameState.state.activeQuestion) {
      throw new Error("Expected trivia state");
    }
    expect(seen.has(nextState.gameState.state.activeQuestion.id)).toBe(false);
  });

  it("runs icebreaker collect → reveal → next question without exposing answers before reveal", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    const host = await setup.service.createSession("Host");
    const guest = await setup.service.joinSession(host.joinCode, "Guest");
    await setup.service.startGame(host.sessionId, "icebreaker");
    await setup.service.startIcebreakerRound(host.sessionId, host.participantId, 2);

    let state = setup.service.getState(host.sessionId);
    expect(state.gameState?.type).toBe("icebreaker");
    if (state.gameState?.type !== "icebreaker") throw new Error("expected icebreaker");
    expect(state.gameState.state.status).toBe("collecting");
    expect(state.gameState.state.submittedParticipantIds).toEqual([]);

    await setup.service.submitIcebreakerAnswer(host.sessionId, host.participantId, {
      text: "Host secret",
      imageFileId: null
    });
    await setup.service.submitIcebreakerAnswer(host.sessionId, guest.participantId, {
      text: "Guest secret",
      imageFileId: null
    });

    state = setup.service.getState(host.sessionId);
    if (state.gameState?.type !== "icebreaker") throw new Error("expected icebreaker");
    expect(state.gameState.state.submittedParticipantIds.sort()).toEqual(
      [host.participantId, guest.participantId].sort()
    );
    expect(state.gameState.state.revealed).toEqual([]);

    await setup.service.beginIcebreakerReveals(host.sessionId, host.participantId);
    await setup.service.revealIcebreakerParticipant(host.sessionId, host.participantId, guest.participantId);

    state = setup.service.getState(host.sessionId);
    if (state.gameState?.type !== "icebreaker") throw new Error("expected icebreaker");
    expect(state.gameState.state.revealed).toHaveLength(1);
    expect(state.gameState.state.revealed[0]?.text).toBe("Guest secret");

    await expect(
      setup.service.revealIcebreakerParticipant(host.sessionId, host.participantId, guest.participantId)
    ).rejects.toThrow("already revealed");

    await setup.service.nextIcebreakerQuestion(host.sessionId, host.participantId);
    state = setup.service.getState(host.sessionId);
    if (state.gameState?.type !== "icebreaker") throw new Error("expected icebreaker");
    expect(state.gameState.state.status).toBe("collecting");
    expect(state.gameState.state.questionIndex).toBe(1);
    expect(state.gameState.state.submittedParticipantIds).toEqual([]);
  });

  it("rejects icebreaker beginReveals from a non-host", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    const host = await setup.service.createSession("Host");
    const guest = await setup.service.joinSession(host.joinCode, "Guest");
    await setup.service.startGame(host.sessionId, "icebreaker");
    await setup.service.startIcebreakerRound(host.sessionId, host.participantId, 1);
    await setup.service.submitIcebreakerAnswer(host.sessionId, host.participantId, { text: "A", imageFileId: null });
    await setup.service.submitIcebreakerAnswer(host.sessionId, guest.participantId, { text: "B", imageFileId: null });

    await expect(setup.service.beginIcebreakerReveals(host.sessionId, guest.participantId)).rejects.toThrow(
      "Only host can begin reveals."
    );
  });

  it("rejects icebreaker startRound from a non-host", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    const host = await setup.service.createSession("Host");
    const guest = await setup.service.joinSession(host.joinCode, "Guest");
    await setup.service.startGame(host.sessionId, "icebreaker");
    await expect(setup.service.startIcebreakerRound(host.sessionId, guest.participantId, 3)).rejects.toThrow(
      "Only host can start the icebreaker round."
    );
  });

  it("runs icebreaker custom prompt gathering then startCustomRound", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    const host = await setup.service.createSession("Host");
    const guest = await setup.service.joinSession(host.joinCode, "Guest");
    await setup.service.startGame(host.sessionId, "icebreaker");
    await setup.service.beginIcebreakerPromptGathering(host.sessionId, host.participantId, 2);

    let state = setup.service.getState(host.sessionId);
    if (state.gameState?.type !== "icebreaker") throw new Error("expected icebreaker");
    expect(state.gameState.state.status).toBe("gatheringPrompts");
    if (state.gameState.state.status !== "gatheringPrompts") throw new Error("expected gatheringPrompts");
    expect(state.gameState.state.promptsPerParticipant).toBe(2);
    expect(state.gameState.state.submittedPromptParticipantIds).toEqual([]);

    await setup.service.submitIcebreakerPrompts(host.sessionId, host.participantId, ["H1?", "H2?"]);
    await setup.service.submitIcebreakerPrompts(host.sessionId, guest.participantId, ["G1?", "G2?"]);

    state = setup.service.getState(host.sessionId);
    if (state.gameState?.type !== "icebreaker" || state.gameState.state.status !== "gatheringPrompts") {
      throw new Error("expected gatheringPrompts");
    }
    expect(state.gameState.state.submittedPromptParticipantIds.sort()).toEqual(
      [host.participantId, guest.participantId].sort()
    );

    await setup.service.startIcebreakerCustomRound(host.sessionId, host.participantId);

    state = setup.service.getState(host.sessionId);
    if (state.gameState?.type !== "icebreaker") throw new Error("expected icebreaker");
    expect(state.gameState.state.status).toBe("collecting");
    expect(state.gameState.state.totalQuestions).toBe(4);
    const active = state.gameState.state.activeQuestion?.text;
    expect(["H1?", "H2?", "G1?", "G2?"]).toContain(active);

    await expect(setup.service.startIcebreakerCustomRound(host.sessionId, host.participantId)).rejects.toThrow();
    await expect(setup.service.startIcebreakerRound(host.sessionId, host.participantId, 3)).rejects.toThrow("lobby");
  });

  it("rejects startIcebreakerCustomRound until every participant submitted prompts", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    const host = await setup.service.createSession("Host");
    const guest = await setup.service.joinSession(host.joinCode, "Guest");
    await setup.service.startGame(host.sessionId, "icebreaker");
    await setup.service.beginIcebreakerPromptGathering(host.sessionId, host.participantId, 1);
    await setup.service.submitIcebreakerPrompts(host.sessionId, host.participantId, ["Only host"]);
    await expect(setup.service.startIcebreakerCustomRound(host.sessionId, host.participantId)).rejects.toThrow(
      "Not all participants have submitted"
    );
    await setup.service.submitIcebreakerPrompts(host.sessionId, guest.participantId, ["Guest q"]);
    await setup.service.startIcebreakerCustomRound(host.sessionId, host.participantId);
    const state = setup.service.getState(host.sessionId);
    if (state.gameState?.type !== "icebreaker") throw new Error("expected icebreaker");
    expect(state.gameState.state.status).toBe("collecting");
    expect(state.gameState.state.totalQuestions).toBe(2);
  });

  it("rejects submitIcebreakerPrompts with wrong count or empty line", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    const host = await setup.service.createSession("Host");
    await setup.service.joinSession(host.joinCode, "Guest");
    await setup.service.startGame(host.sessionId, "icebreaker");
    await setup.service.beginIcebreakerPromptGathering(host.sessionId, host.participantId, 2);
    await expect(setup.service.submitIcebreakerPrompts(host.sessionId, host.participantId, ["a"])).rejects.toThrow(
      "Submit exactly 2"
    );
    await expect(
      setup.service.submitIcebreakerPrompts(host.sessionId, host.participantId, ["a", "  "])
    ).rejects.toThrow("non-empty");
  });

  it("returns icebreaker to idle from finished for host", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    const host = await setup.service.createSession("Host");
    const guest = await setup.service.joinSession(host.joinCode, "Guest");
    await setup.service.startGame(host.sessionId, "icebreaker");
    await setup.service.startIcebreakerRound(host.sessionId, host.participantId, 1);
    await setup.service.submitIcebreakerAnswer(host.sessionId, host.participantId, { text: "a", imageFileId: null });
    await setup.service.submitIcebreakerAnswer(host.sessionId, guest.participantId, { text: "b", imageFileId: null });
    await setup.service.beginIcebreakerReveals(host.sessionId, host.participantId);
    await setup.service.revealIcebreakerParticipant(host.sessionId, host.participantId, host.participantId);
    await setup.service.revealIcebreakerParticipant(host.sessionId, host.participantId, guest.participantId);
    await setup.service.nextIcebreakerQuestion(host.sessionId, host.participantId);
    let state = setup.service.getState(host.sessionId);
    if (state.gameState?.type !== "icebreaker") throw new Error("expected icebreaker");
    expect(state.gameState.state.status).toBe("finished");

    await setup.service.resetIcebreakerToIdle(host.sessionId, host.participantId);
    state = setup.service.getState(host.sessionId);
    if (state.gameState?.type !== "icebreaker") throw new Error("expected icebreaker");
    expect(state.gameState.state.status).toBe("idle");
  });

  it("rejects resetIcebreakerToIdle when round is not finished", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    const host = await setup.service.createSession("Host");
    await setup.service.joinSession(host.joinCode, "Guest");
    await setup.service.startGame(host.sessionId, "icebreaker");
    await setup.service.startIcebreakerRound(host.sessionId, host.participantId, 1);
    await expect(setup.service.resetIcebreakerToIdle(host.sessionId, host.participantId)).rejects.toThrow(
      "only return to setup after the round has finished"
    );
  });

  it("shuffles guess-the-image options and scores fastest correct 3 / other correct 1", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    const host = await setup.service.createSession("Host");
    const fast = await setup.service.joinSession(host.joinCode, "Fast");
    const slow = await setup.service.joinSession(host.joinCode, "Slow");
    let t = 1_000_000;
    const spy = vi.spyOn(Date, "now").mockImplementation(() => t);
    await setup.service.startGame(host.sessionId, "guessTheImage");
    await setup.service.configureGuessTheImage(host.sessionId, host.participantId, {
      imageFileId: "x.png",
      descriptions: ["Right", "W1", "W2", "W3"],
      correctIndex: 0,
      revealDurationMs: 60_000
    });
    await setup.service.startGuessTheImageRound(host.sessionId, host.participantId);

    const playing = setup.service.getState(host.sessionId);
    if (playing.gameState?.type !== "guessTheImage" || playing.gameState.state.status !== "playing") {
      throw new Error("expected playing guessTheImage");
    }
    const sorted = [...playing.gameState.state.options].sort();
    expect(sorted).toEqual(["Right", "W1", "W2", "W3"].sort());
    const correctSlot = playing.gameState.state.options.indexOf("Right");

    t = 1_000_050;
    await setup.service.lockGuessTheImageAnswer(host.sessionId, fast.participantId, correctSlot);
    t = 1_000_200;
    await setup.service.lockGuessTheImageAnswer(host.sessionId, slow.participantId, correctSlot);
    spy.mockRestore();

    const final = setup.service.getState(host.sessionId);
    if (final.gameState?.type !== "guessTheImage" || final.gameState.state.status !== "finished") {
      throw new Error("expected finished guessTheImage");
    }
    expect(final.gameState.state.imageUrl).toBeNull();
    expect(final.gameState.state.correctDisplayIndex).toBe(correctSlot);
    expect(final.participants.find((p) => p.id === fast.participantId)?.score).toBe(3);
    expect(final.participants.find((p) => p.id === slow.participantId)?.score).toBe(1);
    expect(final.participants.find((p) => p.id === host.participantId)?.score).toBe(0);
  });

  it("rejects setup player lock for guess the image", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    const host = await setup.service.createSession("Host");
    await setup.service.joinSession(host.joinCode, "Guest");
    await setup.service.startGame(host.sessionId, "guessTheImage");
    await setup.service.configureGuessTheImage(host.sessionId, host.participantId, {
      imageFileId: "a.png",
      descriptions: ["A", "B", "C", "D"],
      correctIndex: 0,
      revealDurationMs: 60_000
    });
    await setup.service.startGuessTheImageRound(host.sessionId, host.participantId);
    await expect(setup.service.lockGuessTheImageAnswer(host.sessionId, host.participantId, 0)).rejects.toThrow(
      "The setup player does not submit guesses."
    );
  });

  it("allows host to guess when the guest ran setup", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    const host = await setup.service.createSession("Host");
    const guest = await setup.service.joinSession(host.joinCode, "Guest");
    await setup.service.startGame(host.sessionId, "guessTheImage", {
      guessImageSetupParticipantId: guest.participantId
    });
    await setup.service.configureGuessTheImage(host.sessionId, guest.participantId, {
      imageFileId: "a.png",
      descriptions: ["A", "B", "C", "D"],
      correctIndex: 0,
      revealDurationMs: 60_000
    });
    await setup.service.startGuessTheImageRound(host.sessionId, guest.participantId);
    const playing = setup.service.getState(host.sessionId);
    if (playing.gameState?.type !== "guessTheImage" || playing.gameState.state.status !== "playing") {
      throw new Error("expected playing");
    }
    const idx = playing.gameState.state.options.indexOf("A");
    await setup.service.lockGuessTheImageAnswer(host.sessionId, host.participantId, idx);
    const after = setup.service.getState(host.sessionId);
    if (after.gameState?.type !== "guessTheImage") throw new Error("expected guessTheImage");
    expect(after.gameState.state.status).toBe("finished");
  });

  it("host can reassign setup player before configure", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    const host = await setup.service.createSession("Host");
    const guest = await setup.service.joinSession(host.joinCode, "Guest");
    await setup.service.startGame(host.sessionId, "guessTheImage");
    await setup.service.setGuessTheImageSetupParticipant(host.sessionId, host.participantId, guest.participantId);
    let state = setup.service.getState(host.sessionId);
    if (state.gameState?.type !== "guessTheImage") throw new Error("expected guessTheImage");
    expect(state.gameState.state.status).toBe("setup");
    expect(state.gameState.state.setupParticipantId).toBe(guest.participantId);
    await setup.service.configureGuessTheImage(host.sessionId, guest.participantId, {
      imageFileId: "a.png",
      descriptions: ["A", "B", "C", "D"],
      correctIndex: 0,
      revealDurationMs: 60_000
    });
    await expect(
      setup.service.configureGuessTheImage(host.sessionId, host.participantId, {
        imageFileId: "b.png",
        descriptions: ["X", "Y", "Z", "W"],
        correctIndex: 0,
        revealDurationMs: 60_000
      })
    ).rejects.toThrow("Only the designated setup player");
    await setup.service.startGuessTheImageRound(host.sessionId, guest.participantId);
    state = setup.service.getState(host.sessionId);
    expect(state.gameState?.type).toBe("guessTheImage");
    if (state.gameState?.type === "guessTheImage") {
      expect(state.gameState.state.status).toBe("playing");
    }
  });

  it("rejects start round from non-setup player", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    const host = await setup.service.createSession("Host");
    const guest = await setup.service.joinSession(host.joinCode, "Guest");
    await setup.service.startGame(host.sessionId, "guessTheImage", {
      guessImageSetupParticipantId: guest.participantId
    });
    await setup.service.configureGuessTheImage(host.sessionId, guest.participantId, {
      imageFileId: "a.png",
      descriptions: ["A", "B", "C", "D"],
      correctIndex: 0,
      revealDurationMs: 60_000
    });
    await expect(setup.service.startGuessTheImageRound(host.sessionId, host.participantId)).rejects.toThrow(
      "Only the designated setup player can start this round."
    );
    await setup.service.startGuessTheImageRound(host.sessionId, guest.participantId);
    const state = setup.service.getState(host.sessionId);
    if (state.gameState?.type !== "guessTheImage") throw new Error("expected guessTheImage");
    expect(state.gameState.state.status).toBe("playing");
  });

  it("rejects setGuessTheImageSetupParticipant from a non-host", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    const host = await setup.service.createSession("Host");
    const guest = await setup.service.joinSession(host.joinCode, "Guest");
    await setup.service.startGame(host.sessionId, "guessTheImage");
    await expect(
      setup.service.setGuessTheImageSetupParticipant(host.sessionId, guest.participantId, guest.participantId)
    ).rejects.toThrow("Only the host can choose who sets up the round.");
  });

  it("returns guess the image to setup after finished and clears configured state", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    const host = await setup.service.createSession("Host");
    const guest = await setup.service.joinSession(host.joinCode, "G");
    let t = 1_000_000;
    const spy = vi.spyOn(Date, "now").mockImplementation(() => t);
    await setup.service.startGame(host.sessionId, "guessTheImage");
    await setup.service.configureGuessTheImage(host.sessionId, host.participantId, {
      imageFileId: "a.png",
      descriptions: ["Right", "W1", "W2", "W3"],
      correctIndex: 0,
      revealDurationMs: 30_000
    });
    await setup.service.startGuessTheImageRound(host.sessionId, host.participantId);
    const playing = setup.service.getState(host.sessionId);
    if (playing.gameState?.type !== "guessTheImage" || playing.gameState.state.status !== "playing") {
      throw new Error("expected playing");
    }
    const idx = playing.gameState.state.options.indexOf("Right");
    await setup.service.lockGuessTheImageAnswer(host.sessionId, guest.participantId, idx);
    spy.mockRestore();

    let state = setup.service.getState(host.sessionId);
    if (state.gameState?.type !== "guessTheImage") throw new Error("expected guessTheImage");
    expect(state.gameState.state.status).toBe("finished");

    await setup.service.returnGuessTheImageToSetup(host.sessionId, host.participantId);
    state = setup.service.getState(host.sessionId);
    if (state.gameState?.type !== "guessTheImage") throw new Error("expected guessTheImage");
    if (state.gameState.state.status !== "setup") throw new Error("expected setup");
    expect(state.gameState.state.setupParticipantId).toBe(host.participantId);
    expect(state.gameState.state.configured).toBe(false);
    expect(state.gameState.state.imageUrl).toBeNull();
    expect(state.gameState.state.revealDurationMs).toBe(30_000);
  });

  it("rejects return guess the image to setup while a round is playing", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    const host = await setup.service.createSession("Host");
    await setup.service.joinSession(host.joinCode, "G");
    await setup.service.startGame(host.sessionId, "guessTheImage");
    await setup.service.configureGuessTheImage(host.sessionId, host.participantId, {
      imageFileId: "a.png",
      descriptions: ["A", "B", "C", "D"],
      correctIndex: 0,
      revealDurationMs: 60_000
    });
    await setup.service.startGuessTheImageRound(host.sessionId, host.participantId);
    await expect(setup.service.returnGuessTheImageToSetup(host.sessionId, host.participantId)).rejects.toThrow(
      "Return to setup is only available after a round ends."
    );
  });

  it("everyone mode: host cannot pick presenter until all have saved", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    const host = await setup.service.createSession("Host");
    const guest = await setup.service.joinSession(host.joinCode, "Guest");
    await setup.service.startGame(host.sessionId, "guessTheImage", { guessImageSetupMode: "everyone" });
    await setup.service.configureGuessTheImage(host.sessionId, host.participantId, {
      imageFileId: "h.png",
      descriptions: ["H1", "H2", "H3", "H4"],
      correctIndex: 0,
      revealDurationMs: 60_000
    });
    await expect(
      setup.service.setGuessTheImageRoundPresenter(host.sessionId, host.participantId, guest.participantId)
    ).rejects.toThrow("Wait until every participant has saved their setup.");
  });

  it("everyone mode: each saves, host picks presenter, host starts round", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    const host = await setup.service.createSession("Host");
    const guest = await setup.service.joinSession(host.joinCode, "Guest");
    await setup.service.startGame(host.sessionId, "guessTheImage", { guessImageSetupMode: "everyone" });
    await setup.service.configureGuessTheImage(host.sessionId, host.participantId, {
      imageFileId: "h.png",
      descriptions: ["H1", "H2", "H3", "H4"],
      correctIndex: 0,
      revealDurationMs: 60_000
    });
    await setup.service.configureGuessTheImage(host.sessionId, guest.participantId, {
      imageFileId: "g.png",
      descriptions: ["G1", "G2", "G3", "G4"],
      correctIndex: 1,
      revealDurationMs: 50_000
    });
    await setup.service.setGuessTheImageRoundPresenter(host.sessionId, host.participantId, guest.participantId);
    await setup.service.startGuessTheImageRound(host.sessionId, host.participantId);
    const playing = setup.service.getState(host.sessionId, host.participantId);
    if (playing.gameState?.type !== "guessTheImage" || playing.gameState.state.status !== "playing") {
      throw new Error("expected playing");
    }
    expect(playing.gameState.state.setupParticipantId).toBe(guest.participantId);
    const opts = playing.gameState.state.options;
    expect(opts.sort()).toEqual(["G1", "G2", "G3", "G4"].sort());
  });

  it("everyone mode: after a round, begin-next keeps other setups; host can start another without full re-save", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    const host = await setup.service.createSession("Host");
    const guest = await setup.service.joinSession(host.joinCode, "Guest");
    let t = 1_000_000;
    const spy = vi.spyOn(Date, "now").mockImplementation(() => t);
    await setup.service.startGame(host.sessionId, "guessTheImage", { guessImageSetupMode: "everyone" });
    await setup.service.configureGuessTheImage(host.sessionId, host.participantId, {
      imageFileId: "h.png",
      descriptions: ["H1", "H2", "H3", "H4"],
      correctIndex: 0,
      revealDurationMs: 60_000
    });
    await setup.service.configureGuessTheImage(host.sessionId, guest.participantId, {
      imageFileId: "g.png",
      descriptions: ["G1", "G2", "G3", "G4"],
      correctIndex: 0,
      revealDurationMs: 50_000
    });
    await setup.service.setGuessTheImageRoundPresenter(host.sessionId, host.participantId, guest.participantId);
    await setup.service.startGuessTheImageRound(host.sessionId, host.participantId);
    const playing = setup.service.getState(host.sessionId, host.participantId);
    if (playing.gameState?.type !== "guessTheImage" || playing.gameState.state.status !== "playing") {
      throw new Error("expected playing");
    }
    const correctIdx = playing.gameState.state.options.indexOf("G1");
    t += 1000;
    await setup.service.lockGuessTheImageAnswer(host.sessionId, host.participantId, correctIdx);
    spy.mockRestore();

    const fin = setup.service.getState(host.sessionId, host.participantId);
    if (fin.gameState?.type !== "guessTheImage" || fin.gameState.state.status !== "finished") {
      throw new Error("expected finished");
    }
    expect(fin.gameState.state.setupMode).toBe("everyone");

    await setup.service.beginGuessTheImageNextRoundSelection(host.sessionId, host.participantId);
    const hostAfter = setup.service.getState(host.sessionId, host.participantId);
    if (hostAfter.gameState?.type !== "guessTheImage" || hostAfter.gameState.state.status !== "setup") {
      throw new Error("expected setup");
    }
    expect(hostAfter.gameState.state.everyoneBetweenRounds).toBe(true);
    expect(hostAfter.gameState.state.everyoneAllConfigured).toBe(false);
    expect(hostAfter.gameState.state.everyoneMySetup?.configured).toBe(true);

    const guestAfter = setup.service.getState(host.sessionId, guest.participantId);
    if (guestAfter.gameState?.type !== "guessTheImage" || guestAfter.gameState.state.status !== "setup") {
      throw new Error("guest expected setup");
    }
    expect(guestAfter.gameState.state.everyoneMySetup?.configured).toBe(false);

    await setup.service.setGuessTheImageRoundPresenter(host.sessionId, host.participantId, host.participantId);
    await setup.service.startGuessTheImageRound(host.sessionId, host.participantId);
    const play2 = setup.service.getState(host.sessionId, host.participantId);
    if (play2.gameState?.type !== "guessTheImage" || play2.gameState.state.status !== "playing") {
      throw new Error("expected playing round 2");
    }
    expect(play2.gameState.state.setupParticipantId).toBe(host.participantId);
  });

  it("rejects begin next round selection before a round has finished", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    const host = await setup.service.createSession("Host");
    await setup.service.joinSession(host.joinCode, "Guest");
    await setup.service.startGame(host.sessionId, "guessTheImage", { guessImageSetupMode: "everyone" });
    await expect(
      setup.service.beginGuessTheImageNextRoundSelection(host.sessionId, host.participantId)
    ).rejects.toThrow("Choose the next image only after a round has finished.");
  });

  it("rejects begin next round selection from a non-host", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    const host = await setup.service.createSession("Host");
    const guest = await setup.service.joinSession(host.joinCode, "Guest");
    let t = 1_000_000;
    const spy = vi.spyOn(Date, "now").mockImplementation(() => t);
    await setup.service.startGame(host.sessionId, "guessTheImage", { guessImageSetupMode: "everyone" });
    await setup.service.configureGuessTheImage(host.sessionId, host.participantId, {
      imageFileId: "h.png",
      descriptions: ["H1", "H2", "H3", "H4"],
      correctIndex: 0,
      revealDurationMs: 60_000
    });
    await setup.service.configureGuessTheImage(host.sessionId, guest.participantId, {
      imageFileId: "g.png",
      descriptions: ["G1", "G2", "G3", "G4"],
      correctIndex: 0,
      revealDurationMs: 50_000
    });
    await setup.service.setGuessTheImageRoundPresenter(host.sessionId, host.participantId, guest.participantId);
    await setup.service.startGuessTheImageRound(host.sessionId, host.participantId);
    const playing = setup.service.getState(host.sessionId, guest.participantId);
    if (playing.gameState?.type !== "guessTheImage" || playing.gameState.state.status !== "playing") {
      throw new Error("expected playing");
    }
    const idx = playing.gameState.state.options.indexOf("G1");
    t += 500;
    await setup.service.lockGuessTheImageAnswer(host.sessionId, host.participantId, idx);
    spy.mockRestore();

    await expect(
      setup.service.beginGuessTheImageNextRoundSelection(host.sessionId, guest.participantId)
    ).rejects.toThrow("Only the host can continue to the next image.");
  });

  it("rejects setGuessTheImageSetupParticipant in everyone mode", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    const host = await setup.service.createSession("Host");
    const guest = await setup.service.joinSession(host.joinCode, "Guest");
    await setup.service.startGame(host.sessionId, "guessTheImage", { guessImageSetupMode: "everyone" });
    await expect(
      setup.service.setGuessTheImageSetupParticipant(host.sessionId, host.participantId, guest.participantId)
    ).rejects.toThrow("single-preparer mode");
  });
});
