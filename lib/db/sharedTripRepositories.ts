import { queryAll, queryFirst } from './database';
import { TABLES } from './schema';
import type { Trip, TripExpense, TripParticipant, TripSettlement } from '../logic/types';

export interface SharedTripSummary {
  id: string;
  name: string;
  emoji: string;
  currencyCode: string;
  updatedAtMs: number;
  totalSpentCents: number;
  participantCount: number;
}

interface SharedTripRow {
  id: string;
  name: string;
  emoji: string;
  currencyCode: string;
  startDateMs: number | null;
  endDateMs: number | null;
  budgetCents: number | null;
  createdAtMs: number;
  updatedAtMs: number;
  deletedAtMs: number | null;
}

interface SharedTripMemberRow {
  id: string;
  tripId: string;
  userId: string;
  participantId: string;
  joinedAtMs: number;
  updatedAtMs: number;
  deletedAtMs: number | null;
}

interface SharedTripParticipantRow {
  id: string;
  tripId: string;
  name: string;
  colorHex: string | null;
  linkedUserId: string | null;
  createdAtMs: number;
  updatedAtMs: number;
  deletedAtMs: number | null;
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

function parseJson<T>(value: string | null): T | undefined {
  if (!value) return undefined;
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}

export const SharedTripRepository = {
  async getAllSummariesForUser(userId: string): Promise<SharedTripSummary[]> {
    const rows = await queryAll<any>(
      `SELECT
         t.id,
         t.name,
         t.emoji,
         t.currencyCode,
         t.updatedAtMs,
         COALESCE((SELECT SUM(e.amountCents) FROM ${TABLES.SHARED_TRIP_EXPENSES} e WHERE e.tripId = t.id AND e.deletedAtMs IS NULL), 0) AS totalSpentCents,
         COALESCE((SELECT COUNT(*) FROM ${TABLES.SHARED_TRIP_PARTICIPANTS} p WHERE p.tripId = t.id AND p.deletedAtMs IS NULL), 0) AS participantCount
       FROM ${TABLES.SHARED_TRIPS} t
       JOIN ${TABLES.SHARED_TRIP_MEMBERS} m
         ON m.tripId = t.id
        AND m.userId = ?
        AND m.deletedAtMs IS NULL
       WHERE t.deletedAtMs IS NULL
       ORDER BY t.updatedAtMs DESC`,
      [userId]
    );

    return rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      emoji: r.emoji,
      currencyCode: r.currencyCode,
      updatedAtMs: r.updatedAtMs,
      totalSpentCents: r.totalSpentCents ?? 0,
      participantCount: r.participantCount ?? 0,
    }));
  },

  async getTripIdForExpense(expenseId: string): Promise<string | null> {
    const row = await queryFirst<{ tripId: string }>(
      `SELECT tripId FROM ${TABLES.SHARED_TRIP_EXPENSES} WHERE id = ?`,
      [expenseId]
    );
    return row?.tripId ?? null;
  },

  async getExpenseMetaByIds(expenseIds: string[]): Promise<Record<string, {
    tripId: string;
    tripEmoji: string;
    categoryEmoji: string | null;
    categoryName: string | null;
    amountCents: number;
  }>> {
    if (expenseIds.length === 0) return {};

    const uniqueIds = Array.from(new Set(expenseIds));
    const placeholders = uniqueIds.map(() => '?').join(',');

    const rows = await queryAll<{ expenseId: string; tripId: string; tripEmoji: string; categoryEmoji: string | null; categoryName: string | null; amountCents: number }>(
      `SELECT
         e.id AS expenseId,
         e.tripId AS tripId,
         t.emoji AS tripEmoji,
         e.categoryEmoji AS categoryEmoji,
         e.categoryName AS categoryName,
         e.amountCents AS amountCents
       FROM ${TABLES.SHARED_TRIP_EXPENSES} e
       JOIN ${TABLES.SHARED_TRIPS} t ON t.id = e.tripId
       WHERE e.id IN (${placeholders})`,
      uniqueIds
    );

    const map: Record<string, { tripId: string; tripEmoji: string; categoryEmoji: string | null; categoryName: string | null; amountCents: number }> = {};
    for (const r of rows) {
      map[r.expenseId] = {
        tripId: r.tripId,
        tripEmoji: r.tripEmoji,
        categoryEmoji: r.categoryEmoji,
        categoryName: r.categoryName,
        amountCents: r.amountCents ?? 0,
      };
    }

    return map;
  },

  async getTripIdForSettlement(settlementId: string): Promise<string | null> {
    const row = await queryFirst<{ tripId: string }>(
      `SELECT tripId FROM ${TABLES.SHARED_TRIP_SETTLEMENTS} WHERE id = ?`,
      [settlementId]
    );
    return row?.tripId ?? null;
  },

  async getSettlementMetaByIds(settlementIds: string[]): Promise<Record<string, {
    tripId: string;
    tripEmoji: string;
  }>> {
    if (settlementIds.length === 0) return {};

    const uniqueIds = Array.from(new Set(settlementIds));
    const placeholders = uniqueIds.map(() => '?').join(',');

    const rows = await queryAll<{ settlementId: string; tripId: string; tripEmoji: string }>(
      `SELECT
         s.id AS settlementId,
         s.tripId AS tripId,
         t.emoji AS tripEmoji
       FROM ${TABLES.SHARED_TRIP_SETTLEMENTS} s
       JOIN ${TABLES.SHARED_TRIPS} t ON t.id = s.tripId
       WHERE s.id IN (${placeholders})`,
      uniqueIds
    );

    const map: Record<string, { tripId: string; tripEmoji: string }> = {};
    for (const r of rows) {
      map[r.settlementId] = {
        tripId: r.tripId,
        tripEmoji: r.tripEmoji,
      };
    }
    return map;
  },

  async getHydratedTripForUser(userId: string, tripId: string): Promise<Trip | null> {
    const tripRow = await queryFirst<SharedTripRow>(
      `SELECT * FROM ${TABLES.SHARED_TRIPS} WHERE id = ? AND deletedAtMs IS NULL`,
      [tripId]
    );
    if (!tripRow) return null;

    const memberRow = await queryFirst<SharedTripMemberRow>(
      `SELECT * FROM ${TABLES.SHARED_TRIP_MEMBERS} WHERE tripId = ? AND userId = ? AND deletedAtMs IS NULL`,
      [tripId, userId]
    );
    if (!memberRow) return null;

    const participantRows = await queryAll<SharedTripParticipantRow>(
      `SELECT * FROM ${TABLES.SHARED_TRIP_PARTICIPANTS}
       WHERE tripId = ? AND deletedAtMs IS NULL
       ORDER BY createdAtMs ASC, id ASC`,
      [tripId]
    );

    const expenseRows = await queryAll<SharedTripExpenseRow>(
      `SELECT * FROM ${TABLES.SHARED_TRIP_EXPENSES} WHERE tripId = ? AND deletedAtMs IS NULL ORDER BY dateMs DESC`,
      [tripId]
    );

    const settlementRows = await queryAll<SharedTripSettlementRow>(
      `SELECT * FROM ${TABLES.SHARED_TRIP_SETTLEMENTS} WHERE tripId = ? AND deletedAtMs IS NULL ORDER BY dateMs DESC`,
      [tripId]
    );

    const participants: TripParticipant[] = participantRows.map((p) => ({
      id: p.id,
      tripId: p.tripId,
      name: p.name,
      isCurrentUser: p.id === memberRow.participantId,
      colorHex: p.colorHex ?? undefined,
      linkedUserId: p.linkedUserId ?? undefined,
      createdAtMs: p.createdAtMs,
      updatedAtMs: p.updatedAtMs,
      deletedAtMs: undefined,
    }));

    const participantById = new Map(participants.map((p) => [p.id, p] as const));

    const expenses: TripExpense[] = expenseRows.map((e) => {
      const tx = {
        id: e.id,
        amountCents: e.amountCents,
        date: e.dateMs,
        note: e.note ?? undefined,
        type: 'expense' as const,
        systemType: null,
        createdAtMs: e.createdAtMs,
        updatedAtMs: e.updatedAtMs,
        deletedAtMs: undefined,
      };

      const expense: TripExpense = {
        id: e.id,
        tripId: e.tripId,
        transactionId: e.id,
        paidByParticipantId: e.paidByParticipantId ?? undefined,
        splitType: e.splitType as any,
        splitData: parseJson<Record<string, number>>(e.splitDataJson),
        computedSplits: parseJson<Record<string, number>>(e.computedSplitsJson),
        createdAtMs: e.createdAtMs,
        updatedAtMs: e.updatedAtMs,
        deletedAtMs: undefined,
        categoryName: e.categoryName ?? undefined,
        categoryEmoji: e.categoryEmoji ?? undefined,
        transaction: tx as any,
        paidByParticipant: e.paidByParticipantId ? participantById.get(e.paidByParticipantId) : undefined,
      };

      return expense;
    });

    const settlements: TripSettlement[] = settlementRows.map((s) => ({
      id: s.id,
      tripId: s.tripId,
      fromParticipantId: s.fromParticipantId,
      toParticipantId: s.toParticipantId,
      amountCents: s.amountCents,
      date: s.dateMs,
      note: s.note ?? undefined,
      createdAtMs: s.createdAtMs,
      updatedAtMs: s.updatedAtMs,
      deletedAtMs: undefined,
      fromParticipant: participantById.get(s.fromParticipantId),
      toParticipant: participantById.get(s.toParticipantId),
    }));

    const trip: Trip = {
      id: tripRow.id,
      name: tripRow.name,
      emoji: tripRow.emoji,
      sortIndex: 0,
      isGroup: true,
      isArchived: false,
      startDate: tripRow.startDateMs ?? undefined,
      endDate: tripRow.endDateMs ?? undefined,
      budgetCents: tripRow.budgetCents ?? undefined,
      createdAtMs: tripRow.createdAtMs,
      updatedAtMs: tripRow.updatedAtMs,
      deletedAtMs: undefined,
      participants,
      expenses,
      settlements,
    };

    return trip;
  },
};
