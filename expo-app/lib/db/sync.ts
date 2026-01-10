import { queryAll, run, withTransaction } from './database';
import { TABLES } from './schema';

export interface PendingChanges {
  accounts: any[];
  categories: any[];
  transactions: any[];
  trips: any[];
  tripParticipants: any[];
  tripExpenses: any[];
  tripSettlements: any[];
  userSettings: any[];
}

export const syncRepository = {
  /**
   * Get all records that need syncing
   */
  async getPendingChanges(): Promise<PendingChanges> {
    const getTableChanges = async (table: string) => {
      return queryAll<any>(`SELECT * FROM ${table} WHERE needsSync = 1`);
    };

    return {
      accounts: await getTableChanges(TABLES.ACCOUNTS),
      categories: await getTableChanges(TABLES.CATEGORIES),
      transactions: await getTableChanges(TABLES.TRANSACTIONS),
      trips: await getTableChanges(TABLES.TRIPS),
      tripParticipants: await getTableChanges(TABLES.TRIP_PARTICIPANTS),
      tripExpenses: await getTableChanges(TABLES.TRIP_EXPENSES),
      tripSettlements: await getTableChanges(TABLES.TRIP_SETTLEMENTS),
      userSettings: await getTableChanges(TABLES.USER_SETTINGS),
    };
  },

  /**
   * Mark records as synced (needsSync = 0)
   */
  async markAsSynced(changes: PendingChanges) {
    await withTransaction(async () => {
      const markTable = async (table: string, records: any[]) => {
        if (records.length === 0) return;
        const ids = records.map(r => `'${r.id}'`).join(',');
        await run(`UPDATE ${table} SET needsSync = 0 WHERE id IN (${ids})`);
      };

      await markTable(TABLES.ACCOUNTS, changes.accounts);
      await markTable(TABLES.CATEGORIES, changes.categories);
      await markTable(TABLES.TRANSACTIONS, changes.transactions);
      await markTable(TABLES.TRIPS, changes.trips);
      await markTable(TABLES.TRIP_PARTICIPANTS, changes.tripParticipants);
      await markTable(TABLES.TRIP_EXPENSES, changes.tripExpenses);
      await markTable(TABLES.TRIP_SETTLEMENTS, changes.tripSettlements);
      await markTable(TABLES.USER_SETTINGS, changes.userSettings);
    });
  },

  /**
   * Apply remote changes to local DB
   */
  async applyRemoteChanges(changes: PendingChanges) {
    await withTransaction(async () => {
      const upsertTable = async (table: string, records: any[]) => {
        if (!records || records.length === 0) return;

        for (const record of records) {
          // Remove Convex fields
          const { _id, _creationTime, userId, ...data } = record;
          
          // Check if local record exists and is newer (conflict resolution)
          // We must query inside the transaction logic, but `queryAll` creates a new connection instance?
          // No, `getDatabase()` is singleton.
          // However, iterating `queryAll` inside `withTransactionAsync` works in SQLite.
          
          // Note: queryAll returns arrays, we need one item.
          const localRows = await queryAll<any>(`SELECT updatedAtMs, needsSync FROM ${table} WHERE id = ?`, [data.id]);
          
          if (localRows.length > 0) {
            const localRecord = localRows[0];
            if (localRecord.needsSync === 1 && localRecord.updatedAtMs > data.updatedAtMs) {
              // Local is newer and pending sync -> Ignore remote
              continue;
            }
          }

          // Construct upsert query dynamically
          const columns = Object.keys(data);
          const values = Object.values(data);
          const placeholders = columns.map(() => '?').join(',');
          const updates = columns.map(c => `${c}=excluded.${c}`).join(',');

          // SQLite 3.24+ supports UPSERT. Expo SQLite uses newer version.
          const sql = `
            INSERT INTO ${table} (${columns.join(',')}, needsSync)
            VALUES (${placeholders}, 0)
            ON CONFLICT(id) DO UPDATE SET
            ${updates}, needsSync=0
          `;

          await run(sql, values as (string | number | null)[]);
        }
      };

      await upsertTable(TABLES.ACCOUNTS, changes.accounts);
      await upsertTable(TABLES.CATEGORIES, changes.categories);
      await upsertTable(TABLES.TRANSACTIONS, changes.transactions);
      await upsertTable(TABLES.TRIPS, changes.trips);
      await upsertTable(TABLES.TRIP_PARTICIPANTS, changes.tripParticipants);
      await upsertTable(TABLES.TRIP_EXPENSES, changes.tripExpenses);
      await upsertTable(TABLES.TRIP_SETTLEMENTS, changes.tripSettlements);
      await upsertTable(TABLES.USER_SETTINGS, changes.userSettings);
    });
  }
};
