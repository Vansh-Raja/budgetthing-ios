/**
 * Repository layer for database operations
 * 
 * Provides type-safe CRUD operations for all entities.
 * Handles JSON serialization for complex fields and sync metadata.
 */

import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryFirst, run, withTransaction, SQLiteBindValue } from './database';
import { TABLES } from './schema';
import {
  Account,
  Category,
  Transaction,
  Trip,
  TripParticipant,
  TripExpense,
  TripSettlement,
  UserSettings,
  SplitType,
  TransactionType,
  SystemType,
  AccountKind,
} from '../logic/types';
import { Events, GlobalEvents } from '../events';
import { pickSingleCurrentUserParticipantId } from '../logic/tripAccounting/currentUserParticipant';
import {
  idempotentAdjustmentTransactionId,
  idempotentTransferTransactionId,
  idempotentTripSettlementId,
} from '../logic/idempotency';

// =============================================================================
// Account Repository
// =============================================================================

interface AccountRow {
  id: string;
  name: string;
  emoji: string;
  kind: string;
  sortIndex: number;
  openingBalanceCents: number | null;
  limitAmountCents: number | null;
  billingCycleDay: number | null;
  createdAtMs: number;
  updatedAtMs: number;
  deletedAtMs: number | null;
  syncVersion: number;
  needsSync: number;
}

function rowToAccount(row: AccountRow): Account {
  return {
    id: row.id,
    name: row.name,
    emoji: row.emoji,
    kind: row.kind as AccountKind,
    sortIndex: row.sortIndex,
    openingBalanceCents: row.openingBalanceCents ?? undefined,
    limitAmountCents: row.limitAmountCents ?? undefined,
    billingCycleDay: row.billingCycleDay ?? undefined,
    createdAtMs: row.createdAtMs,
    updatedAtMs: row.updatedAtMs,
    deletedAtMs: row.deletedAtMs ?? undefined,
  };
}

export const AccountRepository = {
  async getAll(): Promise<Account[]> {
    const rows = await queryAll<AccountRow>(
      `SELECT * FROM ${TABLES.ACCOUNTS} WHERE deletedAtMs IS NULL ORDER BY sortIndex, createdAtMs`
    );
    return rows.map(rowToAccount);
  },

  async getById(id: string): Promise<Account | null> {
    const row = await queryFirst<AccountRow>(
      `SELECT * FROM ${TABLES.ACCOUNTS} WHERE id = ? AND deletedAtMs IS NULL`,
      [id]
    );
    return row ? rowToAccount(row) : null;
  },

  async create(account: Omit<Account, 'id' | 'createdAtMs' | 'updatedAtMs' | 'sortIndex'> & { sortIndex?: number }): Promise<Account> {
    const id = uuidv4();
    const now = Date.now();

    const row = await queryFirst<{ maxSortIndex: number }>(
      `SELECT COALESCE(MAX(sortIndex), -1) AS maxSortIndex FROM ${TABLES.ACCOUNTS} WHERE deletedAtMs IS NULL`
    );
    const sortIndex = account.sortIndex ?? ((row?.maxSortIndex ?? -1) + 1);

    await run(
      `INSERT INTO ${TABLES.ACCOUNTS} 
       (id, name, emoji, kind, sortIndex, openingBalanceCents, limitAmountCents, billingCycleDay, 
        createdAtMs, updatedAtMs, deletedAtMs, syncVersion, needsSync) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        account.name,
        account.emoji,
        account.kind,
        sortIndex,
        account.openingBalanceCents ?? null,
        account.limitAmountCents ?? null,
        account.billingCycleDay ?? null,
        now,
        now,
        null, // deletedAtMs
        1,    // syncVersion
        1,    // needsSync
      ]
    );

    GlobalEvents.emit(Events.accountsChanged);
    return { ...account, sortIndex, id, createdAtMs: now, updatedAtMs: now };
  },

  async update(id: string, updates: Partial<Omit<Account, 'id' | 'createdAtMs'>>): Promise<void> {
    const now = Date.now();
    const fields: string[] = ['updatedAtMs = ?', 'needsSync = 1', 'syncVersion = syncVersion + 1'];
    const values: SQLiteBindValue[] = [now];

    if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name); }
    if (updates.emoji !== undefined) { fields.push('emoji = ?'); values.push(updates.emoji); }
    if (updates.kind !== undefined) { fields.push('kind = ?'); values.push(updates.kind); }
    if (updates.sortIndex !== undefined) { fields.push('sortIndex = ?'); values.push(updates.sortIndex); }
    if (updates.openingBalanceCents !== undefined) { fields.push('openingBalanceCents = ?'); values.push(updates.openingBalanceCents); }
    if (updates.limitAmountCents !== undefined) { fields.push('limitAmountCents = ?'); values.push(updates.limitAmountCents); }
    if (updates.billingCycleDay !== undefined) { fields.push('billingCycleDay = ?'); values.push(updates.billingCycleDay); }

    values.push(id);
    await run(`UPDATE ${TABLES.ACCOUNTS} SET ${fields.join(', ')} WHERE id = ?`, values);
    GlobalEvents.emit(Events.accountsChanged);
  },

  async delete(id: string): Promise<void> {
    const now = Date.now();
    await run(
      `UPDATE ${TABLES.ACCOUNTS} SET deletedAtMs = ?, updatedAtMs = ?, needsSync = 1, syncVersion = syncVersion + 1 WHERE id = ?`,
      [now, now, id]
    );
    GlobalEvents.emit(Events.accountsChanged);
  },

  async reorder(idsInOrder: string[]): Promise<void> {
    const now = Date.now();

    await withTransaction(async () => {
      for (const [index, id] of idsInOrder.entries()) {
        await run(
          `UPDATE ${TABLES.ACCOUNTS} SET sortIndex = ?, updatedAtMs = ?, needsSync = 1, syncVersion = syncVersion + 1 WHERE id = ?`,
          [index, now, id]
        );
      }

      GlobalEvents.emit(Events.accountsChanged);
    });
  },
};

// =============================================================================
// Category Repository
// =============================================================================

interface CategoryRow {
  id: string;
  name: string;
  emoji: string;
  sortIndex: number;
  monthlyBudgetCents: number | null;
  isSystem: number;
  createdAtMs: number;
  updatedAtMs: number;
  deletedAtMs: number | null;
}

function rowToCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    name: row.name,
    emoji: row.emoji,
    sortIndex: row.sortIndex,
    monthlyBudgetCents: row.monthlyBudgetCents ?? undefined,
    isSystem: row.isSystem === 1,
    createdAtMs: row.createdAtMs,
    updatedAtMs: row.updatedAtMs,
    deletedAtMs: row.deletedAtMs ?? undefined,
  };
}

export const CategoryRepository = {
  async getAll(): Promise<Category[]> {
    const rows = await queryAll<CategoryRow>(
      `SELECT * FROM ${TABLES.CATEGORIES} WHERE deletedAtMs IS NULL ORDER BY sortIndex, createdAtMs`
    );
    return rows.map(rowToCategory);
  },

  async getById(id: string): Promise<Category | null> {
    const row = await queryFirst<CategoryRow>(
      `SELECT * FROM ${TABLES.CATEGORIES} WHERE id = ? AND deletedAtMs IS NULL`,
      [id]
    );
    return row ? rowToCategory(row) : null;
  },

  async create(
    category: Omit<Category, 'id' | 'createdAtMs' | 'updatedAtMs' | 'sortIndex'> & { sortIndex?: number }
  ): Promise<Category> {
    const id = uuidv4();
    const now = Date.now();

    let sortIndex = category.sortIndex;
    if (sortIndex === undefined) {
      const row = await queryFirst<{ maxSortIndex: number }>(
        `SELECT COALESCE(MAX(sortIndex), -1) AS maxSortIndex FROM ${TABLES.CATEGORIES} WHERE deletedAtMs IS NULL AND isSystem = ?`,
        [category.isSystem ? 1 : 0]
      );
      sortIndex = (row?.maxSortIndex ?? -1) + 1;
    }

    await run(
      `INSERT INTO ${TABLES.CATEGORIES} 
       (id, name, emoji, sortIndex, monthlyBudgetCents, isSystem, 
        createdAtMs, updatedAtMs, deletedAtMs, syncVersion, needsSync) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        category.name,
        category.emoji,
        sortIndex,
        category.monthlyBudgetCents ?? null,
        category.isSystem ? 1 : 0,
        now,
        now,
        null, // deletedAtMs
        1,    // syncVersion
        1,    // needsSync
      ]
    );

    GlobalEvents.emit(Events.categoriesChanged);
    return { ...category, sortIndex, id, createdAtMs: now, updatedAtMs: now };
  },

  async update(id: string, updates: Partial<Omit<Category, 'id' | 'createdAtMs'>>): Promise<void> {
    const now = Date.now();
    const fields: string[] = ['updatedAtMs = ?', 'needsSync = 1', 'syncVersion = syncVersion + 1'];
    const values: SQLiteBindValue[] = [now];

    if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name); }
    if (updates.emoji !== undefined) { fields.push('emoji = ?'); values.push(updates.emoji); }
    if (updates.sortIndex !== undefined) { fields.push('sortIndex = ?'); values.push(updates.sortIndex); }
    if (updates.monthlyBudgetCents !== undefined) { fields.push('monthlyBudgetCents = ?'); values.push(updates.monthlyBudgetCents); }
    if (updates.isSystem !== undefined) { fields.push('isSystem = ?'); values.push(updates.isSystem ? 1 : 0); }

    values.push(id);
    await run(`UPDATE ${TABLES.CATEGORIES} SET ${fields.join(', ')} WHERE id = ?`, values);
    GlobalEvents.emit(Events.categoriesChanged);
  },

  async delete(id: string): Promise<void> {
    const now = Date.now();
    await run(
      `UPDATE ${TABLES.CATEGORIES} SET deletedAtMs = ?, updatedAtMs = ?, needsSync = 1, syncVersion = syncVersion + 1 WHERE id = ?`,
      [now, now, id]
    );
    GlobalEvents.emit(Events.categoriesChanged);
  },

  async reorder(idsInOrder: string[]): Promise<void> {
    const now = Date.now();

    await withTransaction(async () => {
      for (const [index, id] of idsInOrder.entries()) {
        await run(
          `UPDATE ${TABLES.CATEGORIES} SET sortIndex = ?, updatedAtMs = ?, needsSync = 1, syncVersion = syncVersion + 1 WHERE id = ?`,
          [index, now, id]
        );
      }

      GlobalEvents.emit(Events.categoriesChanged);
    });
  },
};

