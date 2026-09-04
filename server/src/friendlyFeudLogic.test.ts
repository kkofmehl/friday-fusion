import { describe, expect, it } from "vitest";
import {
  friendlyFeudRoundMultiplier,
  matchFriendlyFeudGuess,
  nextFriendlyFeudRotator,
  normalizeFriendlyFeudGuess,
  otherFriendlyFeudTeam,
  pickFriendlyFeudWinners,
  resolveFaceOffControl
} from "../../shared/friendlyFeudLogic";

const BOARD = [
  { ans: "Television", pnt: 40 },
  { ans: "Sports", pnt: 25 },
  { ans: "Kids", pnt: 18 },
  { ans: "Pets / Animals", pnt: 12 }
];

describe("normalizeFriendlyFeudGuess", () => {
  it("strips articles, punctuation, and case", () => {
    expect(normalizeFriendlyFeudGuess("  The Television! ")).toBe("television");
    expect(normalizeFriendlyFeudGuess("A Sports")).toBe("sports");
    expect(normalizeFriendlyFeudGuess("Pets/Animals")).toBe("pets animals");
    expect(normalizeFriendlyFeudGuess("TV & Movies")).toBe("tv and movies");
  });
});

describe("matchFriendlyFeudGuess", () => {
  it("matches exact and article variants", () => {
    const revealed = [false, false, false, false];
    expect(matchFriendlyFeudGuess("television", BOARD, revealed)?.index).toBe(0);
    expect(matchFriendlyFeudGuess("The Sports", BOARD, revealed)?.index).toBe(1);
  });

  it("matches typos within edit distance", () => {
    const revealed = [false, false, false, false];
    expect(matchFriendlyFeudGuess("televison", BOARD, revealed)?.index).toBe(0);
    expect(matchFriendlyFeudGuess("sportz", BOARD, revealed)?.index).toBe(1);
  });

  it("matches containment for multi-word answers", () => {
    const revealed = [false, false, false, false];
    expect(matchFriendlyFeudGuess("animals", BOARD, revealed)?.index).toBe(3);
  });

  it("ignores already-revealed slots", () => {
    const revealed = [true, false, false, false];
    expect(matchFriendlyFeudGuess("television", BOARD, revealed)).toBeNull();
  });

  it("rejects loose mismatches", () => {
    const revealed = [false, false, false, false];
    expect(matchFriendlyFeudGuess("xyz", BOARD, revealed)).toBeNull();
    expect(matchFriendlyFeudGuess("car", BOARD, revealed)).toBeNull();
  });

  it("matches optional alts as exact synonyms", () => {
    const answers = [{ ans: "Police", pnt: 30, alts: ["cops", "cop", "police officer"] }];
    expect(matchFriendlyFeudGuess("cops", answers, [false])?.index).toBe(0);
    expect(matchFriendlyFeudGuess("police officer", answers, [false])?.ans).toBe("Police");
    expect(matchFriendlyFeudGuess("xyz", answers, [false])).toBeNull();
  });

  it("matches slash-part alts like TV for TV/Movies", () => {
    const answers = [{ ans: "TV/Movies", pnt: 66, alts: ["TV", "Movies"] }];
    expect(matchFriendlyFeudGuess("tv", answers, [false])?.index).toBe(0);
    expect(matchFriendlyFeudGuess("movies", answers, [false])?.index).toBe(0);
  });

  it("prefers higher points when similarity ties", () => {
    const answers = [
      { ans: "Hat", pnt: 10 },
      { ans: "Hat", pnt: 30 }
    ];
    const match = matchFriendlyFeudGuess("hat", answers, [false, false]);
    expect(match?.index).toBe(1);
    expect(match?.pnt).toBe(30);
  });
});

describe("resolveFaceOffControl", () => {
  it("awards #1 immediately", () => {
    expect(resolveFaceOffControl({ team: "A", matchIndex: 0 }, null)).toEqual({
      kind: "control",
      team: "A",
      matchIndex: 0
    });
  });

  it("asks for second when first is not #1", () => {
    expect(resolveFaceOffControl({ team: "A", matchIndex: 2 }, null)).toEqual({ kind: "needSecond" });
    expect(resolveFaceOffControl({ team: "A", matchIndex: null }, null)).toEqual({ kind: "needSecond" });
  });

  it("compares ranks and handles misses", () => {
    expect(
      resolveFaceOffControl({ team: "A", matchIndex: 2 }, { team: "B", matchIndex: 1 })
    ).toEqual({ kind: "control", team: "B", matchIndex: 1 });
    expect(
      resolveFaceOffControl({ team: "A", matchIndex: null }, { team: "B", matchIndex: 3 })
    ).toEqual({ kind: "control", team: "B", matchIndex: 3 });
    expect(
      resolveFaceOffControl({ team: "A", matchIndex: null }, { team: "B", matchIndex: null })
    ).toEqual({ kind: "redo" });
  });
});

describe("friendlyFeud helpers", () => {
  it("computes multipliers, other team, rotation, and winners", () => {
    expect(friendlyFeudRoundMultiplier(0)).toBe(1);
    expect(friendlyFeudRoundMultiplier(1)).toBe(1);
    expect(friendlyFeudRoundMultiplier(2)).toBe(2);
    expect(otherFriendlyFeudTeam("A")).toBe("B");
    expect(nextFriendlyFeudRotator(["a", "b", "c"], "b")).toBe("c");
    expect(nextFriendlyFeudRotator(["a", "b", "c"], "c")).toBe("a");
    expect(pickFriendlyFeudWinners({ A: 10, B: 5 })).toEqual(["A"]);
    expect(pickFriendlyFeudWinners({ A: 5, B: 5 })).toEqual(["A", "B"]);
  });
});
