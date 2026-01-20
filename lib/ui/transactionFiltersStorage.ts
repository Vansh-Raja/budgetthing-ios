import * as SecureStore from 'expo-secure-store';
import type { TransactionsFilterState } from './transactionFilters';
import { DEFAULT_TRANSACTIONS_FILTERS, normalizeTransactionsFilters } from './transactionFilters';

export type StoredTransactionsFilters = {
  filters: TransactionsFilterState;
  updatedAtMs: number;
};

function safeKeySegment(input: string) {
  // expo-secure-store keys must match: [A-Za-z0-9._-]+
  return input.replace(/[^A-Za-z0-9._-]/g, '_');
}

function keyForUser(userId?: string | null) {
  if (!userId) return 'filters.transactions.guest';
  return `filters.transactions.${safeKeySegment(userId)}`;
}

export async function loadTransactionsFiltersFromSecureStore(userId?: string | null): Promise<StoredTransactionsFilters> {
  const key = keyForUser(userId);
  const raw = await SecureStore.getItemAsync(key);

  if (!raw) {
    return { filters: DEFAULT_TRANSACTIONS_FILTERS, updatedAtMs: 0 };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<StoredTransactionsFilters>;
    const updatedAtMs = typeof parsed.updatedAtMs === 'number' ? parsed.updatedAtMs : 0;
    const filters = parsed.filters ? normalizeTransactionsFilters(parsed.filters as any) : DEFAULT_TRANSACTIONS_FILTERS;
    return { filters, updatedAtMs };
  } catch {
    return { filters: DEFAULT_TRANSACTIONS_FILTERS, updatedAtMs: 0 };
  }
}

export async function saveTransactionsFiltersToSecureStore(
  userId: string | null | undefined,
  payload: StoredTransactionsFilters
): Promise<void> {
  const key = keyForUser(userId);
  const safePayload: StoredTransactionsFilters = {
    filters: normalizeTransactionsFilters(payload.filters),
    updatedAtMs: payload.updatedAtMs,
  };
  await SecureStore.setItemAsync(key, JSON.stringify(safePayload));
}

export async function clearTransactionsFiltersFromSecureStore(userId?: string | null): Promise<void> {
  const key = keyForUser(userId);
  await SecureStore.deleteItemAsync(key);
}
