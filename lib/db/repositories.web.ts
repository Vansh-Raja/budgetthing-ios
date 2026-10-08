/**
 * Web (PWA) implementations of the repository interfaces, backed by the
 * canonical Convex API. Same method names and return shapes as the native
 * SQLite repositories so shared screens run unchanged.
 */
import { api } from '@/convex/_generated/api';
import { webMutation, webQuery } from '../web/convexClient';
import { Events, GlobalEvents } from '../events';
import type { Account, Category, ImportInboxItem, SplitType, Transaction, TransactionType, Trip, TripExpense, TripParticipant, TripSettlement, UserSettings } from '../logic/types';
import { isTransactionForAccount } from '../logic/accountBalance';
import { derivedToTransaction, mergeLedger, toAccount, toCategory, toHydratedTrip, toImportInboxItem, toSettings, toTransaction } from '../web/mappers';

const nullable = <T>(v: T | null | undefined): T | null | undefined => v;

async function snapshot(): Promise<any> {
  return webQuery(api.pwaPersonal.getSnapshot, {});
}

async function tripsHydrated(includeArchived = true): Promise<Trip[]> {
  const rows: any[] = await webQuery(api.pwaTrips.listTrips, { includeArchived });
  return rows.map(toHydratedTrip);
}

// =============================================================================
// Accounts
// =============================================================================

export const AccountRepository = {
  async getAll(): Promise<Account[]> {
    const rows: any[] = await webQuery(api.pwaPersonal.listAccounts, {});
    return rows.map(toAccount);
  },
  async getById(id: string): Promise<Account | null> {
    return (await this.getAll()).find((a) => a.id === id) ?? null;
  },
  async create(account: Omit<Account, 'id' | 'createdAtMs' | 'updatedAtMs' | 'sortIndex'> & { sortIndex?: number }): Promise<Account> {
    const row = await webMutation(api.pwaPersonal.createAccount, {
      name: account.name, emoji: account.emoji, kind: account.kind,
      openingBalanceCents: nullable(account.openingBalanceCents), limitAmountCents: nullable(account.limitAmountCents), billingCycleDay: nullable(account.billingCycleDay),
    });
    GlobalEvents.emit(Events.accountsChanged);
    return toAccount(row);
  },
  async update(id: string, updates: Partial<Omit<Account, 'id' | 'createdAtMs'>>): Promise<void> {
    await webMutation(api.pwaPersonal.updateAccount, {
      id, name: updates.name, emoji: updates.emoji, kind: updates.kind,
      openingBalanceCents: 'openingBalanceCents' in updates ? updates.openingBalanceCents ?? null : undefined,
      limitAmountCents: 'limitAmountCents' in updates ? updates.limitAmountCents ?? null : undefined,
      billingCycleDay: 'billingCycleDay' in updates ? updates.billingCycleDay ?? null : undefined,
    });
    GlobalEvents.emit(Events.accountsChanged);
  },
  async delete(id: string): Promise<void> {
    await webMutation(api.pwaPersonal.archiveAccount, { id });
    GlobalEvents.emit(Events.accountsChanged);
  },
  async reorder(idsInOrder: string[]): Promise<void> {
    await webMutation(api.pwaPersonal.reorderAccounts, { idsInOrder });
    GlobalEvents.emit(Events.accountsChanged);
  },
};

// =============================================================================
// Categories
// =============================================================================

export const CategoryRepository = {
  async getAll(): Promise<Category[]> {
    const rows: any[] = await webQuery(api.pwaPersonal.listCategories, {});
    return rows.map(toCategory);
  },
  async getById(id: string): Promise<Category | null> {
    return (await this.getAll()).find((c) => c.id === id) ?? null;
  },
  async create(category: Omit<Category, 'id' | 'createdAtMs' | 'updatedAtMs' | 'sortIndex'> & { sortIndex?: number }): Promise<Category> {
    const row = await webMutation(api.pwaPersonal.createCategory, { name: category.name, emoji: category.emoji, monthlyBudgetCents: nullable(category.monthlyBudgetCents), isSystem: category.isSystem || undefined });
    GlobalEvents.emit(Events.categoriesChanged);
    return toCategory(row);
  },
  async update(id: string, updates: Partial<Omit<Category, 'id' | 'createdAtMs'>>): Promise<void> {
    await webMutation(api.pwaPersonal.updateCategory, {
      id, name: updates.name, emoji: updates.emoji, monthlyBudgetCents: 'monthlyBudgetCents' in updates ? updates.monthlyBudgetCents ?? null : undefined,
    });
    GlobalEvents.emit(Events.categoriesChanged);
  },
  async delete(id: string): Promise<void> {
    await webMutation(api.pwaPersonal.deleteCategory, { id });
    GlobalEvents.emit(Events.categoriesChanged);
  },
  async reorder(idsInOrder: string[]): Promise<void> {
    await webMutation(api.pwaPersonal.reorderCategories, { idsInOrder });
    GlobalEvents.emit(Events.categoriesChanged);
  },
};

