import { FormEvent, useEffect, useMemo, useState } from "react";
import type { ClientEvent, SessionState, WheelOfFortuneState } from "../../../shared/contracts";
import {
  WHEEL_OF_FORTUNE_ROUNDS,
  WHEEL_OF_FORTUNE_VOWEL_COST,
  WHEEL_DEGREES_PER_WEDGE,
  isConsonant
} from "../../../shared/wheelOfFortuneLogic";
import { PlayerName } from "../components/PlayerName";
import { activeParticipants } from "../utils/participants";
import { WheelOfFortuneWheel, useSyncedWheelRotation } from "./wheelOfFortune/Wheel";
import "./wheelOfFortune/wheel.css";

const CONSONANTS = "BCDFGHJKLMNPQRSTVWXYZ".split("");
const VOWELS = "AEIOU".split("");

function BoardTile({ ch }: { ch: string }): JSX.Element {
  if (ch === "_") {
    return <span className="wof-board-char is-blank">_</span>;
  }
  return <span className="wof-board-char">{ch}</span>;
}

function Board({ masked }: { masked: string }): JSX.Element {
  const words = masked.split(" ");
  return (
    <div className="wof-board" aria-label="Puzzle board">
      {words.map((word, wordIndex) => (
        <span key={wordIndex} className="wof-board-word">
          {word.split("").map((ch, charIndex) => (
            <BoardTile key={charIndex} ch={ch} />
          ))}
        </span>
      ))}
    </div>
  );
}

