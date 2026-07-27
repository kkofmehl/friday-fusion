# Prompt Log

## 2026-04-21

1. User requested creation of a Friday Fusion web app MVP with:
   - landing page for session create/join,
   - websocket realtime updates,
   - Hangman, Two Truths and a Lie, and Trivia,
   - Fly.io deployment and file-backed persistence.
2. Assistant asked for stack choice and auth level.
3. User selected:
   - TypeScript full-stack (`React + Node + WebSockets`)
   - display-name-only session login (no passwords).
4. User requested implementation of the accepted MVP plan and completion of all plan to-dos, without modifying the plan file.
5. User requested UI refinements inspired by `../pointing-poker` session join style and asked for a professional light-blue palette with gray accents.
6. User approved an additional UI pass for the dashboard/game shell with section headers, status badges, and polished in-game presentation.
7. User requested subtle animated transitions for a more premium UI experience; implemented non-intrusive motion for cards, badges, rows, and button interactions.
8. User approved adding current-turn highlighting across game states; added per-player turn badges in the dashboard player list.
9. User requested adding compact role/turn icons; added letter-based icon tokens inside host and turn chips for faster scanning.
10. User reported bugs and requested a single-screen session flow, active session dropdown, human-readable word session codes, and investigation/fix for game-start interaction reliability.
11. User reported inability to create sessions; fixed frontend API base resolution to target backend `:3000` during local Vite dev on `:5173`.
12. User reported websocket stuck at "Connecting realtime..."; improved websocket URL resolution/queueing in client and changed server dev script to hot-reload server changes.
13. User still observed realtime stuck; diagnosed stale port-3000 process and updated root dev script to use a managed concurrent runner for cleaner process lifecycle.
14. User reported `/api/sessions/active` still returning 500; added defensive server fallback for `"active"` path handling and improved session lookup error response behavior.
15. User still received 500 on active sessions route; added non-overlapping endpoint (`/api/active-sessions`) and updated frontend with fallback loading logic.
16. User still saw realtime stuck after endpoint fix; hardened websocket state management to ignore stale socket close/error events during dev-mode remount cycles.
17. User reported the implementation still felt broken and asked for a once-over covering UI and WebSocket reliability; assistant drafted the Friday Fusion Cleanup plan (full UI refresh, WS resilience, local dev scope).
18. User approved the cleanup plan. Assistant implemented:
    - Server WS hardening: added `ping`/`pong` contract, dedup connections per `participantId`, loud Zod error logging, dead-socket cleanup interval, removed legacy `/api/sessions/active` route, extracted `buildApp` so tests can boot against an ephemeral port.
    - Client `useRealtime` hook with single-owned socket, exponential backoff reconnect, heartbeat ping + pong timeout, and pending-event queue flushed on reconnect.
    - WS integration tests spinning up a real `ws` client for handshake, ping/pong, and hello-dedup behavior.
    - Split `App.tsx` into `LandingScreen`, `LobbyScreen`, `GameScreen`, plus `HangmanGame`, `TwoTruthsGame`, `TriviaGame`, and shared `TopBar` / `ConnectionPill` / `PlayerList` / `Toast` components.
    - Game UX: A-Z keyboard with used/hit/miss states and SVG gallows for Hangman, phase-gated flow with highlighted lie and vote tallies for Two Truths, option buttons with correct/wrong highlighting for Trivia.
    - Visual refresh: indigo palette, softer shadows, sticky top bar with live connection pill, auto-dismissing toast for errors.
    - Added `revealedWord` to hangman state so the answer can be shown on win/lose.
19. Fixed a runtime bug blocking the dev server: `nanoid@4` is ESM-only and broke `ts-node-dev` with `ERR_REQUIRE_ESM`. Downgraded to `nanoid@^3.3.11` (CJS-compatible, no API change). Verified HTTP, WS handshake, and ping/pong end-to-end against a running dev server.

## 2026-04-23

