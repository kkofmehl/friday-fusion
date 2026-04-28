import type { ClientEvent, SessionState } from "../../../shared/contracts";
import { PlayerList } from "../components/PlayerList";
import { HangmanGame } from "../games/HangmanGame";
import { IcebreakerGame } from "../games/IcebreakerGame";
import { TwoTruthsGame } from "../games/TwoTruthsGame";
import { TriviaGame } from "../games/TriviaGame";
import { GuessTheImageGame } from "../games/GuessTheImageGame";
import { TwentyQuestionsGame } from "../games/TwentyQuestionsGame";
import { CaptionThisGame } from "../games/CaptionThisGame";

export function GameScreen({
  session,
  currentParticipantId,
  isHost,
  send,
  apiBase
}: {
  session: SessionState;
  currentParticipantId: string;
  isHost: boolean;
  send: (event: ClientEvent) => void;
  apiBase: string;
}): JSX.Element {
  const hangmanState = session.gameState?.type === "hangman" ? session.gameState.state : null;
  const rotatedCreatorId = hangmanState
    ? (
      session.participants.length > 0
        ? session.participants[
          (session.participants.findIndex((participant) => participant.id === hangmanState.puzzleCreatorId) + 1)
          % session.participants.length
        ]?.id ?? hangmanState.puzzleCreatorId
        : hangmanState.puzzleCreatorId
    )
    : null;

  const restartPayload: ClientEvent = session.gameState?.type === "hangman"
    ? {
      type: "game:start",
      payload: {
        game: "hangman",
        options: {
          hangmanMode: session.gameState.state.mode,
          hangmanCreatorId: rotatedCreatorId ?? session.gameState.state.puzzleCreatorId
        }
      }
    }
    : session.gameState?.type === "twentyQuestions"
    ? {
        type: "game:start",
        payload: {
          game: "twentyQuestions",
          options: {
            twentyQuestionsItemSelectorId: session.gameState.state.itemSelectorId,
            twentyQuestionsMaxQuestions: session.gameState.state.maxQuestions
          }
        }
      }
    : session.gameState?.type === "captionThis"
    ? {
        type: "game:start",
        payload: {
          game: "captionThis",
          options: { captionThisImageProviderId: session.gameState.state.imageProviderId }
        }
      }
    : { type: "game:start", payload: { game: session.activeGame ?? "hangman" } };

  const renderGame = () => {
    if (session.gameState?.type === "hangman") {
      return <HangmanGame session={session} currentParticipantId={currentParticipantId} isHost={isHost} send={send} />;
    }
    if (session.gameState?.type === "twoTruthsLie") {
      return <TwoTruthsGame session={session} currentParticipantId={currentParticipantId} isHost={isHost} send={send} />;
    }
    if (session.gameState?.type === "trivia") {
      return (
        <TriviaGame
          session={session}
          currentParticipantId={currentParticipantId}
          isHost={isHost}
          send={send}
          apiBase={apiBase}
        />
      );
    }
    if (session.gameState?.type === "icebreaker") {
      return (
        <IcebreakerGame
          session={session}
          currentParticipantId={currentParticipantId}
          isHost={isHost}
          send={send}
          apiBase={apiBase}
        />
      );
    }
    if (session.gameState?.type === "guessTheImage") {
      return (
        <GuessTheImageGame
          session={session}
          currentParticipantId={currentParticipantId}
          isHost={isHost}
          send={send}
          apiBase={apiBase}
        />
      );
    }
    if (session.gameState?.type === "twentyQuestions") {
      return (
        <TwentyQuestionsGame
          session={session}
          currentParticipantId={currentParticipantId}
          isHost={isHost}
          send={send}
        />
      );
    }
    if (session.gameState?.type === "captionThis") {
      return (
        <CaptionThisGame
          session={session}
          currentParticipantId={currentParticipantId}
          isHost={isHost}
          send={send}
          apiBase={apiBase}
        />
      );
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
              onClick={() => send(restartPayload)}
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
