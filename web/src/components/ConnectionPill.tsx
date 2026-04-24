import type { RealtimeStatus } from "../hooks/useRealtime";

const LABELS: Record<RealtimeStatus, string> = {
  idle: "Offline",
  connecting: "Connecting",
  open: "Live",
  reconnecting: "Reconnecting",
  closed: "Offline"
};

export function ConnectionPill({ status }: { status: RealtimeStatus }): JSX.Element {
  const variant = status === "open" ? "live" : status === "reconnecting" || status === "connecting" ? "pending" : "offline";
  return (
    <span className={`connection-pill connection-pill-${variant}`} role="status" aria-live="polite">
      <span className="connection-dot" aria-hidden="true" />
      {LABELS[status]}
    </span>
  );
}