20. User reported stale sessions lingering and requested: auto-close sessions when everyone leaves, a host "close session" button, a way to leave the current game back to the dashboard, future-proofing toward multiple concurrent games per session, a hangman "turn-based" variant (+1 per correct letter, +3 for solving, -5 for finishing the hangman), and clarification of existing "team vs host" scoring. Also confirmed team-mode host-loss points should be 1 instead of 2.
21. Assistant clarified scope via a questionnaire: chose to defer true multi-game to a later pass but redesign the internal data model now (`games[]` array, single active game enforced in UI), host-only permissions for end-game and close-session, and penalty in turn-mode applies only to the guesser whose final wrong guess completes the hangman.
22. Implemented and tested:
    - Shared contract: added `hangmanMode`, `currentTurnId`, `session:leave` / `session:close` / `game:end` client events, `session:closed` server event, `game:start` options payload.
    - Server: refactored `SessionService` to an internal `games[]` array (preserving public wire format), added `removeParticipant` / `closeSession` / `closeSessionUnchecked` / `endActiveGame`, hangman mode-aware scoring + turn rotation, host-promotion when a host leaves, auto-drop of active hangman if the creator leaves. Added WS handlers for the new events, a `session:closed` broadcast that closes remaining sockets, and an abandoned-session cleanup (sessions with no active WS for 10 minutes are removed automatically).
    - Client: `useRealtime` surfaces `session:closed` to the app. `App.tsx` sends `session:leave` on the Leave button and reacts to host-closed / empty closures with a notice back on the landing page. `TopBar` gained a host-only "Close session" button with a confirm prompt. `LobbyScreen` gained a team-vs-host / take-turns mode picker for hangman. `GameScreen` gained a host-only "End game" button. `HangmanGame` shows the active mode plus a turn indicator and disables the keyboard when it isn't the current guesser's turn.
    - Tests: added `SessionService` tests for participant removal + empty-session cleanup, host close/end-game permissions, the team-mode host-loss (+1), turn-rotation + per-letter scoring + solver bonus, and the last-wrong-guess penalty. Added HangmanGame UI tests for turn-locked keyboard states. Enabled vitest `globals: true` so @testing-library/react auto-cleans rendered output between tests.
23. User reported a follow-on bug: in turns mode the active guesser's keyboard stayed disabled (letters not clickable). Asked for host controls to (a) override the current guesser at any time and (b) reorder guessers, drag-and-drop if possible.
24. Investigated the stuck session and found `currentTurnId: null` persisted after the host set the word before any guessers had joined; `firstGuesserId` returned null and there was no recovery path. Implemented and tested:
    - Server: in `joinSession`, if an in-progress turns-mode hangman has no `currentTurnId`, assign it to the new guesser. Added a defensive safety net in `guessHangmanLetter` so a null pointer gets claimed by the first acting guesser instead of locking the round. Added `setHangmanTurn` (host-only override) and `reorderParticipants` (host-only). Wired `hangman:setTurn` and `session:reorderParticipants` through the WS handler and the shared contract.
    - Client: new `TurnOrderPanel` rendered inside `HangmanGame` in turns mode — host can click a name to set the current guesser and drag tiles to reorder. Non-hosts see it read-only. Mirrored the server safety net in the UI so the keyboard enables for any non-creator when the turn pointer is orphaned.
    - Tests: added server tests for the join-fix, `setHangmanTurn` happy path + permission + invalid-target rejections, and `reorderParticipants` happy path + permission + validation. Added web tests for the TurnOrderPanel: listing order, host click dispatches `hangman:setTurn`, no-op on the already-current guesser, non-host has no interactive controls, drag-and-drop dispatches `session:reorderParticipants` with the full session-wide order.
25. User asked for a new Solve action: on their turn (or any time in Team vs host, per follow-up), a guesser can type the full word/phrase; spaces and punctuation are ignored; a correct solve wins the round, a wrong solve advances the hangman without revealing the guess. Confirmed via follow-up that Solve should be available in both modes and that team-mode correct solves follow the normal team payout (+1 to every guesser).
26. Implemented and tested:
    - Contract: `hangman:solve` client event with `{ guess }`.
    - Server: `solveHangman` normalizes both sides via `/[^A-Z]/g` + uppercase, enforces active round + non-creator + turn pointer (with the same safety-net rescue). Correct solve in turns mode gives the solver +3; correct in team mode gives +1 to every non-creator guesser. Incorrect solve increments `wrongGuessCount` only (no letter added, no text broadcast); if that hit completes the hangman, the solver takes -5 in turns mode or the host earns +1 in team mode, otherwise the turn rotates in turns mode.
    - Client: `HangmanGame` gained a Solve button under the keyboard (only visible to non-creator guessers mid-round) that expands into an inline form. A local "awaiting -> wrong" state machine compares `wrongGuessCount` against a ref to show a private "Not correct" banner to the submitter without revealing the guess to anyone else.
    - Tests: five new server cases (correct turns solve with space-insensitive match, incorrect turns solve rotates without touching maskedWord, last wrong solve in turns mode applies -5, correct team solve pays +1 to all guessers, creator cannot solve) and two new web cases (active guesser's Solve button submits `hangman:solve` with the trimmed guess; non-active guesser's Solve button is disabled). Full suite: 28 server tests and 15 web tests green.
