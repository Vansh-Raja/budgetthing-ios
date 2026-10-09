/**
 * Centralized business logic actions
 * 
 * Handles complex multi-table operations to ensure data consistency
 */

import {
    TransactionRepository,
    TripRepository,
    TripParticipantRepository,
    TripExpenseRepository,
    AccountRepository
} from '../db/repositories';
import {
    Transaction,
    Trip,
    SplitType,
    TripParticipant
} from './types';
import { withTransaction } from '../db/database';
import { reconcileLocalTripDerivedTransactionsForTrip } from '../sync/localTripReconcile';

export const Actions = {
    /**
     * Create a new solo transaction
     */
    async createSoloTransaction(data: Omit<Transaction, 'id' | 'createdAtMs' | 'updatedAtMs'>): Promise<Transaction> {
        return await TransactionRepository.create(data);
    },

    /**
     * Create a new trip with initial participants
     */
    async createTrip(
        tripData: Omit<Trip, 'id' | 'createdAtMs' | 'updatedAtMs' | 'sortIndex' | 'participants' | 'expenses' | 'settlements'>,
        participantsData: { name: string; isCurrentUser: boolean }[]
    ): Promise<Trip> {
        return await withTransaction(async () => {
            // 1. Create Trip
            const trip = await TripRepository.create(tripData);

            // 2. Create Participants
            const participants: TripParticipant[] = [];
            let finalParticipantsData = participantsData;
            if (tripData.isGroup) {
                // Enforce that group trips always have exactly one "current user" participant.
                // If caller didn't provide any participants, or none are marked current user,
                // auto-add "You".
                if (finalParticipantsData.length === 0) {
                    finalParticipantsData = [{ name: 'You', isCurrentUser: true }];
                } else if (!finalParticipantsData.some((p) => p.isCurrentUser)) {
                    finalParticipantsData = [{ name: 'You', isCurrentUser: true }, ...finalParticipantsData];
                }
            }

            for (const p of finalParticipantsData) {
                const participant = await TripParticipantRepository.create({
                    tripId: trip.id,
                    name: p.name,
                    isCurrentUser: p.isCurrentUser,
                });
                participants.push(participant);
            }

            if (tripData.isGroup) {
                await TripParticipantRepository.ensureExactlyOneCurrentUser(trip.id);
            }

            return {
                ...trip,
                participants
            };
        });
    },

    /**
     * Calculator save into a local trip: create the expense and its trip link in one
     * write. Solo trips charge the chosen account; group trips keep it on the base row,
     * which reconcile reads as the "you paid" cashflow account.
     */
    async saveCalculatorTripExpense(
        transactionData: Omit<Transaction, 'id' | 'createdAtMs' | 'updatedAtMs'>,
        tripId: string,
        link: {
            paidByParticipantId?: string;
            splitType: SplitType;
            splitData?: Record<string, number>;
            computedSplits?: Record<string, number>;
        }
    ): Promise<Transaction> {
        return await withTransaction(async () => {
            const tx = await TransactionRepository.create(transactionData);
            const tripExpense = await TripExpenseRepository.create({
                tripId,
                transactionId: tx.id,
                paidByParticipantId: link.paidByParticipantId,
                splitType: link.splitType,
                splitData: link.splitData,
                computedSplits: link.computedSplits,
            });
            await TransactionRepository.update(tx.id, { tripExpenseId: tripExpense.id });
            return tx;
        });
    },

    /**
     * Edit a local trip expense and its split in one write (transaction detail screen).
     */
    async updateTripExpenseWithTransaction(
        transactionId: string,
        txUpdates: Partial<Omit<Transaction, 'id' | 'createdAtMs'>>,
        tripExpenseId: string | null,
        splitUpdates: { paidByParticipantId?: string; splitType: SplitType; splitData?: Record<string, number>; computedSplits?: Record<string, number> } | null
    ): Promise<void> {
        await withTransaction(async () => {
            await TransactionRepository.update(transactionId, txUpdates);
            if (tripExpenseId && splitUpdates) await TripExpenseRepository.update(tripExpenseId, splitUpdates);
        });
    },

    async createGroupExpense(
        transactionData: Omit<Transaction, 'id' | 'createdAtMs' | 'updatedAtMs'>,
        tripId: string,
        splitInfo: {
            paidByParticipantId: string;
            splitType: SplitType;
            splitData: Record<string, number>;
            computedSplits: Record<string, number>;
        }
    ): Promise<void> {
        await withTransaction(async () => {
            // Local group trips follow the same model as shared trips:
            // the base trip expense is a ledger entry and should not affect personal accounts.
            // Real personal account movement is represented by derived rows.
            const ledgerTransactionData = {
                ...transactionData,
                accountId: undefined,
            };

            // 1. Create the base transaction (without tripExpenseId initially)
            const transaction = await TransactionRepository.create(ledgerTransactionData);

            // 2. Create the TripExpense record linked to it
            const tripExpense = await TripExpenseRepository.create({
                tripId,
                transactionId: transaction.id,
                paidByParticipantId: splitInfo.paidByParticipantId,
                splitType: splitInfo.splitType,
                splitData: splitInfo.splitData,
                computedSplits: splitInfo.computedSplits,
            });

            // 3. Link transaction back to trip expense
            await TransactionRepository.update(transaction.id, {
                tripExpenseId: tripExpense.id
            });
        });

        // Update derived rows after write transaction commits.
        const hydrated = await TripRepository.getHydrated(tripId);
        if (hydrated) {
            reconcileLocalTripDerivedTransactionsForTrip(hydrated)
                .catch((e) => console.warn('[Actions] reconcileLocalTripDerivedTransactionsForTrip failed', e));
        }
    },

    /**
     * Delete a transaction and cascade to TripExpense if needed
     */
    async deleteTransaction(id: string): Promise<void> {
        await withTransaction(async () => {
            // Check if it's a trip expense
            const tripExpense = await TripExpenseRepository.getByTransactionId(id);

            if (tripExpense) {
                await TripExpenseRepository.delete(tripExpense.id);
            }

            await TransactionRepository.delete(id);
        });
    }
};
