import { useMemo } from 'react';
import { useConvexAuth, useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import type { Trip } from '../logic/types';
import { sharedTripToTrip } from '../web/mappers';

/**
 * Live shared-trip detail on web: another member's expenses and settlements arrive
 * through the Convex subscription (web has no sync engine to emit tripsChanged).
 * undefined = still loading; null = not found or no longer a member.
 */
export function useLiveSharedTrip(tripId: string): Trip | null | undefined {
  const { isAuthenticated } = useConvexAuth();
  const row = useQuery(api.pwaSharedTrips.watchTrip, isAuthenticated && tripId ? { tripId } : 'skip');
  return useMemo(() => (row === undefined ? undefined : row ? sharedTripToTrip(row) : null), [row]);
}