27. User requested additional Hangman fixes and UX updates:
    - Turns mode scoring: when the guessers lose on the final miss, keep `-5` on the acting guesser/solver and also award `+5` to the puzzle creator.
    - Creator assignment: stop forcing host as creator; host can choose any participant as puzzle creator when starting Hangman (and restart preserves selected mode/creator).
    - Solve input copy: replaced suggestion-like placeholder with neutral `Type guess here`.
    - Team mode activity + lock UX: added shared action feed entries (`letterCorrect`, `letterWrong`, `solveAttempt`, `solveCancelled`) and a synchronized team-only solve lock (`activeSolverId`) so when one player opens Solve, everyone else is blocked until submit/cancel; wrong submit unlocks and continues, correct submit ends the round.
    - Wiring and tests:
      - Extended shared contracts with `hangmanCreatorId`, `hangman:solveOpen`, `hangman:solveCancel`, `activeSolverId`, and `activityLog`.
      - Added server handlers/methods for solve open/cancel lock lifecycle and creator validation.
      - Added/updated server tests for creator selection validation, creator +5 on turns-loss paths, and team-mode lock/activity behavior.
      - Added/updated web tests for lobby creator payload, new solve placeholder, team lock rendering, and activity feed rendering.
      - Full suite now green: 32 server tests and 18 web tests.
28. User tested and reported follow-up issues: feedback log not visible during turns mode play and next-round flow still prompting host as creator after round end. Assistant re-audited plan vs implementation and adjusted:
    - Expanded activity logging to apply to both modes for letter guesses (correct/wrong), and enabled solve-open/solve-cancel event logging in turns mode too.
    - Tightened turns-mode solve-open server validation to require current turn and prevent non-active-solver takeover.
    - Updated Hangman end-of-round host UI to show a `Next puzzle creator` selector with a rotated default (next participant after current creator), then uses that selection in the next `game:start` payload.
    - Added regression tests: turns-mode solve-open validation/activity logging and next-round creator rotation default + payload assertion.
    - Re-ran full tests: 33 server tests and 19 web tests green.
29. User still did not see changes in manual testing. Assistant applied additional parity fixes with the plan intent:
    - Activity feed visibility: always render the feed panel once a round starts (showing `No guesses yet.` until the first action) so the feature is visible immediately instead of appearing only after first logged action.
    - Creator rotation reliability:
      - Hangman end-of-round next-creator logic now uses a derived rotated default at render time (eliminates first-click race where the old creator could be sent before state initialization).
      - Sidebar `Restart game` action now rotates creator by default in Hangman instead of reusing the current creator.
    - Verified with full test run again: server 33 passed, web 19 passed.
30. User still reported no visible frontend changes in browser despite server restart/hard refresh. Investigation of runtime logs showed traffic pointed at `localhost:3000` serving static built assets (`/assets/index-*.js`) rather than Vite dev output, so stale `web/dist` was being tested. Assistant:
    - Fixed a TypeScript narrowing issue in `web/src/screens/GameScreen.tsx` encountered during `web` production build.
    - Rebuilt frontend assets via `npm run build -w web`, producing fresh hashed bundles (`index-2cc442fe.js`, `index-271d451c.css`) now served by server on port 3000.
    - Re-ran `npm run test -w web` (19 passing) to confirm no regressions.
