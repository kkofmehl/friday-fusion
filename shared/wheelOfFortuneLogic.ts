/** Pure Wheel of Fortune helpers (no I/O). */

export const WHEEL_OF_FORTUNE_ROUNDS = 4;
export const WHEEL_OF_FORTUNE_VOWEL_COST = 250;
export const WHEEL_OF_FORTUNE_BANK_FLOOR = 1_000;
export const WHEEL_OF_FORTUNE_BONUS_SOLVE_MS = 30_000;
export const WHEEL_OF_FORTUNE_MIN_PLAYERS = 2;
export const WHEEL_OF_FORTUNE_SPIN_MIN_MS = 4_000;
export const WHEEL_OF_FORTUNE_SPIN_MAX_MS = 6_000;
export const WHEEL_OF_FORTUNE_BONUS_GIVEN_LETTERS = ["R", "S", "T", "L", "N", "E"] as const;
export const WHEEL_OF_FORTUNE_BONUS_EXTRA_CONSONANTS = 3;
export const WHEEL_OF_FORTUNE_BONUS_EXTRA_VOWELS = 1;

export type WheelWedgeKind = "cash" | "bankrupt" | "loseATurn";

export type WheelWedge = {
  kind: WheelWedgeKind;
  /** Cash amount when kind is cash; 0 otherwise. */
  value: number;
  /** True only for the Free Spin cash wedge. */
  freeSpin: boolean;
  /** CSS-friendly fill color for the wedge. */
  color: string;
  label: string;
};

/**
 * Classic 24-wedge layout matching the reference image,
 * clockwise from 12 o'clock (LOSE A TURN).
 */
export const WHEEL_WEDGES: readonly WheelWedge[] = [
  { kind: "loseATurn", value: 0, freeSpin: false, color: "#f5f5f5", label: "LOSE A TURN" },
  { kind: "cash", value: 800, freeSpin: false, color: "#c62828", label: "$800" },
  { kind: "cash", value: 350, freeSpin: false, color: "#b39ddb", label: "$350" },
  { kind: "cash", value: 450, freeSpin: false, color: "#f48fb1", label: "$450" },
  { kind: "cash", value: 700, freeSpin: false, color: "#00897b", label: "$700" },
  { kind: "cash", value: 300, freeSpin: false, color: "#ef6c00", label: "$300" },
  { kind: "cash", value: 600, freeSpin: false, color: "#6a1b9a", label: "$600" },
  { kind: "cash", value: 5000, freeSpin: false, color: "#9e9e9e", label: "$5000" },
  { kind: "cash", value: 300, freeSpin: false, color: "#fdd835", label: "$300" },
  { kind: "cash", value: 600, freeSpin: false, color: "#c62828", label: "$600" },
  { kind: "cash", value: 300, freeSpin: false, color: "#ef6c00", label: "$300" },
  { kind: "cash", value: 500, freeSpin: false, color: "#00897b", label: "$500" },
  { kind: "cash", value: 800, freeSpin: false, color: "#558b2f", label: "$800" },
  { kind: "cash", value: 550, freeSpin: false, color: "#b39ddb", label: "$550" },
  { kind: "cash", value: 400, freeSpin: false, color: "#fdd835", label: "$400" },
  { kind: "cash", value: 300, freeSpin: false, color: "#f48fb1", label: "$300" },
  { kind: "cash", value: 900, freeSpin: false, color: "#c62828", label: "$900" },
  { kind: "cash", value: 500, freeSpin: false, color: "#fdd835", label: "$500" },
  { kind: "cash", value: 600, freeSpin: true, color: "#00897b", label: "$600" },
  { kind: "cash", value: 900, freeSpin: false, color: "#ef6c00", label: "$900" },
  { kind: "bankrupt", value: 0, freeSpin: false, color: "#212121", label: "BANKRUPT" },
  { kind: "cash", value: 600, freeSpin: false, color: "#6a1b9a", label: "$600" },
  { kind: "cash", value: 400, freeSpin: false, color: "#fdd835", label: "$400" },
  { kind: "cash", value: 300, freeSpin: false, color: "#f48fb1", label: "$300" }
] as const;

export const WHEEL_WEDGE_COUNT = WHEEL_WEDGES.length;
export const WHEEL_DEGREES_PER_WEDGE = 360 / WHEEL_WEDGE_COUNT;

const VOWELS = new Set(["A", "E", "I", "O", "U"]);

export function isVowel(letter: string): boolean {
  return VOWELS.has(letter.toUpperCase());
}

export function isConsonant(letter: string): boolean {
  const upper = letter.toUpperCase();
  return /^[A-Z]$/.test(upper) && !VOWELS.has(upper);
}

export function normalizeLetter(raw: string): string {
  return raw.trim().toUpperCase().slice(0, 1);
}

