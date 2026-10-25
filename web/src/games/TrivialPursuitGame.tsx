import { useEffect, useState } from "react";
import type { ClientEvent, SessionState, TrivialPursuitState } from "../../../shared/contracts";
import {
  TRIVIAL_PURSUIT_CATEGORIES,
  TRIVIAL_PURSUIT_CATEGORY_COLORS,
  TRIVIAL_PURSUIT_CATEGORY_LABELS,
  TRIVIAL_PURSUIT_SHOW_QUESTION_CLOCK_DELAY_MS,
  trivialPursuitStandings,
  type TrivialPursuitCategory
} from "../../../shared/trivialPursuitLogic";
import { AvatarShower } from "../components/AvatarShower";
import { PlayerName } from "../components/PlayerName";
import { TOKEN_COLORS, TokenPreviewArt, TrivialPursuitBoard } from "./trivialPursuit/Board";
import "./trivialPursuit/trivialPursuit.css";

function ClockDisplay({ clockEndsAt }: { clockEndsAt: number }): JSX.Element {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [clockEndsAt]);
  const remainingMs = Math.max(0, clockEndsAt - now);
  const secs = Math.ceil(remainingMs / 1000);
  const expired = remainingMs <= 0;
  return (
    <div className={`tp-clock${expired ? " is-expired" : ""}`} aria-live="polite">
      {expired ? "Time's up — please answer" : `Clock: ${secs}s`}
    </div>
  );
}

function ShowClockGate({
  questionShownAt,
  children
}: {
  questionShownAt: number;
  children: (ready: boolean) => JSX.Element;
}): JSX.Element {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [questionShownAt]);
  const ready = now - questionShownAt >= TRIVIAL_PURSUIT_SHOW_QUESTION_CLOCK_DELAY_MS;
  return children(ready);
}

export function TrivialPursuitGame({
  session,
  currentParticipantId,
  send
}: {
  session: SessionState;
  currentParticipantId: string;
  isHost: boolean;
  send: (event: ClientEvent) => void;
}): JSX.Element {
  const state =
    session.gameState?.type === "trivialPursuit" ? session.gameState.state : null;
  if (!state) {
    return <p>Trivial Pursuit is not active.</p>;
  }

  if (state.status === "finished") {
    return (
      <TrivialPursuitFinished
        state={state}
        session={session}
        currentParticipantId={currentParticipantId}
      />
    );
  }

  return <TrivialPursuitPlay state={state} session={session} currentParticipantId={currentParticipantId} send={send} />;
}

