import { useEffect, useMemo, useRef, useState, type JSX } from "react";
import type { ClientEvent, SessionState, YahtzeeCategory } from "../../../shared/contracts";
import {
  computeYahtzeePlacement,
  grandTotalFromSheetRows,
  hasUpperBonusFromSheetRows,
  scoreCategory,
  scoredYahtzeeFromSheetRows,
  YAHTZEE_CATEGORY_ORDER,
  YAHTZEE_UPPER_CATEGORIES
} from "../../../shared/yahtzeeScoring";
import { activeParticipants } from "../utils/participants";
import {
  playYahtzeeDiceRollSound,
  readStoredYahtzeeDiceSoundEnabled,
  YAHTZEE_DICE_SOUND_STORAGE_KEY
} from "./yahtzeeDiceRollSound";
import { AvatarShower } from "../components/AvatarShower";
import { PlayerName } from "../components/PlayerName";

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

function LeaderboardCheck({
  checked,
  label
}: {
  checked: boolean;
  label: string;
}): JSX.Element {
  return (
    <span
      className={`yahtzee-lb-check${checked ? " yahtzee-lb-check--yes" : ""}`}
      role="img"
      aria-label={`${label}: ${checked ? "yes" : "no"}`}
    />
  );
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
  const nameNode = (id: string, size: "xs" | "sm" | "md" | "lg" | "xl" = "sm"): JSX.Element => (
    <PlayerName participantId={id} participants={session.participants} size={size} inline />
  );

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
      ? diceFingerprint(state.dice, state.rollsUsed, state.mode === "turns" ? state.currentPlayerId : currentParticipantId)
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
  const isSimultaneousMode = isPlaying && state.mode === "simultaneous";
  const currentPlayerId = isPlaying && state.mode === "turns" ? state.currentPlayerId : currentParticipantId;
  const myRows = state.sheetsByParticipant[currentParticipantId] ?? [];
  const myRoundsLeft = Math.max(0, 13 - myRows.length);
  const isCurrentRoller = isPlaying && (isSimultaneousMode || currentPlayerId === currentParticipantId);
  const canAct = canPlay && isCurrentRoller && (isSimultaneousMode ? myRoundsLeft > 0 : true);
  const [activeYahtzeeAnnouncement, setActiveYahtzeeAnnouncement] = useState<{
    participantId: string;
    createdAtMs: number;
  } | null>(null);

  useEffect(() => {
    if (!isPlaying || !state.latestYahtzee) {
      setActiveYahtzeeAnnouncement(null);
      return;
    }
    const latest = state.latestYahtzee;
    const elapsedMs = Date.now() - latest.createdAtMs;
    if (elapsedMs >= 3000) {
      setActiveYahtzeeAnnouncement(null);
      return;
    }
    setActiveYahtzeeAnnouncement(latest);
    const timeout = window.setTimeout(() => {
      setActiveYahtzeeAnnouncement((current) =>
        current && current.createdAtMs === latest.createdAtMs ? null : current
      );
    }, 3000 - elapsedMs);
    return () => window.clearTimeout(timeout);
  }, [isPlaying, isPlaying ? state.latestYahtzee?.participantId : null, isPlaying ? state.latestYahtzee?.createdAtMs : null]);

  const myCommitted = useMemo(() => {
    const sub: Partial<Record<YahtzeeCategory, number>> = {};
    for (const r of myRows) {
      sub[r.category] = r.points;
    }
    return sub;
  }, [myRows]);

  const yahtzeeTotals = useMemo(() => {
    const out: Record<string, number> = {};
    for (const p of roster) {
      out[p.id] = grandTotalFromSheetRows(state.sheetsByParticipant[p.id] ?? []);
    }
    return out;
  }, [roster, state]);

  const upperSectionTotal = useMemo(
    () =>
      YAHTZEE_UPPER_CATEGORIES.reduce((sum, category) => {
        const points = myCommitted[category];
        return sum + (typeof points === "number" ? points : 0);
      }, 0),
    [myCommitted]
  );
  const hasReachedUpperBonusTarget = upperSectionTotal >= 63;

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
    const standings = computeYahtzeePlacement(state.playerOrder, state.yahtzeeGrandTotals);
    const youWon = state.winnerParticipantId === currentParticipantId;
    return (
      <div className="yahtzee yahtzee--finished">
        {session.participants.find((participant) => participant.id === state.winnerParticipantId)?.avatar && (
          <AvatarShower
            avatar={session.participants.find((participant) => participant.id === state.winnerParticipantId)?.avatar}
            variant="rain"
            active
          />
        )}
        <header className="yahtzee-head yahtzee-head--finished">
          <h2>Yahtzee</h2>
          <span className="pill pill-status pill-status-finished">Game over</span>
        </header>
        <p className="yahtzee-finished-winner" role="status">
          {youWon ? (
            <>
              You won with <strong>{state.yahtzeeGrandTotals[currentParticipantId] ?? 0}</strong> points!
            </>
          ) : (
            <>
              Winner: <strong>{nameNode(state.winnerParticipantId, "xl")}</strong>
              {" — "}
              {state.yahtzeeGrandTotals[state.winnerParticipantId] ?? 0} points
            </>
          )}
        </p>
        <div className="yahtzee-leaderboard-wrap">
          <h3 className="yahtzee-leaderboard-title">Final standings</h3>
          <table className="yahtzee-leaderboard">
            <thead>
              <tr>
                <th scope="col" className="yahtzee-lb-col-rank">
                  #
                </th>
                <th scope="col">Player</th>
                <th scope="col" className="yahtzee-lb-col-score">
                  Score
                </th>
                <th scope="col" className="yahtzee-lb-col-check" title="Scored 50 in the Yahtzee row">
                  Yahtzee
                </th>
                <th scope="col" className="yahtzee-lb-col-check" title="Upper section 63+ bonus (+35)">
                  63+ bonus
                </th>
                <th scope="col" className="yahtzee-lb-col-ff">
                  FF pts
                </th>
              </tr>
            </thead>
            <tbody>
              {standings.map((row) => {
                const sheet = state.sheetsByParticipant[row.participantId] ?? [];
                const isWinner = row.participantId === state.winnerParticipantId;
                return (
                  <tr
                    key={row.participantId}
                    className={isWinner ? "yahtzee-lb-row--winner" : undefined}
                  >
                    <td className="yahtzee-lb-col-rank">
                      <span className="yahtzee-lb-rank">{row.place}</span>
                    </td>
                    <th scope="row" className="yahtzee-lb-name">
                      {nameNode(row.participantId, isWinner ? "lg" : "xs")}
                      {isWinner ? (
                        <span className="yahtzee-lb-winner-badge" aria-hidden>
                          Winner
                        </span>
                      ) : null}
                    </th>
                    <td className="yahtzee-lb-col-score">
                      <span className="yahtzee-lb-score">{row.grandTotal}</span>
                    </td>
                    <td className="yahtzee-lb-col-check">
                      <LeaderboardCheck
                        checked={scoredYahtzeeFromSheetRows(sheet)}
                        label="Yahtzee"
                      />
                    </td>
                    <td className="yahtzee-lb-col-check">
                      <LeaderboardCheck
                        checked={hasUpperBonusFromSheetRows(sheet)}
                        label="63+ upper bonus"
                      />
                    </td>
                    <td className="yahtzee-lb-col-ff">
                      <span className="yahtzee-lb-ff">+{row.award}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="yahtzee-muted scores-note">Friday Fusion session scores are in the sidebar.</p>
      </div>
    );
  }

  const dice = state.dice;
  const held = state.held;
  const rollsLeft = 3 - state.rollsUsed;
  const pending = state.pendingCategory;
  const pendingPreview = pending ? scoreCategory(dice, pending) : null;
  const yahtzeeAnnouncementId = activeYahtzeeAnnouncement?.participantId ?? null;

  return (
    <div className={`yahtzee${isCurrentRoller ? " yahtzee--your-turn" : ""}`}>
      {yahtzeeAnnouncementId && (
        <AvatarShower
          avatar={session.participants.find((participant) => participant.id === yahtzeeAnnouncementId)?.avatar}
          variant="burst"
          active
          density="normal"
        />
      )}
      <header className="yahtzee-head">
        <h2>Yahtzee</h2>
        {yahtzeeAnnouncementId && (
          <p className="yahtzee-announce">
            {nameNode(yahtzeeAnnouncementId, "lg")} got a YAHTZEE!
          </p>
        )}
        <p className="yahtzee-turn-line">
          {isSimultaneousMode ? (
            <>
              <strong className="yahtzee-your-turn-callout">Simultaneous mode</strong>
              {" — "}
              {myRoundsLeft} round{myRoundsLeft === 1 ? "" : "s"} left on your card
            </>
          ) : isCurrentRoller ? (
            <>
              <strong className="yahtzee-your-turn-callout">Your turn</strong>
              {" — "}
              {rollsLeft} roll{rollsLeft === 1 ? "" : "s"} left
            </>
          ) : (
            <>
              {nameNode(currentPlayerId, "md")}&apos;s turn — {rollsLeft} roll{rollsLeft === 1 ? "" : "s"} left
            </>
          )}
        </p>
        <div className="yahtzee-summary">
          <h3 className="yahtzee-summary-title">
            {isSimultaneousMode ? "Live progress" : "This game (sheet total)"}
          </h3>
          <ul className="yahtzee-summary-list">
            {roster.map((p) => (
              <li key={p.id}>
                <span>
                  <PlayerName participant={p} size="xs" inline />
                </span>
                <span className="yahtzee-summary-total">{yahtzeeTotals[p.id] ?? 0}</span>
                <span className="yahtzee-muted">
                  {Math.max(0, 13 - (state.sheetsByParticipant[p.id]?.length ?? 0))} rounds left
                </span>
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
          {isSimultaneousMode ? "Score row" : "Pass turn"}
        </button>
        {pending !== null && (
          <span className="yahtzee-pending-preview">
            Pending: {CATEGORY_LABEL[pending]} → {pendingPreview}
          </span>
        )}
      </div>

      <div className="yahtzee-sheet-wrap">
        <p className="yahtzee-upper-total" aria-live="polite">
          Upper section:{" "}
          <strong>
            {upperSectionTotal} / 63
          </strong>
          <span
            className={`yahtzee-upper-bonus-indicator${
              hasReachedUpperBonusTarget ? " yahtzee-upper-bonus-indicator--met" : ""
            }`}
          >
            {hasReachedUpperBonusTarget ? " Bonus target met \u2713" : " Bonus target pending"}
          </span>
        </p>
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
