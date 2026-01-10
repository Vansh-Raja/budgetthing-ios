import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/theme';
import { Trip, TripParticipant, TripExpense, TripSettlement } from '../lib/logic/types';
import { TripBalanceCalculator } from '../lib/logic/tripBalanceCalculator';
import { formatCents } from '../lib/logic/currencyUtils';

interface TripSettleUpViewProps {
    trip: Trip;
    participants: TripParticipant[];
    expenses: TripExpense[];
    settlements: TripSettlement[];
    onRecordSettlement: (fromId: string, toId: string, amountCents: number) => void;
}

export function TripSettleUpView({
    trip,
    participants,
    expenses,
    settlements,
    onRecordSettlement
}: TripSettleUpViewProps) {

    // 1. Calculate current balances
    const balances = useMemo(() => {
        return TripBalanceCalculator.calculateBalances(participants, expenses, settlements);
    }, [participants, expenses, settlements]);

    // 2. Simplify debts to get suggested payments
    const suggestedSettlements = useMemo(() => {
        return TripBalanceCalculator.simplifyDebts(participants, balances);
    }, [participants, balances]);

    return (
        <ScrollView contentContainerStyle={styles.container}>

            {/* Suggested Settlements */}
            <Text style={styles.sectionHeader}>SUGGESTED SETTLEMENTS</Text>
            {suggestedSettlements.length > 0 ? (
                <View style={styles.listContainer}>
                    {suggestedSettlements.map(debt => (
                        <TouchableOpacity
                            key={debt.id}
                            style={styles.settlementRow}
                            onPress={() => onRecordSettlement(debt.fromParticipant.id, debt.toParticipant.id, debt.amountCents)}
                        >
                            <View style={styles.debtContainer}>
                                <View style={styles.debtTextRow}>
                                    <Text style={styles.nameText}>{debt.fromParticipant.isCurrentUser ? "You" : debt.fromParticipant.name}</Text>
                                    <Text style={styles.oweText}> owes </Text>
                                    <Text style={styles.nameText}>{debt.toParticipant.isCurrentUser ? "You" : debt.toParticipant.name}</Text>
                                </View>
                                <Text style={styles.amountText}>{formatCents(debt.amountCents)}</Text>
                            </View>

                            <View style={styles.payButton}>
                                <Text style={styles.payButtonText}>PAY</Text>
                                <Ionicons name="chevron-forward" size={14} color={Colors.accent} />
                            </View>
                        </TouchableOpacity>
                    ))}
                </View>
            ) : (
                <View style={[styles.listContainer, { padding: 20, alignItems: 'center' }]}>
                    <Ionicons name="checkmark-done-circle" size={48} color={Colors.accentGreen} />
                    <Text style={{ color: 'white', marginTop: 10, fontSize: 16 }}>All debts are settled!</Text>
                </View>
            )}

            {/* Settlement History */}
            {settlements.length > 0 && (
                <>
                    <Text style={styles.sectionHeader}>SETTLEMENT HISTORY</Text>
                    <View style={styles.listContainer}>
                        {[...settlements].sort((a, b) => b.date - a.date).map(settlement => {
                            const from = participants.find(p => p.id === settlement.fromParticipantId);
                            const to = participants.find(p => p.id === settlement.toParticipantId);
                            if (!from || !to) return null;

                            return (
                                <View key={settlement.id} style={styles.historyRow}>
                                    <Ionicons name="checkmark-circle" size={24} color={Colors.accentGreen} style={{ marginTop: 2 }} />
                                    <View style={{ flex: 1 }}>
                                        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                                            <Text style={styles.historyName}>{from.isCurrentUser ? "You" : from.name}</Text>
                                            <Text style={styles.historyText}> paid </Text>
                                            <Text style={styles.historyName}>{to.isCurrentUser ? "You" : to.name}</Text>
                                        </View>
                                        <Text style={styles.historyDate}>{new Date(settlement.date).toLocaleDateString()}</Text>
                                    </View>
                                    <Text style={styles.historyAmount}>{formatCents(settlement.amountCents)}</Text>
                                </View>
                            );
                        })}
                    </View>
                </>
            )}

            <View style={{ height: 100 }} />
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        padding: 20,
        gap: 20,
    },
    sectionHeader: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 13,
        fontWeight: 'bold',
        marginLeft: 4,
    },
    listContainer: {
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderRadius: 16,
        overflow: 'hidden',
    },

    // Suggestion Row
    settlementRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.05)',
    },
    debtContainer: {
        gap: 4,
    },
    debtTextRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    nameText: {
        color: 'white',
        fontSize: 17,
        fontFamily: 'AvenirNextCondensed-DemiBold',
    },
    oweText: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 15,
    },
    amountText: {
        color: Colors.accentRed,
        fontSize: 18,
        fontFamily: 'AvenirNextCondensed-Heavy',
    },
    payButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 6,
        paddingHorizontal: 12,
        backgroundColor: 'rgba(10, 132, 255, 0.1)',
        borderRadius: 20,
    },
    payButtonText: {
        color: Colors.accent,
        fontSize: 12,
        fontWeight: 'bold',
        marginRight: 4,
    },

    // History Row
    historyRow: {
        flexDirection: 'row',
        padding: 16,
        gap: 12,
        alignItems: 'flex-start',
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.05)',
    },
    historyName: {
        color: 'white',
        fontWeight: 'bold',
    },
    historyText: {
        color: 'rgba(255,255,255,0.6)',
    },
    historyDate: {
        color: 'rgba(255,255,255,0.4)',
        fontSize: 12,
        marginTop: 2,
    },
    historyAmount: {
        color: Colors.accentGreen,
        fontSize: 16,
        fontFamily: 'AvenirNextCondensed-Bold',
    }
});
