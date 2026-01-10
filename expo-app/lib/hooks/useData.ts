import { useState, useCallback, useEffect } from 'react';
import { useFocusEffect } from 'expo-router';
import { Alert } from 'react-native';
import { TransactionRepository, CategoryRepository, AccountRepository } from '../db/repositories';
import { Transaction, Category, Account } from '../logic/types';
import { isDatabaseReady, waitForDatabase } from '../db/database';

import { GlobalEvents } from '../events';

export function useRepository<T>(fetcher: () => Promise<T[]>) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);

      // Wait for database to be ready before querying
      await waitForDatabase();

      const result = await fetcher();
      setData(result);
    } catch (e) {
      console.log('Data fetch pending (db initializing):', e);
      setError(e as Error);
      // Don't spam logs - this is expected during startup
    } finally {
      setLoading(false);
    }
  }, [fetcher]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  return { data, loading, error, refresh };
}

export function useTransactions() {
  const result = useRepository<Transaction>(TransactionRepository.getAll);

  useEffect(() => {
    return GlobalEvents.on('transactions_changed', result.refresh);
  }, [result.refresh]);

  return result;
}

export function useCategories() {
  return useRepository<Category>(CategoryRepository.getAll);
}

export function useAccounts() {
  return useRepository<Account>(AccountRepository.getAll);
}