31. User reported a hang when an incorrect solve occurred on the final miss, with server log `broadcastState: payload failed schema` and Zod error `Too small: expected number to be >=0`. Root cause: `participantSchema.score` was constrained to nonnegative while turns-mode penalties intentionally produce negative scores (`-5`). Assistant fixed shared contract to allow signed integer scores (`z.number().int()`), then reran full test suite (server 33 passed, web 19 passed).
32. User requested Two Truths and a Lie UX updates: neutral statement input hint copy ("Place your truth or lie here") and reveal-phase attribution showing who voted for each statement; asked to implement the approved plan as-is without editing the plan file and to complete all to-dos.
33. User requested follow-up Two Truths UX flow fixes: show clear post-vote feedback (disable/gray voting controls after casting) and replace reveal-stage "new round" behavior with host-driven selection of the next presenter so existing submissions are reused.
34. User requested a 500-question trivia library, no repeats once questions are used, and trivia host UX that only reveals the `Check answers` action after all participants have submitted, with explicit feedback when everyone has answered.
35. User asked whether Friday Fusion can use Open Trivia DB (`https://opentdb.com/api_config.php`) to source trivia questions instead of the static JSON file.
36. User shared local Open Trivia DB reference notes in `trivia_api_docs.txt` and offered them for API integration verification.
37. User approved adding Open Trivia DB rate-limit handling (`response_code = 5`) with retry/backoff behavior.
38. User requested full implementation of host-configurable trivia loading: host-selected question count/category/difficulty, multiple-choice-only Open Trivia batching with 5-second API cadence, favor-easy remainder split, loading progress bar UI during build, and start only after questions are loaded.
39. User reported `npm run build -w web` failure and asked for diagnosis/fix.
40. User reported they were trying to deploy the app to Fly.io.
41. User requested a new **Icebreaker Questions** game: JSON prompt library, per-player text and optional image upload (files under `DATA_DIR`, purged on next question), host waits for all submissions then reveals answers one player at a time via dropdown + reveal, no scoring; assistant implemented contracts, loader, session service with redacted public state during collection, Fastify multipart upload + file GET routes, Web UI, tests, and prompt log update.
42. User asked whether icebreaker answers can support **pasting an image** from the clipboard; assistant wired paste handling on the answer form (same allowed types as file upload) and refactored hooks so `IcebreakerGame` stays Rules-of-Hooks–safe.
43. User requested a **confirm** before icebreaker **Next question** when some submitted players have not been revealed yet (`window.confirm` with the provided copy).
44. User requested implementation of the **Guess the image** plan: host upload + four canonical descriptions + correct index, server-shuffled `options` on each round start, fade-in timing, lock-in guesses with deadline at full reveal, scoring (3 fastest correct among in-time correct, 1 other correct, 0 otherwise), host excluded from guessing; assistant implemented shared contracts, `guessTheImage` uploads + routes, `SessionService` (including fixing `startGame` so only `icebreaker` uses the icebreaker initializer), Web UI, tests, and prompt log update.
45. User asked for **Guess the image** tweaks: **Play again** should return to host setup for a new image (not restart the same round), and the reveal should combine **opacity + blur** so the image sharpens as it fades in; assistant added `guessImage:backToSetup` (purge uploads, reset setup), updated the finished-state host button, and wired blur easing with reduced-motion respect.
46. User requested **assignable image setup** for Guess the image: the host chooses who prepares each round (including from the lobby for the first round); only that player uploads/configures/starts the round; guessing excludes the setup player (so the host can guess when someone else set up); `guessImage:setSetupParticipant`, `returnGuessTheImageToSetup` resets assignee to host, and tests were extended accordingly.
47. User requested **clipboard image paste** on Guess the image setup (same allowed types as the file input and as Icebreaker); assistant added shared `imageFileFromClipboard` in `web/src/utils/imageClipboardPaste.ts`, refactored Icebreaker to use it, wired `onPasteCapture` on the setup form with hint copy, styles for `.guess-image-paste-hint`, and unit tests for the helper.
48. User asked whether Guess the image files are deleted from disk when a round ends; they were not (only on lobby/new game, end game, back to setup, etc.). Assistant updated `finalizeGuessTheImageRound` to clear `imageFileId` and call `purgeAllGuessTheImageSessionUploads` after persist, made finished-state `imageUrl` nullable in contracts, adjusted results UI when no image URL, and extended the scoring test to expect `imageUrl` null after finish.
49. User requested **Guess the image — everyone prepares**: lobby and in-game support for parallel per-player setups (`guessImageSetupMode: "everyone"`), host-only `guessImage:setRoundPresenter` after all have saved, host-only start round copying the chosen slot into play (presenter sits out), per-participant WebSocket `session:state` via `getState(sessionId, viewerId)`, `participantSetups` persistence, join/remove cleanup, and tests.
50. User asked that in **everyone** mode the room should not restart full setup after a round: host gets **Select next image to guess** (reuses saved setups, deletes only the played file) vs **Start new round** (full purge + fresh slots); assistant added `everyoneBetweenRounds`, `guessImage:beginNextRoundSelection`, `deleteGuessTheImageStoredFile`, relaxed host presenter/start rules between rounds, finished `setupMode`, UI copy, tests, and fixed a TS narrowing issue in an existing return-to-setup test.
51. User reported that the landing **active sessions** list only updated after a manual browser refresh; assistant added WebSocket `lobby:subscribe` / `activeSessions:updated` (shared contracts), server broadcasts when sessions are created, joined, closed, or emptied, lobby heartbeat cleanup, `useActiveSessionsLobby` on the landing screen, and a ws integration test.
52. User requested **Icebreaker — stock vs submitted questions**: host chooses stock (existing count + `icebreaker:startRound`) or submitted path (`beginPromptGathering` 1–5 per player, all participants `submitPrompts`, host `startCustomRound`); new `gatheringPrompts` state, `returnToSetup` from finished, `ICEBREAKER_PROMPT_MAX_CHARS`, shuffled custom question ids not added to `usedQuestionIds`, UI wizard + gathering form, `PlayerList` tag, tests, and prompt log.
53. User requested **20 Questions** (plan): lobby host picks item selector + question budget (1–50), selector sets secret then acts as yes/no oracle, guessers take turns with live question drafts, scoring (all guessers +1 on team win before cap; selector +1 per guesser when budget exhausts), WebSocket events + `SessionService` + UI + tests; assistant implemented `twentyQuestions` in shared contracts, server, lobby/game screens, `PlayerList` tags, styles, and prompt log update.
54. User requested **Caption This** (plan): host picks image provider; provider uploads/pastes image; all players submit captions; host starts voting; shuffled anonymous captions; votes hidden until results; no self-votes; results + host-chosen next round; temp images under `uploads/caption-this/{sessionId}` deleted after each next round and on game/session end; assistant added `captionThis` to contracts, `captionThisUploads.ts`, `SessionService` + Fastify routes + WS handlers, `CaptionThisGame` UI, tests, and prompt log update.

