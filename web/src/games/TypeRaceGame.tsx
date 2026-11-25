import { useEffect, useRef, useState, type JSX } from "react";
import {
  TYPE_RACE_COUNTDOWN_MS,
  type ClientEvent,
  type SessionState
} from "../../../shared/contracts";
import { PlayerName } from "../components/PlayerName";
import { activeParticipants } from "../utils/participants";

function formatElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  const tenths = Math.floor((Math.max(0, ms) % 1000) / 100);
  return `${m}:${s.toString().padStart(2, "0")}.${tenths}`;
}

function formatAccuracy(accuracy: number): string {
  return `${Math.round(accuracy * 1000) / 10}%`;
}

function formatWpm(wordsPerMinute: number): string {
  return `${Math.round(wordsPerMinute * 10) / 10} WPM`;
}

export function TypeRaceGame({
  session,
  currentParticipantId,
  isHost,
  canPlay,
  send
}: {
  session: SessionState;
  currentParticipantId: string;
  isHost: boolean;
  canPlay: boolean;
  send: (event: ClientEvent) => void;
}): JSX.Element | null {
  const game = session.gameState?.type === "typeRace" ? session.gameState : null;
  const state = game?.state;
  const [draft, setDraft] = useState("");
  const [, setTick] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (state?.status !== "countdown" && state?.status !== "racing") {
      return;
    }
    const id = window.setInterval(() => setTick((t) => t + 1), 100);
    return () => window.clearInterval(id);
  }, [state?.status]);

  useEffect(() => {
    setDraft("");
  }, [state?.status, state && "startedAt" in state ? state.startedAt : null]);

  const myPublic = state?.players[currentParticipantId];
  const canType = Boolean(
    canPlay && state?.status === "racing" && myPublic?.status === "racing"
  );

  useEffect(() => {
    if (!canType) {
      return;
    }
    const node = inputRef.current;
    if (!node) {
      return;
    }
    node.focus();
    const selection = node.value.length;
    node.setSelectionRange(selection, selection);
  }, [canType, state?.status, state && "startedAt" in state ? state.startedAt : null]);

  if (!state) {
    return null;
  }

  const roster = activeParticipants(session.participants);

  if (state.status === "idle") {
    return (
      <section className="card type-race-game play-stage">
        <header className="card-head">
          <h2>Type Race</h2>
          <span className="pill pill-status">Idle</span>
        </header>
        <p className="type-race-sub">
          Everyone gets the same paragraph after a countdown. Type as fast and accurately as you can—no live
          feedback—then click Finished. Each error adds a 0.5s penalty. Fastest adjusted time wins 1 Friday
          Fusion point.
        </p>
        {isHost ? (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => send({ type: "typeRace:startRound", payload: {} })}
          >
            Start race
          </button>
        ) : (
          <p className="mode-option-hint">Waiting for the host to start the race…</p>
        )}
      </section>
    );
  }

  if (state.status === "results") {
    const winnerSet = new Set(state.winnerIds);
    return (
      <section className="card type-race-game play-stage">
        <header className="card-head">
          <h2>Type Race</h2>
          <span className="pill pill-status">Results</span>
        </header>
        <p className="type-race-winner" aria-live="polite">
          {state.winnerIds.length === 0 ? (
            "No finishers this race."
          ) : state.winnerIds.length === 1 ? (
            <>
              Winner:{" "}
              <PlayerName
                participantId={state.winnerIds[0]!}
                participants={session.participants}
                size="sm"
              />
            </>
          ) : (
            <>
              Tied winners:{" "}
              {state.winnerIds.map((id, index) => (
                <span key={id}>
                  {index > 0 ? ", " : ""}
                  <PlayerName participantId={id} participants={session.participants} size="sm" />
                </span>
              ))}
            </>
          )}
        </p>
        <blockquote className="type-race-prompt type-race-prompt--results" aria-label="Race prompt">
          {state.prompt.text}
        </blockquote>
        <section className="type-race-summary" aria-label="Race rankings">
          <h3>Rankings</h3>
          <ol className="type-race-standings">
            {state.standings.map((row) => (
              <li
                key={row.participantId}
                className={`type-race-standing-row${winnerSet.has(row.participantId) ? " is-winner" : ""}`}
              >
                <span className="type-race-standing-place">{row.place}.</span>
                <span className="type-race-standing-name">
                  <PlayerName
                    participantId={row.participantId}
                    participants={session.participants}
                    size="sm"
                  />
                  {winnerSet.has(row.participantId) ? " ★" : ""}
                </span>
                <span className="type-race-standing-status">
                  {row.finished ? "Finished" : "DNF"}
                </span>
                <span className="type-race-standing-time">
                  {row.finished ? formatElapsed(row.elapsedMs) : "—"}
                </span>
                <span className="type-race-standing-errors">
                  {row.finished ? `${row.errors} err` : "—"}
                </span>
                <span className="type-race-standing-penalty">
                  {row.finished ? `+${formatElapsed(row.penaltyMs)}` : "—"}
                </span>
                <span className="type-race-standing-adjusted">
                  {row.finished ? formatElapsed(row.adjustedMs) : "—"}
                </span>
                <span className="type-race-standing-accuracy">
                  {row.finished ? formatAccuracy(row.accuracy) : "—"}
                </span>
                <span className="type-race-standing-wpm">
                  {row.finished ? formatWpm(row.wordsPerMinute) : "—"}
                </span>
                <span className="type-race-standing-pts">+{row.ffPoints} FF</span>
              </li>
            ))}
          </ol>
        </section>
        {isHost ? (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => send({ type: "typeRace:startRound", payload: {} })}
          >
            Start next race
          </button>
        ) : (
          <p className="mode-option-hint">Waiting for the host to start another race…</p>
        )}
      </section>
    );
  }

  const isCountdown = state.status === "countdown";
  const msLeft = isCountdown ? Math.max(0, state.countdownEndsAt - Date.now()) : 0;
  const countdownSeconds = Math.min(3, Math.ceil(msLeft / 1000) || 1);
  const countdownDisplay = msLeft <= 0 ? "Go!" : String(countdownSeconds);
  const elapsedMs = !isCountdown ? Math.max(0, Date.now() - state.startedAt) : 0;
  const others = roster.filter((p) => p.id !== currentParticipantId);
  const showInput = myPublic?.status !== "finished" && myPublic?.status !== "dnf";

  return (
    <section
      className={`card type-race-game play-stage${isCountdown ? " type-race-game--countdown" : ""}`}
    >
      <header className="card-head">
        <h2>Type Race</h2>
        <span className="pill pill-status">
          {isCountdown ? "Countdown" : `Racing · ${formatElapsed(elapsedMs)}`}
        </span>
      </header>

      {isCountdown ? (
        <>
          <p className="type-race-countdown" aria-live="polite">
            {countdownDisplay}
          </p>
          <p className="type-race-sub">
            Get ready — {Math.round(TYPE_RACE_COUNTDOWN_MS / 1000)}-second countdown. Read the prompt
            below.
          </p>
        </>
      ) : null}

      <blockquote className="type-race-prompt" aria-label="Race prompt">
        {state.prompt.text}
      </blockquote>

      {myPublic?.status === "finished" ? (
        <p className="type-race-done-banner" aria-live="polite">
          Finished! Waiting for everyone else…
        </p>
      ) : myPublic?.status === "dnf" ? (
        <p className="type-race-done-banner" aria-live="polite">
          Race ended before you finished.
        </p>
      ) : showInput ? (
        <>
          <label className="type-race-input-label" htmlFor="type-race-input">
            Type the paragraph
          </label>
          <textarea
            id="type-race-input"
            ref={inputRef}
            className="type-race-input"
            value={draft}
            disabled={!canType}
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            rows={8}
            onChange={(event) => setDraft(event.target.value)}
            onPaste={(event) => event.preventDefault()}
            onDrop={(event) => event.preventDefault()}
          />
          <button
            type="button"
            className="btn btn-primary type-race-finish"
            disabled={!canType}
            onClick={() => send({ type: "typeRace:finish", payload: { text: draft } })}
          >
            Finished
          </button>
        </>
      ) : null}

      {!isCountdown ? (
        <ul className="type-race-roster" aria-label="Other players">
          {others.map((p) => {
            const status = state.players[p.id]?.status ?? "racing";
            return (
              <li key={p.id} className={`type-race-roster-item is-${status}`}>
                <PlayerName participantId={p.id} participants={session.participants} size="sm" />
                <span className="type-race-roster-status">
                  {status === "finished" ? "Finished" : status === "dnf" ? "DNF" : "Typing…"}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}

      {!isCountdown && isHost ? (
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => send({ type: "typeRace:endRace", payload: {} })}
        >
          End race
        </button>
      ) : null}
    </section>
  );
}
