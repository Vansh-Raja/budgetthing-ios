// Web adapter: no outbox, no pull sequence, no SecureStore.
export type SyncMode = 'pull' | 'push' | 'full';
export async function getLastPullSeq(_userId: string): Promise<number> { return 0; }
export async function setLastPullSeq(_userId: string, _seq: number): Promise<void> {}
export async function resetLastPullSeq(_userId: string): Promise<void> {}
export async function clearSyncStateForUser(_userId: string): Promise<void> {}
export function useSync() {
  return { sync: async (_opts?: unknown) => {}, isSyncing: false, lastSyncAtMs: null as number | null, lastSyncError: null as Error | null, lastSyncReason: null as string | null };
}