## 2026-04-27

56. User requested **Pictionary** (plan): two-team host setup, shared canvas with pen size/eraser/clear, drawer-only prompts, configurable per-draw timer, team-wide +1 scoring on correct guess, random first team with alternating teams and fair drawer rotation, large server clue library, idle-team “stay quiet” banner; implemented `pictionary` in contracts, `pictionaryClues.ts`, `SessionService` + timers + WS routes, lobby/game UI, tests, and prompt log update.

55. User requested **lobby “want to play” preferences**: non-hosts replace the faded “Waiting for host” button with **I want to play this** per game card (one active pick per guest, overwrite on change); host sees **{name} wants to play {game}** under the scoring/players card; implemented `lobby:setGamePreference`, `lobbyGamePreferences` in session state + persistence, pruning on leave/host promotion/start game, UI + styles, server + LobbyScreen tests, and prompt log update.

## 2026-04-28

57. User requested **Guess Who Said It?** (plan): stock prompt library, host chooses prompt count, sequential per-prompt collection with text/image answers (similar to Icebreaker), then host-driven anonymous guessing phase with per-slot “who said it” dropdowns, scores for correct guesses (+1 to guesser per slot), reveal with attribution; assistant implemented `guessWhoSaidIt` in shared contracts, `guessWhoSaidItQuestions.json` + loader + uploads, `SessionService` (idle → collecting → votingReady → voting → finished), Fastify routes `/guess-who-said-it/upload` + file GET, WebSocket handlers, `GuessWhoSaidItGame` + LobbyScreen + GameScreen + PlayerList + styles, tests, and prompt log update.

