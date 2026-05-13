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
