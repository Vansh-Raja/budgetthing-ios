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
        tripData: Omit<Trip, 'id' | 'createdAtMs' | 'updatedAtMs' | 'participants' | 'expenses' | 'settlements'>,
        participantsData: { name: string; isCurrentUser: boolean }[]
    ): Promise<Trip> {
        return await withTransaction(async () => {
            // 1. Create Trip
            const trip = await TripRepository.create(tripData);

            // 2. Create Participants
            const participants: TripParticipant[] = [];
            for (const p of participantsData) {
                const participant = await TripParticipantRepository.create({
                    tripId: trip.id,
                    name: p.name,
                    isCurrentUser: p.isCurrentUser,
                });
                participants.push(participant);
            }

            return {
                ...trip,
                participants
            };
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
            // 1. Create the base transaction (without tripExpenseId initially)
            const transaction = await TransactionRepository.create(transactionData);

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
