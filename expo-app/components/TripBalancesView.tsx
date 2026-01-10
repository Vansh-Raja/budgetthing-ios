import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/theme';
import { Trip, TripParticipant, TripExpense, TripSettlement } from '../lib/logic/types';
import { TripBalanceCalculator } from '../lib/logic/tripBalanceCalculator';
import { formatCents, getCurrencySymbol } from '../lib/logic/currencyUtils';

interface TripBalancesViewProps {
    trip: Trip;
    participants: TripParticipant[];
    expenses: TripExpense[];
    settlements: TripSettlement[];
}

export function TripBalancesView({ trip, participants, expenses, settlements }: TripBalancesViewProps) {

    const balances = useMemo(() => {
        return TripBalanceCalculator.calculateBalances(participants, expenses, settlements);
    }, [participants, expenses, settlements]);

    const mySummary = useMemo(() => {
        return TripBalanceCalculator.currentUserSummary(balances);
    }, [balances]);

    // Sorting: Positive (gets back) first, then negative (owes)
    const sortedBalances = useMemo(() => {
        return [...balances].sort((a, b) => b.netBalanceCents - a.netBalanceCents);
    }, [balances]);

    const detailedDebts = useMemo(() => {
        return TripBalanceCalculator.detailedDebts(participants, expenses);
    }, [participants, expenses]);

    const currencySymbol = getCurrencySymbol("INR"); // Should come from settings

    return (
        <ScrollView contentContainerStyle={styles.container}>
            {/* Your Summary Card */}
            <View style={styles.summaryCard}>
                <Text style={styles.summaryTitle}>YOUR BALANCE</Text>

                {mySummary.getsBackCents > 0 ? (
                    <View style={styles.summaryRow}>
                        <Text style={[styles.summaryAmount, { color: Colors.accentGreen }]}>
                            {formatCents(mySummary.getsBackCents)}
                        </Text>
                        <Text style={styles.summaryLabel}>gets back</Text>
                    </View>
                ) : mySummary.owesCents > 0 ? (
                    <View style={styles.summaryRow}>
                        <Text style={[styles.summaryAmount, { color: Colors.accentRed }]}>
                            {formatCents(mySummary.owesCents)}
                        </Text>
                        <Text style={styles.summaryLabel}>you owe</Text>
                    </View>
                ) : (
                    <View style={styles.summaryRow}>
                        <Ionicons name="checkmark-circle" size={32} color={Colors.accentGreen} />
                        <Text style={[styles.summaryLabel, { marginLeft: 10, color: Colors.accentGreen }]}>All settled up!</Text>
                    </View>
                )}
            </View>

            {/* Everyone's Balances */}
            <Text style={styles.sectionHeader}>EVERYONE'S BALANCE</Text>
            <View style={styles.listContainer}>
                {sortedBalances.map(balance => {
                    const isPositive = balance.netBalanceCents > 0;
                    const isSettled = balance.netBalanceCents === 0;

                    return (
                        <View key={balance.participantId} style={styles.balanceRow}>
                            <View style={styles.avatarContainer}>
                                {balance.colorHex ? (
                                    <View style={[styles.avatarCircle, { backgroundColor: balance.colorHex }]}>
                                        <Text style={styles.avatarInitial}>{balance.participantName[0]}</Text>
                                    </View>
                                ) : (
                                    <Ionicons name="person-circle" size={40} color="#888" />
                                )}
                            </View>

                            <View style={styles.nameContainer}>
                                <Text style={styles.participantName}>
                                    {balance.isCurrentUser ? "You" : balance.participantName}
                                </Text>
                            </View>

                            <View style={styles.amountContainer}>
                                {isSettled ? (
                                    <Text style={styles.settledText}>Settled</Text>
                                ) : (
                                    <>
                                        <Text style={[styles.balanceAmount, { color: isPositive ? Colors.accentGreen : Colors.accentRed }]}>
                                            {isPositive ? "+" : ""}{formatCents(balance.netBalanceCents)}
                                        </Text>
                                        <Text style={styles.balanceLabel}>
                                            {isPositive ? "gets back" : "owes"}
                                        </Text>
                                    </>
                                )}
                            </View>
                        </View>
                    );
                })}
            </View>

            {/* Who Paid What (Spending Breakdown) */}
            <Text style={styles.sectionHeader}>WHO PAID WHAT</Text>
            <View style={styles.listContainer}>
                {balances.sort((a, b) => b.totalPaidCents - a.totalPaidCents).map(balance => (
                    <View key={balance.participantId} style={styles.balanceRow}>
                        <View style={styles.nameContainer}>
                            <Text style={styles.participantName}>
                                {balance.isCurrentUser ? "You" : balance.participantName}
                            </Text>
                        </View>
                        <View style={styles.amountContainer}>
                            <Text style={styles.spendingAmount}>
                                {formatCents(balance.totalPaidCents)}
                            </Text>
                        </View>
                    </View>
                ))}
            </View>

            <View style={{ height: 100 }} />
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        padding: 20,
        gap: 20,
    },
    summaryCard: {
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderRadius: 16,
        padding: 20,
        alignItems: 'center',
    },
    summaryTitle: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 12,
        fontWeight: 'bold',
        marginBottom: 8,
        textTransform: 'uppercase',
    },
    summaryRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    summaryAmount: {
        fontSize: 32,
        fontFamily: 'AvenirNextCondensed-Heavy',
    },
    summaryLabel: {
        color: 'rgba(255,255,255,0.8)',
        fontSize: 18,
        fontFamily: 'AvenirNextCondensed-Medium',
    },

    sectionHeader: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 13,
        fontWeight: 'bold',
        marginTop: 10,
        marginLeft: 4,
    },
    listContainer: {
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderRadius: 16,
        overflow: 'hidden',
    },
    balanceRow: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.05)',
    },
    avatarContainer: {
        marginRight: 12,
    },
    avatarCircle: {
        width: 36,
        height: 36,
        borderRadius: 18,
        justifyContent: 'center',
        alignItems: 'center',
    },
    avatarInitial: {
        color: 'white',
        fontWeight: 'bold',
        fontSize: 14,
    },
    nameContainer: {
        flex: 1,
    },
    participantName: {
        color: 'white',
        fontSize: 17,
        fontFamily: 'AvenirNextCondensed-DemiBold',
    },
    amountContainer: {
        alignItems: 'flex-end',
    },
    balanceAmount: {
        fontSize: 17,
        fontFamily: 'AvenirNextCondensed-Bold',
    },
    balanceLabel: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 12,
    },
    settledText: {
        color: 'rgba(255,255,255,0.3)',
        fontSize: 15,
        fontStyle: 'italic',
    },
    spendingAmount: {
        color: 'white',
        fontSize: 17,
        fontFamily: 'AvenirNextCondensed-Medium',
    }
});
