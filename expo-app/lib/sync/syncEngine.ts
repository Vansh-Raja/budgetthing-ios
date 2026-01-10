import { useConvex } from "convex/react";
import NetInfo from "@react-native-community/netinfo";
import * as SecureStore from 'expo-secure-store';
import { syncRepository } from "../db/sync";

const LAST_PULL_SEQ_KEY = 'last_pull_seq';

/**
 * Sync engine hook.
 * 
 * Implements a local-first sync strategy:
 * 1. Push: Send all local changes marked with needsSync=1 to Convex
 * 2. Pull: Fetch remote changes since last known sequence number
 * 
 * Uses changelog-based incremental sync for efficiency.
 */
export function useSync() {
  const convex = useConvex();

  const sync = async () => {
    try {
      const netState = await NetInfo.fetch();
      if (!netState.isConnected) {
        console.log('[Sync] Offline, skipping sync');
        return;
      }

      console.log('[Sync] Starting sync...');

      // 1. Push pending changes to Convex
      const pending = await syncRepository.getPendingChanges();
      const hasPending = Object.values(pending).some(arr => arr.length > 0);

      if (hasPending) {
        const totalPending = Object.values(pending).reduce((acc, arr) => acc + arr.length, 0);
        console.log(`[Sync] Pushing ${totalPending} changes to Convex`);

        // Call the push mutation in convex/sync.ts
        await convex.mutation("sync:push" as any, pending);
        await syncRepository.markAsSynced(pending);
        console.log('[Sync] Push complete');
      }

      // 2. Pull remote changes using changelog sequence
      const lastSeqStr = await SecureStore.getItemAsync(LAST_PULL_SEQ_KEY);
      const lastSeq = lastSeqStr ? parseInt(lastSeqStr, 10) : 0;

      console.log(`[Sync] Pulling changes since sequence ${lastSeq}`);

      // Call the pull query in convex/sync.ts
      const remoteChanges = await convex.query("sync:pull" as any, { lastSeq });

      if (remoteChanges) {
        const { latestSeq, ...changesDict } = remoteChanges as any;
        const changeCount = Object.values(changesDict).reduce<number>(
          (acc, arr) => acc + (Array.isArray(arr) ? arr.length : 0),
          0
        );

        if (changeCount > 0) {
          console.log(`[Sync] Received ${changeCount} remote changes`);
          await syncRepository.applyRemoteChanges(changesDict as any);
        }

        // Update last known sequence
        if (latestSeq && latestSeq > lastSeq) {
          await SecureStore.setItemAsync(LAST_PULL_SEQ_KEY, latestSeq.toString());
          console.log(`[Sync] Updated lastSeq to ${latestSeq}`);
        }

        console.log('[Sync] Pull complete');
      }

    } catch (error) {
      console.error('[Sync] Error:', error);
      throw error; // Re-throw so caller can handle
    }
  };

  return { sync };
}
