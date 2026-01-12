/**
 * BalancesTab - Displays who owes whom
 * 
 * Pixel-perfect port of TripBalancesTab.swift
 */

import React, { useMemo } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text } from '@/components/ui/LockedText';
import { Ionicons } from '@expo/vector-icons';

import { Colors } from '../../constants/theme';
import { Trip, ParticipantBalance } from '../../lib/logic/types';
import { formatCents } from '../../lib/logic/currencyUtils';
import { TripBalanceCalculator } from '../../lib/logic/tripBalanceCalculator';
import { TripSummaryCalculator } from '../../lib/logic/tripSummaryCalculator';

interface BalancesTabProps {
  trip: Trip;
  currencyCode?: string;
}

export function BalancesTab({ trip, currencyCode = 'INR' }: BalancesTabProps) {
  // Memoize balances calculation
  const balances = useMemo(() => {
    return TripBalanceCalculator.calculateBalances(
      trip.participants ?? [],
      trip.expenses ?? [],
      trip.settlements ?? []
    ).sort((a, b) => Math.abs(b.netBalanceCents) - Math.abs(a.netBalanceCents));
  }, [trip]);

  // Current user summary
  const currentUserSummary = useMemo(() => {
    return TripBalanceCalculator.currentUserSummary(balances);
  }, [balances]);

  // Spending breakdown
  const spending = useMemo(() => {
    return TripSummaryCalculator.participantSpending(
      trip.expenses ?? [],
      (trip.participants ?? []).reduce((acc, p) => ({ ...acc, [p.id]: p }), {})
    );
  }, [trip]);

  if ((trip.participants ?? []).length === 0) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyEmoji}>👥</Text>
        <Text style={styles.emptyTitle}>No participants yet</Text>
        <Text style={styles.emptySubtitle}>
          Add participants to track{'\n'}who owes what
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
        {/* Your Summary Card */}
        <YourSummaryCard summary={currentUserSummary} currencyCode={currencyCode} />

        {/* Everyone's Balance */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>Everyone's Balance</Text>
          <View style={styles.card}>
            {balances.map((balance, index) => (
              <React.Fragment key={balance.id}>
                <ParticipantBalanceRow balance={balance} currencyCode={currencyCode} />
                {index < balances.length - 1 && <View style={styles.divider} />}
              </React.Fragment>
            ))}
          </View>
        </View>

        {/* Spending Breakdown */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>Who Paid What</Text>
          <View style={styles.card}>
            {spending.map((entry, index) => (
              <React.Fragment key={entry.participant.id}>
                <SpendingRow entry={entry} currencyCode={currencyCode} />
                {index < spending.length - 1 && <View style={styles.divider} />}
              </React.Fragment>
            ))}
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

// Sub-components

function YourSummaryCard({ summary, currencyCode }: { summary: { owesCents: number; getsBackCents: number }, currencyCode: string }) {
  const { owesCents, getsBackCents } = summary;

  let content;
  if (owesCents > 0) {
    content = (
      <View style={styles.summaryContent}>
        <Text style={styles.summaryLabel}>You owe</Text>
        <Text style={[styles.summaryAmount, { color: Colors.accent }]}>
          {formatCents(owesCents, currencyCode)}
        </Text>
      </View>
    );
  } else if (getsBackCents > 0) {
    content = (
      <View style={styles.summaryContent}>
        <Text style={styles.summaryLabel}>You get back</Text>
        <Text style={[styles.summaryAmount, { color: Colors.success }]}>
          {formatCents(getsBackCents, currencyCode)}
        </Text>
      </View>
    );
  } else {
    content = (
      <View style={styles.summaryContent}>
        <Text style={styles.summaryLabel}>You're all settled up!</Text>
        <Ionicons name="checkmark-circle" size={32} color={Colors.success} style={{ marginTop: 4 }} />
      </View>
    );
  }

  return (
    <View style={styles.summaryCard}>
      {content}
    </View>
  );
}

function ParticipantBalanceRow({ balance, currencyCode }: { balance: ParticipantBalance; currencyCode: string }) {
  const owesOrGets = balance.netBalanceCents > 0 ? 'gets back' : balance.netBalanceCents < 0 ? 'owes' : 'settled';
  const color = balance.netBalanceCents > 0 ? Colors.success : balance.netBalanceCents < 0 ? Colors.accent : 'rgba(255, 255, 255, 0.6)';

  return (
    <View style={styles.row}>
      {/* Avatar */}
      <View style={[styles.avatar, { backgroundColor: '#' + (balance.colorHex || 'FF9500') }]}>
        <Text style={styles.avatarText}>
          {balance.participantName.charAt(0).toUpperCase()}
        </Text>
      </View>

      {/* Name & Paid */}
      <View style={styles.infoColumn}>
        <Text style={styles.name}>{balance.isCurrentUser ? 'You' : balance.participantName}</Text>
        <Text style={styles.subtitle}>Paid {formatCents(balance.totalPaidCents, currencyCode)}</Text>
      </View>

      <View style={{ flex: 1 }} />

      {/* Balance */}
      <View style={styles.amountColumn}>
        <Text style={[styles.amount, { color }]}>
          {formatCents(Math.abs(balance.netBalanceCents), currencyCode)}
        </Text>
        <Text style={styles.subtitle}>{owesOrGets}</Text>
      </View>
    </View>
  );
}

function SpendingRow({ entry, currencyCode }: { entry: { participant: any, amountCents: number }, currencyCode: string }) {
  return (
    <View style={styles.row}>
      <View style={[styles.avatarSmall, { backgroundColor: '#' + (entry.participant.colorHex || 'FF9500') }]}>
        <Text style={styles.avatarTextSmall}>
          {entry.participant.name.charAt(0).toUpperCase()}
        </Text>
      </View>

      <Text style={styles.nameSmall}>
        {entry.participant.isCurrentUser ? 'You' : entry.participant.name}
      </Text>

      <View style={{ flex: 1 }} />

      <Text style={styles.amountSmall}>
        {formatCents(Math.abs(entry.amountCents), currencyCode)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
    gap: 24,
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
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 20,
    color: '#FFFFFF',
  },
  emptySubtitle: {
    fontFamily: 'System',
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.6)',
    textAlign: 'center',
    lineHeight: 20,
  },

  // Summary Card
  summaryCard: {
    paddingVertical: 24,
    paddingHorizontal: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 16,
    alignItems: 'center',
  },
  summaryContent: {
    alignItems: 'center',
    gap: 4,
  },
  summaryLabel: {
    fontFamily: 'System',
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.6)',
  },
  summaryAmount: {
    fontFamily: 'AvenirNextCondensed-Heavy',
    fontSize: 36,
  },

  // Sections
  section: {
    gap: 12,
  },
  sectionHeader: {
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.6)',
    paddingHorizontal: 4,
  },
  card: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 12,
    overflow: 'hidden',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    marginLeft: 72,
  },

  // Rows
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 16,
    color: '#FFFFFF',
  },
  infoColumn: {
    gap: 2,
  },
  name: {
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 16,
    color: '#FFFFFF',
  },
  subtitle: {
    fontFamily: 'System',
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.5)',
  },
  amountColumn: {
    alignItems: 'flex-end',
    gap: 2,
  },
  amount: {
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 18,
  },

  // Small Row
  avatarSmall: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarTextSmall: {
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 12,
    color: '#FFFFFF',
  },
  nameSmall: {
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 14,
    color: '#FFFFFF',
  },
  amountSmall: {
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 16,
    color: '#FFFFFF',
  },
});