58. User requested **Guess Who Said It?** flow changes: **one prompt at a time** for voting (host advances after all vote), **hide own answers** from guess UI and reject self-guesses, **per-prompt results** with points when tallied, **final summary** of correct guesses per player; assistant updated contracts + `SessionService` (sequential `voting` / `promptReveal` / `roundSummary`), WebSocket `advancePrompt`, rewrote `GuessWhoSaidItGame` + styles + tests, and prompt log update.

## 2026-04-30

59. User requested **host player management** (inactive + boot) per plan: `isActive` on participants, host-only `session:setParticipantActive` / `session:boot`, `session:closed` reason `booted`, server gameplay guards and `detachParticipantFromActiveGame`, lobby-only activation, Web UI tags and `canPlay`, integration tests for boot and unit tests for activity rules; assistant completed remaining tests (including Pictionary “active players” copy), `wsIntegration` boot flow, and prompt log update.

60. User requested **bench only in the lobby**: hide the Bench control on the in-game player list, keep **Remove** always available, and reject `setParticipantActive(..., false)` on the server while a game is running (benched players still skip games started after they were benched in the lobby).

61. User reported benched players still saw the in-game UI when a round started; routing now treats **only active participants (and the host) as “in game”** (`session.activeGame && canPlay`), so benched guests stay on **LobbyScreen** with a short “Game in progress” notice instead of the game picker.

62. User reported trivia (and similar flows) still **waiting on benched players**; server and client now key “everyone answered / captions in / votes in” off **active participants only**, **Caption This** and **Guess-the-image everyone** projections exclude benched players, **20Q scoring** counts active guessers, and in-game **dropdowns / team pick / turn order / hangman next creator** list only active roster (with turn-order drag merging full session order safely).

63. User reported **Guess the image — everyone mode**: when one player saved setup, others’ in-progress forms cleared; fixed by syncing `everyoneMySetup` into local React state only when that server-derived key changes (not on every `session` broadcast), plus a regression test.

64. User requested **Apples to Apples**–style game (plan): rotating judge, topic + anonymous response submissions from hands of six, judge picks winner (+1 score), **Standard** (redraw to six) vs **Finite** (no redraw, exactly six table rounds); stock **topics** and **responses** in `server/src/data/applesToApples*.json` + `applesToApplesCardLoader.ts`; implemented `applesToApples` in shared contracts, `SessionService` + WS handlers, lobby mode picker, `ApplesToApplesGame` + `PlayerList` tags + styles, server/web tests, and prompt log update.

## 2026-05-11

65. User requested **UNO** (plan): standard 108-card deck, draw/discard piles, match color or rank, wild color choice, skip/reverse/draw-two/wild-draw-four behavior, declare UNO and catch missed UNO (draw 2), opponent hand silhouettes, winner scores **activePlayerCount − 1** once per hand; assistant added `unoDeck.ts` + `unoGameHelpers.ts`, extended `shared/contracts`, `SessionService` + WS routes, `UnoGame` + lobby + `GameScreen` + `PlayerList` + styles, server/web tests, and prompt log update.  
    Prompt: *"Add Uno to Friday Fusion — Implement the plan as specified… Mark todos… Don't stop until you have completed all the to-dos."*

66. User requested UNO UX: **banner** at top of the game when a player declares UNO (stays until they win or hold more than two cards), and a **2-second delay** before anyone can call missed UNO after a player is vulnerable at one card; implemented in `shared/contracts`, `SessionService`, `UnoGame`, styles, web tests, and prompt log.

67. User reported the UNO callout banner did not clear when a player **drew back above one card**; fixed `unoSyncAnnouncementBanner` to clear whenever the announcer’s hand size is **not exactly one** (win → 0, or draw/play → 2+), and updated field comments.

68. User reported UNO **game over** crashed the app (white screen); fixed **Rules of Hooks** in `UnoGame.tsx` by running the missed-UNO interval effect on every render (deps from optional playing state), added a **winner banner**, winner score line, and host **Deal new hand** CTA (`game:start` uno), plus styles and tests.  
    Prompt: *"Looks like the game over event crashes the app. When someone one the uno game, the screen just went all white. What should happen is a banner declaring the winner and then updating the score. The host is then prompted to deal a new game."*

