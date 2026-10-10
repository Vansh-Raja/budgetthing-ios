/**
 * Web adapter for multi-table write actions: each maps to one atomic server command.
 */
import { api } from '@/convex/_generated/api';
import { webMutation, webQuery } from '../web/convexClient';
import { Events, GlobalEvents } from '../events';
import type { SplitType, Transaction, Trip, TripParticipant } from './types';
import { toHydratedTrip, toTransaction } from '../web/mappers';
import { TransactionRepository } from '../db/repositories';


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

  /** Calculator save into a local trip: one atomic server command (no partial writes on failure). */
  async saveCalculatorTripExpense(
    transactionData: Omit<Transaction, 'id' | 'createdAtMs' | 'updatedAtMs'>,
    tripId: string,
    link: { paidByParticipantId?: string; splitType: SplitType; splitData?: Record<string, number>; computedSplits?: Record<string, number> }
  ): Promise<Transaction> {
    const result: any = await webMutation(api.pwaTrips.createExpense, {
      tripId, amountCents: Math.abs(transactionData.amountCents), date: transactionData.date, note: transactionData.note ?? null,
      categoryId: transactionData.categoryId ?? null, accountId: transactionData.accountId ?? null,
      paidByParticipantId: link.paidByParticipantId ?? null, splitType: link.splitType, splitData: link.splitData ?? null,
    });
    GlobalEvents.emit(Events.transactionsChanged);
    GlobalEvents.emit(Events.tripExpensesChanged);
    return toTransaction(result.transaction);
  },

  /** Edit a local trip expense and its split atomically: one pwaTrips.updateExpense call. */
  async updateTripExpenseWithTransaction(
    transactionId: string,
    txUpdates: Partial<Omit<Transaction, 'id' | 'createdAtMs'>>,
    tripExpenseId: string | null,
    splitUpdates: { paidByParticipantId?: string; splitType: SplitType; splitData?: Record<string, number>; computedSplits?: Record<string, number> } | null
  ): Promise<void> {
    if (!tripExpenseId || !splitUpdates) {
      await TransactionRepository.update(transactionId, txUpdates);
      return;
    }
    await webMutation(api.pwaTrips.updateExpense, {
      tripExpenseId,
      amountCents: txUpdates.amountCents !== undefined ? Math.abs(txUpdates.amountCents) : undefined,
      date: txUpdates.date,
      note: 'note' in txUpdates ? txUpdates.note ?? null : undefined,
      categoryId: 'categoryId' in txUpdates ? txUpdates.categoryId ?? null : undefined,
      paidByParticipantId: splitUpdates.paidByParticipantId ?? undefined,
      splitType: splitUpdates.splitType,
      splitData: splitUpdates.splitData ?? null,
    });
    if ('accountId' in txUpdates && txUpdates.accountId) {
      // Group trips: the chosen account is the "you paid" cashflow account (server maps it).
      await TransactionRepository.update(transactionId, { accountId: txUpdates.accountId });
    }
    GlobalEvents.emit(Events.transactionsChanged);
    GlobalEvents.emit(Events.tripExpensesChanged);
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
