import type { ClientEvent, GameType, SessionState } from "../../../shared/contracts";
import { describeQueuedGameOptions } from "../utils/buildGameStartPayload";

type SessionQueuePanelProps = {
  session: SessionState;
  isHost: boolean;
  send: (event: ClientEvent) => void;
  mode: "lobby" | "inGame";
  gameTitlesById: Record<GameType, string>;
};

export function SessionQueuePanel({
  session,
  isHost,
  send,
  mode,
  gameTitlesById
}: SessionQueuePanelProps): JSX.Element | null {
  const queue = session.sessionGameQueue ?? [];
  const showPanel = queue.length > 0 || (isHost && mode === "lobby");

  if (!showPanel) {
    return null;
  }

  return (
    <section className="session-queue" aria-label="Session queue">
      <header className="session-queue-head">
        <h3>Session queue</h3>
        {queue.length > 0 && <span className="count-pill">{queue.length}</span>}
      </header>
      {queue.length === 0 ? (
        <p className="session-queue-empty">No games queued yet.</p>
      ) : (
        <ol className="session-queue-list">
          {queue.map((item, index) => {
            const title = gameTitlesById[item.game] ?? item.game;
            const hint = describeQueuedGameOptions(item.game, item.options);
            return (
              <li key={item.id} className="session-queue-item">
                <span className="session-queue-item-index">{index + 1}.</span>
                <span className="session-queue-item-body">
                  <span className="session-queue-item-title">{title}</span>
                  {hint && <span className="session-queue-item-hint">{hint}</span>}
                </span>
                {isHost && mode === "lobby" && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm session-queue-remove"
                    aria-label={`Remove ${title} from queue`}
                    onClick={() => send({ type: "queue:remove", payload: { queueItemId: item.id } })}
                  >
                    ×
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {isHost && mode === "lobby" && (
        <button
          type="button"
          className="btn btn-primary btn-sm session-queue-start"
          disabled={queue.length === 0}
          onClick={() => send({ type: "queue:start", payload: {} })}
        >
          Start Queue
        </button>
      )}
    </section>
  );
}
