import { useEffect, useMemo, useRef, useState, type JSX } from "react";
import type { ClientEvent, SessionState, YahtzeeCategory } from "../../../shared/contracts";
import {
  grandTotalFromSheetRows,
  scoreCategory,
  YAHTZEE_CATEGORY_ORDER
} from "../../../shared/yahtzeeScoring";
import { activeParticipants } from "../utils/participants";
import {
  playYahtzeeDiceRollSound,
  readStoredYahtzeeDiceSoundEnabled,
  YAHTZEE_DICE_SOUND_STORAGE_KEY
} from "./yahtzeeDiceRollSound";

const CATEGORY_LABEL: Record<YahtzeeCategory, string> = {
  ones: "Aces",
  twos: "Twos",
  threes: "Threes",
  fours: "Fours",
  fives: "Fives",
  sixes: "Sixes",
  threeOfAKind: "3 of a kind",
  fourOfAKind: "4 of a kind",
  fullHouse: "Full house",
  smallStraight: "Sm. straight",
  largeStraight: "Lg. straight",
  yahtzee: "Yahtzee",
  chance: "Chance"
};

function pipPositions(value: number): boolean[] {
  const g = [false, false, false, false, false, false, false, false, false];
  const set = (idx: number): void => {
    g[idx] = true;
  };
  switch (value) {
    case 1:
      set(4);
      break;
    case 2:
      set(0);
      set(8);
      break;
    case 3:
      set(0);
      set(4);
      set(8);
      break;
    case 4:
      set(0);
      set(2);
      set(6);
      set(8);
      break;
    case 5:
      set(0);
      set(2);
      set(4);
      set(6);
      set(8);
      break;
    default:
      set(0);
      set(2);
      set(3);
      set(5);
      set(6);
      set(8);
      break;
  }
  return g;
}

function DieFace({
  value,
  held,
  disabled,
  onToggle
}: {
  value: number;
  held: boolean;
  disabled: boolean;
  onToggle?: () => void;
}): JSX.Element {
  const pips = pipPositions(value);
  return (
    <button
      type="button"
      className={`yahtzee-die${held ? " yahtzee-die--held" : ""}${disabled ? " yahtzee-die--disabled" : ""}`}
      disabled={disabled}
      onClick={onToggle}
      aria-pressed={held}
    >
      <span className="yahtzee-die-grid">
        {pips.map((on, i) => (
          <span key={i} className={`yahtzee-die-cell${on ? " yahtzee-die-cell--pip" : ""}`} />
        ))}
      </span>
    </button>
  );
}

function diceFingerprint(
  dice: readonly [number, number, number, number, number],
  rollsUsed: number,
  currentPlayerId: string
): string {
  return `${currentPlayerId}:${rollsUsed}:${dice.join(",")}`;
}

