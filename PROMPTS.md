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

**2026-08-27:** Implement Monopoly Deal for Friday Fusion — full official rules (106-card deck), wagering phase (min 1 FF point per player, winner takes pot), server-authoritative multiplayer with property/bank/rent/actions/wild cards, and color-accurate card UI.

**2026-08-27:** Monopoly Deal UX fixes — card help tooltips, rent color bars, money card styling (3M format), lock hand after 3 plays with pulsing End Turn, server fix for illegal 4th play mutating state.

**2026-08-27:** Monopoly Deal — fix Forced Deal multi-step target selection; compact opponent board with hover previews; floating card help tooltips so they are not clipped.

**2026-08-27:** Monopoly Deal — prompt wild color assignment after Forced Deal steal; Deal Breaker only lists players with complete sets and adds cancel to return the card.

**2026-08-28:** Fix Monopoly Deal card help tooltip — floating tooltip CSS conflict with base positioning.

**2026-08-28:** Fix Monopoly Deal rent payment — count property cards in selected total and block underpayment.

**2026-08-28:** Address Monopoly Deal feedback (monopoly_feedback.md): UI polish (property layout, end turn, icons, events, Just Say No window, set tracking, payment UX).

**2026-08-28:** More Monopoly Deal feedback: payment modal highlight, prominent Just Say No panel, two-color rent charges all players, polished winner screen.

**2026-08-28:** Monopoly Deal feedback round 3: block rent without qualifying properties, cancel in-progress action resolution without consuming a play, wager cap at FF score (min 1), native end-turn confirm modal, double-click to bank, undo banking until next play, Just Say No excludes actor and auto-dismisses after 5s.

**2026-08-28:** Monopoly Deal — end turn clears bank undo X; rent card shows Play Rent Action / Play Rent Action 2x when Double the Rent is in hand.

**2026-08-28:** Monopoly Deal feedback: inline end-turn confirm, dual wild flip on board, payment/set-stolen events, house/hotel sprites and play validation, forced deal + Just Say No hook fix.

**2026-08-28:** Fix forced deal swap placing received properties in the wrong color set (use activeColor, not vacated slot).

**2026-08-28:** Monopoly Deal feedback: fix discard selection when hand exceeds 7, opponents sidebar layout, late Just Say No window with undo until next play/end turn.

**2026-08-28:** Monopoly Deal feedback: wild card value bubble styling, payment picker bank-first + cap at amount due, flip wild moves to correct property set, end-game winner board display.

**2026-08-28:** Monopoly Deal feedback: event panel for steal/swap/deal breaker, double rent target-selection fix, wild-only set wins, multiple property groups per color, forced deal complete-set guard, Just Say No timer fix, house excludes railroads/utilities.

**2026-08-28:** Fix forced deal target selection crash when opponent property sets are stored as arrays.

**2026-08-28:** Monopoly Deal feedback: larger hand area, JSN bank-only + panel visibility fix, action card art, JSN event broadcast.

**2026-08-28:** Address Monopoly Deal feedback in monopoly_feedback.md: allow all-in underpayment (excluding wilds), color money denominations, double-click to lay regular properties, fix rent payment queue mislabeled as birthday, restore original action after Just Say No cards cancel each other.

**2026-08-31:** Address Monopoly Deal feedback in monopoly_feedback.md: move any-property wilds as a play, Just Say No "I'm thinking..." +30s, persistent action feed in the game side column.

**2026-08-31:** Fix Monopoly Deal "I'm thinking..." so it keeps blocking the action, resets the Just Say No timer to 30s, and still waits for Allow / Just Say No (late window unchanged).

**2026-08-31:** Restore the Allow button on the timed Just Say No panel for every eligible player (it was restricted to the primary target / actor). Keep Allow hidden on the late window.

**2026-09-01:** Add a Beta tag to Monopoly Deal in the lobby main menu. For non-host players, use a compact game tile listing (icon, name, Play this! button, info tooltip with description and tags); host view stays the same.

**2026-08-31:** Address Monopoly Deal feedback in monopoly_feedback.md: discard house/hotel from incomplete sets at end of turn, fix Deal Breaker leaving the action card (and extra property) in hand, end the game as soon as any player has three complete sets.

