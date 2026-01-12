/**
 * Add Expense Screen - Flow for adding expense to a trip
 * 
 * Wraps Calculator and SplitEditor
 */

import React, { useState, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';

import { CalculatorScreen } from './CalculatorScreen';
import { SplitEditorScreen } from './SplitEditorScreen';
import { Trip, SplitType } from '../lib/logic/types';
import { Actions } from '../lib/logic/actions';
import { useTrips } from '../lib/hooks/useTrips';
import { TransactionRepository, TripExpenseRepository } from '../lib/db/repositories';

interface AddExpenseScreenProps {
  tripId: string;
  onDismiss: () => void;
}

export function AddExpenseScreen({ tripId, onDismiss }: AddExpenseScreenProps) {
  const [step, setStep] = useState<'calculator' | 'split'>('calculator');
  const [transactionData, setTransactionData] = useState<{
    amountCents: number;
    type: 'expense' | 'income';
    categoryId: string | null;
    accountId: string | null;
    note: string | null;
    tripId: string | null;
  } | null>(null);
  const [payerId, setPayerId] = useState<string>('');

  // Use real data hook instead of mocks
  const { trips } = useTrips();
  const trip = trips.find(t => t.id === tripId);

  // Initialize payer to current user
  useEffect(() => {
    if (trip) {
      const me = trip.participants?.find(p => p.isCurrentUser);
      if (me) setPayerId(me.id);
    }
  }, [trip]);

  if (!trip) return null;

  const handleCalculatorSave = async (data: any) => {
    if (trip.isGroup && data.type === 'expense') {
      // Group expense needs split flow
      setTransactionData(data);
      setStep('split');
    } else {
      // Solo trip or income: save immediately
      try {
        const tx = await TransactionRepository.create({
          amountCents: data.amountCents,
          date: Date.now(),
          type: data.type,
          note: data.note || undefined,
          categoryId: data.categoryId || undefined,
          accountId: data.accountId || undefined,
        });

        // Link to trip if it's an expense (following CalculatorScreen's pattern)
        if (data.type === 'expense') {
          // Find "me" participant for solo trips
          const me = trip.participants?.find(p => p.isCurrentUser);

          const tripExpense = await TripExpenseRepository.create({
            tripId: trip.id,
            transactionId: tx.id,
            splitType: 'equal', // Solo is implicitly equal (1 person)
            paidByParticipantId: me?.id, // Optional for solo
          });

          // Link back
          await TransactionRepository.update(tx.id, {
            tripExpenseId: tripExpense.id
          });
        }

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onDismiss();
      } catch (error) {
        console.error("Failed to save expense:", error);
      }
    }
  };

  const handleSplitSave = async (splitType: SplitType, splitData: Record<string, number>, computedSplits: Record<string, number>) => {
    if (!transactionData || !trip) return;

    try {
      // Use selected payerId, fallback to current user if empty (shouldn't happen)
      const finalPayerId = payerId || trip.participants?.find(p => p.isCurrentUser)?.id || '';

      await Actions.createGroupExpense(
        {
          amountCents: transactionData.amountCents,
          date: Date.now(),
          type: transactionData.type,
          note: transactionData.note || undefined,
          categoryId: transactionData.categoryId || undefined,
          accountId: transactionData.accountId || undefined,
        },
        trip.id,
        {
          paidByParticipantId: finalPayerId,
          splitType,
          splitData,
          computedSplits
        }
      );

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onDismiss();
    } catch (e) {
      console.error("Failed to save group expense:", e);
    }
  };

  if (step === 'split' && transactionData) {
    return (
      <SplitEditorScreen
        participants={trip.participants ?? []}
        totalAmountCents={Math.abs(transactionData.amountCents)}
        currencyCode="INR"
        onSave={handleSplitSave}
        onCancel={() => setStep('calculator')}
        payerId={payerId}
        onPayerChange={setPayerId}
      />
    );
  }

  return (
    <CalculatorScreen
      initialTripId={tripId}
      onSave={handleCalculatorSave}
    />
  );
}
