import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SessionState } from "../../../shared/contracts";
import { BsGame } from "./BsGame";

/** Avoid matching outer containers that also contain this copy in `textContent`. */
function revealSummaryParagraphIncludes(
  substring: string | RegExp
): (content: string, el: Element | null) => boolean {
  return (_content, el) => {
    if (!el || el.tagName !== "P") {
      return false;
    }
    const t = el.textContent ?? "";
    if (!t.includes("Call was") || !t.includes("revealed cards:")) {
      return false;
    }
    return typeof substring === "string" ? t.includes(substring) : substring.test(t);
  };
}

const baseSession = (overrides: Partial<SessionState> = {}): SessionState => ({
  sessionId: "s1",
  sessionName: "Test",
  joinCode: "TEST",
  participants: [
    { id: "a", displayName: "Ann", score: 0, isHost: true, isActive: true },
    { id: "b", displayName: "Bob", score: 0, isHost: false, isActive: true },
    { id: "c", displayName: "Cara", score: 0, isHost: false, isActive: true }
  ],
  activeGame: "bs",
  gameState: {
    type: "bs",
    state: {
      status: "playing",
      currentPlayerId: "a",
      currentRank: "A",
      handCounts: { a: 18, b: 17, c: 17 },
      myHand: [
        { id: "hearts-A", suit: "hearts", rank: "A" },
        { id: "spades-2", suit: "spades", rank: "2" }
      ],
      discardCount: 0,
      finishedPlayerIds: []
    }
  },
  ...overrides
});