// =============================================================================
// Transaction Repository
// =============================================================================

interface TransactionRow {
  id: string;
  amountCents: number;
  date: number;
  note: string | null;
  type: string;
  systemType: string | null;
  accountId: string | null;
  categoryId: string | null;
  transferFromAccountId: string | null;
  transferToAccountId: string | null;
  tripExpenseId: string | null;
  sourceTripExpenseId: string | null;
  sourceTripSettlementId: string | null;
  createdAtMs: number;
  updatedAtMs: number;
  deletedAtMs: number | null;
}

function rowToTransaction(row: TransactionRow): Transaction {
  return {
    id: row.id,
    amountCents: row.amountCents,
    date: row.date,
    note: row.note ?? undefined,
    type: row.type as TransactionType,
    systemType: row.systemType as SystemType,
    accountId: row.accountId ?? undefined,
    categoryId: row.categoryId ?? undefined,
    transferFromAccountId: row.transferFromAccountId ?? undefined,
    transferToAccountId: row.transferToAccountId ?? undefined,
    tripExpenseId: row.tripExpenseId ?? undefined,
    sourceTripExpenseId: row.sourceTripExpenseId ?? undefined,
    sourceTripSettlementId: row.sourceTripSettlementId ?? undefined,
    createdAtMs: row.createdAtMs,
    updatedAtMs: row.updatedAtMs,
    deletedAtMs: row.deletedAtMs ?? undefined,
  };
}