// =============================================================================
// Transactions (canonical + virtual derived rows)
// =============================================================================

export const TransactionRepository = {
  async getAll(options?: { limit?: number; offset?: number; accountId?: string }): Promise<Transaction[]> {
    let rows = mergeLedger(await snapshot());
    if (options?.accountId) rows = rows.filter((t) => isTransactionForAccount(t, options.accountId!));
    if (options?.offset) rows = rows.slice(options.offset);
    if (options?.limit) rows = rows.slice(0, options.limit);
    return rows;
  },
  async getById(id: string): Promise<Transaction | null> {
    return (await this.getAll()).find((t) => t.id === id) ?? null;
  },
  async getByDateRange(startMs: number, endMs: number): Promise<Transaction[]> {
    return (await this.getAll()).filter((t) => t.date >= startMs && t.date <= endMs);
  },
  async create(tx: Omit<Transaction, 'id' | 'createdAtMs' | 'updatedAtMs'>): Promise<Transaction> {
    let row: any;
    if (tx.systemType === 'transfer') {
      row = await webMutation(api.pwaLedger.createTransfer, { fromAccountId: tx.transferFromAccountId ?? '', toAccountId: tx.transferToAccountId ?? '', amountCents: Math.abs(tx.amountCents), date: tx.date, note: tx.note ?? null });
    } else if (tx.systemType === 'adjustment') {
      const signed = tx.type === 'income' ? Math.abs(tx.amountCents) : -Math.abs(tx.amountCents);
      row = await webMutation(api.pwaLedger.createAdjustment, { accountId: tx.accountId ?? '', amountCents: signed, date: tx.date, note: tx.note ?? null, categoryId: tx.categoryId ?? null });
    } else {
      row = await webMutation(api.pwaLedger.createTransaction, { amountCents: Math.abs(tx.amountCents), date: tx.date, type: tx.type, note: tx.note ?? null, accountId: tx.accountId ?? null, categoryId: tx.categoryId ?? null });
    }
    GlobalEvents.emit(Events.transactionsChanged);
    return toTransaction(row);
  },
  async update(id: string, updates: Omit<Partial<Omit<Transaction, 'id' | 'createdAtMs'>>, 'tripExpenseId'> & { tripExpenseId?: string | null }): Promise<void> {
    const { tripExpenseId, ...rest } = updates;
    const hasLedgerFields = ['amountCents', 'date', 'type', 'note', 'accountId', 'categoryId'].some((k) => k in rest);
    if (hasLedgerFields) {
      await webMutation(api.pwaLedger.updateTransaction, {
        id,
        amountCents: rest.amountCents !== undefined ? Math.abs(rest.amountCents) : undefined,
        date: rest.date, type: rest.type,
        note: 'note' in rest ? rest.note ?? null : undefined,
        accountId: 'accountId' in rest ? rest.accountId ?? null : undefined,
        categoryId: 'categoryId' in rest ? rest.categoryId ?? null : undefined,
      });
    }
    // Linking is handled by TripExpenseRepository on web; an explicit null unlink is done there too.
    GlobalEvents.emit(Events.transactionsChanged);
  },
  async updateDerivedAccountId(id: string, accountId: string | null): Promise<void> {
    await webMutation(api.pwaDerived.setOverrideForDerivedRow, { derivedId: id, accountId });
    GlobalEvents.emit(Events.transactionsChanged);
  },
  async delete(id: string): Promise<void> {
    await webMutation(api.pwaLedger.deleteTransaction, { id });
    GlobalEvents.emit(Events.transactionsChanged);
  },
  async upsertDerivedBatch(_rows: unknown[]): Promise<void> { /* virtual on web */ },
  async softDeleteDerivedByIds(_ids: string[]): Promise<void> { /* virtual on web */ },
  async getDerivedBySourceTripExpenseIds(sourceIds: string[]): Promise<Transaction[]> {
    const set = new Set(sourceIds);
    const snap = await snapshot();
    return (snap.derivedRows ?? []).map(derivedToTransaction).filter((t: Transaction) => t.sourceTripExpenseId && set.has(t.sourceTripExpenseId));
  },
  async getDerivedBySourceTripSettlementIds(sourceIds: string[]): Promise<Transaction[]> {
    const set = new Set(sourceIds);
    const snap = await snapshot();
    return (snap.derivedRows ?? []).map(derivedToTransaction).filter((t: Transaction) => t.sourceTripSettlementId && set.has(t.sourceTripSettlementId));
  },
  async bulkSetCategory(ids: string[], categoryId: string | null): Promise<void> {
    await webMutation(api.pwaLedger.bulkSetCategory, { ids, categoryId });
    GlobalEvents.emit(Events.transactionsChanged);
  },
  async bulkDelete(ids: string[]): Promise<void> {
    await webMutation(api.pwaLedger.bulkDelete, { ids });
    GlobalEvents.emit(Events.transactionsChanged);
  },
};

