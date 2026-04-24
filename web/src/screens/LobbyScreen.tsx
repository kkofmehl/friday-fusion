import { useEffect, useState } from "react";
import type {
  ClientEvent,
  GameType,
  HangmanMode,
  SessionState
} from "../../../shared/contracts";
import { PlayerList } from "../components/PlayerList";

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

  useEffect(() => {
    if (session.participants.some((participant) => participant.id === hangmanCreatorId)) {
      return;
    }
    setHangmanCreatorId(session.participants[0]?.id ?? currentParticipantId);
  }, [currentParticipantId, hangmanCreatorId, session.participants]);

  const startGame = (game: GameType) => {
    if (game === "hangman") {
      send({ type: "game:start", payload: { game, options: { hangmanMode, hangmanCreatorId } } });
      return;
    }
    send({ type: "game:start", payload: { game } });
  };

  return (
    <div className="lobby-grid">
      <section className="card card-players">
        <header className="card-head">
          <h2>Players</h2>
          <span className="count-pill">{session.participants.length}</span>
        </header>
        <PlayerList session={session} currentParticipantId={currentParticipantId} />
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
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => startGame(game.id)}
                disabled={!isHost}
              >
                {isHost ? "Start" : "Waiting for host"}
              </button>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
