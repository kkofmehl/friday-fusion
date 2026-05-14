import { FormEvent, useEffect, useState } from "react";
import type { ClientEvent, SessionState } from "../../../shared/contracts";

export function MadlibsGame({
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
  const game = session.gameState?.type === "madlibs" ? session.gameState.state : null;
  const [wordInput, setWordInput] = useState("");

  useEffect(() => {
    if (game?.status === "filling") {
      setWordInput("");
    }
  }, [game?.status, game?.status === "filling" ? game.currentBlankIndex : -1]);

  if (!game) {
    return null;
  }

  const displayNameFor = (participantId: string): string =>
    session.participants.find((participant) => participant.id === participantId)?.displayName ?? "Someone";

  if (game.status === "filling") {
    const isCurrentFiller = currentParticipantId === game.currentFillerId;
    const submitWord = (event: FormEvent): void => {
      event.preventDefault();
      const trimmed = wordInput.trim();
      if (!trimmed) {
        return;
      }
      send({ type: "madlibs:submitWord", payload: { word: trimmed } });
      setWordInput("");
    };

    return (
      <div className="madlibs card">
        <header className="card-head">
          <h2>Madlibs</h2>
          <p className="mode-option-hint">
            Story: {game.templateTitle} ({game.filledCount}/{game.blankCount} filled)
          </p>
        </header>
        <p className="madlibs-turn-line">
          Prompt {game.currentBlankIndex + 1}: <strong>{game.currentPrompt}</strong> — {displayNameFor(game.currentFillerId)}
        </p>
        {isCurrentFiller ? (
          <form className="madlibs-form" onSubmit={submitWord}>
            <label htmlFor="madlibs-word">Your word</label>
            <input
              id="madlibs-word"
              className="input"
              maxLength={60}
              value={wordInput}
              onChange={(event) => setWordInput(event.target.value)}
              placeholder={`Enter a ${game.currentPrompt}`}
            />
            <button type="submit" className="btn btn-primary">
              Submit word
            </button>
          </form>
        ) : (
          <p className="madlibs-waiting">
            Waiting for <strong>{displayNameFor(game.currentFillerId)}</strong> to submit a{" "}
            <strong>{game.currentPrompt}</strong>.
          </p>
        )}
      </div>
    );
  }

  const isReader = currentParticipantId === game.readerParticipantId;

  return (
    <div className="madlibs card">
      <header className="card-head">
        <h2>Madlibs reveal</h2>
        <p className="mode-option-hint">Story: {game.templateTitle}</p>
      </header>
      <p className="madlibs-reader">
        <strong>Reader:</strong> {displayNameFor(game.readerParticipantId)}
      </p>
      {isReader && game.filledStory ? (
        <>
          <article className="madlibs-story" aria-label="Filled Madlib story">
            {game.filledStory}
          </article>
          <ul className="madlibs-submissions" aria-label="Madlibs submissions">
            {game.submissions.map((entry, index) => (
              <li key={`${index}-${entry.participantId}-${entry.prompt}`}>
                <strong>{entry.prompt}:</strong> {entry.word} <span>— {displayNameFor(entry.participantId)}</span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="madlibs-waiting">
          Waiting for <strong>{displayNameFor(game.readerParticipantId)}</strong> to read this one out loud.
        </p>
      )}
      <div className="madlibs-actions">
        {isReader && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => send({ type: "madlibs:passRead", payload: {} })}
          >
            Pass to another reader
          </button>
        )}
        {isHost && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => send({ type: "madlibs:nextRound", payload: {} })}
          >
            Next Madlib
          </button>
        )}
      </div>
    </div>
  );
}