function MoneyStrip({
  state,
  session,
  turnId
}: {
  state: Extract<
    WheelOfFortuneState,
    { status: "playing" | "spinning" | "bonusLetterPick" | "bonusSolve" | "finished" }
  >;
  session: SessionState;
  turnId: string | null;
}): JSX.Element {
  const roster = activeParticipants(session.participants);
  const ids = state.playerOrder.length > 0 ? state.playerOrder : roster.map((p) => p.id);
  return (
    <div className="wof-money-strip">
      {ids.map((id) => {
        const p = session.participants.find((x) => x.id === id);
        if (!p) return null;
        return (
          <div key={id} className={`wof-player-chip${turnId === id ? " is-turn" : ""}`}>
            <strong>
              <PlayerName participant={p} inline />
            </strong>
            <span>Round: ${(state.roundMoney[id] ?? 0).toLocaleString()}</span>
            <span>Banked: ${(state.bankedMoney[id] ?? 0).toLocaleString()}</span>
            {(state.freeSpinTokens[id] ?? 0) > 0 && (
              <span>Free Spin ×{state.freeSpinTokens[id]}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

const emptyCustomPuzzles = () =>
  Array.from({ length: WHEEL_OF_FORTUNE_ROUNDS + 1 }, () => ({ category: "", answer: "" }));

export function WheelOfFortuneGame({
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
  const [customPuzzles, setCustomPuzzles] = useState(emptyCustomPuzzles);
  const [solveGuess, setSolveGuess] = useState("");
  const [bonusCons, setBonusCons] = useState<string[]>([]);
  const [bonusVowel, setBonusVowel] = useState<string | null>(null);
  const [bonusGuess, setBonusGuess] = useState("");

  const state = session.gameState?.type === "wheelOfFortune" ? session.gameState.state : null;

  const restingRotation = useMemo(() => {
    if (!state) return 0;
    if (state.status === "spinning") {
      return state.finalRotationDeg;
    }
    if (state.status === "playing" && state.pendingWedgeIndex != null) {
      const idx = state.pendingWedgeIndex;
      const center = idx * WHEEL_DEGREES_PER_WEDGE + WHEEL_DEGREES_PER_WEDGE / 2;
      return 360 - center;
    }
    return 0;
  }, [state]);

  const spinning = state?.status === "spinning";
  const rotation = useSyncedWheelRotation({
    spinning: Boolean(spinning),
    spinStartedAt: spinning && state?.status === "spinning" ? state.spinStartedAt : null,
    spinEndsAt: spinning && state?.status === "spinning" ? state.spinEndsAt : null,
    finalRotationDeg: spinning && state?.status === "spinning" ? state.finalRotationDeg : null,
    restingRotationDeg: restingRotation
  });

  if (!state) return null;

  const highlightIndex =
    state.status === "playing" || state.status === "spinning"
      ? state.status === "spinning"
        ? state.targetWedgeIndex
        : state.pendingWedgeIndex
      : null;

  if (state.status === "setup") {
    return (
      <div className="wof-game play-stage">
        <h3>Custom puzzles</h3>
        <p>Enter four round puzzles and one bonus puzzle (category + answer).</p>
        {!isHost ? (
          <p>Waiting for the host to enter puzzles…</p>
        ) : (
          <form
            className="wof-setup-grid"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              send({
                type: "wheelOfFortune:setPuzzles",
                payload: { puzzles: customPuzzles }
              });
            }}
          >
            {customPuzzles.map((row, i) => (
              <div key={i} className="wof-setup-row">
                <label>
                  {i < WHEEL_OF_FORTUNE_ROUNDS ? `Round ${i + 1}` : "Bonus"}
                </label>
                <div style={{ display: "grid", gap: "0.35rem" }}>
                  <input
                    placeholder="Category"
                    value={row.category}
                    onChange={(ev) => {
                      const next = [...customPuzzles];
                      next[i] = { ...next[i]!, category: ev.target.value };
                      setCustomPuzzles(next);
                    }}
                    required
                  />
                  <input
                    placeholder="Answer"
                    value={row.answer}
                    onChange={(ev) => {
                      const next = [...customPuzzles];
                      next[i] = { ...next[i]!, answer: ev.target.value };
                      setCustomPuzzles(next);
                    }}
                    required
                  />
                </div>
              </div>
            ))}
            <button type="submit" className="btn btn-primary">
              Start game
            </button>
          </form>
        )}
      </div>
    );
  }

  if (state.status === "finished") {
    return (
      <div className="wof-game play-stage">
        <h3>Game over</h3>
        <p className="wof-outcome">{state.lastOutcome}</p>
        {state.category && <p className="wof-category">{state.category}</p>}
        {state.revealedBoard && <Board masked={state.revealedBoard} />}
        <MoneyStrip state={state} session={session} turnId={null} />
        <p>
          Friday Fusion points: banked money ÷ 100
          {state.bonusSolved ? " + bonus (players × 2)" : ""}.
        </p>
      </div>
    );
  }

  if (state.status === "bonusLetterPick" || state.status === "bonusSolve") {
    const isBonusPlayer = state.bonusPlayerId === currentParticipantId;
    const used = new Set(state.usedLetters);
    return (
      <div className="wof-game play-stage">
        <p className="wof-category">Bonus — {state.category}</p>
        <Board masked={state.maskedBoard} />
        <p className="wof-outcome">{state.lastOutcome}</p>
        <MoneyStrip state={state} session={session} turnId={state.bonusPlayerId} />
        {state.status === "bonusLetterPick" && isBonusPlayer && (
          <div>
            <p>RSTLNE are revealed. Pick 3 consonants and 1 vowel.</p>
            <p className="wof-pick-label">Consonants ({bonusCons.length}/3)</p>
            <div className="wof-letter-row">
              {CONSONANTS.map((letter) => {
                const selected = bonusCons.includes(letter);
                const disabled = used.has(letter) || (!selected && bonusCons.length >= 3);
                return (
                  <button
                    key={letter}
                    type="button"
                    className={`wof-letter${selected ? " is-selected" : ""}`}
                    aria-pressed={selected}
                    disabled={disabled}
                    onClick={() => {
                      setBonusCons((prev) =>
                        prev.includes(letter)
                          ? prev.filter((x) => x !== letter)
                          : prev.length < 3
                            ? [...prev, letter]
                            : prev
                      );
                    }}
                  >
                    {letter}
                  </button>
                );
              })}
            </div>
            <p className="wof-pick-label">Vowel</p>
            <div className="wof-letter-row">
              {VOWELS.map((letter) => {
                const selected = bonusVowel === letter;
                return (
                  <button
                    key={letter}
                    type="button"
                    className={`wof-letter${selected ? " is-selected" : ""}`}
                    aria-pressed={selected}
                    disabled={used.has(letter)}
                    onClick={() => setBonusVowel(letter)}
                  >
                    {letter}
                  </button>
                );
              })}
            </div>
            <div className="wof-actions">
              <button
                type="button"
                className="btn btn-primary"
                disabled={bonusCons.length !== 3 || !bonusVowel}
                onClick={() => {
                  if (!bonusVowel) return;
                  send({
                    type: "wheelOfFortune:bonusPickLetters",
                    payload: { consonants: bonusCons, vowel: bonusVowel }
                  });
                }}
              >
                Reveal letters
              </button>
            </div>
          </div>
        )}
        {state.status === "bonusLetterPick" && !isBonusPlayer && (
          <p>Waiting for bonus player to pick letters…</p>
        )}
        {state.status === "bonusSolve" && (
          <div>
            <p>
              Time left:{" "}
              <BonusCountdown endsAt={state.bonusEndsAt} />
            </p>
            {isBonusPlayer ? (
              <form
                className="wof-actions"
                onSubmit={(e) => {
                  e.preventDefault();
                  send({ type: "wheelOfFortune:bonusSolve", payload: { guess: bonusGuess } });
                }}
              >
                <input
                  value={bonusGuess}
                  onChange={(ev) => setBonusGuess(ev.target.value)}
                  placeholder="Solve the puzzle"
                  aria-label="Bonus solve"
                />
                <button type="submit" className="btn btn-primary" disabled={!bonusGuess.trim()}>
                  Solve
                </button>
              </form>
            ) : (
              <p>Bonus player is solving…</p>
            )}
          </div>
        )}
      </div>
    );
  }

  // playing | spinning
  const isMyTurn = state.currentTurnId === currentParticipantId;
  const used = new Set(state.usedLetters);
  const canAct = isMyTurn && state.status === "playing";
  const phase = state.phase;

  return (
    <div className="wof-game play-stage">
      <div className="wof-layout">
        <WheelOfFortuneWheel
          rotationDeg={rotation}
          spinning={spinning}
          highlightIndex={highlightIndex}
        />
        <div>
          <p className="wof-category">
            Round {state.roundIndex} — {state.category}
          </p>
          <Board masked={state.maskedBoard} />
          <p className="wof-outcome">{state.lastOutcome}</p>
          <MoneyStrip state={state} session={session} turnId={state.currentTurnId} />
          <p className="wof-used">
            Used: {state.usedLetters.length ? state.usedLetters.join(" ") : "—"}
          </p>

          {phase === "freeSpinPrompt" && isMyTurn && (
            <div className="wof-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => send({ type: "wheelOfFortune:useFreeSpin", payload: { use: true } })}
              >
                Use Free Spin
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => send({ type: "wheelOfFortune:useFreeSpin", payload: { use: false } })}
              >
                Pass
              </button>
            </div>
          )}

          {phase === "roundSolved" && (
            <div className="wof-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => send({ type: "wheelOfFortune:continue", payload: {} })}
              >
                Continue
              </button>
            </div>
          )}

          {canAct && phase === "awaitingAction" && (
            <div className="wof-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => send({ type: "wheelOfFortune:spin", payload: {} })}
              >
                Spin
              </button>
              <details className="wof-vowel-panel">
                <summary className="btn btn-secondary">Buy vowel (${WHEEL_OF_FORTUNE_VOWEL_COST})</summary>
                <div className="wof-letter-row">
                  {VOWELS.map((letter) => (
                    <button
                      key={letter}
                      type="button"
                      className="wof-letter"
                      disabled={used.has(letter) || (state.roundMoney[currentParticipantId] ?? 0) < WHEEL_OF_FORTUNE_VOWEL_COST}
                      onClick={() =>
                        send({ type: "wheelOfFortune:buyVowel", payload: { letter } })
                      }
                    >
                      {letter}
                    </button>
                  ))}
                </div>
              </details>
              <form
                className="wof-actions"
                onSubmit={(e) => {
                  e.preventDefault();
                  send({ type: "wheelOfFortune:solve", payload: { guess: solveGuess } });
                  setSolveGuess("");
                }}
              >
                <input
                  value={solveGuess}
                  onChange={(ev) => setSolveGuess(ev.target.value)}
                  placeholder="Solve puzzle"
                  aria-label="Solve puzzle"
                />
                <button type="submit" className="btn btn-secondary" disabled={!solveGuess.trim()}>
                  Solve
                </button>
              </form>
            </div>
          )}

          {canAct && phase === "awaitingLetter" && (
            <div>
              <p className="wof-pick-label">Call a consonant</p>
              <div className="wof-letter-row">
                {CONSONANTS.map((letter) => (
                  <button
                    key={letter}
                    type="button"
                    className="wof-letter"
                    disabled={used.has(letter) || !isConsonant(letter)}
                    onClick={() =>
                      send({ type: "wheelOfFortune:callConsonant", payload: { letter } })
                    }
                  >
                    {letter}
                  </button>
                ))}
              </div>
              <form
                className="wof-actions"
                style={{ marginTop: "0.5rem" }}
                onSubmit={(e) => {
                  e.preventDefault();
                  send({ type: "wheelOfFortune:solve", payload: { guess: solveGuess } });
                  setSolveGuess("");
                }}
              >
                <input
                  value={solveGuess}
                  onChange={(ev) => setSolveGuess(ev.target.value)}
                  placeholder="Or solve"
                  aria-label="Solve puzzle"
                />
                <button type="submit" className="btn btn-secondary" disabled={!solveGuess.trim()}>
                  Solve
                </button>
              </form>
            </div>
          )}

          {spinning && <p className="wof-outcome">Wheel spinning…</p>}
          {!isMyTurn && state.status === "playing" && phase !== "roundSolved" && (
            <p className="wof-outcome">Waiting for other players…</p>
          )}
        </div>
      </div>
    </div>
  );
}

function BonusCountdown({ endsAt }: { endsAt: number }): JSX.Element {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(id);
  }, []);
  const remaining = Math.max(0, Math.ceil((endsAt - now) / 1000));
  return <strong>{remaining}s</strong>;
}
