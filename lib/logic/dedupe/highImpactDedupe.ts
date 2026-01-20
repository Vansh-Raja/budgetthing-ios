import { queryAll, run, withTransaction } from '@/lib/db/database';
import { TABLES } from '@/lib/db/schema';
import { TripRepository } from '@/lib/db/repositories';
import { reconcileLocalTripDerivedTransactionsForTrip } from '@/lib/sync/localTripReconcile';
import { reconcileSharedTripDerivedTransactionsForUser } from '@/lib/sync/sharedTripReconcile';
import { Events, GlobalEvents } from '@/lib/events';

type DuplicateGroup<T> = {
  key: string;
  rows: T[];
};

function bucket5s(ms: number) {
  return Math.floor(ms / 5000);
}

function groupByKey<T>(rows: T[], keyFn: (row: T) => string): DuplicateGroup<T>[] {
  const map = new Map<string, T[]>();
  for (const r of rows) {
    const key = keyFn(r);
    const existing = map.get(key);
    if (existing) existing.push(r);
    else map.set(key, [r]);
  }
  const groups: DuplicateGroup<T>[] = [];
  for (const [key, list] of map.entries()) {
    if (list.length > 1) groups.push({ key, rows: list });
  }
  return groups;
}

function pickCanonical<T extends { createdAtMs: number; updatedAtMs: number }>(rows: T[]): T {
  return rows
    .slice()
    .sort((a, b) => (a.createdAtMs - b.createdAtMs) || (a.updatedAtMs - b.updatedAtMs))[0];
}

async function softDeleteRows(table: string, ids: string[]) {
  if (ids.length === 0) return;
  const now = Date.now();
  const placeholders = ids.map(() => '?').join(',');
  await run(
    `UPDATE ${table}
     SET deletedAtMs = ?, updatedAtMs = ?, needsSync = 1, syncVersion = syncVersion + 1
     WHERE id IN (${placeholders}) AND deletedAtMs IS NULL`,
    [now, now, ...ids]
  );
}

