import { useEffect, useMemo, useRef, useState } from "react";
import {
  type ClientEvent,
  type SessionChatMessage,
  type SessionEmojiReaction,
  type ServerEvent,
  type SessionState,
  serverEventSchema
} from "../../../shared/contracts";
import { resolveWsUrl } from "../config";

export type RealtimeStatus = "idle" | "connecting" | "open" | "reconnecting" | "closed";

export type RealtimeAuth = {
  sessionId: string;
  participantId: string;
};

export type SessionClosedReason = "host_closed" | "empty" | "booted";

export type UseRealtimeOptions = {
  apiBase: string;
  auth: RealtimeAuth | null;
  onSession: (state: SessionState) => void;
  onError: (message: string) => void;
  onSessionClosed?: (reason: SessionClosedReason) => void;
  onChatHistory?: (messages: SessionChatMessage[]) => void;
  onChatMessage?: (message: SessionChatMessage) => void;
  onEmojiReaction?: (reaction: SessionEmojiReaction) => void;
};

export type UseRealtimeResult = {
  status: RealtimeStatus;
  send: (event: ClientEvent) => void;
};

const HEARTBEAT_MS = 20_000;
const PONG_TIMEOUT_MS = 10_000;
const MIN_BACKOFF_MS = 250;
const MAX_BACKOFF_MS = 5_000;

const jitter = (value: number): number => value + Math.floor(Math.random() * 250);