export const TransactionRepository = {
  async getAll(options?: { limit?: number; offset?: number; accountId?: string }): Promise<Transaction[]> {
    let sql = `SELECT * FROM ${TABLES.TRANSACTIONS} WHERE deletedAtMs IS NULL`;
    const params: SQLiteBindValue[] = [];

    if (options?.accountId) {
      sql += ` AND (accountId = ? OR transferFromAccountId = ? OR transferToAccountId = ?)`;
      params.push(options.accountId, options.accountId, options.accountId);
    }

    sql += ` ORDER BY date DESC`;

    if (options?.limit) {
      sql += ` LIMIT ?`;
      params.push(options.limit);
    }
    if (options?.offset) {
      sql += ` OFFSET ?`;
      params.push(options.offset);
    }

    const rows = await queryAll<TransactionRow>(sql, params);
    return rows.map(rowToTransaction);
  },

  async getById(id: string): Promise<Transaction | null> {
    const row = await queryFirst<TransactionRow>(
      `SELECT * FROM ${TABLES.TRANSACTIONS} WHERE id = ? AND deletedAtMs IS NULL`,
      [id]
    );
    return row ? rowToTransaction(row) : null;
  },

  async getByDateRange(startMs: number, endMs: number): Promise<Transaction[]> {
    const rows = await queryAll<TransactionRow>(
      `SELECT * FROM ${TABLES.TRANSACTIONS} 
       WHERE date >= ? AND date <= ? AND deletedAtMs IS NULL 
       ORDER BY date DESC`,
      [startMs, endMs]
    );
    return rows.map(rowToTransaction);
  },

  async create(tx: Omit<Transaction, 'id' | 'createdAtMs' | 'updatedAtMs'>): Promise<Transaction> {
    const isTransfer = tx.systemType === 'transfer';
    const isAdjustment = tx.systemType === 'adjustment';

    const id = isTransfer
      ? idempotentTransferTransactionId({
          transferFromAccountId: tx.transferFromAccountId ?? '',
          transferToAccountId: tx.transferToAccountId ?? '',
          amountCents: tx.amountCents,
          dateMs: tx.date,
          note: tx.note ?? null,
        })
      : isAdjustment
        ? idempotentAdjustmentTransactionId({
            accountId: tx.accountId ?? '',
            amountCents: tx.amountCents,
            dateMs: tx.date,
            note: tx.note ?? null,
          })
        : uuidv4();
    const now = Date.now();

    const insert = async () => {
      await run(
        `INSERT INTO ${TABLES.TRANSACTIONS} 
         (id, amountCents, date, note, type, systemType, accountId, categoryId, 
          transferFromAccountId, transferToAccountId, tripExpenseId, sourceTripExpenseId, sourceTripSettlementId,
          createdAtMs, updatedAtMs, 
          syncVersion, needsSync, deletedAtMs) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          tx.amountCents,
          tx.date,
          tx.note ?? null,
          tx.type,
          tx.systemType ?? null,
          tx.accountId ?? null,
          tx.categoryId ?? null,
          tx.transferFromAccountId ?? null,
          tx.transferToAccountId ?? null,
          tx.tripExpenseId ?? null,
          tx.sourceTripExpenseId ?? null,
          tx.sourceTripSettlementId ?? null,
          now,
          now,
          1, // syncVersion
          1, // needsSync
          null, // deletedAtMs
        ]
      );
    };

    if (isTransfer || isAdjustment) {
      await withTransaction(async () => {
        const existing = await queryFirst<TransactionRow>(
          `SELECT * FROM ${TABLES.TRANSACTIONS} WHERE id = ? AND deletedAtMs IS NULL`,
          [id]
        );
        if (existing) return;
        await insert();
      });
    } else {
      await insert();
    }

    GlobalEvents.emit(Events.transactionsChanged);

    if (isTransfer || isAdjustment) {
      const existing = await this.getById(id);
      if (existing) return existing;
    }

    return { ...tx, id, createdAtMs: now, updatedAtMs: now };
  },

  async update(
    id: string,
    updates: Omit<Partial<Omit<Transaction, 'id' | 'createdAtMs'>>, 'tripExpenseId'> & {
      // Some columns are nullable in SQLite; allow explicitly clearing them.
      tripExpenseId?: string | null;
    }
  ): Promise<void> {
    const now = Date.now();
    const fields: string[] = ['updatedAtMs = ?', 'needsSync = 1', 'syncVersion = syncVersion + 1'];
    const values: SQLiteBindValue[] = [now];

    if (updates.amountCents !== undefined) { fields.push('amountCents = ?'); values.push(updates.amountCents); }
    if (updates.date !== undefined) { fields.push('date = ?'); values.push(updates.date); }
    if (updates.note !== undefined) { fields.push('note = ?'); values.push(updates.note); }
    if (updates.type !== undefined) { fields.push('type = ?'); values.push(updates.type); }
    if (updates.systemType !== undefined) { fields.push('systemType = ?'); values.push(updates.systemType); }
    if (updates.accountId !== undefined) { fields.push('accountId = ?'); values.push(updates.accountId); }
    if (updates.categoryId !== undefined) { fields.push('categoryId = ?'); values.push(updates.categoryId); }
    if (updates.transferFromAccountId !== undefined) { fields.push('transferFromAccountId = ?'); values.push(updates.transferFromAccountId); }
    if (updates.transferToAccountId !== undefined) { fields.push('transferToAccountId = ?'); values.push(updates.transferToAccountId); }
    if (updates.tripExpenseId !== undefined) { fields.push('tripExpenseId = ?'); values.push(updates.tripExpenseId); }
    if (updates.sourceTripExpenseId !== undefined) { fields.push('sourceTripExpenseId = ?'); values.push(updates.sourceTripExpenseId); }
    if (updates.sourceTripSettlementId !== undefined) { fields.push('sourceTripSettlementId = ?'); values.push(updates.sourceTripSettlementId); }

    values.push(id);
    await run(`UPDATE ${TABLES.TRANSACTIONS} SET ${fields.join(', ')} WHERE id = ?`, values);
    GlobalEvents.emit(Events.transactionsChanged);
  },

  /**
   * Update accountId for a derived (local-only) transaction.
   *
   * Derived rows are created by reconcile logic and should never sync to Convex.
   * This helper keeps `needsSync = 0` and does not bump `syncVersion`.
   */
  async updateDerivedAccountId(id: string, accountId: string | null): Promise<void> {
    const now = Date.now();
    await run(
      `UPDATE ${TABLES.TRANSACTIONS}
       SET accountId = ?, updatedAtMs = ?
       WHERE id = ? AND needsSync = 0`,
      [accountId, now, id]
    );
    GlobalEvents.emit(Events.transactionsChanged);
  },

  async delete(id: string): Promise<void> {
    const now = Date.now();
    await run(
      `UPDATE ${TABLES.TRANSACTIONS} SET deletedAtMs = ?, updatedAtMs = ?, needsSync = 1, syncVersion = syncVersion + 1 WHERE id = ?`,
      [now, now, id]
    );
    GlobalEvents.emit(Events.transactionsChanged);
  },

  async upsertDerivedBatch(rows: Array<{
    id: string;
    amountCents: number;
    date: number;
    note?: string;
    type: TransactionType;
    systemType: SystemType;
    accountId?: string;
    categoryId?: string;
    sourceTripExpenseId?: string;
    sourceTripSettlementId?: string;
  }>): Promise<void> {
    if (rows.length === 0) return;

    const now = Date.now();

    const preserveAccountIdRows = rows.filter(
      (r) => r.systemType === 'trip_cashflow' || r.systemType === 'trip_settlement'
    );
    const forceNullAccountIdRows = rows.filter(
      (r) => !(r.systemType === 'trip_cashflow' || r.systemType === 'trip_settlement')
    );

    const baseInsert = `INSERT INTO ${TABLES.TRANSACTIONS}
      (id, amountCents, date, note, type, systemType, accountId, categoryId,
       transferFromAccountId, transferToAccountId, tripExpenseId, sourceTripExpenseId, sourceTripSettlementId,
       createdAtMs, updatedAtMs, deletedAtMs, syncVersion, needsSync)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        amountCents=excluded.amountCents,
        date=excluded.date,
        note=excluded.note,
        type=excluded.type,
        systemType=excluded.systemType,
        categoryId=excluded.categoryId,
        sourceTripExpenseId=excluded.sourceTripExpenseId,
        sourceTripSettlementId=excluded.sourceTripSettlementId,
        updatedAtMs=excluded.updatedAtMs,
        deletedAtMs=NULL,
        needsSync=0`;

    await withTransaction(async () => {
      for (const row of forceNullAccountIdRows) {
        await run(
          `${baseInsert}, accountId=NULL`,
          [
            row.id,
            row.amountCents,
            row.date,
            row.note ?? null,
            row.type,
            row.systemType ?? null,
            null,
            row.categoryId ?? null,
            null,
            null,
            null,
            row.sourceTripExpenseId ?? null,
            row.sourceTripSettlementId ?? null,
            now,
            now,
            null,
            1,
            0,
          ]
        );
      }

      for (const row of preserveAccountIdRows) {
        await run(
          `${baseInsert}, accountId=COALESCE(${TABLES.TRANSACTIONS}.accountId, excluded.accountId)`,
          [
            row.id,
            row.amountCents,
            row.date,
            row.note ?? null,
            row.type,
            row.systemType ?? null,
            row.accountId ?? null,
            row.categoryId ?? null,
            null,
            null,
            null,
            row.sourceTripExpenseId ?? null,
            row.sourceTripSettlementId ?? null,
            now,
            now,
            null,
            1,
            0,
          ]
        );
      }
    });

    GlobalEvents.emit(Events.transactionsChanged);
  },

  async softDeleteDerivedByIds(ids: string[]): Promise<void> {
    if (ids.length === 0) return;

    const now = Date.now();
    const placeholders = ids.map(() => '?').join(',');

    await run(
      `UPDATE ${TABLES.TRANSACTIONS} SET deletedAtMs = ?, updatedAtMs = ?, needsSync = 0 WHERE id IN (${placeholders})`,
      [now, now, ...ids]
    );

    GlobalEvents.emit(Events.transactionsChanged);
  },

  async getDerivedBySourceTripExpenseIds(sourceIds: string[]): Promise<Transaction[]> {
    if (sourceIds.length === 0) return [];
    const placeholders = sourceIds.map(() => '?').join(',');
    const rows = await queryAll<TransactionRow>(
      `SELECT * FROM ${TABLES.TRANSACTIONS}
       WHERE deletedAtMs IS NULL
         AND sourceTripExpenseId IN (${placeholders})
         AND systemType IN ('trip_share', 'trip_cashflow')`,
      sourceIds
    );
    return rows.map(rowToTransaction);
  },

  async getDerivedBySourceTripSettlementIds(sourceIds: string[]): Promise<Transaction[]> {
    if (sourceIds.length === 0) return [];
    const placeholders = sourceIds.map(() => '?').join(',');
    const rows = await queryAll<TransactionRow>(
      `SELECT * FROM ${TABLES.TRANSACTIONS}
       WHERE deletedAtMs IS NULL
         AND sourceTripSettlementId IN (${placeholders})
         AND systemType = 'trip_settlement'`,
      sourceIds
    );
    return rows.map(rowToTransaction);
  },
};

// =============================================================================
// Trip Repository
// =============================================================================

interface TripRow {
  id: string;
  name: string;
  emoji: string;
  sortIndex: number;
  isGroup: number;
  isArchived: number;
  startDate: number | null;
  endDate: number | null;
  budgetCents: number | null;
  createdAtMs: number;
  updatedAtMs: number;
  deletedAtMs: number | null;
}

function rowToTrip(row: TripRow): Trip {
  return {
    id: row.id,
    name: row.name,
    emoji: row.emoji,
    sortIndex: row.sortIndex,
    isGroup: row.isGroup === 1,
    isArchived: row.isArchived === 1,
    startDate: row.startDate ?? undefined,
    endDate: row.endDate ?? undefined,
    budgetCents: row.budgetCents ?? undefined,
    createdAtMs: row.createdAtMs,
    updatedAtMs: row.updatedAtMs,
    deletedAtMs: row.deletedAtMs ?? undefined,
  };
}

export const TripRepository = {
  async getAll(includeArchived = false): Promise<Trip[]> {
    let sql = `SELECT * FROM ${TABLES.TRIPS} WHERE deletedAtMs IS NULL`;
    if (!includeArchived) {
      sql += ` AND isArchived = 0`;
    }
    sql += ` ORDER BY sortIndex, createdAtMs DESC`;

    const rows = await queryAll<TripRow>(sql);
    return rows.map(rowToTrip);
  },

  async getAllHydrated(includeArchived = false): Promise<Trip[]> {
    const trips = await this.getAll(includeArchived);
    if (trips.length === 0) return [];

     // Silent repair: ensure exactly one current user participant for group trips.
     // This fixes legacy invalid states before we build the hydrated view.
     for (const t of trips) {
       if (!t.isGroup) continue;
       await TripParticipantRepository.ensureExactlyOneCurrentUser(t.id);
     }

    // Fetch all related data in bulk (optimization: could filter by trip IDs)
    const tripIds = trips.map(t => `'${t.id}'`).join(',');
    const participants = await queryAll<TripParticipantRow>(
      `SELECT * FROM ${TABLES.TRIP_PARTICIPANTS} WHERE tripId IN (${tripIds}) AND deletedAtMs IS NULL`
    );
    const expenses = await queryAll<TripExpenseRow>(
      `SELECT * FROM ${TABLES.TRIP_EXPENSES} WHERE tripId IN (${tripIds}) AND deletedAtMs IS NULL`
    );
    // Get transactions for these expenses
    const txIds = expenses.map(e => `'${e.transactionId}'`).join(',');
    const transactions = txIds ? await queryAll<TransactionRow>(
      `SELECT * FROM ${TABLES.TRANSACTIONS} WHERE id IN (${txIds}) AND deletedAtMs IS NULL`
    ) : [];

    const settlements = await queryAll<TripSettlementRow>(
      `SELECT * FROM ${TABLES.TRIP_SETTLEMENTS} WHERE tripId IN (${tripIds}) AND deletedAtMs IS NULL`
    );

    // Maps for linking
    const txMap = new Map(transactions.map(t => [t.id, rowToTransaction(t)]));
    const pMap = new Map<string, TripParticipant[]>();

    participants.forEach(p => {
      const obj = rowToParticipant(p);
      if (!pMap.has(p.tripId)) pMap.set(p.tripId, []);
      pMap.get(p.tripId)?.push(obj);
    });

    return trips.map(t => {
      const tParticipants = pMap.get(t.id) || [];
      const tSettlements = settlements
        .filter(s => s.tripId === t.id)
        .map(rowToSettlement);

      const tExpenses = expenses
        .filter(e => e.tripId === t.id)
        .map(row => {
          const obj = rowToTripExpense(row);
          obj.transaction = txMap.get(row.transactionId);
          obj.paidByParticipant = tParticipants.find(p => p.id === row.paidByParticipantId);
          return obj;
        });

      // Link settlements participants
      tSettlements.forEach(s => {
        s.fromParticipant = tParticipants.find(p => p.id === s.fromParticipantId);
        s.toParticipant = tParticipants.find(p => p.id === s.toParticipantId);
      });

      return {
        ...t,
        participants: tParticipants,
        expenses: tExpenses,
        settlements: tSettlements,
      };
    });
  },

  async getById(id: string): Promise<Trip | null> {
    const row = await queryFirst<TripRow>(
      `SELECT * FROM ${TABLES.TRIPS} WHERE id = ? AND deletedAtMs IS NULL`,
      [id]
    );
    return row ? rowToTrip(row) : null;
  },

  async getHydrated(id: string): Promise<Trip | null> {
    const trip = await this.getById(id);
    if (!trip) return null;

    // Fetch participants
    if (trip.isGroup) {
      await TripParticipantRepository.ensureExactlyOneCurrentUser(id);
    }
    const participants = await TripParticipantRepository.getByTripId(id);

    // Fetch expenses
    const expenseRows = await queryAll<TripExpenseRow>(
      `SELECT * FROM ${TABLES.TRIP_EXPENSES} WHERE tripId = ? AND deletedAtMs IS NULL`,
      [id]
    );

    // Fetch transactions for expenses
    const txIds = expenseRows.map(e => `'${e.transactionId}'`).join(',');
    const transactions = txIds ? await queryAll<TransactionRow>(
      `SELECT * FROM ${TABLES.TRANSACTIONS} WHERE id IN (${txIds}) AND deletedAtMs IS NULL`
    ) : [];
    const txMap = new Map(transactions.map(t => [t.id, rowToTransaction(t)]));

    // Fetch settlements
    const settlements = await TripSettlementRepository.getByTripId(id);

    const expenses = expenseRows.map(row => {
      const obj = rowToTripExpense(row);
      obj.transaction = txMap.get(row.transactionId);
      obj.paidByParticipant = participants.find(p => p.id === row.paidByParticipantId);
      return obj;
    });

    // Link settlements
    settlements.forEach(s => {
      s.fromParticipant = participants.find(p => p.id === s.fromParticipantId);
      s.toParticipant = participants.find(p => p.id === s.toParticipantId);
    });

    return {
      ...trip,
      participants,
      expenses,
      settlements,
    };
  },

  async create(
    trip: Omit<Trip, 'id' | 'createdAtMs' | 'updatedAtMs' | 'sortIndex'> & { sortIndex?: number }
  ): Promise<Trip> {
    const id = uuidv4();
    const now = Date.now();

    const row = await queryFirst<{ maxSortIndex: number }>(
      `SELECT COALESCE(MAX(sortIndex), -1) AS maxSortIndex FROM ${TABLES.TRIPS} WHERE deletedAtMs IS NULL`
    );
    const sortIndex = trip.sortIndex ?? ((row?.maxSortIndex ?? -1) + 1);

    await run(
      `INSERT INTO ${TABLES.TRIPS} 
       (id, name, emoji, sortIndex, isGroup, isArchived, startDate, endDate, budgetCents, createdAtMs, updatedAtMs) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        trip.name,
        trip.emoji,
        sortIndex,
        trip.isGroup ? 1 : 0,
        trip.isArchived ? 1 : 0,
        trip.startDate ?? null,
        trip.endDate ?? null,
        trip.budgetCents ?? null,
        now,
        now,
      ]
    );

    GlobalEvents.emit(Events.tripsChanged);
    return { ...trip, sortIndex, id, createdAtMs: now, updatedAtMs: now };
  },

  async update(id: string, updates: Partial<Omit<Trip, 'id' | 'createdAtMs'>>): Promise<void> {
    const now = Date.now();
    const fields: string[] = ['updatedAtMs = ?', 'needsSync = 1', 'syncVersion = syncVersion + 1'];
    const values: SQLiteBindValue[] = [now];

    if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name); }
    if (updates.emoji !== undefined) { fields.push('emoji = ?'); values.push(updates.emoji); }
    if (updates.sortIndex !== undefined) { fields.push('sortIndex = ?'); values.push(updates.sortIndex); }
    if (updates.isGroup !== undefined) { fields.push('isGroup = ?'); values.push(updates.isGroup ? 1 : 0); }
    if (updates.isArchived !== undefined) { fields.push('isArchived = ?'); values.push(updates.isArchived ? 1 : 0); }
    if (updates.startDate !== undefined) { fields.push('startDate = ?'); values.push(updates.startDate); }
    if (updates.endDate !== undefined) { fields.push('endDate = ?'); values.push(updates.endDate); }
    if (updates.budgetCents !== undefined) { fields.push('budgetCents = ?'); values.push(updates.budgetCents); }

    values.push(id);
    await run(`UPDATE ${TABLES.TRIPS} SET ${fields.join(', ')} WHERE id = ?`, values);
    GlobalEvents.emit(Events.tripsChanged);
  },

  async delete(id: string): Promise<void> {
    const now = Date.now();
    await run(
      `UPDATE ${TABLES.TRIPS} SET deletedAtMs = ?, updatedAtMs = ?, needsSync = 1, syncVersion = syncVersion + 1 WHERE id = ?`,
      [now, now, id]
    );
    GlobalEvents.emit(Events.tripsChanged);
  },

  async reorder(idsInOrder: string[]): Promise<void> {
    const now = Date.now();

    await withTransaction(async () => {
      for (const [index, id] of idsInOrder.entries()) {
        await run(
          `UPDATE ${TABLES.TRIPS} SET sortIndex = ?, updatedAtMs = ?, needsSync = 1, syncVersion = syncVersion + 1 WHERE id = ?`,
          [index, now, id]
        );
      }

      GlobalEvents.emit(Events.tripsChanged);
    });
  },
};

