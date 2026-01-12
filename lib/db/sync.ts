import { queryAll, run, withTransaction } from './database';
import { TABLES } from './schema';
import { Events, GlobalEvents } from '../events';

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

      // Be tolerant of partial payloads from remote.
      const accounts = (changes as any).accounts ?? [];
      const categories = (changes as any).categories ?? [];
      const transactions = (changes as any).transactions ?? [];
      const trips = (changes as any).trips ?? [];
      const tripParticipants = (changes as any).tripParticipants ?? [];
      const tripExpenses = (changes as any).tripExpenses ?? [];
      const tripSettlements = (changes as any).tripSettlements ?? [];
      const userSettings = (changes as any).userSettings ?? [];

      // If the server has older trip records without `sortIndex`, assign a stable
      // local sortIndex so ordering works immediately, and mark for push so the
      // server is upgraded on next sync.
      const tripIdsMissingSortIndex: string[] = [];
      let normalizedTrips = trips as any[];
      if (Array.isArray(trips) && trips.length > 0) {
        const tripsWithSortIndex = trips.filter((t: any) => t && t.sortIndex !== undefined && t.sortIndex !== null);
        const tripsWithoutSortIndex = trips
          .filter((t: any) => t && (t.sortIndex === undefined || t.sortIndex === null))
          .sort((a: any, b: any) => (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0));

        if (tripsWithoutSortIndex.length > 0) {
          const localMaxRow = await queryAll<{ maxSortIndex: number }>(
            `SELECT COALESCE(MAX(sortIndex), -1) AS maxSortIndex FROM ${TABLES.TRIPS} WHERE deletedAtMs IS NULL`
          );
          const localMaxSortIndex = localMaxRow[0]?.maxSortIndex ?? -1;
          const incomingMaxSortIndex = tripsWithSortIndex.reduce<number>(
            (acc: number, t: any) => Math.max(acc, Number.isFinite(t.sortIndex) ? t.sortIndex : -1),
            -1
          );

          let nextSortIndex = Math.max(localMaxSortIndex, incomingMaxSortIndex) + 1;
          for (const t of tripsWithoutSortIndex as any[]) {
            t.sortIndex = nextSortIndex;
            nextSortIndex += 1;
            if (t.id) tripIdsMissingSortIndex.push(t.id);
          }
        }

        normalizedTrips = [...tripsWithSortIndex, ...tripsWithoutSortIndex];
      }

      await upsertTable(TABLES.ACCOUNTS, accounts);
      await upsertTable(TABLES.CATEGORIES, categories);
      await upsertTable(TABLES.TRANSACTIONS, transactions);
      await upsertTable(TABLES.TRIPS, normalizedTrips);
      await upsertTable(TABLES.TRIP_PARTICIPANTS, tripParticipants);
      await upsertTable(TABLES.TRIP_EXPENSES, tripExpenses);
      await upsertTable(TABLES.TRIP_SETTLEMENTS, tripSettlements);
      await upsertTable(TABLES.USER_SETTINGS, userSettings);

      if (tripIdsMissingSortIndex.length) {
        const ids = tripIdsMissingSortIndex.map(id => `'${id}'`).join(',');
        await run(
          `UPDATE ${TABLES.TRIPS} SET needsSync = 1, syncVersion = syncVersion + 1 WHERE id IN (${ids})`
        );
      }

      // Emit once per affected entity type.
      if (accounts.length) GlobalEvents.emit(Events.accountsChanged);
      if (categories.length) GlobalEvents.emit(Events.categoriesChanged);
      if (transactions.length) GlobalEvents.emit(Events.transactionsChanged);
      if (trips.length) GlobalEvents.emit(Events.tripsChanged);
      if (tripParticipants.length) GlobalEvents.emit(Events.tripParticipantsChanged);
      if (tripExpenses.length) GlobalEvents.emit(Events.tripExpensesChanged);
      if (tripSettlements.length) GlobalEvents.emit(Events.tripSettlementsChanged);
      if (userSettings.length) GlobalEvents.emit(Events.userSettingsChanged);
    });
  }
};
