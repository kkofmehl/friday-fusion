import type { ReactNode } from "react";
import type { Participant } from "../../../shared/contracts";
import { participantFor } from "../utils/participants";
import { PlayerAvatar, type PlayerAvatarSize } from "./PlayerAvatar";

export function PlayerName({
  participant,
  participantId,
  participants,
  size = "sm",
  emphasis = false,
  inline = false,
  className = "",
  children
}: {
  participant?: Participant;
  participantId?: string;
  participants?: Participant[];
  size?: PlayerAvatarSize;
  emphasis?: boolean;
  inline?: boolean;
  className?: string;
  children?: ReactNode;
}): JSX.Element | null {
  const resolved = participant ?? (participantId && participants ? participantFor(participants, participantId) : undefined);
  if (!resolved) {
    return null;
  }
  return (
    <span
      className={[
        "player-name-row",
        inline ? "player-name-row--inline" : "",
        emphasis ? "player-name-row--emphasis" : "",
        className
      ].filter(Boolean).join(" ")}
    >
      <PlayerAvatar avatar={resolved.avatar} size={size} />
      <span className="player-name-text">{resolved.displayName}</span>
      {children}
    </span>
  );
}
