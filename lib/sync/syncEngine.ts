import { useCallback, useRef, useState } from "react";
import { useConvex } from "convex/react";
import { useAuth } from '@clerk/clerk-expo';
import NetInfo from "@react-native-community/netinfo";
import * as SecureStore from 'expo-secure-store';
import { syncRepository } from "../db/sync";
import { sharedTripSyncRepository } from "../db/sharedTripSync";
import { reconcileSharedTripDerivedTransactionsForUser } from "./sharedTripReconcile";
import { dedupeHighImpactCanonicalData } from "../logic/dedupe/highImpactDedupe";

export type SyncMode = 'pull' | 'push' | 'full';

export interface SyncOptions {
  mode?: SyncMode;
  reason?: string;
  /**
   * When false, sync will never call Convex mutations.
   * Useful during sign-in bootstrap/merge.
   */
  allowPush?: boolean;
}

export interface SyncResult {
  didRun: boolean;
  didPush: boolean;
  didPull: boolean;
  queued: boolean;
  latestSeq?: number;
}

function safeSecureStoreKeySegment(input: string) {
  // expo-secure-store keys must match: [A-Za-z0-9._-]+
  return input.replace(/[^A-Za-z0-9._-]/g, "_");
}

function lastPullSeqKey(userId: string) {
  // Avoid ':' and any userId characters that SecureStore rejects.
  const safeUserId = safeSecureStoreKeySegment(userId);
  return safeUserId ? `sync.last_pull_seq.${safeUserId}` : "sync.last_pull_seq";
}

function lastTripPullSeqKey(userId: string, tripId: string) {
  const safeUserId = safeSecureStoreKeySegment(userId);
  const safeTripId = safeSecureStoreKeySegment(tripId);
  return `sync.trip.last_pull_seq.${safeUserId}.${safeTripId}`;
}

function knownTripsKey(userId: string) {
  const safeUserId = safeSecureStoreKeySegment(userId);
  return `sync.trip.known_trips.${safeUserId}`;
}

function sharedTripMembershipSigKey(userId: string) {
  const safeUserId = safeSecureStoreKeySegment(userId);
  return `sync.trip.membership_sig.${safeUserId}`;
}

function membershipSignature(rows: any[]): string {
  if (!Array.isArray(rows) || rows.length === 0) return '';
  return rows
    .filter((r) => r && r.id)
    .map((r) => `${r.id}:${r.tripId}:${r.updatedAtMs ?? 0}:${r.deletedAtMs ?? ''}:${r.participantId ?? ''}`)
    .sort()
    .join('|');
}

async function registerKnownTrip(userId: string, tripId: string): Promise<void> {
  const key = knownTripsKey(userId);
  const raw = await SecureStore.getItemAsync(key);
  let list: string[] = [];
  try {
    list = raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    list = [];
  }

  if (!list.includes(tripId)) {
    const next = [...list, tripId];
    await SecureStore.setItemAsync(key, JSON.stringify(next));
  }
}

async function clearTripCursorStateForUser(userId: string): Promise<void> {
  const key = knownTripsKey(userId);
  const raw = await SecureStore.getItemAsync(key);
  let list: string[] = [];
  try {
    list = raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    list = [];
  }

  for (const tripId of list) {
    await SecureStore.deleteItemAsync(lastTripPullSeqKey(userId, tripId));
  }

  await SecureStore.deleteItemAsync(key);
}