/** Normalize a puzzle for comparison: letters and digits only, spaces ignored. */
export function normalizePuzzleSolution(raw: string): string {
  return raw
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

/** Validate host-entered puzzle text: must contain at least one letter. */
export function validatePuzzleText(raw: string): string {
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (!trimmed) {
    throw new Error("Puzzle text is required.");
  }
  if (!/[A-Za-z]/.test(trimmed)) {
    throw new Error("Puzzle must include at least one letter.");
  }
  if (trimmed.length > 80) {
    throw new Error("Puzzle text is too long (max 80 characters).");
  }
  return trimmed.toUpperCase();
}

export function validatePuzzleCategory(raw: string): string {
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (!trimmed) {
    throw new Error("Category is required.");
  }
  if (trimmed.length > 40) {
    throw new Error("Category is too long (max 40 characters).");
  }
  return trimmed;
}

/** Build a masked board string: letters become `_`, spaces/punctuation preserved. */
export function maskPuzzle(answer: string, revealedLetters: ReadonlySet<string> | readonly string[]): string {
  const revealed =
    Array.isArray(revealedLetters)
      ? new Set(revealedLetters.map((l) => l.toUpperCase()))
      : revealedLetters instanceof Set
        ? revealedLetters
        : new Set(revealedLetters);
  return answer
    .toUpperCase()
    .split("")
    .map((ch) => {
      if (ch >= "A" && ch <= "Z") {
        return revealed.has(ch) ? ch : "_";
      }
      return ch;
    })
    .join("");
}

export function countLetterOccurrences(answer: string, letter: string): number {
  const upper = letter.toUpperCase();
  let count = 0;
  for (const ch of answer.toUpperCase()) {
    if (ch === upper) {
      count += 1;
    }
  }
  return count;
}

export function puzzleFullyRevealed(answer: string, revealedLetters: ReadonlySet<string> | readonly string[]): boolean {
  const revealed =
    Array.isArray(revealedLetters)
      ? new Set(revealedLetters.map((l) => l.toUpperCase()))
      : revealedLetters instanceof Set
        ? revealedLetters
        : new Set(revealedLetters);
  for (const ch of answer.toUpperCase()) {
    if (ch >= "A" && ch <= "Z" && !revealed.has(ch)) {
      return false;
    }
  }
  return true;
}

export function bankRoundWinnings(roundMoney: number): number {
  if (roundMoney <= 0) {
    return WHEEL_OF_FORTUNE_BANK_FLOOR;
  }
  return Math.max(roundMoney, WHEEL_OF_FORTUNE_BANK_FLOOR);
}

export function fridayFusionPointsFromMoney(bankedMoney: number): number {
  return Math.floor(Math.max(0, bankedMoney) / 100);
}

export function bonusFfPoints(playerCount: number): number {
  return Math.max(0, playerCount) * 2;
}

/**
 * Ease-out cubic shared by all clients for synced spin animation.
 * `t` in [0, 1] → eased progress in [0, 1].
 */
export function wheelSpinEaseOut(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return 1 - (1 - x) ** 3;
}

/**
 * Compute rotation (degrees, clockwise from resting) at time `now`
 * given server spin timestamps and final resting rotation.
 */
export function wheelSpinRotationDeg(
  now: number,
  spinStartedAt: number,
  spinEndsAt: number,
  finalRotationDeg: number
): number {
  if (spinEndsAt <= spinStartedAt) {
    return finalRotationDeg;
  }
  const t = (now - spinStartedAt) / (spinEndsAt - spinStartedAt);
  if (t <= 0) {
    return 0;
  }
  if (t >= 1) {
    return finalRotationDeg;
  }
  return wheelSpinEaseOut(t) * finalRotationDeg;
}

/**
 * Final clockwise rotation so wedge `targetWedgeIndex` centers under the top flipper.
 * Flipper is at 12 o'clock (0°). Wedge 0's center is at half a wedge past 0°.
 * Adds `extraTurns` full revolutions for visual effect.
 */
export function computeFinalRotationDeg(targetWedgeIndex: number, extraTurns: number): number {
  const index = ((targetWedgeIndex % WHEEL_WEDGE_COUNT) + WHEEL_WEDGE_COUNT) % WHEEL_WEDGE_COUNT;
  const turns = Math.max(3, Math.floor(extraTurns));
  const wedgeCenterFromTop = index * WHEEL_DEGREES_PER_WEDGE + WHEEL_DEGREES_PER_WEDGE / 2;
  // Rotate wheel clockwise so that wedge center lands under top flipper.
  return turns * 360 + (360 - wedgeCenterFromTop);
}

export function pickMoneyLeader(
  playerOrder: readonly string[],
  bankedMoney: Readonly<Record<string, number>>,
  randomIndex: (n: number) => number
): string | null {
  if (playerOrder.length === 0) {
    return null;
  }
  let best = -1;
  const tied: string[] = [];
  for (const id of playerOrder) {
    const money = bankedMoney[id] ?? 0;
    if (money > best) {
      best = money;
      tied.length = 0;
      tied.push(id);
    } else if (money === best) {
      tied.push(id);
    }
  }
  if (tied.length === 0) {
    return null;
  }
  if (tied.length === 1) {
    return tied[0]!;
  }
  return tied[randomIndex(tied.length)]!;
}

export function nextPlayerInOrder(playerOrder: readonly string[], currentId: string | null): string | null {
  if (playerOrder.length === 0) {
    return null;
  }
  if (currentId === null) {
    return playerOrder[0]!;
  }
  const idx = playerOrder.indexOf(currentId);
  if (idx < 0) {
    return playerOrder[0]!;
  }
  return playerOrder[(idx + 1) % playerOrder.length]!;
}

export function solutionsMatch(guess: string, answer: string): boolean {
  return normalizePuzzleSolution(guess) === normalizePuzzleSolution(answer);
}
