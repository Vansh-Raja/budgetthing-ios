import { useState, useCallback, useEffect, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import { TransactionRepository, CategoryRepository, AccountRepository } from '../db/repositories';
import { Transaction, Category, Account } from '../logic/types';
import { waitForDatabase } from '../db/database';
import { Events, GlobalEvents } from '../events';

export function useRepository<T>(fetcher: () => Promise<T[]>) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // PagerView tabs don't trigger navigation focus changes, so we always do
  // an initial mount refresh. `useFocusEffect` remains useful for stacked routes.
  const skipNextFocusRefreshRef = useRef(true);

  const refresh = useCallback(async () => {
    try {
      setError(null);

      // Wait for database to be ready before querying
      await waitForDatabase();

      const result = await fetcher();
      setData(result);
    } catch (e) {
      setError(e as Error);
    } finally {
      setLoading(false);
    }
  }, [fetcher]);

  // Initial load
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Re-fetch when a navigation route regains focus (not triggered by PagerView)
  useFocusEffect(
    useCallback(() => {
      if (skipNextFocusRefreshRef.current) {
        skipNextFocusRefreshRef.current = false;
        return;
      }
      refresh();
    }, [refresh])
  );

  return { data, loading, error, refresh };
}

export function useTransactions() {
  const result = useRepository<Transaction>(TransactionRepository.getAll);

  useEffect(() => {
    return GlobalEvents.on(Events.transactionsChanged, result.refresh);
  }, [result.refresh]);

  return result;
}

export function useCategories() {
  const result = useRepository<Category>(CategoryRepository.getAll);

  useEffect(() => {
    return GlobalEvents.on(Events.categoriesChanged, result.refresh);
  }, [result.refresh]);

  return result;
}

export function useAccounts() {
  const result = useRepository<Account>(AccountRepository.getAll);

  useEffect(() => {
    return GlobalEvents.on(Events.accountsChanged, result.refresh);
  }, [result.refresh]);

  return result;
}
