import { FormEvent, useEffect, useRef, useState } from "react";
import type { ClientEvent, SessionState } from "../../../shared/contracts";
import { STORY_BUILDER_SENTENCE_MAX_CHARS } from "../../../shared/contracts";
import { PlayerName } from "../components/PlayerName";

export function StoryBuilderGame({
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
  const game = session.gameState?.type === "storyBuilder" ? session.gameState.state : null;
  const [sentenceInput, setSentenceInput] = useState("");
  const [revealKey, setRevealKey] = useState(0);
  const prevStatus = useRef<string | null>(null);

  useEffect(() => {
    if (game?.status === "building") {
      setSentenceInput("");
    }
  }, [game?.status, game?.status === "building" ? game.currentTurnParticipantId : ""]);

  useEffect(() => {
    if (game?.status === "complete" && prevStatus.current !== "complete") {
      setRevealKey((key) => key + 1);
    }
    prevStatus.current = game?.status ?? null;
  }, [game?.status]);

  if (!game) {
    return null;
  }

  if (game.status === "complete") {
    return (
      <div className="story-builder card">
        <header className="card-head">
          <h2>Story Builder</h2>
          <p className="mode-option-hint">The full story</p>
        </header>
        <article key={revealKey} className="story-builder-reveal" aria-label="Completed story">
          {game.fullStory}
        </article>
        <ul className="story-builder-byline" aria-label="Sentences by author">
          {game.sentences.map((row, index) => (
            <li key={`${index}-${row.participantId ?? "starter"}-${row.text.slice(0, 12)}`}>
              <strong>
                {row.participantId === null ? (
                  "Story starter"
                ) : (
                  <PlayerName participantId={row.participantId} participants={session.participants} size="xs" inline />
                )}
                :
              </strong>{" "}
              {row.text}
            </li>
          ))}
        </ul>
        {isHost && (
          <div className="story-builder-actions">
            <button type="button" className="btn btn-primary" onClick={() => send({ type: "storyBuilder:newStory", payload: {} })}>
              New story
            </button>
          </div>
        )}
      </div>
    );
  }

  const isMyTurn = game.currentTurnParticipantId === currentParticipantId;
  const submitSentence = (event: FormEvent): void => {
    event.preventDefault();
    const trimmed = sentenceInput.trim();
    if (!trimmed || !canPlay) {
      return;
    }
    send({ type: "storyBuilder:submitSentence", payload: { sentence: trimmed } });
    setSentenceInput("");
  };

  const canComplete =
    isHost
    && (game.mode === "stock" || game.sentenceCount > 0);

  return (
    <div className="story-builder card">
      <header className="card-head">
        <h2>Story Builder</h2>
        <p className="mode-option-hint">
          {game.mode === "stock" ? "Using a story starter" : "Starting from scratch"} · {game.sentenceCount}{" "}
          sentence{game.sentenceCount === 1 ? "" : "s"} so far
        </p>
      </header>
      <p className="story-builder-turn-line">
        {isMyTurn ? (
          <span>
            <strong>Your turn</strong> — add the next sentence.
          </span>
        ) : (
          <span>
            Waiting for{" "}
            <strong>
              <PlayerName participantId={game.currentTurnParticipantId} participants={session.participants} size="md" inline />
            </strong>{" "}
            to add a sentence.
          </span>
        )}
      </p>
      {isMyTurn && canPlay && (
        <form className="story-builder-form" onSubmit={submitSentence}>
          {game.lastSentence !== null && (
            <blockquote className="story-builder-context">
              <p>{game.lastSentence}</p>
            </blockquote>
          )}
          {game.isFirstSentence && (
            <p className="mode-option-hint">Write the opening sentence — nobody has written anything yet.</p>
          )}
          <label htmlFor="story-builder-sentence">Your sentence</label>
          <textarea
            id="story-builder-sentence"
            className="input story-builder-textarea"
            maxLength={STORY_BUILDER_SENTENCE_MAX_CHARS}
            value={sentenceInput}
            onChange={(event) => setSentenceInput(event.target.value)}
            rows={3}
            placeholder="Add exactly one sentence…"
          />
          <p className="mode-option-hint">
            {sentenceInput.trim().length}/{STORY_BUILDER_SENTENCE_MAX_CHARS} characters
          </p>
          <button type="submit" className="btn btn-primary">
            Add sentence
          </button>
        </form>
      )}
      {isMyTurn && !canPlay && (
        <p className="story-builder-waiting">You are on the bench and cannot submit for this round.</p>
      )}
      {!isMyTurn && (
        <p className="mode-option-hint">When it is your turn, you will only see the last sentence added.</p>
      )}
      {isHost && (
        <div className="story-builder-actions">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={!canComplete}
            title={
              !canComplete ? "In scratch mode, wait for at least one sentence before completing." : undefined
            }
            onClick={() => {
              if (window.confirm("Reveal the full story to everyone?")) {
                send({ type: "storyBuilder:complete", payload: {} });
              }
            }}
          >
            Complete story
          </button>
        </div>
      )}
    </div>
  );
}
