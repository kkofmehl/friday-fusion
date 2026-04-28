import { useEffect, useState } from "react";
import {
  PICTORY_ROUND_DURATION_DEFAULT_MS,
  PICTORY_ROUND_DURATION_MAX_MS,
  PICTORY_ROUND_DURATION_MIN_MS,
  type ClientEvent,
  type GameType,
  type HangmanMode,
  type SessionState
} from "../../../shared/contracts";
import { PlayerList } from "../components/PlayerList";

const GUESS_IMAGE_LOBBY_EVERYONE = "everyone";

type GameOption = {
  id: GameType;
  title: string;
  description: string;
  emoji: string;
};

const GAMES: GameOption[] = [
  {
    id: "hangman",
    title: "Hangman",
    description: "Host picks a word, everyone else guesses letter by letter.",
    emoji: "A"
  },
  {
    id: "twoTruthsLie",
    title: "Two Truths and a Lie",
    description: "Share three statements. Others vote on which is the lie.",
    emoji: "T"
  },
  {
    id: "trivia",
    title: "Trivia",
    description: "Answer a series of questions across mixed categories.",
    emoji: "Q"
  },
  {
    id: "icebreaker",
    title: "Icebreaker Questions",
    description: "Fun prompts—share answers (and optional photos), then reveal together.",
    emoji: "I"
  },
  {
    id: "guessTheImage",
    title: "Guess the image",
    description: "Image fades in; pick the right caption as fast as you can.",
    emoji: "G"
  },
  {
    id: "twentyQuestions",
    title: "20 Questions",
    description: "One person picks something; others ask yes/no questions until they guess or run out.",
    emoji: "20"
  },
  {
    id: "captionThis",
    title: "Caption This",
    description: "One player supplies an image; everyone captions it, then votes for their favorite.",
    emoji: "C"
  },
  {
    id: "pictionary",
    title: "Pictionary",
    description: "Two teams take turns drawing clues on a shared canvas—guess aloud with your team.",
    emoji: "P"
  }
];

