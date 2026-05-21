import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  ClientEvent,
  SessionChatMessage,
  SessionEmojiReaction,
  SessionState
} from "../../shared/contracts";
import { resolveApiBase } from "./config";
import { useRealtime, type SessionClosedReason } from "./hooks/useRealtime";
import { AppFooter } from "./components/AppFooter";
import { Toast } from "./components/Toast";
import { TopBar } from "./components/TopBar";
import { EmojiReactionsOverlay, type EmojiReactionBurst } from "./components/EmojiReactionsOverlay";
import type { ProfileAuth } from "./components/MyProfilePanel";
import { LandingScreen, type LandingSuccess } from "./screens/LandingScreen";
import { LobbyScreen } from "./screens/LobbyScreen";
import { GameScreen } from "./screens/GameScreen";
import {
  clearStoredSessionAuth,
  readStoredSessionAuth,
  writeStoredSessionAuth
} from "./sessionPersistence";

type AuthState = {
  sessionId: string;
  participantId: string;
  displayName: string;
};

const apiBase = resolveApiBase();

export function App(): JSX.Element {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [session, setSession] = useState<SessionState | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [chatMessages, setChatMessages] = useState<SessionChatMessage[]>([]);
  const [emojiBursts, setEmojiBursts] = useState<EmojiReactionBurst[]>([]);
  const [profileAuth, setProfileAuth] = useState<ProfileAuth | null>(null);
  const [isRestoringSession, setIsRestoringSession] = useState(() => readStoredSessionAuth() !== null);

  const handleSession = useCallback((state: SessionState) => {
    setSession(state);
  }, []);
  const handleError = useCallback((message: string) => {
    setError(message);
  }, []);
  const handleSessionClosed = useCallback((reason: SessionClosedReason) => {
    clearStoredSessionAuth();
    setAuth(null);
    setSession(null);
    setChatMessages([]);
    setEmojiBursts([]);
    setProfileAuth(null);
    setNotice(
      reason === "host_closed"
        ? "The host closed this session."
        : reason === "booted"
          ? "You were removed from the session by the host."
          : "Session closed after everyone left."
    );
  }, []);
  const handleChatHistory = useCallback((messages: SessionChatMessage[]) => {
    setChatMessages(messages);
  }, []);
  const handleChatMessage = useCallback((message: SessionChatMessage) => {
    setChatMessages((prev) => {
      if (prev.some((entry) => entry.id === message.id)) {
        return prev;
      }
      return [...prev, message];
    });
  }, []);
  const handleEmojiReaction = useCallback((reaction: SessionEmojiReaction) => {
    const burst: EmojiReactionBurst = {
      id: reaction.id,
      emoji: reaction.emoji,
      displayName: reaction.displayName,
      lanePercent: Math.floor(10 + Math.random() * 80)
    };
    setEmojiBursts((prev) => [...prev, burst]);
    setTimeout(() => {
      setEmojiBursts((prev) => prev.filter((entry) => entry.id !== burst.id));
    }, 2200);
  }, []);

  const realtimeAuth = useMemo(
    () => (auth ? { sessionId: auth.sessionId, participantId: auth.participantId } : null),
    [auth]
  );

  const { status, send } = useRealtime({
    apiBase,
    auth: realtimeAuth,
    onSession: handleSession,
    onError: handleError,
    onSessionClosed: handleSessionClosed,
    onChatHistory: handleChatHistory,
    onChatMessage: handleChatMessage,
    onEmojiReaction: handleEmojiReaction
  });

  const enterSession = useCallback((result: LandingSuccess) => {
    writeStoredSessionAuth({
      sessionId: result.sessionId,
      participantId: result.participantId,
      displayName: result.displayName,
      joinCode: result.state.joinCode
    });
    setAuth({
      sessionId: result.sessionId,
      participantId: result.participantId,
      displayName: result.displayName
    });
    setSession(result.state);
    setChatMessages([]);
    setEmojiBursts([]);
    setProfileAuth(null);
    setError("");
    setNotice("");
  }, []);

  useEffect(() => {
    const stored = readStoredSessionAuth();
    if (!stored) {
      setIsRestoringSession(false);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`${apiBase}/api/sessions/join`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            joinCode: stored.joinCode.trim().toUpperCase(),
            displayName: stored.displayName.trim()
          })
        });
        if (!response.ok) {
          throw new Error("Could not rejoin session.");
        }
        const payload = (await response.json()) as {
          sessionId: string;
          participantId: string;
          state: SessionState;
        };
        if (cancelled) {
          return;
        }
        enterSession({ ...payload, displayName: stored.displayName.trim() });
      } catch {
        if (cancelled) {
          return;
        }
        clearStoredSessionAuth();
        setNotice("Could not rejoin your session. It may have ended.");
        setError("");
      } finally {
        if (!cancelled) {
          setIsRestoringSession(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enterSession]);

  const leaveSession = () => {
    if (auth) {
      send({ type: "session:leave", payload: {} });
    }
    clearStoredSessionAuth();
    setAuth(null);
    setSession(null);
    setChatMessages([]);
    setEmojiBursts([]);
    setProfileAuth(null);
    setError("");
  };

  const closeSession = () => {
    if (auth) {
      send({ type: "session:close", payload: {} });
    }
  };

  const sendEvent = (event: ClientEvent) => send(event);

  if (isRestoringSession) {
    return (
      <>
        <div className="app-layout app-layout--landing">
          <main className="landing-shell">
            <p className="landing-restore-message">Reconnecting to your session…</p>
          </main>
          <AppFooter />
        </div>
        <Toast message="" onDismiss={() => setError("")} />
      </>
    );
  }

  if (!auth || !session) {
    return (
      <>
        <div className="app-layout app-layout--landing">
          <LandingScreen
            apiBase={apiBase}
            onSuccess={enterSession}
            error={error || notice}
            onError={setError}
          />
          <AppFooter />
        </div>
        <Toast message={status === "idle" ? "" : ""} onDismiss={() => setError("")} />
      </>
    );
  }

  const me = session.participants.find((participant) => participant.id === auth.participantId);
  const isHost = Boolean(me?.isHost);
  const canPlay = isHost || me?.isActive !== false;
  /** Benched guests stay on the lobby shell while a game runs; only active players (and host) see GameScreen. */
  const inGame = Boolean(session.activeGame && canPlay);

  return (
    <div className="app-shell">
      <TopBar
        sessionName={session.sessionName}
        joinCode={session.joinCode}
        status={status}
        chatMessages={chatMessages}
        participants={session.participants}
        currentParticipantId={auth.participantId}
        onSendChatMessage={(text) => send({ type: "chat:sendMessage", payload: { text } })}
        onSendEmojiReaction={(emoji) => send({ type: "chat:sendReaction", payload: { emoji } })}
        onLeave={leaveSession}
        onCloseSession={isHost ? closeSession : undefined}
      />
      <div className="app-workspace">
        <main className="app-main">
          {inGame ? (
            <GameScreen
              session={session}
              currentParticipantId={auth.participantId}
              isHost={isHost}
              canPlay={canPlay}
              send={sendEvent}
              apiBase={apiBase}
              profileAuth={profileAuth}
              onProfileAuthChange={setProfileAuth}
            />
          ) : (
            <LobbyScreen
              session={session}
              currentParticipantId={auth.participantId}
              isHost={isHost}
              send={sendEvent}
              apiBase={apiBase}
              profileAuth={profileAuth}
              onProfileAuthChange={setProfileAuth}
            />
          )}
        </main>
        <AppFooter />
      </div>
      <EmojiReactionsOverlay reactions={emojiBursts} />
      <Toast message={error} onDismiss={() => setError("")} />
    </div>
  );
}
