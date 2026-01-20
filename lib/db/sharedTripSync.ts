import { queryAll, run, withTransaction } from './database';
import { TABLES } from './schema';
import { Events, GlobalEvents } from '../events';

export interface SharedTripPendingChanges {
  sharedTrips: any[];
  sharedTripMembers: any[];
  sharedTripParticipants: any[];
  sharedTripExpenses: any[];
  sharedTripSettlements: any[];
}

function stripConvexFields(record: any) {
  if (!record || typeof record !== 'object') return record;
  const { _id, _creationTime, ...rest } = record;
  return rest;
}

function normalizeSharedTripOptionalFields(table: string, data: any) {
  if (!data || typeof data !== 'object') return data;

  const optionalByTable: Record<string, string[]> = {
    [TABLES.SHARED_TRIPS]: ['startDateMs', 'endDateMs', 'budgetCents', 'deletedAtMs'],
    [TABLES.SHARED_TRIP_MEMBERS]: ['deletedAtMs'],
    [TABLES.SHARED_TRIP_PARTICIPANTS]: ['colorHex', 'linkedUserId', 'deletedAtMs'],
    [TABLES.SHARED_TRIP_EXPENSES]: [
      'note',
      'paidByParticipantId',
      'splitDataJson',
      'computedSplitsJson',
      'categoryName',
      'categoryEmoji',
      'deletedAtMs',
    ],
    [TABLES.SHARED_TRIP_SETTLEMENTS]: ['note', 'deletedAtMs'],
  };

  const optionalCols = optionalByTable[table] ?? [];
  const out: any = { ...data };
  for (const col of optionalCols) {
    if (!(col in out)) out[col] = null;
    if (out[col] === undefined) out[col] = null;
  }
  return out;
}

