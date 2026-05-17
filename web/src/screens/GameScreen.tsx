import type { ClientEvent, SessionState } from "../../../shared/contracts";
import { PlayerList } from "../components/PlayerList";
import { HangmanGame } from "../games/HangmanGame";
import { activeParticipants } from "../utils/participants";
import { IcebreakerGame } from "../games/IcebreakerGame";
import { GuessWhoSaidItGame } from "../games/GuessWhoSaidItGame";
import { TwoTruthsGame } from "../games/TwoTruthsGame";
import { TriviaGame } from "../games/TriviaGame";
import { GuessTheImageGame } from "../games/GuessTheImageGame";
import { TwentyQuestionsGame } from "../games/TwentyQuestionsGame";
import { CaptionThisGame } from "../games/CaptionThisGame";
import { PictionaryGame } from "../games/PictionaryGame";
import { ApplesToApplesGame } from "../games/ApplesToApplesGame";
import { UnoGame } from "../games/UnoGame";
import { BsGame } from "../games/BsGame";
import { MadlibsGame } from "../games/MadlibsGame";
import { CatchPhraseGame } from "../games/CatchPhraseGame";
import { YahtzeeGame } from "../games/YahtzeeGame";
import { ScattergoriesGame } from "../games/ScattergoriesGame";

const GAME_ICON_BY_ID: Record<string, string> = {
  hangman: "/game_icons/hangman.png",
  twoTruthsLie: "/game_icons/two_truths_and_one_lie.png",
  trivia: "/game_icons/trivia.png",
  icebreaker: "/game_icons/ice_breaker_questions.png",
  guessWhoSaidIt: "/game_icons/guess_who_said_it.png",
  guessTheImage: "/game_icons/guess_the_image.png",
  twentyQuestions: "/game_icons/20_questions.png",
  captionThis: "/game_icons/caption_this.png",
  pictionary: "/game_icons/pictionary.png",
  applesToApples: "/game_icons/apples_to_apples.png",
  uno: "/game_icons/uno.png",
  bs: "/game_icons/bs.png",
  madlibs: "/game_icons/madlibs.png",
  catchPhrase: "/game_icons/catchphrase.png",
  yahtzee: "/game_icons/yahtzee.png",
  scattergories: "/game_icons/scattegories.png"
};

export function GameScreen({
  session,
  currentParticipantId,
  isHost,
  canPlay,
  send,
  apiBase
}: {
  session: SessionState;
  currentParticipantId: string;
  isHost: boolean;
  /** When false, the current user is benched and cannot interact with the game surface. */
  canPlay: boolean;
  send: (event: ClientEvent) => void;
  apiBase: string;
}): JSX.Element {
  const hangmanState = session.gameState?.type === "hangman" ? session.gameState.state : null;
  const hangmanRoster = hangmanState ? activeParticipants(session.participants) : [];
  const rotatedCreatorId = hangmanState
    ? (
      hangmanRoster.length > 0
        ? hangmanRoster[
          (hangmanRoster.findIndex((participant) => participant.id === hangmanState.puzzleCreatorId) + 1)
          % hangmanRoster.length
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
    : session.gameState?.type === "pictionary"
    ? {
        type: "game:start",
        payload: {
          game: "pictionary",
          options: { pictionaryRoundDurationMs: session.gameState.state.roundDurationMs }
        }
      }
    : session.gameState?.type === "applesToApples"
    ? {
        type: "game:start",
        payload: {
          game: "applesToApples",
          options: { applesToApplesMode: session.gameState.state.mode }
        }
      }
    : session.gameState?.type === "uno"
    ? { type: "game:start", payload: { game: "uno" } }
    : session.gameState?.type === "bs"
    ? { type: "game:start", payload: { game: "bs" } }
    : session.gameState?.type === "madlibs"
    ? { type: "game:start", payload: { game: "madlibs" } }
    : session.gameState?.type === "yahtzee"
    ? {
        type: "game:start",
        payload: { game: "yahtzee", options: { yahtzeeMode: session.gameState.state.mode } }
      }
    : session.gameState?.type === "scattergories"
    ? { type: "game:start", payload: { game: "scattergories" } }
    : { type: "game:start", payload: { game: session.activeGame ?? "hangman" } };
  const currentGameId = session.gameState?.type ?? session.activeGame;
  const currentGameIcon = currentGameId ? GAME_ICON_BY_ID[currentGameId] : null;

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
    if (session.gameState?.type === "guessWhoSaidIt") {
      return (
        <GuessWhoSaidItGame
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
    if (session.gameState?.type === "pictionary") {
      return (
        <PictionaryGame
          session={session}
          currentParticipantId={currentParticipantId}
          isHost={isHost}
          send={send}
        />
      );
    }
    if (session.gameState?.type === "applesToApples") {
      return (
        <ApplesToApplesGame
          session={session}
          currentParticipantId={currentParticipantId}
          isHost={isHost}
          canPlay={canPlay}
          send={send}
        />
      );
    }
    if (session.gameState?.type === "uno") {
      return (
        <UnoGame
          session={session}
          currentParticipantId={currentParticipantId}
          isHost={isHost}
          canPlay={canPlay}
          send={send}
        />
      );
    }
    if (session.gameState?.type === "bs") {
      return (
        <BsGame
          session={session}
          currentParticipantId={currentParticipantId}
          isHost={isHost}
          canPlay={canPlay}
          send={send}
        />
      );
    }
    if (session.gameState?.type === "madlibs") {
      return (
        <MadlibsGame
          session={session}
          currentParticipantId={currentParticipantId}
          isHost={isHost}
          send={send}
        />
      );
    }
    if (session.gameState?.type === "catchPhrase") {
      return (
        <CatchPhraseGame
          session={session}
          currentParticipantId={currentParticipantId}
          isHost={isHost}
          send={send}
        />
      );
    }
    if (session.gameState?.type === "yahtzee") {
      return (
        <YahtzeeGame
          session={session}
          currentParticipantId={currentParticipantId}
          isHost={isHost}
          canPlay={canPlay}
          send={send}
        />
      );
    }
    if (session.gameState?.type === "scattergories") {
      return (
        <ScattergoriesGame
          session={session}
          currentParticipantId={currentParticipantId}
          isHost={isHost}
          canPlay={canPlay}
          send={send}
          apiBase={apiBase}
        />
      );
    }
    return null;
  };

  return (
    <div className="lobby-grid">
      <div className="game-side-rail">
        <aside className="card card-players">
          <header className="card-head">
            <h2>Players</h2>
            <span className="count-pill">{session.participants.length}</span>
          </header>
          <PlayerList
            session={session}
            currentParticipantId={currentParticipantId}
            isHost={isHost}
            send={send}
            allowActivate={false}
            allowBench={false}
          />
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
        {currentGameIcon && (
          <div className="card game-side-icon-card" aria-label="Current game icon">
            <img src={currentGameIcon} alt="" className="game-side-icon-image" loading="lazy" />
          </div>
        )}
      </div>

      <div className={`game-stage${canPlay ? "" : " game-stage--readonly"}`}>{renderGame()}</div>
    </div>
  );
}