// =============================================================================
// Import inbox
// =============================================================================

export const ImportInboxRepository = {
  async getPending(): Promise<ImportInboxItem[]> {
    const rows: any[] = await webQuery(api.pwaImports.listPending, {});
    return rows.map(toImportInboxItem);
  },
  async countPending(): Promise<number> {
    return webQuery(api.pwaImports.countPending, {});
  },
  async getById(id: string): Promise<ImportInboxItem | null> {
    return (await this.getPending()).find((i) => i.id === id) ?? null;
  },
  async ignore(id: string): Promise<void> {
    await webMutation(api.pwaImports.ignore, { id });
    GlobalEvents.emit(Events.importInboxChanged);
  },
  async confirm(id: string, overrides: { amountCents?: number; dateMs?: number; note?: string | null; accountId?: string | null; categoryId?: string | null; type?: TransactionType } = {}): Promise<Transaction> {
    const result: any = await webMutation(api.pwaImports.confirm, { id, ...overrides });
    GlobalEvents.emit(Events.transactionsChanged);
    GlobalEvents.emit(Events.importInboxChanged);
    if (!result.transaction) throw new Error('Confirmed transaction not found');
    return toTransaction(result.transaction);
  },
};

// =============================================================================
// Trips
// =============================================================================

export const TripRepository = {
  async getAll(includeArchived = false): Promise<Trip[]> {
    return (await tripsHydrated(includeArchived)).map(({ participants, expenses, settlements, ...t }) => t);
  },
  async getAllHydrated(includeArchived = false): Promise<Trip[]> {
    return tripsHydrated(includeArchived);
  },
  async getById(id: string): Promise<Trip | null> {
    return (await this.getAll(true)).find((t) => t.id === id) ?? null;
  },
  async getHydrated(id: string): Promise<Trip | null> {
    const row = await webQuery(api.pwaTrips.getTrip, { id });
    return row ? toHydratedTrip(row) : null;
  },
  async create(trip: Omit<Trip, 'id' | 'createdAtMs' | 'updatedAtMs' | 'sortIndex'> & { sortIndex?: number }): Promise<Trip> {
    const row = await webMutation(api.pwaTrips.createTrip, {
      name: trip.name, emoji: trip.emoji, isGroup: trip.isGroup, startDate: nullable(trip.startDate), endDate: nullable(trip.endDate), budgetCents: nullable(trip.budgetCents), deferParticipants: true,
    });
    GlobalEvents.emit(Events.tripsChanged);
    return toHydratedTrip(row);
  },
  async update(id: string, updates: Partial<Omit<Trip, 'id' | 'createdAtMs'>>): Promise<void> {
    await webMutation(api.pwaTrips.updateTrip, {
      id, name: updates.name, emoji: updates.emoji, isArchived: updates.isArchived,
      startDate: 'startDate' in updates ? updates.startDate ?? null : undefined, endDate: 'endDate' in updates ? updates.endDate ?? null : undefined,
      budgetCents: 'budgetCents' in updates ? updates.budgetCents ?? null : undefined,
    });
    GlobalEvents.emit(Events.tripsChanged);
  },
  async delete(id: string): Promise<void> {
    await webMutation(api.pwaTrips.deleteTrip, { id });
    GlobalEvents.emit(Events.tripsChanged);
  },
  async reorder(idsInOrder: string[]): Promise<void> {
    await webMutation(api.pwaTrips.reorderTrips, { idsInOrder });
    GlobalEvents.emit(Events.tripsChanged);
  },
};

