import type { Trip } from '../logic/types';

/**
 * Live shared-trip detail. Native refreshes through sync events (tripsChanged), so
 * this is a no-op there; the web sibling subscribes to the server read model.
 */
export function useLiveSharedTrip(_tripId: string): Trip | null | undefined {
  return undefined;
}
