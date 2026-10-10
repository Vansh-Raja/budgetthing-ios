/**
 * Sync boundary guards shared by the native outbox and the server.
 *
 * Derived trip rows (`trip_share`, `trip_cashflow`, `trip_settlement`) are
 * per-runtime projections. They must never be pushed to Convex, never be
 * accepted by `sync:push`, and never be surfaced by PWA read models.
 */
export const DERIVED_TRIP_SYSTEM_TYPES = ['trip_share', 'trip_cashflow', 'trip_settlement'] as const;

export type DerivedTripSystemType = (typeof DERIVED_TRIP_SYSTEM_TYPES)[number];

export function isDerivedTripSystemType(systemType: unknown): systemType is DerivedTripSystemType {
  return typeof systemType === 'string' && (DERIVED_TRIP_SYSTEM_TYPES as readonly string[]).includes(systemType);
}

/** True when a transaction row is allowed to leave a runtime through sync. */
export function isTransactionOutboundSyncable(row: { systemType?: string | null } | null | undefined): boolean {
  if (!row) return false;
  return !isDerivedTripSystemType(row.systemType ?? null);
}

/** Filters an outbound table batch; only `transactions` carries derived rows. */
export function filterOutboundRows<T extends { systemType?: string | null }>(table: string, rows: T[]): T[] {
  if (table !== 'transactions') return rows;
  return rows.filter((r) => isTransactionOutboundSyncable(r));
}
