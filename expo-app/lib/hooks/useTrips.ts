import { useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { Trip } from '../logic/types';
import { TripRepository } from '../db/repositories';
import { waitForDatabase } from '../db/database';

export function useTrips() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchTrips = useCallback(async () => {
    try {
      setError(null);

      // Wait for database to be ready before querying
      await waitForDatabase();

      // Fetch all trips (including archived, filtered in UI) with full details
      const data = await TripRepository.getAllHydrated(true);
      setTrips(data);
    } catch (e) {
      console.log('Trip fetch pending (db initializing):', e);
      setError(e as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchTrips();
    }, [fetchTrips])
  );

  return { trips, loading, error, refresh: fetchTrips };
}
