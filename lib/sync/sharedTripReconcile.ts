import { queryAll } from '../db/database';
import { TABLES } from '../db/schema';
import { AccountRepository, TransactionRepository, UserSettingsRepository } from '../db/repositories';
import type { TripParticipant, TransactionType, SystemType } from '../logic/types';
import { computeTripDerivedRowsForUser } from '../logic/tripAccounting/computeDerivedRows';

interface SharedTripMemberRow {
  tripId: string;
  participantId: string;
  deletedAtMs: number | null;
}

interface SharedTripParticipantRow {
  id: string;
  tripId: string;
  name: string;
  colorHex: string | null;
  linkedUserId: string | null;
  deletedAtMs: number | null;
  createdAtMs: number;
  updatedAtMs: number;
}

interface SharedTripExpenseRow {
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
  deletedAtMs: number | null;
}

interface SharedTripSettlementRow {
  id: string;
  tripId: string;
  fromParticipantId: string;
  toParticipantId: string;
  amountCents: number;
  dateMs: number;
  note: string | null;
  createdAtMs: number;
  updatedAtMs: number;
  deletedAtMs: number | null;
}

interface SharedTripRow {
  id: string;
  name: string;
  emoji: string;
  currencyCode: string;
  deletedAtMs: number | null;
}

export async function reconcileSharedTripDerivedTransactionsForUser(userId: string) {
  const members = await queryAll<SharedTripMemberRow>(
    `SELECT tripId, participantId, deletedAtMs FROM ${TABLES.SHARED_TRIP_MEMBERS} WHERE userId = ?`,
    [userId]
  );

  const settings = await UserSettingsRepository.get();
  let defaultAccountId = settings.defaultAccountId;
  if (!defaultAccountId) {
    const accounts = await AccountRepository.getAll();
    defaultAccountId = accounts[0]?.id;
  }

  const activeTripIds = members.filter((m) => m.deletedAtMs === null).map((m) => m.tripId);
  const inactiveTripIds = members.filter((m) => m.deletedAtMs !== null).map((m) => m.tripId);

  const derivedUpserts: Array<{
    id: string;
    amountCents: number;
    date: number;
    note?: string;
    type: TransactionType;
    systemType: SystemType;
    accountId?: string;
    sourceTripExpenseId?: string;
    sourceTripSettlementId?: string;
  }> = [];

  const expenseIdsToConsiderForDeletion: string[] = [];
  const settlementIdsToConsiderForDeletion: string[] = [];

  // For inactive trips, delete any existing derived rows.
  if (inactiveTripIds.length) {
    const placeholders = inactiveTripIds.map(() => '?').join(',');

    const expenseRows = await queryAll<{ id: string }>(
      `SELECT id FROM ${TABLES.SHARED_TRIP_EXPENSES} WHERE tripId IN (${placeholders})`,
      inactiveTripIds
    );
    expenseIdsToConsiderForDeletion.push(...expenseRows.map((r) => r.id));

    const settlementRows = await queryAll<{ id: string }>(
      `SELECT id FROM ${TABLES.SHARED_TRIP_SETTLEMENTS} WHERE tripId IN (${placeholders})`,
      inactiveTripIds
    );
    settlementIdsToConsiderForDeletion.push(...settlementRows.map((r) => r.id));
  }

  for (const member of members) {
    if (member.deletedAtMs !== null) continue;

    const tripId = member.tripId;
    const myParticipantId = member.participantId;

    const tripRows = await queryAll<SharedTripRow>(
      `SELECT id, name, emoji, currencyCode, deletedAtMs FROM ${TABLES.SHARED_TRIPS} WHERE id = ?`,
      [tripId]
    );
    const trip = tripRows[0] ?? null;
    const tripIsDeleted = trip ? trip.deletedAtMs !== null : false;

    const participants = await queryAll<SharedTripParticipantRow>(
      `SELECT * FROM ${TABLES.SHARED_TRIP_PARTICIPANTS} WHERE tripId = ? AND deletedAtMs IS NULL`,
      [tripId]
    );

    const expenses = await queryAll<SharedTripExpenseRow>(
      `SELECT * FROM ${TABLES.SHARED_TRIP_EXPENSES} WHERE tripId = ?`,
      [tripId]
    );

    const settlements = await queryAll<SharedTripSettlementRow>(
      `SELECT * FROM ${TABLES.SHARED_TRIP_SETTLEMENTS} WHERE tripId = ?`,
      [tripId]
    );

    expenseIdsToConsiderForDeletion.push(...expenses.map((e) => e.id));
    settlementIdsToConsiderForDeletion.push(...settlements.map((s) => s.id));

    if (tripIsDeleted) {
      continue;
    }

    const tripLabel = trip ? `${trip.emoji} ${trip.name}` : null;

    const computeParticipants: TripParticipant[] = participants.map((p) => ({
      id: p.id,
      tripId: p.tripId,
      name: p.name,
      isCurrentUser: p.id === myParticipantId,
      colorHex: p.colorHex ?? undefined,
      createdAtMs: p.createdAtMs,
      updatedAtMs: p.updatedAtMs,
      deletedAtMs: undefined,
    }));

    const computeExpenses = expenses
      .filter((e) => e.deletedAtMs === null)
      .map((e) => {
        let splitData: Record<string, number> | null = null;
        if (e.splitDataJson) {
          try {
            splitData = JSON.parse(e.splitDataJson);
          } catch {
            splitData = null;
          }
        }

        let computedSplits: Record<string, number> | null = null;
        if (e.computedSplitsJson) {
          try {
            computedSplits = JSON.parse(e.computedSplitsJson);
          } catch {
            computedSplits = null;
          }
        }

        return {
          id: e.id,
          tripId: e.tripId,
          amountCents: e.amountCents,
          dateMs: e.dateMs,
          note: e.note,
          paidByParticipantId: e.paidByParticipantId,
          splitType: e.splitType,
          splitData,
          computedSplits,
          categoryEmoji: e.categoryEmoji,
          categoryName: e.categoryName,
        };
      });

    const computeSettlements = settlements
      .filter((s) => s.deletedAtMs === null)
      .map((s) => ({
        id: s.id,
        tripId: s.tripId,
        fromParticipantId: s.fromParticipantId,
        toParticipantId: s.toParticipantId,
        amountCents: s.amountCents,
        dateMs: s.dateMs,
        note: s.note,
      }));

    const computed = computeTripDerivedRowsForUser({
      derivedKey: userId,
      defaultAccountId,
      tripLabel,
      participants: computeParticipants,
      meParticipantId: myParticipantId,
      expenses: computeExpenses,
      settlements: computeSettlements,
    });

    derivedUpserts.push(...(computed as any));
  }

  const desiredIds = new Set(derivedUpserts.map((r) => r.id));

  // Determine which existing derived rows to delete.
  const toDelete: string[] = [];

  if (expenseIdsToConsiderForDeletion.length) {
    const uniqueExpenseIds = Array.from(new Set(expenseIdsToConsiderForDeletion));
    const placeholders = uniqueExpenseIds.map(() => '?').join(',');

    const existingExpenseDerived = await queryAll<{ id: string }>(
      `SELECT id FROM ${TABLES.TRANSACTIONS}
       WHERE deletedAtMs IS NULL
         AND systemType IN ('trip_share', 'trip_cashflow')
         AND sourceTripExpenseId IN (${placeholders})`,
      uniqueExpenseIds
    );

    for (const row of existingExpenseDerived) {
      if (!desiredIds.has(row.id)) {
        toDelete.push(row.id);
      }
    }
  }

  if (settlementIdsToConsiderForDeletion.length) {
    const uniqueSettlementIds = Array.from(new Set(settlementIdsToConsiderForDeletion));
    const placeholders = uniqueSettlementIds.map(() => '?').join(',');

    const existingSettlementDerived = await queryAll<{ id: string }>(
      `SELECT id FROM ${TABLES.TRANSACTIONS}
       WHERE deletedAtMs IS NULL
         AND systemType = 'trip_settlement'
         AND sourceTripSettlementId IN (${placeholders})`,
      uniqueSettlementIds
    );

    for (const row of existingSettlementDerived) {
      if (!desiredIds.has(row.id)) {
        toDelete.push(row.id);
      }
    }
  }

  if (derivedUpserts.length) {
    await TransactionRepository.upsertDerivedBatch(derivedUpserts as any);
  }

  if (toDelete.length) {
    await TransactionRepository.softDeleteDerivedByIds(toDelete);
  }
}

