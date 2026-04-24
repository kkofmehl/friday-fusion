import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { buildApp } from "./index";
import { SessionService } from "./sessionService";
import { FileStore } from "./storage/fileStore";

const bootApp = async (): Promise<{
  app: Awaited<ReturnType<typeof buildApp>>["app"];
  port: number;
  tempDir: string;
  hostParticipantId: string;
  sessionId: string;
  service: SessionService;
}> => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "fusion-ws-"));
  const store = new FileStore<{ sessions: any[] }>(path.join(tempDir, "sessions.json"));
  const service = new SessionService(store, undefined, tempDir);
  await service.load();
  const { app } = await buildApp({ sessionService: service, serveStatic: false });
  await app.listen({ port: 0, host: "127.0.0.1" });
  const address = app.server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const created = await service.createSession("Host", "WS Test Crew");
  return {
    app,
    port,
    tempDir,
    hostParticipantId: created.participantId,
    sessionId: created.sessionId,
    service
  };
};

const nextServerEvent = (socket: WebSocket, predicate: (payload: any) => boolean): Promise<any> =>
  new Promise((resolve, reject) => {
    const handle = (raw: WebSocket.RawData) => {
      try {
        const parsed = JSON.parse(raw.toString());
        if (predicate(parsed)) {
          socket.off("message", handle);
          resolve(parsed);
        }
      } catch (error) {
        reject(error);
      }
    };
    socket.on("message", handle);
    setTimeout(() => {
      socket.off("message", handle);
      reject(new Error("Timed out waiting for ws event"));
    }, 3000);
  });

describe("WebSocket integration", () => {
  let context: Awaited<ReturnType<typeof bootApp>> | null = null;

  beforeEach(async () => {
    context = await bootApp();
  });

  afterEach(async () => {
    if (!context) return;
    await context.app.close();
    await rm(context.tempDir, { recursive: true, force: true });
    context = null;
  });

  it("handshakes with session:hello and receives session:state", async () => {
    if (!context) throw new Error("no context");
    const socket = new WebSocket(`ws://127.0.0.1:${context.port}/ws`);
    await new Promise<void>((resolve, reject) => {
      socket.once("open", () => resolve());
      socket.once("error", reject);
    });
    socket.send(
      JSON.stringify({
        type: "session:hello",
        payload: { sessionId: context.sessionId, participantId: context.hostParticipantId }
      })
    );
    const state = await nextServerEvent(socket, (event) => event.type === "session:state");
    expect(state.payload.sessionId).toBe(context.sessionId);
    expect(state.payload.participants.length).toBe(1);
    socket.close();
  });

  it("replies to ping with pong and keeps context", async () => {
    if (!context) throw new Error("no context");
    const socket = new WebSocket(`ws://127.0.0.1:${context.port}/ws`);
    await new Promise<void>((resolve, reject) => {
      socket.once("open", () => resolve());
      socket.once("error", reject);
    });
    socket.send(
      JSON.stringify({
        type: "session:hello",
        payload: { sessionId: context.sessionId, participantId: context.hostParticipantId }
      })
    );
    await nextServerEvent(socket, (event) => event.type === "session:state");
    socket.send(JSON.stringify({ type: "ping", payload: { ts: 42 } }));
    const pong = await nextServerEvent(socket, (event) => event.type === "pong");
    expect(pong.payload.ts).toBe(42);
    socket.close();
  });

  it("deduplicates repeat session:hello for same participant", async () => {
    if (!context) throw new Error("no context");
    const first = new WebSocket(`ws://127.0.0.1:${context.port}/ws`);
    await new Promise<void>((resolve, reject) => {
      first.once("open", () => resolve());
      first.once("error", reject);
    });
    first.send(
      JSON.stringify({
        type: "session:hello",
        payload: { sessionId: context.sessionId, participantId: context.hostParticipantId }
      })
    );
    await nextServerEvent(first, (event) => event.type === "session:state");

    const second = new WebSocket(`ws://127.0.0.1:${context.port}/ws`);
    await new Promise<void>((resolve, reject) => {
      second.once("open", () => resolve());
      second.once("error", reject);
    });
    second.send(
      JSON.stringify({
        type: "session:hello",
        payload: { sessionId: context.sessionId, participantId: context.hostParticipantId }
      })
    );
    await nextServerEvent(second, (event) => event.type === "session:state");

    second.send(
      JSON.stringify({ type: "game:start", payload: { game: "hangman" } })
    );
    const update = await nextServerEvent(second, (event) => event.type === "session:state" && event.payload.activeGame === "hangman");
    expect(update.payload.activeGame).toBe("hangman");

    first.close();
    second.close();
  });

  it("returns trivia categories from REST endpoint", async () => {
    if (!context) throw new Error("no context");
    const response = await context.app.inject({
      method: "GET",
      url: "/api/trivia/categories"
    });
    expect(response.statusCode).toBe(200);
    const payload = response.json() as Array<{ id: number; name: string }>;
    expect(payload.length).toBeGreaterThan(0);
    expect(typeof payload[0]?.id).toBe("number");
    expect(typeof payload[0]?.name).toBe("string");
  });
});
