import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@clerk/clerk-expo';
import { useFocusEffect } from 'expo-router';

import { waitForDatabase } from '../db/database';
import { SharedTripRepository, SharedTripSummary } from '../db/sharedTripRepositories';
import { Events, GlobalEvents } from '../events';

export function useSharedTrips() {
  const { isSignedIn, userId } = useAuth();

  const [trips, setTrips] = useState<SharedTripSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const skipNextFocusRefreshRef = useRef(true);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchTrips = useCallback(async () => {
    try {
      setError(null);
      await waitForDatabase();

      if (!isSignedIn || !userId) {
        setTrips([]);
        return;
      }

      const data = await SharedTripRepository.getAllSummariesForUser(userId);
      setTrips(data);
    } catch (e) {
      setError(e as Error);
    } finally {
      setLoading(false);
    }
  }, [isSignedIn, userId]);

  const scheduleRefresh = useCallback(() => {
    if (refreshTimerRef.current !== null) return;
    refreshTimerRef.current = setTimeout(() => {
      refreshTimerRef.current = null;
      fetchTrips();
    }, 0);
  }, [fetchTrips]);

  useEffect(() => {
    fetchTrips();

    return () => {
      if (refreshTimerRef.current !== null) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [fetchTrips]);

  useFocusEffect(
    useCallback(() => {
      if (skipNextFocusRefreshRef.current) {
        skipNextFocusRefreshRef.current = false;
        return;
      }
      fetchTrips();
    }, [fetchTrips])
  );

  useEffect(() => {
    const unsub = GlobalEvents.on(Events.tripsChanged, scheduleRefresh);
    return () => {
      unsub();
    };
  }, [scheduleRefresh]);

  return { trips, loading, error, refresh: fetchTrips };
}
