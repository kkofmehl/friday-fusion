import type { Participant } from "../../../shared/contracts";

export const participantIsActive = (p: Participant): boolean => p.isActive !== false;

/** Participants who count for gameplay, lobby picks, and “waiting on everyone” UI. */
export const activeParticipants = (participants: Participant[]): Participant[] =>
  participants.filter(participantIsActive);
