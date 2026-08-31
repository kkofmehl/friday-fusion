import { useEffect, useState } from "react";
import {
  type ApplesToApplesMode,
  PICTORY_ROUND_DURATION_DEFAULT_MS,
  PICTORY_ROUND_DURATION_MAX_MS,
  PICTORY_ROUND_DURATION_MIN_MS,
  type ClientEvent,
  type GameType,
  type HangmanMode,
  type YahtzeeMode,
  type SessionState
} from "../../../shared/contracts";
import { GameAttributeBadge, GameAttributeLegend } from "../components/GameAttributeBadge";
import { PlayerList } from "../components/PlayerList";
import { SessionQueuePanel } from "../components/SessionQueuePanel";
import { MyProfilePanel, type ProfileAuth } from "../components/MyProfilePanel";
import { ProfileViewModal } from "../components/ProfileViewModal";
import { getGameAttributes } from "../../../shared/gameAttributes";
import { buildGameStartPayload, GUESS_IMAGE_LOBBY_EVERYONE } from "../utils/buildGameStartPayload";

type GameOption = {
  id: GameType;
  title: string;
  description: string;
  iconSrc: string;
};

const GAMES: GameOption[] = [
  {
    id: "hangman",
    title: "Hangman",
    description: "Host picks a word, everyone else guesses letter by letter.",
    iconSrc: "/game_icons/hangman.png"
  },
  {
    id: "twoTruthsLie",
    title: "Two Truths and a Lie",
    description: "Share three statements. Others vote on which is the lie.",
    iconSrc: "/game_icons/two_truths_and_one_lie.png"
  },
  {
    id: "trivia",
    title: "Trivia",
    description: "Answer a series of questions across mixed categories.",
    iconSrc: "/game_icons/trivia.png"
  },
  {
    id: "wouldYouRather",
    title: "Would You Rather",
    description: "Pick option A, option B, or pass—then compare room results.",
    iconSrc: "/game_icons/would_you_rather.png"
  },
  {
    id: "icebreaker",
    title: "Icebreaker Questions",
    description: "Fun prompts—share answers (and optional photos), then reveal together.",
    iconSrc: "/game_icons/ice_breaker_questions.png"
  },
  {
    id: "guessWhoSaidIt",
    title: "Guess Who Said It?",
    description: "Stock prompts, anonymous answers, then guess who said what—earn points for correct matches.",
    iconSrc: "/game_icons/guess_who_said_it.png"
  },
  {
    id: "guessTheImage",
    title: "Guess the image",
    description: "Image fades in; pick the right caption as fast as you can.",
    iconSrc: "/game_icons/guess_the_image.png"
  },
  {
    id: "twentyQuestions",
    title: "20 Questions",
    description: "One person picks something; others ask yes/no questions until they guess or run out.",
    iconSrc: "/game_icons/20_questions.png"
  },
  {
    id: "captionThis",
    title: "Caption This",
    description: "One player supplies an image; everyone captions it, then votes for their favorite.",
    iconSrc: "/game_icons/caption_this.png"
  },
  {
    id: "pictionary",
    title: "Pictionary",
    description: "Two teams take turns drawing clues on a shared canvas—guess aloud with your team.",
    iconSrc: "/game_icons/pictionary.png"
  },
  {
    id: "applesToApples",
    title: "Apples to Apples",
    description:
      "Rotating judge, topic card, and hidden responses—stock phrases in JSON (original content, easy to expand).",
    iconSrc: "/game_icons/apples_to_apples.png"
  },
  {
    id: "uno",
    title: "UNO",
    description: "Classic color and number matching—skip, reverse, wilds, declare UNO, and catch missed calls.",
    iconSrc: "/game_icons/uno.png"
  },
  {
    id: "bs",
    title: "BS",
    description: "Bluff your way through A-to-K declarations—others can believe you or call BS.",
    iconSrc: "/game_icons/bs.png"
  },
  {
    id: "monopolyDeal",
    title: "Monopoly Deal",
    description:
      "Collect three property sets—bank money, charge rent, steal deals, and wager Friday Fusion points for the pot.",
    iconSrc: "/game_icons/monopoly_deal.png"
  },
  {
    id: "madlibs",
    title: "Madlibs",
    description: "Take turns filling prompts, then reveal a ridiculous story for a random reader.",
    iconSrc: "/game_icons/madlibs.png"
  },
  {
    id: "catchPhrase",
    title: "Catch Phrase",
    description: "Two teams pass the device around with a hidden timer racing in the background.",
    iconSrc: "/game_icons/catchphrase.png"
  },
  {
    id: "yahtzee",
    title: "Yahtzee",
    description:
      "Take turns rolling five dice, holding what you like, then score a row—Friday Fusion adds placement points when the game ends.",
    iconSrc: "/game_icons/yahtzee.png"
  },
  {
    id: "scattergories",
    title: "Scattergories",
    description:
      "Race the clock to fill categories for a random letter—then the host scores each answer together.",
    iconSrc: "/game_icons/scattegories.png"
  },
  {
    id: "storyBuilder",
    title: "Story Builder",
    description:
      "Build a story one sentence at a time—each player only sees the line before theirs, then everyone reads the full tale together.",
    iconSrc: "/game_icons/story_builder.png"
  },
  {
    id: "memory",
    title: "Memory",
    description:
      "Classic matching pairs using Friday Fusion game icons. Match to score and go again; miss and the turn passes after a short reveal.",
    iconSrc: "/game_icons/memory.png"
  },
  {
    id: "wordle",
    title: "Wordle Race",
    description:
      "Everyone races the same 5-letter word after a 3-2-1 countdown. Watch live mini boards, then earn inverse placement Friday Fusion points.",
    iconSrc: "/game_icons/wordle.png"
  }
];