describe("BsGame", () => {
  it("shows active player controls in playing state", () => {
    const send = vi.fn();
    render(
      <BsGame session={baseSession()} currentParticipantId="a" isHost canPlay send={send} />
    );
    expect(screen.getByText("Your turn")).toBeTruthy();
    expect(screen.getByText("Discard pile: 0")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Play selected cards/i })).toBeTruthy();
  });

  it("highlights the play area when it is your turn in playing state", () => {
    const { container } = render(
      <BsGame session={baseSession()} currentParticipantId="a" isHost canPlay send={vi.fn()} />
    );
    expect(container.querySelector(".game-area-turn--active")).toBeTruthy();
  });

  it("shows challenge controls for non-current players", () => {
    const send = vi.fn();
    const session = baseSession({
      gameState: {
        type: "bs",
        state: {
          status: "challenging",
          currentPlayerId: "a",
          currentRank: "A",
          handCounts: { a: 16, b: 17, c: 17 },
          myHand: [{ id: "spades-2", suit: "spades", rank: "2" }],
          discardCount: 2,
          finishedPlayerIds: [],
          playedCount: 2,
          believedParticipantIds: [],
          calledBsParticipantId: null
        }
      }
    });
    render(
      <BsGame session={session} currentParticipantId="b" isHost={false} canPlay send={send} />
    );
    expect(screen.getByRole("button", { name: /I believe them/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /That's BS/i })).toBeTruthy();
    const handCard = screen.getByRole("button", { name: "2♠" });
    expect(handCard).toBeTruthy();
    expect((handCard as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows host challenge resolution buttons when challenged", () => {
    const send = vi.fn();
    const session = baseSession({
      gameState: {
        type: "bs",
        state: {
          status: "challenged",
          currentPlayerId: "a",
          currentRank: "A",
          handCounts: { a: 16, b: 17, c: 17 },
          myHand: [{ id: "hearts-A", suit: "hearts", rank: "A" }],
          discardCount: 3,
          finishedPlayerIds: [],
          playedCount: 3,
          believedParticipantIds: ["c"],
          calledBsParticipantId: "b",
          revealedCards: [
            { id: "hearts-A", suit: "hearts", rank: "A" },
            { id: "clubs-A", suit: "clubs", rank: "A" },
            { id: "diamonds-5", suit: "diamonds", rank: "5" }
          ]
        }
      }
    });
    render(
      <BsGame session={session} currentParticipantId="a" isHost canPlay send={send} />
    );
    const summary = screen.getByText(revealSummaryParagraphIncludes("A♥"));
    expect(summary.textContent).toContain("5♦");

    const truthBtn = screen.getByRole("button", { name: /Truth was told/i });
    const bsBtn = screen.getByRole("button", { name: /That was BS/i });
    expect(truthBtn.className).not.toContain("bs-host-resolve-btn--suggested");
    expect(bsBtn.className).toContain("bs-host-resolve-btn--suggested");
  });

  it("when challenged and all revealed cards match the call, suggests Truth was told for host", () => {
    const send = vi.fn();
    const session = baseSession({
      gameState: {
        type: "bs",
        state: {
          status: "challenged",
          currentPlayerId: "a",
          currentRank: "7",
          handCounts: { a: 16, b: 17, c: 17 },
          myHand: [{ id: "hearts-7", suit: "hearts", rank: "7" }],
          discardCount: 2,
          finishedPlayerIds: [],
          playedCount: 2,
          believedParticipantIds: ["c"],
          calledBsParticipantId: "b",
          revealedCards: [
            { id: "hearts-7", suit: "hearts", rank: "7" },
            { id: "clubs-7", suit: "clubs", rank: "7" }
          ]
        }
      }
    });
    render(
      <BsGame session={session} currentParticipantId="a" isHost canPlay send={send} />
    );
    const summary = screen.getByText(revealSummaryParagraphIncludes("7♥"));
    expect(summary.textContent).toContain("7♣");

    const truthBtn = screen.getByRole("button", { name: /Truth was told/i });
    const bsBtn = screen.getByRole("button", { name: /That was BS/i });
    expect(truthBtn.className).toContain("bs-host-resolve-btn--suggested");
    expect(bsBtn.className).not.toContain("bs-host-resolve-btn--suggested");
  });

  it("shows call and revealed cards to non-host while challenged", () => {
    const session = baseSession({
      gameState: {
        type: "bs",
        state: {
          status: "challenged",
          currentPlayerId: "a",
          currentRank: "K",
          handCounts: { a: 16, b: 17, c: 17 },
          myHand: [{ id: "spades-2", suit: "spades", rank: "2" }],
          discardCount: 2,
          finishedPlayerIds: [],
          playedCount: 1,
          believedParticipantIds: [],
          calledBsParticipantId: "b",
          revealedCards: [{ id: "hearts-K", suit: "hearts", rank: "K" }]
        }
      }
    });
    render(
      <BsGame session={session} currentParticipantId="c" isHost={false} canPlay send={vi.fn()} />
    );
    expect(screen.getByText(revealSummaryParagraphIncludes("K♥"))).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Truth was told/i })).toBeNull();
  });

  it("renders final scores in finished state", () => {
    const send = vi.fn();
    const session = baseSession({
      participants: [
        { id: "a", displayName: "Ann", score: 3, isHost: true, isActive: true },
        { id: "b", displayName: "Bob", score: 2, isHost: false, isActive: true },
        { id: "c", displayName: "Cara", score: 0, isHost: false, isActive: true }
      ],
      gameState: {
        type: "bs",
        state: {
          status: "finished",
          scores: { a: 3, b: 2, c: 0 }
        }
      }
    });
    render(
      <BsGame session={session} currentParticipantId="c" isHost={false} canPlay send={send} />
    );
    expect(screen.getByText(/The game is over/i)).toBeTruthy();
    expect(screen.getByLabelText("Final scores")).toBeTruthy();
  });

  it("sorts cards ascending and lifts selected card with suit color class", () => {
    const send = vi.fn();
    const session = baseSession({
      gameState: {
        type: "bs",
        state: {
          status: "playing",
          currentPlayerId: "a",
          currentRank: "A",
          handCounts: { a: 4, b: 17, c: 17 },
          myHand: [
            { id: "spades-K", suit: "spades", rank: "K" },
            { id: "diamonds-3", suit: "diamonds", rank: "3" },
            { id: "clubs-A", suit: "clubs", rank: "A" },
            { id: "hearts-3", suit: "hearts", rank: "3" }
          ],
          discardCount: 0,
          finishedPlayerIds: []
        }
      }
    });
    render(
      <BsGame session={session} currentParticipantId="a" isHost canPlay send={send} />
    );
    const cards = screen.getAllByRole("button").filter((el) => /[A-Z0-9]+[♣♦♥♠]/.test(el.textContent ?? ""));
    expect(cards.map((el) => el.textContent)).toEqual(["A♣", "3♦", "3♥", "K♠"]);
    expect(cards[1]?.className).toContain("bs-card--diamonds");
    expect(cards[2]?.className).toContain("bs-card--hearts");
    fireEvent.click(cards[0]!);
    expect(cards[0]?.className).toContain("bs-card--selected");
  });
});
