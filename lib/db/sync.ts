import { queryAll, run, withTransaction } from './database';
import { TABLES } from './schema';
import { Events, GlobalEvents } from '../events';

function normalizeOptionalFields(table: string, data: any) {
  if (!data || typeof data !== 'object') return data;

  const optionalByTable: Record<string, string[]> = {
    [TABLES.ACCOUNTS]: ['openingBalanceCents', 'limitAmountCents', 'billingCycleDay', 'deletedAtMs'],
    [TABLES.CATEGORIES]: ['monthlyBudgetCents', 'deletedAtMs'],
    [TABLES.TRANSACTIONS]: [
      'note',
      'systemType',
      'accountId',
      'categoryId',
      'transferFromAccountId',
      'transferToAccountId',
      'tripExpenseId',
      'deletedAtMs',
    ],
    [TABLES.TRIPS]: ['startDate', 'endDate', 'budgetCents', 'deletedAtMs'],
    [TABLES.TRIP_PARTICIPANTS]: ['colorHex', 'deletedAtMs'],
    [TABLES.TRIP_EXPENSES]: ['paidByParticipantId', 'splitDataJson', 'computedSplitsJson', 'deletedAtMs'],
    [TABLES.TRIP_SETTLEMENTS]: ['note', 'deletedAtMs'],
    [TABLES.USER_SETTINGS]: ['defaultAccountId'],
  };

  const optionalCols = optionalByTable[table] ?? [];
  const out: any = { ...data };
  for (const col of optionalCols) {
    if (!(col in out)) out[col] = null;
    if (out[col] === undefined) out[col] = null;
  }
  return out;
}

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
      const chunk = <T,>(input: T[], size: number): T[][] => {
        const out: T[][] = [];
        for (let i = 0; i < input.length; i += size) {
          out.push(input.slice(i, i + size));
        }
        return out;
      };

      const markTable = async (table: string, records: any[]) => {
        if (!records || records.length === 0) return;
        const ids = records.map((r: any) => r?.id).filter(Boolean) as string[];
        if (ids.length === 0) return;

        // Avoid SQL injection / quoting issues and keep statement size reasonable.
        for (const batch of chunk(ids, 400)) {
          const placeholders = batch.map(() => '?').join(',');
          await run(`UPDATE ${table} SET needsSync = 0 WHERE id IN (${placeholders})`, batch);
        }
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
          const { _id, _creationTime, userId, ...rawData } = record;
          const data = normalizeOptionalFields(table, rawData);
          
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
        const now = Date.now();
        const placeholders = tripIdsMissingSortIndex.map(() => '?').join(',');
        await run(
          `UPDATE ${TABLES.TRIPS}
           SET needsSync = 1, syncVersion = syncVersion + 1, updatedAtMs = ?
           WHERE id IN (${placeholders})`,
          [now, ...tripIdsMissingSortIndex]
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
