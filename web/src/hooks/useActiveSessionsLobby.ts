import { useEffect, useRef } from "react";
import { serverEventSchema, type ActiveSessionSummary } from "../../../shared/contracts";
import { resolveWsUrl } from "../config";

const HEARTBEAT_MS = 20_000;
const RECONNECT_MS = 2_500;

/**
 * Subscribes to the server's lobby feed so the active session list updates without a full page reload.
 */
export function useActiveSessionsLobby(
  apiBase: string,
  onSessions: (sessions: ActiveSessionSummary[]) => void
): void {
  const onSessionsRef = useRef(onSessions);
  useEffect(() => {
    onSessionsRef.current = onSessions;
  }, [onSessions]);

  useEffect(() => {
    let cancelled = false;
    let ws: WebSocket | null = null;
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const clearHeartbeat = (): void => {
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
    };

    const clearReconnect = (): void => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const open = (): void => {
      if (cancelled) {
        return;
      }
      clearReconnect();
      let next: WebSocket;
      try {
        next = new WebSocket(resolveWsUrl(apiBase));
      } catch {
        reconnectTimer = setTimeout(open, RECONNECT_MS);
        return;
      }
      ws = next;

      next.addEventListener("open", () => {
        if (cancelled || ws !== next) {
          return;
        }
        try {
          next.send(JSON.stringify({ type: "lobby:subscribe", payload: {} }));
        } catch {
          // reconnect path
        }
        clearHeartbeat();
        heartbeatTimer = setInterval(() => {
          if (next.readyState !== WebSocket.OPEN) {
            return;
          }
          try {
            next.send(JSON.stringify({ type: "ping", payload: { ts: Date.now() } }));
          } catch {
            // ignore
          }
        }, HEARTBEAT_MS);
      });

      next.addEventListener("message", (messageEvent) => {
        if (ws !== next) {
          return;
        }
        let data: unknown;
        try {
          data = JSON.parse(messageEvent.data as string);
        } catch {
          return;
        }
        const parsed = serverEventSchema.safeParse(data);
        if (!parsed.success) {
          return;
        }
        if (parsed.data.type === "activeSessions:updated") {
          onSessionsRef.current(parsed.data.payload.sessions);
        }
      });

      const onDone = (): void => {
        if (ws !== next) {
          return;
        }
        clearHeartbeat();
        ws = null;
        if (!cancelled) {
          reconnectTimer = setTimeout(open, RECONNECT_MS);
        }
      };

      next.addEventListener("close", onDone);
      next.addEventListener("error", () => {
        try {
          next.close();
        } catch {
          // ignore
        }
      });
    };

    open();

    return () => {
      cancelled = true;
      clearReconnect();
      clearHeartbeat();
      const closing = ws;
      ws = null;
      if (closing) {
        try {
          closing.close();
        } catch {
          // ignore
        }
      }
    };
  }, [apiBase]);
}
