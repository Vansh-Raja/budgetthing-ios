import { useState, useCallback, useEffect, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import { Trip } from '../logic/types';
import { TripRepository } from '../db/repositories';
import { waitForDatabase } from '../db/database';
import { Events, GlobalEvents } from '../events';

export function useTrips() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const skipNextFocusRefreshRef = useRef(true);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchTrips = useCallback(async () => {
    try {
      setError(null);

      // Wait for database to be ready before querying
      await waitForDatabase();

      // Fetch all trips (including archived, filtered in UI) with full details
      const data = await TripRepository.getAllHydrated(true);
      setTrips(data);
    } catch (e) {
      setError(e as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  const scheduleRefresh = useCallback(() => {
    // Coalesce multiple events in the same tick.
    if (refreshTimerRef.current !== null) return;
    refreshTimerRef.current = setTimeout(() => {
      refreshTimerRef.current = null;
      fetchTrips();
    }, 0);
  }, [fetchTrips]);

  // Initial load
  useEffect(() => {
    fetchTrips();

    return () => {
      if (refreshTimerRef.current !== null) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [fetchTrips]);

  // Re-fetch when a navigation route regains focus (not triggered by PagerView)
  useFocusEffect(
    useCallback(() => {
      if (skipNextFocusRefreshRef.current) {
        skipNextFocusRefreshRef.current = false;
        return;
      }
      fetchTrips();
    }, [fetchTrips])
  );

  // Refresh when any trip-related table changes.
  useEffect(() => {
    const unsubscribers = [
      GlobalEvents.on(Events.tripsChanged, scheduleRefresh),
      GlobalEvents.on(Events.tripParticipantsChanged, scheduleRefresh),
      GlobalEvents.on(Events.tripExpensesChanged, scheduleRefresh),
      GlobalEvents.on(Events.tripSettlementsChanged, scheduleRefresh),
      GlobalEvents.on(Events.transactionsChanged, scheduleRefresh),
    ];

    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }, [scheduleRefresh]);

  return { trips, loading, error, refresh: fetchTrips };
}