export const TripParticipantRepository = {
  async getByTripId(tripId: string): Promise<TripParticipant[]> {
    return (await TripRepository.getHydrated(tripId))?.participants ?? [];
  },
  async getById(id: string): Promise<TripParticipant | null> {
    for (const t of await tripsHydrated(true)) {
      const p = t.participants?.find((x) => x.id === id);
      if (p) return p;
    }
    return null;
  },
  async create(participant: Omit<TripParticipant, 'id' | 'createdAtMs' | 'updatedAtMs'>): Promise<TripParticipant> {
    const row = await webMutation(api.pwaTrips.addParticipant, { tripId: participant.tripId, name: participant.name, colorHex: participant.colorHex, isCurrentUser: participant.isCurrentUser });
    GlobalEvents.emit(Events.tripParticipantsChanged);
    return { ...row, isCurrentUser: row.isCurrentUser === true || (row.isCurrentUser as any) === 1 } as TripParticipant;
  },
  async update(id: string, updates: Partial<Omit<TripParticipant, 'id' | 'tripId' | 'createdAtMs'>>): Promise<void> {
    await webMutation(api.pwaTrips.updateParticipant, { id, name: updates.name, colorHex: 'colorHex' in updates ? updates.colorHex ?? null : undefined, isCurrentUser: updates.isCurrentUser });
    GlobalEvents.emit(Events.tripParticipantsChanged);
  },
  async delete(id: string): Promise<void> {
    await webMutation(api.pwaTrips.removeParticipant, { id });
    GlobalEvents.emit(Events.tripParticipantsChanged);
  },
  async ensureExactlyOneCurrentUser(tripId: string): Promise<void> {
    await webMutation(api.pwaTrips.ensureCurrentUser, { tripId });
  },
};

export const TripExpenseRepository = {
  async getByTripId(tripId: string): Promise<TripExpense[]> {
    return (await TripRepository.getHydrated(tripId))?.expenses ?? [];
  },
  async getById(id: string): Promise<TripExpense | null> {
    for (const t of await tripsHydrated(true)) {
      const e = t.expenses?.find((x) => x.id === id);
      if (e) return e;
    }
    return null;
  },
  async getByTransactionId(transactionId: string): Promise<TripExpense | null> {
    for (const t of await tripsHydrated(true)) {
      const e = t.expenses?.find((x) => x.transactionId === transactionId);
      if (e) return e;
    }
    return null;
  },
  async create(expense: Omit<TripExpense, 'id' | 'createdAtMs' | 'updatedAtMs'>): Promise<TripExpense> {
    const row: any = await webMutation(api.pwaTrips.linkExpense, {
      tripId: expense.tripId, transactionId: expense.transactionId, paidByParticipantId: expense.paidByParticipantId ?? null,
      splitType: expense.splitType as SplitType, splitData: expense.splitData ?? null, computedSplits: expense.computedSplits ?? null,
    });
    GlobalEvents.emit(Events.tripExpensesChanged);
    GlobalEvents.emit(Events.transactionsChanged);
    return { id: row.id, tripId: row.tripId, transactionId: row.transactionId, paidByParticipantId: row.paidByParticipantId ?? undefined, splitType: row.splitType, splitData: row.splitData ?? undefined, computedSplits: row.computedSplits ?? undefined, createdAtMs: row.createdAtMs, updatedAtMs: row.updatedAtMs };
  },
  async update(id: string, updates: Partial<Omit<TripExpense, 'id' | 'tripId' | 'transactionId' | 'createdAtMs'>>): Promise<void> {
    await webMutation(api.pwaTrips.updateExpense, {
      tripExpenseId: id, paidByParticipantId: 'paidByParticipantId' in updates ? updates.paidByParticipantId ?? null : undefined,
      splitType: updates.splitType as SplitType | undefined, splitData: 'splitData' in updates ? updates.splitData ?? null : undefined,
    });
    GlobalEvents.emit(Events.tripExpensesChanged);
  },
  async delete(id: string): Promise<void> {
    await webMutation(api.pwaTrips.unlinkExpense, { tripExpenseId: id });
    GlobalEvents.emit(Events.tripExpensesChanged);
    GlobalEvents.emit(Events.transactionsChanged);
  },
  async getExpenseMetaByIds(expenseIds: string[]): Promise<Record<string, { tripId: string; tripEmoji: string; categoryEmoji: string | null; categoryName: string | null; amountCents: number; transactionId: string }>> {
    if (expenseIds.length === 0) return {};
    const want = new Set(expenseIds);
    const categories = await CategoryRepository.getAll();
    const catById = new Map(categories.map((c) => [c.id, c]));
    const out: Record<string, any> = {};
    for (const t of await tripsHydrated(true)) {
      for (const e of t.expenses ?? []) {
        if (!want.has(e.id)) continue;
        const cat = e.transaction?.categoryId ? catById.get(e.transaction.categoryId) : undefined;
        out[e.id] = { tripId: t.id, tripEmoji: t.emoji, categoryEmoji: cat?.emoji ?? null, categoryName: cat?.name ?? null, amountCents: Math.abs(e.transaction?.amountCents ?? 0), transactionId: e.transactionId };
      }
    }
    return out;
  },
};

