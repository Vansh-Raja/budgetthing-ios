/**
 * Account Detail Screen - View account transactions
 * 
 * Pixel-perfect port of AccountDetailView.swift
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    Modal,
    FlatList,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { format, startOfMonth, endOfMonth, getDate, setDate, addMonths, subMonths } from 'date-fns';

import { Colors } from '../constants/theme';
import { Account, Transaction } from '../lib/logic/types';
import { formatCents } from '../lib/logic/currencyUtils';
import { useAccounts, useTransactions } from '../lib/hooks/useData';
import { EditAccountScreen } from './EditAccountScreen';
import { TransactionDetailScreen } from './TransactionDetailScreen';

interface AccountDetailScreenProps {
    accountId: string;
    onDismiss?: () => void;
}

// ============================================================================
// Helpers
// ============================================================================

function billingCycleStart(reference: Date, day: number): Date {
    const todayDay = getDate(reference);

    if (todayDay < day) {
        // Cycle started last month
        return setDate(subMonths(reference, 1), day);
    }
    return setDate(reference, day);
}

function billingCycleEnd(reference: Date, day: number): Date {
    const start = billingCycleStart(reference, day);
    return addMonths(start, 1);
}

function cycleRangeString(start: Date, end: Date): string {
    const endMinusOne = new Date(end);
    endMinusOne.setDate(endMinusOne.getDate() - 1);
    return `${format(start, 'MMM d')} – ${format(endMinusOne, 'MMM d')}`;
}

// ============================================================================
// Main Component
// ============================================================================

export function AccountDetailScreen({ accountId, onDismiss }: AccountDetailScreenProps) {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { data: accounts, refresh: refreshAccounts } = useAccounts();
    const { data: transactions, refresh: refreshTransactions } = useTransactions();

    const [showEditor, setShowEditor] = useState(false);
    const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null);

    const account = accounts.find(a => a.id === accountId);

    // Filter transactions for this account
    const accountTxs = useMemo(() => {
        if (!account) return [];
        return transactions
            .filter(tx =>
                tx.accountId === account.id ||
                tx.transferFromAccountId === account.id ||
                tx.transferToAccountId === account.id
            )
            .sort((a, b) => b.date - a.date);
    }, [account, transactions]);

    // Calculate stats
    const stats = useMemo(() => {
        if (!account) return { balance: 0, spentThisWindow: 0, addedThisWindow: 0 };

        const now = new Date();
        const isCredit = account.kind === 'card';
        const hasBillingCycle = isCredit && account.billingCycleDay && account.billingCycleDay >= 1 && account.billingCycleDay <= 28;

        let windowStart: Date;
        let windowEnd: Date;

        if (hasBillingCycle) {
            windowStart = billingCycleStart(now, account.billingCycleDay!);
            windowEnd = billingCycleEnd(now, account.billingCycleDay!);
        } else {
            windowStart = startOfMonth(now);
            windowEnd = endOfMonth(now);
            windowEnd.setDate(windowEnd.getDate() + 1); // Make it exclusive
        }

        let expensesAll = 0;
        let incomesAll = 0;
        let spentThisWindow = 0;
        let addedThisWindow = 0;

        for (const tx of accountTxs) {
            const isTransfer = tx.systemType === 'transfer';
            const amount = Math.abs(tx.amountCents);
            const txDate = new Date(tx.date);
            const inWindow = txDate >= windowStart && txDate < windowEnd;

            let isExpense = false;
            let isIncome = false;

            if (isTransfer) {
                if (tx.transferFromAccountId === account.id) isExpense = true;
                if (tx.transferToAccountId === account.id) isIncome = true;
            } else {
                if (tx.type === 'income') isIncome = true;
                else isExpense = true;
            }

            if (isExpense) {
                expensesAll += amount;
                if (inWindow) spentThisWindow += amount;
            }
            if (isIncome) {
                incomesAll += amount;
                if (inWindow) addedThisWindow += amount;
            }
        }

        let balance = 0;
        if (isCredit) {
            balance = (account.limitAmountCents || 0) - expensesAll + incomesAll;
        } else {
            balance = (account.openingBalanceCents || 0) + incomesAll - expensesAll;
        }

        return { balance, spentThisWindow, addedThisWindow };
    }, [account, accountTxs]);

    // Group by month
    const monthSections = useMemo(() => {
        const groups: Record<string, { title: string; total: number; items: Transaction[] }> = {};

        for (const tx of accountTxs) {
            const date = new Date(tx.date);
            const key = format(date, 'yyyy-MM');
            const title = format(date, 'MMMM yyyy');

            if (!groups[key]) {
                groups[key] = { title, total: 0, items: [] };
            }
            groups[key].items.push(tx);

            // Sum expenses only for total
            if (tx.type !== 'income' && tx.systemType !== 'transfer') {
                groups[key].total += Math.abs(tx.amountCents);
            } else if (tx.systemType === 'transfer' && tx.transferFromAccountId === account?.id) {
                groups[key].total += Math.abs(tx.amountCents);
            }
        }

        return Object.entries(groups)
            .sort(([a], [b]) => b.localeCompare(a))
            .map(([key, val]) => ({ id: key, ...val }));
    }, [accountTxs, account]);

    const handleBack = () => {
        if (onDismiss) onDismiss();
        else router.back();
    };

    const handleEditSave = () => {
        refreshAccounts();
        setShowEditor(false);
    };

    const handleTransactionClose = () => {
        refreshTransactions();
        setSelectedTransactionId(null);
    };

    if (!account) {
        return (
            <View style={styles.container}>
                <Text style={styles.emptyText}>Account not found</Text>
            </View>
        );
    }

    const isCredit = account.kind === 'card';
    const hasBillingCycle = isCredit && account.billingCycleDay && account.billingCycleDay >= 1 && account.billingCycleDay <= 28;
    const windowLabel = hasBillingCycle ? 'this billing cycle' : 'this month';

    return (
        <View style={styles.container}>
            <View style={[styles.content, { paddingTop: insets.top + 16 }]}>
                {/* Header Navigation */}
                <View style={styles.headerNav}>
                    <TouchableOpacity onPress={handleBack} style={styles.navButton}>
                        <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
                    </TouchableOpacity>
                    <View style={{ flex: 1 }} />
                    <TouchableOpacity
                        onPress={() => { Haptics.selectionAsync(); setShowEditor(true); }}
                        style={styles.navButton}
                    >
                        <Ionicons name="pencil" size={20} color="#FFFFFF" />
                    </TouchableOpacity>
                </View>

                {/* Account Header */}
                <View style={styles.header}>
                    <View style={styles.accountTitle}>
                        <Text style={styles.emoji}>{account.emoji || '🧾'}</Text>
                        <Text style={styles.name}>{account.name}</Text>
                    </View>

                    <Text style={[
                        styles.balance,
                        stats.balance < 0 ? styles.balanceNegative : null
                    ]}>
                        {formatCents(stats.balance)}
                    </Text>

                    <Text style={styles.statsText}>
                        {windowLabel.charAt(0).toUpperCase() + windowLabel.slice(1)} · Added {formatCents(stats.addedThisWindow)} · Spent {formatCents(stats.spentThisWindow)}
                    </Text>

                    {hasBillingCycle && (
                        <Text style={styles.cycleText}>
                            Cycle {cycleRangeString(
                                billingCycleStart(new Date(), account.billingCycleDay!),
                                billingCycleEnd(new Date(), account.billingCycleDay!)
                            )}
                        </Text>
                    )}
                </View>

                {/* Transaction List */}
                {accountTxs.length === 0 ? (
                    <View style={styles.emptyState}>
                        <Text style={styles.emptyTitle}>No transactions yet</Text>
                    </View>
                ) : (
                    <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
                        {monthSections.map(section => (
                            <View key={section.id} style={styles.section}>
                                <View style={styles.sectionHeader}>
                                    <Text style={styles.sectionTitle}>{section.title}</Text>
                                    <Text style={styles.sectionTotal}>{formatCents(section.total)}</Text>
                                </View>

                                {section.items.map((tx, i) => {
                                    const isTransfer = tx.systemType === 'transfer';
                                    const isAdjustment = tx.systemType === 'adjustment';
                                    const isIncome = tx.type === 'income';
                                    const isTransferOut = isTransfer && tx.transferFromAccountId === account.id;

                                    let iconContent = null;
                                    let amountColor = '#FFFFFF';

                                    if (isAdjustment) {
                                        iconContent = (
                                            <View style={styles.iconCircle}>
                                                <Ionicons name="settings" size={11} color="#FFD60A" />
                                            </View>
                                        );
                                        amountColor = '#FFD60A';
                                    } else if (isTransfer) {
                                        iconContent = (
                                            <View style={[styles.iconCircle, { borderColor: '#007AFF' }]}>
                                                <Text style={{ fontSize: 10, color: '#007AFF', fontWeight: 'bold' }}>⇅</Text>
                                            </View>
                                        );
                                        amountColor = '#007AFF';
                                    } else if (isIncome) {
                                        iconContent = <Text style={styles.plusIcon}>+</Text>;
                                        amountColor = '#30D158';
                                    } else if (tx.categoryId) {
                                        // Would need to look up category emoji
                                        iconContent = <Text style={styles.txEmoji}>📝</Text>;
                                    }

                                    return (
                                        <TouchableOpacity
                                            key={tx.id}
                                            style={styles.txRow}
                                            onPress={() => { Haptics.selectionAsync(); setSelectedTransactionId(tx.id); }}
                                        >
                                            <View style={styles.txIcon}>{iconContent}</View>

                                            <View style={styles.txDetails}>
                                                <View style={styles.txAmountRow}>
                                                    <Text style={[styles.txAmount, { color: amountColor }]}>
                                                        {formatCents(Math.abs(tx.amountCents))}
                                                    </Text>
                                                    {isAdjustment && (
                                                        <View style={styles.badge}>
                                                            <Text style={styles.badgeText}>
                                                                {isIncome ? 'Adj +' : 'Adj −'}
                                                            </Text>
                                                        </View>
                                                    )}
                                                </View>
                                                <Text style={styles.txDate}>{format(new Date(tx.date), 'MMM d, yyyy')}</Text>
                                            </View>

                                            <Ionicons name="chevron-forward" size={16} color="rgba(255, 255, 255, 0.25)" />
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        ))}
                    </ScrollView>
                )}
            </View>

            {/* Edit Modal */}
            <Modal
                visible={showEditor}
                animationType="slide"
                presentationStyle="pageSheet"
                onRequestClose={() => setShowEditor(false)}
            >
                <EditAccountScreen
                    accountId={accountId}
                    onDismiss={() => setShowEditor(false)}
                    onSave={handleEditSave}
                />
            </Modal>

            {/* Transaction Detail Modal */}
            <Modal
                visible={selectedTransactionId !== null}
                animationType="slide"
                presentationStyle="pageSheet"
                onRequestClose={handleTransactionClose}
            >
                {selectedTransactionId && (
                    <TransactionDetailScreen
                        transactionId={selectedTransactionId}
                        onDismiss={handleTransactionClose}
                        onUpdate={handleTransactionClose}
                        onDelete={handleTransactionClose}
                    />
                )}
            </Modal>
        </View>
    );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000000',
    },
    content: {
        flex: 1,
        paddingHorizontal: 24,
    },

    // Navigation
    headerNav: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
    },
    navButton: {
        padding: 4,
    },

    // Header
    header: {
        marginBottom: 24,
        gap: 8,
    },
    accountTitle: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    emoji: {
        fontSize: 30,
    },
    name: {
        fontFamily: 'AvenirNextCondensed-Heavy',
        fontSize: 32,
        color: '#FFFFFF',
    },
    balance: {
        fontFamily: 'AvenirNextCondensed-Heavy',
        fontSize: 44,
        color: '#FFFFFF',
    },
    balanceNegative: {
        color: '#FF3B30',
    },
    statsText: {
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.7)',
    },
    cycleText: {
        fontSize: 12,
        color: 'rgba(255, 255, 255, 0.55)',
    },

    // Empty
    emptyState: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    emptyTitle: {
        fontFamily: 'AvenirNextCondensed-DemiBold',
        fontSize: 20,
        color: 'rgba(255, 255, 255, 0.8)',
    },
    emptyText: {
        color: 'rgba(255, 255, 255, 0.5)',
        textAlign: 'center',
        marginTop: 100,
    },

    // Scroll
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingBottom: 40,
    },

    // Sections
    section: {
        marginBottom: 20,
    },
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 8,
    },
    sectionTitle: {
        fontFamily: 'AvenirNextCondensed-DemiBold',
        fontSize: 18,
        color: '#FFFFFF',
    },
    sectionTotal: {
        fontFamily: 'AvenirNextCondensed-DemiBold',
        fontSize: 16,
        color: 'rgba(255, 255, 255, 0.8)',
    },

    // Transaction Row
    txRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        gap: 12,
    },
    txIcon: {
        width: 24,
        alignItems: 'center',
        justifyContent: 'center',
    },
    iconCircle: {
        width: 18,
        height: 18,
        borderRadius: 9,
        borderWidth: 1.6,
        borderColor: '#FFD60A',
        justifyContent: 'center',
        alignItems: 'center',
    },
    plusIcon: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#30D158',
    },
    txEmoji: {
        fontSize: 16,
    },
    txDetails: {
        flex: 1,
        gap: 2,
    },
    txAmountRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    txAmount: {
        fontFamily: 'AvenirNextCondensed-DemiBold',
        fontSize: 20,
    },
    badge: {
        paddingHorizontal: 6,
        paddingVertical: 2,
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        borderRadius: 999,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.12)',
    },
    badgeText: {
        fontSize: 11,
        fontWeight: '600',
        color: '#FFD60A',
    },
    txDate: {
        fontSize: 12,
        color: 'rgba(255, 255, 255, 0.6)',
    },
});
