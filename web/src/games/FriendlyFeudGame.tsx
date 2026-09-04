import { useEffect, useMemo, useState } from "react";
import type { ClientEvent, FriendlyFeudBoardSlot, SessionState } from "../../../shared/contracts";
import { FRIENDLY_FEUD_ROUNDS_PER_GAME } from "../../../shared/contracts";
import { activeParticipants } from "../utils/participants";
import { AvatarShower } from "../components/AvatarShower";
import { PlayerName } from "../components/PlayerName";

function BoardSlots({ board }: { board: FriendlyFeudBoardSlot[] }): JSX.Element {
  return (
    <ol className="friendly-feud-board">
      {board.map((slot, index) => (
        <li
          key={index}
          className={`friendly-feud-slot${slot.revealed ? " is-revealed" : ""}`}
          data-testid={`friendly-feud-slot-${index}`}
        >
          <span className="friendly-feud-slot-num">{index + 1}</span>
          {slot.revealed ? (
            <>
              <span className="friendly-feud-slot-ans">{slot.ans}</span>
              <span className="friendly-feud-slot-pnt">{slot.pnt}</span>
            </>
          ) : (
            <span className="friendly-feud-slot-blank">?</span>
          )}
        </li>
      ))}
    </ol>
  );
}

function StrikeMarks({ strikes }: { strikes: number }): JSX.Element {
  return (
    <div className="friendly-feud-strikes" aria-label={`${strikes} strikes`}>
      {[0, 1, 2].map((i) => (
        <span key={i} className={`friendly-feud-strike${i < strikes ? " is-on" : ""}`}>
          X
        </span>
      ))}
    </div>
  );
}

/** Seconds remaining until `deadlineMs`, or null when no deadline. */
function useCountdownSeconds(deadlineMs: number | null | undefined): number | null {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(() =>
    deadlineMs == null ? null : Math.max(0, Math.ceil((deadlineMs - Date.now()) / 1000))
  );
  useEffect(() => {
    if (deadlineMs == null) {
      setSecondsLeft(null);
      return;
    }
    const tick = (): void => {
      setSecondsLeft(Math.max(0, Math.ceil((deadlineMs - Date.now()) / 1000)));
    };
    tick();
    const id = window.setInterval(tick, 200);
    return () => window.clearInterval(id);
  }, [deadlineMs]);
  return secondsLeft;
}

