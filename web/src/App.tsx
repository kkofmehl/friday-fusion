import { useCallback, useMemo, useState } from "react";
import type { ClientEvent, SessionState } from "../../shared/contracts";
import { resolveApiBase } from "./config";
import { useRealtime, type SessionClosedReason } from "./hooks/useRealtime";
import { Toast } from "./components/Toast";
import { TopBar } from "./components/TopBar";
import { LandingScreen, type LandingSuccess } from "./screens/LandingScreen";
import { LobbyScreen } from "./screens/LobbyScreen";
import { GameScreen } from "./screens/GameScreen";

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

  const handleSession = useCallback((state: SessionState) => {
    setSession(state);
  }, []);
  const handleError = useCallback((message: string) => {
    setError(message);
  }, []);
  const handleSessionClosed = useCallback((reason: SessionClosedReason) => {
    setAuth(null);
    setSession(null);
    setNotice(
      reason === "host_closed"
        ? "The host closed this session."
        : "Session closed after everyone left."
    );
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
    onSessionClosed: handleSessionClosed
  });

  const handleLandingSuccess = (result: LandingSuccess) => {
    setAuth({ sessionId: result.sessionId, participantId: result.participantId, displayName: result.displayName });
    setSession(result.state);
    setError("");
    setNotice("");
  };

  const leaveSession = () => {
    if (auth) {
      send({ type: "session:leave", payload: {} });
    }
    setAuth(null);
    setSession(null);
    setError("");
  };

  const closeSession = () => {
    if (auth) {
      send({ type: "session:close", payload: {} });
    }
  };

  const sendEvent = (event: ClientEvent) => send(event);

  if (!auth || !session) {
    return (
      <>
        <LandingScreen
          apiBase={apiBase}
          onSuccess={handleLandingSuccess}
          error={error || notice}
          onError={setError}
        />
        <Toast message={status === "idle" ? "" : ""} onDismiss={() => setError("")} />
      </>
    );
  }

  const me = session.participants.find((participant) => participant.id === auth.participantId);
  const isHost = Boolean(me?.isHost);
  const inGame = Boolean(session.activeGame);

  return (
    <div className="app-shell">
      <TopBar
        sessionName={session.sessionName}
        joinCode={session.joinCode}
        status={status}
        onLeave={leaveSession}
        onCloseSession={isHost ? closeSession : undefined}
      />
      <main className="app-main">
        {inGame ? (
          <GameScreen
            session={session}
            currentParticipantId={auth.participantId}
            isHost={isHost}
            send={sendEvent}
            apiBase={apiBase}
          />
        ) : (
          <LobbyScreen
            session={session}
            currentParticipantId={auth.participantId}
            isHost={isHost}
            send={sendEvent}
          />
        )}
      </main>
      <Toast message={error} onDismiss={() => setError("")} />
    </div>
  );
}
