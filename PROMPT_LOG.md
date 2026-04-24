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