69. User requested adding the **BS** card game with turn declarations from A through K, 1–4 card plays, believe/BS challenge flow, host truth/BS resolution, discard-pile penalty transfers, and elimination scoring where first out gets points equal to player count and last two get 0; assistant implemented `bs` contracts/events, `bsDeck`, `SessionService` BS lifecycle and scoring, WS handlers, `BsGame` UI, lobby/game/player-list wiring, BS tests, and prompt log update.

70. User requested BS card UX enhancements: add suit-color styling (red hearts/diamonds, black clubs/spades), display dealt hand cards left-to-right in ascending sorted order, and raise selected cards while queued for play; assistant added BS hand sorting/rendering, suit-specific card styles, selected-card lift interaction, and updated BS UI tests.

71. User reported a BS rules correction for two-player rounds: only end with two remaining when the game started with more than two players; in two-player games, end when one player runs out and award that player exactly 1 point. Assistant updated server BS scoring/end conditions and added a SessionService regression test.

72. User clarified that two-player BS should be disallowed; assistant updated BS to require at least three active players on start, removed two-player BS test coverage in favor of a min-player validation test, and updated BS UI to always show each player their own hand throughout active phases so bluff decisions can be made.

73. User requested removing the BS challenge-phase “Believed so far” text to avoid swaying decisions; assistant removed that UI line from `BsGame` and verified BS web tests still pass.

74. User requested a running discard-pile total in BS to increase pressure; assistant added a live discard counter to the BS game header and verified BS web tests/lints.

75. User reported `npm run build` failure; assistant reproduced the TypeScript nullability error in `web/src/games/UnoGame.tsx` (`playing` possibly null), added a narrow guard before `playing` usage, and verified full root build succeeds.
76. User requested a full UI facelift to look more professional and slightly darker (not full dark mode), strictly look-and-feel only and without impacting functionality.
77. User requested a follow-up brand-polish pass plus a lobby game list layout preview with one full-width column and larger per-game icons.
78. User requested a much more aggressive full visual makeover: polished, slick, colorful, and fun with a stronger wow-factor.
79. User requested a structurally different UI (not just colors), aiming for a blocky Discord-like feel that is surprising on load.

## 2026-05-16

80. User reported Yahtzee reroll randomness felt unreliable and requested verification/fix so non-held dice always get a fresh reroll, plus a running upper-section total above the scorecard with a green check when the 63-point bonus threshold is reached.
81. User clarified they do not want forced fresh reroll values; they only wanted a bug check on randomization. Assistant reverted the forced-different-face reroll behavior and kept standard random rerolls where repeats are allowed.
82. User requested an additional Yahtzee mode for concurrent play (each player progresses independently with private dice/scorecard state), live top-bar progress showing each player's total and rounds left, and a bold 3-second "X got a YAHTZEE!" announcement in both modes, with final tally only after all players finish.
83. User reported a bug where turn-based "Not your turn." validation still triggered in simultaneous Yahtzee mode; assistant moved that guard to turns-only in `yahtzeeToggleHold` and added regression coverage.
84. User added new game icons in `public/game_icons` and requested wiring them into the UI so each game card uses the intuitive matching icon filename.
85. User reported 404 errors for the new game icons; assistant fixed static asset pathing so repo-root `public/game_icons` is served by Vite and included in web builds.
86. User requested larger game icons positioned in the right-side empty area of each lobby game card (as marked in screenshot), and assistant updated card layout/styles accordingly.
87. User requested showing the active game's icon below the players scoreboard while in-game; assistant added a left-rail game icon panel in `GameScreen` with responsive styling and test coverage.
88. User reported the in-game icon panel overlapped scoreboard footer buttons; assistant adjusted sticky behavior so the full left rail (scoreboard + icon) sticks together and the icon remains below the scoreboard.
89. User requested adding a sidebar session chat/smack-talk feature available in both lobby and game screens, storing chat to a session file purged at session end, a basic emoji pack, and floating/fading emoji reactions visible to all participants.

## 2026-05-18

90. User requested a new **Would You Rather** game for Friday Fusion with host-configured prompt count, a quality built-in prompt library, optional player-submitted prompts during the round, host visibility/moderation of submissions, reveal-after-all-answer flow, host-driven next prompt, and a subtle pass option.
91. User confirmed product rules for implementation: **no scoring** and host controls to **approve/reject** submitted prompts before running submitted rounds.
92. User requested full implementation of the approved plan and completion of all to-dos without editing the plan file.