function TrivialPursuitFinished({
  state,
  session,
  currentParticipantId
}: {
  state: TrivialPursuitState;
  session: SessionState;
  currentParticipantId: string;
}): JSX.Element {
  const winnerId = state.winnerParticipantId;
  const winner = winnerId
    ? session.participants.find((p) => p.id === winnerId) ?? null
    : null;
  const youWon = winnerId === currentParticipantId;
  const standings = trivialPursuitStandings(state.players, winnerId);
  const winnerPlayer = winnerId
    ? state.players.find((p) => p.participantId === winnerId) ?? null
    : null;
  const winnerIndex = winnerId
    ? state.playerOrder.indexOf(winnerId)
    : -1;
  const winnerColor =
    TOKEN_COLORS[Math.max(0, winnerIndex) % TOKEN_COLORS.length]!;

  return (
    <div className="play-stage tp-root tp-root--finished" data-testid="tp-finished">
      {winner?.avatar ? <AvatarShower avatar={winner.avatar} variant="rain" active /> : null}
      <header className="card-head tp-finished-head">
        <h2>Trivial Pursuit</h2>
        <span className="pill pill-status pill-status-finished">Game over</span>
        <span className="tp-mode-pill">{state.wedgeMode === "classic" ? "Classic wedges" : "Fast wedges"}</span>
      </header>

      {winnerId && winnerPlayer ? (
        <div className="tp-finished-hero">
          <TokenPreviewArt color={winnerColor} wedges={winnerPlayer.wedges} />
          <p className="tp-finished-winner" role="status">
            {youWon ? (
              <>You won Trivial Pursuit!</>
            ) : (
              <>
                <PlayerName
                  participant={
                    winner
                    ?? { id: winnerId, displayName: "Winner", score: 0, isHost: false, isActive: true }
                  }
                  size="lg"
                  inline
                />{" "}
                wins!
              </>
            )}
          </p>
          {state.lastOutcome && <p className="tp-outcome">{state.lastOutcome}</p>}
        </div>
      ) : (
        <p className="tp-finished-winner" role="status">
          {state.lastOutcome ?? "Game ended."}
        </p>
      )}

      <div className="tp-finished-standings-wrap">
        <h3 className="tp-finished-standings-title">Final standings</h3>
        <table className="tp-finished-standings">
          <thead>
            <tr>
              <th scope="col" className="tp-lb-rank">
                #
              </th>
              <th scope="col">Player</th>
              <th scope="col">Wedges</th>
              <th scope="col" className="tp-lb-ff">
                FF pts
              </th>
            </tr>
          </thead>
          <tbody>
            {standings.map((row) => {
              const participant = session.participants.find((p) => p.id === row.participantId);
              const gamePlayer = state.players.find((p) => p.participantId === row.participantId);
              const isWinner = row.participantId === winnerId;
              const owned = gamePlayer
                ? TRIVIAL_PURSUIT_CATEGORIES.filter((c) => gamePlayer.wedges[c])
                : [];
              return (
                <tr
                  key={row.participantId}
                  className={isWinner ? "tp-lb-row--winner" : undefined}
                  data-testid={`tp-standing-${row.participantId}`}
                >
                  <td className="tp-lb-rank">{row.place}</td>
                  <th scope="row">
                    {participant ? (
                      <PlayerName participant={participant} size={isWinner ? "md" : "sm"} inline />
                    ) : (
                      row.participantId
                    )}
                    {isWinner ? <span className="tp-lb-winner-badge">Winner</span> : null}
                  </th>
                  <td>
                    <span className="tp-wedge-row" aria-label={`${row.wedgeTotal} wedges`}>
                      {owned.length === 0 ? (
                        <span className="tp-wedge-none">0</span>
                      ) : (
                        owned.map((cat) => (
                          <span
                            key={cat}
                            className="tp-wedge-chip is-owned"
                            style={{ background: TRIVIAL_PURSUIT_CATEGORY_COLORS[cat] }}
                            title={TRIVIAL_PURSUIT_CATEGORY_LABELS[cat]}
                          />
                        ))
                      )}
                      <span className="tp-lb-wedge-count">{row.wedgeTotal}/6</span>
                    </span>
                  </td>
                  <td className="tp-lb-ff">{row.ffPoints > 0 ? `+${row.ffPoints}` : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TrivialPursuitPlay({
  state,
  session,
  currentParticipantId,
  send
}: {
  state: TrivialPursuitState;
  session: SessionState;
  currentParticipantId: string;
  send: (event: ClientEvent) => void;
}): JSX.Element {
  const isMyTurn = currentParticipantId === state.currentTurnId;
  const isReader = currentParticipantId === state.readerId;
  const isChooser = currentParticipantId === state.finalCategoryChooserId;
  const legalSet = new Set(state.legalMoveSpaceIds);

  const turnPlayer = session.participants.find((p) => p.id === state.currentTurnId);
  const readerPlayer = session.participants.find((p) => p.id === state.readerId);

  const onSpaceClick = (spaceId: string) => {
    if (!isMyTurn || state.phase !== "choosingMove" || !legalSet.has(spaceId)) return;
    send({ type: "trivialPursuit:move", payload: { spaceId } });
  };

  return (
    <div className="play-stage tp-root">
      <header className="card-head">
        <h2>Trivial Pursuit</h2>
        <span className="tp-mode-pill" data-testid="tp-wedge-mode">
          {state.wedgeMode === "classic" ? "Classic wedges" : "Fast wedges"}
        </span>
      </header>

      {state.lastOutcome && <p className="tp-outcome">{state.lastOutcome}</p>}

      <div className="tp-layout">
        <div className="tp-board-wrap">
          <TrivialPursuitBoard
            players={state.players}
            currentTurnId={state.currentTurnId}
            legalMoveSpaceIds={state.legalMoveSpaceIds}
            onSpaceClick={onSpaceClick}
            playerNames={Object.fromEntries(
              session.participants.map((p) => [p.id, p.displayName])
            )}
          />
        </div>

        <div className="tp-panel">
          <div className="tp-players">
            {state.playerOrder.map((id, index) => {
              const p = session.participants.find((x) => x.id === id);
              const gamePlayer = state.players.find((x) => x.participantId === id);
              if (!p || !gamePlayer) return null;
              const owned = TRIVIAL_PURSUIT_CATEGORIES.filter((cat) => gamePlayer.wedges[cat]);
              return (
                <div
                  key={id}
                  className={`tp-player-row${id === state.currentTurnId ? " is-turn" : ""}`}
                  data-testid={`tp-player-row-${id}`}
                >
                  <span
                    className="tp-cat-dot"
                    style={{ background: TOKEN_COLORS[index % TOKEN_COLORS.length] }}
                  />
                  <PlayerName participant={p} inline />
                  <span className="tp-wedge-row" aria-label="Wedges earned">
                    {owned.length === 0 ? (
                      <span className="tp-wedge-none">0</span>
                    ) : (
                      owned.map((cat) => (
                        <span
                          key={cat}
                          className="tp-wedge-chip is-owned"
                          style={{ background: TRIVIAL_PURSUIT_CATEGORY_COLORS[cat] }}
                          title={TRIVIAL_PURSUIT_CATEGORY_LABELS[cat]}
                        />
                      ))
                    )}
                  </span>
                </div>
              );
            })}
          </div>

          {state.phase === "rolling" && (
            <div className="tp-die-row">
              {isMyTurn ? (
                <div className="tp-actions">
                  <button
                    type="button"
                    className="is-primary"
                    onClick={() => send({ type: "trivialPursuit:roll", payload: {} })}
                  >
                    Roll
                  </button>
                </div>
              ) : (
                <p className="tp-status">
                  Waiting for {turnPlayer ? <PlayerName participant={turnPlayer} inline /> : "player"} to roll…
                </p>
              )}
            </div>
          )}

          {state.phase === "choosingMove" && (
            <div className="tp-die-row">
              {state.lastDieRoll != null && <span className="tp-die">{state.lastDieRoll}</span>}
              <p className="tp-status">
                {isMyTurn
                  ? "Choose a highlighted space."
                  : (
                    <>
                      {turnPlayer ? <PlayerName participant={turnPlayer} inline /> : "Player"} is choosing a move…
                    </>
                  )}
              </p>
            </div>
          )}

          {state.phase === "choosingFinalCategory" && (
            <div className="tp-card">
              <p className="tp-status">
                {isChooser
                  ? "Pick the final category."
                  : (
                    <>
                      Waiting for{" "}
                      {session.participants.find((p) => p.id === state.finalCategoryChooserId)
                        ? (
                          <PlayerName
                            participant={session.participants.find((p) => p.id === state.finalCategoryChooserId)!}
                            inline
                          />
                        )
                        : "a player"}{" "}
                      to pick the final category…
                    </>
                  )}
              </p>
              {isChooser && (
                <div className="tp-category-grid">
                  {TRIVIAL_PURSUIT_CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      style={{ background: TRIVIAL_PURSUIT_CATEGORY_COLORS[cat] }}
                      onClick={() =>
                        send({
                          type: "trivialPursuit:chooseFinalCategory",
                          payload: { category: cat }
                        })
                      }
                    >
                      {TRIVIAL_PURSUIT_CATEGORY_LABELS[cat]}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {(state.phase === "reading" || state.phase === "judging") && (
            <ReaderCard
              state={state}
              isReader={isReader}
              isAnswerer={isMyTurn}
              turnPlayerName={turnPlayer}
              readerPlayerName={readerPlayer}
              send={send}
            />
          )}

        </div>
      </div>
    </div>
  );
}

function ReaderCard({
  state,
  isReader,
  isAnswerer,
  turnPlayerName,
  readerPlayerName,
  send
}: {
  state: TrivialPursuitState;
  isReader: boolean;
  isAnswerer: boolean;
  turnPlayerName: SessionState["participants"][number] | undefined;
  readerPlayerName: SessionState["participants"][number] | undefined;
  send: (event: ClientEvent) => void;
}): JSX.Element {
  const category = (state.activeCategory ?? state.activeQuestion?.category) as TrivialPursuitCategory | null;
  const questionText = state.activeQuestion?.text;
  const answer = state.activeQuestion?.correctAnswer;
  const choices = state.activeQuestion?.choices ?? null;
  const revealed = state.answerRevealed;
  const answererHelps =
    state.players.find((p) => p.participantId === state.currentTurnId)?.choiceHelpsRemaining ?? 0;
  const canRequestChoices =
    isAnswerer
    && state.phase === "reading"
    && !revealed
    && state.choicesShownAt == null
    && !state.questionError
    && answererHelps > 0
    && Boolean(state.activeQuestion);

  return (
    <div className="tp-card" data-testid="tp-reader-card">
      {category && (
        <div className="tp-card-category">
          <span className="tp-cat-dot" style={{ background: TRIVIAL_PURSUIT_CATEGORY_COLORS[category] }} />
          {TRIVIAL_PURSUIT_CATEGORY_LABELS[category]}
        </div>
      )}

      <p className="tp-status">
        {readerPlayerName ? <PlayerName participant={readerPlayerName} inline /> : "Someone"} is reading for{" "}
        {turnPlayerName ? <PlayerName participant={turnPlayerName} inline /> : "the player"}
      </p>

      {questionText ? (
        <p className="tp-question-text">{questionText}</p>
      ) : (
        <p className="tp-status">Question is being read aloud…</p>
      )}

      {choices && choices.length > 0 && (
        <div className="tp-choices" data-testid="tp-choices">
          {!revealed && isReader && state.choicesShownAt == null && (
            <p className="tp-choices-hint">
              Optional — you can read these aloud. The answerer may also spend a help to see them.
            </p>
          )}
          {!revealed && isReader && state.choicesShownAt != null && (
            <p className="tp-choices-hint">Choices are visible to the answerer.</p>
          )}
          <ul className="tp-choices-list">
            {choices.map((choice) => {
              const isCorrect = revealed && answer != null && choice === answer;
              return (
                <li
                  key={choice}
                  className={`tp-choice${isCorrect ? " is-correct" : ""}`}
                >
                  {choice}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {state.questionError && (
        <p className="tp-status" role="alert">
          {state.questionError}
        </p>
      )}

      {answer && !choices?.length && <p className="tp-answer">Answer: {answer}</p>}
      {answer && choices && choices.length > 0 && (
        <p className="tp-answer">Correct answer: {answer}</p>
      )}

      {state.clockEndsAt != null && <ClockDisplay clockEndsAt={state.clockEndsAt} />}

      {canRequestChoices && (
        <div className="tp-actions">
          <button
            type="button"
            onClick={() => send({ type: "trivialPursuit:requestChoices", payload: {} })}
          >
            Request answers ({answererHelps} left)
          </button>
        </div>
      )}

      {isAnswerer && !revealed && state.choicesShownAt == null && answererHelps === 0 && (
        <p className="tp-choices-hint">No answer-choice helps remaining this game.</p>
      )}

      {isReader && (
        <div className="tp-actions">
          {state.phase === "reading" && !state.questionError && (
            <>
              {state.questionShownAt == null && (
                <button
                  type="button"
                  onClick={() => send({ type: "trivialPursuit:showQuestion", payload: {} })}
                >
                  Reveal Question
                </button>
              )}
              {state.questionShownAt != null && state.clockEndsAt == null && (
                <ShowClockGate questionShownAt={state.questionShownAt}>
                  {(ready) => (
                    <button
                      type="button"
                      disabled={!ready}
                      onClick={() => send({ type: "trivialPursuit:startClock", payload: {} })}
                    >
                      Clock
                    </button>
                  )}
                </ShowClockGate>
              )}
              <button
                type="button"
                className="is-primary"
                onClick={() => send({ type: "trivialPursuit:reveal", payload: {} })}
              >
                Reveal answer
              </button>
            </>
          )}
          {state.questionError && (
            <button
              type="button"
              onClick={() => send({ type: "trivialPursuit:retryQuestion", payload: {} })}
            >
              Retry question
            </button>
          )}
          {state.phase === "judging" && (
            <>
              <button
                type="button"
                className="is-good"
                onClick={() => send({ type: "trivialPursuit:judge", payload: { correct: true } })}
              >
                Correct
              </button>
              <button
                type="button"
                className="is-bad"
                onClick={() => send({ type: "trivialPursuit:judge", payload: { correct: false } })}
              >
                Incorrect
              </button>
            </>
          )}
        </div>
      )}

      <p className="tp-credit">
        Questions from{" "}
        <a href="https://the-trivia-api.com/docs/" target="_blank" rel="noreferrer">
          The Trivia API
        </a>
      </p>
    </div>
  );
}
