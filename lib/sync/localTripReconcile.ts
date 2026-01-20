import { AccountRepository, CategoryRepository, TransactionRepository, TripRepository, UserSettingsRepository } from '../db/repositories';
import { queryAll } from '../db/database';
import { TABLES } from '../db/schema';
import type { Trip } from '../logic/types';
import { computeTripDerivedRowsForUser } from '../logic/tripAccounting/computeDerivedRows';
import { getLocalDbOwner } from './localDbOwner';

export async function reconcileLocalTripDerivedTransactionsForTrip(trip: Trip): Promise<void> {
  if (!trip.isGroup) return;

  // Determine current user participant.
  const me = (trip.participants ?? []).find((p) => p.isCurrentUser);
  if (!me) return;

  const settings = await UserSettingsRepository.get();
  let defaultAccountId = settings.defaultAccountId;
  if (!defaultAccountId) {
    const accounts = await AccountRepository.getAll();
    defaultAccountId = accounts[0]?.id;
  }
  if (!defaultAccountId) return;

  const categories = await CategoryRepository.getAll();
  const catMap = new Map(categories.map((c) => [c.id, c]));

  const expenses = (trip.expenses ?? [])
    .filter((e) => !e.deletedAtMs)
    .map((e) => {
      const tx = e.transaction;
      const cat = tx?.categoryId ? catMap.get(tx.categoryId) : undefined;
      return {
        id: e.id,
        tripId: e.tripId,
        amountCents: Math.abs(tx?.amountCents ?? 0),
        dateMs: tx?.date ?? e.createdAtMs,
        note: tx?.note ?? null,
        paidByParticipantId: e.paidByParticipantId ?? null,
        splitType: e.splitType,
        splitData: e.splitData ?? null,
        computedSplits: e.computedSplits ?? null,
        categoryEmoji: cat?.emoji ?? null,
        categoryName: cat?.name ?? null,
      };
    })
    .filter((e) => e.amountCents > 0);

  // Migration: legacy local group trip expenses may have had accountId set.
  // Clear the base ledger transaction accountId to avoid affecting balances.
  // If the current user was the payer and the base tx had an accountId, reuse it
  // as the initial account for the derived cashflow row.
  const legacyPaidFromAccountByExpenseId = new Map<string, string>();
  for (const e of (trip.expenses ?? [])) {
    const tx = e.transaction;
    if (!tx) continue;
    if (tx.accountId) {
      legacyPaidFromAccountByExpenseId.set(e.id, tx.accountId);
      await TransactionRepository.update(tx.id, { accountId: undefined });
    }
  }

  const settlements = (trip.settlements ?? [])
    .filter((s) => !s.deletedAtMs)
    .map((s) => ({
      id: s.id,
      tripId: s.tripId,
      fromParticipantId: s.fromParticipantId,
      toParticipantId: s.toParticipantId,
      amountCents: Math.abs(s.amountCents),
      dateMs: s.date,
      note: s.note ?? null,
    }));

  const owner = (await getLocalDbOwner()) ?? 'local';
  const derivedKey = typeof owner === 'string' ? owner : 'local';
  const tripLabel = `${trip.emoji} ${trip.name}`;

  const derived = computeTripDerivedRowsForUser({
    derivedKey,
    defaultAccountId,
    tripLabel,
    participants: trip.participants ?? [],
    meParticipantId: me.id,
    expenses,
    settlements,
  });

  for (const row of derived) {
    if (row.systemType === 'trip_cashflow' && row.sourceTripExpenseId) {
      const override = legacyPaidFromAccountByExpenseId.get(row.sourceTripExpenseId);
      if (override) {
        row.accountId = override;
      }
    }
  }

  // Soft-delete existing derived rows for this trip that are no longer desired.
  // We use sourceTripExpenseId/sourceTripSettlementId to scope.
  const desiredIds = new Set(derived.map((r) => r.id));

  const expenseIdRows = await queryAll<{ id: string }>(
    `SELECT id FROM ${TABLES.TRIP_EXPENSES} WHERE tripId = ?`,
    [trip.id]
  );
  const expenseIds = expenseIdRows.map((r) => r.id);
  if (expenseIds.length) {
    const existing = await TransactionRepository.getDerivedBySourceTripExpenseIds(expenseIds);
    const toDelete = existing.filter((t) => !desiredIds.has(t.id)).map((t) => t.id);
    if (toDelete.length) await TransactionRepository.softDeleteDerivedByIds(toDelete);
  }

  const settlementIdRows = await queryAll<{ id: string }>(
    `SELECT id FROM ${TABLES.TRIP_SETTLEMENTS} WHERE tripId = ?`,
    [trip.id]
  );
  const settlementIds = settlementIdRows.map((r) => r.id);
  if (settlementIds.length) {
    const existing = await TransactionRepository.getDerivedBySourceTripSettlementIds(settlementIds);
    const toDelete = existing.filter((t) => !desiredIds.has(t.id)).map((t) => t.id);
    if (toDelete.length) await TransactionRepository.softDeleteDerivedByIds(toDelete);
  }

  if (derived.length) {
    await TransactionRepository.upsertDerivedBatch(derived as any);
  }
}

export async function reconcileLocalTripDerivedTransactionsForAllGroupTrips(): Promise<void> {
  const trips = await TripRepository.getAllHydrated(true);
  for (const t of trips) {
    if (t.deletedAtMs) continue;
    if (!t.isGroup) continue;
    await reconcileLocalTripDerivedTransactionsForTrip(t);
  }
}