## 2026-05-19

93. User reported that refreshing the browser kicks them out of an active session; assistant implemented `sessionStorage` persistence of session credentials and automatic rejoin via the existing join API on page load.
94. User reported the Would You Rather lobby checkbox grows oversized in certain views; assistant fixed `.mode-option` grid placement for checkboxes (matching radio inputs) and added regression coverage.

## 2026-05-20

95. User requested Scattergories duplicate-answer validation (red inputs while answering), host duplicate awareness during judging with accept disabled, and automatic no-point scoring for blank answers without host clicks.
96. User requested **Story Builder** in Friday Fusion: collaborative story built one sentence at a time with each writer only seeing the previous line until the host completes; host lobby options for ~30 stock starters vs scratch and who goes first; full-story reveal with fade-in for everyone; after reveal the host can start a new story without returning to the lobby. Assistant implemented contracts, starter library + loader, `SessionService` and WebSocket handlers, lobby and game UI (including reduced-motion), tests, and prompt log updates.

## 2026-05-21

97. User requested **game attribute badges** on lobby game cards: six attributes (Scorable points, Game, Activity, Team game, Shorter time, Longer time) with inline SVG + short labels, a legend above the game grid, per-game mappings for all listed modes (Hangman through Story Builder), and tests plus prompt log updates.
98. User requested host manual score adjustment for any player: opening a score edit broadcasts to all clients and shows prominent red "The host is updating the score..." below that player's name; assistant added `session:beginScoreEdit` / `session:cancelScoreEdit` / `session:setScore`, server session state field `scoreEditingParticipantId`, PlayerList host edit UI, styles, and tests.
99. User reported the score-editing notice only blinked briefly; assistant fixed a PlayerList cleanup effect that was sending `session:cancelScoreEdit` whenever the `send` prop changed (on every session state update), so the notice now persists until the host saves or cancels.
100. User requested full **player profiles**: keep join flow as display-name-only, add in-session create/load profile with unique username + password, profile editor panel (`My Profile`) with name/about/favorites/dream-job/avatar (upload or stock), persistent non-session-purged profile images, star indicator in Players for linked profiles, and a modal to view another player's public profile. Assistant implemented shared contracts, profile persistence service (`profiles.json`), durable profile upload routes, session profile-linking (`session:linkProfile`) with `hasProfile` participant state, new web components (`MyProfilePanel`, `ProfileViewModal`), Lobby/Game wiring, styles, and tests.
101. User requested profile flow simplification: remove password requirement, hide `My Profile` by default behind a `Create/Load Profile` button, use username-only open semantics (create when missing, load when existing), and make profile panel content scrollable so favorites do not clip. Assistant updated contracts/server routes/services/web components/screens/styles/tests to support username-only profile open/link/edit and conditional panel visibility.
102. User requested avatar rollout across all games: show avatars anywhere player names appear (turns, winners, summaries, chat/player lists), size avatars contextually with larger treatment for significant events, and add celebratory avatar shower effects on notable wins (including team wins). Assistant implemented backend avatar enrichment in session participant state, shared avatar/name components and helpers, game/surface UI integrations, celebration effects, styles, tests, and prompt log updates.

## 2026-07-27

103. User asked to explore the friday-fusion codebase to understand how games are structured and added: project structure/tech stack, game registration and selection, lifecycle (lobby/countdown/play/end/scoring), Friday Fusion points, realtime sync, and existing race/competitive patterns closest to a live race Wordle.
104. User asked for a focused codebase exploration covering Friday Fusion points/scoring after games, realtime multiplayer state sync, spectator/other-players status UI, ranking/placement logic, countdown/race-start patterns, chat/presence live state, plus word-list assets — specifically to reuse for a live Wordle race with mini boards, rankings, and inverse placement points.

## 2026-07-27

105. User approved the Wordle Race plan and asked to implement it: multi-round live Wordle with host-started random answers, 3-2-1 countdown, realtime mini color boards, ranking by solved/guesses/time, and inverse-placement FF points.

106. User reported Wordle Race layout overlapping when shrinking the display from full width (fine on full and portrait monitors); board/keyboard bleed into players rail and live standings.
