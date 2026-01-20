import type { Transaction } from '../logic/types';
import { shouldRenderInTransactions } from './transactionRules';

export type TripFilterMode = 'all' | 'onlyTrip' | 'onlyNonTrip';

export type TransactionsFilterState = {
  version: 1;
  /** systemTypes that should be hidden */
  hiddenSystemTypes: string[];
  /** selected categoryIds (multi-select) */
  categoryIds: string[];
  /** include transactions with categoryId == null */
  includeUncategorized: boolean;
  /** selected accountIds (multi-select) */
  accountIds: string[];
  /** trip-only / non-trip-only */
  tripMode: TripFilterMode;
  /** if non-empty, restrict to these tripIds */
  tripIds: string[];
};

export const DEFAULT_TRANSACTIONS_FILTERS: TransactionsFilterState = {
  version: 1,
  hiddenSystemTypes: [],
  categoryIds: [],
  includeUncategorized: false,
  accountIds: [],
  tripMode: 'all',
  tripIds: [],
};

function uniqSorted(list: string[]): string[] {
  return Array.from(new Set(list.filter(Boolean))).sort();
}

export function normalizeTransactionsFilters(input: TransactionsFilterState): TransactionsFilterState {
  // Defensive: tolerate older/partial objects.
  const base: TransactionsFilterState = {
    ...DEFAULT_TRANSACTIONS_FILTERS,
    ...input,
    version: 1,
  };

  return {
    ...base,
    hiddenSystemTypes: uniqSorted(base.hiddenSystemTypes),
    categoryIds: uniqSorted(base.categoryIds),
    accountIds: uniqSorted(base.accountIds),
    tripIds: uniqSorted(base.tripIds),
  };
}

export function isTransactionsFiltersActive(filters: TransactionsFilterState): boolean {
  const f = normalizeTransactionsFilters(filters);
  return (
    f.hiddenSystemTypes.length > 0 ||
    f.categoryIds.length > 0 ||
    f.includeUncategorized ||
    f.accountIds.length > 0 ||
    f.tripMode !== 'all' ||
    f.tripIds.length > 0
  );
}

export function shouldIncludeTransaction(args: {
  tx: Transaction;
  filters: TransactionsFilterState;
  /**
   * Resolve a tripId for this transaction.
   * - Return string for trip-backed tx
   * - Return null/undefined for non-trip tx
   */
  resolveTripId: (tx: Transaction) => string | null | undefined;

  /**
   * Optional override to provide an effective categoryId (e.g. for derived rows).
   * If omitted, falls back to tx.categoryId.
   */
  resolveCategoryId?: (tx: Transaction) => string | null | undefined;
}): boolean {
  const filters = normalizeTransactionsFilters(args.filters);
  const tx = args.tx;

  // Existing global invariant for the Transactions tab.
  if (!shouldRenderInTransactions(tx)) return false;

  const systemType = tx.systemType ?? null;
  if (systemType && filters.hiddenSystemTypes.includes(systemType)) return false;

  const tripId = args.resolveTripId(tx) ?? null;
  const isTrip = !!tripId;

  if (filters.tripMode === 'onlyTrip' && !isTrip) return false;
  if (filters.tripMode === 'onlyNonTrip' && isTrip) return false;

  if (filters.tripMode !== 'onlyNonTrip' && filters.tripIds.length > 0) {
    // If the user is targeting specific trips, we require a known tripId.
    if (!tripId) return false;
    if (!filters.tripIds.includes(tripId)) return false;
  }

  if (filters.accountIds.length > 0) {
    if (systemType === 'transfer') {
      const from = tx.transferFromAccountId ?? null;
      const to = tx.transferToAccountId ?? null;
      const matches =
        (from !== null && filters.accountIds.includes(from)) ||
        (to !== null && filters.accountIds.includes(to));
      if (!matches) return false;
    } else {
      const accountId = tx.accountId ?? null;
      if (!accountId) return false;
      if (!filters.accountIds.includes(accountId)) return false;
    }
  }

  const categoryFilterActive = filters.categoryIds.length > 0 || filters.includeUncategorized;
  if (categoryFilterActive) {
    const categoryId = (args.resolveCategoryId ? args.resolveCategoryId(tx) : tx.categoryId) ?? null;
    if (categoryId) {
      if (!filters.categoryIds.includes(categoryId)) return false;
    } else {
      if (!filters.includeUncategorized) return false;
    }
  }

  return true;
}
