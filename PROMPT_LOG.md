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
