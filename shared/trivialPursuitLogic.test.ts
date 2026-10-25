import { describe, expect, it } from "vitest";
import {
  TRIVIAL_PURSUIT_CATEGORIES,
  TRIVIAL_PURSUIT_CHOICE_HELPS_PER_GAME,
  TRIVIAL_PURSUIT_HUB_ID,
  TRIVIAL_PURSUIT_SPACES,
  categoryForSpace,
  emptyWedges,
  fridayFusionPointsForWin,
  getLegalDestinations,
  getTrivialPursuitNeighbors,
  getTrivialPursuitSpace,
  hasAllWedges,
  isHeadquartersSpace,
  isRollAgainSpace,
  nextPlayerInOrder,
  pickReaderId,
  shouldAwardWedge,
  trivialPursuitStandings
} from "./trivialPursuitLogic";

describe("trivialPursuitLogic board", () => {
  it("has hub, 6 HQs, 24 spoke spaces, 24 ring spaces, and 6 roll-again spaces", () => {
    expect(TRIVIAL_PURSUIT_SPACES.some((s) => s.id === TRIVIAL_PURSUIT_HUB_ID)).toBe(true);
    expect(TRIVIAL_PURSUIT_SPACES.filter((s) => s.kind === "headquarters")).toHaveLength(6);
    expect(TRIVIAL_PURSUIT_SPACES.filter((s) => s.spokeDepth !== null)).toHaveLength(24);
    expect(TRIVIAL_PURSUIT_SPACES.filter((s) => s.ringSlot !== null)).toHaveLength(24);
    expect(TRIVIAL_PURSUIT_SPACES.filter((s) => s.kind === "rollAgain")).toHaveLength(6);
    for (let i = 0; i < 6; i += 1) {
      expect(isRollAgainSpace(`ring-${i}-1`)).toBe(true);
      expect(isHeadquartersSpace(`hq-${i}`)).toBe(true);
      expect(categoryForSpace(`hq-${i}`)).toBe(TRIVIAL_PURSUIT_CATEGORIES[i]);
    }
  });

  it("connects the hub to each spoke start", () => {
    const neighbors = getTrivialPursuitNeighbors(TRIVIAL_PURSUIT_HUB_ID);
    expect(neighbors).toHaveLength(6);
    for (let i = 0; i < 6; i += 1) {
      expect(neighbors).toContain(`spoke-${i}-0`);
    }
  });

  it("exits the hub onto a spoke for a roll of 1", () => {
    const dests = getLegalDestinations(TRIVIAL_PURSUIT_HUB_ID, 1, false);
    expect(dests).toEqual([
      "spoke-0-0",
      "spoke-1-0",
      "spoke-2-0",
      "spoke-3-0",
      "spoke-4-0",
      "spoke-5-0"
    ]);
  });

  it("reaches headquarters from the hub in 5 spaces", () => {
    const dests = getLegalDestinations(TRIVIAL_PURSUIT_HUB_ID, 5, false);
    for (let i = 0; i < 6; i += 1) {
      expect(dests).toContain(`hq-${i}`);
    }
  });

  it("allows both ring directions from a headquarters", () => {
    const dests = getLegalDestinations("hq-0", 1, false);
    expect(dests).toContain("spoke-0-3");
    expect(dests).toContain("ring-0-0");
    expect(dests).toContain("ring-5-3");
  });

  it("rejects hub landing without all wedges and allows it with all wedges", () => {
    const nearHub = "spoke-0-0";
    expect(getLegalDestinations(nearHub, 1, false)).not.toContain(TRIVIAL_PURSUIT_HUB_ID);
    expect(getLegalDestinations(nearHub, 1, true)).toContain(TRIVIAL_PURSUIT_HUB_ID);
  });

  it("rejects cutting through the hub as a shortcut", () => {
    // From spoke-0-0 with roll 2, without wedges: cannot go hub → spoke-1-0.
    const dests = getLegalDestinations("spoke-0-0", 2, false);
    expect(dests).not.toContain("spoke-1-0");
    expect(dests).toContain("spoke-0-2");
  });

  it("treats roll-again ring slots as non-category spaces", () => {
    expect(getTrivialPursuitSpace("ring-0-1")?.kind).toBe("rollAgain");
    expect(categoryForSpace("ring-0-1")).toBeNull();
  });
});

describe("trivialPursuitLogic helpers", () => {
  it("tracks wedges and win points", () => {
    const wedges = emptyWedges();
    expect(hasAllWedges(wedges)).toBe(false);
    for (const c of TRIVIAL_PURSUIT_CATEGORIES) {
      wedges[c] = true;
    }
    expect(hasAllWedges(wedges)).toBe(true);
    expect(fridayFusionPointsForWin(4)).toBe(4);
    expect(TRIVIAL_PURSUIT_CHOICE_HELPS_PER_GAME).toBe(5);
  });

  it("advances player order and picks a reader who is not the contestant", () => {
    expect(nextPlayerInOrder(["a", "b", "c"], "a")).toBe("b");
    expect(nextPlayerInOrder(["a", "b", "c"], "c")).toBe("a");
    const reader = pickReaderId(["a", "b", "c"], "a", () => 0);
    expect(reader).toBe("b");
    expect(pickReaderId(["a", "b"], "a", () => 0.99)).toBe("b");
    expect(pickReaderId(["a"], "a")).toBeNull();
  });
});

describe("trivialPursuitStandings", () => {
  it("puts the winner first and awards FF points only to them", () => {
    const a = emptyWedges();
    a.geography = true;
    a.history = true;
    const b = emptyWedges();
    for (const c of TRIVIAL_PURSUIT_CATEGORIES) b[c] = true;
    const c = emptyWedges();
    c.scienceAndNature = true;
    const rows = trivialPursuitStandings(
      [
        { participantId: "p1", wedges: a },
        { participantId: "p2", wedges: b },
        { participantId: "p3", wedges: c }
      ],
      "p2"
    );
    expect(rows.map((r) => r.participantId)).toEqual(["p2", "p1", "p3"]);
    expect(rows[0]).toMatchObject({ place: 1, wedgeTotal: 6, ffPoints: 3 });
    expect(rows[1]).toMatchObject({ place: 2, wedgeTotal: 2, ffPoints: 0 });
    expect(rows[2]).toMatchObject({ place: 3, wedgeTotal: 1, ffPoints: 0 });
  });
});

describe("shouldAwardWedge", () => {
  it("classic awards only at headquarters for a missing category", () => {
    expect(
      shouldAwardWedge({
        mode: "classic",
        spaceId: "hq-0",
        category: "geography",
        alreadyHas: false
      })
    ).toBe(true);
    expect(
      shouldAwardWedge({
        mode: "classic",
        spaceId: "spoke-0-0",
        category: "geography",
        alreadyHas: false
      })
    ).toBe(false);
    expect(
      shouldAwardWedge({
        mode: "classic",
        spaceId: "hq-0",
        category: "geography",
        alreadyHas: true
      })
    ).toBe(false);
  });

  it("fast awards on any category space when the wedge is missing", () => {
    expect(
      shouldAwardWedge({
        mode: "fast",
        spaceId: "spoke-0-0",
        category: "geography",
        alreadyHas: false
      })
    ).toBe(true);
    expect(
      shouldAwardWedge({
        mode: "fast",
        spaceId: "ring-0-0",
        category: "geography",
        alreadyHas: false
      })
    ).toBe(true);
    expect(
      shouldAwardWedge({
        mode: "fast",
        spaceId: "spoke-0-0",
        category: "geography",
        alreadyHas: true
      })
    ).toBe(false);
  });
});