// Targeted reconcile: update derived rows for a single expense.
// Used by shared trip expense edits to keep UI snappy.
export async function reconcileSharedTripDerivedTransactionsForExpense(userId: string, expenseId: string) {
  const expenseRows = await queryAll<SharedTripExpenseRow>(
    `SELECT * FROM ${TABLES.SHARED_TRIP_EXPENSES} WHERE id = ?`,
    [expenseId]
  );

  const expense = expenseRows[0] ?? null;
  if (!expense) {
    // Expense missing locally: delete any derived rows that reference it.
    const existing = await queryAll<{ id: string }>(
      `SELECT id FROM ${TABLES.TRANSACTIONS}
       WHERE deletedAtMs IS NULL
         AND systemType IN ('trip_share', 'trip_cashflow')
         AND sourceTripExpenseId = ?`,
      [expenseId]
    );

    await TransactionRepository.softDeleteDerivedByIds(existing.map((r) => r.id));
    return;
  }

  const tripId = expense.tripId;

  const memberRows = await queryAll<SharedTripMemberRow>(
    `SELECT tripId, participantId, deletedAtMs FROM ${TABLES.SHARED_TRIP_MEMBERS}
     WHERE userId = ? AND tripId = ?`,
    [userId, tripId]
  );

  const member = memberRows[0] ?? null;

  const tripRows = await queryAll<SharedTripRow>(
    `SELECT id, name, emoji, currencyCode, deletedAtMs FROM ${TABLES.SHARED_TRIPS} WHERE id = ?`,
    [tripId]
  );
  const trip = tripRows[0] ?? null;

  // If user isn't an active member, or trip is deleted, delete derived rows.
  if (!member || member.deletedAtMs !== null || !trip || trip.deletedAtMs !== null || expense.deletedAtMs !== null) {
    const existing = await queryAll<{ id: string }>(
      `SELECT id FROM ${TABLES.TRANSACTIONS}
       WHERE deletedAtMs IS NULL
         AND systemType IN ('trip_share', 'trip_cashflow')
         AND sourceTripExpenseId = ?`,
      [expenseId]
    );

    await TransactionRepository.softDeleteDerivedByIds(existing.map((r) => r.id));
    return;
  }

  const participants = await queryAll<SharedTripParticipantRow>(
    `SELECT * FROM ${TABLES.SHARED_TRIP_PARTICIPANTS} WHERE tripId = ? AND deletedAtMs IS NULL`,
    [tripId]
  );

  const myParticipantId = member.participantId;

  const settings = await UserSettingsRepository.get();
  let defaultAccountId = settings.defaultAccountId;
  if (!defaultAccountId) {
    const accounts = await AccountRepository.getAll();
    defaultAccountId = accounts[0]?.id;
  }

  const tripLabel = trip ? `${trip.emoji} ${trip.name}` : null;

  const computeParticipants: TripParticipant[] = participants.map((p) => ({
    id: p.id,
    tripId: p.tripId,
    name: p.name,
    isCurrentUser: p.id === myParticipantId,
    colorHex: p.colorHex ?? undefined,
    createdAtMs: p.createdAtMs,
    updatedAtMs: p.updatedAtMs,
    deletedAtMs: undefined,
  }));

  let splitData: Record<string, number> | null = null;
  if (expense.splitDataJson) {
    try {
      splitData = JSON.parse(expense.splitDataJson);
    } catch {
      splitData = null;
    }
  }

  let computedSplits: Record<string, number> | null = null;
  if (expense.computedSplitsJson) {
    try {
      computedSplits = JSON.parse(expense.computedSplitsJson);
    } catch {
      computedSplits = null;
    }
  }

  const computed = computeTripDerivedRowsForUser({
    derivedKey: userId,
    defaultAccountId,
    tripLabel,
    participants: computeParticipants,
    meParticipantId: myParticipantId,
    expenses: [
      {
        id: expense.id,
        tripId: expense.tripId,
        amountCents: expense.amountCents,
        dateMs: expense.dateMs,
        note: expense.note,
        paidByParticipantId: expense.paidByParticipantId,
        splitType: expense.splitType,
        splitData,
        computedSplits,
        categoryEmoji: expense.categoryEmoji,
        categoryName: expense.categoryName,
      },
    ],
    settlements: [],
  });

  const derivedUpserts = computed as any as Array<{
    id: string;
    amountCents: number;
    date: number;
    note?: string;
    type: TransactionType;
    systemType: SystemType;
    accountId?: string;
    sourceTripExpenseId?: string;
  }>;

  const desiredIds = new Set(derivedUpserts.map((r) => r.id));

  const existing = await queryAll<{ id: string }>(
    `SELECT id FROM ${TABLES.TRANSACTIONS}
     WHERE deletedAtMs IS NULL
       AND systemType IN ('trip_share', 'trip_cashflow')
       AND sourceTripExpenseId = ?`,
    [expenseId]
  );

  const toDelete = existing.map((r) => r.id).filter((id) => !desiredIds.has(id));

  if (derivedUpserts.length) {
    await TransactionRepository.upsertDerivedBatch(derivedUpserts as any);
  }

  if (toDelete.length) {
    await TransactionRepository.softDeleteDerivedByIds(toDelete);
  }
}
