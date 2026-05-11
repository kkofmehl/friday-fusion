import { describe, expect, it } from "vitest";
import type { Participant } from "../../../shared/contracts";
import { activeParticipants, participantIsActive } from "./participants";

const p = (id: string, isActive = true): Participant => ({
  id,
  displayName: id,
  score: 0,
  isHost: id === "h",
  isActive
});

describe("participants helpers", () => {
  it("participantIsActive treats missing flag as active", () => {
    const row = { id: "a", displayName: "a", score: 0, isHost: false } as unknown as Participant;
    expect(participantIsActive(row)).toBe(true);
  });

  it("participantIsActive is false only when explicitly false", () => {
    expect(participantIsActive(p("b", false))).toBe(false);
    expect(participantIsActive(p("c", true))).toBe(true);
  });

  it("activeParticipants filters out benched players", () => {
    const list: Participant[] = [p("h"), p("a", true), p("b", false)];
    expect(activeParticipants(list).map((x) => x.id)).toEqual(["h", "a"]);
  });
});
