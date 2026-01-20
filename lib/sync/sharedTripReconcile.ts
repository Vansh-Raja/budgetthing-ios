import { queryAll } from '../db/database';
import { TABLES } from '../db/schema';
import { AccountRepository, TransactionRepository, UserSettingsRepository } from '../db/repositories';
import { TripSplitCalculator } from '../logic/tripSplitCalculator';
import type { SplitType, TripParticipant, TransactionType, SystemType } from '../logic/types';
import { derivedTripCashflowId, derivedTripSettlementId, derivedTripShareId } from './sharedTripDerivedIds';

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

    const calcParticipants: TripParticipant[] = participants.map((p) => ({
      id: p.id,
      tripId: p.tripId,
      name: p.name,
      isCurrentUser: false,
      colorHex: p.colorHex ?? undefined,
      createdAtMs: p.createdAtMs,
      updatedAtMs: p.updatedAtMs,
      deletedAtMs: undefined,
    }));

    for (const expense of expenses) {
      if (expense.deletedAtMs !== null) continue;

      const payer = expense.paidByParticipantId
        ? participants.find((p) => p.id === expense.paidByParticipantId)
        : undefined;

      if (payer?.linkedUserId === userId && defaultAccountId) {
        const parts: string[] = [];
        if (trip) parts.push(`${trip.emoji} ${trip.name}`);
        if (expense.categoryEmoji && expense.categoryName) {
          parts.push(`${expense.categoryEmoji} ${expense.categoryName}`);
        }
        if (expense.note) parts.push(expense.note);

        derivedUpserts.push({
          id: derivedTripCashflowId(userId, expense.id),
          amountCents: expense.amountCents,
          date: expense.dateMs,
          note: parts.length ? parts.join(' · ') : undefined,
          type: 'expense',
          systemType: 'trip_cashflow',
          accountId: defaultAccountId,
          sourceTripExpenseId: expense.id,
        });
      }

      let splits: Record<string, number> | undefined;
      if (expense.computedSplitsJson) {
        try {
          splits = JSON.parse(expense.computedSplitsJson);
        } catch {
          splits = undefined;
        }
      }

      if (!splits) {
        let splitData: Record<string, number> | undefined;
        if (expense.splitDataJson) {
          try {
            splitData = JSON.parse(expense.splitDataJson);
          } catch {
            splitData = undefined;
          }
        }

        splits = TripSplitCalculator.calculateSplits(
          expense.amountCents,
          expense.splitType as SplitType,
          calcParticipants,
          splitData
        );
      }

      const myShare = splits?.[myParticipantId] ?? 0;
      if (myShare <= 0) continue;

      const parts: string[] = [];
      if (expense.categoryEmoji && expense.categoryName) {
        parts.push(`${expense.categoryEmoji} ${expense.categoryName}`);
      }
      if (expense.note) {
        parts.push(expense.note);
      }

      derivedUpserts.push({
        id: derivedTripShareId(userId, expense.id),
        amountCents: myShare,
        date: expense.dateMs,
        note: parts.length ? parts.join(' · ') : undefined,
        type: 'expense',
        systemType: 'trip_share',
        sourceTripExpenseId: expense.id,
      });
    }

    for (const settlement of settlements) {
      if (settlement.deletedAtMs !== null) continue;

      const from = participants.find((p) => p.id === settlement.fromParticipantId);
      const to = participants.find((p) => p.id === settlement.toParticipantId);

      const baseParts: string[] = [];
      if (trip) baseParts.push(`${trip.emoji} ${trip.name}`);
      if (from && to) baseParts.push(`Settle · ${from.name} → ${to.name}`);
      if (settlement.note) baseParts.push(settlement.note);

      const note = baseParts.length ? baseParts.join(' · ') : undefined;

      if (to?.linkedUserId === userId && defaultAccountId) {
        derivedUpserts.push({
          id: derivedTripSettlementId(userId, settlement.id, 'in'),
          amountCents: settlement.amountCents,
          date: settlement.dateMs,
          note,
          type: 'income',
          systemType: 'trip_settlement',
          accountId: defaultAccountId,
          sourceTripSettlementId: settlement.id,
        });
      }

      if (from?.linkedUserId === userId && defaultAccountId) {
        derivedUpserts.push({
          id: derivedTripSettlementId(userId, settlement.id, 'out'),
          amountCents: settlement.amountCents,
          date: settlement.dateMs,
          note,
          type: 'expense',
          systemType: 'trip_settlement',
          accountId: defaultAccountId,
          sourceTripSettlementId: settlement.id,
        });
      }
    }
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

  const payer = expense.paidByParticipantId
    ? participants.find((p) => p.id === expense.paidByParticipantId)
    : undefined;

  const derivedUpserts: Array<{
    id: string;
    amountCents: number;
    date: number;
    note?: string;
    type: TransactionType;
    systemType: SystemType;
    accountId?: string;
    sourceTripExpenseId?: string;
  }> = [];

  // trip_cashflow: payer's personal cash movement (only for the payer user)
  if (payer?.linkedUserId === userId && defaultAccountId) {
    const parts: string[] = [];
    parts.push(`${trip.emoji} ${trip.name}`);
    if (expense.categoryEmoji && expense.categoryName) {
      parts.push(`${expense.categoryEmoji} ${expense.categoryName}`);
    }
    if (expense.note) parts.push(expense.note);

    derivedUpserts.push({
      id: derivedTripCashflowId(userId, expense.id),
      amountCents: expense.amountCents,
      date: expense.dateMs,
      note: parts.length ? parts.join(' · ') : undefined,
      type: 'expense',
      systemType: 'trip_cashflow',
      accountId: defaultAccountId,
      sourceTripExpenseId: expense.id,
    });
  }

  // trip_share: my owed share (only if myShare > 0)
  let splits: Record<string, number> | undefined;
  if (expense.computedSplitsJson) {
    try {
      splits = JSON.parse(expense.computedSplitsJson);
    } catch {
      splits = undefined;
    }
  }

  if (!splits) {
    let splitData: Record<string, number> | undefined;
    if (expense.splitDataJson) {
      try {
        splitData = JSON.parse(expense.splitDataJson);
      } catch {
        splitData = undefined;
      }
    }

    const calcParticipants: TripParticipant[] = participants.map((p) => ({
      id: p.id,
      tripId: p.tripId,
      name: p.name,
      isCurrentUser: false,
      colorHex: p.colorHex ?? undefined,
      createdAtMs: p.createdAtMs,
      updatedAtMs: p.updatedAtMs,
      deletedAtMs: undefined,
    }));

    splits = TripSplitCalculator.calculateSplits(
      expense.amountCents,
      expense.splitType as SplitType,
      calcParticipants,
      splitData
    );
  }

  const myShare = splits?.[myParticipantId] ?? 0;
  if (myShare > 0) {
    const parts: string[] = [];
    if (expense.categoryEmoji && expense.categoryName) {
      parts.push(`${expense.categoryEmoji} ${expense.categoryName}`);
    }
    if (expense.note) parts.push(expense.note);

    derivedUpserts.push({
      id: derivedTripShareId(userId, expense.id),
      amountCents: myShare,
      date: expense.dateMs,
      note: parts.length ? parts.join(' · ') : undefined,
      type: 'expense',
      systemType: 'trip_share',
      sourceTripExpenseId: expense.id,
    });
  }

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
