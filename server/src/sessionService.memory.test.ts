import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionService } from "./sessionService";
import { FileStore } from "./storage/fileStore";

type MemoryGameRaw = {
  type: "memory";
  cards: { id: string; symbolId: string; matched: boolean }[];
};

const getMemoryGame = (service: SessionService, sessionId: string): MemoryGameRaw => {
  const internal = service as unknown as {
    sessions: Map<string, { games: unknown[] }>;
  };
  const g = internal.sessions.get(sessionId)?.games[0] as MemoryGameRaw | undefined;
  if (!g || g.type !== "memory") {
    throw new Error("expected memory game");
  }
  return g;
};

const findPairIds = (game: MemoryGameRaw): [string, string] => {
  const bySymbol = new Map<string, string[]>();
  for (const c of game.cards) {
    const list = bySymbol.get(c.symbolId) ?? [];
    list.push(c.id);
    bySymbol.set(c.symbolId, list);
  }
  for (const ids of bySymbol.values()) {
    if (ids.length === 2) {
      return [ids[0]!, ids[1]!];
    }
  }
  throw new Error("no pair found");
};

const findTwoNonMatchingIds = (game: MemoryGameRaw): [string, string] => {
  const s0 = game.cards[0]?.symbolId;
  const c0 = game.cards[0]?.id;
  const other = game.cards.find((c) => c.symbolId !== s0);
  if (!c0 || !other) {
    throw new Error("need two symbols");
  }
  return [c0, other.id];
};

const createService = async (): Promise<{ service: SessionService; tempDir: string }> => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "fusion-memory-test-"));
  const store = new FileStore<{ sessions: unknown[] }>(path.join(tempDir, "sessions.json"));
  const service = new SessionService(store, undefined, tempDir);
  await service.load();
  return { service, tempDir };
};

describe("SessionService memory", () => {
  let tempDir = "";

  beforeEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = "";
    }
  });

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = "";
    }
  });

  it("rejects fewer than two players", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    const host = await setup.service.createSession("Host");
    await expect(setup.service.startGame(host.sessionId, "memory")).rejects.toThrow("at least two active players");
  });

  it("starts 30-card game", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    const host = await setup.service.createSession("Host");
    await setup.service.joinSession(host.joinCode, "G1");
    await setup.service.startGame(host.sessionId, "memory");
    const s = setup.service.getState(host.sessionId);
    if (s.gameState?.type !== "memory") {
      throw new Error("expected memory");
    }
    expect(s.gameState.state.phase).toBe("playing");
    expect(s.gameState.state.boardSize).toBe("30");
    expect(s.gameState.state.cols).toBe(6);
    expect(s.gameState.state.rows).toBe(5);
    expect(s.gameState.state.cards).toHaveLength(30);
    expect(s.gameState.state.currentPlayerId).toBe(host.participantId);
    const hidden = s.gameState.state.cards.filter((c) => c.status === "hidden");
    expect(hidden).toHaveLength(30);
  });

  it("starts 36-card game when host requests 36", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    const host = await setup.service.createSession("Host");
    await setup.service.joinSession(host.joinCode, "G1");
    await setup.service.startGame(host.sessionId, "memory", { memoryBoardSize: "36" });
    const s = setup.service.getState(host.sessionId);
    if (s.gameState?.type !== "memory") {
      throw new Error("expected memory");
    }
    expect(s.gameState.state.boardSize).toBe("36");
    expect(s.gameState.state.cols).toBe(6);
    expect(s.gameState.state.rows).toBe(6);
    expect(s.gameState.state.cards).toHaveLength(36);
  });

  it("keeps turn and scores on a match", async () => {
    const setup = await createService();
    tempDir = setup.tempDir;
    const host = await setup.service.createSession("Host");
    await setup.service.joinSession(host.joinCode, "G1");
    await setup.service.startGame(host.sessionId, "memory");
    const raw = getMemoryGame(setup.service, host.sessionId);
    const [id1, id2] = findPairIds(raw);
    await setup.service.memoryFlipCard(host.sessionId, host.participantId, id1);
    await setup.service.memoryFlipCard(host.sessionId, host.participantId, id2);
    const s = setup.service.getState(host.sessionId);
    if (s.gameState?.type !== "memory") {
      throw new Error("expected memory");
    }
    expect(s.gameState.state.phase).toBe("playing");
    expect(s.gameState.state.currentPlayerId).toBe(host.participantId);
    expect(s.gameState.state.scores[host.participantId]).toBe(1);
    expect(s.participants.find((p) => p.id === host.participantId)?.score).toBe(1);
    const matched = s.gameState.state.cards.filter((c) => c.status === "matched");
    expect(matched).toHaveLength(2);
  });

  it("enters resolving on mismatch then advances turn after delay", async () => {
    vi.useFakeTimers();
    const setup = await createService();
    tempDir = setup.tempDir;
    const host = await setup.service.createSession("Host");
    const g1 = await setup.service.joinSession(host.joinCode, "G1");
    await setup.service.startGame(host.sessionId, "memory");
    const raw = getMemoryGame(setup.service, host.sessionId);
    const [id1, id2] = findTwoNonMatchingIds(raw);
    await setup.service.memoryFlipCard(host.sessionId, host.participantId, id1);
    await setup.service.memoryFlipCard(host.sessionId, host.participantId, id2);
    const mid = setup.service.getState(host.sessionId);
    if (mid.gameState?.type !== "memory") {
      throw new Error("expected memory");
    }
    expect(mid.gameState.state.phase).toBe("resolving");
    await vi.runAllTimersAsync();
    const after = setup.service.getState(host.sessionId);
    if (after.gameState?.type !== "memory") {
      throw new Error("expected memory");
    }
    expect(after.gameState.state.phase).toBe("playing");
    expect(after.gameState.state.currentPlayerId).toBe(g1.participantId);
    expect(after.gameState.state.flippedCardIds).toHaveLength(0);
    vi.useRealTimers();
  });

  it("clears timer when host ends game during resolving", async () => {
    vi.useFakeTimers();
    const setup = await createService();
    tempDir = setup.tempDir;
    const host = await setup.service.createSession("Host");
    await setup.service.joinSession(host.joinCode, "G1");
    await setup.service.startGame(host.sessionId, "memory");
    const raw = getMemoryGame(setup.service, host.sessionId);
    const [id1, id2] = findTwoNonMatchingIds(raw);
    await setup.service.memoryFlipCard(host.sessionId, host.participantId, id1);
    await setup.service.memoryFlipCard(host.sessionId, host.participantId, id2);
    await setup.service.endActiveGame(host.sessionId, host.participantId);
    await vi.runAllTimersAsync();
    const s = setup.service.getState(host.sessionId);
    expect(s.activeGame).toBeNull();
    expect(s.gameState).toBeNull();
    vi.useRealTimers();
  });
});
