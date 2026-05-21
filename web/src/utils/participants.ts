import type { Participant, ProfileAvatarView } from "../../../shared/contracts";

export const participantIsActive = (p: Participant): boolean => p.isActive !== false;

/** Participants who count for gameplay, lobby picks, and “waiting on everyone” UI. */
export const activeParticipants = (participants: Participant[]): Participant[] =>
  participants.filter(participantIsActive);

export const participantFor = (participants: Participant[], participantId: string): Participant | undefined =>
  participants.find((participant) => participant.id === participantId);

export const avatarFor = (participants: Participant[], participantId: string): ProfileAvatarView | undefined =>
  participantFor(participants, participantId)?.avatar;