export const TripSettlementRepository = {
  async getByTripId(tripId: string): Promise<TripSettlement[]> {
    return (await TripRepository.getHydrated(tripId))?.settlements ?? [];
  },
  async getById(id: string): Promise<TripSettlement | null> {
    for (const t of await tripsHydrated(true)) {
      const s = t.settlements?.find((x) => x.id === id);
      if (s) return s;
    }
    return null;
  },
  async create(settlement: Omit<TripSettlement, 'id' | 'createdAtMs' | 'updatedAtMs'>): Promise<TripSettlement> {
    const row: any = await webMutation(api.pwaTrips.createSettlement, {
      tripId: settlement.tripId, fromParticipantId: settlement.fromParticipantId, toParticipantId: settlement.toParticipantId,
      amountCents: Math.abs(settlement.amountCents), date: settlement.date, note: settlement.note ?? null,
    });
    GlobalEvents.emit(Events.tripSettlementsChanged);
    return { id: row.id, tripId: row.tripId, fromParticipantId: row.fromParticipantId, toParticipantId: row.toParticipantId, amountCents: row.amountCents, date: row.date, note: row.note ?? undefined, createdAtMs: row.createdAtMs, updatedAtMs: row.updatedAtMs };
  },
  async delete(id: string): Promise<void> {
    await webMutation(api.pwaTrips.deleteSettlement, { id });
    GlobalEvents.emit(Events.tripSettlementsChanged);
  },
  async getSettlementMetaByIds(settlementIds: string[]): Promise<Record<string, { tripId: string; tripEmoji: string }>> {
    if (settlementIds.length === 0) return {};
    const want = new Set(settlementIds);
    const out: Record<string, { tripId: string; tripEmoji: string }> = {};
    for (const t of await tripsHydrated(true)) {
      for (const s of t.settlements ?? []) if (want.has(s.id)) out[s.id] = { tripId: t.id, tripEmoji: t.emoji };
    }
    return out;
  },
};

// =============================================================================
// Settings
// =============================================================================

export const UserSettingsRepository = {
  async get(): Promise<UserSettings> {
    return toSettings(await webQuery(api.pwaPersonal.getSettings, {}));
  },
  async update(updates: Partial<Omit<UserSettings, 'updatedAtMs'>>): Promise<void> {
    await webMutation(api.pwaPersonal.updateSettings, {
      currencyCode: updates.currencyCode, hapticsEnabled: updates.hapticsEnabled,
      defaultAccountId: 'defaultAccountId' in updates ? updates.defaultAccountId ?? null : undefined,
      hasSeenOnboarding: updates.hasSeenOnboarding, syncTransactionFilters: updates.syncTransactionFilters, resetTransactionFiltersOnReopen: updates.resetTransactionFiltersOnReopen,
      transactionsFiltersJson: 'transactionsFiltersJson' in updates ? updates.transactionsFiltersJson ?? null : undefined,
      transactionsFiltersUpdatedAtMs: 'transactionsFiltersUpdatedAtMs' in updates ? updates.transactionsFiltersUpdatedAtMs ?? null : undefined,
    });
    GlobalEvents.emit(Events.userSettingsChanged);
  },
};
