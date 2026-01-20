import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { Text, TextInput } from '@/components/ui/LockedText';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/theme';
import { Trip, TripParticipant } from '../lib/logic/types';
import { formatCents, getCurrencySymbol } from '../lib/logic/currencyUtils';
import { TripRepository, TripSettlementRepository } from '../lib/db/repositories';
import { reconcileLocalTripDerivedTransactionsForTrip } from '../lib/sync/localTripReconcile';
import * as Haptics from 'expo-haptics';
import { useToast } from '@/components/ui/ToastProvider';

interface RecordSettlementScreenProps {
    trip: Trip;
    participants: TripParticipant[];
    initialPayerId: string;
    initialReceiverId: string;
    initialAmountCents: number;
    onDismiss: () => void;
    onRecorded: () => void;
}

export function RecordSettlementScreen({
    trip,
    participants,
    initialPayerId,
    initialReceiverId,
    initialAmountCents,
    onDismiss,
    onRecorded
}: RecordSettlementScreenProps) {

    const toast = useToast();

    // State
    const [payerId, setPayerId] = useState(initialPayerId);
    const [receiverId, setReceiverId] = useState(initialReceiverId);
    const [amountString, setAmountString] = useState((Math.abs(initialAmountCents) / 100).toString());
    const [date, setDate] = useState(new Date());
    const [isSaving, setIsSaving] = useState(false);

    const payer = participants.find(p => p.id === payerId);
    const receiver = participants.find(p => p.id === receiverId);

    const handleSave = async () => {
        if (isSaving) return;

        const amount = parseFloat(amountString);
        if (isNaN(amount) || amount <= 0) {
            Alert.alert("Invalid Amount", "Please enter a valid positive amount.");
            return;
        }

        const amountCents = Math.round(amount * 100);

        setIsSaving(true);
        try {
            await TripSettlementRepository.create({
                tripId: trip.id,
                fromParticipantId: payerId,
                toParticipantId: receiverId,
                amountCents: amountCents,
                date: date.getTime(),
                note: "Payment",
            });

            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            onRecorded();
            onDismiss();

            // Best-effort reconcile (do not turn a successful save into an error).
            setTimeout(() => {
                TripRepository.getHydrated(trip.id)
                    .then((hydrated) => {
                        if (hydrated) return reconcileLocalTripDerivedTransactionsForTrip(hydrated);
                    })
                    .catch(() => {
                        toast.show('Saved. Sync pending.');
                    });
            }, 0);
        } catch (e) {
            Alert.alert("Error", "Failed to record settlement.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={onDismiss}>
                    <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
                <Text style={styles.title}>Record Payment</Text>
                <TouchableOpacity onPress={handleSave} disabled={isSaving}>
                    <Text style={[styles.saveText, isSaving && { opacity: 0.4 }]}>Save</Text>
                </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.content}>

                {/* Amount Input */}
                <View style={styles.amountContainer}>
                    <Text style={styles.currencySymbol}>{getCurrencySymbol("INR")}</Text>
                    <TextInput
                        style={styles.amountInput}
                        value={amountString}
                        onChangeText={setAmountString}
                        keyboardType="decimal-pad"
                        autoFocus
                    />
                </View>

                {/* Who Paid Who */}
                <View style={styles.card}>
                    {/* From (Payer) */}
                    <View style={styles.participantRow}>
                        <Text style={styles.label}>Who paid?</Text>
                        <View style={styles.participantBox}>
                            <Text style={styles.participantName}>{payer?.isCurrentUser ? "You" : payer?.name}</Text>
                        </View>
                    </View>

                    <Ionicons name="arrow-down-circle" size={24} color={Colors.accent} style={{ alignSelf: 'center', marginVertical: -12, zIndex: 10, backgroundColor: '#1C1C1E', borderRadius: 12 }} />

                    {/* To (Receiver) */}
                    <View style={styles.participantRow}>
                        <Text style={styles.label}>Who received?</Text>
                        <View style={styles.participantBox}>
                            <Text style={styles.participantName}>{receiver?.isCurrentUser ? "You" : receiver?.name}</Text>
                        </View>
                    </View>
                </View>

                <Text style={styles.helperText}>
                    This will reduce the balance "{payer?.name || 'Payer'}" owes to "{receiver?.name || 'Receiver'}".
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
        minWidth: 100,
    },
    card: {
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderRadius: 16,
        padding: 20,
        gap: 20,
    },
    participantRow: {
        gap: 8,
    },
    label: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 14,
        textTransform: 'uppercase',
    },
    participantBox: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    participantName: {
        color: 'white',
        fontSize: 20,
        fontWeight: '600',
    },
    helperText: {
        color: 'rgba(255,255,255,0.4)',
        textAlign: 'center',
        fontSize: 13,
    }
});
