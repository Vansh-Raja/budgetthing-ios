import React, { useCallback, useMemo, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { Text, TextInput } from '@/components/ui/LockedText';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useAuth } from '@clerk/clerk-expo';

import { Colors } from '../constants/theme';
import type { Trip, TripParticipant } from '../lib/logic/types';
import { getCurrencySymbol } from '../lib/logic/currencyUtils';
import { SharedTripSettlementRepository } from '../lib/db/sharedTripWriteRepositories';
import { reconcileSharedTripDerivedTransactionsForUser } from '../lib/sync/sharedTripReconcile';

interface RecordSharedSettlementScreenProps {
  trip: Trip;
  participants: TripParticipant[];
  initialPayerId: string;
  initialReceiverId: string;
  initialAmountCents: number;
  onDismiss: () => void;
  onRecorded: () => void;
}

export function RecordSharedSettlementScreen({
  trip,
  participants,
  initialPayerId,
  initialReceiverId,
  initialAmountCents,
  onDismiss,
  onRecorded,
}: RecordSharedSettlementScreenProps) {
  const { userId } = useAuth();

  const currentUserParticipantId = useMemo(
    () => participants.find((p) => p.isCurrentUser)?.id ?? null,
    [participants]
  );

  const [payerId, setPayerId] = useState(initialPayerId || currentUserParticipantId || '');
  const [receiverId, setReceiverId] = useState(initialReceiverId || '');
  const [amountString, setAmountString] = useState(
    initialAmountCents > 0 ? (Math.abs(initialAmountCents) / 100).toString() : ''
  );
  const [dateMs] = useState(() => Date.now());

  const payer = participants.find((p) => p.id === payerId);
  const receiver = participants.find((p) => p.id === receiverId);

  const canSave = payerId && receiverId && payerId !== receiverId && parseFloat(amountString) > 0;

  const pickParticipant = useCallback((title: string, onPick: (id: string) => void) => {
    const actions: any[] = participants.map((p) => ({
      text: p.isCurrentUser ? 'You' : p.name,
      onPress: () => {
        Haptics.selectionAsync();
        onPick(p.id);
      },
    }));
    actions.push({ text: 'Cancel', style: 'cancel' });

    Alert.alert(title, undefined, actions);
  }, [participants]);

  const handleSave = useCallback(async () => {
    const amount = parseFloat(amountString);
    if (!payerId || !receiverId || payerId === receiverId || isNaN(amount) || amount <= 0) {
      Alert.alert('Invalid', 'Please select payer/receiver and enter a valid amount.');
      return;
    }

    const amountCents = Math.round(amount * 100);

    try {
      await SharedTripSettlementRepository.create({
        tripId: trip.id,
        fromParticipantId: payerId,
        toParticipantId: receiverId,
        amountCents,
        dateMs,
        note: 'Payment',
      });

      if (userId) {
        await reconcileSharedTripDerivedTransactionsForUser(userId);
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onRecorded();
      onDismiss();
    } catch (e) {
      console.error('[RecordSharedSettlement] Failed:', e);
      Alert.alert('Error', 'Failed to record settlement.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, [amountString, dateMs, onDismiss, onRecorded, payerId, receiverId, trip.id, userId]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onDismiss}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Record Payment</Text>
        <TouchableOpacity onPress={handleSave} disabled={!canSave}>
          <Text style={[styles.saveText, !canSave && { opacity: 0.4 }]}>Save</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.amountContainer}>
          <Text style={styles.currencySymbol}>{getCurrencySymbol('INR')}</Text>
          <TextInput
            style={styles.amountInput}
            value={amountString}
            onChangeText={setAmountString}
            keyboardType="decimal-pad"
            autoFocus
            placeholder="0"
            placeholderTextColor="rgba(255,255,255,0.3)"
          />
        </View>

        <View style={styles.card}>
          <TouchableOpacity
            style={styles.participantRow}
            onPress={() => pickParticipant('Who paid?', setPayerId)}
            activeOpacity={0.7}
          >
            <Text style={styles.label}>Who paid?</Text>
            <View style={{ flex: 1 }} />
            <Text style={styles.participantName}>{payer?.isCurrentUser ? 'You' : payer?.name ?? 'Select'}</Text>
            <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.3)" />
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity
            style={styles.participantRow}
            onPress={() => pickParticipant('Who received?', setReceiverId)}
            activeOpacity={0.7}
          >
            <Text style={styles.label}>Who received?</Text>
            <View style={{ flex: 1 }} />
            <Text style={styles.participantName}>{receiver?.isCurrentUser ? 'You' : receiver?.name ?? 'Select'}</Text>
            <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.3)" />
          </TouchableOpacity>
        </View>

        <Text style={styles.helperText}>
          This records a settlement in the trip and automatically posts personal cashflow (payer expense / receiver income).
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1C1C1E',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  title: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
  cancelText: {
    color: Colors.accent,
    fontSize: 17,
  },
  saveText: {
    color: Colors.accent,
    fontSize: 17,
    fontWeight: 'bold',
  },
  content: {
    padding: 20,
    gap: 24,
  },
  amountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 20,
  },
  currencySymbol: {
    fontSize: 42,
    color: 'rgba(255,255,255,0.5)',
    fontFamily: 'AvenirNextCondensed-Heavy',
  },
  amountInput: {
    fontSize: 42,
    color: 'white',
    fontFamily: 'AvenirNextCondensed-Heavy',
    minWidth: 120,
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: 16,
  },
  participantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
  },
  label: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    textTransform: 'uppercase',
    fontFamily: 'System',
  },
  participantName: {
    color: 'white',
    fontSize: 18,
    fontFamily: 'AvenirNextCondensed-DemiBold',
    marginRight: 10,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  helperText: {
    color: 'rgba(255,255,255,0.4)',
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'System',
  },
});
