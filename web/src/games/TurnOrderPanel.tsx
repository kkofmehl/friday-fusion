import { useState, type DragEvent } from "react";
import type { ClientEvent, Participant, SessionState } from "../../../shared/contracts";
import { activeParticipants, participantIsActive } from "../utils/participants";
import { PlayerName } from "../components/PlayerName";

type Props = {
  session: SessionState;
  currentParticipantId: string;
  puzzleCreatorId: string;
  currentTurnId: string | null;
  isHost: boolean;
  send: (event: ClientEvent) => void;
};

export function TurnOrderPanel({
  session,
  currentParticipantId,
  puzzleCreatorId,
  currentTurnId,
  isHost,
  send
}: Props): JSX.Element | null {
  const guessers = activeParticipants(session.participants).filter((p) => p.id !== puzzleCreatorId);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  if (guessers.length === 0) {
    return (
      <aside className="turn-order">
        <h3 className="turn-order-title">Turn order</h3>
        <p className="turn-order-empty">No guessers yet. Players who join will take turns here.</p>
      </aside>
    );
  }

  const handleDragStart = (event: DragEvent<HTMLLIElement>, id: string): void => {
    if (!isHost) return;
    setDraggingId(id);
    event.dataTransfer.effectAllowed = "move";
    try {
      event.dataTransfer.setData("text/plain", id);
    } catch {
      // Some browsers don't allow setData on dragstart from every element;
      // the local draggingId state is enough for our use.
    }
  };

  const handleDragOver = (event: DragEvent<HTMLLIElement>): void => {
    if (!isHost || !draggingId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (event: DragEvent<HTMLLIElement>, targetId: string): void => {
    if (!isHost || !draggingId || draggingId === targetId) {
      setDraggingId(null);
      return;
    }
    event.preventDefault();
    const fullOrder = session.participants.map((p) => p.id);
    const activeGuesserIds = session.participants
      .filter((p) => p.id !== puzzleCreatorId && participantIsActive(p))
      .map((p) => p.id);
    const fromIndex = activeGuesserIds.indexOf(draggingId);
    const toIndex = activeGuesserIds.indexOf(targetId);
    if (fromIndex < 0 || toIndex < 0) {
      setDraggingId(null);
      return;
    }
    const reorderedGuessers = [...activeGuesserIds];
    reorderedGuessers.splice(fromIndex, 1);
    reorderedGuessers.splice(toIndex, 0, draggingId);
    let guesserIdx = 0;
    const merged = fullOrder.map((id) => {
      const p = session.participants.find((x) => x.id === id);
      if (!p) {
        return id;
      }
      if (id === puzzleCreatorId || !participantIsActive(p)) {
        return id;
      }
      return reorderedGuessers[guesserIdx++]!;
    });
    if (guesserIdx !== reorderedGuessers.length) {
      setDraggingId(null);
      return;
    }
    setDraggingId(null);
    send({
      type: "session:reorderParticipants",
      payload: { participantIds: merged }
    });
  };

  const handleDragEnd = (): void => setDraggingId(null);

  const handleAssign = (target: Participant): void => {
    if (!isHost || target.id === currentTurnId) return;
    send({ type: "hangman:setTurn", payload: { participantId: target.id } });
  };

  return (
    <aside className="turn-order" aria-label="Turn order">
      <div className="turn-order-head">
        <h3 className="turn-order-title">Turn order</h3>
        {isHost && <span className="turn-order-hint">Drag to reorder · click to set current</span>}
      </div>
      <ol className="turn-order-list">
        {guessers.map((participant, index) => {
          const isCurrent = participant.id === currentTurnId;
          const isYou = participant.id === currentParticipantId;
          const isDragging = participant.id === draggingId;
          const classes = [
            "turn-order-item",
            isCurrent ? "is-current" : "",
            isDragging ? "is-dragging" : "",
            isHost ? "is-interactive" : ""
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <li
              key={participant.id}
              className={classes}
              draggable={isHost}
              onDragStart={(e) => handleDragStart(e, participant.id)}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, participant.id)}
              onDragEnd={handleDragEnd}
            >
              {isHost ? (
                <button
                  type="button"
                  className="turn-order-btn"
                  onClick={() => handleAssign(participant)}
                  aria-pressed={isCurrent}
                  title={isCurrent ? "Current guesser" : `Make ${participant.displayName} the current guesser`}
                >
                  <span className="turn-order-index" aria-hidden="true">
                    {index + 1}
                  </span>
                  <span className="turn-order-name">
                    <PlayerName participant={participant} size="xs" inline />
                  </span>
                  {isYou && <span className="turn-order-you">you</span>}
                  {isCurrent && <span className="turn-order-current" aria-label="Current turn">●</span>}
                </button>
              ) : (
                <div className="turn-order-btn turn-order-btn-static" aria-current={isCurrent ? "true" : undefined}>
                  <span className="turn-order-index" aria-hidden="true">
                    {index + 1}
                  </span>
                  <span className="turn-order-name">
                    <PlayerName participant={participant} size="xs" inline />
                  </span>
                  {isYou && <span className="turn-order-you">you</span>}
                  {isCurrent && <span className="turn-order-current" aria-label="Current turn">●</span>}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </aside>
  );
}