async function getLastTripPullSeq(userId: string, tripId: string): Promise<number> {
  const value = await SecureStore.getItemAsync(lastTripPullSeqKey(userId, tripId));
  const parsed = value ? parseInt(value, 10) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

async function setLastTripPullSeq(userId: string, tripId: string, seq: number): Promise<void> {
  const safe = Number.isFinite(seq) && seq > 0 ? Math.floor(seq) : 0;
  await SecureStore.setItemAsync(lastTripPullSeqKey(userId, tripId), String(safe));
  await registerKnownTrip(userId, tripId);
}

export async function getLastPullSeq(userId: string): Promise<number> {
  const value = await SecureStore.getItemAsync(lastPullSeqKey(userId));
  const parsed = value ? parseInt(value, 10) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function setLastPullSeq(userId: string, seq: number): Promise<void> {
  const safe = Number.isFinite(seq) && seq > 0 ? Math.floor(seq) : 0;
  await SecureStore.setItemAsync(lastPullSeqKey(userId), String(safe));
}

export async function resetLastPullSeq(userId: string): Promise<void> {
  await setLastPullSeq(userId, 0);
}

export async function clearSyncStateForUser(userId: string): Promise<void> {
  await SecureStore.deleteItemAsync(lastPullSeqKey(userId));
  await clearTripCursorStateForUser(userId);
}

/**
 * Sync engine hook.
 *
 * Local-first strategy:
 * - UI reads from SQLite only.
 * - When signed in: push pending local rows (needsSync=1), then pull remote changes.
 * - When signed out/guest: never calls Convex.
 */
export function useSync() {
  const convex = useConvex();
  const { isSignedIn, userId } = useAuth();

  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncAtMs, setLastSyncAtMs] = useState<number | null>(null);
  const [lastSyncError, setLastSyncError] = useState<Error | null>(null);
  const [lastSyncReason, setLastSyncReason] = useState<string | null>(null);

  const inFlightRef = useRef<Promise<SyncResult> | null>(null);
  const queuedRef = useRef<SyncOptions | null>(null);

  const mergeQueued = (current: SyncOptions | null, next: SyncOptions): SyncOptions => {
    if (!current) return next;

    const modeA = current.mode ?? 'full';
    const modeB = next.mode ?? 'full';

    // full dominates, push+pull => full
    const mode: SyncMode = (modeA === 'full' || modeB === 'full')
      ? 'full'
      : (modeA !== modeB)
        ? 'full'
        : modeA;

    return {
      mode,
      // If any request disallows push, keep it disallowed (bootstrap safety)
      allowPush: (current.allowPush !== false) && (next.allowPush !== false),
      // Preserve the most recent reason (debug only)
      reason: next.reason ?? current.reason,
    };
  };

  const runOnce = useCallback(async (options: SyncOptions): Promise<SyncResult> => {
    if (!isSignedIn || !userId) {
      return { didRun: false, didPush: false, didPull: false, queued: false };
    }

    const mode: SyncMode = options.mode ?? 'full';
    const allowPush = options.allowPush !== false;

    const netState = await NetInfo.fetch();
    if (!netState.isConnected) {
      return { didRun: false, didPush: false, didPull: false, queued: false };
    }

    let didPush = false;
    let didPull = false;
    let latestSeq: number | undefined;

    if ((mode === 'push' || mode === 'full') && allowPush) {
      const pending = await syncRepository.getPendingChanges();
      const hasPending = Object.values(pending).some(arr => arr.length > 0);

      if (hasPending) {
        await convex.mutation("sync:push" as any, pending);
        await syncRepository.markAsSynced(pending);
        didPush = true;
      }
    }

    if (mode === 'pull' || mode === 'full') {
      const lastSeq = await getLastPullSeq(userId);
      const remoteChanges = await convex.query("sync:pull" as any, { lastSeq });

      if (remoteChanges) {
        const { latestSeq: remoteLatestSeq, ...changesDict } = remoteChanges as any;
        const changeCount = Object.values(changesDict).reduce<number>(
          (acc, arr) => acc + (Array.isArray(arr) ? arr.length : 0),
          0
        );

        if (changeCount > 0) {
          await syncRepository.applyRemoteChanges(changesDict as any);
        }

        if (typeof remoteLatestSeq === 'number') {
          latestSeq = remoteLatestSeq;
          if (remoteLatestSeq !== lastSeq) {
            await setLastPullSeq(userId, remoteLatestSeq);
          }
        }

        didPull = true;
      }
    }

    // -------------------------------------------------------------------------
    // Shared Trips v1: trip-scoped sync + derived transaction reconciliation
    // -------------------------------------------------------------------------

    let sharedTripsDidPullChanges = false;
    let sharedTripsMembershipChanged = false;

    if (mode === 'push') {
      // Push-only: avoid any membership queries or trip pulls.
      // Only push trips that have local pending shared-trip rows.
      if (allowPush) {
        const pendingTripIds = await sharedTripSyncRepository.getPendingTripIds();
        for (const tripId of pendingTripIds) {
          const pending = await sharedTripSyncRepository.getPendingChangesForTrip(tripId);
          const pushPayload = {
            sharedTrips: pending.sharedTrips,
            sharedTripParticipants: pending.sharedTripParticipants,
            sharedTripExpenses: pending.sharedTripExpenses,
            sharedTripSettlements: pending.sharedTripSettlements,
          };

          const hasPending = Object.values(pushPayload).some((arr) => Array.isArray(arr) && arr.length > 0);
          if (!hasPending) continue;

          await convex.mutation("sharedTripSync:push" as any, {
            tripId,
            ...pushPayload,
          });

          await sharedTripSyncRepository.markAsSynced({
            ...pending,
            sharedTripMembers: [],
          });
          didPush = true;
        }
      }
    } else {
      // Pull/full: memberships are the source of truth for which trips to sync.
      const memberships = await convex.query("sharedTripMembers:mine" as any, {});
      const membershipRows = Array.isArray(memberships) ? memberships : [];

      const sigKey = sharedTripMembershipSigKey(userId);
      const prevSig = (await SecureStore.getItemAsync(sigKey)) ?? '';
      const nextSig = membershipSignature(membershipRows);
      sharedTripsMembershipChanged = prevSig !== nextSig;

      if (sharedTripsMembershipChanged) {
        await SecureStore.setItemAsync(sigKey, nextSig);
        await sharedTripSyncRepository.applyRemoteMembershipRows(membershipRows);
      }

      const tripIds: string[] = membershipRows
        .filter((m: any) => m && m.tripId && m.deletedAtMs === undefined)
        .map((m: any) => m.tripId);

      const uniqueTripIds = Array.from(new Set(tripIds));

      for (const tripId of uniqueTripIds) {
        if (mode === 'full' && allowPush) {
          const pending = await sharedTripSyncRepository.getPendingChangesForTrip(tripId);
          const pushPayload = {
            sharedTrips: pending.sharedTrips,
            sharedTripParticipants: pending.sharedTripParticipants,
            sharedTripExpenses: pending.sharedTripExpenses,
            sharedTripSettlements: pending.sharedTripSettlements,
          };

          const hasPending = Object.values(pushPayload).some((arr) => Array.isArray(arr) && arr.length > 0);

          if (hasPending) {
            await convex.mutation("sharedTripSync:push" as any, {
              tripId,
              ...pushPayload,
            });

            await sharedTripSyncRepository.markAsSynced({
              ...pending,
              sharedTripMembers: [],
            });
            didPush = true;
          }
        }

        // Pull/full: fetch remote changes and apply locally.
        if (mode === 'pull' || mode === 'full') {
          const lastTripSeq = await getLastTripPullSeq(userId, tripId);
          const remoteTripChanges = await convex.query("sharedTripSync:pull" as any, { tripId, lastSeq: lastTripSeq });

          if (remoteTripChanges) {
            const { latestSeq: remoteLatestTripSeq, ...changesDict } = remoteTripChanges as any;

            const changeCount = Object.values(changesDict).reduce<number>(
              (acc, arr) => acc + (Array.isArray(arr) ? arr.length : 0),
              0
            );

            if (changeCount > 0) {
              await sharedTripSyncRepository.applyRemoteChanges(tripId, changesDict as any);
              sharedTripsDidPullChanges = true;
            }

            if (typeof remoteLatestTripSeq === 'number' && remoteLatestTripSeq !== lastTripSeq) {
              await setLastTripPullSeq(userId, tripId, remoteLatestTripSeq);
            }

            didPull = true;
          }
        }
      }

      // Reconcile derived rows only when we actually pulled something or memberships changed.
      if (sharedTripsMembershipChanged || sharedTripsDidPullChanges || mode === 'full') {
        try {
          await reconcileSharedTripDerivedTransactionsForUser(userId);
        } catch (e) {
          console.warn('[syncEngine] reconcileSharedTripDerivedTransactionsForUser failed:', e);
        }
      }
    }

    return { didRun: true, didPush, didPull, queued: false, latestSeq };
  }, [convex, isSignedIn, userId]);

  const sync = useCallback(async (options: SyncOptions = {}): Promise<SyncResult> => {
    if (!isSignedIn || !userId) {
      return { didRun: false, didPush: false, didPull: false, queued: false };
    }

    // If we're already syncing, queue and wait for the current run to finish.
    if (inFlightRef.current) {
      queuedRef.current = mergeQueued(queuedRef.current, options);
      return inFlightRef.current;
    }

    setIsSyncing(true);
    setLastSyncReason(options.reason ?? options.mode ?? 'full');

    const promise = (async () => {
      let latestResult: SyncResult = { didRun: false, didPush: false, didPull: false, queued: false };
      try {
        // Run at least once, then drain any queued sync requests.
        let nextOptions: SyncOptions | null = options;
        while (nextOptions) {
          queuedRef.current = null;
          latestResult = await runOnce(nextOptions);

          // If any sync requests came in while we were running, handle them now.
          // Note: `queuedRef.current` can be mutated by other callers while we await.
          const queued = queuedRef.current as SyncOptions | null;
          if (queued) {
            // Mark that a follow-up was queued.
            nextOptions = { ...queued, reason: queued.reason ?? 'queued' };
          } else {
            nextOptions = null;
          }
        }

        // If we pulled anything, run a conservative dedupe pass to prevent
        // old buggy data from permanently corrupting derived totals.
        if (latestResult.didPull && userId) {
          try {
            await dedupeHighImpactCanonicalData({ userId });
          } catch (e) {
            console.warn('[syncEngine] dedupeHighImpactCanonicalData failed:', e);
          }
        }

        setLastSyncAtMs(Date.now());
        setLastSyncError(null);
        return latestResult;
      } catch (error) {
        setLastSyncError(error as Error);
        throw error;
      } finally {
        setIsSyncing(false);
        inFlightRef.current = null;
      }
    })();

    inFlightRef.current = promise;
    return promise;
  }, [isSignedIn, userId, runOnce]);

  return {
    sync,
    isSyncing,
    lastSyncAtMs,
    lastSyncError,
    lastSyncReason,
  };
}
