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
    ).rejects.toThrow("Puzzle creator must be an active player in this session.");
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
    await setup.service.startTrivia(host.sessionId, host.participantId, 1);
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
    await setup.service.closeTriviaQuestion(host.sessionId, host.participantId);
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
    await setup.service.startTrivia(host.sessionId, host.participantId, 1);
    const state = setup.service.getState(host.sessionId);
    if (!state.gameState || state.gameState.type !== "trivia" || !state.gameState.state.activeQuestion) {
      throw new Error("Expected trivia state");
    }
    await setup.service.submitTriviaAnswer(
      host.sessionId,
      player.participantId,
      state.gameState.state.activeQuestion.correctAnswer
    );
    await expect(setup.service.closeTriviaQuestion(host.sessionId, host.participantId)).rejects.toThrow(
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
    await service.startTrivia(host.sessionId, host.participantId, {
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

  it("lets non-hosts set lobby game preferences and exposes them in getState", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    const host = await setup.service.createSession("Host");
    const guest = await setup.service.joinSession(host.joinCode, "Guest");
    await setup.service.setLobbyGamePreference(host.sessionId, guest.participantId, "trivia");
    const state = setup.service.getState(host.sessionId);
    expect(state.lobbyGamePreferences?.[guest.participantId]).toBe("trivia");
    expect(Object.keys(state.lobbyGamePreferences ?? {})).toHaveLength(1);
  });

  it("overwrites lobby preference when a guest picks a different game", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    const host = await setup.service.createSession("Host");
    const guest = await setup.service.joinSession(host.joinCode, "Guest");
    await setup.service.setLobbyGamePreference(host.sessionId, guest.participantId, "trivia");
    await setup.service.setLobbyGamePreference(host.sessionId, guest.participantId, "hangman");
    const state = setup.service.getState(host.sessionId);
    expect(state.lobbyGamePreferences?.[guest.participantId]).toBe("hangman");
  });

  it("rejects lobby preference from host", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    const host = await setup.service.createSession("Host");
    await setup.service.joinSession(host.joinCode, "Guest");
    await expect(
      setup.service.setLobbyGamePreference(host.sessionId, host.participantId, "trivia")
    ).rejects.toThrow("Host cannot set a game preference.");
  });

  it("clears lobby preferences when a game starts", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    const host = await setup.service.createSession("Host");
    const guest = await setup.service.joinSession(host.joinCode, "Guest");
    await setup.service.setLobbyGamePreference(host.sessionId, guest.participantId, "trivia");
    await setup.service.startGame(host.sessionId, "hangman");
    const state = setup.service.getState(host.sessionId);
    expect(state.lobbyGamePreferences ?? {}).toEqual({});
  });

  it("drops lobby preference when participant leaves", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    const host = await setup.service.createSession("Host");
    const guest = await setup.service.joinSession(host.joinCode, "Guest");
    await setup.service.setLobbyGamePreference(host.sessionId, guest.participantId, "icebreaker");
    await setup.service.removeParticipant(host.sessionId, guest.participantId);
    const state = setup.service.getState(host.sessionId);
    expect(Object.keys(state.lobbyGamePreferences ?? {})).toHaveLength(0);
  });

  it("clears lobby preference when a guest is promoted to host", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    const host = await setup.service.createSession("Host");
    const guest = await setup.service.joinSession(host.joinCode, "Guest");
    await setup.service.joinSession(host.joinCode, "Other");
    await setup.service.setLobbyGamePreference(host.sessionId, guest.participantId, "trivia");
    await setup.service.removeParticipant(host.sessionId, host.participantId);
    const state = setup.service.getState(host.sessionId);
    expect(state.participants.some((p) => p.id === guest.participantId && p.isHost)).toBe(true);
    expect(state.lobbyGamePreferences ?? {}).toEqual({});
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
    await setup.service.startTrivia(host.sessionId, host.participantId, 5);
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
      await setup.service.closeTriviaQuestion(host.sessionId, host.participantId);
      await setup.service.nextTriviaQuestion(host.sessionId, host.participantId);
    }
  });

  it("tracks used trivia questions across trivia rounds in a session", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    const host = await setup.service.createSession("Host");
    await setup.service.startGame(host.sessionId, "trivia");
    await setup.service.startTrivia(host.sessionId, host.participantId, 4);
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
      await setup.service.closeTriviaQuestion(host.sessionId, host.participantId);
      await setup.service.nextTriviaQuestion(host.sessionId, host.participantId);
    }

    await setup.service.startGame(host.sessionId, "trivia");
    await setup.service.startTrivia(host.sessionId, host.participantId, 4);
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
    expect(final.gameState.state.imageUrl).toMatch(/guess-the-image\/file\//);
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

  it("everyone mode: host can reconfigure their slot while the round is finished (summary image unchanged)", async () => {
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
    const roundImageUrl = fin.gameState.state.imageUrl;
    expect(roundImageUrl).toMatch(/g\.png/);

    await setup.service.configureGuessTheImage(host.sessionId, host.participantId, {
      imageFileId: "h2.png",
      descriptions: ["N1", "N2", "N3", "N4"],
      correctIndex: 1,
      revealDurationMs: 55_000
    });

    const after = setup.service.getState(host.sessionId, host.participantId);
    if (after.gameState?.type !== "guessTheImage" || after.gameState.state.status !== "finished") {
      throw new Error("expected still finished");
    }
    expect(after.gameState.state.imageUrl).toBe(roundImageUrl);
    expect(after.gameState.state.everyoneMySetup?.imageUrl).toMatch(/h2\.png/);
    expect(after.gameState.state.everyoneMySetup?.descriptions).toEqual(["N1", "N2", "N3", "N4"]);
    expect(after.gameState.state.everyoneMySetup?.correctIndex).toBe(1);
  });

  it("rejects configure during finished for single-preparer mode", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    const host = await setup.service.createSession("Host");
    const guest = await setup.service.joinSession(host.joinCode, "Guest");
    let t = 1_000_000;
    const spy = vi.spyOn(Date, "now").mockImplementation(() => t);
    await setup.service.startGame(host.sessionId, "guessTheImage");
    await setup.service.configureGuessTheImage(host.sessionId, host.participantId, {
      imageFileId: "a.png",
      descriptions: ["A", "B", "C", "D"],
      correctIndex: 0,
      revealDurationMs: 60_000
    });
    await setup.service.startGuessTheImageRound(host.sessionId, host.participantId);
    const playing = setup.service.getState(host.sessionId, guest.participantId);
    if (playing.gameState?.type !== "guessTheImage" || playing.gameState.state.status !== "playing") {
      throw new Error("expected playing");
    }
    const idx = playing.gameState.state.options.indexOf("A");
    t += 500;
    await setup.service.lockGuessTheImageAnswer(host.sessionId, guest.participantId, idx);
    spy.mockRestore();

    await expect(
      setup.service.configureGuessTheImage(host.sessionId, host.participantId, {
        imageFileId: "b.png",
        descriptions: ["A", "B", "C", "D"],
        correctIndex: 0,
        revealDurationMs: 60_000
      })
    ).rejects.toThrow("Configure is only available during setup.");
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

  it("starts 20 Questions with host-selected item selector and max questions", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    const host = await setup.service.createSession("Host");
    const guest = await setup.service.joinSession(host.joinCode, "Guest");
    await setup.service.startGame(host.sessionId, "twentyQuestions", {
      twentyQuestionsItemSelectorId: guest.participantId,
      twentyQuestionsMaxQuestions: 12
    });
    const state = setup.service.getState(host.sessionId);
    if (state.gameState?.type !== "twentyQuestions") throw new Error("expected twentyQuestions");
    expect(state.gameState.state.status).toBe("waitingForItem");
    expect(state.gameState.state.itemSelectorId).toBe(guest.participantId);
    expect(state.gameState.state.maxQuestions).toBe(12);
  });

  it("20 Questions: one question cycle and team solved scoring", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    const host = await setup.service.createSession("Host");
    const g1 = await setup.service.joinSession(host.joinCode, "Alice");
    const g2 = await setup.service.joinSession(host.joinCode, "Bob");
    await setup.service.startGame(host.sessionId, "twentyQuestions", {
      twentyQuestionsItemSelectorId: host.participantId,
      twentyQuestionsMaxQuestions: 20
    });
    await setup.service.setTwentyQuestionsItem(host.sessionId, host.participantId, "Moon");
    const playing = setup.service.getState(host.sessionId);
    if (playing.gameState?.type !== "twentyQuestions" || playing.gameState.state.status !== "playing") {
      throw new Error("expected playing");
    }
    const askerId = playing.gameState.state.currentAskerId;
    await setup.service.submitTwentyQuestionsQuestion(host.sessionId, askerId, "Is it in outer space?");
    const mid = setup.service.getState(host.sessionId);
    if (mid.gameState?.type !== "twentyQuestions" || mid.gameState.state.status !== "playing") {
      throw new Error("expected twentyQuestions playing");
    }
    const qid = mid.gameState.state.questionLog[0]?.id;
    if (!qid) throw new Error("expected question id");
    await setup.service.answerTwentyQuestions(host.sessionId, host.participantId, qid, "yes");
    await setup.service.twentyQuestionsTeamSolved(host.sessionId, host.participantId);
    const fin = setup.service.getState(host.sessionId);
    if (fin.gameState?.type !== "twentyQuestions" || fin.gameState.state.status !== "finished") {
      throw new Error("expected finished");
    }
    expect(fin.gameState.state.outcome).toBe("team");
    expect(fin.gameState.state.revealedItem).toBe("Moon");
    const scores = Object.fromEntries(fin.participants.map((p) => [p.displayName, p.score]));
    expect(scores.Alice).toBe(1);
    expect(scores.Bob).toBe(1);
    expect(scores.Host).toBe(0);
  });

  it("20 Questions: selector wins when question budget is exhausted", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    const host = await setup.service.createSession("Host");
    const g1 = await setup.service.joinSession(host.joinCode, "A");
    const g2 = await setup.service.joinSession(host.joinCode, "B");
    const g3 = await setup.service.joinSession(host.joinCode, "C");
    await setup.service.startGame(host.sessionId, "twentyQuestions", {
      twentyQuestionsItemSelectorId: host.participantId,
      twentyQuestionsMaxQuestions: 3
    });
    await setup.service.setTwentyQuestionsItem(host.sessionId, host.participantId, "Secret");
    for (let i = 0; i < 3; i += 1) {
      const s = setup.service.getState(host.sessionId);
      if (s.gameState?.type !== "twentyQuestions" || s.gameState.state.status !== "playing") {
        throw new Error("expected playing");
      }
      const asker = s.gameState.state.currentAskerId;
      await setup.service.submitTwentyQuestionsQuestion(host.sessionId, asker, `Q${i + 1}?`);
      const afterQ = setup.service.getState(host.sessionId);
      if (afterQ.gameState?.type !== "twentyQuestions" || afterQ.gameState.state.status !== "playing") {
        throw new Error("expected twentyQuestions playing");
      }
      const pending = afterQ.gameState.state.questionLog.find((e: { answer: string | null }) => e.answer === null);
      if (!pending) throw new Error("expected pending");
      await setup.service.answerTwentyQuestions(host.sessionId, host.participantId, pending.id, "no");
    }
    const fin = setup.service.getState(host.sessionId);
    if (fin.gameState?.type !== "twentyQuestions" || fin.gameState.state.status !== "finished") {
      throw new Error("expected finished");
    }
    expect(fin.gameState.state.outcome).toBe("selector");
    const hostP = fin.participants.find((p) => p.displayName === "Host");
    expect(hostP?.score).toBe(3);
  });

  it("clears 20 Questions when the item selector leaves", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    const host = await setup.service.createSession("Host");
    const guest = await setup.service.joinSession(host.joinCode, "Guest");
    await setup.service.startGame(host.sessionId, "twentyQuestions", {
      twentyQuestionsItemSelectorId: guest.participantId
    });
    await setup.service.removeParticipant(host.sessionId, guest.participantId);
    const state = setup.service.getState(host.sessionId);
    expect(state.gameState).toBeNull();
    expect(state.activeGame).toBeNull();
  });

  it("rejects Caption This with fewer than two players", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    const host = await setup.service.createSession("Host");
    await expect(setup.service.startGame(host.sessionId, "captionThis")).rejects.toThrow(
      "Caption This needs at least two active players."
    );
  });

  it("runs Caption This through voting and results", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    const host = await setup.service.createSession("Host");
    const guest = await setup.service.joinSession(host.joinCode, "Guest");
    await setup.service.startGame(host.sessionId, "captionThis", {
      captionThisImageProviderId: host.participantId
    });
    let s = setup.service.getState(host.sessionId);
    if (s.gameState?.type !== "captionThis" || s.gameState.state.status !== "waitingForImage") {
      throw new Error("expected waitingForImage");
    }
    await setup.service.captionThisSubmitImage(host.sessionId, host.participantId, "img1.jpg");
    await setup.service.captionThisSubmitCaption(host.sessionId, host.participantId, "Host line");
    await setup.service.captionThisSubmitCaption(host.sessionId, guest.participantId, "Guest line");
    await setup.service.captionThisBeginVoting(host.sessionId, host.participantId);
    const hostV = setup.service.getState(host.sessionId, host.participantId);
    const guestV = setup.service.getState(host.sessionId, guest.participantId);
    if (hostV.gameState?.type !== "captionThis" || hostV.gameState.state.status !== "voting") {
      throw new Error("expected voting");
    }
    const hid = hostV.gameState.state.myEntryId;
    if (guestV.gameState?.type !== "captionThis" || guestV.gameState.state.status !== "voting") {
      throw new Error("expected guest voting");
    }
    const gid = guestV.gameState.state.myEntryId;
    if (!hid || !gid) {
      throw new Error("expected myEntryId");
    }
    await expect(
      setup.service.captionThisVote(host.sessionId, host.participantId, hid)
    ).rejects.toThrow("You cannot vote for your own caption.");
    await setup.service.captionThisVote(host.sessionId, host.participantId, gid);
    await setup.service.captionThisVote(host.sessionId, guest.participantId, hid);
    const done = setup.service.getState(host.sessionId);
    if (done.gameState?.type !== "captionThis" || done.gameState.state.status !== "results") {
      throw new Error("expected results");
    }
    expect(done.gameState.state.winnerEntryIds.length).toBeGreaterThan(0);
    expect(done.gameState.state.tallies.every((t) => t.voteCount === 1)).toBe(true);
  });

  it("clears Caption This when the image provider leaves", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    const host = await setup.service.createSession("Host");
    const guest = await setup.service.joinSession(host.joinCode, "Guest");
    await setup.service.startGame(host.sessionId, "captionThis", {
      captionThisImageProviderId: guest.participantId
    });
    await setup.service.removeParticipant(host.sessionId, guest.participantId);
    const state = setup.service.getState(host.sessionId);
    expect(state.gameState).toBeNull();
  });

  it("Apples to Apples: rejects start with fewer than three players", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    const host = await setup.service.createSession("Host");
    await setup.service.joinSession(host.joinCode, "Guest");
    await expect(setup.service.startGame(host.sessionId, "applesToApples")).rejects.toThrow(
      "Apples to Apples needs at least three active players."
    );
  });

  it("Apples to Apples: standard mode refills hands to six after a round", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    const host = await setup.service.createSession("Host");
    const p2 = await setup.service.joinSession(host.joinCode, "Two");
    const p3 = await setup.service.joinSession(host.joinCode, "Three");
    await setup.service.startGame(host.sessionId, "applesToApples", { applesToApplesMode: "standard" });
    const p2View = setup.service.getState(host.sessionId, p2.participantId);
    if (p2View.gameState?.type !== "applesToApples" || p2View.gameState.state.status !== "collecting") {
      throw new Error("expected collecting");
    }
    const hand2 = p2View.gameState.state.myHand;
    expect(hand2?.length).toBe(6);
    const p3View = setup.service.getState(host.sessionId, p3.participantId);
    if (p3View.gameState?.type !== "applesToApples" || p3View.gameState.state.status !== "collecting") {
      throw new Error("expected apples collecting for p3");
    }
    const stP3 = p3View.gameState.state;
    const card2 = hand2![0]!.id;
    const card3 = stP3.myHand![0]!.id;
    await setup.service.applesToApplesSubmitCard(host.sessionId, p2.participantId, card2);
    await setup.service.applesToApplesSubmitCard(host.sessionId, p3.participantId, card3);
    const p2Judging = setup.service.getState(host.sessionId, p2.participantId);
    if (p2Judging.gameState?.type !== "applesToApples" || p2Judging.gameState.state.status !== "judging") {
      throw new Error("expected p2 judging view");
    }
    expect(p2Judging.gameState.state.anonymousOptions.length).toBeGreaterThanOrEqual(1);
    const judgeView = setup.service.getState(host.sessionId, host.participantId);
    if (judgeView.gameState?.type !== "applesToApples" || judgeView.gameState.state.status !== "judging") {
      throw new Error("expected judging");
    }
    const opts = judgeView.gameState.state.anonymousOptions;
    if (!opts[0]) {
      throw new Error("expected options");
    }
    await setup.service.applesToApplesJudgePick(host.sessionId, host.participantId, opts[0].entryId);
    const winnerId = setup.service.getState(host.sessionId, host.participantId);
    if (winnerId.gameState?.type !== "applesToApples" || winnerId.gameState.state.status !== "roundResult") {
      throw new Error("expected roundResult");
    }
    expect([p2.participantId, p3.participantId]).toContain(winnerId.gameState.state.winnerParticipantId);
    expect(winnerId.gameState.state.revealedSubmissions.length).toBe(2);
    await setup.service.applesToApplesBeginNextRound(host.sessionId, host.participantId);
    const p3Next = setup.service.getState(host.sessionId, p3.participantId);
    if (p3Next.gameState?.type !== "applesToApples" || p3Next.gameState.state.status !== "collecting") {
      throw new Error("expected next collecting");
    }
    const st3 = p3Next.gameState.state;
    expect(st3.myHand?.length).toBe(6);
  });

  it("Apples to Apples: finite mode ends after six rounds", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    const host = await setup.service.createSession("Host");
    const p2 = await setup.service.joinSession(host.joinCode, "Two");
    const p3 = await setup.service.joinSession(host.joinCode, "Three");
    await setup.service.startGame(host.sessionId, "applesToApples", { applesToApplesMode: "finite" });
    for (let round = 1; round <= 6; round += 1) {
      const snap = setup.service.getState(host.sessionId, host.participantId);
      if (snap.gameState?.type !== "applesToApples") {
        throw new Error("expected apples");
      }
      const st = snap.gameState.state;
      if (st.status !== "collecting") {
        throw new Error(`round ${round}: expected collecting`);
      }
      const judgeId = st.judgeId;
      const submitters = [host.participantId, p2.participantId, p3.participantId].filter((id) => id !== judgeId);
      expect(submitters).toHaveLength(2);
      for (const pid of submitters) {
        const v = setup.service.getState(host.sessionId, pid);
        if (v.gameState?.type !== "applesToApples" || v.gameState.state.status !== "collecting") {
          throw new Error("submitters collecting");
        }
        const hand = v.gameState.state.myHand;
        if (!hand?.[0]) {
          throw new Error("need a card");
        }
        await setup.service.applesToApplesSubmitCard(host.sessionId, pid, hand[0].id);
      }
      const judgeSnap = setup.service.getState(host.sessionId, judgeId);
      if (judgeSnap.gameState?.type !== "applesToApples" || judgeSnap.gameState.state.status !== "judging") {
        throw new Error("expected judging");
      }
      const opts = judgeSnap.gameState.state.anonymousOptions;
      if (!opts[0]) {
        throw new Error("options");
      }
      await setup.service.applesToApplesJudgePick(host.sessionId, judgeId, opts[0].entryId);
      const rr = setup.service.getState(host.sessionId, host.participantId);
      if (rr.gameState?.type !== "applesToApples" || rr.gameState.state.status !== "roundResult") {
        throw new Error("roundResult");
      }
      const { canContinue } = rr.gameState.state;
      if (round < 6) {
        expect(canContinue).toBe(true);
        await setup.service.applesToApplesBeginNextRound(host.sessionId, host.participantId);
      } else {
        expect(canContinue).toBe(false);
        await setup.service.applesToApplesBeginNextRound(host.sessionId, host.participantId);
        const fin = setup.service.getState(host.sessionId, host.participantId);
        if (fin.gameState?.type !== "applesToApples" || fin.gameState.state.status !== "finished") {
          throw new Error("finished");
        }
      }
    }
  });

  it("Pictionary: rejects start with fewer than two players", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    const host = await setup.service.createSession("Host");
    await expect(setup.service.startGame(host.sessionId, "pictionary")).rejects.toThrow(
      "Pictionary needs at least two active players."
    );
  });

  it("Pictionary: clamps round duration to configured min and max", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    const host = await setup.service.createSession("Host");
    await setup.service.joinSession(host.joinCode, "Guest");
    await setup.service.startGame(host.sessionId, "pictionary", { pictionaryRoundDurationMs: 5_000 });
    let s = setup.service.getState(host.sessionId);
    if (s.gameState?.type !== "pictionary") {
      throw new Error("expected pictionary");
    }
    expect(s.gameState.state.roundDurationMs).toBe(30_000);
    await setup.service.startGame(host.sessionId, "pictionary", { pictionaryRoundDurationMs: 999_000 });
    s = setup.service.getState(host.sessionId);
    if (s.gameState?.type !== "pictionary") {
      throw new Error("expected pictionary");
    }
    expect(s.gameState.state.roundDurationMs).toBe(300_000);
  });

  it("Pictionary: only drawer sees prompt; HTTP snapshot hides prompt", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    const host = await setup.service.createSession("Host");
    const guest = await setup.service.joinSession(host.joinCode, "Guest");
    await setup.service.startGame(host.sessionId, "pictionary", { pictionaryRoundDurationMs: 60_000 });
    await setup.service.pictionarySetTeams(host.sessionId, host.participantId, [host.participantId], [guest.participantId]);
    await setup.service.pictionaryBeginPlay(host.sessionId, host.participantId);
    const base = setup.service.getState(host.sessionId);
    if (base.gameState?.type !== "pictionary" || base.gameState.state.status !== "drawing") {
      throw new Error("expected drawing");
    }
    const drawerId = base.gameState.state.drawerId;
    const otherId = drawerId === host.participantId ? guest.participantId : host.participantId;
    const drawerState = setup.service.getState(host.sessionId, drawerId);
    const otherState = setup.service.getState(host.sessionId, otherId);
    if (drawerState.gameState?.type !== "pictionary" || drawerState.gameState.state.status !== "drawing") {
      throw new Error("expected drawing");
    }
    if (otherState.gameState?.type !== "pictionary" || otherState.gameState.state.status !== "drawing") {
      throw new Error("expected drawing");
    }
    expect(drawerState.gameState.state.myPrompt).toBeTruthy();
    expect(otherState.gameState.state.myPrompt).toBeNull();
    const httpSnap = setup.service.getState(host.sessionId);
    if (httpSnap.gameState?.type !== "pictionary" || httpSnap.gameState.state.status !== "drawing") {
      throw new Error("expected drawing");
    }
    expect(httpSnap.gameState.state.myPrompt).toBeNull();
  });

  it("Pictionary: team guessed gives +1 to every member of the drawing team", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    const host = await setup.service.createSession("Host");
    const guest = await setup.service.joinSession(host.joinCode, "Guest");
    const carol = await setup.service.joinSession(host.joinCode, "Carol");
    await setup.service.startGame(host.sessionId, "pictionary", { pictionaryRoundDurationMs: 60_000 });
    await setup.service.pictionarySetTeams(host.sessionId, host.participantId, [host.participantId, carol.participantId], [
      guest.participantId
    ]);
    await setup.service.pictionaryBeginPlay(host.sessionId, host.participantId);
    const mid = setup.service.getState(host.sessionId);
    if (mid.gameState?.type !== "pictionary" || mid.gameState.state.status !== "drawing") {
      throw new Error("expected drawing");
    }
    const drawerId = mid.gameState.state.drawerId;
    const activeTeam = mid.gameState.state.activeTeam;
    const scoringTeamIds =
      activeTeam === "A" ? [...mid.gameState.state.teamAIds] : [...mid.gameState.state.teamBIds];
    const before = new Map(mid.participants.map((p) => [p.id, p.score]));
    await setup.service.pictionaryTeamGuessed(host.sessionId, drawerId);
    const fin = setup.service.getState(host.sessionId);
    if (fin.gameState?.type !== "pictionary" || fin.gameState.state.status !== "roundBreak") {
      throw new Error("expected roundBreak");
    }
    const after = new Map(fin.participants.map((p) => [p.id, p.score]));
    for (const id of scoringTeamIds) {
      expect(after.get(id)).toBe((before.get(id) ?? 0) + 1);
    }
    for (const p of fin.participants) {
      if (!scoringTeamIds.includes(p.id)) {
        expect(after.get(p.id)).toBe(before.get(p.id));
      }
    }
  });

  it("Pictionary: rejects appendStroke from non-drawer", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    const host = await setup.service.createSession("Host");
    const guest = await setup.service.joinSession(host.joinCode, "Guest");
    await setup.service.startGame(host.sessionId, "pictionary", { pictionaryRoundDurationMs: 60_000 });
    await setup.service.pictionarySetTeams(host.sessionId, host.participantId, [host.participantId], [guest.participantId]);
    await setup.service.pictionaryBeginPlay(host.sessionId, host.participantId);
    const mid = setup.service.getState(host.sessionId);
    if (mid.gameState?.type !== "pictionary" || mid.gameState.state.status !== "drawing") {
      throw new Error("expected drawing");
    }
    const drawerId = mid.gameState.state.drawerId;
    const notDrawer = drawerId === host.participantId ? guest.participantId : host.participantId;
    await expect(
      setup.service.pictionaryAppendStroke(host.sessionId, notDrawer, {
        tool: "pen",
        width: 4,
        points: [
          { x: 0.1, y: 0.1 },
          { x: 0.2, y: 0.2 }
        ]
      })
    ).rejects.toThrow("Only the drawer");
  });

  it("Pictionary: host skip round ends draw like a timeout without points", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    const host = await setup.service.createSession("Host");
    const guest = await setup.service.joinSession(host.joinCode, "Guest");
    await setup.service.startGame(host.sessionId, "pictionary", { pictionaryRoundDurationMs: 60_000 });
    await setup.service.pictionarySetTeams(host.sessionId, host.participantId, [host.participantId], [guest.participantId]);
    await setup.service.pictionaryBeginPlay(host.sessionId, host.participantId);
    await setup.service.pictionaryHostSkipRound(host.sessionId, host.participantId);
    const fin = setup.service.getState(host.sessionId);
    if (fin.gameState?.type !== "pictionary" || fin.gameState.state.status !== "roundBreak") {
      throw new Error("expected roundBreak");
    }
    expect(fin.gameState.state.lastResult).toBe("timeout");
    expect(fin.participants.every((p) => p.score === 0)).toBe(true);
  });

  it("Catch Phrase: requires four active players to start", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    const host = await setup.service.createSession("Host");
    await setup.service.joinSession(host.joinCode, "Guest 1");
    await setup.service.joinSession(host.joinCode, "Guest 2");
    await expect(setup.service.startGame(host.sessionId, "catchPhrase")).rejects.toThrow(
      "Catch Phrase needs at least four active players."
    );
  });

  it("Catch Phrase: only holder can start/pass and only holder sees phrase", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    const host = await setup.service.createSession("Host");
    const g1 = await setup.service.joinSession(host.joinCode, "Guest 1");
    const g2 = await setup.service.joinSession(host.joinCode, "Guest 2");
    const g3 = await setup.service.joinSession(host.joinCode, "Guest 3");

    await setup.service.startGame(host.sessionId, "catchPhrase");
    await expect(
      setup.service.catchPhraseSetTeams(host.sessionId, host.participantId, [host.participantId], [
        g1.participantId,
        g2.participantId,
        g3.participantId
      ])
    ).rejects.toThrow("Catch Phrase needs at least two players on each team.");

    await setup.service.catchPhraseSetTeams(
      host.sessionId,
      host.participantId,
      [host.participantId, g2.participantId],
      [g1.participantId, g3.participantId]
    );
    await setup.service.catchPhraseBeginPlay(host.sessionId, host.participantId);
    const waiting = setup.service.getState(host.sessionId);
    if (waiting.gameState?.type !== "catchPhrase" || waiting.gameState.state.status !== "playing") {
      throw new Error("expected catchPhrase playing");
    }
    if (waiting.gameState.state.roundPhase !== "awaitingRoundStart") {
      throw new Error("expected awaiting round start");
    }
    const holderId = waiting.gameState.state.holderId;
    const nonHolderId = [host.participantId, g1.participantId, g2.participantId, g3.participantId].find(
      (id) => id !== holderId
    );
    if (!nonHolderId) {
      throw new Error("expected non-holder id");
    }
    await expect(setup.service.catchPhraseStartRound(host.sessionId, nonHolderId)).rejects.toThrow(
      "Only the current holder can start this round."
    );
    await setup.service.catchPhraseStartRound(host.sessionId, holderId);

    const holderView = setup.service.getState(host.sessionId, holderId);
    const otherView = setup.service.getState(host.sessionId, nonHolderId);
    if (holderView.gameState?.type !== "catchPhrase" || holderView.gameState.state.status !== "playing") {
      throw new Error("expected catchPhrase holder view");
    }
    if (otherView.gameState?.type !== "catchPhrase" || otherView.gameState.state.status !== "playing") {
      throw new Error("expected catchPhrase other view");
    }
    if (holderView.gameState.state.roundPhase !== "live" || otherView.gameState.state.roundPhase !== "live") {
      throw new Error("expected live round");
    }
    expect(holderView.gameState.state.myPhrase).toBeTruthy();
    expect(otherView.gameState.state.myPhrase).toBeNull();

    const liveHolder = holderView.gameState.state;
    if (liveHolder.roundPhase !== "live") {
      throw new Error("expected live for phase check");
    }
    const phase1Ms = liveHolder.slowPhaseEndsAt - liveHolder.roundStartedAt;
    const phase2Ms = liveHolder.mediumPhaseEndsAt - liveHolder.slowPhaseEndsAt;
    const phase3Ms = liveHolder.roundEndsAt - liveHolder.mediumPhaseEndsAt;
    expect(phase1Ms).toBeGreaterThanOrEqual(20_000);
    expect(phase1Ms).toBeLessThanOrEqual(45_000);
    expect(phase2Ms).toBeGreaterThanOrEqual(20_000);
    expect(phase2Ms).toBeLessThanOrEqual(45_000);
    expect(phase3Ms).toBeGreaterThanOrEqual(8_000);
    expect(phase3Ms).toBeLessThanOrEqual(20_000);

    await expect(setup.service.catchPhraseGuessed(host.sessionId, nonHolderId)).rejects.toThrow(
      "Only the current holder can pass."
    );
    const firstRoundEndsAt = holderView.gameState.state.roundEndsAt;
    const firstRoundStartedAt = holderView.gameState.state.roundStartedAt;
    const firstSlowEndsAt = holderView.gameState.state.slowPhaseEndsAt;
    const firstMediumEndsAt = holderView.gameState.state.mediumPhaseEndsAt;
    await setup.service.catchPhraseGuessed(host.sessionId, holderId);
    const afterPass = setup.service.getState(host.sessionId);
    if (afterPass.gameState?.type !== "catchPhrase" || afterPass.gameState.state.status !== "playing") {
      throw new Error("expected catchPhrase after pass");
    }
    if (afterPass.gameState.state.roundPhase !== "live") {
      throw new Error("expected live after pass");
    }
    expect(afterPass.gameState.state.holderId).not.toBe(holderId);
    expect(afterPass.gameState.state.roundEndsAt).toBe(firstRoundEndsAt);
    expect(afterPass.gameState.state.roundStartedAt).toBe(firstRoundStartedAt);
    expect(afterPass.gameState.state.slowPhaseEndsAt).toBe(firstSlowEndsAt);
    expect(afterPass.gameState.state.mediumPhaseEndsAt).toBe(firstMediumEndsAt);
  });

  it("Catch Phrase: buzzer scores non-holding team and waits for next holder tap", async () => {
    vi.useFakeTimers();
    try {
      const setup = await createService();
      tempDir = setup.tempDir;
      const host = await setup.service.createSession("Host");
      const g1 = await setup.service.joinSession(host.joinCode, "Guest 1");
      const g2 = await setup.service.joinSession(host.joinCode, "Guest 2");
      const g3 = await setup.service.joinSession(host.joinCode, "Guest 3");

      await setup.service.startGame(host.sessionId, "catchPhrase");
      await setup.service.catchPhraseSetTeams(
        host.sessionId,
        host.participantId,
        [host.participantId, g2.participantId],
        [g1.participantId, g3.participantId]
      );
      await setup.service.catchPhraseBeginPlay(host.sessionId, host.participantId);
      const beforeStart = setup.service.getState(host.sessionId);
      if (beforeStart.gameState?.type !== "catchPhrase" || beforeStart.gameState.state.status !== "playing") {
        throw new Error("expected catchPhrase before start");
      }
      const initialHolderId = beforeStart.gameState.state.holderId;
      await setup.service.catchPhraseStartRound(host.sessionId, initialHolderId);
      const liveState = setup.service.getState(host.sessionId);
      if (liveState.gameState?.type !== "catchPhrase" || liveState.gameState.state.status !== "playing") {
        throw new Error("expected catchPhrase live");
      }
      if (liveState.gameState.state.roundPhase !== "live") {
        throw new Error("expected live phase");
      }
      const scoringTeamIds =
        liveState.gameState.state.teamAIds.includes(initialHolderId)
          ? liveState.gameState.state.teamBIds
          : liveState.gameState.state.teamAIds;
      const holderTeamIds = liveState.gameState.state.teamAIds.includes(initialHolderId)
        ? liveState.gameState.state.teamAIds
        : liveState.gameState.state.teamBIds;
      const scoringTeam: "A" | "B" = liveState.gameState.state.teamAIds.includes(initialHolderId) ? "B" : "A";
      const holderTeam: "A" | "B" = liveState.gameState.state.teamAIds.includes(initialHolderId) ? "A" : "B";
      const beforeScores = new Map(liveState.participants.map((p) => [p.id, p.score]));
      const delay = Math.max(0, liveState.gameState.state.roundEndsAt - Date.now()) + 10;
      await vi.advanceTimersByTimeAsync(delay);
      await vi.runOnlyPendingTimersAsync();

      const timedOut = setup.service.getState(host.sessionId);
      if (timedOut.gameState?.type !== "catchPhrase" || timedOut.gameState.state.status !== "playing") {
        throw new Error("expected catchPhrase after timeout");
      }
      if (timedOut.gameState.state.roundPhase !== "awaitingRoundStart") {
        throw new Error("expected awaiting phase after timeout");
      }
      for (const id of scoringTeamIds) {
        const after = timedOut.participants.find((p) => p.id === id)?.score ?? 0;
        expect(after).toBe((beforeScores.get(id) ?? 0) + 1);
      }
      for (const id of holderTeamIds) {
        const after = timedOut.participants.find((p) => p.id === id)?.score ?? 0;
        expect(after).toBe(beforeScores.get(id) ?? 0);
      }
      expect(timedOut.gameState.state.teamScores[scoringTeam]).toBe(1);
      expect(timedOut.gameState.state.teamScores[holderTeam]).toBe(0);

      const nextHolder = timedOut.gameState.state.holderId;
      const someoneElse = [host.participantId, g1.participantId, g2.participantId, g3.participantId].find(
        (id) => id !== nextHolder
      );
      if (!someoneElse) {
        throw new Error("expected someoneElse");
      }
      await expect(setup.service.catchPhraseStartRound(host.sessionId, someoneElse)).rejects.toThrow(
        "Only the current holder can start this round."
      );
      await setup.service.catchPhraseStartRound(host.sessionId, nextHolder);
      const restarted = setup.service.getState(host.sessionId);
      if (restarted.gameState?.type !== "catchPhrase" || restarted.gameState.state.status !== "playing") {
        throw new Error("expected restarted catchPhrase");
      }
      expect(restarted.gameState.state.roundPhase).toBe("live");
    } finally {
      vi.useRealTimers();
    }
  });

  it("host can bench a guest and inactive guests cannot submit trivia answers", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    const host = await setup.service.createSession("Host");
    const guest = await setup.service.joinSession(host.joinCode, "Guest");
    await setup.service.setParticipantActive(host.sessionId, host.participantId, guest.participantId, false);
    const s = setup.service.getState(host.sessionId);
    expect(s.participants.find((p) => p.id === guest.participantId)?.isActive).toBe(false);
    await setup.service.startGame(host.sessionId, "trivia");
    await setup.service.startTrivia(host.sessionId, host.participantId, 1);
    const st = setup.service.getState(host.sessionId);
    if (!st.gameState || st.gameState.type !== "trivia" || !st.gameState.state.activeQuestion) {
      throw new Error("expected trivia question");
    }
    await expect(
      setup.service.submitTriviaAnswer(
        host.sessionId,
        guest.participantId,
        st.gameState.state.activeQuestion.options[0]!
      )
    ).rejects.toThrow("Inactive players cannot take this action.");
  });

  it("rejects activating a player while a game is in progress", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    const host = await setup.service.createSession("Host");
    const guest = await setup.service.joinSession(host.joinCode, "Guest");
    await setup.service.setParticipantActive(host.sessionId, host.participantId, guest.participantId, false);
    await setup.service.startGame(host.sessionId, "hangman");
    await expect(
      setup.service.setParticipantActive(host.sessionId, host.participantId, guest.participantId, true)
    ).rejects.toThrow("Cannot activate a player while a game is in progress.");
  });

  it("rejects benching a player while a game is in progress", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    const host = await setup.service.createSession("Host");
    const guest = await setup.service.joinSession(host.joinCode, "Guest");
    await setup.service.startGame(host.sessionId, "hangman");
    await expect(
      setup.service.setParticipantActive(host.sessionId, host.participantId, guest.participantId, false)
    ).rejects.toThrow("Cannot bench a player while a game is in progress.");
  });

  it("rejects deactivating the host", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    const host = await setup.service.createSession("Host");
    await expect(
      setup.service.setParticipantActive(host.sessionId, host.participantId, host.participantId, false)
    ).rejects.toThrow("Cannot deactivate the host.");
  });

  it("rejects lobby game preference for inactive players", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    const host = await setup.service.createSession("Host");
    const guest = await setup.service.joinSession(host.joinCode, "Guest");
    await setup.service.setParticipantActive(host.sessionId, host.participantId, guest.participantId, false);
    await expect(
      setup.service.setLobbyGamePreference(host.sessionId, guest.participantId, "trivia")
    ).rejects.toThrow("Inactive players cannot set a game preference.");
  });

  it("UNO: requires two players to start", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    const host = await setup.service.createSession("Host");
    await expect(setup.service.startGame(host.sessionId, "uno")).rejects.toThrow(
      "UNO needs at least two active players."
    );
  });

  it("UNO: deals seven cards and playing state", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    const host = await setup.service.createSession("Host");
    const p2 = await setup.service.joinSession(host.joinCode, "Two");
    await setup.service.startGame(host.sessionId, "uno");
    const a = setup.service.getState(host.sessionId, host.participantId);
    const b = setup.service.getState(host.sessionId, p2.participantId);
    expect(a.gameState?.type).toBe("uno");
    expect(b.gameState?.type).toBe("uno");
    if (a.gameState?.type !== "uno" || a.gameState.state.status !== "playing") {
      throw new Error("expected uno playing for host view");
    }
    if (b.gameState?.type !== "uno" || b.gameState.state.status !== "playing") {
      throw new Error("expected uno playing for guest view");
    }
    expect(a.gameState.state.myHand.length).toBe(7);
    expect(b.gameState.state.myHand.length).toBe(7);
    expect(a.gameState.state.drawPileCount).toBe(108 - 7 * 2 - 1);
    expect(a.gameState.state.topDiscard.id).toBeTruthy();
  });

  it("UNO: rejects play out of turn", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    const host = await setup.service.createSession("Host");
    const p2 = await setup.service.joinSession(host.joinCode, "Two");
    await setup.service.startGame(host.sessionId, "uno");
    const hostView = setup.service.getState(host.sessionId, host.participantId);
    if (hostView.gameState?.type !== "uno" || hostView.gameState.state.status !== "playing") {
      throw new Error("expected uno");
    }
    const { currentPlayerId } = hostView.gameState.state;
    const otherId = currentPlayerId === host.participantId ? p2.participantId : host.participantId;
    const otherView = setup.service.getState(host.sessionId, otherId);
    if (otherView.gameState?.type !== "uno" || otherView.gameState.state.status !== "playing") {
      throw new Error("expected uno other");
    }
    const card = otherView.gameState.state.myHand[0]!;
    await expect(setup.service.unoPlayCard(host.sessionId, otherId, card.id)).rejects.toThrow("Not your turn.");
  });

  it("BS: starts with dealt hands and advances when everyone believes", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    const host = await setup.service.createSession("Host");
    const guest = await setup.service.joinSession(host.joinCode, "Guest");
    const guestTwo = await setup.service.joinSession(host.joinCode, "Guest 2");
    await setup.service.startGame(host.sessionId, "bs");

    const hostStart = setup.service.getState(host.sessionId, host.participantId);
    if (hostStart.gameState?.type !== "bs" || hostStart.gameState.state.status !== "playing") {
      throw new Error("expected bs playing");
    }
    expect(hostStart.gameState.state.currentRank).toBe("A");
    const totalCards = Object.values(hostStart.gameState.state.handCounts).reduce((sum, count) => sum + count, 0);
    expect(totalCards).toBe(52);
    const firstCardId = hostStart.gameState.state.myHand[0]!.id;

    await setup.service.bsPlayCards(host.sessionId, host.participantId, [firstCardId]);
    let mid = setup.service.getState(host.sessionId, guest.participantId);
    if (mid.gameState?.type !== "bs" || mid.gameState.state.status !== "challenging") {
      throw new Error("expected bs challenging");
    }
    expect(mid.gameState.state.playedCount).toBe(1);

    await setup.service.bsBelieve(host.sessionId, guest.participantId);
    await setup.service.bsBelieve(host.sessionId, guestTwo.participantId);
    mid = setup.service.getState(host.sessionId, host.participantId);
    if (mid.gameState?.type !== "bs" || mid.gameState.state.status !== "playing") {
      throw new Error("expected bs playing after belief");
    }
    expect(mid.gameState.state.currentRank).toBe("2");
    expect(mid.gameState.state.currentPlayerId).toBe(guest.participantId);
  });

  it("BS: requires at least three players to start", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    const host = await setup.service.createSession("Host");
    await setup.service.joinSession(host.joinCode, "Guest");
    await expect(setup.service.startGame(host.sessionId, "bs")).rejects.toThrow(
      "BS needs at least three active players."
    );
  });

  it("BS: reveals challenged cards and host resolution assigns discard pile", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    const host = await setup.service.createSession("Host");
    const g1 = await setup.service.joinSession(host.joinCode, "Guest1");
    await setup.service.joinSession(host.joinCode, "Guest2");
    await setup.service.startGame(host.sessionId, "bs");

    const before = setup.service.getState(host.sessionId, host.participantId);
    if (before.gameState?.type !== "bs" || before.gameState.state.status !== "playing") {
      throw new Error("expected bs playing");
    }
    const playIds = before.gameState.state.myHand.slice(0, 2).map((card) => card.id);
    const hostHandBefore = before.gameState.state.myHand.length;

    await setup.service.bsPlayCards(host.sessionId, host.participantId, playIds);
    await setup.service.bsCallBS(host.sessionId, g1.participantId);

    const challenged = setup.service.getState(host.sessionId, g1.participantId);
    if (challenged.gameState?.type !== "bs" || challenged.gameState.state.status !== "challenged") {
      throw new Error("expected challenged state");
    }
    expect(challenged.gameState.state.revealedCards).toHaveLength(2);
    expect(challenged.gameState.state.calledBsParticipantId).toBe(g1.participantId);

    await setup.service.bsResolveChallenge(host.sessionId, host.participantId, false);
    const after = setup.service.getState(host.sessionId, host.participantId);
    if (after.gameState?.type !== "bs" || after.gameState.state.status !== "playing") {
      throw new Error("expected playing state after resolve");
    }
    expect(after.gameState.state.myHand.length).toBe(hostHandBefore);
    expect(after.gameState.state.currentRank).toBe("2");
  });

  it("Madlibs: requires at least two players to start", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    const host = await setup.service.createSession("Host");
    await expect(setup.service.startGame(host.sessionId, "madlibs")).rejects.toThrow(
      "Madlibs needs at least two active players."
    );
  });

  it("Madlibs: rotates fillers, reveals story, supports pass and next round", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    const host = await setup.service.createSession("Host");
    const g1 = await setup.service.joinSession(host.joinCode, "Guest 1");
    const g2 = await setup.service.joinSession(host.joinCode, "Guest 2");
    await setup.service.startGame(host.sessionId, "madlibs");

    let state = setup.service.getState(host.sessionId, host.participantId);
    if (state.gameState?.type !== "madlibs" || state.gameState.state.status !== "filling") {
      throw new Error("expected madlibs filling");
    }

    let submissionIndex = 0;
    while (state.gameState.state.status === "filling") {
      const currentFillerId = state.gameState.state.currentFillerId;
      await setup.service.madlibsSubmitWord(host.sessionId, currentFillerId, `word-${submissionIndex}`);
      submissionIndex += 1;
      state = setup.service.getState(host.sessionId, host.participantId);
      if (state.gameState?.type !== "madlibs") {
        throw new Error("expected madlibs game state");
      }
    }

    if (state.gameState.state.status !== "reading") {
      throw new Error("expected madlibs reading");
    }

    const participants = new Set([host.participantId, g1.participantId, g2.participantId]);
    const initialReader = state.gameState.state.readerParticipantId;
    expect(participants.has(initialReader)).toBe(true);
    const readerView = setup.service.getState(host.sessionId, initialReader);
    if (readerView.gameState?.type !== "madlibs" || readerView.gameState.state.status !== "reading") {
      throw new Error("expected madlibs reading for initial reader");
    }
    expect(readerView.gameState.state.filledStory).toContain("word-0");
    expect(readerView.gameState.state.submissions.length).toBeGreaterThan(0);

    const nonReader = [host.participantId, g1.participantId, g2.participantId].find((id) => id !== initialReader)!;
    const hiddenView = setup.service.getState(host.sessionId, nonReader);
    if (hiddenView.gameState?.type !== "madlibs" || hiddenView.gameState.state.status !== "reading") {
      throw new Error("expected madlibs reading for non-reader");
    }
    expect(hiddenView.gameState.state.filledStory).toBeNull();
    expect(hiddenView.gameState.state.submissions).toEqual([]);

    await setup.service.madlibsPassRead(host.sessionId, initialReader);
    state = setup.service.getState(host.sessionId, host.participantId);
    if (state.gameState?.type !== "madlibs" || state.gameState.state.status !== "reading") {
      throw new Error("expected madlibs reading after pass");
    }
    expect(state.gameState.state.readerParticipantId).not.toBe(initialReader);

    const oldReaderView = setup.service.getState(host.sessionId, initialReader);
    if (oldReaderView.gameState?.type !== "madlibs" || oldReaderView.gameState.state.status !== "reading") {
      throw new Error("expected madlibs reading for old reader");
    }
    expect(oldReaderView.gameState.state.filledStory).toBeNull();

    const newReaderView = setup.service.getState(host.sessionId, state.gameState.state.readerParticipantId);
    if (newReaderView.gameState?.type !== "madlibs" || newReaderView.gameState.state.status !== "reading") {
      throw new Error("expected madlibs reading for new reader");
    }
    expect(newReaderView.gameState.state.filledStory).toContain("word-0");

    const beforeTemplateId = state.gameState.state.templateId;
    await setup.service.madlibsNextRound(host.sessionId, host.participantId);
    state = setup.service.getState(host.sessionId, host.participantId);
    if (state.gameState?.type !== "madlibs" || state.gameState.state.status !== "filling") {
      throw new Error("expected madlibs filling after next round");
    }
    expect(state.gameState.state.templateId).not.toBe(beforeTemplateId);
    expect(state.gameState.state.currentBlankIndex).toBe(0);
    expect(state.gameState.state.filledCount).toBe(0);
  });

  it("Madlibs: rejects submit/pass/next-round from wrong participant", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    const host = await setup.service.createSession("Host");
    const g1 = await setup.service.joinSession(host.joinCode, "Guest 1");
    const g2 = await setup.service.joinSession(host.joinCode, "Guest 2");
    await setup.service.startGame(host.sessionId, "madlibs");

    let state = setup.service.getState(host.sessionId, host.participantId);
    if (state.gameState?.type !== "madlibs" || state.gameState.state.status !== "filling") {
      throw new Error("expected madlibs filling");
    }
    const currentFillerId = state.gameState.state.currentFillerId;
    const wrongSubmitter = [host.participantId, g1.participantId, g2.participantId].find((id) => id !== currentFillerId)!;
    await expect(setup.service.madlibsSubmitWord(host.sessionId, wrongSubmitter, "bad")).rejects.toThrow(
      "It is not your turn to submit a word."
    );

    while (state.gameState.state.status === "filling") {
      await setup.service.madlibsSubmitWord(
        host.sessionId,
        state.gameState.state.currentFillerId,
        `ok-${state.gameState.state.currentBlankIndex}`
      );
      state = setup.service.getState(host.sessionId, host.participantId);
      if (state.gameState?.type !== "madlibs") {
        throw new Error("expected madlibs");
      }
    }

    if (state.gameState.state.status !== "reading") {
      throw new Error("expected reading");
    }
    const readingState = state.gameState.state;
    const nonReader = [host.participantId, g1.participantId, g2.participantId].find(
      (id) => id !== readingState.readerParticipantId
    )!;
    await expect(setup.service.madlibsPassRead(host.sessionId, nonReader)).rejects.toThrow(
      "Only the current reader can pass."
    );
    await expect(setup.service.madlibsNextRound(host.sessionId, g1.participantId)).rejects.toThrow(
      "Only the host can start the next Madlibs round."
    );
  });

  describe("yahtzee", () => {
    it("starts with first roll and rejects non-current roller", async () => {
      const setup = await createService();
      tempDir = setup.tempDir;
      const host = await setup.service.createSession("Host");
      const g1 = await setup.service.joinSession(host.joinCode, "A");
      await setup.service.joinSession(host.joinCode, "B");
      await setup.service.startGame(host.sessionId, "yahtzee");
      const s = setup.service.getState(host.sessionId, host.participantId);
      expect(s.gameState?.type).toBe("yahtzee");
      if (s.gameState?.type !== "yahtzee" || s.gameState.state.status !== "playing") {
        throw new Error("expected yahtzee playing");
      }
      expect(s.gameState.state.rollsUsed).toBe(1);
      expect(s.gameState.state.currentPlayerId).toBe(host.participantId);
      await expect(setup.service.yahtzeeRoll(host.sessionId, g1.participantId)).rejects.toThrow("Not your turn.");
    });

    it("allows pending category swap then commits on passTurn", async () => {
      const setup = await createService();
      tempDir = setup.tempDir;
      const host = await setup.service.createSession("Host");
      await setup.service.startGame(host.sessionId, "yahtzee");
      await setup.service.yahtzeeSetPendingCategory(host.sessionId, host.participantId, "sixes");
      await setup.service.yahtzeeSetPendingCategory(host.sessionId, host.participantId, "chance");
      let s = setup.service.getState(host.sessionId, host.participantId);
      if (s.gameState?.type !== "yahtzee" || s.gameState.state.status !== "playing") {
        throw new Error("expected yahtzee");
      }
      expect(s.gameState.state.pendingCategory).toBe("chance");
      await setup.service.yahtzeePassTurn(host.sessionId, host.participantId);
      s = setup.service.getState(host.sessionId, host.participantId);
      if (s.gameState?.type !== "yahtzee" || s.gameState.state.status !== "playing") {
        throw new Error("expected yahtzee after pass");
      }
      expect(s.gameState.state.pendingCategory).toBeNull();
      const sheet = s.gameState.state.sheetsByParticipant[host.participantId] ?? [];
      expect(sheet.some((r) => r.category === "chance")).toBe(true);
      expect(sheet.some((r) => r.category === "sixes")).toBe(false);
    });

    it("rejects passTurn without pending category", async () => {
      const setup = await createService();
      tempDir = setup.tempDir;
      const host = await setup.service.createSession("Host");
      await setup.service.startGame(host.sessionId, "yahtzee");
      await expect(setup.service.yahtzeePassTurn(host.sessionId, host.participantId)).rejects.toThrow(
        "Choose a scoring row before passing."
      );
    });

    it("caps at three rolls", async () => {
      const setup = await createService();
      tempDir = setup.tempDir;
      const host = await setup.service.createSession("Host");
      await setup.service.startGame(host.sessionId, "yahtzee");
      await setup.service.yahtzeeRoll(host.sessionId, host.participantId);
      await setup.service.yahtzeeRoll(host.sessionId, host.participantId);
      await expect(setup.service.yahtzeeRoll(host.sessionId, host.participantId)).rejects.toThrow(
        "No rolls remaining."
      );
    });

    it("finishes with reverse placement on participant scores", async () => {
      const setup = await createService();
      tempDir = setup.tempDir;
      const host = await setup.service.createSession("Host");
      const g1 = await setup.service.joinSession(host.joinCode, "B");
      await setup.service.startGame(host.sessionId, "yahtzee");
      const cats = [
        "ones",
        "twos",
        "threes",
        "fours",
        "fives",
        "sixes",
        "threeOfAKind",
        "fourOfAKind",
        "fullHouse",
        "smallStraight",
        "largeStraight",
        "yahtzee",
        "chance"
      ] as const;
      for (let step = 0; step < 26; step += 1) {
        const st = setup.service.getState(host.sessionId, host.participantId);
        if (st.gameState?.type !== "yahtzee") {
          throw new Error("expected yahtzee");
        }
        if (st.gameState.state.status === "finished") {
          break;
        }
        const cur = st.gameState.state.currentPlayerId;
        const n = st.gameState.state.sheetsByParticipant[cur]?.length ?? 0;
        const cat = cats[n];
        if (!cat) {
          throw new Error("category index");
        }
        await setup.service.yahtzeeSetPendingCategory(host.sessionId, cur, cat);
        await setup.service.yahtzeePassTurn(host.sessionId, cur);
      }
      const end = setup.service.getState(host.sessionId, host.participantId);
      expect(end.gameState?.type).toBe("yahtzee");
      if (end.gameState?.type !== "yahtzee" || end.gameState.state.status !== "finished") {
        throw new Error("expected finished");
      }
      const hostP = end.participants.find((p) => p.id === host.participantId);
      const g1P = end.participants.find((p) => p.id === g1.participantId);
      const totals = end.gameState.state.yahtzeeGrandTotals;
      const hostTotal = totals[host.participantId] ?? 0;
      const gTotal = totals[g1.participantId] ?? 0;
      if (hostTotal > gTotal) {
        expect(hostP?.score).toBe(2);
        expect(g1P?.score).toBe(1);
      } else if (gTotal > hostTotal) {
        expect(g1P?.score).toBe(2);
        expect(hostP?.score).toBe(1);
      } else {
        expect(hostP?.score).toBe(2);
        expect(g1P?.score).toBe(1);
      }
    });
  });
});
