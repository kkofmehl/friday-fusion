import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Participant } from "../../../shared/contracts";
import { PlayerName } from "./PlayerName";

const participant: Participant = {
  id: "p1",
  displayName: "Alice",
  score: 0,
  isHost: false,
  isActive: true,
  avatar: { type: "stock", id: "avatar-lightbulb", avatarUrl: "/avatars/avatar-lightbulb.png" }
};

describe("PlayerName", () => {
  it("renders participant display name and avatar", () => {
    render(<PlayerName participant={participant} />);
    expect(screen.getByText("Alice")).toBeTruthy();
    expect(screen.getByText("💡")).toBeTruthy();
  });

  it("can resolve participant by id", () => {
    render(<PlayerName participantId="p1" participants={[participant]} />);
    expect(screen.getByText("Alice")).toBeTruthy();
  });
});