// =============================================================================
// TripParticipant Repository
// =============================================================================

interface TripParticipantRow {
  id: string;
  tripId: string;
  name: string;
  isCurrentUser: number;
  colorHex: string | null;
  createdAtMs: number;
  updatedAtMs: number;
  deletedAtMs: number | null;
}

function rowToParticipant(row: TripParticipantRow): TripParticipant {
  return {
    id: row.id,
    tripId: row.tripId,
    name: row.name,
    isCurrentUser: row.isCurrentUser === 1,
    colorHex: row.colorHex ?? undefined,
    createdAtMs: row.createdAtMs,
    updatedAtMs: row.updatedAtMs,
    deletedAtMs: row.deletedAtMs ?? undefined,
  };
}

export const TripParticipantRepository = {
  async getByTripId(tripId: string): Promise<TripParticipant[]> {
    const rows = await queryAll<TripParticipantRow>(
      `SELECT * FROM ${TABLES.TRIP_PARTICIPANTS} WHERE tripId = ? AND deletedAtMs IS NULL`,
      [tripId]
    );
    return rows.map(rowToParticipant);
  },

  async getById(id: string): Promise<TripParticipant | null> {
    const row = await queryFirst<TripParticipantRow>(
      `SELECT * FROM ${TABLES.TRIP_PARTICIPANTS} WHERE id = ? AND deletedAtMs IS NULL`,
      [id]
    );
    return row ? rowToParticipant(row) : null;
  },

  async create(participant: Omit<TripParticipant, 'id' | 'createdAtMs' | 'updatedAtMs'>): Promise<TripParticipant> {
    const id = uuidv4();
    const now = Date.now();

    await run(
      `INSERT INTO ${TABLES.TRIP_PARTICIPANTS} 
       (id, tripId, name, isCurrentUser, colorHex, createdAtMs, updatedAtMs) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        participant.tripId,
        participant.name,
        participant.isCurrentUser ? 1 : 0,
        participant.colorHex ?? null,
        now,
        now,
      ]
    );

    GlobalEvents.emit(Events.tripParticipantsChanged);
    return { ...participant, id, createdAtMs: now, updatedAtMs: now };
  },

  async update(id: string, updates: Partial<Omit<TripParticipant, 'id' | 'tripId' | 'createdAtMs'>>): Promise<void> {
    const now = Date.now();
    const fields: string[] = ['updatedAtMs = ?', 'needsSync = 1', 'syncVersion = syncVersion + 1'];
    const values: SQLiteBindValue[] = [now];

    if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name); }
    if (updates.isCurrentUser !== undefined) { fields.push('isCurrentUser = ?'); values.push(updates.isCurrentUser ? 1 : 0); }
    if (updates.colorHex !== undefined) { fields.push('colorHex = ?'); values.push(updates.colorHex); }

    values.push(id);
    await run(`UPDATE ${TABLES.TRIP_PARTICIPANTS} SET ${fields.join(', ')} WHERE id = ?`, values);
    GlobalEvents.emit(Events.tripParticipantsChanged);

    if (updates.isCurrentUser !== undefined) {
      const participant = await this.getById(id);
      if (participant) {
        await this.ensureExactlyOneCurrentUser(participant.tripId);
      }
    }
  },

  async delete(id: string): Promise<void> {
    const existing = await this.getById(id);
    if (!existing) return;

    // Avoid deleting the last current-user participant.
    if (existing.isCurrentUser) {
      const participants = await this.getByTripId(existing.tripId);
      const others = participants.filter((p) => p.id !== existing.id);
      if (others.length === 0) {
        // Refuse deletion; a group trip must always have a current user.
        return;
      }

      // Promote someone else before deleting.
      await this.update(others[0].id, { isCurrentUser: true });
    }

    const now = Date.now();
    await run(
      `UPDATE ${TABLES.TRIP_PARTICIPANTS} SET deletedAtMs = ?, updatedAtMs = ?, needsSync = 1, syncVersion = syncVersion + 1 WHERE id = ?`,
      [now, now, id]
    );
    GlobalEvents.emit(Events.tripParticipantsChanged);

    await this.ensureExactlyOneCurrentUser(existing.tripId);
  },

  /**
   * Ensure group trips always have exactly one current user participant.
   * Silently repairs invalid states by selecting one participant as current user.
   */
  async ensureExactlyOneCurrentUser(tripId: string): Promise<void> {
    const participants = await this.getByTripId(tripId);
    const current = participants.filter((p) => p.isCurrentUser);

    // If there are no participants at all, create a default "You" participant.
    if (participants.length === 0) {
      await this.create({ tripId, name: 'You', isCurrentUser: true });
      return;
    }

    // Exactly one is ideal.
    if (current.length === 1) return;

    const chosenId = pickSingleCurrentUserParticipantId(participants);
    const chosen = chosenId ? participants.find((p) => p.id === chosenId) ?? participants[0] : participants[0];

    // Repair: set chosen as current user, all others as not current user.
    for (const p of participants) {
      const desired = p.id === chosen.id;
      if (p.isCurrentUser !== desired) {
        await this.update(p.id, { isCurrentUser: desired });
      }
    }
  },
};

// =============================================================================
// TripExpense Repository
// =============================================================================

interface TripExpenseRow {
  id: string;
  tripId: string;
  transactionId: string;
  paidByParticipantId: string | null;
  splitType: string;
  splitDataJson: string | null;
  computedSplitsJson: string | null;
  createdAtMs: number;
  updatedAtMs: number;
  deletedAtMs: number | null;
}

function rowToTripExpense(row: TripExpenseRow): TripExpense {
  return {
    id: row.id,
    tripId: row.tripId,
    transactionId: row.transactionId,
    paidByParticipantId: row.paidByParticipantId ?? undefined,
    splitType: row.splitType as SplitType,
    splitData: row.splitDataJson ? JSON.parse(row.splitDataJson) : undefined,
    computedSplits: row.computedSplitsJson ? JSON.parse(row.computedSplitsJson) : undefined,
    createdAtMs: row.createdAtMs,
    updatedAtMs: row.updatedAtMs,
    deletedAtMs: row.deletedAtMs ?? undefined,
  };
}

export const TripExpenseRepository = {
  async getByTripId(tripId: string): Promise<TripExpense[]> {
    const rows = await queryAll<TripExpenseRow>(
      `SELECT * FROM ${TABLES.TRIP_EXPENSES} WHERE tripId = ? AND deletedAtMs IS NULL`,
      [tripId]
    );
    return rows.map(rowToTripExpense);
  },

  async getById(id: string): Promise<TripExpense | null> {
    const row = await queryFirst<TripExpenseRow>(
      `SELECT * FROM ${TABLES.TRIP_EXPENSES} WHERE id = ? AND deletedAtMs IS NULL`,
      [id]
    );
    return row ? rowToTripExpense(row) : null;
  },

  async getByTransactionId(transactionId: string): Promise<TripExpense | null> {
    const row = await queryFirst<TripExpenseRow>(
      `SELECT * FROM ${TABLES.TRIP_EXPENSES} WHERE transactionId = ? AND deletedAtMs IS NULL`,
      [transactionId]
    );
    return row ? rowToTripExpense(row) : null;
  },

  async create(expense: Omit<TripExpense, 'id' | 'createdAtMs' | 'updatedAtMs'>): Promise<TripExpense> {
    const id = uuidv4();
    const now = Date.now();

    await run(
      `INSERT INTO ${TABLES.TRIP_EXPENSES} 
       (id, tripId, transactionId, paidByParticipantId, splitType, splitDataJson, computedSplitsJson, createdAtMs, updatedAtMs) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        expense.tripId,
        expense.transactionId,
        expense.paidByParticipantId ?? null,
        expense.splitType,
        expense.splitData ? JSON.stringify(expense.splitData) : null,
        expense.computedSplits ? JSON.stringify(expense.computedSplits) : null,
        now,
        now,
      ]
    );

    GlobalEvents.emit(Events.tripExpensesChanged);
    return { ...expense, id, createdAtMs: now, updatedAtMs: now };
  },

  async update(id: string, updates: Partial<Omit<TripExpense, 'id' | 'tripId' | 'transactionId' | 'createdAtMs'>>): Promise<void> {
    const now = Date.now();
    const fields: string[] = ['updatedAtMs = ?', 'needsSync = 1', 'syncVersion = syncVersion + 1'];
    const values: SQLiteBindValue[] = [now];

    if (updates.paidByParticipantId !== undefined) { fields.push('paidByParticipantId = ?'); values.push(updates.paidByParticipantId); }
    if (updates.splitType !== undefined) { fields.push('splitType = ?'); values.push(updates.splitType); }
    if (updates.splitData !== undefined) { fields.push('splitDataJson = ?'); values.push(JSON.stringify(updates.splitData)); }
    if (updates.computedSplits !== undefined) { fields.push('computedSplitsJson = ?'); values.push(JSON.stringify(updates.computedSplits)); }

    values.push(id);
    await run(`UPDATE ${TABLES.TRIP_EXPENSES} SET ${fields.join(', ')} WHERE id = ?`, values);
    GlobalEvents.emit(Events.tripExpensesChanged);
  },

  async delete(id: string): Promise<void> {
    const now = Date.now();
    await run(
      `UPDATE ${TABLES.TRIP_EXPENSES} SET deletedAtMs = ?, updatedAtMs = ?, needsSync = 1, syncVersion = syncVersion + 1 WHERE id = ?`,
      [now, now, id]
    );
    GlobalEvents.emit(Events.tripExpensesChanged);
  },

  async getExpenseMetaByIds(expenseIds: string[]): Promise<Record<string, {
    tripId: string;
    tripEmoji: string;
    categoryEmoji: string | null;
    categoryName: string | null;
    amountCents: number;
    transactionId: string;
  }>> {
    if (expenseIds.length === 0) return {};
    const uniqueIds = Array.from(new Set(expenseIds));
    const placeholders = uniqueIds.map(() => '?').join(',');

    const rows = await queryAll<{
      expenseId: string;
      tripId: string;
      tripEmoji: string;
      categoryEmoji: string | null;
      categoryName: string | null;
      amountCents: number;
      transactionId: string;
    }>(
      `SELECT
         e.id AS expenseId,
         e.tripId AS tripId,
         t.emoji AS tripEmoji,
         c.emoji AS categoryEmoji,
         c.name AS categoryName,
         ABS(tx.amountCents) AS amountCents,
         e.transactionId AS transactionId
       FROM ${TABLES.TRIP_EXPENSES} e
       JOIN ${TABLES.TRIPS} t ON t.id = e.tripId
       JOIN ${TABLES.TRANSACTIONS} tx ON tx.id = e.transactionId
       LEFT JOIN ${TABLES.CATEGORIES} c ON c.id = tx.categoryId
       WHERE e.id IN (${placeholders}) AND e.deletedAtMs IS NULL`,
      uniqueIds
    );

    const map: Record<string, any> = {};
    for (const r of rows) {
      map[r.expenseId] = {
        tripId: r.tripId,
        tripEmoji: r.tripEmoji,
        categoryEmoji: r.categoryEmoji,
        categoryName: r.categoryName,
        amountCents: r.amountCents ?? 0,
        transactionId: r.transactionId,
      };
    }
    return map;
  },
};

