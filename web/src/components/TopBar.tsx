import type { RealtimeStatus } from "../hooks/useRealtime";
import { ConnectionPill } from "./ConnectionPill";

export function TopBar({
  sessionName,
  joinCode,
  status,
  onLeave,
  onCloseSession
}: {
  sessionName: string;
  joinCode: string;
  status: RealtimeStatus;
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
    <header className="topbar">
      <div className="topbar-brand">
        <span className="topbar-logo" aria-hidden="true">
          FF
        </span>
        <div className="topbar-session">
          <span className="topbar-session-name">{sessionName}</span>
          <span className="topbar-session-code">Code: {joinCode}</span>
        </div>
      </div>
      <div className="topbar-actions">
        <ConnectionPill status={status} />
        {onCloseSession && (
          <button type="button" className="btn btn-ghost" onClick={handleCloseSession}>
            Close session
          </button>
        )}
        <button type="button" className="btn btn-ghost" onClick={onLeave}>
          Leave
        </button>
      </div>
    </header>
  );
}
