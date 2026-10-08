import { api } from '@/convex/_generated/api';
import { webMutation, webQuery } from '../web/convexClient';
import { Events, GlobalEvents } from '../events';
import { WebNotAvailableError } from '../web/runtime';


async function tripIdForExpense(expenseId: string): Promise<string> {
  const meta: any = await webQuery(api.pwaSharedTrips.resolveMeta, { expenseIds: [expenseId] });
  const tripId = meta.expenses[expenseId]?.tripId;
  if (!tripId) throw new Error('Shared expense not found');
  return tripId;
}

async function tripIdForSettlement(settlementId: string): Promise<string> {
  const meta: any = await webQuery(api.pwaSharedTrips.resolveMeta, { settlementIds: [settlementId] });
  const tripId = meta.settlements[settlementId]?.tripId;
  if (!tripId) throw new Error('Shared settlement not found');
  return tripId;
}

export const SharedTripExpenseRepository = {
  async create(input: { tripId: string; amountCents: number; dateMs: number; note?: string; paidByParticipantId?: string; splitType: string; splitData?: Record<string, number>; computedSplits?: Record<string, number>; categoryName?: string; categoryEmoji?: string }): Promise<{ id: string }> {
    if (!input.paidByParticipantId) throw new Error('paidByParticipantId is required');
    const row: any = await webMutation(api.pwaSharedTrips.addExpense, {
      tripId: input.tripId, amountCents: Math.abs(input.amountCents), dateMs: input.dateMs, note: input.note ?? null, paidByParticipantId: input.paidByParticipantId,
      splitType: input.splitType as any, splitData: input.splitData ?? null, categoryName: input.categoryName ?? null, categoryEmoji: input.categoryEmoji ?? null,
    });
    GlobalEvents.emit(Events.tripExpensesChanged);
    GlobalEvents.emit(Events.tripsChanged);
    GlobalEvents.emit(Events.transactionsChanged);
    return { id: row.id };
  },
  async update(expenseId: string, updates: { amountCents?: number; dateMs?: number; note?: string | null; paidByParticipantId?: string | null; splitType?: string; splitData?: Record<string, number> | null; computedSplits?: Record<string, number> | null; categoryName?: string | null; categoryEmoji?: string | null }): Promise<void> {
    const tripId = await tripIdForExpense(expenseId);
    await webMutation(api.pwaSharedTrips.updateExpense, {
      tripId, id: expenseId, amountCents: updates.amountCents !== undefined ? Math.abs(updates.amountCents) : undefined, dateMs: updates.dateMs,
      note: 'note' in updates ? updates.note ?? null : undefined, paidByParticipantId: updates.paidByParticipantId ?? undefined,
      splitType: updates.splitType as any, splitData: 'splitData' in updates ? updates.splitData ?? null : undefined,
      categoryName: 'categoryName' in updates ? updates.categoryName ?? null : undefined, categoryEmoji: 'categoryEmoji' in updates ? updates.categoryEmoji ?? null : undefined,
    });
    GlobalEvents.emit(Events.tripExpensesChanged);
    GlobalEvents.emit(Events.tripsChanged);
    GlobalEvents.emit(Events.transactionsChanged);
  },
  async delete(expenseId: string): Promise<void> {
    const tripId = await tripIdForExpense(expenseId);
    await webMutation(api.pwaSharedTrips.deleteExpense, { tripId, id: expenseId });
    GlobalEvents.emit(Events.tripExpensesChanged);
    GlobalEvents.emit(Events.tripsChanged);
    GlobalEvents.emit(Events.transactionsChanged);
  },
};

export const SharedTripSettlementRepository = {
  async create(input: { tripId: string; fromParticipantId: string; toParticipantId: string; amountCents: number; dateMs: number; note?: string }): Promise<{ id: string }> {
    const row: any = await webMutation(api.pwaSharedTrips.recordSettlement, {
      tripId: input.tripId, fromParticipantId: input.fromParticipantId, toParticipantId: input.toParticipantId, amountCents: Math.abs(input.amountCents), dateMs: input.dateMs, note: input.note ?? null,
    });
    GlobalEvents.emit(Events.tripSettlementsChanged);
    GlobalEvents.emit(Events.tripsChanged);
    GlobalEvents.emit(Events.transactionsChanged);
    return { id: row.id };
  },
  async delete(id: string): Promise<void> {
    const tripId = await tripIdForSettlement(id);
    await webMutation(api.pwaSharedTrips.deleteSettlement, { tripId, id });
    GlobalEvents.emit(Events.tripSettlementsChanged);
    GlobalEvents.emit(Events.tripsChanged);
    GlobalEvents.emit(Events.transactionsChanged);
  },
  async deleteByTripId(_tripId: string): Promise<void> {
    throw new WebNotAvailableError('Bulk settlement deletion');
  },
};