export const sharedTripSyncRepository = {
  async getPendingTripIds(): Promise<string[]> {
    const ids = new Set<string>();

    // Trip id is stored as `id` on sharedTrips and as `tripId` on child tables.
    const tripRows = await queryAll<{ tripId: string }>(
      `SELECT DISTINCT id as tripId FROM ${TABLES.SHARED_TRIPS} WHERE needsSync = 1`
    );
    for (const r of tripRows) {
      if (r?.tripId) ids.add(r.tripId);
    }

    const childTables = [
      TABLES.SHARED_TRIP_PARTICIPANTS,
      TABLES.SHARED_TRIP_EXPENSES,
      TABLES.SHARED_TRIP_SETTLEMENTS,
    ];

    for (const table of childTables) {
      const rows = await queryAll<{ tripId: string }>(
        `SELECT DISTINCT tripId FROM ${table} WHERE needsSync = 1 AND tripId IS NOT NULL`
      );
      for (const r of rows) {
        if (r?.tripId) ids.add(r.tripId);
      }
    }

    return Array.from(ids);
  },

  async applyRemoteMembershipRows(rows: any[]) {
    if (!rows || rows.length === 0) return;

    await withTransaction(async () => {
      for (const record of rows) {
        let data = stripConvexFields(record);
        if (!data || !data.id) continue;
        data = normalizeSharedTripOptionalFields(TABLES.SHARED_TRIP_MEMBERS, data);

        const columns = Object.keys(data);
        const values = Object.values(data);
        const placeholders = columns.map(() => '?').join(',');
        const updates = columns.map((c) => `${c}=excluded.${c}`).join(',');

        const sql = `
          INSERT INTO ${TABLES.SHARED_TRIP_MEMBERS} (${columns.join(',')}, needsSync)
          VALUES (${placeholders}, 0)
          ON CONFLICT(id) DO UPDATE SET
            ${updates}, needsSync=0
        `;

        await run(sql, values as any[]);
      }
    });

    GlobalEvents.emit(Events.tripsChanged);
  },

  async getPendingChangesForTrip(tripId: string): Promise<SharedTripPendingChanges> {
    const getTableChanges = async (table: string, whereSql: string, params: any[]) => {
      return queryAll<any>(`SELECT * FROM ${table} WHERE needsSync = 1 AND ${whereSql}`, params);
    };

    return {
      sharedTrips: await getTableChanges(TABLES.SHARED_TRIPS, 'id = ?', [tripId]),
      sharedTripMembers: await getTableChanges(TABLES.SHARED_TRIP_MEMBERS, 'tripId = ?', [tripId]),
      sharedTripParticipants: await getTableChanges(TABLES.SHARED_TRIP_PARTICIPANTS, 'tripId = ?', [tripId]),
      sharedTripExpenses: await getTableChanges(TABLES.SHARED_TRIP_EXPENSES, 'tripId = ?', [tripId]),
      sharedTripSettlements: await getTableChanges(TABLES.SHARED_TRIP_SETTLEMENTS, 'tripId = ?', [tripId]),
    };
  },

  async markAsSynced(changes: SharedTripPendingChanges) {
    await withTransaction(async () => {
      const markTable = async (table: string, records: any[]) => {
        if (!records || records.length === 0) return;
        const placeholders = records.map(() => '?').join(',');
        const ids = records.map((r) => r.id);
        await run(`UPDATE ${table} SET needsSync = 0 WHERE id IN (${placeholders})`, ids);
      };

      await markTable(TABLES.SHARED_TRIPS, changes.sharedTrips);
      await markTable(TABLES.SHARED_TRIP_MEMBERS, changes.sharedTripMembers);
      await markTable(TABLES.SHARED_TRIP_PARTICIPANTS, changes.sharedTripParticipants);
      await markTable(TABLES.SHARED_TRIP_EXPENSES, changes.sharedTripExpenses);
      await markTable(TABLES.SHARED_TRIP_SETTLEMENTS, changes.sharedTripSettlements);
    });
  },

  async applyRemoteChanges(tripId: string, changes: Partial<SharedTripPendingChanges>) {
    await withTransaction(async () => {
      const upsertTable = async (table: string, records: any[]) => {
        if (!records || records.length === 0) return;

        for (const record of records) {
          let data = stripConvexFields(record);
          if (!data || !data.id) continue;
          data = normalizeSharedTripOptionalFields(table, data);

          // Enforce trip scoping for child tables.
          if (table !== TABLES.SHARED_TRIPS) {
            if (data.tripId !== tripId) continue;
          } else {
            if (data.id !== tripId) continue;
          }

          const localRows = await queryAll<any>(
            `SELECT updatedAtMs, needsSync FROM ${table} WHERE id = ?`,
            [data.id]
          );

          if (localRows.length > 0) {
            const localRecord = localRows[0];
            if (localRecord.needsSync === 1 && localRecord.updatedAtMs > (data.updatedAtMs ?? 0)) {
              continue;
            }
          }

          const columns = Object.keys(data);
          const values = Object.values(data);
          const placeholders = columns.map(() => '?').join(',');
          const updates = columns.map((c) => `${c}=excluded.${c}`).join(',');

          const sql = `
            INSERT INTO ${table} (${columns.join(',')}, needsSync)
            VALUES (${placeholders}, 0)
            ON CONFLICT(id) DO UPDATE SET
              ${updates}, needsSync=0
          `;

          await run(sql, values as any[]);
        }
      };

      const sharedTrips = (changes as any).sharedTrips ?? [];
      const sharedTripMembers = (changes as any).sharedTripMembers ?? [];
      const sharedTripParticipants = (changes as any).sharedTripParticipants ?? [];
      const sharedTripExpenses = (changes as any).sharedTripExpenses ?? [];
      const sharedTripSettlements = (changes as any).sharedTripSettlements ?? [];

      await upsertTable(TABLES.SHARED_TRIPS, sharedTrips);
      await upsertTable(TABLES.SHARED_TRIP_MEMBERS, sharedTripMembers);
      await upsertTable(TABLES.SHARED_TRIP_PARTICIPANTS, sharedTripParticipants);
      await upsertTable(TABLES.SHARED_TRIP_EXPENSES, sharedTripExpenses);
      await upsertTable(TABLES.SHARED_TRIP_SETTLEMENTS, sharedTripSettlements);

      if (sharedTrips.length) GlobalEvents.emit(Events.tripsChanged);
      if (sharedTripMembers.length) GlobalEvents.emit(Events.tripsChanged);
      if (sharedTripParticipants.length) GlobalEvents.emit(Events.tripsChanged);
      if (sharedTripExpenses.length) GlobalEvents.emit(Events.tripsChanged);
      if (sharedTripSettlements.length) GlobalEvents.emit(Events.tripsChanged);
    });
  },
};
