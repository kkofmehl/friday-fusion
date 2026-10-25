/** Pure Trivial Pursuit board helpers (no I/O). */

export const TRIVIAL_PURSUIT_MIN_PLAYERS = 2;
export const TRIVIAL_PURSUIT_MAX_PLAYERS = 6;
export const TRIVIAL_PURSUIT_SHOW_QUESTION_CLOCK_DELAY_MS = 10_000;
export const TRIVIAL_PURSUIT_CLOCK_DURATION_MS = 30_000;
/** Times each player may request multiple-choice options during a game. */
export const TRIVIAL_PURSUIT_CHOICE_HELPS_PER_GAME = 5;

export const TRIVIAL_PURSUIT_CATEGORIES = [
  "geography",
  "history",
  "artsAndLiterature",
  "entertainment",
  "sportsAndLeisure",
  "scienceAndNature"
] as const;

export type TrivialPursuitCategory = (typeof TRIVIAL_PURSUIT_CATEGORIES)[number];

export type TrivialPursuitSpaceKind = "hub" | "category" | "headquarters" | "rollAgain";

export type TrivialPursuitSpace = {
  id: string;
  kind: TrivialPursuitSpaceKind;
  /** Present for category and headquarters spaces. */
  category: TrivialPursuitCategory | null;
  /** Index 0–5 for spoke/HQ/ring segment belonging to that HQ; null for hub. */
  spokeIndex: number | null;
  /** Radial index on a spoke: 0 nearest hub … 3 before HQ. Null when not a spoke space. */
  spokeDepth: number | null;
  /** Ring slot 0–3 clockwise from HQ of spokeIndex. Null when not a ring space. */
  ringSlot: number | null;
};

export const TRIVIAL_PURSUIT_CATEGORY_LABELS: Record<TrivialPursuitCategory, string> = {
  geography: "Geography",
  history: "History",
  artsAndLiterature: "Arts & Literature",
  entertainment: "Entertainment",
  sportsAndLeisure: "Sports & Leisure",
  scienceAndNature: "Science & Nature"
};

/** CSS fills matching classic Genus colors (not official branding). */
export const TRIVIAL_PURSUIT_CATEGORY_COLORS: Record<TrivialPursuitCategory, string> = {
  geography: "#1565c0",
  history: "#f9a825",
  artsAndLiterature: "#6a1b9a",
  entertainment: "#ec407a",
  sportsAndLeisure: "#ef6c00",
  scienceAndNature: "#2e7d32"
};

const HUB_ID = "hub";

/**
 * Spoke colors from hub outward (depth 0–3), transcribed from a Master Edition layout.
 * HQ colors follow TRIVIAL_PURSUIT_CATEGORIES clockwise from Geography.
 */
const SPOKE_COLORS: TrivialPursuitCategory[][] = [
  // Geography HQ (blue)
  ["sportsAndLeisure", "entertainment", "scienceAndNature", "history"],
  // History HQ (yellow)
  ["scienceAndNature", "geography", "sportsAndLeisure", "entertainment"],
  // Arts HQ (purple)
  ["geography", "scienceAndNature", "entertainment", "sportsAndLeisure"],
  // Entertainment HQ (pink)
  ["history", "geography", "artsAndLiterature", "scienceAndNature"],
  // Sports HQ (orange)
  ["artsAndLiterature", "history", "geography", "entertainment"],
  // Science HQ (green)
  ["entertainment", "artsAndLiterature", "history", "geography"]
];

/**
 * Ring colors between HQ i and HQ i+1 (clockwise). Slot 1 is always Roll Again.
 * Slots: [0]=category, [1]=rollAgain, [2]=category, [3]=category
 */
const RING_COLORS: Array<[TrivialPursuitCategory, TrivialPursuitCategory, TrivialPursuitCategory]> = [
  // After Geography HQ → History HQ
  ["scienceAndNature", "sportsAndLeisure", "artsAndLiterature"],
  // After History HQ → Arts HQ
  ["geography", "entertainment", "scienceAndNature"],
  // After Arts HQ → Entertainment HQ
  ["history", "sportsAndLeisure", "geography"],
  // After Entertainment HQ → Sports HQ
  ["artsAndLiterature", "scienceAndNature", "history"],
  // After Sports HQ → Science HQ
  ["entertainment", "geography", "artsAndLiterature"],
  // After Science HQ → Geography HQ
  ["sportsAndLeisure", "history", "entertainment"]
];