**2026-08-31:** Address Monopoly Deal feedback in monopoly_feedback.md: keep counter-Just Say No playable after the 5s timer until the next play or end turn, and merge incomplete same-color property groups when none are complete.

---

**2026-09-28:** Add a subroutine so a player leaving Monopoly Deal mid-game has their hand, money, and properties reshuffled into the draw pile, their status removed, and they are dropped from the turn order (advance to the next player if it was their turn). Add a host-only action, gated by an "Are you sure" prompt, that immediately ends the current turn and moves to the next player.

---

**2026-09-28:** The host "End current turn" button is not showing. Make it visible in the game the host is actually running.

---

**2026-09-28:** Make the host "End current turn" button more subtle, and place it just to the right of the draw pile card count.

---

**2026-09-28:** Double-clicking a two-color wild card puts it in the cash pile. Property cards, including wilds, should not be able to be banked as cash.

---

**2026-09-28:** When It's My Birthday is played, players currently take turns paying. All players should be able to pay at the same time.

---

**2026-09-28:** It's My Birthday still only showed a pay action to one player in a 3-player game. After that player paid, the other never got a prompt and the game stuck.

---

**2026-09-28:** It's My Birthday simultaneous payment works. Extend it to rent cards that charge all players; those payments are still collected one player at a time.

---

**2026-10-24:** Add Trivial Pursuit to Friday Fusion. Use The Trivia API for questions. Verbal play: random non-turn reader, optional show question to answerer, Clock after 10s for 30s shared cue, reveal answer, Correct/Incorrect. Classic board with Roll Again spaces.

---

**2026-10-24:** Trivial Pursuit board doesn't look awesome. Prefer polishing the drawn SVG board (continuous tracks, hub pie, better HQs) over a photo+overlay for now.

---

**2026-10-24:** Add a faster Trivial Pursuit variant where any correct answer for a missing category awards a wedge; landing on that color after owning the wedge still grants another roll. Keep classic HQ-only as an option.

---

**2026-10-24:** Trivial Pursuit bug — when the turn changed, the board stayed on the last player's screen instead of moving to the active player so they could choose where to move. App shut down so the assistant can run it to reproduce/fix.

---

**2026-10-24:** Some Trivia API questions clearly rely on multiple choice; others have one clear answer. Suggestions on how to address that for verbal play?

---

**2026-10-24:** Go with option 3 — eliminate obvious multiple-choice questions. Some MC falling through is OK. Reader decides whether choices need to be read; on reveal, show all multiple-choice options.

---

**2026-10-24:** Hard to see how many wedges a player has. Only show earned color chips beside names. Add hover on board pieces: modal with player name + enlarged piece with pie wedges.

---

**2026-10-24:** Token hover modal opens below the piece — top-of-board icons were getting cut off.

---

**2026-10-24:** Add an end-of-game results screen for Trivial Pursuit, similar to Yahtzee or Monopoly Deal.

---

**2026-10-24:** Change "Show Question" to "Reveal Question". Add "Reveal Answers" that shows multiple-choice options to the current answerer.

---

**2026-10-24:** Instead of the reader revealing answers, each player can request multiple-choice options themselves — max 5 times per game.

---

**2026-11-12:** In Trivial Pursuit, once a player has reached the center circle, they should continue to have questions asked in the same way until they win. Currently they have to leave and come back. Remove that in both game variants. Also add a host feature that turns off the requirement to roll the exact number to get to the center circle. If this is turned off, a player who rolls enough to reach the center (and has all 6 pie pieces) can go directly there. Once the host selects this, it cannot be undone for the rest of that game.

---

**2026-11-12:** Just to be clear, if a player is in the center space and gets the question wrong, their turn is over. Other players get their turn. When it comes back to that player that is in the middle, then they get a new question (category selected by the opponent that will be reading the question).

---

**2026-11-24:** I'd like to explore a whole new look and feel for the app. I want it to be more tech feeling. Sharp, sleek, modern. Default the primary color to a rich orange. Once in the lobby, allow users to change the color scheme from a few options (blue, green, purple, red, yellow, cyan).

---

**2026-11-24:** Feedback: UI Visibility Issues: Alot of the apps are having text visibility issues after the change. Text inputs are turning black on focus, thus making text not visible while typing it in.

---