export async function dedupeHighImpactCanonicalData(options: { userId?: string | null } = {}) {
  const { userId } = options;

  const affectedLocalTripIds = new Set<string>();
  let affectedSharedTrips = false;
  let didDeleteLocalSettlements = false;
  let didDeleteSharedSettlements = false;
  let didDeleteSharedExpenses = false;
  let didDeleteSystemTx = false;

  await withTransaction(async () => {
    // -----------------------------------------------------------------------
    // Local trip settlements
    // -----------------------------------------------------------------------
    const localSettlements = await queryAll<{
      id: string;
      tripId: string;
      fromParticipantId: string;
      toParticipantId: string;
      amountCents: number;
      date: number;
      note: string | null;
      createdAtMs: number;
      updatedAtMs: number;
    }>(
      `SELECT id, tripId, fromParticipantId, toParticipantId, amountCents, date, note, createdAtMs, updatedAtMs
       FROM ${TABLES.TRIP_SETTLEMENTS}
       WHERE deletedAtMs IS NULL`
    );

    const localSettlementGroups = groupByKey(localSettlements, (s) => {
      const note = (s.note ?? '').trim();
      return [
        s.tripId,
        s.fromParticipantId,
        s.toParticipantId,
        String(Math.abs(s.amountCents)),
        String(bucket5s(s.date)),
        note,
      ].join('|');
    });

    for (const g of localSettlementGroups) {
      const canonical = pickCanonical(g.rows);
      const losers = g.rows.filter((r) => r.id !== canonical.id);
      if (losers.length === 0) continue;
      didDeleteLocalSettlements = true;
      losers.forEach((r) => affectedLocalTripIds.add(r.tripId));
      await softDeleteRows(TABLES.TRIP_SETTLEMENTS, losers.map((r) => r.id));
    }

    // -----------------------------------------------------------------------
    // Shared trip settlements
    // -----------------------------------------------------------------------
    const sharedSettlements = await queryAll<{
      id: string;
      tripId: string;
      fromParticipantId: string;
      toParticipantId: string;
      amountCents: number;
      dateMs: number;
      note: string | null;
      createdAtMs: number;
      updatedAtMs: number;
    }>(
      `SELECT id, tripId, fromParticipantId, toParticipantId, amountCents, dateMs, note, createdAtMs, updatedAtMs
       FROM ${TABLES.SHARED_TRIP_SETTLEMENTS}
       WHERE deletedAtMs IS NULL`
    );

    const sharedSettlementGroups = groupByKey(sharedSettlements, (s) => {
      const note = (s.note ?? '').trim();
      return [
        s.tripId,
        s.fromParticipantId,
        s.toParticipantId,
        String(Math.abs(s.amountCents)),
        String(bucket5s(s.dateMs)),
        note,
      ].join('|');
    });

    for (const g of sharedSettlementGroups) {
      const canonical = pickCanonical(g.rows);
      const losers = g.rows.filter((r) => r.id !== canonical.id);
      if (losers.length === 0) continue;
      affectedSharedTrips = true;
      didDeleteSharedSettlements = true;
      await softDeleteRows(TABLES.SHARED_TRIP_SETTLEMENTS, losers.map((r) => r.id));
    }

    // -----------------------------------------------------------------------
    // Shared trip expenses
    // -----------------------------------------------------------------------
    const sharedExpenses = await queryAll<{
      id: string;
      tripId: string;
      amountCents: number;
      dateMs: number;
      note: string | null;
      paidByParticipantId: string | null;
      splitType: string;
      splitDataJson: string | null;
      computedSplitsJson: string | null;
      categoryName: string | null;
      categoryEmoji: string | null;
      createdAtMs: number;
      updatedAtMs: number;
    }>(
      `SELECT id, tripId, amountCents, dateMs, note, paidByParticipantId, splitType, splitDataJson, computedSplitsJson,
              categoryName, categoryEmoji, createdAtMs, updatedAtMs
       FROM ${TABLES.SHARED_TRIP_EXPENSES}
       WHERE deletedAtMs IS NULL`
    );

    const sharedExpenseGroups = groupByKey(sharedExpenses, (e) => {
      return [
        e.tripId,
        String(Math.abs(e.amountCents)),
        String(bucket5s(e.dateMs)),
        e.paidByParticipantId ?? '',
        e.splitType,
        e.splitDataJson ?? '',
        e.computedSplitsJson ?? '',
        (e.categoryName ?? '').trim(),
        (e.categoryEmoji ?? '').trim(),
        (e.note ?? '').trim(),
      ].join('|');
    });

    for (const g of sharedExpenseGroups) {
      const canonical = pickCanonical(g.rows);
      const losers = g.rows.filter((r) => r.id !== canonical.id);
      if (losers.length === 0) continue;
      affectedSharedTrips = true;
      didDeleteSharedExpenses = true;
      await softDeleteRows(TABLES.SHARED_TRIP_EXPENSES, losers.map((r) => r.id));
    }

    // -----------------------------------------------------------------------
    // System transactions: transfer + adjustment
    // -----------------------------------------------------------------------
    const systemTxs = await queryAll<{
      id: string;
      systemType: string | null;
      amountCents: number;
      date: number;
      note: string | null;
      accountId: string | null;
      transferFromAccountId: string | null;
      transferToAccountId: string | null;
      createdAtMs: number;
      updatedAtMs: number;
    }>(
      `SELECT id, systemType, amountCents, date, note, accountId, transferFromAccountId, transferToAccountId, createdAtMs, updatedAtMs
       FROM ${TABLES.TRANSACTIONS}
       WHERE deletedAtMs IS NULL AND systemType IN ('transfer', 'adjustment')`
    );

    const systemGroups = groupByKey(systemTxs, (t) => {
      const note = (t.note ?? '').trim();
      const b = bucket5s(t.date);
      if (t.systemType === 'transfer') {
        return [
          'transfer',
          t.transferFromAccountId ?? '',
          t.transferToAccountId ?? '',
          String(Math.abs(t.amountCents)),
          String(b),
          note,
        ].join('|');
      }
      return [
        'adjustment',
        t.accountId ?? '',
        String(t.amountCents),
        String(b),
        note,
      ].join('|');
    });

    for (const g of systemGroups) {
      const canonical = pickCanonical(g.rows);
      const losers = g.rows.filter((r) => r.id !== canonical.id);
      if (losers.length === 0) continue;
      didDeleteSystemTx = true;
      await softDeleteRows(TABLES.TRANSACTIONS, losers.map((r) => r.id));
    }
  });

  // Emit canonical change events so UI refreshes even though we used raw SQL.
  if (didDeleteLocalSettlements) GlobalEvents.emit(Events.tripSettlementsChanged);
  if (didDeleteSharedSettlements || didDeleteSharedExpenses) GlobalEvents.emit(Events.tripsChanged);
  if (didDeleteSystemTx) GlobalEvents.emit(Events.transactionsChanged);

  // -------------------------------------------------------------------------
  // Repair derived state
  // -------------------------------------------------------------------------
  for (const tripId of affectedLocalTripIds) {
    try {
      const hydrated = await TripRepository.getHydrated(tripId);
      if (hydrated) {
        await reconcileLocalTripDerivedTransactionsForTrip(hydrated);
      }
    } catch (e) {
      console.warn('[dedupe] local reconcile failed:', e);
    }
  }

  if (affectedSharedTrips && userId) {
    try {
      await reconcileSharedTripDerivedTransactionsForUser(userId);
    } catch (e) {
      console.warn('[dedupe] shared reconcile failed:', e);
    }
  }
}