export function LobbyScreen({
  session,
  currentParticipantId,
  isHost,
  send
}: {
  session: SessionState;
  currentParticipantId: string;
  isHost: boolean;
  send: (event: ClientEvent) => void;
}): JSX.Element {
  const [hangmanMode, setHangmanMode] = useState<HangmanMode>("team");
  const [hangmanCreatorId, setHangmanCreatorId] = useState(currentParticipantId);
  const [guessImagePreparer, setGuessImagePreparer] = useState(() => {
    const host = session.participants.find((p) => p.isHost);
    return host?.id ?? session.participants[0]?.id ?? currentParticipantId;
  });
  const [twentyQSelectorId, setTwentyQSelectorId] = useState(() => {
    const host = session.participants.find((p) => p.isHost);
    return host?.id ?? session.participants[0]?.id ?? currentParticipantId;
  });
  const [captionThisProviderId, setCaptionThisProviderId] = useState(() => {
    const host = session.participants.find((p) => p.isHost);
    return host?.id ?? session.participants[0]?.id ?? currentParticipantId;
  });
  const [twentyQMaxQuestions, setTwentyQMaxQuestions] = useState(20);
  const [pictionaryDrawSecs, setPictionaryDrawSecs] = useState(PICTORY_ROUND_DURATION_DEFAULT_MS / 1000);

  useEffect(() => {
    if (session.participants.some((participant) => participant.id === hangmanCreatorId)) {
      return;
    }
    setHangmanCreatorId(session.participants[0]?.id ?? currentParticipantId);
  }, [currentParticipantId, hangmanCreatorId, session.participants]);

  useEffect(() => {
    if (guessImagePreparer === GUESS_IMAGE_LOBBY_EVERYONE) {
      return;
    }
    if (session.participants.some((p) => p.id === guessImagePreparer)) {
      return;
    }
    setGuessImagePreparer(
      session.participants.find((p) => p.isHost)?.id ?? session.participants[0]?.id ?? currentParticipantId
    );
  }, [currentParticipantId, guessImagePreparer, session.participants]);

  useEffect(() => {
    if (session.participants.some((p) => p.id === twentyQSelectorId)) {
      return;
    }
    setTwentyQSelectorId(
      session.participants.find((p) => p.isHost)?.id ?? session.participants[0]?.id ?? currentParticipantId
    );
  }, [currentParticipantId, session.participants, twentyQSelectorId]);

  useEffect(() => {
    if (session.participants.some((p) => p.id === captionThisProviderId)) {
      return;
    }
    setCaptionThisProviderId(
      session.participants.find((p) => p.isHost)?.id ?? session.participants[0]?.id ?? currentParticipantId
    );
  }, [captionThisProviderId, currentParticipantId, session.participants]);

  const startGame = (game: GameType) => {
    if (game === "hangman") {
      send({ type: "game:start", payload: { game, options: { hangmanMode, hangmanCreatorId } } });
      return;
    }
    if (game === "guessTheImage") {
      if (guessImagePreparer === GUESS_IMAGE_LOBBY_EVERYONE) {
        send({
          type: "game:start",
          payload: { game, options: { guessImageSetupMode: "everyone" } }
        });
      } else {
        send({
          type: "game:start",
          payload: { game, options: { guessImageSetupParticipantId: guessImagePreparer } }
        });
      }
      return;
    }
    if (game === "twentyQuestions") {
      const maxQ = Math.min(50, Math.max(1, Math.floor(twentyQMaxQuestions) || 20));
      send({
        type: "game:start",
        payload: {
          game,
          options: {
            twentyQuestionsItemSelectorId: twentyQSelectorId,
            twentyQuestionsMaxQuestions: maxQ
          }
        }
      });
      return;
    }
    if (game === "captionThis") {
      send({
        type: "game:start",
        payload: {
          game,
          options: { captionThisImageProviderId: captionThisProviderId }
        }
      });
      return;
    }
    if (game === "pictionary") {
      const minSec = PICTORY_ROUND_DURATION_MIN_MS / 1000;
      const maxSec = PICTORY_ROUND_DURATION_MAX_MS / 1000;
      const sec = Math.min(maxSec, Math.max(minSec, Math.floor(pictionaryDrawSecs) || minSec));
      send({
        type: "game:start",
        payload: { game, options: { pictionaryRoundDurationMs: sec * 1000 } }
      });
      return;
    }
    send({ type: "game:start", payload: { game } });
  };

  const lobbyPrefs = session.lobbyGamePreferences ?? {};
  const preferenceRows = [...session.participants]
    .filter((p) => lobbyPrefs[p.id])
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  return (
    <div className="lobby-grid">
      <section className="card card-players">
        <header className="card-head">
          <h2>Players</h2>
          <span className="count-pill">{session.participants.length}</span>
        </header>
        <PlayerList session={session} currentParticipantId={currentParticipantId} />
        {isHost && preferenceRows.length > 0 && (
          <ul className="lobby-next-game-votes" aria-label="What guests want to play next">
            {preferenceRows.map((p) => {
              const gid = lobbyPrefs[p.id]!;
              const title = GAMES.find((g) => g.id === gid)?.title ?? gid;
              return (
                <li key={p.id}>
                  <strong>{p.displayName}</strong> wants to play {title}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="card card-games">
        <header className="card-head">
          <h2>Choose a game</h2>
          {!isHost && <span className="pill pill-muted">Host picks</span>}
        </header>
        <div className="game-grid">
          {GAMES.map((game) => (
            <article key={game.id} className="game-card">
              <div className="game-card-emoji" aria-hidden="true">
                {game.emoji}
              </div>
              <h3>{game.title}</h3>
              <p>{game.description}</p>
              {game.id === "hangman" && (
                <fieldset className="mode-picker" disabled={!isHost}>
                  <legend className="mode-picker-label">Mode & creator</legend>
                  <label className={`mode-option${hangmanMode === "team" ? " is-active" : ""}`}>
                    <input
                      type="radio"
                      name="hangman-mode"
                      value="team"
                      checked={hangmanMode === "team"}
                      onChange={() => setHangmanMode("team")}
                    />
                    <span className="mode-option-title">Team vs host</span>
                    <span className="mode-option-hint">Anyone guesses. +1 guessers on win, +1 host on loss.</span>
                  </label>
                  <label className={`mode-option${hangmanMode === "turns" ? " is-active" : ""}`}>
                    <input
                      type="radio"
                      name="hangman-mode"
                      value="turns"
                      checked={hangmanMode === "turns"}
                      onChange={() => setHangmanMode("turns")}
                    />
                    <span className="mode-option-title">Take turns</span>
                    <span className="mode-option-hint">+1 per correct letter, +3 to the solver, -5 for the final miss.</span>
                  </label>
                  <label className="mode-picker-label" htmlFor="hangman-creator-select">
                    Puzzle creator
                  </label>
                  <select
                    id="hangman-creator-select"
                    value={hangmanCreatorId}
                    onChange={(event) => setHangmanCreatorId(event.target.value)}
                  >
                    {session.participants.map((participant) => (
                      <option key={participant.id} value={participant.id}>
                        {participant.displayName}
                      </option>
                    ))}
                  </select>
                </fieldset>
              )}
              {game.id === "guessTheImage" && (
                <fieldset className="mode-picker" disabled={!isHost}>
                  <legend className="mode-picker-label">First-round setup</legend>
                  <label className="mode-picker-label" htmlFor="guess-image-lobby-setup-select">
                    Who prepares the image?
                  </label>
                  <select
                    id="guess-image-lobby-setup-select"
                    value={guessImagePreparer}
                    onChange={(event) => setGuessImagePreparer(event.target.value)}
                  >
                    <option value={GUESS_IMAGE_LOBBY_EVERYONE}>
                      Everyone — each prepares; host picks whose image to guess
                    </option>
                    {session.participants.map((participant) => (
                      <option key={participant.id} value={participant.id}>
                        {participant.displayName}
                        {participant.isHost ? " (host)" : ""}
                      </option>
                    ))}
                  </select>
                </fieldset>
              )}
              {game.id === "twentyQuestions" && (
                <fieldset className="mode-picker" disabled={!isHost}>
                  <legend className="mode-picker-label">Round setup</legend>
                  <label className="mode-picker-label" htmlFor="twenty-q-selector-select">
                    Item selector (answers yes / no)
                  </label>
                  <select
                    id="twenty-q-selector-select"
                    value={twentyQSelectorId}
                    onChange={(event) => setTwentyQSelectorId(event.target.value)}
                  >
                    {session.participants.map((participant) => (
                      <option key={participant.id} value={participant.id}>
                        {participant.displayName}
                        {participant.isHost ? " (host)" : ""}
                      </option>
                    ))}
                  </select>
                  <label className="mode-picker-label" htmlFor="twenty-q-max-questions">
                    Question budget
                  </label>
                  <input
                    id="twenty-q-max-questions"
                    type="number"
                    min={1}
                    max={50}
                    value={twentyQMaxQuestions}
                    onChange={(event) => setTwentyQMaxQuestions(Number(event.target.value))}
                  />
                  <p className="mode-option-hint">1–50 questions (default 20). Guessers take turns asking.</p>
                </fieldset>
              )}
              {game.id === "captionThis" && (
                <fieldset className="mode-picker" disabled={!isHost}>
                  <legend className="mode-picker-label">Round setup</legend>
                  <label className="mode-picker-label" htmlFor="caption-this-provider-select">
                    First image provider
                  </label>
                  <select
                    id="caption-this-provider-select"
                    value={captionThisProviderId}
                    onChange={(event) => setCaptionThisProviderId(event.target.value)}
                  >
                    {session.participants.map((participant) => (
                      <option key={participant.id} value={participant.id}>
                        {participant.displayName}
                        {participant.isHost ? " (host)" : ""}
                      </option>
                    ))}
                  </select>
                  <p className="mode-option-hint">They upload the photo for the first round (needs at least two players).</p>
                </fieldset>
              )}
              {game.id === "pictionary" && (
                <fieldset className="mode-picker" disabled={!isHost}>
                  <legend className="mode-picker-label">Drawing timer</legend>
                  <label className="mode-picker-label" htmlFor="pictionary-draw-seconds">
                    Seconds per drawing turn
                  </label>
                  <input
                    id="pictionary-draw-seconds"
                    type="number"
                    min={PICTORY_ROUND_DURATION_MIN_MS / 1000}
                    max={PICTORY_ROUND_DURATION_MAX_MS / 1000}
                    step={15}
                    value={pictionaryDrawSecs}
                    onChange={(event) => setPictionaryDrawSecs(Number(event.target.value))}
                  />
                  <p className="mode-option-hint">
                    {PICTORY_ROUND_DURATION_MIN_MS / 1000}–{PICTORY_ROUND_DURATION_MAX_MS / 1000} seconds (default{" "}
                    {PICTORY_ROUND_DURATION_DEFAULT_MS / 1000}). Host assigns teams after starting.
                  </p>
                </fieldset>
              )}
              {isHost ? (
                <button type="button" className="btn btn-primary" onClick={() => startGame(game.id)}>
                  Start
                </button>
              ) : (
                <button
                  type="button"
                  className={`btn btn-secondary lobby-want-game${
                    lobbyPrefs[currentParticipantId] === game.id ? " is-selected" : ""
                  }`}
                  onClick={() => send({ type: "lobby:setGamePreference", payload: { game: game.id } })}
                >
                  I want to play this
                </button>
              )}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
