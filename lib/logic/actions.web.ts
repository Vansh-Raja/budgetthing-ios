/**
 * Web adapter for multi-table write actions: each maps to one atomic server command.
 */
import { api } from '@/convex/_generated/api';
import { webMutation, webQuery } from '../web/convexClient';
import { Events, GlobalEvents } from '../events';
import type { SplitType, Transaction, Trip, TripParticipant } from './types';
import { toHydratedTrip, toTransaction } from '../web/mappers';


export const Actions = {
  async createSoloTransaction(data: Omit<Transaction, 'id' | 'createdAtMs' | 'updatedAtMs'>): Promise<Transaction> {
    const row = await webMutation(api.pwaLedger.createTransaction, {
      amountCents: Math.abs(data.amountCents), date: data.date, type: data.type, note: data.note ?? null, accountId: data.accountId ?? null, categoryId: data.categoryId ?? null,
    });
    GlobalEvents.emit(Events.transactionsChanged);
    return toTransaction(row);
  },

  async createTrip(
    tripData: Omit<Trip, 'id' | 'createdAtMs' | 'updatedAtMs' | 'sortIndex' | 'participants' | 'expenses' | 'settlements'>,
    participantsData: { name: string; isCurrentUser: boolean }[]
  ): Promise<Trip & { participants: TripParticipant[] }> {
    const row = await webMutation(api.pwaTrips.createTrip, {
      name: tripData.name, emoji: tripData.emoji, isGroup: tripData.isGroup, startDate: tripData.startDate ?? null, endDate: tripData.endDate ?? null, budgetCents: tripData.budgetCents ?? null,
      participants: participantsData.map((p) => ({ name: p.name, isCurrentUser: p.isCurrentUser })),
    });
    GlobalEvents.emit(Events.tripsChanged);
    const trip = toHydratedTrip(row);
    return { ...trip, participants: trip.participants ?? [] };
  },

  async createGroupExpense(
    transactionData: Omit<Transaction, 'id' | 'createdAtMs' | 'updatedAtMs'>,
    tripId: string,
    splitInfo: { paidByParticipantId: string; splitType: SplitType; splitData: Record<string, number>; computedSplits: Record<string, number> }
  ): Promise<void> {
    await webMutation(api.pwaTrips.createExpense, {
      tripId, amountCents: Math.abs(transactionData.amountCents), date: transactionData.date, note: transactionData.note ?? null, categoryId: transactionData.categoryId ?? null,
      paidByParticipantId: splitInfo.paidByParticipantId, splitType: splitInfo.splitType, splitData: splitInfo.splitData ?? null,
    });
    GlobalEvents.emit(Events.transactionsChanged);
    GlobalEvents.emit(Events.tripExpensesChanged);
  },

  async deleteTransaction(id: string): Promise<void> {
    await webMutation(api.pwaLedger.deleteTransaction, { id });
    GlobalEvents.emit(Events.transactionsChanged);
    GlobalEvents.emit(Events.tripExpensesChanged);
  },
};
