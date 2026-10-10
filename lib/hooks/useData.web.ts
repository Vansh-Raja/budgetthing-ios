/**
 * Web adapter for the personal-ledger hooks: one realtime Convex subscription
 * (`pwaPersonal.getSnapshot`, shared across hooks) mapped to native shapes.
 * Derived trip rows arrive virtual from the server and are merged exactly like
 * native's local derived rows.
 */
import { useCallback, useMemo } from 'react';
import { useConvexAuth, useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import type { Account, Category, Transaction } from '../logic/types';
import { mergeLedger, toAccount, toCategory } from '../web/mappers';

interface RepositoryResult<T> {
  data: T[];
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

export function useLedgerSnapshot(): { snapshot: any | undefined; loading: boolean } {
  const { isAuthenticated } = useConvexAuth();
  const snapshot = useQuery(api.pwaPersonal.getSnapshot, isAuthenticated ? {} : 'skip');
  return { snapshot, loading: isAuthenticated && snapshot === undefined };
}

export function useRepository<T>(_fetcher: () => Promise<T[]>): RepositoryResult<T> {
  const refresh = useCallback(async () => {}, []);
  return useMemo(() => ({ data: [] as T[], loading: false, error: null, refresh }), [refresh]);
}

export function useTransactions(): RepositoryResult<Transaction> {
  const { snapshot, loading } = useLedgerSnapshot();
  const data = useMemo(() => mergeLedger(snapshot), [snapshot]);
  const refresh = useCallback(async () => {}, []);
  return useMemo(() => ({ data, loading, error: null, refresh }), [data, loading, refresh]);
}

export function useCategories(): RepositoryResult<Category> {
  const { snapshot, loading } = useLedgerSnapshot();
  const data = useMemo(() => (snapshot?.categories ?? []).map(toCategory), [snapshot]);
  const refresh = useCallback(async () => {}, []);
  return useMemo(() => ({ data, loading, error: null, refresh }), [data, loading, refresh]);
}

export function useAccounts(): RepositoryResult<Account> {
  const { snapshot, loading } = useLedgerSnapshot();
  const data = useMemo(() => (snapshot?.accounts ?? []).map(toAccount), [snapshot]);
  const refresh = useCallback(async () => {}, []);
  return useMemo(() => ({ data, loading, error: null, refresh }), [data, loading, refresh]);
}
