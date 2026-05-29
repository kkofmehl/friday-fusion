# Prompt log

Entries are appended chronologically (newest at bottom).

---

**2026-04-28:** Please add this footer to the application small and subtle but certainly viewable: Feel no obligation, but if you want to help offset hosting costs of this dandy little app, Venmo @kmozzler or Paypal kkash2206@gmail.com © 2026 Kmofy Consulting

---

**2026-04-28:** Implement **Guess Who Said It?** per attached plan: stock prompts, host prompt count, answer collection with text/images, voting phase with anonymous answers and per-slot dropdown guesses, host reveal with +1 per correct guess for the guesser, parallel to Icebreaker structure—contracts, server, uploads, UI, tests (do not edit plan file).

---

**2026-04-28:** Guess Who Said It adjustments: sequential prompts (vote one at a time; host advances); hide each player’s own answer from their guessing UI and disallow voting for self; per-prompt formatted results and scoring when votes complete; after last prompt, summary of how many correct guesses each person had.

---

**2026-05-12:** You are working in the user's Cursor workspace (may be under empty-window or another path). Discover the actual project root with git/code.

Implement these three feature requests (search codebase for Uno, BS, Apples to Apples, Guess the image components):

1) **Uno and BS games**: When it is the current user's team's turn, style the main "game area" with a thick border and a slightly green background so turn ownership is obvious. Match existing styling patterns (CSS modules, Tailwind, theme). Apply consistently for both games.

2) **Apples to Apples**: After all players have submitted cards, display all submitted cards so every player can see them (not just judge). After the judge selects the winning card: highlight that card with green styling, then show on screen who submitted each card (names/labels).

3) **Guess the image**: After all players submitted guesses, on the summary/results screen that follows, show the image again (the same image that was being guessed).

Constraints:
- Minimal focused diffs; follow existing code style.
- Find and update/add unit or integration tests if the project has a test setup for these flows.
- Per user rule: append this user prompt to a markdown log file at project root (e.g. PROMPTS.md or prompts.md) documenting the request—create file if missing with a dated entry.

Return: files changed, brief summary of behavior, test commands run and results, any follow-ups if something was ambiguous.

---

**2026-05-13:** BS game after a BS call: when UI shows revealed cards, also show current call in the same summary (e.g. call rank + revealed cards); host settlement hints—highlight “That was BS” if any revealed rank ≠ declared `currentRank`, else highlight “Truth was told”; Vitest in `BsGame.test.tsx`; minimal CSS.

**2026-05-13:** Guess the image: host cannot save settings (investigate/fix).

**2026-05-13:** Madlibs for Friday Fusion — implement attached plan end-to-end: new `madlibs` game type, ~20 templates, server rotation/submission/reveal/pass/next-round flow, lobby/game wiring, UI + styles, and tests; do not edit the plan file.

**2026-05-14:** Madlibs bug fix: in reading mode, the filled story should only be visible to the active reader; when pass is used, move reading to a different player (not the one who just passed) and show story only to the new reader.

**2026-05-14:** Catch Phrase in Friday Fusion — implement the attached plan without editing the plan file: add a two-team (min 4 players) game with alternating device passing, hidden random timer (20–90s), buzzer scoring to the non-holding team (+1 per member plus +1 team score), post-buzzer handoff to next logical player on the other team with holder tap to start next word, and three-stage slow/medium/fast beep + subtle blink signal support.

**2026-05-14:** Catch Phrase team setup bug: assigning 2+2 in the UI but clicking Start without Save first made the server reject beginPlay (empty persisted teams). Fix Start so it always sends the current draft with `catchPhrase:setTeams` before `catchPhrase:beginPlay`; clarify copy; add `CatchPhraseGame.test.tsx`.

**2026-05-14:** Team assignment screen should only be available to the host (Catch Phrase and Pictionary team-setup phases).

**2026-05-14:** Catch Phrase: timer/beep should speed up over a round (not reset every pass); make pass button very large full-width; green background when device holder’s turn like BS/Uno; optional sound off toggle; fix visual pulse for beeping.

**2026-05-14:** Catch Phrase: refactor timer into three explicit random-length phases (phase 1 slow beeps 20–45s, phase 2 medium 20–45s, phase 3 fast 8–20s) instead of one total timer with percentage thresholds; make phase-1 pulse circle green for contrast.

**2026-05-14:** Catch Phrase: double-check buzzer scoring — confirm non–clue-giving team gets points (code was already correct; clarify naming + test that holder team scores stay flat).

**2026-05-14:** Yahtzee in Friday Fusion — implement plan: `yahtzee` game type, server-authoritative dice and scoring, hold + roll (max 3), `setPendingCategory` until `passTurn` commits, classic 13 rows + upper bonus, reverse-place points added to `participant.score` on finish, shared `yahtzeeScoring.ts` + tests, WebSocket handlers, `YahtzeeGame` UI (“This game” sheet totals vs FF score), procedural dice sound + mute toggle (`localStorage`), `GameScreen`/`LobbyScreen` wiring.

**2026-05-14:** Yahtzee UI/sound tweaks: show only the viewer’s scorecard; open rows use “Score #” buttons with potential points; stronger green hold ring on dice; light blue panel + bold “Your turn” on the roller’s view; dice SFX reworked as many short band-limited taps plus a low settle thud.

**2026-05-19:** Polish Yahtzee end-of-game UI: leaderboard table with rank, final score, Yahtzee and 63+ upper bonus checkmarks, and Friday Fusion placement points.

**2026-05-16:** Build Scattergories into Friday Fusion: host picks or randomizes category card and letter, configurable answer timer (60/90/120/180s), 3-second countdown, timed answer entry with client letter validation, host review with per-answer accept/reject and multi-word scoring, another round in-session without leaving the game.

**2026-05-20:** Story Builder game for Friday Fusion: collaborative sentence-by-sentence story with per-viewer masking (only active writer sees previous line), host lobby options (stock starters vs scratch, who goes first), ~30 starter lines + loader tests, complete/reveal with fade-in and reduced-motion support, host "new story" after reveal, contracts + SessionService + WebSocket + UI tests.

**2026-05-21:** Add a Memory card game to Friday Fusion: 30 or 40 cards, turn-based two flips per turn, match scores and extra turn, 2s reveal on mismatch then next player; mixed Friday Fusion game icons and emoji symbols; host board size in lobby; contracts, server timers + SessionService, MemoryGame UI, tests, and lobby icon.

**2026-05-21:** Memory audible — drop emoji/extra sprites; use only Friday Fusion `/game_icons/` PNGs; larger board option becomes 36 cards (18 pairs, 6×6) since catalog has 19 game icons max.

**2026-05-21:** Apples to Apples scoring — award one point when the judge picks a player's card; mark the game as scorable on the lobby dashboard.

**2026-05-21:** Change the bench/remove host controls for each player into a hamburger menu.

**2026-05-21:** Memory game — add a solid top turn bar with larger "It's your turn" when it's the active player's turn.

**2026-05-28:** Session Queue — build ability to queue games into a Session Queue for session planning in the Players sidebar: each lobby game gets Start + Queue buttons; Start Queue below the queue jumps into the first game; during queued play host gets Next in queue (plus End game) and can return to lobby and resume the queue; include remove-from-queue on each item.

**2026-05-28:** Add an easter egg where typing "emojistorm" in smack talk and hitting enter does not send chat but triggers a 3-second emoji storm for everyone in the session.
