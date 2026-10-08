/**
 * Web adapter for user settings: live from the ledger snapshot, writes go to
 * the canonical settings command. Onboarding is always complete on web.
 */
import React, { createContext, useCallback, useContext, useMemo } from 'react';
import { useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import type { UserSettings } from '../logic/types';
import { toSettings } from '../web/mappers';
import { useLedgerSnapshot } from './useData.web';

interface UserSettingsContextType {
  settings: UserSettings | null;
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  updateSettings: (updates: Partial<UserSettings>) => Promise<void>;
}

const UserSettingsContext = createContext<UserSettingsContextType | undefined>(undefined);

export function UserSettingsProvider({ children }: { children: React.ReactNode }) {
  const { snapshot, loading } = useLedgerSnapshot();
  const update = useMutation(api.pwaPersonal.updateSettings);
  const settings = useMemo(() => toSettings(snapshot?.settings ?? null), [snapshot]);

  const refresh = useCallback(async () => {}, []);
  const updateSettings = useCallback(async (updates: Partial<UserSettings>) => {
    await update({
      currencyCode: updates.currencyCode, hapticsEnabled: updates.hapticsEnabled,
      defaultAccountId: 'defaultAccountId' in updates ? updates.defaultAccountId ?? null : undefined,
      hasSeenOnboarding: updates.hasSeenOnboarding, syncTransactionFilters: updates.syncTransactionFilters, resetTransactionFiltersOnReopen: updates.resetTransactionFiltersOnReopen,
      transactionsFiltersJson: 'transactionsFiltersJson' in updates ? updates.transactionsFiltersJson ?? null : undefined,
      transactionsFiltersUpdatedAtMs: 'transactionsFiltersUpdatedAtMs' in updates ? updates.transactionsFiltersUpdatedAtMs ?? null : undefined,
    });
  }, [update]);

  const value = useMemo(() => ({ settings, loading, error: null, refresh, updateSettings }), [settings, loading, refresh, updateSettings]);
  return <UserSettingsContext.Provider value={value}>{children}</UserSettingsContext.Provider>;
}

export function useUserSettings() {
  const context = useContext(UserSettingsContext);
  if (context === undefined) throw new Error('useUserSettings must be used within a UserSettingsProvider');
  return context;
}
