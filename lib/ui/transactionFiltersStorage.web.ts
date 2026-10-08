/**
 * Web adapter for transaction filter persistence.
 *
 * Filters are non-financial UI preferences (selected accounts/categories/date
 * ranges), so localStorage is acceptable. No ledger data is ever cached here.
 */
import type { TransactionsFilterState } from './transactionFilters';
import { DEFAULT_TRANSACTIONS_FILTERS, normalizeTransactionsFilters } from './transactionFilters';
import { getPreferenceStorage } from '../web/runtime';

export type StoredTransactionsFilters = {
  filters: TransactionsFilterState;
  updatedAtMs: number;
};

function safeKeySegment(input: string) {
  return input.replace(/[^A-Za-z0-9._-]/g, '_');
}

function keyForUser(userId?: string | null) {
  if (!userId) return 'budgetthing.filters.transactions.anonymous';
  return `budgetthing.filters.transactions.${safeKeySegment(userId)}`;
}

export async function loadTransactionsFiltersFromSecureStore(
  userId?: string | null
): Promise<StoredTransactionsFilters> {
  const storage = getPreferenceStorage();
  const raw = storage?.getItem(keyForUser(userId)) ?? null;
  if (!raw) return { filters: DEFAULT_TRANSACTIONS_FILTERS, updatedAtMs: 0 };

  try {
    const parsed = JSON.parse(raw) as Partial<StoredTransactionsFilters>;
    const updatedAtMs = typeof parsed.updatedAtMs === 'number' ? parsed.updatedAtMs : 0;
    const filters = parsed.filters
      ? normalizeTransactionsFilters(parsed.filters as any)
      : DEFAULT_TRANSACTIONS_FILTERS;
    return { filters, updatedAtMs };
  } catch {
    return { filters: DEFAULT_TRANSACTIONS_FILTERS, updatedAtMs: 0 };
  }
}

export async function saveTransactionsFiltersToSecureStore(
  userId: string | null | undefined,
  payload: StoredTransactionsFilters
): Promise<void> {
  const storage = getPreferenceStorage();
  if (!storage) return;
  const safePayload: StoredTransactionsFilters = {
    filters: normalizeTransactionsFilters(payload.filters),
    updatedAtMs: payload.updatedAtMs,
  };
  storage.setItem(keyForUser(userId), JSON.stringify(safePayload));
}

export async function clearTransactionsFiltersFromSecureStore(userId?: string | null): Promise<void> {
  getPreferenceStorage()?.removeItem(keyForUser(userId));
}
