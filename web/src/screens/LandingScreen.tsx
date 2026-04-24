import { FormEvent, useEffect, useState } from "react";
import type { SessionState } from "../../../shared/contracts";

type ActiveSession = {
  sessionId: string;
  sessionName: string;
  joinCode: string;
  participantCount: number;
};

export type LandingSuccess = {
  sessionId: string;
  participantId: string;
  displayName: string;
  state: SessionState;
};

export function LandingScreen({
  apiBase,
  onSuccess,
  error,
  onError
}: {
  apiBase: string;
  onSuccess: (result: LandingSuccess) => void;
  error: string;
  onError: (message: string) => void;
}): JSX.Element {
  const [mode, setMode] = useState<"create" | "join">("create");
  const [sessionName, setSessionName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [activeSessions, setActiveSessions] = useState<ActiveSession[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`${apiBase}/api/active-sessions`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load active sessions.");
        return (await response.json()) as ActiveSession[];
      })
      .then((sessions) => {
        if (!cancelled) setActiveSessions(sessions);
      })
      .catch(() => {
        if (!cancelled) setActiveSessions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [apiBase]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    onError("");
    setSubmitting(true);
    try {
      if (mode === "join") {
        const response = await fetch(`${apiBase}/api/sessions/join`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ joinCode: joinCode.trim().toUpperCase(), displayName: displayName.trim() })
        });
        if (!response.ok) {
          throw new Error("Could not join session. Check the code and try again.");
        }
        const payload = (await response.json()) as {
          sessionId: string;
          participantId: string;
          state: SessionState;
        };
        onSuccess({ ...payload, displayName: displayName.trim() });
        return;
      }

      const response = await fetch(`${apiBase}/api/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: displayName.trim(),
          sessionName: sessionName.trim() || undefined
        })
      });
      if (!response.ok) {
        throw new Error("Could not create session. Try a different name.");
      }
      const payload = (await response.json()) as {
        sessionId: string;
        participantId: string;
        state: SessionState;
      };
      onSuccess({ ...payload, displayName: displayName.trim() });
    } catch (requestError) {
      onError(requestError instanceof Error ? requestError.message : "Unable to continue.");
    } finally {
      setSubmitting(false);
    }
  };

  const pickActive = (code: string) => {
    setMode("join");
    setJoinCode(code);
  };

  return (
    <main className="landing-shell">
      <section className="landing-card">
        <div className="landing-brand">
          <span className="landing-logo">FF</span>
          <h1>Friday Fusion</h1>
          <p className="landing-tagline">Realtime team games for your crew.</p>
        </div>

        <div className="segmented" role="tablist" aria-label="Create or join">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "create"}
            className={`segmented-option${mode === "create" ? " is-active" : ""}`}
            onClick={() => setMode("create")}
          >
            Create session
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "join"}
            className={`segmented-option${mode === "join" ? " is-active" : ""}`}
            onClick={() => setMode("join")}
          >
            Join session
          </button>
        </div>

        {error && <p className="inline-error">{error}</p>}

        <form onSubmit={handleSubmit} className="landing-form">
          <label htmlFor="display-name">Your display name</label>
          <input
            id="display-name"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="e.g. Alex"
            maxLength={32}
            required
          />

          {mode === "create" ? (
            <>
              <label htmlFor="session-name">Session name (optional)</label>
              <input
                id="session-name"
                value={sessionName}
                onChange={(event) => setSessionName(event.target.value)}
                placeholder="Friday Crew"
                maxLength={40}
              />
              <p className="landing-hint">We'll use a word-code based on the name, or make one up for you.</p>
            </>
          ) : (
            <>
              <label htmlFor="join-code">Session code</label>
              <input
                id="join-code"
                value={joinCode}
                onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                placeholder="BRIGHT-OTTER"
                required
                autoCapitalize="characters"
              />
            </>
          )}

          <button type="submit" className="btn btn-primary btn-lg" disabled={submitting}>
            {submitting ? "Working..." : mode === "create" ? "Create session" : "Join session"}
          </button>
        </form>

        {activeSessions.length > 0 && (
          <div className="landing-active">
            <h2>Active sessions</h2>
            <ul className="landing-active-list">
              {activeSessions.map((session) => (
                <li key={session.sessionId}>
                  <button
                    type="button"
                    className="landing-active-item"
                    onClick={() => pickActive(session.joinCode)}
                  >
                    <span className="landing-active-name">{session.sessionName}</span>
                    <span className="landing-active-meta">
                      {session.participantCount} {session.participantCount === 1 ? "player" : "players"} · {session.joinCode}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </main>
  );
}
