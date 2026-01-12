import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useAuth } from '@clerk/clerk-expo';
import { useQuery } from 'convex/react';

import { waitForDatabase } from '../db/database';
import { seedDatabaseIfNeeded } from '../db/seed';
import { Events, GlobalEvents } from '../events';
import { dedupeSeededDefaults, getLocalCounts } from './bootstrap';
import { clearSyncStateForUser, getLastPullSeq, resetLastPullSeq, useSync } from './syncEngine';

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
  const { isSignedIn, userId } = useAuth();
  const { sync, isSyncing, lastSyncAtMs, lastSyncError, lastSyncReason } = useSync();

  const [isBootstrapping, setIsBootstrapping] = useState(false);
  const allowPushRef = useRef(false);
  const bootstrappedUserRef = useRef<string | null>(null);

  // Used to avoid firing resume-triggered sync on initial mount.
  const lastAppStateRef = useRef<AppStateStatus>(AppState.currentState ?? 'active');

  // Debounce timers
  const pushDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Convex "poke": subscribe to latestSeq when signed in.
  // Passing `undefined` args skips the query entirely when signed out.
  const latestSeq = useQuery("sync:latestSeq" as any, isSignedIn ? {} : undefined);
  const lastHandledSeqRef = useRef<number | null>(null);

  // Track latestSeq per user. If user switches, reset so we don't suppress pulls.
  useEffect(() => {
    lastHandledSeqRef.current = null;
  }, [userId]);

  const clearPushDebounce = () => {
    if (pushDebounceRef.current) {
      clearTimeout(pushDebounceRef.current);
      pushDebounceRef.current = null;
    }
  };

  const schedulePush = useCallback((reason: string) => {
    if (!allowPushRef.current) return;

    clearPushDebounce();
    pushDebounceRef.current = setTimeout(() => {
      pushDebounceRef.current = null;
      sync({ mode: 'push', reason, allowPush: true }).catch((e) => {
        console.error('[SyncProvider] Push error:', e);
      });
    }, 1200);
  }, [sync]);

  const syncNow = useCallback(async (reason = 'manual') => {
    if (!isSignedIn || !userId) {
      // Guest mode: re-query local DB via events.
      GlobalEvents.emit(Events.transactionsChanged);
      GlobalEvents.emit(Events.accountsChanged);
      GlobalEvents.emit(Events.categoriesChanged);
      GlobalEvents.emit(Events.tripsChanged);
      GlobalEvents.emit(Events.userSettingsChanged);
      return;
    }

    await sync({ mode: 'full', reason, allowPush: allowPushRef.current });
  }, [isSignedIn, userId, sync]);

  // ---------------------------------------------------------------------------
  // Bootstrap behavior
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      await waitForDatabase();
      if (cancelled) return;

      // Guest mode: ensure defaults exist locally.
      if (!isSignedIn || !userId) {
        bootstrappedUserRef.current = null;
        allowPushRef.current = false;
        clearPushDebounce();

        try {
          await seedDatabaseIfNeeded();
        } catch (e) {
          console.warn('[SyncProvider] Guest seed failed:', e);
        }
        return;
      }

      // Signed in: bootstrap once per user.
      if (bootstrappedUserRef.current === userId) {
        return;
      }

      bootstrappedUserRef.current = userId;
      allowPushRef.current = false;
      clearPushDebounce();

      setIsBootstrapping(true);

      try {
        // If SecureStore survived uninstall/reinstall, lastSeq may be >0 while DB is empty.
        // In that case, reset to 0 to force a full pull.
        const before = await getLocalCounts();
        const localEmpty = before.accounts === 0 && before.categories === 0 && before.transactions === 0 && before.trips === 0;
        const storedSeq = await getLastPullSeq(userId);
        if (localEmpty && storedSeq > 0) {
          await resetLastPullSeq(userId);
        }

        // Pull first (never push during bootstrap) so we can merge/dedupe safely.
        await sync({ mode: 'pull', reason: 'bootstrap_pull', allowPush: false });

        // Conservative dedupe for known defaults + system categories/accounts.
        await dedupeSeededDefaults();

        // If we still have no data after pulling, this is likely a brand new account.
        // Seed defaults locally and then push.
        const afterPull = await getLocalCounts();
        const stillEmpty = afterPull.accounts === 0 && afterPull.categories === 0 && afterPull.transactions === 0 && afterPull.trips === 0;
        if (stillEmpty) {
          await seedDatabaseIfNeeded();
        }

        // Now enable push and do a full sync to upload any local-only data and reconcile.
        allowPushRef.current = true;
        await sync({ mode: 'full', reason: 'bootstrap_full', allowPush: true });
      } catch (e) {
        console.error('[SyncProvider] Bootstrap failed:', e);
        // If something went wrong, keep push disabled to avoid accidental duplicates.
        allowPushRef.current = false;
      } finally {
        if (!cancelled) {
          setIsBootstrapping(false);
        }
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [isSignedIn, userId, sync]);

  // ---------------------------------------------------------------------------
  // Triggers (foreground-only)
  // ---------------------------------------------------------------------------

  // App resume → full sync (push if allowed)
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      const prev = lastAppStateRef.current;
      lastAppStateRef.current = nextState;

      if (nextState !== 'active') return;
      if (prev === 'active') return;
      if (!isSignedIn || !userId) return;
      if (isBootstrapping) return;

      sync({ mode: 'full', reason: 'resume', allowPush: allowPushRef.current }).catch((e) => {
        console.error('[SyncProvider] Resume sync failed:', e);
      });
    });

    return () => {
      sub.remove();
    };
  }, [isSignedIn, userId, isBootstrapping, sync]);

  // Connectivity regained → full sync
  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      if (!state.isConnected) return;
      if (!isSignedIn || !userId) return;
      if (isBootstrapping) return;

      sync({ mode: 'full', reason: 'online', allowPush: allowPushRef.current }).catch((e) => {
        console.error('[SyncProvider] Online sync failed:', e);
      });
    });

    return () => {
      unsub();
    };
  }, [isSignedIn, userId, isBootstrapping, sync]);

  // Local DB changes → debounced push
  useEffect(() => {
    if (!isSignedIn || !userId) return;
    if (isBootstrapping) return;

    const unsubscribers = [
      GlobalEvents.on(Events.transactionsChanged, () => schedulePush('local_change')),
      GlobalEvents.on(Events.accountsChanged, () => schedulePush('local_change')),
      GlobalEvents.on(Events.categoriesChanged, () => schedulePush('local_change')),
      GlobalEvents.on(Events.tripsChanged, () => schedulePush('local_change')),
      GlobalEvents.on(Events.tripParticipantsChanged, () => schedulePush('local_change')),
      GlobalEvents.on(Events.tripExpensesChanged, () => schedulePush('local_change')),
      GlobalEvents.on(Events.tripSettlementsChanged, () => schedulePush('local_change')),
      GlobalEvents.on(Events.userSettingsChanged, () => schedulePush('local_change')),
    ];

    return () => {
      unsubscribers.forEach((u) => u());
    };
  }, [isSignedIn, userId, isBootstrapping, schedulePush]);

  // Periodic pull (5 minutes) while signed in
  useEffect(() => {
    if (!isSignedIn || !userId) return;
    if (isBootstrapping) return;

    const interval = setInterval(() => {
      sync({ mode: 'pull', reason: 'periodic_pull', allowPush: false }).catch((e) => {
        console.error('[SyncProvider] Periodic pull failed:', e);
      });
    }, 5 * 60 * 1000);

    return () => {
      clearInterval(interval);
    };
  }, [isSignedIn, userId, isBootstrapping, sync]);

  // Convex poke (latestSeq) → pull immediately
  useEffect(() => {
    if (!isSignedIn || !userId) return;
    if (isBootstrapping) return;

    if (latestSeq === undefined || latestSeq === null) return;

    // Avoid pulling on initial subscription value.
    if (lastHandledSeqRef.current === null) {
      lastHandledSeqRef.current = latestSeq;
      return;
    }

    if (latestSeq <= lastHandledSeqRef.current) return;
    lastHandledSeqRef.current = latestSeq;

    sync({ mode: 'pull', reason: 'poke', allowPush: false }).catch((e) => {
      console.error('[SyncProvider] Poke pull failed:', e);
    });
  }, [isSignedIn, userId, isBootstrapping, latestSeq, sync]);

  // Reset per-user sync state when switching users (rare) or sign-out.
  useEffect(() => {
    if (!userId) return;

    return () => {
      // On unmount or userId change, clear debounce timer.
      clearPushDebounce();
    };
  }, [userId]);

  const value = useMemo<SyncContextValue>(() => ({
    syncNow,
    isSyncing,
    lastSyncAtMs,
    lastSyncError,
    lastSyncReason,
    isBootstrapping,
  }), [syncNow, isSyncing, lastSyncAtMs, lastSyncError, lastSyncReason, isBootstrapping]);

  return (
    <SyncContext.Provider value={value}>
      {children}
    </SyncContext.Provider>
  );
}

export function useSyncStatus() {
  const ctx = useContext(SyncContext);
  if (!ctx) {
    throw new Error('useSyncStatus must be used within a SyncProvider');
  }
  return ctx;
}

export async function resetSyncStateForCurrentUser(userId: string | null | undefined) {
  if (!userId) return;
  await clearSyncStateForUser(userId);
}
