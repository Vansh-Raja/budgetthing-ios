import type { Trip } from '../logic/types';
// Derived rows are computed on the server for the PWA; nothing to reconcile locally.
export async function reconcileLocalTripDerivedTransactionsForTrip(_trip: Trip): Promise<void> {}
export async function reconcileLocalTripDerivedTransactionsForAllGroupTrips(): Promise<void> {}
