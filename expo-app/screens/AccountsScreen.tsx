/**
 * Accounts Screen - List of all accounts with balances
 * 
 * Pixel-perfect port of AccountsView.swift
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { format } from 'date-fns';

import { Colors } from '../constants/theme';
import { formatCents } from '../lib/logic/currencyUtils';
import { Account, Transaction, AccountKind } from '../lib/logic/types';
import { FloatingTabSwitcher } from '../components/ui/FloatingTabSwitcher';
import { useAccounts, useTransactions } from '../lib/hooks/useData';

// ============================================================================
// Types & Props
// ============================================================================

interface AccountsScreenProps {
  selectedIndex: number;
  onSelectIndex: (index: number) => void;
}

// ============================================================================
// Logic Helpers
// ============================================================================

function billingCycleStart(reference: Date, day: number): Date {
  const year = reference.getFullYear();
  const month = reference.getMonth(); // 0-based
  const todayDay = reference.getDate();

  // If today is before billing day, cycle started last month
  let startMonth = month;
  let startYear = year;

  if (todayDay < day) {
    if (month === 0) {
      startMonth = 11;
      startYear = year - 1;
    } else {
      startMonth = month - 1;
    }
  }

  return new Date(startYear, startMonth, day, 0, 0, 0, 0);
}

function billingCycleEnd(reference: Date, day: number): Date {
  const start = billingCycleStart(reference, day);
  // Add 1 month
  const d = new Date(start);
  d.setMonth(d.getMonth() + 1);
  return d;
}

// ============================================================================
// Main Component
// ============================================================================

export function AccountsScreen({ selectedIndex, onSelectIndex }: AccountsScreenProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: accounts } = useAccounts();
  const { data: transactions } = useTransactions();

  // Logic to calculate balances
  const getAccountDisplay = useCallback((acc: Account) => {
    // Filter transactions for this account
    // Logic: 
    // 1. Account is primary (expense/income)
    // 2. Transfer FROM this account (treated as expense)
    // 3. Transfer TO this account (treated as income)

    const accountTxs = transactions.filter(tx =>
      tx.accountId === acc.id ||
      tx.transferFromAccountId === acc.id ||
      tx.transferToAccountId === acc.id
    );

    // Calculate total incomes and expenses
    let expensesAll = 0;
    let incomesAll = 0;
    let spentThisWindow = 0;

    const now = new Date();

    // Determine window
    let windowStart: Date;
    let windowEnd: Date;

    if (acc.kind === 'card' && acc.billingCycleDay && acc.billingCycleDay >= 1 && acc.billingCycleDay <= 28) {
      windowStart = billingCycleStart(now, acc.billingCycleDay);
      windowEnd = billingCycleEnd(now, acc.billingCycleDay);
    } else {
      // Calendar month
      windowStart = new Date(now.getFullYear(), now.getMonth(), 1);
      windowEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    }

    for (const tx of accountTxs) {
      const isTransfer = tx.systemType === 'transfer';
      const isFrom = tx.accountId === acc.id || tx.transferFromAccountId === acc.id;
      const isTo = tx.transferToAccountId === acc.id; // Only for transfers

      const amount = Math.abs(tx.amountCents); // Assuming stored as negative for expense? 
      // Wait, types.ts says amountCents. Swift uses Decimal. 
      // In Swift mock: 
      // Expense: negative. Income: positive.
      // Transfer: Amount is usually positive in Swift if simple transfer?
      // Let's assume signed.

      let val = tx.amountCents;
      let isExpense = false;
      let isIncome = false;

      if (isTransfer) {
        // If systemType='transfer', logic is specific
        if (tx.transferFromAccountId === acc.id) isExpense = true;
        if (tx.transferToAccountId === acc.id) isIncome = true;
        val = Math.abs(val); // Transfer amount is magnitude
      } else {
        if (tx.type === 'income') {
          isIncome = true;
          val = Math.abs(val);
        } else {
          isExpense = true;
          val = Math.abs(val);
        }
      }

      if (isExpense) expensesAll += val;
      if (isIncome) incomesAll += val;

      // Window calculation
      const txDate = new Date(tx.date);
      if (txDate >= windowStart && txDate < windowEnd) {
        if (isExpense) spentThisWindow += val;
        // Credit card: refunds (income) reduce spent? Swift: 
        // "Spent ... this month" usually refers to outflows.
        // Swift code: 
        // let spentThisMonth = txs.filter { ... && inWindow($0) && (type != income || isTransfer) }.reduce...
        // So it sums expenses/transfers-out.
      }
    }

    let balance = 0;
    if (acc.kind === 'card') {
      // Available = limit - expenses + incomes
      // Assuming limit is positive cents
      balance = (acc.limitAmountCents || 0) - expensesAll + incomesAll;
    } else {
      // Balance = opening + incomes - expenses
      balance = (acc.openingBalanceCents || 0) + incomesAll - expensesAll;
    }

    return { balance, spentThisWindow };
  }, [transactions]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      <View style={[styles.content, { paddingTop: insets.top + 20 }]}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Accounts</Text>
          <View style={{ flex: 1 }} />
          <TouchableOpacity
            onPress={() => {
              Haptics.selectionAsync();
              router.push('/settings/accounts');
            }}
            style={styles.manageButton}
          >
            <Text style={styles.manageButtonText}>Manage</Text>
          </TouchableOpacity>
        </View>

        {accounts.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No accounts yet</Text>
            <TouchableOpacity
              onPress={() => { Haptics.selectionAsync(); Alert.alert("Add", "Go to Settings"); }}
              style={styles.manageButton}
            >
              <Text style={styles.manageButtonText}>Add in Settings</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.scrollContent}>
            {accounts.map(acc => {
              const { balance, spentThisWindow } = getAccountDisplay(acc);
              const isCredit = acc.kind === 'card';
              const windowLabel = isCredit && acc.billingCycleDay
                ? 'this billing cycle'
                : 'this month';

              return (
                <TouchableOpacity
                  key={acc.id}
                  onPress={() => {
                    Haptics.selectionAsync();
                    router.push(`/account/${acc.id}`);
                  }}
                  activeOpacity={0.7}
                  style={styles.card}
                >
                  <View style={styles.cardHeader}>
                    <View style={styles.emojiContainer}>
                      <Text style={styles.emoji}>{acc.emoji || '🧾'}</Text>
                    </View>
                    <Text style={styles.cardTitle}>{acc.name}</Text>
                    <View style={{ flex: 1 }} />
                    <Text style={[
                      styles.balanceText,
                      balance < 0 ? { color: '#FF3B30' } : null
                    ]}>
                      {formatCents(balance)}
                    </Text>
                  </View>

                  <Text style={styles.spentText}>
                    Spent {formatCents(Math.abs(spentThisWindow))} {windowLabel}
                  </Text>
                </TouchableOpacity>
              );
            })}

            {/* Transfer Button */}
            <TouchableOpacity
              onPress={() => {
                Haptics.selectionAsync();
                router.push('/transfer');
              }}
              style={styles.transferButton}
            >
              <Text style={styles.transferButtonText}>Transfer Money</Text>
            </TouchableOpacity>
          </ScrollView>
        )}
      </View>

      <FloatingTabSwitcher
        selectedIndex={selectedIndex}
        onSelectIndex={onSelectIndex}
      />
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

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerTitle: {
    fontFamily: 'AvenirNextCondensed-Heavy',
    fontSize: 36,
    color: '#FFFFFF',
  },
  manageButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 9999,
  },
  manageButtonText: {
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 18,
    color: '#FFFFFF',
  },

  // Empty State
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  emptyTitle: {
    fontFamily: 'AvenirNextCondensed-Heavy',
    fontSize: 28,
    color: '#FFFFFF',
  },

  // List
  scrollContent: {
    gap: 12,
    paddingBottom: 100,
  },

  // Card
  card: {
    padding: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    gap: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  emojiContainer: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emoji: {
    fontSize: 22,
  },
  cardTitle: {
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 22,
    color: '#FFFFFF',
  },
  balanceText: {
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 18,
    color: 'rgba(255, 255, 255, 0.85)',
  },
  spentText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.6)',
  },

  // Transfer Button
  transferButton: {
    marginTop: 8,
    marginBottom: 4,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    alignSelf: 'flex-start',
  },
  transferButtonText: {
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 18,
    color: '#FFFFFF',
  },
});
