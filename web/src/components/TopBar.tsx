import type { RealtimeStatus } from "../hooks/useRealtime";
import type { SessionChatMessage } from "../../../shared/contracts";
import { ConnectionPill } from "./ConnectionPill";
import { SessionChatPanel } from "./SessionChatPanel";

export function TopBar({
  sessionName,
  joinCode,
  status,
  chatMessages,
  currentParticipantId,
  onSendChatMessage,
  onSendEmojiReaction,
  onLeave,
  onCloseSession
}: {
  sessionName: string;
  joinCode: string;
  status: RealtimeStatus;
  chatMessages: SessionChatMessage[];
  currentParticipantId: string;
  onSendChatMessage: (text: string) => void;
  onSendEmojiReaction: (emoji: string) => void;
  onLeave: () => void;
  onCloseSession?: () => void;
}): JSX.Element {
  const handleCloseSession = () => {
    if (!onCloseSession) return;
    if (typeof window !== "undefined" && typeof window.confirm === "function") {
      if (!window.confirm("Close this session for everyone? This cannot be undone.")) {
        return;
      }
    }
    onCloseSession();
  };

  return (
    <aside className="topbar" aria-label="Session rail">
      <div className="topbar-main">
        <div className="topbar-brand">
          <span className="topbar-logo" aria-hidden="true">
            FF
          </span>
          <div className="topbar-session">
            <span className="topbar-session-name">{sessionName}</span>
            <span className="topbar-session-code">Code: {joinCode}</span>
          </div>
        </div>

        <div className="topbar-chat">
          <SessionChatPanel
            messages={chatMessages}
            currentParticipantId={currentParticipantId}
            onSendMessage={onSendChatMessage}
            onSendReaction={onSendEmojiReaction}
          />
        </div>

        <div className="topbar-panel">
          <p className="topbar-panel-label">Connection</p>
          <ConnectionPill status={status} />
        </div>
      </div>

      <div className="topbar-actions">
        {onCloseSession && (
          <button type="button" className="btn btn-ghost" onClick={handleCloseSession}>
            Close session
          </button>
        )}
        <button type="button" className="btn btn-ghost" onClick={onLeave}>
          Leave session
        </button>
      </div>
    </aside>
  );
}
