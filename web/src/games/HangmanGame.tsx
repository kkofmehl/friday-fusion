import { FormEvent, useEffect, useRef, useState } from "react";
import type { ClientEvent, SessionState } from "../../../shared/contracts";
import { TurnOrderPanel } from "./TurnOrderPanel";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

const Gallows = ({ wrongs, max }: { wrongs: number; max: number }): JSX.Element => {
  const stage = Math.min(wrongs, max);
  return (
    <svg className="gallows" viewBox="0 0 140 160" aria-label={`Hangman, ${stage} of ${max} wrong`}>
      <line x1="10" y1="150" x2="120" y2="150" className="gallows-ground" />
      <line x1="30" y1="150" x2="30" y2="15" className="gallows-post" />
      <line x1="30" y1="15" x2="90" y2="15" className="gallows-beam" />
      <line x1="90" y1="15" x2="90" y2="30" className="gallows-rope" />
      {stage >= 1 && <circle cx="90" cy="40" r="10" className="gallows-part" />}
      {stage >= 2 && <line x1="90" y1="50" x2="90" y2="95" className="gallows-part" />}
      {stage >= 3 && <line x1="90" y1="60" x2="75" y2="80" className="gallows-part" />}
      {stage >= 4 && <line x1="90" y1="60" x2="105" y2="80" className="gallows-part" />}
      {stage >= 5 && <line x1="90" y1="95" x2="75" y2="120" className="gallows-part" />}
      {stage >= 6 && <line x1="90" y1="95" x2="105" y2="120" className="gallows-part" />}
    </svg>
  );
};

