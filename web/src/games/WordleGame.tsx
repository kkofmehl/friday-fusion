import { useEffect, useMemo, useState, type JSX } from "react";
import {
  WORDLE_COUNTDOWN_MS,
  WORDLE_MAX_GUESSES,
  WORDLE_WORD_LENGTH,
  type ClientEvent,
  type SessionState,
  type WordleTile
} from "../../../shared/contracts";
import { compareWordleResults } from "../../../shared/wordleLogic";
import { PlayerName } from "../components/PlayerName";
import { activeParticipants } from "../utils/participants";

const KEYBOARD_ROWS = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"] as const;

function formatElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function bestKeyState(
  a: WordleTile | undefined,
  b: WordleTile
): WordleTile {
  const rank = { correct: 3, present: 2, absent: 1 } as const;
  if (!a) {
    return b;
  }
  return rank[b] > rank[a] ? b : a;
}

export function WordleGame({
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
  const game = session.gameState?.type === "wordle" ? session.gameState : null;
  const state = game?.state;
  const [draft, setDraft] = useState("");
  const [shake, setShake] = useState(false);
  const [, setTick] = useState(0);

  useEffect(() => {
    if (state?.status !== "countdown" && state?.status !== "racing") {
      return;
    }
    const id = window.setInterval(() => setTick((t) => t + 1), 250);
    return () => window.clearInterval(id);
  }, [state?.status]);

  useEffect(() => {
    setDraft("");
  }, [state?.status, state && "startedAt" in state ? state.startedAt : null]);

  const myPublic = state?.players[currentParticipantId];
  const myGuesses = state?.myGuesses ?? [];
  const canType =
    canPlay &&
    state?.status === "racing" &&
    myPublic?.status === "racing";

  const keyColors = useMemo(() => {
    const map: Record<string, WordleTile> = {};
    if (!myPublic) {
      return map;
    }
    myGuesses.forEach((guess, rowIdx) => {
      const evalRow = myPublic.evaluations[rowIdx];
      if (!evalRow) {
        return;
      }
      for (let i = 0; i < guess.length; i += 1) {
        const letter = guess[i]!.toUpperCase();
        const tile = evalRow[i]!;
        map[letter] = bestKeyState(map[letter], tile);
      }
    });
    return map;
  }, [myGuesses, myPublic]);

  const provisionalRank = useMemo(() => {
    if (!state || (state.status !== "racing" && state.status !== "roundComplete")) {
      return [];
    }
    const startedAt = "startedAt" in state ? state.startedAt : Date.now();
    const now = Date.now();
    const results = Object.entries(state.players).map(([participantId, player]) => ({
      participantId,
      solved: player.status === "solved",
      guessCount: player.guessCount,
      elapsedMs:
        player.finishedAt !== null
          ? Math.max(0, player.finishedAt - startedAt)
          : Math.max(0, now - startedAt),
      status: player.status
    }));
    return [...results].sort((a, b) => {
      if (a.status === "racing" && b.status !== "racing") {
        return 1;
      }
      if (b.status === "racing" && a.status !== "racing") {
        return -1;
      }
      if (a.status === "racing" && b.status === "racing") {
        return a.guessCount - b.guessCount;
      }
      return compareWordleResults(a, b);
    });
  }, [state]);

  const submitGuess = (guess: string) => {
    if (!canType) {
      return;
    }
    if (guess.length !== WORDLE_WORD_LENGTH) {
      setShake(true);
      window.setTimeout(() => setShake(false), 400);
      return;
    }
    send({ type: "wordle:submitGuess", payload: { guess } });
    setDraft("");
  };

  useEffect(() => {
    if (!canType) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      const key = event.key;
      if (key === "Enter") {
        event.preventDefault();
        submitGuess(draft);
        return;
      }
      if (key === "Backspace") {
        event.preventDefault();
        setDraft((prev) => prev.slice(0, -1));
        return;
      }
      if (/^[a-zA-Z]$/.test(key) && draft.length < WORDLE_WORD_LENGTH) {
        event.preventDefault();
        setDraft((prev) => (prev + key).toLowerCase().slice(0, WORDLE_WORD_LENGTH));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  if (!state) {
    return null;
  }

  const roster = activeParticipants(session.participants);
  const others = roster.filter((p) => p.id !== currentParticipantId);

  if (state.status === "idle") {
    return (
      <section className="card wordle-game">
        <header className="card-head">
          <h2>Wordle Race</h2>
          <span className="pill pill-status">Idle</span>
        </header>
        <p className="wordle-sub">
          Everyone races the same 5-letter word. Fewer guesses beat faster times. Inverse placement points
          when the round ends.
        </p>
        {isHost ? (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => send({ type: "wordle:startRound", payload: {} })}
          >
            Start race
          </button>
        ) : (
          <p className="mode-option-hint">Waiting for the host to start the race…</p>
        )}
      </section>
    );
  }

  if (state.status === "countdown") {
    const msLeft = Math.max(0, state.countdownEndsAt - Date.now());
    const seconds = Math.min(3, Math.ceil(msLeft / 1000) || 1);
    const display = msLeft <= 0 ? "Go!" : String(seconds);
    return (
      <section className="card wordle-game wordle-game--countdown">
        <header className="card-head">
          <h2>Wordle Race</h2>
          <span className="pill pill-status">Countdown</span>
        </header>
        <p className="wordle-countdown" aria-live="polite">
          {display}
        </p>
        <p className="wordle-sub">Get ready — {Math.round(WORDLE_COUNTDOWN_MS / 1000)}-second countdown.</p>
      </section>
    );
  }

  if (state.status === "roundComplete") {
    return (
      <section className="card wordle-game">
        <header className="card-head">
          <h2>Wordle Race</h2>
          <span className="pill pill-status">Round complete</span>
        </header>
        <p className="wordle-answer">
          The word was <strong>{state.answer.toUpperCase()}</strong>
        </p>
        <section className="wordle-summary" aria-label="Round rankings">
          <h3>Rankings</h3>
          <ol className="wordle-standings">
            {state.standings.map((row) => (
              <li key={row.participantId} className="wordle-standing-row">
                <span className="wordle-standing-place">{row.place}.</span>
                <span className="wordle-standing-name">
                  <PlayerName participantId={row.participantId} participants={session.participants} size="sm" />
                </span>
                <span className="wordle-standing-solved">{row.solved ? "Solved" : "Failed"}</span>
                <span className="wordle-standing-guesses">{row.guessCount} guesses</span>
                <span className="wordle-standing-time">{formatElapsed(row.elapsedMs)}</span>
                <span className="wordle-standing-pts">+{row.ffPoints} FF</span>
              </li>
            ))}
          </ol>
        </section>
        <div className="wordle-mini-grid wordle-mini-grid--summary" aria-label="Final boards">
          {roster.map((p) => {
            const board = state.players[p.id];
            if (!board) {
              return null;
            }
            return (
              <div key={p.id} className="wordle-mini">
                <div className="wordle-mini-head">
                  <PlayerName participantId={p.id} participants={session.participants} size="sm" />
                </div>
                <div className="wordle-mini-board">
                  {Array.from({ length: WORDLE_MAX_GUESSES }, (_, row) => (
                    <div key={row} className="wordle-mini-row">
                      {Array.from({ length: WORDLE_WORD_LENGTH }, (__, col) => {
                        const tile = board.evaluations[row]?.[col];
                        return (
                          <span
                            key={col}
                            className={`wordle-mini-tile${tile ? ` is-${tile}` : ""}`}
                            aria-hidden="true"
                          />
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        {isHost ? (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => send({ type: "wordle:startRound", payload: {} })}
          >
            Start next race
          </button>
        ) : (
          <p className="mode-option-hint">Waiting for the host to start another race…</p>
        )}
      </section>
    );
  }

  // racing
  const elapsedMs = Math.max(0, Date.now() - state.startedAt);
  const rows = Array.from({ length: WORDLE_MAX_GUESSES }, (_, rowIdx) => {
    const guess = myGuesses[rowIdx] ?? "";
    const evaluation = myPublic?.evaluations[rowIdx];
    const isCurrent = rowIdx === myGuesses.length && myPublic?.status === "racing";
    const letters = isCurrent ? draft.padEnd(WORDLE_WORD_LENGTH, " ") : guess.padEnd(WORDLE_WORD_LENGTH, " ");
    return { letters, evaluation, isCurrent };
  });

  return (
    <section className="card wordle-game">
      <header className="card-head">
        <h2>Wordle Race</h2>
        <span className="pill pill-status">Racing · {formatElapsed(elapsedMs)}</span>
      </header>

      <div className="wordle-layout">
        <div className="wordle-main">
          {myPublic?.status !== "racing" && (
            <p className="wordle-done-banner" aria-live="polite">
              {myPublic?.status === "solved"
                ? `Solved in ${myPublic.guessCount}! Waiting for everyone else…`
                : "Out of guesses. Waiting for everyone else…"}
            </p>
          )}
          <div
            className={`wordle-board${shake ? " is-shake" : ""}`}
            role="grid"
            aria-label="Your Wordle board"
          >
            {rows.map((row, rowIdx) => (
              <div key={rowIdx} className="wordle-row" role="row">
                {Array.from({ length: WORDLE_WORD_LENGTH }, (_, col) => {
                  const ch = row.letters[col] ?? " ";
                  const tile = row.evaluation?.[col];
                  const filled = ch.trim().length > 0;
                  return (
                    <div
                      key={col}
                      role="gridcell"
                      className={`wordle-tile${tile ? ` is-${tile}` : ""}${
                        row.isCurrent && filled ? " is-draft" : ""
                      }`}
                    >
                      {filled ? ch.toUpperCase() : ""}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="wordle-keyboard" aria-label="Keyboard">
            {KEYBOARD_ROWS.map((row) => (
              <div key={row} className="wordle-keyboard-row">
                {row === "ZXCVBNM" && (
                  <button
                    type="button"
                    className="wordle-key wordle-key--wide"
                    disabled={!canType}
                    onClick={() => submitGuess(draft)}
                  >
                    Enter
                  </button>
                )}
                {row.split("").map((letter) => {
                  const color = keyColors[letter];
                  return (
                    <button
                      key={letter}
                      type="button"
                      className={`wordle-key${color ? ` is-${color}` : ""}`}
                      disabled={!canType || draft.length >= WORDLE_WORD_LENGTH}
                      onClick={() =>
                        setDraft((prev) => (prev + letter).toLowerCase().slice(0, WORDLE_WORD_LENGTH))
                      }
                    >
                      {letter}
                    </button>
                  );
                })}
                {row === "ZXCVBNM" && (
                  <button
                    type="button"
                    className="wordle-key wordle-key--wide"
                    disabled={!canType || draft.length === 0}
                    onClick={() => setDraft((prev) => prev.slice(0, -1))}
                  >
                    ⌫
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <aside className="wordle-side">
          <div className="wordle-live-rank" aria-label="Live standings">
            <h3>Live standings</h3>
            <ol>
              {provisionalRank.map((row, idx) => (
                <li key={row.participantId}>
                  <span>{idx + 1}.</span>{" "}
                  <PlayerName
                    participantId={row.participantId}
                    participants={session.participants}
                    size="sm"
                  />{" "}
                  <span className="wordle-live-meta">
                    {row.status === "racing"
                      ? `${row.guessCount}/6`
                      : row.solved
                        ? `${row.guessCount} · ${formatElapsed(row.elapsedMs)}`
                        : `X · ${formatElapsed(row.elapsedMs)}`}
                  </span>
                </li>
              ))}
            </ol>
          </div>
          <div className="wordle-mini-grid" aria-label="Other players">
            {others.map((p) => {
              const board = state.players[p.id];
              if (!board) {
                return null;
              }
              return (
                <div key={p.id} className="wordle-mini">
                  <div className="wordle-mini-head">
                    <PlayerName participantId={p.id} participants={session.participants} size="sm" />
                    {board.status !== "racing" && (
                      <span className="wordle-mini-done">{board.status === "solved" ? "Done" : "Out"}</span>
                    )}
                  </div>
                  <div className="wordle-mini-board">
                    {Array.from({ length: WORDLE_MAX_GUESSES }, (_, row) => (
                      <div key={row} className="wordle-mini-row">
                        {Array.from({ length: WORDLE_WORD_LENGTH }, (__, col) => {
                          const tile = board.evaluations[row]?.[col];
                          return (
                            <span
                              key={col}
                              className={`wordle-mini-tile${tile ? ` is-${tile}` : ""}`}
                              aria-hidden="true"
                            />
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </aside>
      </div>
    </section>
  );
}
