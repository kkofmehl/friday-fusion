import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MonopolyDealGame } from "./MonopolyDealGame";
import type { MonopolyDealPlayerBoard, SessionState } from "../../../shared/contracts";

const baseSession = (over: Partial<SessionState> = {}): SessionState => ({
  sessionId: "s1",
  sessionName: "Test",
  joinCode: "TEST",
  participants: [
    { id: "a", displayName: "Ann", score: 0, isHost: true, isActive: true },
    { id: "b", displayName: "Bob", score: 0, isHost: false, isActive: true }
  ],
  activeGame: "monopolyDeal",
  gameState: {
    type: "monopolyDeal",
    state: {
      status: "wagering",
      wagers: {},
      submittedWagerIds: [],
      pot: 0
    }
  },
  ...over
});

describe("MonopolyDealGame", () => {
  it("renders wagering UI", () => {
    render(
      <MonopolyDealGame session={baseSession()} currentParticipantId="a" isHost canPlay send={vi.fn()} />
    );
    expect(screen.getByText(/Place your wager/i)).toBeTruthy();
    expect(screen.getByText(/Current pot/i)).toBeTruthy();
  });

  it("renders playing state with hand", () => {
    render(
      <MonopolyDealGame
        session={baseSession({
          gameState: {
            type: "monopolyDeal",
            state: {
              status: "playing",
              currentPlayerId: "a",
              playsRemaining: 3,
              drawPileCount: 80,
              discardCount: 2,
              boards: [
                {
                  participantId: "a",
                  bank: [],
                  propertySets: {} as MonopolyDealPlayerBoard["propertySets"],
                  handCount: 2
                }
              ],
              myHand: [{ id: "c1", defId: "money-1m-0" }],
              pot: 4,
              wagers: { a: 2, b: 2 },
              pendingResolution: null,
              phase: "playing",
              recentEvent: null,
              recentEvents: [],
              eventSeq: 0,
              canCancelPendingAction: false,
              undoableBankCardId: null,
              justSayNoLate: null
            }
          }
        })}
        currentParticipantId="a"
        isHost
        canPlay
        send={vi.fn()}
      />
    );
    expect(screen.getByText(/Pot: 4 pts/i)).toBeTruthy();
    expect(screen.getByText(/Your hand/i)).toBeTruthy();
    expect(screen.getByLabelText("Card help")).toBeTruthy();
  });

  it("locks hand and pulses end turn when no plays remain", () => {
    render(
      <MonopolyDealGame
        session={baseSession({
          gameState: {
            type: "monopolyDeal",
            state: {
              status: "playing",
              currentPlayerId: "a",
              playsRemaining: 0,
              drawPileCount: 80,
              discardCount: 2,
              boards: [
                {
                  participantId: "a",
                  bank: [],
                  propertySets: {} as MonopolyDealPlayerBoard["propertySets"],
                  handCount: 5
                }
              ],
              myHand: [{ id: "c1", defId: "money-1m-0" }],
              pot: 4,
              wagers: { a: 2, b: 2 },
              pendingResolution: null,
              phase: "playing",
              recentEvent: null,
              recentEvents: [],
              eventSeq: 0,
              canCancelPendingAction: false,
              undoableBankCardId: null,
              justSayNoLate: null
            }
          }
        })}
        currentParticipantId="a"
        isHost
        canPlay
        send={vi.fn()}
      />
    );
    expect(screen.getByText(/No plays left/i)).toBeTruthy();
    expect(document.querySelector(".md-btn--pulse")).toBeTruthy();
    expect(document.querySelector(".md-card--disabled")).toBeTruthy();
  });

  it("survives rerender from wagering to playing", () => {
    const send = vi.fn();
    const { rerender } = render(
      <MonopolyDealGame session={baseSession()} currentParticipantId="a" isHost canPlay send={send} />
    );
    expect(screen.getByText(/Place your wager/i)).toBeTruthy();

    rerender(
      <MonopolyDealGame
        session={baseSession({
          gameState: {
            type: "monopolyDeal",
            state: {
              status: "playing",
              currentPlayerId: "a",
              playsRemaining: 3,
              drawPileCount: 80,
              discardCount: 2,
              boards: [
                {
                  participantId: "a",
                  bank: [],
                  propertySets: {} as MonopolyDealPlayerBoard["propertySets"],
                  handCount: 7
                },
                {
                  participantId: "b",
                  bank: [],
                  propertySets: {} as MonopolyDealPlayerBoard["propertySets"],
                  handCount: 7
                }
              ],
              myHand: [{ id: "c1", defId: "money-1m-0" }],
              pot: 4,
              wagers: { a: 2, b: 2 },
              pendingResolution: null,
              phase: "playing",
              recentEvent: null,
              recentEvents: [],
              eventSeq: 0,
              canCancelPendingAction: false,
              undoableBankCardId: null,
              justSayNoLate: null
            }
          }
        })}
        currentParticipantId="a"
        isHost
        canPlay
        send={send}
      />
    );
    expect(screen.getByText(/Your hand/i)).toBeTruthy();
    expect(screen.getByText(/End turn/i)).toBeTruthy();
  });

  it("enables pay selected once all money and non-wild properties are chosen, even if still short", () => {
    const send = vi.fn();
    render(
      <MonopolyDealGame
        session={baseSession({
          gameState: {
            type: "monopolyDeal",
            state: {
              status: "playing",
              currentPlayerId: "b",
              playsRemaining: 2,
              drawPileCount: 80,
              discardCount: 2,
              boards: [
                {
                  participantId: "a",
                  bank: [],
                  propertySets: {} as MonopolyDealPlayerBoard["propertySets"],
                  handCount: 5
                },
                {
                  participantId: "b",
                  bank: [{ id: "m1", defId: "money-1m-0" }],
                  propertySets: {
                    pink: {
                      cards: [{ instanceId: "p1", defId: "prop-pink-stcharles", activeColor: "pink" }],
                      house: false,
                      hotel: false
                    }
                  } as MonopolyDealPlayerBoard["propertySets"],
                  handCount: 5
                }
              ],
              myHand: [],
              pot: 4,
              wagers: { a: 2, b: 2 },
              pendingResolution: {
                kind: "collectPayment",
                payerId: "b",
                payeeId: "a",
                amountDue: 4,
                reason: "Rent (pink)",
                queueRemaining: []
              },
              phase: "playing"
            }
          }
        })}
        currentParticipantId="b"
        isHost={false}
        canPlay
        send={send}
      />
    );

    const payButton = screen.getByRole("button", { name: /Pay selected/i }) as HTMLButtonElement;
    const picker = document.querySelector(".md-payment-picker");
    expect(picker).toBeTruthy();
    expect(picker?.querySelector(".md-card--money-1")).toBeTruthy();
    const pickerButtons = within(picker as HTMLElement).getAllByRole("button");

    expect(payButton.disabled).toBe(true);
    expect(screen.getByText(/Selected: 0M \(need 4M\+\)/i)).toBeTruthy();

    fireEvent.click(pickerButtons[0]!);
    expect(screen.getByText(/Selected: 1M \(need 4M\+\)/i)).toBeTruthy();
    expect(payButton.disabled).toBe(true);

    fireEvent.click(pickerButtons[1]!);
    expect(screen.getByText(/Selected: 3M \(need 4M\)/i)).toBeTruthy();
    expect(screen.getByText(/that's all you can pay/i)).toBeTruthy();
    expect(payButton.disabled).toBe(false);

    fireEvent.click(payButton);
    expect(send).toHaveBeenCalledWith({
      type: "monopolyDeal:submitPayment",
      payload: {
        cards: [
          { zone: "bank", instanceId: "m1" },
          { zone: "property", instanceId: "p1", propertyColor: "pink" }
        ]
      }
    });
  });

  it("shows rent action buttons when a rent card is selected and double rent is in hand", () => {
    const send = vi.fn();
    render(
      <MonopolyDealGame
        session={baseSession({
          gameState: {
            type: "monopolyDeal",
            state: {
              status: "playing",
              currentPlayerId: "a",
              playsRemaining: 3,
              drawPileCount: 80,
              discardCount: 2,
              boards: [
                {
                  participantId: "a",
                  bank: [],
                  propertySets: {
                    brown: {
                      cards: [
                        { instanceId: "b1", defId: "prop-brown-mediterranean", activeColor: "brown" },
                        { instanceId: "b2", defId: "prop-brown-baltic", activeColor: "brown" }
                      ],
                      house: false,
                      hotel: false
                    }
                  } as MonopolyDealPlayerBoard["propertySets"],
                  handCount: 2
                },
                {
                  participantId: "b",
                  bank: [],
                  propertySets: {} as MonopolyDealPlayerBoard["propertySets"],
                  handCount: 7
                }
              ],
              myHand: [
                { id: "rent-1", defId: "rent-brown-lightBlue-0" },
                { id: "double-1", defId: "action-doubleTheRent-0" }
              ],
              pot: 2,
              wagers: { a: 1, b: 1 },
              pendingResolution: null,
              phase: "playing",
              recentEvent: null,
              recentEvents: [],
              eventSeq: 0,
              canCancelPendingAction: false,
              undoableBankCardId: null,
              justSayNoLate: null
            }
          }
        })}
        currentParticipantId="a"
        isHost
        canPlay
        send={send}
      />
    );

    const handRow = document.querySelector(".md-hand-row");
    expect(handRow).toBeTruthy();
    fireEvent.click(within(handRow as HTMLElement).getAllByRole("button")[0]!);

    expect(screen.getByRole("button", { name: /Play Rent Action$/i })).toBeTruthy();
    const doubleButton = screen.getByRole("button", { name: /Play Rent Action 2x/i });
    expect(doubleButton).toBeTruthy();

    fireEvent.click(doubleButton);
    expect(send).toHaveBeenCalledWith({
      type: "monopolyDeal:playAction",
      payload: { cardId: "rent-1", doubleRentCardId: "double-1" }
    });
  });

  it("does not offer Play action for Just Say No cards", () => {
    render(
      <MonopolyDealGame
        session={baseSession({
          gameState: {
            type: "monopolyDeal",
            state: {
              status: "playing",
              currentPlayerId: "a",
              playsRemaining: 3,
              drawPileCount: 80,
              discardCount: 2,
              boards: [
                {
                  participantId: "a",
                  bank: [],
                  propertySets: {} as MonopolyDealPlayerBoard["propertySets"],
                  handCount: 1
                }
              ],
              myHand: [{ id: "jsn-1", defId: "action-justSayNo-0" }],
              pot: 2,
              wagers: { a: 1, b: 1 },
              pendingResolution: null,
              phase: "playing",
              recentEvent: null,
              recentEvents: [],
              eventSeq: 0,
              canCancelPendingAction: false,
              undoableBankCardId: null,
              justSayNoLate: null
            }
          }
        })}
        currentParticipantId="a"
        isHost
        canPlay
        send={vi.fn()}
      />
    );

    const handRow = document.querySelector(".md-hand-row");
    fireEvent.click(within(handRow as HTMLElement).getByRole("button"));
    expect(screen.queryByRole("button", { name: /Play action/i })).toBeNull();
    expect(screen.getByRole("button", { name: /Bank/i })).toBeTruthy();
  });

  it("shows Just Say No panel only to players who can counter", () => {
    const jsnPending = {
      kind: "justSayNo" as const,
      action: {
        type: "slyDeal" as const,
        actorId: "a",
        targetId: "b",
        cardInstanceId: "their-brown"
      },
      eligiblePlayerIds: ["b"],
      primaryTargetId: "b",
      canCounter: true,
      expiresAt: Date.now() + 5000
    };
    const playingBase = {
      status: "playing" as const,
      currentPlayerId: "a",
      playsRemaining: 2,
      drawPileCount: 80,
      discardCount: 2,
      boards: [
        {
          participantId: "a",
          bank: [],
          propertySets: {} as MonopolyDealPlayerBoard["propertySets"],
          handCount: 5
        },
        {
          participantId: "b",
          bank: [],
          propertySets: {} as MonopolyDealPlayerBoard["propertySets"],
          handCount: 5
        }
      ],
      pot: 4,
      wagers: { a: 2, b: 2 },
      pendingResolution: jsnPending,
      phase: "playing" as const,
      recentEvent: null,
      recentEvents: [],
      eventSeq: 0,
      canCancelPendingAction: false,
      undoableBankCardId: null,
      justSayNoLate: null
    };

    const { rerender } = render(
      <MonopolyDealGame
        session={baseSession({
          gameState: { type: "monopolyDeal", state: { ...playingBase, myHand: [{ id: "m1", defId: "money-1m-0" }] } }
        })}
        currentParticipantId="b"
        isHost={false}
        canPlay
        send={vi.fn()}
      />
    );
    expect(screen.queryByText(/Just Say No\?/i)).toBeNull();

    rerender(
      <MonopolyDealGame
        session={baseSession({
          gameState: {
            type: "monopolyDeal",
            state: { ...playingBase, myHand: [{ id: "jsn-1", defId: "action-justSayNo-0" }] }
          }
        })}
        currentParticipantId="b"
        isHost={false}
        canPlay
        send={vi.fn()}
      />
    );
    expect(screen.getByText(/Just Say No\?/i)).toBeTruthy();
    const jsnPanel = document.querySelector(".md-jsn-panel");
    expect(jsnPanel).toBeTruthy();
    expect(within(jsnPanel as HTMLElement).getByText(/Sly Deal/i)).toBeTruthy();
    expect(within(jsnPanel as HTMLElement).getByText(/Ann/i)).toBeTruthy();
    expect(within(jsnPanel as HTMLElement).getByText(/Bob/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Allow$/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Just Say No$/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /I'm thinking/i })).toBeTruthy();
  });

  it("shows Allow to an eligible player who is not the primary target", () => {
    const playingState = {
      status: "playing" as const,
      currentPlayerId: "a",
      playsRemaining: 2,
      drawPileCount: 80,
      discardCount: 2,
      boards: [
        {
          participantId: "a",
          bank: [],
          propertySets: {} as MonopolyDealPlayerBoard["propertySets"],
          handCount: 5
        },
        {
          participantId: "b",
          bank: [],
          propertySets: {} as MonopolyDealPlayerBoard["propertySets"],
          handCount: 5
        },
        {
          participantId: "c",
          bank: [],
          propertySets: {} as MonopolyDealPlayerBoard["propertySets"],
          handCount: 5
        }
      ],
      myHand: [{ id: "jsn-1", defId: "action-justSayNo-0" }],
      pot: 6,
      wagers: { a: 2, b: 2, c: 2 },
      pendingResolution: {
        kind: "justSayNo" as const,
        action: {
          type: "itsMyBirthday" as const,
          actorId: "a",
          targetId: "b"
        },
        eligiblePlayerIds: ["b", "c"],
        primaryTargetId: "b",
        affectedPlayerIds: ["b", "c"],
        canCounter: true,
        expiresAt: Date.now() + 5000
      },
      phase: "playing" as const,
      recentEvent: null,
      recentEvents: [],
      eventSeq: 0,
      canCancelPendingAction: false,
      undoableBankCardId: null,
      justSayNoLate: null
    };

    render(
      <MonopolyDealGame
        session={baseSession({
          participants: [
            { id: "a", displayName: "Ann", score: 0, isHost: true, isActive: true },
            { id: "b", displayName: "Bob", score: 0, isHost: false, isActive: true },
            { id: "c", displayName: "Cam", score: 0, isHost: false, isActive: true }
          ],
          gameState: { type: "monopolyDeal", state: playingState }
        })}
        currentParticipantId="c"
        isHost={false}
        canPlay
        send={vi.fn()}
      />
    );

    expect(screen.getByText(/Just Say No\?/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Allow$/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Just Say No$/i })).toBeTruthy();
  });

  it("does not show Allow during the late Just Say No window", () => {
    render(
      <MonopolyDealGame
        session={baseSession({
          gameState: {
            type: "monopolyDeal",
            state: {
              status: "playing",
              currentPlayerId: "a",
              playsRemaining: 2,
              drawPileCount: 80,
              discardCount: 2,
              boards: [
                {
                  participantId: "a",
                  bank: [],
                  propertySets: {} as MonopolyDealPlayerBoard["propertySets"],
                  handCount: 5
                },
                {
                  participantId: "b",
                  bank: [],
                  propertySets: {} as MonopolyDealPlayerBoard["propertySets"],
                  handCount: 5
                }
              ],
              myHand: [{ id: "jsn-1", defId: "action-justSayNo-0" }],
              pot: 4,
              wagers: { a: 2, b: 2 },
              pendingResolution: null,
              phase: "playing",
              recentEvent: null,
              recentEvents: [],
              eventSeq: 0,
              canCancelPendingAction: false,
              undoableBankCardId: null,
              justSayNoLate: {
                action: {
                  type: "slyDeal",
                  actorId: "a",
                  targetId: "b",
                  cardInstanceId: "their-brown"
                },
                eligiblePlayerIds: ["b"],
                primaryTargetId: "b"
              }
            }
          }
        })}
        currentParticipantId="b"
        isHost={false}
        canPlay
        send={vi.fn()}
      />
    );

    expect(screen.getByText(/Last chance/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Allow$/i })).toBeNull();
    expect(screen.getByRole("button", { name: /^Just Say No$/i })).toBeTruthy();
  });

  it("keeps Just Say No available after a counter window with apply late effect", () => {
    render(
      <MonopolyDealGame
        session={baseSession({
          gameState: {
            type: "monopolyDeal",
            state: {
              status: "playing",
              currentPlayerId: "a",
              playsRemaining: 2,
              drawPileCount: 80,
              discardCount: 2,
              boards: [
                {
                  participantId: "a",
                  bank: [],
                  propertySets: {} as MonopolyDealPlayerBoard["propertySets"],
                  handCount: 5
                },
                {
                  participantId: "b",
                  bank: [],
                  propertySets: {} as MonopolyDealPlayerBoard["propertySets"],
                  handCount: 5
                }
              ],
              myHand: [{ id: "jsn-1", defId: "action-justSayNo-0" }],
              pot: 4,
              wagers: { a: 2, b: 2 },
              pendingResolution: null,
              phase: "playing",
              recentEvent: null,
              recentEvents: [],
              eventSeq: 0,
              canCancelPendingAction: false,
              undoableBankCardId: null,
              justSayNoLate: {
                action: {
                  type: "slyDeal",
                  actorId: "a",
                  targetId: "b",
                  cardInstanceId: "their-brown"
                },
                eligiblePlayerIds: ["a"],
                primaryTargetId: "b",
                effect: "apply"
              }
            }
          }
        })}
        currentParticipantId="a"
        isHost
        canPlay
        send={vi.fn()}
      />
    );

    expect(screen.getByText(/Last chance/i)).toBeTruthy();
    expect(screen.getByText(/original action still happens/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Allow$/i })).toBeNull();
    expect(screen.getByRole("button", { name: /^Just Say No$/i })).toBeTruthy();
  });

  it("lays a regular property on double-click", () => {
    const send = vi.fn();
    render(
      <MonopolyDealGame
        session={baseSession({
          gameState: {
            type: "monopolyDeal",
            state: {
              status: "playing",
              currentPlayerId: "a",
              playsRemaining: 3,
              drawPileCount: 80,
              discardCount: 2,
              boards: [
                {
                  participantId: "a",
                  bank: [],
                  propertySets: {} as MonopolyDealPlayerBoard["propertySets"],
                  handCount: 1
                }
              ],
              myHand: [{ id: "brown-1", defId: "prop-brown-mediterranean" }],
              pot: 2,
              wagers: { a: 1, b: 1 },
              pendingResolution: null,
              phase: "playing",
              recentEvent: null,
              recentEvents: [],
              eventSeq: 0,
              canCancelPendingAction: false,
              undoableBankCardId: null,
              justSayNoLate: null
            }
          }
        })}
        currentParticipantId="a"
        isHost
        canPlay
        send={send}
      />
    );

    const handRow = document.querySelector(".md-hand-row");
    fireEvent.doubleClick(within(handRow as HTMLElement).getByRole("button"));
    expect(send).toHaveBeenCalledWith({
      type: "monopolyDeal:layProperty",
      payload: { cardId: "brown-1", color: "brown" }
    });
  });

  it("offers move-to-color buttons for a selected rainbow wild", () => {
    const send = vi.fn();
    render(
      <MonopolyDealGame
        session={baseSession({
          gameState: {
            type: "monopolyDeal",
            state: {
              status: "playing",
              currentPlayerId: "a",
              playsRemaining: 3,
              drawPileCount: 80,
              discardCount: 2,
              boards: [
                {
                  participantId: "a",
                  bank: [],
                  propertySets: {
                    brown: {
                      cards: [{ instanceId: "rainbow-1", defId: "wild-multi-0", activeColor: "brown" }],
                      house: false,
                      hotel: false
                    }
                  } as MonopolyDealPlayerBoard["propertySets"],
                  handCount: 1
                }
              ],
              myHand: [],
              pot: 2,
              wagers: { a: 1, b: 1 },
              pendingResolution: null,
              phase: "playing",
              recentEvent: null,
              recentEvents: [],
              eventSeq: 0,
              canCancelPendingAction: false,
              undoableBankCardId: null,
              justSayNoLate: null
            }
          }
        })}
        currentParticipantId="a"
        isHost
        canPlay
        send={send}
      />
    );

    const properties = document.querySelector(".md-properties");
    fireEvent.click(within(properties as HTMLElement).getByRole("button"));
    const greenButton = screen.getByRole("button", { name: /Move wild to Green/i });
    fireEvent.click(greenButton);
    expect(send).toHaveBeenCalledWith({
      type: "monopolyDeal:moveWild",
      payload: { instanceId: "rainbow-1", fromColor: "brown", toColor: "green" }
    });
  });

  it("sends extendJustSayNo when I'm thinking is clicked", () => {
    const send = vi.fn();
    render(
      <MonopolyDealGame
        session={baseSession({
          gameState: {
            type: "monopolyDeal",
            state: {
              status: "playing",
              currentPlayerId: "a",
              playsRemaining: 2,
              drawPileCount: 80,
              discardCount: 2,
              boards: [
                {
                  participantId: "a",
                  bank: [],
                  propertySets: {} as MonopolyDealPlayerBoard["propertySets"],
                  handCount: 5
                },
                {
                  participantId: "b",
                  bank: [],
                  propertySets: {} as MonopolyDealPlayerBoard["propertySets"],
                  handCount: 5
                }
              ],
              myHand: [{ id: "jsn-1", defId: "action-justSayNo-0" }],
              pot: 4,
              wagers: { a: 2, b: 2 },
              pendingResolution: {
                kind: "justSayNo",
                action: {
                  type: "slyDeal",
                  actorId: "a",
                  targetId: "b",
                  cardInstanceId: "their-brown"
                },
                eligiblePlayerIds: ["b"],
                primaryTargetId: "b",
                canCounter: true,
                expiresAt: Date.now() + 5000
              },
              phase: "playing",
              recentEvent: null,
              recentEvents: [],
              eventSeq: 0,
              canCancelPendingAction: false,
              undoableBankCardId: null,
              justSayNoLate: null
            }
          }
        })}
        currentParticipantId="b"
        isHost={false}
        canPlay
        send={send}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /I'm thinking/i }));
    expect(send).toHaveBeenCalledWith({ type: "monopolyDeal:extendJustSayNo", payload: {} });
    expect(screen.getByRole("button", { name: /^Allow$/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Just Say No$/i })).toBeTruthy();
    expect(screen.getByText(/30s remaining to counter/i)).toBeTruthy();
  });
});
