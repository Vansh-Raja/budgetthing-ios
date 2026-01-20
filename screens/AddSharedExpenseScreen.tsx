import React, { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useAuth } from '@clerk/clerk-expo';

import { CalculatorScreen } from './CalculatorScreen';
import { SplitEditorScreen } from './SplitEditorScreen';
import type { SplitType, TripParticipant } from '../lib/logic/types';
import { useCategories } from '../lib/hooks/useData';
import { SharedTripExpenseRepository } from '../lib/db/sharedTripWriteRepositories';
import { reconcileSharedTripDerivedTransactionsForUser } from '../lib/sync/sharedTripReconcile';
import { useToast } from '@/components/ui/ToastProvider';

interface AddSharedExpenseScreenProps {
  tripId: string;
  tripEmoji: string;
  participants: TripParticipant[];
  onDismiss: () => void;
}

export function AddSharedExpenseScreen({ tripId, tripEmoji, participants, onDismiss }: AddSharedExpenseScreenProps) {
  const { userId } = useAuth();
  const { data: categories } = useCategories();
  const toast = useToast();

  const [step, setStep] = useState<'calculator' | 'split'>('calculator');
  const [transactionData, setTransactionData] = useState<{
    amountCents: number;
    type: 'expense' | 'income';
    categoryId: string | null;
    note: string | null;
  } | null>(null);

  const [payerId, setPayerId] = useState<string>('');

  useEffect(() => {
    const me = participants.find((p) => p.isCurrentUser);
    if (me) setPayerId(me.id);
  }, [participants]);

  const categorySnapshot = useMemo(() => {
    if (!transactionData?.categoryId) return null;
    const cat = categories.find((c) => c.id === transactionData.categoryId);
    if (!cat) return null;
    return { name: cat.name, emoji: cat.emoji };
  }, [categories, transactionData?.categoryId]);

  const handleCalculatorSave = async (data: any) => {
    if (data.type !== 'expense') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

     setTransactionData({
       amountCents: data.amountCents,
       type: data.type,
       categoryId: data.categoryId,
       note: data.note,
     });


    setStep('split');
  };

  const handleSplitSave = async (
    splitType: SplitType,
    splitData: Record<string, number>,
    computedSplits: Record<string, number>
  ) => {
    if (!transactionData) return;

    try {
      const amountCents = Math.abs(transactionData.amountCents);
      const now = Date.now();

      const finalPayerId = payerId || participants.find((p) => p.isCurrentUser)?.id || participants[0]?.id;
      if (!finalPayerId) return;

      const expense = await SharedTripExpenseRepository.create({
        tripId,
        amountCents,
        dateMs: now,
        note: transactionData.note ?? undefined,
        paidByParticipantId: finalPayerId,
        splitType,
        splitData,
        computedSplits,
        categoryName: categorySnapshot?.name,
        categoryEmoji: categorySnapshot?.emoji,
      });

       // Do not pick an account in shared space.
       // Payer cashflow is derived with defaultAccountId and can be changed later.


      if (userId) {
        reconcileSharedTripDerivedTransactionsForUser(userId).catch((e) => {
          console.warn('[AddSharedExpense] reconcile failed:', e);
          toast.show('Saved. Sync pending.');
        });
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onDismiss();
    } catch (e) {
      console.error('[AddSharedExpense] Failed:', e);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  if (step === 'split' && transactionData) {
    return (
      <SplitEditorScreen
        participants={participants}
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
    <View style={styles.container}>
      <CalculatorScreen
        initialTripId={tripId}
        tripItemsOverride={[{ id: tripId, emoji: tripEmoji }]}
        tripSelectionDisabled
        onSave={handleCalculatorSave}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
});
