/**
 * Accounts Screen - List of all accounts with balances
 * 
 * Pixel-perfect port of AccountsView.swift
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Alert,
  RefreshControl,
} from 'react-native';
import { Text } from '@/components/ui/LockedText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { Colors } from '../constants/theme';
import { formatCents } from '../lib/logic/currencyUtils';
import { computeAccountTileValueCents, getTransactionsForAccount } from '../lib/logic/accountBalance';
import { Account } from '../lib/logic/types';
import { FloatingTabSwitcher } from '../components/ui/FloatingTabSwitcher';
import { useAccounts, useTransactions } from '../lib/hooks/useData';
import { useSyncStatus } from '../lib/sync/SyncProvider';

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
  const { data: accounts, refresh: refreshAccounts } = useAccounts();
  const { data: transactions, refresh: refreshTransactions } = useTransactions();
  const { syncNow } = useSyncStatus();

  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    syncNow('manual_refresh')
      .then(() => Promise.all([refreshAccounts(), refreshTransactions()]))
      .catch((error) => {
        console.error('[Accounts] Refresh failed:', error);
      })
      .finally(() => {
        setIsRefreshing(false);
      });
  }, [syncNow, refreshAccounts, refreshTransactions]);

  // Logic to calculate balances
  const getAccountDisplay = useCallback((acc: Account) => {
    const accountTxs = getTransactionsForAccount(transactions, acc.id);
    const displayValueCents = computeAccountTileValueCents(acc, accountTxs);

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
      const txDate = new Date(tx.date);
      if (txDate < windowStart || txDate >= windowEnd) continue;

      if (tx.systemType === 'transfer') {
        if (tx.transferFromAccountId === acc.id) {
          spentThisWindow += Math.abs(tx.amountCents);
        }
        continue;
      }

      if (tx.accountId === acc.id && tx.type !== 'income') {
        spentThisWindow += Math.abs(tx.amountCents);
      }
    }

    return { displayValueCents, spentThisWindow };
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
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={handleRefresh}
                tintColor="#FFFFFF"
              />
            }
          >
            {accounts.map(acc => {
              const { displayValueCents, spentThisWindow } = getAccountDisplay(acc);
              const isCredit = acc.kind === 'card';
              const windowLabel = isCredit && acc.billingCycleDay && acc.billingCycleDay >= 1 && acc.billingCycleDay <= 28
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
                    {displayValueCents !== null && (
                      <Text style={[
                        styles.balanceText,
                        displayValueCents < 0 ? { color: '#FF3B30' } : null
                      ]}>
                        {formatCents(displayValueCents)}
                      </Text>
                    )}
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
