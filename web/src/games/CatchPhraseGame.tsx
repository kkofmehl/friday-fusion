import { useEffect, useMemo, useRef, useState } from "react";
import type { ClientEvent, SessionState } from "../../../shared/contracts";
import { activeParticipants } from "../utils/participants";
import {
  CATCH_PHRASE_SIGNAL_INTERVAL_MS,
  catchPhraseSignalStage,
  type CatchPhraseSignalStage
} from "./catchPhraseSignals";

const CATCH_PHRASE_SOUND_STORAGE_KEY = "fridayFusion.catchPhraseBeepSound";

function displayNameFor(session: SessionState, participantId: string): string {
  return session.participants.find((participant) => participant.id === participantId)?.displayName ?? "Someone";
}

function readStoredCatchPhraseSoundEnabled(): boolean {
  if (typeof window === "undefined") {
    return true;
  }
  try {
    return window.localStorage.getItem(CATCH_PHRASE_SOUND_STORAGE_KEY) !== "0";
  } catch {
    return true;
  }
}

export function CatchPhraseGame({
  session,
  currentParticipantId,
  isHost,
  send
}: {
  session: SessionState;
  currentParticipantId: string;
  isHost: boolean;
  send: (event: ClientEvent) => void;
}): JSX.Element | null {
  const gs = session.gameState;
  if (!gs || gs.type !== "catchPhrase") {
    return null;
  }
  const state = gs.state;
  const [draftTeamA, setDraftTeamA] = useState<string[]>(state.status === "teamSetup" ? [...state.teamAIds] : []);
  const [draftTeamB, setDraftTeamB] = useState<string[]>(state.status === "teamSetup" ? [...state.teamBIds] : []);
  const [uiClock, setUiClock] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => readStoredCatchPhraseSoundEnabled());
  const soundEnabledRef = useRef(soundEnabled);
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
    try {
      window.localStorage.setItem(CATCH_PHRASE_SOUND_STORAGE_KEY, soundEnabled ? "1" : "0");
    } catch {
      // ignore quota / private mode
    }
  }, [soundEnabled]);

  useEffect(() => {
    if (state.status === "teamSetup") {
      setDraftTeamA([...state.teamAIds]);
      setDraftTeamB([...state.teamBIds]);
    }
  }, [state]);

  const ensureAudioContext = (): AudioContext | null => {
    if (typeof window === "undefined" || typeof window.AudioContext === "undefined") {
      return null;
    }
    if (!audioContextRef.current) {
      audioContextRef.current = new window.AudioContext();
    }
    return audioContextRef.current;
  };

  const unlockAudio = (): void => {
    const context = ensureAudioContext();
    if (!context) {
      return;
    }
    if (context.state === "suspended") {
      void context.resume().catch(() => {});
    }
  };

  const playBeep = (): void => {
    if (!soundEnabledRef.current) {
      return;
    }
    const context = ensureAudioContext();
    if (!context) {
      return;
    }
    if (context.state !== "running") {
      return;
    }
    try {
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = "sine";
      osc.frequency.value = 900;
      gain.gain.value = 0.04;
      osc.connect(gain);
      gain.connect(context.destination);
      const start = context.currentTime;
      osc.start(start);
      osc.stop(start + 0.06);
    } catch {
      // Audio is optional.
    }
  };

  const isLiveRound = state.status === "playing" && state.roundPhase === "live";
  const liveSlowPhaseEndsAt = isLiveRound ? state.slowPhaseEndsAt : 0;
  const liveMediumPhaseEndsAt = isLiveRound ? state.mediumPhaseEndsAt : 0;

  const signalStage: CatchPhraseSignalStage = useMemo(() => {
    if (!isLiveRound) {
      return "slow";
    }
    return catchPhraseSignalStage(Date.now(), liveSlowPhaseEndsAt, liveMediumPhaseEndsAt);
  }, [isLiveRound, liveSlowPhaseEndsAt, liveMediumPhaseEndsAt, uiClock]);

  useEffect(() => {
    if (!isLiveRound) {
      return;
    }
    const id = window.setInterval(() => {
      setUiClock((c) => c + 1);
    }, 250);
    return () => window.clearInterval(id);
  }, [isLiveRound, liveSlowPhaseEndsAt, liveMediumPhaseEndsAt]);

  useEffect(() => {
    if (!isLiveRound) {
      return;
    }
    let active = true;
    let timeoutId: number | null = null;

    const pulse = (): void => {
      if (!active) {
        return;
      }
      const stage = catchPhraseSignalStage(Date.now(), liveSlowPhaseEndsAt, liveMediumPhaseEndsAt);
      playBeep();
      timeoutId = window.setTimeout(pulse, CATCH_PHRASE_SIGNAL_INTERVAL_MS[stage]);
    };

    pulse();
    return () => {
      active = false;
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [isLiveRound, liveSlowPhaseEndsAt, liveMediumPhaseEndsAt]);

  useEffect(() => {
    return () => {
      if (audioContextRef.current) {
        void audioContextRef.current.close().catch(() => {});
      }
    };
  }, []);

  const setPlayerTeam = (participantId: string, team: "A" | "B" | "none"): void => {
    setDraftTeamA((ids) => ids.filter((id) => id !== participantId));
    setDraftTeamB((ids) => ids.filter((id) => id !== participantId));
    if (team === "A") {
      setDraftTeamA((ids) => [...ids, participantId]);
    } else if (team === "B") {
      setDraftTeamB((ids) => [...ids, participantId]);
    }
  };

  if (state.status === "teamSetup") {
    if (!isHost) {
      return (
        <section className="card catchphrase-setup-card">
          <header className="card-head">
            <h2>Catch Phrase - teams</h2>
          </header>
          <p className="catchphrase-setup-lead">
            Only the host can assign teams and start the game. Stay on this screen; you will see Catch Phrase here once
            play begins.
          </p>
        </section>
      );
    }
    const roster = activeParticipants(session.participants);
    return (
      <section className="card catchphrase-setup-card">
        <header className="card-head">
          <h2>Catch Phrase - teams</h2>
        </header>
        <p className="catchphrase-setup-lead">
          Set two teams with at least two players each. Keep seating alternating between teams for the best pass flow.
          Starting the game always saves your current team picks first (you can still use Save teams to checkpoint early).
        </p>
        <ul className="pictionary-team-picks">
          {roster.map((participant) => {
            const onA = draftTeamA.includes(participant.id);
            const onB = draftTeamB.includes(participant.id);
            return (
              <li key={participant.id} className="pictionary-team-pick-row">
                <span className="pictionary-team-pick-name">{participant.displayName}</span>
                <div className="pictionary-team-pick-actions">
                  <label className="pictionary-team-radio">
                    <input
                      type="radio"
                      name={`catchphrase-team-${participant.id}`}
                      checked={onA}
                      onChange={() => setPlayerTeam(participant.id, "A")}
                    />
                    Team A
                  </label>
                  <label className="pictionary-team-radio">
                    <input
                      type="radio"
                      name={`catchphrase-team-${participant.id}`}
                      checked={onB}
                      onChange={() => setPlayerTeam(participant.id, "B")}
                    />
                    Team B
                  </label>
                  <label className="pictionary-team-radio">
                    <input
                      type="radio"
                      name={`catchphrase-team-${participant.id}`}
                      checked={!onA && !onB}
                      onChange={() => setPlayerTeam(participant.id, "none")}
                    />
                    Unassigned
                  </label>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="catchphrase-team-summary">
          <span>
            <strong>Team A:</strong> {draftTeamA.length}
          </span>
          <span>
            <strong>Team B:</strong> {draftTeamB.length}
          </span>
        </div>
        <div className="pictionary-setup-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() =>
              send({
                type: "catchPhrase:setTeams",
                payload: { teamAIds: draftTeamA, teamBIds: draftTeamB }
              })
            }
          >
            Save teams
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              send({
                type: "catchPhrase:setTeams",
                payload: { teamAIds: draftTeamA, teamBIds: draftTeamB }
              });
              send({ type: "catchPhrase:beginPlay", payload: {} });
            }}
          >
            Start Catch Phrase
          </button>
        </div>
      </section>
    );
  }

  if (state.status === "finished") {
    const winnerLabel = state.winnerTeam === "A" ? "Team A" : "Team B";
    return (
      <section className="card catchphrase-card">
        <header className="card-head">
          <h2>Catch Phrase complete</h2>
        </header>
        <p className="catchphrase-winner">
          {winnerLabel} wins ({state.teamScores.A} - {state.teamScores.B})
        </p>
      </section>
    );
  }

  const holderName = displayNameFor(session, state.holderId);
  const isHolder = currentParticipantId === state.holderId;
  const teamANameList = state.teamAIds.map((id) => displayNameFor(session, id)).join(", ");
  const teamBNameList = state.teamBIds.map((id) => displayNameFor(session, id)).join(", ");
  const canStartRound = state.roundPhase === "awaitingRoundStart" && isHolder;
  const phrase = state.roundPhase === "live" ? state.myPhrase : null;

  const handleStartRound = (): void => {
    unlockAudio();
    send({ type: "catchPhrase:startRound", payload: {} });
  };
  const handlePass = (): void => {
    unlockAudio();
    send({ type: "catchPhrase:guessed", payload: {} });
  };

  return (
    <section className="card catchphrase-card catchphrase-card--playing">
      <header className="card-head">
        <h2>Catch Phrase</h2>
        <div className="catchphrase-card-head-right">
          <div className="catchphrase-score">
            <span>Team A: {state.teamScores.A}</span>
            <span>Team B: {state.teamScores.B}</span>
          </div>
          <label className="catchphrase-sound-toggle">
            <input
              type="checkbox"
              checked={soundEnabled}
              onChange={(event) => setSoundEnabled(event.target.checked)}
            />
            Beep sound
          </label>
        </div>
      </header>

      <div
        className={`catchphrase-play-surface game-area-turn${isHolder ? " game-area-turn--active" : ""}`}
        aria-label={isHolder ? "Catch Phrase — your turn with the device" : "Catch Phrase"}
      >
        <p className="catchphrase-meta">
          Device holder: <strong>{holderName}</strong>
        </p>
        <p className="catchphrase-meta catchphrase-meta-subtle">
          Team A: {teamANameList || "none"} | Team B: {teamBNameList || "none"}
        </p>

        <div className="catchphrase-signal-row" aria-live="polite">
          <span className={`catchphrase-signal catchphrase-signal--${signalStage}`} aria-hidden />
          <span className="catchphrase-signal-label">
            {state.roundPhase === "live"
              ? signalStage === "slow"
                ? "Phase 1 — slow beeps"
                : signalStage === "medium"
                  ? "Phase 2 — medium beeps"
                  : "Phase 3 — fast beeps"
              : "waiting for holder tap"}
          </span>
        </div>

        {state.roundPhase === "awaitingRoundStart" ? (
          <p className="catchphrase-help">
            {isHolder
              ? "Your turn. Tap start to reveal the next word and begin the hidden timer."
              : `Waiting for ${holderName} to tap start.`}
          </p>
        ) : (
          <div className="catchphrase-phrase-wrap">
            <p className="catchphrase-help">
              {isHolder
                ? "Give clues to your team. When they get it, pass immediately."
                : `Listen for clues. ${holderName} is currently holding the device.`}
            </p>
            <p className={`catchphrase-phrase${phrase ? "" : " is-hidden"}`}>
              {phrase ?? "Word hidden"}
            </p>
          </div>
        )}

        <div className="catchphrase-actions">
          {state.roundPhase === "awaitingRoundStart" ? (
            <button type="button" className="btn btn-primary" disabled={!canStartRound} onClick={handleStartRound}>
              Start round
            </button>
          ) : (
            isHolder && (
              <button type="button" className="btn btn-primary catchphrase-pass-wide" onClick={handlePass}>
                Got it — pass
              </button>
            )
          )}
        </div>
        <p className="mode-option-hint">
          Each buzz is three random-length phases (slow, then medium, then fast beeps). Passing keeps the same phase
          clock; only a buzz starts a new three-phase timer. On buzz, each player on the non-holding team gets +1 point
          and that team gets +1 team score.
        </p>
      </div>
    </section>
  );
}