export function FriendlyFeudGame({
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
  if (!gs || gs.type !== "friendlyFeud") {
    return null;
  }
  const state = gs.state;
  const [draftTeamA, setDraftTeamA] = useState<string[]>(state.status === "teamSetup" ? [...state.teamAIds] : []);
  const [draftTeamB, setDraftTeamB] = useState<string[]>(state.status === "teamSetup" ? [...state.teamBIds] : []);
  const [guess, setGuess] = useState("");

  const buzzOpensAt = state.status === "faceOff" ? state.buzzOpensAt : null;
  const answerEndsAt = state.status === "faceOff" ? state.answerEndsAt : null;
  const buzzSecondsLeft = useCountdownSeconds(buzzOpensAt);
  const answerSecondsLeft = useCountdownSeconds(answerEndsAt);

  useEffect(() => {
    if (state.status === "teamSetup") {
      setDraftTeamA([...state.teamAIds]);
      setDraftTeamB([...state.teamBIds]);
    }
  }, [state]);

  useEffect(() => {
    setGuess("");
  }, [state.status, "currentGuesserId" in state ? state.currentGuesserId : null, "answeringParticipantId" in state ? state.answeringParticipantId : null]);

  const nameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of session.participants) {
      map.set(p.id, p.displayName);
    }
    return map;
  }, [session.participants]);

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
        <section className="card friendly-feud-setup-card">
          <header className="card-head">
            <h2>Friendly Feud - teams</h2>
          </header>
          <p className="friendly-feud-setup-lead">
            Only the host can assign teams and start the game. Stay on this screen; you will see Friendly Feud here once
            play begins.
          </p>
        </section>
      );
    }
    const roster = activeParticipants(session.participants);
    return (
      <section className="card friendly-feud-setup-card">
        <header className="card-head">
          <h2>Friendly Feud - teams</h2>
        </header>
        <p className="friendly-feud-setup-lead">
          Needs at least six players with at least two on each team. Starting always saves your current team picks first.
        </p>
        <ul className="pictionary-team-picks">
          {roster.map((participant) => {
            const onA = draftTeamA.includes(participant.id);
            const onB = draftTeamB.includes(participant.id);
            return (
              <li key={participant.id} className="pictionary-team-pick-row">
                <span className="pictionary-team-pick-name">
                  <PlayerName participant={participant} size="xs" inline />
                </span>
                <div className="pictionary-team-pick-actions">
                  <label className="pictionary-team-radio">
                    <input
                      type="radio"
                      name={`friendly-feud-team-${participant.id}`}
                      checked={onA}
                      onChange={() => setPlayerTeam(participant.id, "A")}
                    />
                    Team A
                  </label>
                  <label className="pictionary-team-radio">
                    <input
                      type="radio"
                      name={`friendly-feud-team-${participant.id}`}
                      checked={onB}
                      onChange={() => setPlayerTeam(participant.id, "B")}
                    />
                    Team B
                  </label>
                  <label className="pictionary-team-radio">
                    <input
                      type="radio"
                      name={`friendly-feud-team-${participant.id}`}
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
                type: "friendlyFeud:setTeams",
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
                type: "friendlyFeud:setTeams",
                payload: { teamAIds: draftTeamA, teamBIds: draftTeamB }
              });
              send({ type: "friendlyFeud:beginPlay", payload: {} });
            }}
          >
            Start Friendly Feud
          </button>
        </div>
      </section>
    );
  }

  if (state.status === "finished") {
    const winners = state.winnerTeams.map((t) => (t === "A" ? "Team A" : "Team B")).join(" & ");
    const winningIds = state.winnerTeams.flatMap((t) => (t === "A" ? state.teamAIds : state.teamBIds));
    const winningAvatars = session.participants
      .filter((participant) => winningIds.includes(participant.id))
      .map((participant) => participant.avatar)
      .filter((avatar): avatar is NonNullable<typeof avatar> => Boolean(avatar && avatar.type !== "none"));
    const isTie = state.winnerTeams.length > 1;
    return (
      <section className="card friendly-feud-card friendly-feud-card--finished">
        {winningAvatars.length > 0 && <AvatarShower avatars={winningAvatars} variant="rain" density="team" active />}
        <header className="card-head">
          <h2>Friendly Feud</h2>
          <span className="pill pill-status pill-status-finished">Game over</span>
        </header>
        <p className="friendly-feud-finished-winner" role="status">
          {isTie ? (
            <>
              Tie between <strong>{winners}</strong>
            </>
          ) : (
            <>
              <strong>{winners}</strong> wins!
            </>
          )}
        </p>
        <div className="friendly-feud-final-scores" aria-label="Final Family Feud scores">
          <div className={`friendly-feud-final-team${state.winnerTeams.includes("A") ? " is-winner" : ""}`}>
            <span className="friendly-feud-final-label">Team A</span>
            <span className="friendly-feud-final-pts">{state.teamScores.A}</span>
            <span className="friendly-feud-final-roster">
              {state.teamAIds.map((id) => (
                <PlayerName key={id} participantId={id} participants={session.participants} size="xs" inline />
              ))}
            </span>
          </div>
          <div className={`friendly-feud-final-team${state.winnerTeams.includes("B") ? " is-winner" : ""}`}>
            <span className="friendly-feud-final-label">Team B</span>
            <span className="friendly-feud-final-pts">{state.teamScores.B}</span>
            <span className="friendly-feud-final-roster">
              {state.teamBIds.map((id) => (
                <PlayerName key={id} participantId={id} participants={session.participants} size="xs" inline />
              ))}
            </span>
          </div>
        </div>
        <div className="friendly-feud-recap-wrap">
          <h3 className="friendly-feud-recap-title">Round-by-round</h3>
          <table className="friendly-feud-recap">
            <thead>
              <tr>
                <th scope="col">Round</th>
                <th scope="col">Survey</th>
                <th scope="col">Winner</th>
                <th scope="col" className="friendly-feud-recap-pts">
                  Feud pts
                </th>
              </tr>
            </thead>
            <tbody>
              {state.roundResults.map((round) => (
                <tr key={round.roundIndex}>
                  <td>{round.roundIndex + 1}{round.roundIndex >= 2 ? " (×2)" : ""}</td>
                  <th scope="row">{round.question}</th>
                  <td>Team {round.awardedTeam}</td>
                  <td className="friendly-feud-recap-pts">+{round.awardedPoints}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="friendly-feud-ff-note scores-note">
          Friday Fusion points: +1 per round win, +2 for the game win (sidebar).
        </p>
      </section>
    );
  }

  const answeringId =
    state.status === "faceOff"
      ? state.answeringParticipantId
      : state.status === "playBoard" || state.status === "steal"
        ? state.currentGuesserId
        : null;
  const isFaceOffPlayer =
    state.status === "faceOff"
    && (currentParticipantId === state.faceOffPlayerAId || currentParticipantId === state.faceOffPlayerBId);
  const buzzUnlocked = buzzSecondsLeft === 0;
  const canBuzz =
    state.status === "faceOff"
    && !state.awaitingSecondAnswer
    && !state.answeringParticipantId
    && isFaceOffPlayer
    && buzzUnlocked;
  const showBuzzCountdown =
    state.status === "faceOff"
    && !state.awaitingSecondAnswer
    && !state.answeringParticipantId
    && isFaceOffPlayer
    && !buzzUnlocked
    && buzzSecondsLeft !== null;
  const canGuess = answeringId === currentParticipantId;
  const phaseLabel =
    state.status === "faceOff"
      ? "Face-off"
      : state.status === "playBoard"
        ? "Play the board"
        : state.status === "steal"
          ? "Steal"
          : "Round reveal";

  const submitGuess = (): void => {
    const trimmed = guess.trim();
    if (!trimmed) {
      return;
    }
    send({ type: "friendlyFeud:submitGuess", payload: { guess: trimmed } });
    setGuess("");
  };

  return (
    <section className="card friendly-feud-card">
      <header className="card-head">
        <h2>Friendly Feud</h2>
        <div className="friendly-feud-score" title="Family Feud board points (not Friday Fusion session scores)">
          <span>Team A: {state.teamScores.A}</span>
          <span>Team B: {state.teamScores.B}</span>
        </div>
      </header>
      <p className="friendly-feud-meta">
        Round {state.roundIndex + 1} of 3
        {state.multiply > 1 ? " · Double points" : ""} · {phaseLabel} · Pot {state.pot}
      </p>
      <p className="friendly-feud-question">{state.question}</p>
      <BoardSlots board={state.board} />
      {(state.status === "playBoard" || state.status === "steal") && <StrikeMarks strikes={state.strikes} />}

      {state.status === "faceOff" && (
        <div className="friendly-feud-faceoff">
          <p>
            Face-off: <strong>{nameById.get(state.faceOffPlayerAId) ?? "Team A"}</strong> vs{" "}
            <strong>{nameById.get(state.faceOffPlayerBId) ?? "Team B"}</strong>
          </p>
          {showBuzzCountdown && (
            <p className="friendly-feud-timer" aria-live="polite">
              Get ready… Buzz in <strong>{buzzSecondsLeft}</strong>
            </p>
          )}
          {state.answeringParticipantId && answerSecondsLeft !== null && (
            <p
              className={`friendly-feud-timer friendly-feud-timer--answer${answerSecondsLeft <= 2 ? " is-urgent" : ""}`}
              aria-live="polite"
            >
              Answer timer: <strong>{answerSecondsLeft}s</strong>
            </p>
          )}
          {state.buzzedParticipantId && !state.awaitingSecondAnswer && (
            <p className="friendly-feud-status">
              {(nameById.get(state.buzzedParticipantId) ?? "Someone")} buzzed in!
            </p>
          )}
          {state.awaitingSecondAnswer && state.answeringParticipantId && (
            <p className="friendly-feud-status">
              Second answer: {(nameById.get(state.answeringParticipantId) ?? "opponent")}
            </p>
          )}
          {canBuzz && (
            <button type="button" className="btn btn-primary friendly-feud-buzz" onClick={() => send({ type: "friendlyFeud:buzz", payload: {} })}>
              Buzz!
            </button>
          )}
        </div>
      )}

      {state.status === "playBoard" && (
        <p className="friendly-feud-status">
          Team {state.controllingTeam} controls · Guessing:{" "}
          <strong>{nameById.get(state.currentGuesserId) ?? "…"}</strong>
        </p>
      )}
      {state.status === "steal" && (
        <p className="friendly-feud-status">
          Steal chance for Team {state.stealingTeam} ·{" "}
          <strong>{nameById.get(state.currentGuesserId) ?? "…"}</strong>
        </p>
      )}
      {state.status === "roundReveal" && (
        <div className="friendly-feud-reveal-actions">
          <p className="friendly-feud-status">
            Team {state.awardedTeam} scored {state.awardedPoints} Family Feud points this round
            {state.roundIndex >= FRIENDLY_FEUD_ROUNDS_PER_GAME - 1 ? ". Game complete — host can continue to results." : "."}
          </p>
          {isHost ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => send({ type: "friendlyFeud:continue", payload: {} })}
            >
              {state.roundIndex >= FRIENDLY_FEUD_ROUNDS_PER_GAME - 1 ? "See final results" : "Continue"}
            </button>
          ) : (
            <p className="friendly-feud-waiting">Waiting for the host to continue…</p>
          )}
        </div>
      )}

      {state.lastGuess && (
        <p className={`friendly-feud-last-guess${state.lastGuess.correct ? " is-correct" : " is-miss"}`}>
          {(nameById.get(state.lastGuess.participantId) ?? "Player")}: “{state.lastGuess.text}” —{" "}
          {state.lastGuess.correct ? "on the board!" : "not on the board"}
        </p>
      )}

      {canGuess && (
        <form
          className="friendly-feud-guess-form"
          onSubmit={(event) => {
            event.preventDefault();
            submitGuess();
          }}
        >
          <label className="friendly-feud-guess-label" htmlFor="friendly-feud-guess">
            Your answer
          </label>
          <div className="friendly-feud-guess-row">
            <input
              id="friendly-feud-guess"
              className="input"
              value={guess}
              onChange={(event) => setGuess(event.target.value)}
              maxLength={120}
              autoComplete="off"
              autoFocus
            />
            <button type="submit" className="btn btn-primary">
              Submit
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
