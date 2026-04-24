import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
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
});