const spacesById = new Map<string, TrivialPursuitSpace>();
const adjacency = new Map<string, string[]>();

const addEdge = (a: string, b: string): void => {
  const aList = adjacency.get(a) ?? [];
  const bList = adjacency.get(b) ?? [];
  if (!aList.includes(b)) aList.push(b);
  if (!bList.includes(a)) bList.push(a);
  adjacency.set(a, aList);
  adjacency.set(b, bList);
};

const register = (space: TrivialPursuitSpace): void => {
  spacesById.set(space.id, space);
  if (!adjacency.has(space.id)) adjacency.set(space.id, []);
};

register({
  id: HUB_ID,
  kind: "hub",
  category: null,
  spokeIndex: null,
  spokeDepth: null,
  ringSlot: null
});

for (let i = 0; i < 6; i += 1) {
  const spokeCats = SPOKE_COLORS[i]!;
  for (let depth = 0; depth < 4; depth += 1) {
    const id = `spoke-${i}-${depth}`;
    register({
      id,
      kind: "category",
      category: spokeCats[depth]!,
      spokeIndex: i,
      spokeDepth: depth,
      ringSlot: null
    });
  }
  const hqId = `hq-${i}`;
  register({
    id: hqId,
    kind: "headquarters",
    category: TRIVIAL_PURSUIT_CATEGORIES[i]!,
    spokeIndex: i,
    spokeDepth: null,
    ringSlot: null
  });

  addEdge(HUB_ID, `spoke-${i}-0`);
  addEdge(`spoke-${i}-0`, `spoke-${i}-1`);
  addEdge(`spoke-${i}-1`, `spoke-${i}-2`);
  addEdge(`spoke-${i}-2`, `spoke-${i}-3`);
  addEdge(`spoke-${i}-3`, hqId);
}

for (let i = 0; i < 6; i += 1) {
  const next = (i + 1) % 6;
  const [c0, c2, c3] = RING_COLORS[i]!;
  const ids = [
    `ring-${i}-0`,
    `ring-${i}-1`,
    `ring-${i}-2`,
    `ring-${i}-3`
  ] as const;
  register({
    id: ids[0],
    kind: "category",
    category: c0,
    spokeIndex: i,
    spokeDepth: null,
    ringSlot: 0
  });
  register({
    id: ids[1],
    kind: "rollAgain",
    category: null,
    spokeIndex: i,
    spokeDepth: null,
    ringSlot: 1
  });
  register({
    id: ids[2],
    kind: "category",
    category: c2,
    spokeIndex: i,
    spokeDepth: null,
    ringSlot: 2
  });
  register({
    id: ids[3],
    kind: "category",
    category: c3,
    spokeIndex: i,
    spokeDepth: null,
    ringSlot: 3
  });
  addEdge(`hq-${i}`, ids[0]);
  addEdge(ids[0], ids[1]);
  addEdge(ids[1], ids[2]);
  addEdge(ids[2], ids[3]);
  addEdge(ids[3], `hq-${next}`);
}

export const TRIVIAL_PURSUIT_HUB_ID = HUB_ID;

export const TRIVIAL_PURSUIT_SPACES: readonly TrivialPursuitSpace[] = Object.freeze(
  [...spacesById.values()]
);

export function getTrivialPursuitSpace(id: string): TrivialPursuitSpace | undefined {
  return spacesById.get(id);
}

export function getTrivialPursuitNeighbors(id: string): readonly string[] {
  return adjacency.get(id) ?? [];
}

export function emptyWedges(): Record<TrivialPursuitCategory, boolean> {
  return {
    geography: false,
    history: false,
    artsAndLiterature: false,
    entertainment: false,
    sportsAndLeisure: false,
    scienceAndNature: false
  };
}

export function hasAllWedges(wedges: Record<TrivialPursuitCategory, boolean>): boolean {
  return TRIVIAL_PURSUIT_CATEGORIES.every((c) => wedges[c] === true);
}

export function wedgeCount(wedges: Record<TrivialPursuitCategory, boolean>): number {
  return TRIVIAL_PURSUIT_CATEGORIES.filter((c) => wedges[c]).length;
}

