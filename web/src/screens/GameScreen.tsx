import type { ClientEvent, SessionState } from "../../../shared/contracts";
import { PlayerList } from "../components/PlayerList";
import { HangmanGame } from "../games/HangmanGame";
import { TwoTruthsGame } from "../games/TwoTruthsGame";
import { TriviaGame } from "../games/TriviaGame";

export function GameScreen({
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
  const renderGame = () => {
    if (session.gameState?.type === "hangman") {
      return <HangmanGame session={session} currentParticipantId={currentParticipantId} isHost={isHost} send={send} />;
    }
    if (session.gameState?.type === "twoTruthsLie") {
      return <TwoTruthsGame session={session} currentParticipantId={currentParticipantId} isHost={isHost} send={send} />;
    }
    if (session.gameState?.type === "trivia") {
      return <TriviaGame session={session} currentParticipantId={currentParticipantId} isHost={isHost} send={send} />;
    }
    return null;
  };

  return (
    <div className="lobby-grid">
      <aside className="card card-players">
        <header className="card-head">
          <h2>Players</h2>
          <span className="count-pill">{session.participants.length}</span>
        </header>
        <PlayerList session={session} currentParticipantId={currentParticipantId} />
        {isHost && (
          <div className="card-footer card-footer-actions">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => send({ type: "game:start", payload: { game: session.activeGame ?? "hangman" } })}
              title="Restart the current game"
            >
              Restart game
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => send({ type: "game:end", payload: {} })}
              title="End the current game and return to the lobby"
            >
              End game
            </button>
          </div>
        )}
      </aside>

      <div className="game-stage">{renderGame()}</div>
    </div>
  );
}
