import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import websocket from "@fastify/websocket";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { WebSocket } from "ws";
import {
  clientEventSchema,
  createSessionRequestSchema,
  joinSessionRequestSchema,
  serverEventSchema,
  type ServerEvent
} from "../../shared/contracts";
import { SessionService, createSessionService } from "./sessionService";

const HEARTBEAT_INTERVAL_MS = 20_000;
const DEAD_CONNECTION_MS = 45_000;
// Sessions whose last live WebSocket disconnected more than this long ago are
// closed automatically. Covers the case where everyone closes their tab
// without clicking the explicit "Leave" button.
const ABANDONED_SESSION_MS = 10 * 60 * 1000;

type ConnectionContext = {
  sessionId: string;
  participantId: string;
  socket: WebSocket;
  lastSeenAt: number;
};

export type BuildAppOptions = {
  sessionService?: SessionService;
  serveStatic?: boolean;
};

export const buildApp = async (options: BuildAppOptions = {}): Promise<{
  app: FastifyInstance;
  sessionService: SessionService;
  connections: Map<string, ConnectionContext[]>;
}> => {
  const app = Fastify({ logger: true });
  const sessionService = options.sessionService ?? createSessionService();
  await app.register(cors, { origin: true });
  await app.register(websocket);

  const serveStatic = options.serveStatic ?? true;
  const webDistPath = process.env.WEB_DIST_PATH ?? path.resolve(process.cwd(), "../web/dist");
  if (serveStatic && existsSync(webDistPath)) {
    await app.register(fastifyStatic, {
      root: webDistPath,
      prefix: "/"
    });
  }

  const connections = new Map<string, ConnectionContext[]>();
  const lastConnectedAt = new Map<string, number>();

  const sendEvent = (socket: WebSocket, event: ServerEvent): void => {
    try {
      socket.send(JSON.stringify(event));
    } catch (error) {
      app.log.warn({ err: error }, "failed to send ws event");
    }
  };

  const broadcastState = (sessionId: string): void => {
    const targets = connections.get(sessionId) ?? [];
    if (targets.length === 0) {
      return;
    }
    let state;
    try {
      state = sessionService.getState(sessionId);
    } catch (error) {
      app.log.warn({ err: error, sessionId }, "broadcastState: session missing");
      return;
    }
    const payload: ServerEvent = { type: "session:state", payload: state };
    const parsed = serverEventSchema.safeParse(payload);
    if (!parsed.success) {
      app.log.error({ err: parsed.error, sessionId }, "broadcastState: payload failed schema");
      return;
    }
    const wire = JSON.stringify(payload);
    targets.forEach((target) => {
      try {
        target.socket.send(wire);
      } catch (error) {
        app.log.warn({ err: error }, "broadcastState: failed to deliver to client");
      }
    });
  };

  const sendError = (socket: WebSocket, message: string): void => {
    sendEvent(socket, { type: "error", payload: { message } });
  };

  const removeConnection = (sessionId: string, predicate: (ctx: ConnectionContext) => boolean): void => {
    const current = connections.get(sessionId);
    if (!current) {
      return;
    }
    const next = current.filter((ctx) => !predicate(ctx));
    if (next.length === 0) {
      connections.delete(sessionId);
    } else {
      connections.set(sessionId, next);
    }
  };

  const broadcastSessionClosed = (
    sessionId: string,
    reason: "host_closed" | "empty"
  ): void => {
    const targets = connections.get(sessionId) ?? [];
    const wire = JSON.stringify({
      type: "session:closed",
      payload: { sessionId, reason }
    } satisfies ServerEvent);
    targets.forEach((target) => {
      try {
        target.socket.send(wire);
      } catch (error) {
        app.log.warn({ err: error }, "broadcastSessionClosed: send failed");
      }
      try {
        target.socket.close();
      } catch (error) {
        app.log.warn({ err: error }, "broadcastSessionClosed: close failed");
      }
    });
    connections.delete(sessionId);
  };

  app.get("/api/health", async () => ({ ok: true }));

  app.post("/api/sessions", async (request, reply) => {
    const body = createSessionRequestSchema.parse(request.body);
    const created = await sessionService.createSession(body.displayName.trim(), body.sessionName?.trim());
    const state = sessionService.getState(created.sessionId);
    return reply.send({
      ...created,
      state
    });
  });

  app.get("/api/active-sessions", async () => sessionService.listActiveSessions());

  app.post("/api/sessions/join", async (request, reply) => {
    const body = joinSessionRequestSchema.parse(request.body);
    const joined = await sessionService.joinSession(body.joinCode, body.displayName.trim());
    const state = sessionService.getState(joined.sessionId);
    broadcastState(joined.sessionId);
    return reply.send({
      ...joined,
      state
    });
  });

  app.get("/api/sessions/:sessionId", async (request, reply) => {
    const sessionId = (request.params as { sessionId: string }).sessionId;
    try {
      return reply.send(sessionService.getState(sessionId));
    } catch (error) {
      if (error instanceof Error && error.message === "Session not found.") {
        return reply.code(404).send({ message: "Session not found." });
      }
      throw error;
    }
  });

  app.get("/ws", { websocket: true }, (connection) => {
    const socket = connection.socket;
    let context: ConnectionContext | null = null;

    socket.on("message", async (raw: Buffer) => {
      let parsedRaw: unknown;
      try {
        parsedRaw = JSON.parse(raw.toString());
      } catch {
        sendError(socket, "Invalid JSON payload.");
        return;
      }
      const parseResult = clientEventSchema.safeParse(parsedRaw);
      if (!parseResult.success) {
        sendError(socket, "Invalid event payload.");
        return;
      }
      const event = parseResult.data;

      try {
        if (event.type === "session:hello") {
          const { sessionId, participantId } = event.payload;
          try {
            sessionService.getState(sessionId);
          } catch {
            sendError(socket, "Session not found.");
            socket.close();
            return;
          }

          removeConnection(sessionId, (ctx) => ctx.participantId === participantId);
          const newContext: ConnectionContext = {
            sessionId,
            participantId,
            socket,
            lastSeenAt: Date.now()
          };
          context = newContext;
          const sessionConnections = connections.get(sessionId) ?? [];
          sessionConnections.push(newContext);
          connections.set(sessionId, sessionConnections);
          lastConnectedAt.set(sessionId, Date.now());
          broadcastState(sessionId);
          return;
        }

        if (event.type === "ping") {
          if (context) {
            context.lastSeenAt = Date.now();
          }
          sendEvent(socket, { type: "pong", payload: { ts: event.payload.ts } });
          return;
        }

        if (!context) {
          sendError(socket, "Please authenticate session websocket first.");
          return;
        }

        context.lastSeenAt = Date.now();

        if (event.type === "session:leave") {
          const { sessionId, participantId, socket: leavingSocket } = context;
          removeConnection(sessionId, (ctx) => ctx.socket === leavingSocket);
          context = null;
          const result = await sessionService.removeParticipant(sessionId, participantId);
          try {
            leavingSocket.close();
          } catch {
            // ignore
          }
          if (result.sessionDeleted) {
            broadcastSessionClosed(sessionId, "empty");
          } else {
            broadcastState(sessionId);
          }
          return;
        }

        if (event.type === "session:close") {
          if (!sessionService.isHost(context.sessionId, context.participantId)) {
            throw new Error("Only the host can close the session.");
          }
          const sessionId = context.sessionId;
          await sessionService.closeSession(sessionId, context.participantId);
          context = null;
          broadcastSessionClosed(sessionId, "host_closed");
          return;
        }

        if (event.type === "game:end") {
          if (!sessionService.isHost(context.sessionId, context.participantId)) {
            throw new Error("Only the host can end the game.");
          }
          await sessionService.endActiveGame(context.sessionId, context.participantId);
          broadcastState(context.sessionId);
          return;
        }

        if (event.type === "game:start") {
          if (!sessionService.isHost(context.sessionId, context.participantId)) {
            throw new Error("Only host can start a game.");
          }
          await sessionService.startGame(
            context.sessionId,
            event.payload.game,
            event.payload.options ?? {}
          );
        } else if (event.type === "hangman:setWord") {
          await sessionService.setHangmanWord(context.sessionId, context.participantId, event.payload.word);
        } else if (event.type === "hangman:guessLetter") {
          await sessionService.guessHangmanLetter(context.sessionId, context.participantId, event.payload.letter);
        } else if (event.type === "hangman:solveOpen") {
          await sessionService.openHangmanSolve(context.sessionId, context.participantId);
        } else if (event.type === "hangman:solveCancel") {
          await sessionService.cancelHangmanSolve(context.sessionId, context.participantId);
        } else if (event.type === "hangman:solve") {
          await sessionService.solveHangman(context.sessionId, context.participantId, event.payload.guess);
        } else if (event.type === "hangman:setTurn") {
          await sessionService.setHangmanTurn(
            context.sessionId,
            context.participantId,
            event.payload.participantId
          );
        } else if (event.type === "session:reorderParticipants") {
          await sessionService.reorderParticipants(
            context.sessionId,
            context.participantId,
            event.payload.participantIds
          );
        } else if (event.type === "truths:submit") {
          await sessionService.submitTwoTruths(
            context.sessionId,
            context.participantId,
            event.payload.statements,
            event.payload.lieIndex
          );
        } else if (event.type === "truths:beginVoting") {
          if (!sessionService.isHost(context.sessionId, context.participantId)) {
            throw new Error("Only host can begin voting.");
          }
          await sessionService.beginVoting(context.sessionId, event.payload.presenterId);
        } else if (event.type === "truths:vote") {
          await sessionService.voteLie(context.sessionId, context.participantId, event.payload.lieIndex);
        } else if (event.type === "truths:reveal") {
          if (!sessionService.isHost(context.sessionId, context.participantId)) {
            throw new Error("Only host can reveal answers.");
          }
          await sessionService.revealTwoTruths(context.sessionId);
        } else if (event.type === "trivia:start") {
          if (!sessionService.isHost(context.sessionId, context.participantId)) {
            throw new Error("Only host can start trivia.");
          }
          await sessionService.startTrivia(context.sessionId, event.payload.totalQuestions);
        } else if (event.type === "trivia:answer") {
          await sessionService.submitTriviaAnswer(context.sessionId, context.participantId, event.payload.answer);
        } else if (event.type === "trivia:closeQuestion") {
          if (!sessionService.isHost(context.sessionId, context.participantId)) {
            throw new Error("Only host can close a question.");
          }
          await sessionService.closeTriviaQuestion(context.sessionId);
        } else if (event.type === "trivia:nextQuestion") {
          if (!sessionService.isHost(context.sessionId, context.participantId)) {
            throw new Error("Only host can move to the next question.");
          }
          await sessionService.nextTriviaQuestion(context.sessionId);
        }

        broadcastState(context.sessionId);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unexpected error";
        sendError(socket, message);
      }
    });

    socket.on("close", () => {
      if (!context) {
        return;
      }
      const closing = context;
      removeConnection(closing.sessionId, (ctx) => ctx.socket === closing.socket);
      if (!connections.get(closing.sessionId)?.length) {
        lastConnectedAt.set(closing.sessionId, Date.now());
      }
    });

    socket.on("error", (error: Error) => {
      app.log.warn({ err: error }, "ws socket error");
    });
  });

  app.setNotFoundHandler(async (request, reply) => {
    if (request.url.startsWith("/api") || request.url.startsWith("/ws")) {
      return reply.code(404).send({ error: "Not found" });
    }
    if (!existsSync(path.join(webDistPath, "index.html"))) {
      return reply.code(404).send({ error: "Frontend not built. Run web build first." });
    }
    const html = await readFile(path.join(webDistPath, "index.html"), "utf8");
    return reply.type("text/html").send(html);
  });

  const heartbeatTimer = setInterval(() => {
    const now = Date.now();
    for (const [sessionId, contexts] of connections.entries()) {
      const survivors: ConnectionContext[] = [];
      for (const ctx of contexts) {
        if (now - ctx.lastSeenAt > DEAD_CONNECTION_MS) {
          try {
            ctx.socket.terminate();
          } catch {
            // ignore
          }
          continue;
        }
        survivors.push(ctx);
      }
      if (survivors.length === 0) {
        connections.delete(sessionId);
        lastConnectedAt.set(sessionId, now);
      } else {
        connections.set(sessionId, survivors);
      }
    }

    for (const [sessionId, disconnectedAt] of lastConnectedAt.entries()) {
      if (connections.get(sessionId)?.length) {
        continue;
      }
      if (now - disconnectedAt <= ABANDONED_SESSION_MS) {
        continue;
      }
      lastConnectedAt.delete(sessionId);
      sessionService
        .closeSessionUnchecked(sessionId)
        .then((existed) => {
          if (existed) {
            app.log.info({ sessionId }, "closing abandoned session");
          }
        })
        .catch((error) => {
          app.log.warn({ err: error, sessionId }, "abandoned session cleanup failed");
        });
    }
  }, HEARTBEAT_INTERVAL_MS);

  app.addHook("onClose", async () => {
    clearInterval(heartbeatTimer);
  });

  return { app, sessionService, connections };
};

const boot = async (): Promise<void> => {
  const { app, sessionService } = await buildApp();
  await sessionService.load();
  const cleanupTimer = setInterval(() => {
    sessionService.cleanupStaleSessions(1000 * 60 * 60 * 24).catch((error) => app.log.error(error));
  }, 1000 * 60 * 10);
  app.addHook("onClose", async () => {
    clearInterval(cleanupTimer);
  });
  const port = Number(process.env.PORT ?? 3000);
  await app.listen({ port, host: "0.0.0.0" });
};

if (require.main === module) {
  boot().catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exit(1);
  });
}
