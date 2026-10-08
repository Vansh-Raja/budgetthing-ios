import { useCallback, useMemo } from 'react';
import { useConvexAuth, useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import type { Trip } from '../logic/types';
import { toHydratedTrip } from '../web/mappers';

export function useTrips() {
  const { isAuthenticated } = useConvexAuth();
  const rows = useQuery(api.pwaTrips.listTrips, isAuthenticated ? { includeArchived: true } : 'skip');
  const trips = useMemo<Trip[]>(() => (rows ?? []).map(toHydratedTrip), [rows]);
  const refresh = useCallback(async () => {}, []);
  return useMemo(() => ({ trips, loading: isAuthenticated && rows === undefined, error: null as Error | null, refresh }), [trips, rows, isAuthenticated, refresh]);
}
