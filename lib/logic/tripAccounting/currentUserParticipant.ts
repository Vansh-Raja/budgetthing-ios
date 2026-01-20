import type { TripParticipant } from '../types';

export function pickSingleCurrentUserParticipantId(participants: TripParticipant[]): string | null {
  if (participants.length === 0) return null;

  const current = participants.filter((p) => p.isCurrentUser);
  if (current.length === 1) return current[0].id;

  const preferYou = participants.find((p) => p.name.trim().toLowerCase() === 'you');
  return (preferYou ?? participants[0]).id;
}

export function normalizeCurrentUserFlags(participants: TripParticipant[]): TripParticipant[] {
  const chosenId = pickSingleCurrentUserParticipantId(participants);
  if (!chosenId) return participants;
  return participants.map((p) => ({ ...p, isCurrentUser: p.id === chosenId }));
}
