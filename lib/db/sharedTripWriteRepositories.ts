import { v4 as uuidv4 } from 'uuid';
import { run, SQLiteBindValue, withTransaction } from './database';
import { TABLES } from './schema';
import { Events, GlobalEvents } from '../events';

export const SharedTripExpenseRepository = {
  async create(input: {
    tripId: string;
    amountCents: number;
    dateMs: number;
    note?: string;
    paidByParticipantId?: string;
    splitType: string;
    splitData?: Record<string, number>;
    computedSplits?: Record<string, number>;
    categoryName?: string;
    categoryEmoji?: string;
  }): Promise<{ id: string }> {
    const id = uuidv4();
    const now = Date.now();

    await run(
      `INSERT INTO ${TABLES.SHARED_TRIP_EXPENSES}
       (id, tripId, amountCents, dateMs, note, paidByParticipantId, splitType,
        splitDataJson, computedSplitsJson, categoryName, categoryEmoji,
        createdAtMs, updatedAtMs, deletedAtMs, syncVersion, needsSync)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.tripId,
        input.amountCents,
        input.dateMs,
        input.note ?? null,
        input.paidByParticipantId ?? null,
        input.splitType,
        input.splitData ? JSON.stringify(input.splitData) : null,
        input.computedSplits ? JSON.stringify(input.computedSplits) : null,
        input.categoryName ?? null,
        input.categoryEmoji ?? null,
        now,
        now,
        null,
        1,
        1,
      ] as SQLiteBindValue[]
    );

    GlobalEvents.emit(Events.tripsChanged);

    return { id };
  },

  async update(expenseId: string, updates: {
    amountCents?: number;
    dateMs?: number;
    note?: string | null;
    paidByParticipantId?: string | null;
    splitType?: string;
    splitData?: Record<string, number> | null;
    computedSplits?: Record<string, number> | null;
    categoryName?: string | null;
    categoryEmoji?: string | null;
  }): Promise<void> {
    const now = Date.now();

    const fields: string[] = [];
    const values: SQLiteBindValue[] = [];

    if (updates.amountCents !== undefined) { fields.push('amountCents = ?'); values.push(updates.amountCents); }
    if (updates.dateMs !== undefined) { fields.push('dateMs = ?'); values.push(updates.dateMs); }
    if (updates.note !== undefined) { fields.push('note = ?'); values.push(updates.note); }
    if (updates.paidByParticipantId !== undefined) { fields.push('paidByParticipantId = ?'); values.push(updates.paidByParticipantId); }
    if (updates.splitType !== undefined) { fields.push('splitType = ?'); values.push(updates.splitType); }
    if (updates.splitData !== undefined) { fields.push('splitDataJson = ?'); values.push(updates.splitData ? JSON.stringify(updates.splitData) : null); }
    if (updates.computedSplits !== undefined) { fields.push('computedSplitsJson = ?'); values.push(updates.computedSplits ? JSON.stringify(updates.computedSplits) : null); }
    if (updates.categoryName !== undefined) { fields.push('categoryName = ?'); values.push(updates.categoryName); }
    if (updates.categoryEmoji !== undefined) { fields.push('categoryEmoji = ?'); values.push(updates.categoryEmoji); }

    fields.push('updatedAtMs = ?'); values.push(now);
    fields.push('needsSync = 1');
    fields.push('syncVersion = syncVersion + 1');

    values.push(expenseId);

    await run(
      `UPDATE ${TABLES.SHARED_TRIP_EXPENSES} SET ${fields.join(', ')} WHERE id = ?`,
      values
    );

    GlobalEvents.emit(Events.tripsChanged);
  },

  async delete(expenseId: string): Promise<void> {
    const now = Date.now();

    await run(
      `UPDATE ${TABLES.SHARED_TRIP_EXPENSES}
       SET deletedAtMs = ?, updatedAtMs = ?, needsSync = 1, syncVersion = syncVersion + 1
       WHERE id = ?`,
      [now, now, expenseId]
    );

    GlobalEvents.emit(Events.tripsChanged);
  },
};

export const SharedTripSettlementRepository = {
  async create(input: {
    tripId: string;
    fromParticipantId: string;
    toParticipantId: string;
    amountCents: number;
    dateMs: number;
    note?: string;
  }): Promise<{ id: string }> {
    const id = uuidv4();
    const now = Date.now();

    await run(
      `INSERT INTO ${TABLES.SHARED_TRIP_SETTLEMENTS}
       (id, tripId, fromParticipantId, toParticipantId, amountCents, dateMs, note,
        createdAtMs, updatedAtMs, deletedAtMs, syncVersion, needsSync)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.tripId,
        input.fromParticipantId,
        input.toParticipantId,
        input.amountCents,
        input.dateMs,
        input.note ?? null,
        now,
        now,
        null,
        1,
        1,
      ] as SQLiteBindValue[]
    );

    GlobalEvents.emit(Events.tripsChanged);

    return { id };
  },

  async delete(id: string): Promise<void> {
    const now = Date.now();
    await run(
      `UPDATE ${TABLES.SHARED_TRIP_SETTLEMENTS}
       SET deletedAtMs = ?, updatedAtMs = ?, needsSync = 1, syncVersion = syncVersion + 1
       WHERE id = ?`,
      [now, now, id]
    );

    GlobalEvents.emit(Events.tripsChanged);
  },

  async deleteByTripId(tripId: string): Promise<void> {
    const now = Date.now();

    await withTransaction(async () => {
      await run(
        `UPDATE ${TABLES.SHARED_TRIP_SETTLEMENTS}
         SET deletedAtMs = ?, updatedAtMs = ?, needsSync = 1, syncVersion = syncVersion + 1
         WHERE tripId = ? AND deletedAtMs IS NULL`,
        [now, now, tripId]
      );
    });

    GlobalEvents.emit(Events.tripsChanged);
  },
};
