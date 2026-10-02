import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { SplendorGemColorContract, SplendorState } from "../../../../shared/contracts";
import {
  createParticles,
  flyElement,
  prefersReducedMotion,
  pulseElement,
  scalePop
} from "./animate";
import { diffSplendorView, type SplendorPresentationEvent } from "./presentation";
import {
  playCardSound,
  playNobleSound,
  playPurchaseSound,
  playTokenSound,
  playVictorySound
} from "./sounds";

export type SplendorNotice = { id: number; text: string };

const GEM_PARTICLE: Record<SplendorGemColorContract | "gold", string> = {
  white: "#f7f3ea",
  blue: "#6ea2e0",
  green: "#3eaa74",
  red: "#d46a62",
  black: "#8a8175",
  gold: "#e4c27a"
};

function elementById(root: HTMLElement, id: string): HTMLElement | null {
  return root.querySelector<HTMLElement>(`[data-splendor-id="${id}"]`);
}

function liveRect(root: HTMLElement, id: string): DOMRect | undefined {
  return elementById(root, id)?.getBoundingClientRect();
}

function rememberPositions(root: HTMLElement): Map<string, DOMRect> {
  const next = new Map<string, DOMRect>();
  root.querySelectorAll<HTMLElement>("[data-splendor-id]").forEach((el) => {
    const id = el.dataset.splendorId;
    if (id) {
      next.set(id, el.getBoundingClientRect());
    }
  });
  return next;
}

function present(
  event: SplendorPresentationEvent,
  root: HTMLElement,
  previous: Map<string, DOMRect>,
  notify: (text: string) => void
): void {
  const reduced = prefersReducedMotion();

  if (event.type === "cardPurchased") {
    const from =
      (event.from === "reserved" ? previous.get(`reserved:${event.cardId}`) : undefined) ??
      previous.get(`card:${event.cardId}`) ??
      previous.get(`deck:${event.tier}`);
    const to =
      liveRect(root, `owned:${event.participantId}:${event.cardId}`) ??
      liveRect(root, `result:${event.participantId}`) ??
      liveRect(root, `seat:${event.participantId}`);
    if (from && to) {
      flyElement(from, to, `splendor-flyer--card splendor-flyer--${event.bonus}`);
    }
    const target = elementById(root, `owned:${event.participantId}:${event.cardId}`);
    if (target) {
      pulseElement(target);
    }
    if (!reduced && to) {
      createParticles(to, { count: 6, color: GEM_PARTICLE[event.bonus] });
    }
    playPurchaseSound();
    notify("Card purchased");
    return;
  }

  if (event.type === "cardReserved") {
    const from = event.cardId
      ? previous.get(`card:${event.cardId}`) ?? (event.tier ? previous.get(`deck:${event.tier}`) : undefined)
      : event.tier
        ? previous.get(`deck:${event.tier}`)
        : undefined;
    const to = event.cardId
      ? liveRect(root, `reserved:${event.cardId}`) ?? liveRect(root, `seat:${event.participantId}`)
      : liveRect(root, `seat:${event.participantId}`);
    if (from && to) {
      flyElement(from, to, "splendor-flyer--card splendor-flyer--gold");
    }
    playCardSound();
    notify("Card reserved");
    return;
  }

  if (event.type === "tokensGained" || event.type === "tokensSpent") {
    const bankId = `bank:${event.color}`;
    const handId = `tokens:${event.participantId}:${event.color}`;
    const from = event.type === "tokensGained" ? previous.get(bankId) : previous.get(handId);
    const to = event.type === "tokensGained" ? liveRect(root, handId) : liveRect(root, bankId);
    if (from && to) {
      flyElement(from, to, `splendor-flyer--token splendor-flyer--${event.color}`);
    }
    const chip = elementById(root, event.type === "tokensGained" ? handId : bankId);
    if (chip) {
      pulseElement(chip);
    }
    playTokenSound();
    return;
  }

  if (event.type === "nobleAcquired") {
    const from = previous.get(`noble:${event.nobleId}`);
    const to =
      liveRect(root, `noble-owned:${event.participantId}:${event.nobleId}`) ??
      liveRect(root, `seat:${event.participantId}`) ??
      liveRect(root, `result:${event.participantId}`);
    if (from && to) {
      flyElement(from, to, "splendor-flyer--noble");
    }
    if (!reduced && to) {
      createParticles(to, { count: 12, color: GEM_PARTICLE.gold });
    }
    const owned = elementById(root, `noble-owned:${event.participantId}:${event.nobleId}`);
    if (owned) {
      pulseElement(owned);
    }
    playNobleSound();
    notify("Noble acquired");
    return;
  }

  if (event.type === "scoreChanged") {
    const score = elementById(root, `score:${event.participantId}`);
    if (score) {
      scalePop(score);
    }
    if (event.milestone) {
      const rect =
        score?.getBoundingClientRect() ?? liveRect(root, `seat:${event.participantId}`);
      if (rect) {
        createParticles(rect, { count: 10, color: GEM_PARTICLE.gold });
      }
    }
    return;
  }

  if (event.type === "turnChanged") {
    const seat = elementById(root, `seat:${event.participantId}`);
    if (seat) {
      pulseElement(seat);
    }
    return;
  }

  if (event.type === "finalRound") {
    notify("Final round");
    return;
  }

  if (event.type === "gameFinished") {
    playVictorySound();
    for (const id of event.winnerParticipantIds) {
      const rect = liveRect(root, `result:${id}`);
      if (rect) {
        createParticles(rect, { count: 14, color: GEM_PARTICLE.gold });
      }
    }
  }
}

export function useSplendorMotion(
  state: SplendorState | null,
  viewerId: string,
  rootRef: RefObject<HTMLElement | null>
): { notices: SplendorNotice[]; dismissNotice: (id: number) => void } {
  const previousState = useRef<SplendorState | null>(null);
  const positions = useRef<Map<string, DOMRect>>(new Map());
  const sequence = useRef(0);
  const [notices, setNotices] = useState<SplendorNotice[]>([]);

  const dismissNotice = (id: number): void => {
    setNotices((current) => current.filter((notice) => notice.id !== id));
  };

  useLayoutEffect(() => {
    const root = rootRef.current;
    const prev = previousState.current;
    if (state && prev && root) {
      const events = diffSplendorView(prev, state, viewerId);
      const notify = (text: string): void => {
        const id = sequence.current + 1;
        sequence.current = id;
        setNotices((current) => [...current.slice(-2), { id, text }]);
        window.setTimeout(() => {
          setNotices((current) => current.filter((notice) => notice.id !== id));
        }, 2600);
      };
      for (const event of events) {
        present(event, root, positions.current, notify);
        if (event.type === "turnChanged" && event.participantId === viewerId) {
          notify("Your turn");
        }
      }
    }
    previousState.current = state;
    if (root) {
      positions.current = rememberPositions(root);
    }
  }, [rootRef, state, viewerId]);

  return { notices, dismissNotice };
}
