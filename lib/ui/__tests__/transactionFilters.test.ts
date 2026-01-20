import type { Transaction } from '../../logic/types';
import {
  DEFAULT_TRANSACTIONS_FILTERS,
  shouldIncludeTransaction,
} from '../transactionFilters';

function tx(partial: Partial<Transaction>): Transaction {
  return {
    id: partial.id ?? 'tx1',
    amountCents: partial.amountCents ?? 1000,
    date: partial.date ?? 1,
    type: partial.type ?? 'expense',
    systemType: partial.systemType,
    accountId: partial.accountId,
    categoryId: partial.categoryId,
    transferFromAccountId: partial.transferFromAccountId,
    transferToAccountId: partial.transferToAccountId,
    tripExpenseId: partial.tripExpenseId,
    sourceTripExpenseId: partial.sourceTripExpenseId,
    sourceTripSettlementId: partial.sourceTripSettlementId,
    createdAtMs: partial.createdAtMs ?? 1,
    updatedAtMs: partial.updatedAtMs ?? 1,
    deletedAtMs: partial.deletedAtMs,
    note: partial.note,
  };
}

const resolveTripId = (tripIdByTxId: Record<string, string | null>) => (t: Transaction) => tripIdByTxId[t.id] ?? null;

describe('transactionFilters', () => {
  it('always hides trip_cashflow (Transactions tab invariant)', () => {
    const ok = shouldIncludeTransaction({
      tx: tx({ id: 'a', systemType: 'trip_cashflow', accountId: 'acc1' }),
      filters: DEFAULT_TRANSACTIONS_FILTERS,
      resolveTripId: resolveTripId({ a: 'trip1' }),
    });
    expect(ok).toBe(false);
  });

  it('hides selected system types', () => {
    const ok = shouldIncludeTransaction({
      tx: tx({ id: 'a', systemType: 'transfer', transferFromAccountId: 'acc1', transferToAccountId: 'acc2' }),
      filters: { ...DEFAULT_TRANSACTIONS_FILTERS, hiddenSystemTypes: ['transfer'] },
      resolveTripId: resolveTripId({ a: null }),
    });
    expect(ok).toBe(false);
  });

  it('category filter supports Uncategorized pseudo-category', () => {
    const categorized = shouldIncludeTransaction({
      tx: tx({ id: 'a', categoryId: 'cat1' }),
      filters: { ...DEFAULT_TRANSACTIONS_FILTERS, categoryIds: ['cat1'], includeUncategorized: false },
      resolveTripId: resolveTripId({ a: null }),
    });
    expect(categorized).toBe(true);

    const uncategorizedExcluded = shouldIncludeTransaction({
      tx: tx({ id: 'b', categoryId: undefined }),
      filters: { ...DEFAULT_TRANSACTIONS_FILTERS, categoryIds: ['cat1'], includeUncategorized: false },
      resolveTripId: resolveTripId({ b: null }),
    });
    expect(uncategorizedExcluded).toBe(false);

    const uncategorizedIncluded = shouldIncludeTransaction({
      tx: tx({ id: 'c', categoryId: undefined }),
      filters: { ...DEFAULT_TRANSACTIONS_FILTERS, categoryIds: ['cat1'], includeUncategorized: true },
      resolveTripId: resolveTripId({ c: null }),
    });
    expect(uncategorizedIncluded).toBe(true);
  });

  it('category filter can match derived category via resolver', () => {
    const ok = shouldIncludeTransaction({
      tx: tx({ id: 'a', systemType: 'trip_share', categoryId: undefined }),
      filters: { ...DEFAULT_TRANSACTIONS_FILTERS, categoryIds: ['cat_food'], includeUncategorized: false },
      resolveTripId: resolveTripId({ a: 'trip1' }),
      resolveCategoryId: () => 'cat_food',
    });
    expect(ok).toBe(true);
  });

  it('account filter matches either side of a transfer', () => {
    const ok = shouldIncludeTransaction({
      tx: tx({
        id: 'a',
        systemType: 'transfer',
        transferFromAccountId: 'acc1',
        transferToAccountId: 'acc2',
      }),
      filters: { ...DEFAULT_TRANSACTIONS_FILTERS, accountIds: ['acc2'] },
      resolveTripId: resolveTripId({ a: null }),
    });
    expect(ok).toBe(true);
  });

  it('trip mode filters trips vs non-trips', () => {
    const onlyTrip = shouldIncludeTransaction({
      tx: tx({ id: 'a' }),
      filters: { ...DEFAULT_TRANSACTIONS_FILTERS, tripMode: 'onlyTrip' },
      resolveTripId: resolveTripId({ a: 'trip1' }),
    });
    expect(onlyTrip).toBe(true);

    const onlyTripRejectsNonTrip = shouldIncludeTransaction({
      tx: tx({ id: 'b' }),
      filters: { ...DEFAULT_TRANSACTIONS_FILTERS, tripMode: 'onlyTrip' },
      resolveTripId: resolveTripId({ b: null }),
    });
    expect(onlyTripRejectsNonTrip).toBe(false);

    const onlyNonTripRejectsTrip = shouldIncludeTransaction({
      tx: tx({ id: 'c' }),
      filters: { ...DEFAULT_TRANSACTIONS_FILTERS, tripMode: 'onlyNonTrip' },
      resolveTripId: resolveTripId({ c: 'trip1' }),
    });
    expect(onlyNonTripRejectsTrip).toBe(false);
  });

  it('tripIds restrict to specific trips and require known tripId', () => {
    const ok = shouldIncludeTransaction({
      tx: tx({ id: 'a' }),
      filters: { ...DEFAULT_TRANSACTIONS_FILTERS, tripMode: 'all', tripIds: ['trip1'] },
      resolveTripId: resolveTripId({ a: 'trip1' }),
    });
    expect(ok).toBe(true);

    const wrongTrip = shouldIncludeTransaction({
      tx: tx({ id: 'b' }),
      filters: { ...DEFAULT_TRANSACTIONS_FILTERS, tripMode: 'all', tripIds: ['trip1'] },
      resolveTripId: resolveTripId({ b: 'trip2' }),
    });
    expect(wrongTrip).toBe(false);

    const unknownTripId = shouldIncludeTransaction({
      tx: tx({ id: 'c' }),
      filters: { ...DEFAULT_TRANSACTIONS_FILTERS, tripMode: 'all', tripIds: ['trip1'] },
      resolveTripId: () => null,
    });
    expect(unknownTripId).toBe(false);
  });
});
