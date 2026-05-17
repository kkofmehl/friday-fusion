import { useMemo, useState } from "react";
import type { SessionChatMessage } from "../../../shared/contracts";

const EMOJI_PACK = ["😀", "😂", "😎", "🔥", "👏", "💀", "🎉", "😈"] as const;

type SessionChatPanelProps = {
  messages: SessionChatMessage[];
  currentParticipantId: string;
  onSendMessage: (text: string) => void;
  onSendReaction: (emoji: string) => void;
};

const formatTime = (createdAt: number): string =>
  new Date(createdAt).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit"
  });

export function SessionChatPanel({
  messages,
  currentParticipantId,
  onSendMessage,
  onSendReaction
}: SessionChatPanelProps): JSX.Element {
  const [draft, setDraft] = useState("");
  const orderedMessages = useMemo(
    () => [...messages].sort((a, b) => a.createdAt - b.createdAt),
    [messages]
  );

  const submit = (): void => {
    const next = draft.trim();
    if (!next) {
      return;
    }
    onSendMessage(next);
    setDraft("");
  };

  return (
    <section className="card session-chat-card" aria-label="Session chat">
      <header className="card-head">
        <h2>Smack Talk</h2>
      </header>
      <div className="session-chat-messages" aria-live="polite">
        {orderedMessages.length === 0 ? (
          <p className="session-chat-empty">No messages yet.</p>
        ) : (
          orderedMessages.map((message) => {
            const mine = message.participantId === currentParticipantId;
            return (
              <article
                key={message.id}
                className={`session-chat-message${mine ? " session-chat-message-mine" : ""}`}
              >
                <p className="session-chat-meta">
                  <strong>{mine ? "You" : message.displayName}</strong>
                  <span>{formatTime(message.createdAt)}</span>
                </p>
                <p className="session-chat-text">{message.text}</p>
              </article>
            );
          })
        )}
      </div>
      <div className="session-chat-emoji-pack" aria-label="Emoji reactions">
        {EMOJI_PACK.map((emoji) => (
          <button
            key={emoji}
            type="button"
            className="btn btn-ghost btn-sm session-chat-emoji-btn"
            onClick={() => onSendReaction(emoji)}
            aria-label={`Send ${emoji} reaction`}
            title={`Send ${emoji}`}
          >
            {emoji}
          </button>
        ))}
      </div>
      <div className="session-chat-compose">
        <input
          value={draft}
          maxLength={400}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              submit();
            }
          }}
          placeholder="Type your smack talk..."
          aria-label="Chat message"
        />
        <button type="button" className="btn btn-primary btn-sm" onClick={submit}>
          Send
        </button>
      </div>
    </section>
  );
}
