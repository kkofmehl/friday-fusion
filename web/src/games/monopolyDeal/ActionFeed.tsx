import { useEffect, useRef, type JSX } from "react";
import type { MonopolyDealActionLogEntry, SessionState } from "../../../../shared/contracts";
import { PlayerName } from "../../components/PlayerName";

export function MonopolyDealActionFeed({
  entries,
  participants
}: {
  entries: MonopolyDealActionLogEntry[];
  participants: SessionState["participants"];
}): JSX.Element {
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = scrollerRef.current;
    if (!node) {
      return;
    }
    node.scrollTop = node.scrollHeight;
  }, [entries.length, entries[entries.length - 1]?.id]);

  return (
    <section className="card game-action-feed" aria-label="Game action feed">
      <header className="card-head">
        <h2>Action feed</h2>
        <span className="count-pill">{entries.length}</span>
      </header>
      <div className="game-action-feed-list" ref={scrollerRef}>
        {entries.length === 0 ? (
          <p className="game-action-feed-empty">Actions will show up here as they happen.</p>
        ) : (
          entries.map((entry) => (
            <p key={entry.id} className="game-action-feed-item">
              <PlayerName participantId={entry.actorId} participants={participants} size="sm" inline />{" "}
              {entry.summary}
              {entry.targetId ? (
                <>
                  {" "}
                  <PlayerName participantId={entry.targetId} participants={participants} size="sm" inline />
                </>
              ) : null}
              {entry.suffix ? ` ${entry.suffix}` : ""}
            </p>
          ))
        )}
      </div>
    </section>
  );
}
