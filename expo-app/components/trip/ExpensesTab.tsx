/**
 * ExpensesTab - List of expenses for a trip
 * 
 * Pixel-perfect port of TripExpensesTab.swift
 */

import React, { useMemo } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Text } from '@/components/ui/LockedText';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import * as Haptics from 'expo-haptics';

import { Colors } from '../../constants/theme';
import { useCategories } from '../../lib/hooks/useData';
import { Trip, TripExpense, Transaction, Category } from '../../lib/logic/types';
import { formatCents } from '../../lib/logic/currencyUtils';
import { TripSplitCalculator } from '../../lib/logic/tripSplitCalculator';

interface ExpensesTabProps {
  trip: Trip;
  currencyCode?: string;
  onSelectExpense?: (expense: TripExpense) => void;
}

export function ExpensesTab({ trip, currencyCode = 'INR', onSelectExpense }: ExpensesTabProps) {
  const { data: categories } = useCategories();

  const expenses = useMemo(() => {
    return (trip.expenses ?? []).sort((a, b) => {
      const dateA = a.transaction?.date ?? 0;
      const dateB = b.transaction?.date ?? 0;
      return dateB - dateA; // Descending
    });
  }, [trip.expenses]);

  const groupedExpenses = useMemo(() => {
    // ... (same as before)
    const groups: Record<string, TripExpense[]> = {};
    expenses.forEach(e => {
      const date = e.transaction?.date ? new Date(e.transaction.date) : new Date();
      const key = format(date, 'yyyy-MM-dd');
      if (!groups[key]) groups[key] = [];
      groups[key].push(e);
    });

    return Object.entries(groups)
      .sort((a, b) => b[0].localeCompare(a[0])) // Descending dates
      .map(([key, items]) => ({
        date: new Date(key),
        expenses: items,
        dayTotal: items.reduce((sum, e) => sum + (e.transaction?.amountCents || 0), 0)
      }));
  }, [expenses]);

  if (expenses.length === 0) {
    // ... (empty state)
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyEmoji}>📝</Text>
        <Text style={styles.emptyTitle}>No expenses yet</Text>
        <Text style={styles.emptySubtitle}>
          Add expenses from the calculator{'\n'}with this trip selected
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.container}>
        {groupedExpenses.map(group => (
          <View key={group.date.toISOString()} style={styles.dateSection}>
            {/* Date Header */}
            <View style={styles.dateHeader}>
              <Text style={styles.dateText}>{format(group.date, 'MMM d, yyyy')}</Text>
              <View style={{ flex: 1 }} />
              <Text style={styles.dateText}>{formatCents(group.dayTotal, currencyCode)}</Text>
            </View>

            {/* Expense Rows */}
            {group.expenses.map((expense, index) => (
              <React.Fragment key={expense.id}>
                <ExpenseRow
                  expense={expense}
                  trip={trip}
                  categories={categories}
                  currencyCode={currencyCode}
                  onPress={() => onSelectExpense?.(expense)}
                />
                {index < group.expenses.length - 1 && <View style={styles.divider} />}
              </React.Fragment>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function ExpenseRow({
  expense,
  trip,
  categories,
  currencyCode,
  onPress
}: {
  expense: TripExpense;
  trip: Trip;
  categories: Category[];
  currencyCode: string;
  onPress: () => void;
}) {
  const transaction = expense.transaction!;
  const paidBy = expense.paidByParticipant;

  const category = useMemo(() =>
    categories.find(c => c.id === transaction.categoryId),
    [categories, transaction.categoryId]
  );

  const displayTitle = transaction.note && transaction.note.trim().length > 0
    ? transaction.note
    : category?.name
    ?? 'Expense';

  // Calculate net info
  // ... (rest of logic)
  const netInfo = useMemo(() => {
    if (!trip.isGroup || !paidBy) return null;

    const currentUser = trip.participants?.find(p => p.isCurrentUser);
    if (!currentUser) return null;

    // Calculate splits if not stored
    const totalAmount = Math.abs(transaction.amountCents);
    const splits = expense.computedSplits || TripSplitCalculator.calculateSplits(
      totalAmount,
      expense.splitType,
      trip.participants ?? [],
      expense.splitData
    );

    const myShare = splits[currentUser.id] ?? 0;

    if (paidBy.id === currentUser.id) {
      const netBack = totalAmount - myShare;
      if (netBack <= 0) return { text: 'Settled', color: 'rgba(255, 255, 255, 0.4)' };
      return { text: `You get back ${formatCents(netBack, currencyCode)}`, color: Colors.success };
    } else {
      if (myShare <= 0) return { text: 'Not included', color: 'rgba(255, 255, 255, 0.35)' };
      return { text: `You owe ${paidBy.name} ${formatCents(myShare, currencyCode)}`, color: Colors.accent };
    }
  }, [trip, expense, transaction, paidBy, currencyCode]);

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={styles.row}>
      <View style={styles.rowContent}>
        {/* Emoji/Icon */}
        <View style={styles.iconContainer}>
          <Text style={styles.iconEmoji}>{category?.emoji || (transaction.categoryId ? '🍔' : '📝')}</Text>
        </View>

        {/* Main Info */}
        <View style={styles.mainInfo}>
          <Text style={styles.title} numberOfLines={1}>
            {displayTitle}
          </Text>

          {trip.isGroup && paidBy && (
            <View style={styles.paidByContainer}>
              <View style={[styles.dot, { backgroundColor: '#' + (paidBy.colorHex || 'FF9500') }]} />
              <Text style={styles.paidByText}>
                {paidBy.isCurrentUser ? 'You paid' : `${paidBy.name} paid`}
              </Text>
            </View>
          )}
        </View>

        <View style={{ flex: 1 }} />

        {/* Amount Info */}
        <View style={styles.amountInfo}>
          <Text style={styles.amount}>{formatCents(Math.abs(transaction.amountCents), currencyCode)}</Text>

          {netInfo && (
            <Text style={[styles.netInfo, { color: netInfo.color }]}>
              {netInfo.text}
            </Text>
          )}
        </View>

        <Ionicons name="chevron-forward" size={12} color="rgba(255, 255, 255, 0.3)" />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 40,
  },
  scrollContent: {
    paddingTop: 0,
  },

  // Empty State
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    marginTop: 100,
  },
  emptyEmoji: {
    fontSize: 48,
  },
  emptyTitle: {
    fontFamily: 'AvenirNextCondensed-Heavy',
    fontSize: 28,
    color: '#FFFFFF',
  },
  emptySubtitle: {
    fontFamily: 'System',
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.6)',
    textAlign: 'center',
    lineHeight: 20,
  },

  // Date Section
  dateSection: {
    marginBottom: 0,
  },
  dateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  dateText: {
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.5)',
  },

  // Rows
  row: {
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  rowContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    marginLeft: 72, // 20 pad + 40 icon + 12 gap
  },

  // Icon
  iconContainer: {
    width: 40,
    height: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconEmoji: {
    fontSize: 24,
  },

  // Info
  mainInfo: {
    gap: 2,
  },
  title: {
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 16,
    color: '#FFFFFF',
  },
  paidByContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  paidByText: {
    fontFamily: 'System',
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.5)',
  },

  // Amount
  amountInfo: {
    alignItems: 'flex-end',
    gap: 2,
  },
  amount: {
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 20,
    color: '#FFFFFF',
  },
  netInfo: {
    fontFamily: 'System',
    fontSize: 10,
  },
});
