import { useCallback, useMemo } from 'react';
import { useConvexAuth, useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import type { SharedTripSummary } from '../db/sharedTripRepositories';

export function useSharedTrips() {
  const { isAuthenticated } = useConvexAuth();
  const rows = useQuery(api.pwaSharedTrips.listMine, isAuthenticated ? {} : 'skip');
  const trips = useMemo<SharedTripSummary[]>(
    () => (rows ?? []).map((r: any) => ({ id: r.id, name: r.name, emoji: r.emoji, currencyCode: r.currencyCode, updatedAtMs: r.updatedAtMs, totalSpentCents: r.totalSpentCents ?? 0, participantCount: r.participantCount ?? 0 })),
    [rows]
  );
  const refresh = useCallback(async () => {}, []);
  return useMemo(() => ({ trips, loading: isAuthenticated && rows === undefined, error: null as Error | null, refresh }), [trips, rows, isAuthenticated, refresh]);
}