const GAME_TITLES_BY_ID = Object.fromEntries(GAMES.map((game) => [game.id, game.title])) as Record<GameType, string>;

export function LobbyScreen({
  session,
  currentParticipantId,
  isHost,
  send,
  apiBase = "",
  profileAuth = null,
  onProfileAuthChange = () => {}
}: {
  session: SessionState;
  currentParticipantId: string;
  isHost: boolean;
  send: (event: ClientEvent) => void;
  apiBase?: string;
  profileAuth?: ProfileAuth | null;
  onProfileAuthChange?: (auth: ProfileAuth | null) => void;
}): JSX.Element {
  const activeRoster = session.participants.filter((p) => p.isActive !== false);
  const me = session.participants.find((p) => p.id === currentParticipantId);
  const canInteractAsGuest = me?.isActive !== false;
  const waitingOnBenchDuringGame = Boolean(session.activeGame && !canInteractAsGuest);
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
  const [applesMode, setApplesMode] = useState<ApplesToApplesMode>("standard");
  const [yahtzeeMode, setYahtzeeMode] = useState<YahtzeeMode>("turns");
  const [wouldYouRatherQuestions, setWouldYouRatherQuestions] = useState(10);
  const [wouldYouRatherAllowSubmissions, setWouldYouRatherAllowSubmissions] = useState(true);
  const [storyBuilderMode, setStoryBuilderMode] = useState<"stock" | "scratch">("stock");
  const [storyBuilderFirstTurnId, setStoryBuilderFirstTurnId] = useState(() => {
    const host = session.participants.find((p) => p.isHost);
    return host?.id ?? session.participants[0]?.id ?? currentParticipantId;
  });
  const [memoryBoardSize, setMemoryBoardSize] = useState<"30" | "36">("30");
  const [profileModalParticipantId, setProfileModalParticipantId] = useState<string | null>(null);
  const [showMyProfile, setShowMyProfile] = useState(false);

  useEffect(() => {
    if (activeRoster.some((participant) => participant.id === hangmanCreatorId)) {
      return;
    }
    setHangmanCreatorId(activeRoster[0]?.id ?? currentParticipantId);
  }, [currentParticipantId, hangmanCreatorId, activeRoster]);

  useEffect(() => {
    if (guessImagePreparer === GUESS_IMAGE_LOBBY_EVERYONE) {
      return;
    }
    if (activeRoster.some((p) => p.id === guessImagePreparer)) {
      return;
    }
    setGuessImagePreparer(
      activeRoster.find((p) => p.isHost)?.id ?? activeRoster[0]?.id ?? currentParticipantId
    );
  }, [currentParticipantId, guessImagePreparer, activeRoster]);

  useEffect(() => {
    if (activeRoster.some((p) => p.id === twentyQSelectorId)) {
      return;
    }
    setTwentyQSelectorId(
      activeRoster.find((p) => p.isHost)?.id ?? activeRoster[0]?.id ?? currentParticipantId
    );
  }, [currentParticipantId, activeRoster, twentyQSelectorId]);

  useEffect(() => {
    if (activeRoster.some((p) => p.id === captionThisProviderId)) {
      return;
    }
    setCaptionThisProviderId(
      activeRoster.find((p) => p.isHost)?.id ?? activeRoster[0]?.id ?? currentParticipantId
    );
  }, [captionThisProviderId, currentParticipantId, activeRoster]);

  useEffect(() => {
    if (activeRoster.some((p) => p.id === storyBuilderFirstTurnId)) {
      return;
    }
    setStoryBuilderFirstTurnId(
      activeRoster.find((p) => p.isHost)?.id ?? activeRoster[0]?.id ?? currentParticipantId
    );
  }, [currentParticipantId, activeRoster, storyBuilderFirstTurnId]);

  const lobbyGameOptions = {
    hangmanMode,
    hangmanCreatorId,
    guessImagePreparer,
    twentyQSelectorId,
    twentyQMaxQuestions,
    captionThisProviderId,
    pictionaryDrawSecs,
    applesMode,
    yahtzeeMode,
    wouldYouRatherQuestions,
    wouldYouRatherAllowSubmissions,
    storyBuilderMode,
    storyBuilderFirstTurnId,
    memoryBoardSize
  };

  const startGame = (game: GameType) => {
    send({ type: "game:start", payload: buildGameStartPayload(game, lobbyGameOptions) });
  };

  const queueGame = (game: GameType) => {
    send({ type: "queue:add", payload: buildGameStartPayload(game, lobbyGameOptions) });
  };

  const lobbyPrefs = session.lobbyGamePreferences ?? {};
  const preferenceRows = [...session.participants]
    .filter((p) => lobbyPrefs[p.id])
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  return (
    <div className="lobby-grid">
      <div className="lobby-side-rail">
        <section className="card card-players">
          <header className="card-head">
            <h2>Players</h2>
            <span className="count-pill">{session.participants.length}</span>
          </header>
          <PlayerList
            session={session}
            currentParticipantId={currentParticipantId}
            isHost={isHost}
            send={send}
            allowActivate
            onViewProfile={setProfileModalParticipantId}
          />
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
          <SessionQueuePanel
            session={session}
            isHost={isHost}
            send={send}
            mode="lobby"
            gameTitlesById={GAME_TITLES_BY_ID}
          />
          <div className="card-footer card-footer-actions">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setShowMyProfile((open) => !open)}
            >
              {showMyProfile ? "Hide Profile" : "Create/Load Profile"}
            </button>
          </div>
        </section>
        {showMyProfile && (
          <MyProfilePanel
            apiBase={apiBase}
            sessionId={session.sessionId}
            send={send}
            hasLinkedProfile={Boolean(session.participants.find((participant) => participant.id === currentParticipantId)?.hasProfile)}
            profileAuth={profileAuth}
            onProfileAuthChange={onProfileAuthChange}
          />
        )}
      </div>

      {waitingOnBenchDuringGame ? (
        <section className="card card-games" aria-label="Game in progress">
          <header className="card-head">
            <h2>Game in progress</h2>
          </header>
          <p>You are on the bench for this round, so you stay here until the game ends.</p>
          <p className="mode-option-hint">The host can activate you in the player list after returning to the lobby.</p>
        </section>
      ) : (
        <section className="card card-games">
          <header className="card-head">
            <h2>Choose a game</h2>
            {!isHost && <span className="pill pill-muted">Host picks</span>}
          </header>
          <GameAttributeLegend />
          <div className="game-grid">
            {GAMES.map((game) => (
            <article key={game.id} className="game-card">
              <div className="game-card-emoji" aria-hidden="true">
                <img className="game-card-icon" src={game.iconSrc} alt="" loading="lazy" />
              </div>
              <h3>{game.title}</h3>
              <ul className="game-card-attributes" aria-label={`${game.title} attributes`}>
                {getGameAttributes(game.id).map((attr) => (
                  <li key={attr}>
                    <GameAttributeBadge attribute={attr} />
                  </li>
                ))}
              </ul>
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
                    {activeRoster.map((participant) => (
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
                    {activeRoster.map((participant) => (
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
                    {activeRoster.map((participant) => (
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
              {game.id === "wouldYouRather" && (
                <fieldset className="mode-picker" disabled={!isHost}>
                  <legend className="mode-picker-label">Round setup</legend>
                  <label className="mode-picker-label" htmlFor="would-you-rather-count">
                    How many prompts?
                  </label>
                  <input
                    id="would-you-rather-count"
                    type="number"
                    min={1}
                    max={200}
                    value={wouldYouRatherQuestions}
                    onChange={(event) => setWouldYouRatherQuestions(Number(event.target.value))}
                  />
                  <label className={`mode-option${wouldYouRatherAllowSubmissions ? " is-active" : ""}`}>
                    <input
                      type="checkbox"
                      checked={wouldYouRatherAllowSubmissions}
                      onChange={(event) => setWouldYouRatherAllowSubmissions(event.target.checked)}
                    />
                    <span className="mode-option-title">Allow player-submitted prompts during the round</span>
                    <span className="mode-option-hint">Host can approve or reject submissions before running them.</span>
                  </label>
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
                    {activeRoster.map((participant) => (
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
              {game.id === "applesToApples" && (
                <fieldset className="mode-picker" disabled={!isHost}>
                  <legend className="mode-picker-label">Mode</legend>
                  <label className={`mode-option${applesMode === "standard" ? " is-active" : ""}`}>
                    <input
                      type="radio"
                      name="apples-mode"
                      value="standard"
                      checked={applesMode === "standard"}
                      onChange={() => setApplesMode("standard")}
                    />
                    <span className="mode-option-title">Standard</span>
                    <span className="mode-option-hint">
                      After each round everyone redraws to six response cards.
                    </span>
                  </label>
                  <label className={`mode-option${applesMode === "finite" ? " is-active" : ""}`}>
                    <input
                      type="radio"
                      name="apples-mode"
                      value="finite"
                      checked={applesMode === "finite"}
                      onChange={() => setApplesMode("finite")}
                    />
                    <span className="mode-option-title">Finite</span>
                    <span className="mode-option-hint">
                      No redraws—exactly six table rounds, then the game ends (leftover cards are fine).
                    </span>
                  </label>
                  <p className="mode-option-hint">Needs at least three active players.</p>
                </fieldset>
              )}
              {game.id === "yahtzee" && (
                <fieldset className="mode-picker" disabled={!isHost}>
                  <legend className="mode-picker-label">Mode</legend>
                  <label className={`mode-option${yahtzeeMode === "turns" ? " is-active" : ""}`}>
                    <input
                      type="radio"
                      name="yahtzee-mode"
                      value="turns"
                      checked={yahtzeeMode === "turns"}
                      onChange={() => setYahtzeeMode("turns")}
                    />
                    <span className="mode-option-title">Classic turns</span>
                    <span className="mode-option-hint">One active roller at a time, passing after selecting a row.</span>
                  </label>
                  <label className={`mode-option${yahtzeeMode === "simultaneous" ? " is-active" : ""}`}>
                    <input
                      type="radio"
                      name="yahtzee-mode"
                      value="simultaneous"
                      checked={yahtzeeMode === "simultaneous"}
                      onChange={() => setYahtzeeMode("simultaneous")}
                    />
                    <span className="mode-option-title">Simultaneous</span>
                    <span className="mode-option-hint">
                      Everyone plays their own board at once; live progress tracks totals and rounds left.
                    </span>
                  </label>
                </fieldset>
              )}
              {game.id === "memory" && (
                <fieldset className="mode-picker" disabled={!isHost}>
                  <legend className="mode-picker-label">Board size</legend>
                  <label className={`mode-option${memoryBoardSize === "30" ? " is-active" : ""}`}>
                    <input
                      type="radio"
                      name="memory-board"
                      value="30"
                      checked={memoryBoardSize === "30"}
                      onChange={() => setMemoryBoardSize("30")}
                    />
                    <span className="mode-option-title">30 cards</span>
                    <span className="mode-option-hint">15 pairs in a 6×5 grid.</span>
                  </label>
                  <label className={`mode-option${memoryBoardSize === "36" ? " is-active" : ""}`}>
                    <input
                      type="radio"
                      name="memory-board"
                      value="36"
                      checked={memoryBoardSize === "36"}
                      onChange={() => setMemoryBoardSize("36")}
                    />
                    <span className="mode-option-title">36 cards</span>
                    <span className="mode-option-hint">18 pairs in a 6×6 grid (more game icons).</span>
                  </label>
                  <p className="mode-option-hint">Needs at least two active players.</p>
                </fieldset>
              )}
              {game.id === "storyBuilder" && (
                <fieldset className="mode-picker" disabled={!isHost}>
                  <legend className="mode-picker-label">Story setup</legend>
                  <label className={`mode-option${storyBuilderMode === "stock" ? " is-active" : ""}`}>
                    <input
                      type="radio"
                      name="story-builder-mode"
                      value="stock"
                      checked={storyBuilderMode === "stock"}
                      onChange={() => setStoryBuilderMode("stock")}
                    />
                    <span className="mode-option-title">Use a story starter</span>
                    <span className="mode-option-hint">Everyone builds on a random opening line from the library.</span>
                  </label>
                  <label className={`mode-option${storyBuilderMode === "scratch" ? " is-active" : ""}`}>
                    <input
                      type="radio"
                      name="story-builder-mode"
                      value="scratch"
                      checked={storyBuilderMode === "scratch"}
                      onChange={() => setStoryBuilderMode("scratch")}
                    />
                    <span className="mode-option-title">Start from scratch</span>
                    <span className="mode-option-hint">The first writer opens the story with no prior context.</span>
                  </label>
                  <label className="mode-picker-label" htmlFor="story-builder-first-turn">
                    Who goes first
                  </label>
                  <select
                    id="story-builder-first-turn"
                    value={storyBuilderFirstTurnId}
                    onChange={(event) => setStoryBuilderFirstTurnId(event.target.value)}
                  >
                    {activeRoster.map((participant) => (
                      <option key={participant.id} value={participant.id}>
                        {participant.displayName}
                        {participant.isHost ? " (host)" : ""}
                      </option>
                    ))}
                  </select>
                  <p className="mode-option-hint">Needs at least two active players.</p>
                </fieldset>
              )}
              {isHost ? (
                <div className="game-card-actions">
                  <button type="button" className="btn btn-primary" onClick={() => startGame(game.id)}>
                    Start
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={() => queueGame(game.id)}>
                    Queue
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className={`btn btn-secondary lobby-want-game${
                    lobbyPrefs[currentParticipantId] === game.id ? " is-selected" : ""
                  }`}
                  disabled={!canInteractAsGuest}
                  title={!canInteractAsGuest ? "You are benched and cannot vote from the lobby." : undefined}
                  onClick={() => send({ type: "lobby:setGamePreference", payload: { game: game.id } })}
                >
                  I want to play this
                </button>
              )}
            </article>
            ))}
          </div>
        </section>
      )}
      <ProfileViewModal
        apiBase={apiBase}
        sessionId={session.sessionId}
        participantId={profileModalParticipantId}
        onClose={() => setProfileModalParticipantId(null)}
      />
    </div>
  );
}