export function nextPlayerInOrder(playerOrder: readonly string[], currentId: string | null): string | null {
  if (playerOrder.length === 0) return null;
  if (!currentId) return playerOrder[0] ?? null;
  const idx = playerOrder.indexOf(currentId);
  if (idx === -1) return playerOrder[0] ?? null;
  return playerOrder[(idx + 1) % playerOrder.length] ?? null;
}

/**
 * Legal landing spaces for a die roll. Paths never reverse (cannot immediately
 * step back to the previous space). The hub may only be entered as the final
 * space of a walk, and only when `wedgesComplete` is true. Paths may not pass
 * through the hub as a shortcut.
 */
export function getLegalDestinations(
  fromId: string,
  roll: number,
  wedgesComplete: boolean
): string[] {
  if (!Number.isInteger(roll) || roll < 1 || roll > 6) {
    return [];
  }
  if (!spacesById.has(fromId)) {
    return [];
  }

  const destinations = new Set<string>();

  const walk = (current: string, remaining: number, previous: string | null): void => {
    if (remaining === 0) {
      if (current === HUB_ID && !wedgesComplete) {
        return;
      }
      destinations.add(current);
      return;
    }
    for (const neighbor of adjacency.get(current) ?? []) {
      if (neighbor === previous) continue;
      if (neighbor === HUB_ID) {
        if (remaining !== 1) continue;
        if (!wedgesComplete) continue;
      }
      walk(neighbor, remaining - 1, current);
    }
  };

  walk(fromId, roll, null);
  return [...destinations].sort();
}

export function isRollAgainSpace(spaceId: string): boolean {
  return spacesById.get(spaceId)?.kind === "rollAgain";
}

export function isHeadquartersSpace(spaceId: string): boolean {
  return spacesById.get(spaceId)?.kind === "headquarters";
}

export function categoryForSpace(spaceId: string): TrivialPursuitCategory | null {
  const space = spacesById.get(spaceId);
  if (!space) return null;
  if (space.kind === "category" || space.kind === "headquarters") {
    return space.category;
  }
  return null;
}

/** Classic: wedges only at HQ. Fast: any correct answer for a missing category. */
export type TrivialPursuitWedgeMode = "classic" | "fast";

export function shouldAwardWedge(opts: {
  mode: TrivialPursuitWedgeMode;
  spaceId: string;
  category: TrivialPursuitCategory | null;
  alreadyHas: boolean;
}): boolean {
  if (!opts.category || opts.alreadyHas) {
    return false;
  }
  if (opts.mode === "fast") {
    return true;
  }
  return isHeadquartersSpace(opts.spaceId);
}

export function fridayFusionPointsForWin(playerCount: number): number {
  return Math.max(0, Math.floor(playerCount));
}

export type TrivialPursuitStanding = {
  participantId: string;
  place: number;
  wedgeTotal: number;
  ffPoints: number;
};

/** Winner first (if any), then by wedge count descending. FF points go only to the winner. */
export function trivialPursuitStandings(
  players: readonly { participantId: string; wedges: Record<TrivialPursuitCategory, boolean> }[],
  winnerParticipantId: string | null
): TrivialPursuitStanding[] {
  const ffWin = fridayFusionPointsForWin(players.length);
  const sorted = [...players].sort((a, b) => {
    if (winnerParticipantId) {
      if (a.participantId === winnerParticipantId) return -1;
      if (b.participantId === winnerParticipantId) return 1;
    }
    const diff = wedgeCount(b.wedges) - wedgeCount(a.wedges);
    if (diff !== 0) return diff;
    return a.participantId.localeCompare(b.participantId);
  });
  return sorted.map((p, index) => ({
    participantId: p.participantId,
    place: index + 1,
    wedgeTotal: wedgeCount(p.wedges),
    ffPoints: p.participantId === winnerParticipantId ? ffWin : 0
  }));
}

/** Pick a reader uniformly from active players other than the contestant. */
export function pickReaderId(
  playerOrder: readonly string[],
  contestantId: string,
  random: () => number = Math.random
): string | null {
  const candidates = playerOrder.filter((id) => id !== contestantId);
  if (candidates.length === 0) return null;
  const idx = Math.floor(random() * candidates.length);
  return candidates[Math.min(candidates.length - 1, Math.max(0, idx))] ?? null;
}
