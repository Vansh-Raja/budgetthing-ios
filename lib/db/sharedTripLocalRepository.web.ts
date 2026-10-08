import { api } from '@/convex/_generated/api';
import { webMutation, webQuery } from '../web/convexClient';
import { Events, GlobalEvents } from '../events';


export const SharedTripLocalRepository = {
  async update(tripId: string, updates: { name?: string; emoji?: string; startDateMs?: number; endDateMs?: number; budgetCents?: number }): Promise<void> {
    await webMutation(api.pwaSharedTrips.updateTrip, { tripId, name: updates.name, emoji: updates.emoji, startDateMs: updates.startDateMs, endDateMs: updates.endDateMs, budgetCents: updates.budgetCents });
    GlobalEvents.emit(Events.tripsChanged);
  },
};

export const SharedTripParticipantLocalRepository = {
  async createGuest(tripId: string, name: string, colorHex?: string): Promise<{ id: string }> {
    const row: any = await webMutation(api.pwaSharedTrips.addParticipant, { tripId, name, colorHex });
    GlobalEvents.emit(Events.tripParticipantsChanged);
    GlobalEvents.emit(Events.tripsChanged);
    return { id: row.id };
  },
  async updateName(participantId: string, name: string): Promise<void> {
    const meta: any = await webQuery(api.pwaSharedTrips.resolveMeta, { participantIds: [participantId] });
    const tripId = meta.participants[participantId]?.tripId;
    if (!tripId) throw new Error('Participant not found');
    await webMutation(api.pwaSharedTrips.updateParticipant, { tripId, id: participantId, name });
    GlobalEvents.emit(Events.tripParticipantsChanged);
    GlobalEvents.emit(Events.tripsChanged);
  },
};