**2026-11-25:** I don't think I like the fact that the site template is dark, but the games are keeping their lighter look. Let's go game by game and re-style each game to fit the new template. I know some games might be okay as they are, but many of them can be changed to better fit with the site refactor.

---

**2026-11-25:** I think converting shared play-stage makes sense. Let's go with a full dark tech look for everything. I want everything looking uniform, clean, and fresh.

---

**2026-11-25:** Started spot checking. Got to "Guess the image" and the text boxes are incongruent and the text is hard to read. Not sure if this issue will be in other games, but this one needs adjusted for sure.

---

**2026-11-25:** Minor adjustment needs made to the hangman segments. They are too dark against the background. Lighten those up to a soft white so they stand out.

---

**2026-11-25:** sorry, I was talking about the actual hangman pieces, the body, arms, legs, etc.

---

**2026-11-25:** um, the head turned white, but the body parts are still dark

---

**2026-11-25:** Let's redo the memory cards in Memory game. They are white and stand out against the black in a strong way

---

**2026-11-25:** that's too far. They are too dark now. Maybe we go with a contrasting gray that stands out but not too much

---

**2026-11-25:** checked in on Monopoly deal. Some of the text is washed out in the cards. Most noticiably the dollar value of cards. I think the contrast of the cards is okay. Let's try muting the white a little by making them more of a light gray

---

**2026-11-25:** that's good. The "Choose target" text is washed out a bit here.

---

**2026-11-25:** the text in the event boxes is washed out and needs adjusted

---

**2026-11-25:** The end-game screen for monopoly deal is washed out as well. Let's clean that up too

---

**2026-11-25:** moving on to pictionary. Some of the text is hard to see. i.e. who's on which team in the Scores area and the "Alex is drawing" status above the canvas

---

**2026-11-25:** okay, moving on to Scattergories. Text at the top needs addressed. It's washed out. In the attached image, "Party Time" is not visible

---

**2026-11-25:** At the end of the round, the names are not visible here:

---

**2026-11-25:** checking trivial pursuit, this button text is not visible

---

**2026-11-25:** okay, uno looks generally okay. I noticed the instructions text is washed out when selecting a wild color

---

**2026-11-25:** looking at wheel of fortune. Some text is washed out. See screen shot

---

**2026-11-25:** Looking at Wordle, the text when typing out letters is too light

---

**2026-11-25:** Yahtzee needs some attention. The light blue background needs changed to match the template. Make sure text is contrasted appropriately as well

---

**2026-11-25:** The text that shows up in the lobby when players are saying what they want to play could be lighter. Kinda hard to read. Also, while you are at it, can you add an "Are you sure" modal for when the host clicks "End Game"

---

**2026-11-25:** looked at Catch Phrase. Some of the text at the top is hard to read and needs adjusted

---

**2026-11-25:** Also, I need to add an additional feature to Catch Phrase. If a clue is too hard, the person can press the button for a new clue and it stays their turn. However, each person is only allowed 1 skip on that turn. But when it comes back to them, they get that 1 skip again.

---

**2026-11-25:** okay, last one I think is friendly fued. The text on the answer panels is washed out.

---

**2026-11-25:** The button hover on main buttons like "Leave Session" or "Close Session" and others like it washes out the text. Let's fix that

---

**2026-11-25:** I would like to attempt to add a type racing game to Friday fusion. The main idea is that all players will be presented a block of text that is about a paragraph in length, a timer counts down, and then each player types out the paragraph. I know some type racing apps will give live feedback about accuracy, I don't want that. The players should just type it out as fast and as accurately as they can. Once they are done they click the "Finished" button and their completion time is captured. Their text is compared against the prompt and their accuracy percentage is calculated (number of correct characters versus incorrect). They are then assesed a 0.5 second penalty for each error. The player that completed it the fastest (after assessed penalties) is the winner. Build out about 50 different prompts in a library.

---

**2026-11-25:** Type Race feedback: Show the input box while countdown is happening but have it disabled. When timer hits 0, enable it and make sure the cursor is focused on it. Display results are off — different backgrounds and the light one is washed out. Make sure that pasting in text to the input box is disabled.

---

**2026-11-25:** Can we add a calculated words-per-minute to the results as well?

---

**2026-11-25:** Just noticed the "Short" label is washed out in the UI