// =============================================================================
// TripSettlement Repository
// =============================================================================

interface TripSettlementRow {
  id: string;
  tripId: string;
  fromParticipantId: string;
  toParticipantId: string;
  amountCents: number;
  date: number;
  note: string | null;
  createdAtMs: number;
  updatedAtMs: number;
  deletedAtMs: number | null;
}

function rowToSettlement(row: TripSettlementRow): TripSettlement {
  return {
    id: row.id,
    tripId: row.tripId,
    fromParticipantId: row.fromParticipantId,
    toParticipantId: row.toParticipantId,
    amountCents: row.amountCents,
    date: row.date,
    note: row.note ?? undefined,
    createdAtMs: row.createdAtMs,
    updatedAtMs: row.updatedAtMs,
    deletedAtMs: row.deletedAtMs ?? undefined,
  };
}

export const TripSettlementRepository = {
  async getByTripId(tripId: string): Promise<TripSettlement[]> {
    const rows = await queryAll<TripSettlementRow>(
      `SELECT * FROM ${TABLES.TRIP_SETTLEMENTS} WHERE tripId = ? AND deletedAtMs IS NULL ORDER BY date DESC`,
      [tripId]
    );
    return rows.map(rowToSettlement);
  },

  async getById(id: string): Promise<TripSettlement | null> {
    const row = await queryFirst<TripSettlementRow>(
      `SELECT * FROM ${TABLES.TRIP_SETTLEMENTS} WHERE id = ? AND deletedAtMs IS NULL`,
      [id]
    );
    return row ? rowToSettlement(row) : null;
  },

  async create(settlement: Omit<TripSettlement, 'id' | 'createdAtMs' | 'updatedAtMs'>): Promise<TripSettlement> {
    const id = idempotentTripSettlementId({
      tripId: settlement.tripId,
      fromParticipantId: settlement.fromParticipantId,
      toParticipantId: settlement.toParticipantId,
      amountCents: settlement.amountCents,
      dateMs: settlement.date,
      note: settlement.note ?? null,
    });
    const now = Date.now();

    await withTransaction(async () => {
      const existing = await queryFirst<TripSettlementRow>(
        `SELECT * FROM ${TABLES.TRIP_SETTLEMENTS} WHERE id = ? AND deletedAtMs IS NULL`,
        [id]
      );
      if (existing) return;

      await run(
        `INSERT INTO ${TABLES.TRIP_SETTLEMENTS} 
         (id, tripId, fromParticipantId, toParticipantId, amountCents, date, note,
          createdAtMs, updatedAtMs, deletedAtMs, syncVersion, needsSync) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          settlement.tripId,
          settlement.fromParticipantId,
          settlement.toParticipantId,
          settlement.amountCents,
          settlement.date,
          settlement.note ?? null,
          now,
          now,
          null,
          1,
          1,
        ]
      );
    });

    GlobalEvents.emit(Events.tripSettlementsChanged);
    const existing = await this.getById(id);
    if (existing) return existing;
    return { ...settlement, id, createdAtMs: now, updatedAtMs: now };
  },

  async delete(id: string): Promise<void> {
    const now = Date.now();
    await run(
      `UPDATE ${TABLES.TRIP_SETTLEMENTS} SET deletedAtMs = ?, updatedAtMs = ?, needsSync = 1, syncVersion = syncVersion + 1 WHERE id = ?`,
      [now, now, id]
    );
    GlobalEvents.emit(Events.tripSettlementsChanged);
  },

  async getSettlementMetaByIds(settlementIds: string[]): Promise<Record<string, { tripId: string; tripEmoji: string }>> {
    if (settlementIds.length === 0) return {};
    const uniqueIds = Array.from(new Set(settlementIds));
    const placeholders = uniqueIds.map(() => '?').join(',');
    const rows = await queryAll<{ settlementId: string; tripId: string; tripEmoji: string }>(
      `SELECT
         s.id AS settlementId,
         s.tripId AS tripId,
         t.emoji AS tripEmoji
       FROM ${TABLES.TRIP_SETTLEMENTS} s
       JOIN ${TABLES.TRIPS} t ON t.id = s.tripId
       WHERE s.id IN (${placeholders}) AND s.deletedAtMs IS NULL`,
      uniqueIds
    );

    const map: Record<string, { tripId: string; tripEmoji: string }> = {};
    for (const r of rows) {
      map[r.settlementId] = { tripId: r.tripId, tripEmoji: r.tripEmoji };
    }
    return map;
  },
};

// =============================================================================
// UserSettings Repository
// =============================================================================

interface UserSettingsRow {
  id: string;
  currencyCode: string;
  hapticsEnabled: number;
  defaultAccountId: string | null;
  hasSeenOnboarding: number;
  syncTransactionFilters?: number | null;
  resetTransactionFiltersOnReopen?: number | null;
  transactionsFiltersJson?: string | null;
  transactionsFiltersUpdatedAtMs?: number | null;
  updatedAtMs: number;
}

function rowToSettings(row: UserSettingsRow): UserSettings {
  return {
    currencyCode: row.currencyCode,
    hapticsEnabled: row.hapticsEnabled === 1,
    defaultAccountId: row.defaultAccountId ?? null,
    hasSeenOnboarding: row.hasSeenOnboarding === 1,
    syncTransactionFilters: (row.syncTransactionFilters ?? 0) === 1,
    resetTransactionFiltersOnReopen: (row.resetTransactionFiltersOnReopen ?? 0) === 1,
    transactionsFiltersJson: row.transactionsFiltersJson ?? null,
    transactionsFiltersUpdatedAtMs: row.transactionsFiltersUpdatedAtMs ?? null,
    updatedAtMs: row.updatedAtMs,
  };
}

export const UserSettingsRepository = {
  async get(): Promise<UserSettings> {
    const row = await queryFirst<UserSettingsRow>(
      `SELECT * FROM ${TABLES.USER_SETTINGS} WHERE id = 'local'`
    );

    if (row) {
      return rowToSettings(row);
    }

    // Return defaults if no settings exist
    return {
      currencyCode: 'INR',
      hapticsEnabled: true,
      defaultAccountId: null,
      hasSeenOnboarding: false,
      syncTransactionFilters: false,
      resetTransactionFiltersOnReopen: false,
      transactionsFiltersJson: null,
      transactionsFiltersUpdatedAtMs: null,
      updatedAtMs: Date.now(),
    };
  },

  async update(updates: Partial<Omit<UserSettings, 'updatedAtMs'>>): Promise<void> {
    const now = Date.now();

    // Check if settings row exists
    const existing = await queryFirst<{ id: string }>(
      `SELECT id FROM ${TABLES.USER_SETTINGS} WHERE id = 'local'`
    );

    if (!existing) {
      // Insert new row
      await run(
        `INSERT INTO ${TABLES.USER_SETTINGS} 
         (id, currencyCode, hapticsEnabled, defaultAccountId, hasSeenOnboarding, syncTransactionFilters, resetTransactionFiltersOnReopen, transactionsFiltersJson, transactionsFiltersUpdatedAtMs, updatedAtMs, syncVersion, needsSync) 
         VALUES ('local', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          updates.currencyCode ?? 'INR',
          updates.hapticsEnabled !== false ? 1 : 0,
          updates.defaultAccountId ?? null,
          updates.hasSeenOnboarding ? 1 : 0,
          updates.syncTransactionFilters ? 1 : 0,
          updates.resetTransactionFiltersOnReopen ? 1 : 0,
          updates.transactionsFiltersJson ?? null,
          updates.transactionsFiltersUpdatedAtMs ?? null,
          now,
          1, // syncVersion
          1, // needsSync
        ]
      );
    } else {
      // Update existing row
      const fields: string[] = ['updatedAtMs = ?', 'needsSync = 1', 'syncVersion = syncVersion + 1'];
      const values: SQLiteBindValue[] = [now];

      if (updates.currencyCode !== undefined) { fields.push('currencyCode = ?'); values.push(updates.currencyCode); }
      if (updates.hapticsEnabled !== undefined) { fields.push('hapticsEnabled = ?'); values.push(updates.hapticsEnabled ? 1 : 0); }
      if (updates.defaultAccountId !== undefined) { fields.push('defaultAccountId = ?'); values.push(updates.defaultAccountId); }
      if (updates.hasSeenOnboarding !== undefined) { fields.push('hasSeenOnboarding = ?'); values.push(updates.hasSeenOnboarding ? 1 : 0); }

      if (updates.syncTransactionFilters !== undefined) {
        fields.push('syncTransactionFilters = ?');
        values.push(updates.syncTransactionFilters ? 1 : 0);
      }
      if (updates.resetTransactionFiltersOnReopen !== undefined) {
        fields.push('resetTransactionFiltersOnReopen = ?');
        values.push(updates.resetTransactionFiltersOnReopen ? 1 : 0);
      }
      if (updates.transactionsFiltersJson !== undefined) {
        fields.push('transactionsFiltersJson = ?');
        values.push(updates.transactionsFiltersJson);
      }
      if (updates.transactionsFiltersUpdatedAtMs !== undefined) {
        fields.push('transactionsFiltersUpdatedAtMs = ?');
        values.push(updates.transactionsFiltersUpdatedAtMs);
      }

      await run(`UPDATE ${TABLES.USER_SETTINGS} SET ${fields.join(', ')} WHERE id = 'local'`, values);
    }

    GlobalEvents.emit(Events.userSettingsChanged);
  },
};
