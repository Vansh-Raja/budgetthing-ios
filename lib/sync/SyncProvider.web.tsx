/**
 * Web adapter: the PWA has no local-first sync engine. Every read is a live
 * Convex subscription and every write is a server mutation, so "sync" is a
 * no-op. Exposes the same context shape screens already consume.
 */
import React, { createContext, useContext, useMemo } from 'react';

interface SyncContextValue {
  syncNow: (reason?: string) => Promise<void>;
  isSyncing: boolean;
  lastSyncAtMs: number | null;
  lastSyncError: Error | null;
  lastSyncReason: string | null;
  isBootstrapping: boolean;
}

const SyncContext = createContext<SyncContextValue | undefined>(undefined);

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const value = useMemo<SyncContextValue>(
    () => ({ syncNow: async () => {}, isSyncing: false, lastSyncAtMs: null, lastSyncError: null, lastSyncReason: null, isBootstrapping: false }),
    []
  );
  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSyncStatus() {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSyncStatus must be used within a SyncProvider');
  return ctx;
}

export async function resetSyncStateForCurrentUser(_userId: string | null | undefined) {}