export function YahtzeeGame({
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
  const gs = session.gameState;
  if (!gs || gs.type !== "yahtzee") {
    return null;
  }
  const state = gs.state;
  const roster = activeParticipants(session.participants);
  const nameFor = (id: string): string => roster.find((p) => p.id === id)?.displayName ?? "Player";

  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => readStoredYahtzeeDiceSoundEnabled());
  const soundEnabledRef = useRef(soundEnabled);
  const audioContextRef = useRef<AudioContext | null>(null);
  const prevDiceKeyRef = useRef<string | null>(null);
  const skipNextDiceSoundRef = useRef(true);

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
    try {
      window.localStorage.setItem(YAHTZEE_DICE_SOUND_STORAGE_KEY, soundEnabled ? "1" : "0");
    } catch {
      // ignore
    }
  }, [soundEnabled]);

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

  useEffect(() => {
    return () => {
      if (audioContextRef.current) {
        void audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
    };
  }, []);

  const playingDiceKey =
    state.status === "playing"
      ? diceFingerprint(state.dice, state.rollsUsed, state.currentPlayerId)
      : null;

  useEffect(() => {
    if (state.status !== "playing" || !playingDiceKey) {
      return;
    }
    if (skipNextDiceSoundRef.current) {
      skipNextDiceSoundRef.current = false;
      prevDiceKeyRef.current = playingDiceKey;
      return;
    }
    if (prevDiceKeyRef.current === playingDiceKey) {
      return;
    }
    prevDiceKeyRef.current = playingDiceKey;
    if (!soundEnabledRef.current) {
      return;
    }
    const context = ensureAudioContext();
    if (!context || context.state !== "running") {
      return;
    }
    playYahtzeeDiceRollSound(context);
  }, [playingDiceKey, state.status]);

  const isPlaying = state.status === "playing";
  const currentPlayerId = isPlaying ? state.currentPlayerId : "";
  const isCurrentRoller = isPlaying && currentPlayerId === currentParticipantId;
  const canAct = canPlay && isCurrentRoller;

  const myCommitted = useMemo(() => {
    const rows = state.sheetsByParticipant[currentParticipantId] ?? [];
    const sub: Partial<Record<YahtzeeCategory, number>> = {};
    for (const r of rows) {
      sub[r.category] = r.points;
    }
    return sub;
  }, [state, currentParticipantId]);

  const yahtzeeTotals = useMemo(() => {
    const out: Record<string, number> = {};
    for (const p of roster) {
      out[p.id] = grandTotalFromSheetRows(state.sheetsByParticipant[p.id] ?? []);
    }
    return out;
  }, [roster, state]);

  const pickCategory = (category: YahtzeeCategory): void => {
    if (!canAct) {
      return;
    }
    send({ type: "yahtzee:setPendingCategory", payload: { category } });
  };

  const roll = (): void => {
    if (!canAct) {
      return;
    }
    unlockAudio();
    send({ type: "yahtzee:roll", payload: {} });
  };

  const passTurn = (): void => {
    if (!canAct) {
      return;
    }
    unlockAudio();
    send({ type: "yahtzee:passTurn", payload: {} });
  };

  const toggleHold = (dieIndex: number): void => {
    if (!canAct) {
      return;
    }
    send({ type: "yahtzee:toggleHold", payload: { dieIndex } });
  };

  if (state.status === "finished") {
    const ordered = [...state.playerOrder].sort(
      (a, b) => (state.yahtzeeGrandTotals[b] ?? 0) - (state.yahtzeeGrandTotals[a] ?? 0)
    );
    return (
      <div className="yahtzee yahtzee--finished">
        <header className="yahtzee-head">
          <h2>Yahtzee — finished</h2>
          <p className="yahtzee-muted">
            Winner (sheet): <strong>{nameFor(state.winnerParticipantId)}</strong>
          </p>
        </header>
        <div className="yahtzee-summary yahtzee-summary--final">
          <h3>This game</h3>
          <ul>
            {ordered.map((id) => (
              <li key={id}>
                <span>{nameFor(id)}</span>
                <span className="yahtzee-summary-total">{state.yahtzeeGrandTotals[id] ?? 0}</span>
                <span className="yahtzee-muted">+{state.placementAwards[id] ?? 0} Friday Fusion pts</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  const dice = state.dice;
  const held = state.held;
  const rollsLeft = 3 - state.rollsUsed;
  const pending = state.pendingCategory;
  const pendingPreview = pending ? scoreCategory(dice, pending) : null;

  return (
    <div className={`yahtzee${isCurrentRoller ? " yahtzee--your-turn" : ""}`}>
      <header className="yahtzee-head">
        <h2>Yahtzee</h2>
        <p className="yahtzee-turn-line">
          {isCurrentRoller ? (
            <>
              <strong className="yahtzee-your-turn-callout">Your turn</strong>
              {" — "}
              {rollsLeft} roll{rollsLeft === 1 ? "" : "s"} left
            </>
          ) : (
            <>
              {nameFor(currentPlayerId)}&apos;s turn — {rollsLeft} roll{rollsLeft === 1 ? "" : "s"} left
            </>
          )}
        </p>
        <div className="yahtzee-summary">
          <h3 className="yahtzee-summary-title">This game (sheet total)</h3>
          <ul className="yahtzee-summary-list">
            {roster.map((p) => (
              <li key={p.id}>
                <span>{p.displayName}</span>
                <span className="yahtzee-summary-total">{yahtzeeTotals[p.id] ?? 0}</span>
                <span className="yahtzee-muted" title="Lobby score from all games">
                  FF: {p.score}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <label className="catchphrase-sound-toggle yahtzee-sound">
          <input
            type="checkbox"
            checked={soundEnabled}
            onChange={(e) => {
              setSoundEnabled(e.target.checked);
              unlockAudio();
            }}
          />
          Dice sound
        </label>
      </header>

      <div className="yahtzee-dice-row">
        {dice.map((v, i) => (
          <DieFace
            key={i}
            value={v}
            held={held[i] ?? false}
            disabled={!canAct}
            onToggle={canAct ? () => toggleHold(i) : undefined}
          />
        ))}
      </div>

      <div className="yahtzee-actions">
        <button type="button" className="btn" disabled={!canAct || state.rollsUsed >= 3} onClick={roll}>
          Roll dice
        </button>
        <button type="button" className="btn btn-primary" disabled={!canAct || pending === null} onClick={passTurn}>
          Pass turn
        </button>
        {pending !== null && (
          <span className="yahtzee-pending-preview">
            Pending: {CATEGORY_LABEL[pending]} → {pendingPreview}
          </span>
        )}
      </div>

      <div className="yahtzee-sheet-wrap">
        <h3 className="yahtzee-sheet-title">Your scorecard</h3>
        <table className="yahtzee-sheet">
          <thead>
            <tr>
              <th scope="col">Category</th>
              <th scope="col">Score</th>
            </tr>
          </thead>
          <tbody>
            {YAHTZEE_CATEGORY_ORDER.map((cat) => {
              const committed = myCommitted[cat];
              const potential = scoreCategory(dice, cat);
              const isPendingHere = isPlaying && pending === cat && committed === undefined;
              return (
                <tr key={cat}>
                  <td>{CATEGORY_LABEL[cat]}</td>
                  <td>
                    {typeof committed === "number" ? (
                      <span className="yahtzee-score-locked">{committed}</span>
                    ) : canAct ? (
                      <button
                        type="button"
                        className={`yahtzee-score-btn${isPendingHere ? " yahtzee-score-btn--pending" : ""}`}
                        onClick={() => pickCategory(cat)}
                        aria-label={`Select ${CATEGORY_LABEL[cat]} — would score ${potential} points`}
                      >
                        Score {potential}
                      </button>
                    ) : (
                      <span className="yahtzee-score-wait" title="Not your turn to choose a row">
                        —
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {isHost && <p className="yahtzee-muted yahtzee-host-hint">Use Players panel to restart or end the game.</p>}
    </div>
  );
}
