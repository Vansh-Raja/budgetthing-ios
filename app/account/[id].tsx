/**
 * Account Detail Screen
 * 
 * Pixel-perfect port of AccountDetailView.swift
 * Shows account balance and transaction history grouped by month.
 */

import React, { useMemo, useState, useCallback, useEffect } from 'react';
import {
    View,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    StatusBar,
    Modal,
} from 'react-native';
import { Text } from '@/components/ui/LockedText';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { format, startOfMonth, endOfMonth, setDate, addMonths, subMonths, getDate } from 'date-fns';

import { Colors } from '../../constants/theme';
import { formatCents } from '../../lib/logic/currencyUtils';
import { Transaction } from '../../lib/logic/types';
import { useAccounts, useTransactions, useCategories } from '../../lib/hooks/useData';
import { TransactionDetailScreen } from '../../screens/TransactionDetailScreen';
import { EditAccountScreen } from '../../screens/EditAccountScreen';
import { SharedTripRepository } from '../../lib/db/sharedTripRepositories';
import { TripExpenseRepository } from '../../lib/db/repositories';

// ============================================================================
// Helpers
// ============================================================================

function billingCycleStart(reference: Date, day: number): Date {
    const todayDay = getDate(reference);
    if (todayDay < day) {
        return setDate(subMonths(reference, 1), day);
    }
    return setDate(reference, day);
}

function billingCycleEnd(reference: Date, day: number): Date {
    const start = billingCycleStart(reference, day);
    return addMonths(start, 1);
}

// ============================================================================
// Main Component
// ============================================================================

