import { v4 as uuidv4 } from 'uuid';
import { run } from './database';
import { TABLES } from './schema';
import { Events, GlobalEvents } from '../events';

export const SharedTripLocalRepository = {
  async update(
    tripId: string,
    updates: {
      name?: string;
      emoji?: string;
      startDateMs?: number;
      endDateMs?: number;
      budgetCents?: number;
    }
  ): Promise<void> {
    const now = Date.now();

    const fields: string[] = [];
    const values: any[] = [];

    if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name); }
    if (updates.emoji !== undefined) { fields.push('emoji = ?'); values.push(updates.emoji); }
    if (updates.startDateMs !== undefined) { fields.push('startDateMs = ?'); values.push(updates.startDateMs); }
    if (updates.endDateMs !== undefined) { fields.push('endDateMs = ?'); values.push(updates.endDateMs); }
    if (updates.budgetCents !== undefined) { fields.push('budgetCents = ?'); values.push(updates.budgetCents); }

    fields.push('updatedAtMs = ?');
    values.push(now);
    fields.push('needsSync = 1');
    fields.push('syncVersion = syncVersion + 1');

    values.push(tripId);

    await run(
      `UPDATE ${TABLES.SHARED_TRIPS} SET ${fields.join(', ')} WHERE id = ?`,
      values
    );

    GlobalEvents.emit(Events.tripsChanged);
  },
};

export const SharedTripParticipantLocalRepository = {
  async createGuest(tripId: string, name: string, colorHex?: string): Promise<{ id: string }> {
    const id = uuidv4();
    const now = Date.now();
    const trimmed = name.trim();

    await run(
      `INSERT INTO ${TABLES.SHARED_TRIP_PARTICIPANTS}
       (id, tripId, name, colorHex, linkedUserId, createdAtMs, updatedAtMs, deletedAtMs, syncVersion, needsSync)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        tripId,
        trimmed,
        colorHex ?? null,
        null,
        now,
        now,
        null,
        1,
        1,
      ]
    );

    GlobalEvents.emit(Events.tripsChanged);

    return { id };
  },

  async updateName(participantId: string, name: string): Promise<void> {
    const now = Date.now();
    const trimmed = name.trim();

    await run(
      `UPDATE ${TABLES.SHARED_TRIP_PARTICIPANTS}
       SET name = ?, updatedAtMs = ?, needsSync = 1, syncVersion = syncVersion + 1
       WHERE id = ?`,
      [trimmed, now, participantId]
    );

    GlobalEvents.emit(Events.tripsChanged);
  },
};
