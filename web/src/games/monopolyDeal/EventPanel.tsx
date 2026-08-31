import { useEffect, useState, type JSX } from "react";
import type { MonopolyDealRecentEvent, SessionState } from "../../../../shared/contracts";
import { PlayerName } from "../../components/PlayerName";
import { MonopolyDealCard } from "./MonopolyDealCard";
import { COLOR_LABEL } from "./colors";

function EventBody({
  event,
  participants
}: {
  event: MonopolyDealRecentEvent;
  participants: SessionState["participants"];
}): JSX.Element {
  const name = (id: string): JSX.Element => (
    <PlayerName participantId={id} participants={participants} size="sm" inline />
  );

  if (event.type === "steal") {
    return (
      <>
        <p>
          {name(event.actorId)} used {event.actionName} against {name(event.targetId)} and stole:
        </p>
        <MonopolyDealCard
          card={{ id: event.card.instanceId, defId: event.card.defId }}
          activeColor={event.card.activeColor}
          compact
          showHelp={false}
        />
      </>
    );
  }

  if (event.type === "swap") {
    return (
      <>
        <p>
          {name(event.actorId)} swapped properties with {name(event.targetId)}:
        </p>
        <div className="md-event-cards">
          <MonopolyDealCard
            card={{ id: event.takenCard.instanceId, defId: event.takenCard.defId }}
            activeColor={event.takenCard.activeColor}
            compact
            showHelp={false}
          />
          <span className="md-event-swap-arrow">⇄</span>
          <MonopolyDealCard
            card={{ id: event.givenCard.instanceId, defId: event.givenCard.defId }}
            activeColor={event.givenCard.activeColor}
            compact
            showHelp={false}
          />
        </div>
      </>
    );
  }

  if (event.type === "payment") {
    return (
      <p>
        {name(event.payerId)} paid {event.amount}M to {name(event.payeeId)} ({event.reason}).
      </p>
    );
  }

  if (event.type === "setStolen") {
    return (
      <p>
        {name(event.actorId)} used Deal Breaker on {name(event.targetId)} and stole the {COLOR_LABEL[event.color]} set.
      </p>
    );
  }

  if (event.type === "justSayNo") {
    return (
      <p>
        {name(event.playerId)} played Just Say No to block {name(event.actorId)}&apos;s {event.actionLabel}
        {event.targetId ? (
          <>
            {" "}
            against {name(event.targetId)}
          </>
        ) : null}
        .
      </p>
    );
  }

  return (
    <p>
      {name(event.playerId)} completed a {COLOR_LABEL[event.color]} set!
    </p>
  );
}

export function EventPanel({
  event,
  events,
  eventSeq,
  participants
}: {
  event: MonopolyDealRecentEvent | null;
  events?: MonopolyDealRecentEvent[];
  eventSeq: number;
  participants: SessionState["participants"];
}): JSX.Element | null {
  const [visible, setVisible] = useState(false);
  const [shownSeq, setShownSeq] = useState(0);
  const [queueIndex, setQueueIndex] = useState(0);

  const queue = (events ?? []).length > 0 ? events ?? [] : event ? [event] : [];
  const currentEvent = queue[queueIndex] ?? null;

  useEffect(() => {
    if (queue.length === 0 || eventSeq === shownSeq) {
      return;
    }
    setShownSeq(eventSeq);
    setQueueIndex(0);
    setVisible(true);
  }, [event, eventSeq, queue.length, shownSeq]);

  useEffect(() => {
    if (!visible || queue.length === 0) {
      return;
    }
    const timer = window.setTimeout(() => {
      if (queueIndex < queue.length - 1) {
        setQueueIndex((index) => index + 1);
        return;
      }
      setVisible(false);
    }, 4500);
    return () => window.clearTimeout(timer);
  }, [visible, queueIndex, queue.length]);

  if (!visible || !currentEvent) {
    return null;
  }

  return (
    <div className="md-event-panel" role="status">
      <div className="md-event-title">Event</div>
      <EventBody event={currentEvent} participants={participants} />
    </div>
  );
}