export default function AccountDetailScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const insets = useSafeAreaInsets();

    const { data: accounts, refresh: refreshAccounts } = useAccounts();
    const { data: allTransactions, refresh: refreshTxs } = useTransactions();
    const { data: categories } = useCategories();

    const [editingTx, setEditingTx] = useState<Transaction | null>(null);
    const [showEditor, setShowEditor] = useState(false);

    const [sharedExpenseMeta, setSharedExpenseMeta] = useState<Record<string, {
        tripId: string;
        tripEmoji: string;
        categoryEmoji: string | null;
        categoryName: string | null;
        amountCents: number;
    }>>({});

    const [localExpenseMeta, setLocalExpenseMeta] = useState<Record<string, {
        tripId: string;
        tripEmoji: string;
        categoryEmoji: string | null;
        categoryName: string | null;
        amountCents: number;
    }>>({});

    const account = accounts.find(a => a.id === id);

    // Filter transactions for this account
    const accountTxs = useMemo(() => {
        if (!id || !allTransactions) return [];
        return allTransactions.filter(t =>
            t.accountId === id ||
            t.transferFromAccountId === id ||
            t.transferToAccountId === id
        ).sort((a, b) => b.date - a.date);
    }, [id, allTransactions]);

    // For derived cashflow rows, fetch shared trip expense meta so we can render a meaningful emoji.
    useEffect(() => {
        const expenseIds = accountTxs
            .filter((t) => t.systemType === 'trip_cashflow' && t.sourceTripExpenseId)
            .map((t) => t.sourceTripExpenseId!)
            .filter(Boolean);

        let cancelled = false;

        SharedTripRepository.getExpenseMetaByIds(expenseIds)
            .then((map) => {
                if (!cancelled) setSharedExpenseMeta(map);
            })
            .catch(() => {
                if (!cancelled) setSharedExpenseMeta({});
            });

        TripExpenseRepository.getExpenseMetaByIds(expenseIds)
            .then((map) => {
                if (!cancelled) setLocalExpenseMeta(map);
            })
            .catch(() => {
                if (!cancelled) setLocalExpenseMeta({});
            });

        return () => {
            cancelled = true;
        };
    }, [accountTxs]);

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
            windowEnd = new Date(windowEnd.getTime() + 86400000); // Make exclusive
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
            if (account.limitAmountCents !== undefined) {
                // Available credit
                balance = account.limitAmountCents - expensesAll + incomesAll;
            } else {
                // No limit set: show outstanding (spent − added)
                balance = expensesAll - incomesAll;
            }
        } else {
            // Balance = opening + incomes − expenses
            balance = (account.openingBalanceCents || 0) + incomesAll - expensesAll;
        }

        return { balance, spentThisWindow, addedThisWindow };
    }, [account, accountTxs]);

    // Group by month
    const sections = useMemo(() => {
        const groups: Record<string, { title: string; total: number; items: Transaction[] }> = {};

        for (const tx of accountTxs) {
            const date = new Date(tx.date);
            const key = format(date, 'yyyy-MM');
            const title = format(date, 'MMMM yyyy');

            if (!groups[key]) {
                groups[key] = { title, total: 0, items: [] };
            }
            groups[key].items.push(tx);

            // Sum expenses for total (not income, not transfers in)
            const isTransfer = tx.systemType === 'transfer';
            if (isTransfer) {
                if (tx.transferFromAccountId === id) {
                    groups[key].total += Math.abs(tx.amountCents);
                }
            } else if (tx.type !== 'income') {
                groups[key].total += Math.abs(tx.amountCents);
            }
        }

        return Object.entries(groups)
            .sort(([a], [b]) => b.localeCompare(a))
            .map(([key, val]) => ({ id: key, ...val }));
    }, [accountTxs, id]);

    const getCategory = useCallback((catId: string | null | undefined) => {
        if (!catId) return undefined;
        return categories.find(c => c.id === catId);
    }, [categories]);

    const handleTransactionPress = (tx: Transaction) => {
        Haptics.selectionAsync();
        setEditingTx(tx);
    };

    const handleTxDismiss = () => {
        setEditingTx(null);
        refreshTxs();
    };

    const handleEditDismiss = () => {
        setShowEditor(false);
        refreshAccounts();
    };

    const windowLabel = (account?.kind === 'card' && account?.billingCycleDay && account.billingCycleDay >= 1 && account.billingCycleDay <= 28)
        ? 'This billing cycle'
        : 'This month';

    if (!account) {
        return (
            <View style={styles.container}>
                <StatusBar barStyle="light-content" />
                <Text style={styles.emptyText}>Account not found</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <Stack.Screen options={{ headerShown: false }} />
            <StatusBar barStyle="light-content" />

            <View style={[styles.content, { paddingTop: insets.top + 12 }]}>
                {/* Navigation */}
                <View style={styles.nav}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.navButton}>
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

                {/* Account Header - Left Aligned */}
                <View style={styles.header}>
                    <View style={styles.titleRow}>
                        <Text style={styles.emoji}>{account.emoji || '🧾'}</Text>
                        <Text style={styles.accountName}>{account.name}</Text>
                    </View>

                    <Text style={[
                        styles.balance,
                        stats.balance < 0 && styles.balanceNegative
                    ]}>
                        {formatCents(stats.balance)}
                    </Text>

                    <Text style={styles.statsText}>
                        {windowLabel} · Added {formatCents(stats.addedThisWindow)} · Spent {formatCents(stats.spentThisWindow)}
                    </Text>
                </View>

                {/* Transaction List */}
                {accountTxs.length === 0 ? (
                    <View style={styles.emptyState}>
                        <Text style={styles.emptyStateText}>No transactions yet</Text>
                    </View>
                ) : (
                    <ScrollView
                        style={styles.scrollView}
                        contentContainerStyle={styles.scrollContent}
                        showsVerticalScrollIndicator={false}
                    >
                        {sections.map(section => (
                            <View key={section.id} style={styles.section}>
                                {/* Section Header */}
                                <View style={styles.sectionHeader}>
                                    <Text style={styles.sectionTitle}>{section.title}</Text>
                                    <Text style={styles.sectionTotal}>{formatCents(section.total)}</Text>
                                </View>

                                {/* Transaction Rows */}
                                {section.items.map((tx, idx) => {
                                    const category = getCategory(tx.categoryId);
                                    const isTransfer = tx.systemType === 'transfer';
                                    const isIncome = tx.type === 'income';
                                    const isTransferIn = isTransfer && tx.transferToAccountId === id;
                                    const isTransferOut = isTransfer && tx.transferFromAccountId === id;

                                    // Get other account name for transfers
                                    let otherAccountName = '';
                                    if (isTransfer) {
                                        const otherId = isTransferIn ? tx.transferFromAccountId : tx.transferToAccountId;
                                        const other = accounts.find(a => a.id === otherId);
                                        otherAccountName = other?.name || 'Account';
                                    }

                                    // Determine display
                                    let displayEmoji = category?.emoji || '📝';

                                    if (tx.systemType === 'trip_cashflow' && tx.sourceTripExpenseId) {
                                        const meta = sharedExpenseMeta[tx.sourceTripExpenseId] ?? localExpenseMeta[tx.sourceTripExpenseId];
                                        displayEmoji = meta?.categoryEmoji ?? meta?.tripEmoji ?? '🧾';
                                    }
                                    if (isTransfer) {
                                        displayEmoji = ''; // We'll use icon instead
                                    }

                                    const showGreen = isIncome || isTransferIn;
                                    const txDate = new Date(tx.date);
                                    const cashflowMeta = (tx.systemType === 'trip_cashflow' && tx.sourceTripExpenseId)
                                        ? (sharedExpenseMeta[tx.sourceTripExpenseId] ?? localExpenseMeta[tx.sourceTripExpenseId])
                                        : undefined;

                                    return (
                                        <TouchableOpacity
                                            key={tx.id}
                                            style={styles.txRow}
                                            onPress={() => handleTransactionPress(tx)}
                                            activeOpacity={0.7}
                                        >
                                            {/* Left: Emoji or Transfer Icon */}
                                            <View style={styles.txIconContainer}>
                                                {isTransfer ? (
                                                    <Ionicons
                                                        name="swap-horizontal"
                                                        size={16}
                                                        color="rgba(255,255,255,0.6)"
                                                    />
                                                ) : (
                                                    <Text style={styles.txEmoji}>{displayEmoji}</Text>
                                                )}
                                            </View>

                                            {/* Center: Amount (prominent) + Date */}
                                            <View style={styles.txInfo}>
                                                <Text style={[
                                                    styles.txAmount,
                                                    showGreen && styles.txAmountGreen
                                                ]}>
                                                    {showGreen ? '+' : ''}{formatCents(Math.abs(tx.amountCents))}
                                                </Text>
                                                <Text style={styles.txDate}>
                                                    {format(txDate, 'd MMMM yyyy')}{cashflowMeta?.tripEmoji ? ` · ${cashflowMeta.tripEmoji}` : ''}
                                                </Text>
                                            </View>

                                            {/* Right: Chevron */}
                                            <Ionicons
                                                name="chevron-forward"
                                                size={16}
                                                color="rgba(255,255,255,0.3)"
                                            />
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        ))}
                    </ScrollView>
                )}
            </View>

            {/* Transaction Detail Modal */}
            <Modal
                visible={!!editingTx}
                animationType="slide"
                presentationStyle="fullScreen"
                onRequestClose={handleTxDismiss}
            >
                {editingTx && (
                    <TransactionDetailScreen
                        transactionId={editingTx.id}
                        onDismiss={handleTxDismiss}
                        onUpdate={handleTxDismiss}
                        onDelete={handleTxDismiss}
                    />
                )}
            </Modal>

            {/* Edit Account Modal */}
            <Modal
                visible={showEditor}
                animationType="slide"
                presentationStyle="pageSheet"
                onRequestClose={handleEditDismiss}
            >
                <EditAccountScreen
                    accountId={id}
                    onDismiss={handleEditDismiss}
                    onSave={handleEditDismiss}
                />
            </Modal>
        </View>
    );
}

// ============================================================================
// Styles - Matching Swift AccountDetailView
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
    nav: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 20,
    },
    navButton: {
        padding: 4,
    },

    // Header - Left Aligned (matching Swift)
    header: {
        marginBottom: 32,
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 8,
    },
    emoji: {
        fontSize: 30,
    },
    accountName: {
        fontFamily: 'AvenirNextCondensed-Heavy',
        fontSize: 32,
        color: '#FFFFFF',
    },
    balance: {
        fontFamily: 'AvenirNextCondensed-Heavy',
        fontSize: 44,
        color: '#FFFFFF',
        marginBottom: 4,
    },
    balanceNegative: {
        color: '#FF3B30',
    },
    statsText: {
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.7)',
    },

    // Empty State
    emptyState: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    emptyStateText: {
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
        paddingBottom: 60,
    },

    // Section
    section: {
        marginBottom: 24,
    },
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    sectionTitle: {
        fontFamily: 'AvenirNextCondensed-DemiBold',
        fontSize: 18,
        color: '#FFFFFF',
    },
    sectionTotal: {
        fontFamily: 'AvenirNextCondensed-DemiBold',
        fontSize: 16,
        color: 'rgba(255, 255, 255, 0.6)',
    },

    // Transaction Row - Amount on left, prominent (matching Swift)
    txRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        gap: 12,
    },
    txIconContainer: {
        width: 28,
        alignItems: 'center',
    },
    txEmoji: {
        fontSize: 20,
    },
    txInfo: {
        flex: 1,
        gap: 2,
    },
    txAmount: {
        fontFamily: 'AvenirNextCondensed-DemiBold',
        fontSize: 20,
        color: '#FFFFFF',
    },
    txAmountGreen: {
        color: '#30D158',
    },
    txDate: {
        fontSize: 12,
        color: 'rgba(255, 255, 255, 0.5)',
    },
});