export function HangmanGame({
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
  const [word, setWord] = useState("");
  const [solveOpen, setSolveOpen] = useState(false);
  const [solveGuess, setSolveGuess] = useState("");
  const [solveFeedback, setSolveFeedback] = useState<"awaiting" | "wrong" | null>(null);
  const lastWrongCountRef = useRef<number | null>(null);

  if (session.gameState?.type !== "hangman") return null;
  const state = session.gameState.state;
  const isCreator = state.puzzleCreatorId === currentParticipantId;
  const creator = session.participants.find((p) => p.id === state.puzzleCreatorId);
  const isTurnMode = state.mode === "turns";
  // Mirrors the server safety net: if the turn pointer is unset, any non-creator
  // can claim the first turn (prevents the keyboard from being permanently
  // locked when the host set the word before any guessers joined).
  const turnUnassigned = isTurnMode && state.currentTurnId === null;
  const isMyTurn =
    !isTurnMode
    || state.currentTurnId === currentParticipantId
    || (turnUnassigned && !isCreator);
  const canGuess = state.status === "inProgress" && !isCreator && isMyTurn;
  const currentGuesser = isTurnMode
    ? session.participants.find((p) => p.id === state.currentTurnId)
    : undefined;

  // Track the solver's wrong-solve feedback. When we send a solve we flip to
  // "awaiting"; when the next state shows a higher wrongGuessCount (and the
  // round is still in progress) we flip to "wrong"; a "won" clears it.
  useEffect(() => {
    if (solveFeedback !== "awaiting") return;
    if (state.status === "won") {
      setSolveFeedback(null);
      setSolveGuess("");
      setSolveOpen(false);
      return;
    }
    if (lastWrongCountRef.current !== null && state.wrongGuessCount > lastWrongCountRef.current) {
      setSolveFeedback("wrong");
    }
  }, [state.status, state.wrongGuessCount, solveFeedback]);

  const submitWord = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = word.trim();
    if (!trimmed) return;
    send({ type: "hangman:setWord", payload: { word: trimmed } });
    setWord("");
  };

  const submitSolve = (event: FormEvent) => {
    event.preventDefault();
    if (!canGuess) return;
    const trimmed = solveGuess.trim();
    if (!trimmed) return;
    lastWrongCountRef.current = state.wrongGuessCount;
    setSolveFeedback("awaiting");
    send({ type: "hangman:solve", payload: { guess: trimmed } });
  };

  const cancelSolve = () => {
    setSolveOpen(false);
    setSolveGuess("");
    setSolveFeedback(null);
  };

  const openSolve = () => {
    if (!canGuess) return;
    setSolveFeedback(null);
    setSolveOpen(true);
  };

  const guessLetter = (letter: string) => {
    if (!canGuess) return;
    if (state.guessedLetters.includes(letter)) return;
    send({ type: "hangman:guessLetter", payload: { letter } });
  };

  const renderWord = (): JSX.Element => (
    <div className="hangman-word">
      {state.maskedWord.split("").map((char, index) => (
        <span key={`${char}-${index}`} className={`hangman-letter${char === "_" ? " hangman-letter-blank" : ""}`}>
          {char === "_" ? "" : char}
        </span>
      ))}
    </div>
  );

  return (
    <section className="card game-card-hangman">
      <header className="card-head">
        <h2>Hangman</h2>
        <div className="card-head-tags">
          <span className="pill pill-muted" title="Game mode">
            {isTurnMode ? "Take turns" : "Team vs host"}
          </span>
          <span className={`pill pill-status pill-status-${state.status}`}>
            {state.status === "waitingForWord" && "Waiting for word"}
            {state.status === "inProgress" && "In progress"}
            {state.status === "won" && "Guessers win!"}
            {state.status === "lost" && "Creator wins"}
          </span>
        </div>
      </header>

      {isTurnMode && state.status === "inProgress" && (
        <p className="hangman-turn">
          {isMyTurn ? (
            <>
              <strong>Your turn</strong> — pick a letter.
            </>
          ) : (
            <>
              Waiting on <strong>{currentGuesser?.displayName ?? "the next guesser"}</strong>...
            </>
          )}
        </p>
      )}

      {isTurnMode && state.status !== "waitingForWord" && (
        <TurnOrderPanel
          session={session}
          currentParticipantId={currentParticipantId}
          puzzleCreatorId={state.puzzleCreatorId}
          currentTurnId={state.currentTurnId}
          isHost={isHost}
          send={send}
        />
      )}

      <div className="hangman-layout">
        <div className="hangman-art">
          <Gallows wrongs={state.wrongGuessCount} max={state.maxWrongGuesses} />
          <p className="hangman-wrong">
            Wrong guesses: <strong>{state.wrongGuessCount}</strong> / {state.maxWrongGuesses}
          </p>
        </div>

        <div className="hangman-play">
          {state.status === "waitingForWord" ? (
            isCreator ? (
              <form onSubmit={submitWord} className="hangman-setword">
                <label htmlFor="hangman-word">Your secret word or phrase</label>
                <input
                  id="hangman-word"
                  value={word}
                  onChange={(event) => setWord(event.target.value)}
                  placeholder="e.g. FRIDAY FUSION"
                  minLength={2}
                  maxLength={40}
                  required
                  autoFocus
                />
                <button type="submit" className="btn btn-primary">
                  Set word
                </button>
              </form>
            ) : (
              <p className="hangman-waiting">
                Waiting for <strong>{creator?.displayName ?? "the creator"}</strong> to pick a word...
              </p>
            )
          ) : (
            <>
              {renderWord()}
              <div className="hangman-keyboard" role="group" aria-label="Letter keyboard">
                {ALPHABET.map((letter) => {
                  const guessed = state.guessedLetters.includes(letter);
                  const hit = guessed && state.maskedWord.toUpperCase().includes(letter);
                  const miss = guessed && !hit;
                  return (
                    <button
                      key={letter}
                      type="button"
                      className={`key${guessed ? " key-used" : ""}${hit ? " key-hit" : ""}${miss ? " key-miss" : ""}`}
                      onClick={() => guessLetter(letter)}
                      disabled={!canGuess || guessed}
                    >
                      {letter}
                    </button>
                  );
                })}
              </div>
              {state.status === "inProgress" && !isCreator && (
                <div className="hangman-solve">
                  {solveOpen ? (
                    <form className="hangman-solve-form" onSubmit={submitSolve}>
                      <label htmlFor="hangman-solve-input" className="hangman-solve-label">
                        Type the full answer (spaces and punctuation don't matter):
                      </label>
                      <div className="hangman-solve-row">
                        <input
                          id="hangman-solve-input"
                          className="hangman-solve-input"
                          value={solveGuess}
                          onChange={(event) => {
                            setSolveGuess(event.target.value);
                            if (solveFeedback === "wrong") setSolveFeedback(null);
                          }}
                          autoFocus
                          disabled={!canGuess || solveFeedback === "awaiting"}
                          maxLength={60}
                          placeholder="e.g. George Washington"
                        />
                        <button
                          type="submit"
                          className="btn btn-primary"
                          disabled={!canGuess || !solveGuess.trim() || solveFeedback === "awaiting"}
                        >
                          {solveFeedback === "awaiting" ? "Checking..." : "Submit"}
                        </button>
                        <button type="button" className="btn btn-ghost" onClick={cancelSolve}>
                          Cancel
                        </button>
                      </div>
                      {solveFeedback === "wrong" && (
                        <p className="hangman-solve-wrong" role="status">
                          Not correct. That counts as a wrong guess.
                        </p>
                      )}
                    </form>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-primary hangman-solve-btn"
                      onClick={openSolve}
                      disabled={!canGuess}
                      title={isTurnMode && !isMyTurn ? "Wait for your turn" : "Guess the full word or phrase"}
                    >
                      Solve
                    </button>
                  )}
                </div>
              )}
              {(state.status === "won" || state.status === "lost") && (
                <div className={`hangman-result hangman-result-${state.status}`}>
                  <h3>
                    {state.status === "won" ? "You cracked it!" : "Out of chances."}
                  </h3>
                  <p>The word was <strong>{state.revealedWord ?? state.maskedWord}</strong>.</p>
                  {isHost && (
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => send({ type: "game:start", payload: { game: "hangman" } })}
                    >
                      Play another round
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