export const useRealtime = ({
  apiBase,
  auth,
  onSession,
  onError,
  onSessionClosed,
  onChatHistory,
  onChatMessage,
  onEmojiReaction
}: UseRealtimeOptions): UseRealtimeResult => {
  const [status, setStatus] = useState<RealtimeStatus>("idle");
  const socketRef = useRef<WebSocket | null>(null);
  const queueRef = useRef<ClientEvent[]>([]);
  const attemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pongTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);
  const onSessionRef = useRef(onSession);
  const onErrorRef = useRef(onError);
  const onSessionClosedRef = useRef(onSessionClosed);
  const onChatHistoryRef = useRef(onChatHistory);
  const onChatMessageRef = useRef(onChatMessage);
  const onEmojiReactionRef = useRef(onEmojiReaction);

  useEffect(() => {
    onSessionRef.current = onSession;
    onErrorRef.current = onError;
    onSessionClosedRef.current = onSessionClosed;
    onChatHistoryRef.current = onChatHistory;
    onChatMessageRef.current = onChatMessage;
    onEmojiReactionRef.current = onEmojiReaction;
  }, [onSession, onError, onSessionClosed, onChatHistory, onChatMessage, onEmojiReaction]);

  const wsUrl = useMemo(() => resolveWsUrl(apiBase), [apiBase]);

  useEffect(() => {
    if (!auth) {
      setStatus("idle");
      return;
    }
    cancelledRef.current = false;
    attemptsRef.current = 0;

    const clearTimers = (): void => {
      if (heartbeatTimerRef.current) {
        clearInterval(heartbeatTimerRef.current);
        heartbeatTimerRef.current = null;
      }
      if (pongTimerRef.current) {
        clearTimeout(pongTimerRef.current);
        pongTimerRef.current = null;
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };

    const scheduleReconnect = (): void => {
      if (cancelledRef.current) {
        return;
      }
      const attempt = attemptsRef.current;
      const delay = jitter(Math.min(MAX_BACKOFF_MS, MIN_BACKOFF_MS * 2 ** attempt));
      attemptsRef.current = attempt + 1;
      setStatus("reconnecting");
      reconnectTimerRef.current = setTimeout(() => {
        connect();
      }, delay);
    };

    const armHeartbeat = (ws: WebSocket): void => {
      if (heartbeatTimerRef.current) {
        clearInterval(heartbeatTimerRef.current);
      }
      heartbeatTimerRef.current = setInterval(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          return;
        }
        try {
          ws.send(JSON.stringify({ type: "ping", payload: { ts: Date.now() } }));
        } catch {
          // ignore
        }
        if (pongTimerRef.current) {
          clearTimeout(pongTimerRef.current);
        }
        pongTimerRef.current = setTimeout(() => {
          try {
            ws.close();
          } catch {
            // ignore
          }
        }, PONG_TIMEOUT_MS);
      }, HEARTBEAT_MS);
    };

    const flushQueue = (ws: WebSocket): void => {
      while (queueRef.current.length > 0) {
        const next = queueRef.current.shift();
        if (!next) continue;
        try {
          ws.send(JSON.stringify(next));
        } catch {
          queueRef.current.unshift(next);
          break;
        }
      }
    };

    const connect = (): void => {
      if (cancelledRef.current) {
        return;
      }
      setStatus((prev) => (prev === "reconnecting" ? prev : "connecting"));
      let ws: WebSocket;
      try {
        ws = new WebSocket(wsUrl);
      } catch {
        scheduleReconnect();
        return;
      }
      socketRef.current = ws;

      ws.addEventListener("open", () => {
        if (cancelledRef.current || socketRef.current !== ws) {
          try { ws.close(); } catch { /* ignore */ }
          return;
        }
        attemptsRef.current = 0;
        setStatus("open");
        try {
          ws.send(
            JSON.stringify({
              type: "session:hello",
              payload: { sessionId: auth.sessionId, participantId: auth.participantId }
            })
          );
        } catch {
          // If this fails, close triggers reconnect.
        }
        flushQueue(ws);
        armHeartbeat(ws);
      });

      ws.addEventListener("message", (messageEvent) => {
        if (socketRef.current !== ws) {
          return;
        }
        let data: unknown;
        try {
          data = JSON.parse(messageEvent.data as string);
        } catch {
          onErrorRef.current("Invalid websocket event received.");
          return;
        }
        const parsed = serverEventSchema.safeParse(data);
        if (!parsed.success) {
          onErrorRef.current("Invalid websocket event received.");
          return;
        }
        const event: ServerEvent = parsed.data;
        if (event.type === "session:state") {
          onSessionRef.current(event.payload);
        } else if (event.type === "chat:history") {
          onChatHistoryRef.current?.(event.payload.messages);
        } else if (event.type === "chat:message") {
          onChatMessageRef.current?.(event.payload.message);
        } else if (event.type === "chat:emojiReaction") {
          onEmojiReactionRef.current?.(event.payload.reaction);
        } else if (event.type === "session:closed") {
          cancelledRef.current = true;
          onSessionClosedRef.current?.(event.payload.reason);
        } else if (event.type === "error") {
          onErrorRef.current(event.payload.message);
        } else if (event.type === "pong") {
          if (pongTimerRef.current) {
            clearTimeout(pongTimerRef.current);
            pongTimerRef.current = null;
          }
        }
      });

      const handleClose = (): void => {
        if (socketRef.current !== ws) {
          return;
        }
        if (heartbeatTimerRef.current) {
          clearInterval(heartbeatTimerRef.current);
          heartbeatTimerRef.current = null;
        }
        if (pongTimerRef.current) {
          clearTimeout(pongTimerRef.current);
          pongTimerRef.current = null;
        }
        socketRef.current = null;
        if (cancelledRef.current) {
          setStatus("closed");
          return;
        }
        scheduleReconnect();
      };

      ws.addEventListener("close", handleClose);
      ws.addEventListener("error", () => {
        if (socketRef.current !== ws) {
          return;
        }
        try { ws.close(); } catch { /* ignore */ }
      });
    };

    connect();

    return () => {
      cancelledRef.current = true;
      clearTimers();
      const ws = socketRef.current;
      socketRef.current = null;
      if (ws) {
        try { ws.close(); } catch { /* ignore */ }
      }
      queueRef.current = [];
      setStatus("closed");
    };
  }, [auth, wsUrl]);

  const send = (event: ClientEvent): void => {
    const ws = socketRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(event));
        return;
      } catch {
        // fall through to queue
      }
    }
    queueRef.current.push(event);
  };

  return { status, send };
};
