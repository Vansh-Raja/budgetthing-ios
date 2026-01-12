/**
 * SettleUpTab - Suggested settlements and history
 * 
 * Pixel-perfect port of TripSettleUpTab.swift
 */

import React, { useMemo } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { Text } from '@/components/ui/LockedText';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import * as Haptics from 'expo-haptics';

import { Colors } from '../../constants/theme';
import { Trip, TripSettlement, DebtRelation } from '../../lib/logic/types';
import { formatCents } from '../../lib/logic/currencyUtils';
import { TripBalanceCalculator } from '../../lib/logic/tripBalanceCalculator';

interface SettleUpTabProps {
  trip: Trip;
  currencyCode?: string;
  onRecordSettlement?: (settlement?: DebtRelation) => void;
}

export function SettleUpTab({ trip, currencyCode = 'INR', onRecordSettlement }: SettleUpTabProps) {
  // Calculate balances and suggested settlements
  const { suggestedSettlements, existingSettlements } = useMemo(() => {
    const balances = TripBalanceCalculator.calculateBalances(
      trip.participants ?? [],
      trip.expenses ?? [],
      trip.settlements ?? []
    );

    const suggested = TripBalanceCalculator.simplifyDebts(
      trip.participants ?? [],
      balances
    );

    const existing = (trip.settlements ?? []).sort((a, b) => b.date - a.date);

    return { suggestedSettlements: suggested, existingSettlements: existing };
  }, [trip]);

  const isAllSettled = suggestedSettlements.length === 0;

  return (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.container}>
        {/* Suggested Settlements Section */}
        {isAllSettled ? (
          <SettledStateView />
        ) : (
          <View style={styles.section}>
            <View style={styles.headerRow}>
              <Text style={styles.sectionHeader}>Suggested Settlements</Text>
              <View style={{ flex: 1 }} />
              <Text style={styles.countText}>
                {suggestedSettlements.length} payment{suggestedSettlements.length === 1 ? '' : 's'}
              </Text>
            </View>

            <Text style={styles.instructionText}>Tap to record a payment</Text>

            {suggestedSettlements.map((settlement) => (
              <SettlementSuggestionRow
                key={settlement.id}
                settlement={settlement}
                currencyCode={currencyCode}
                onPress={() => onRecordSettlement?.(settlement)}
              />
            ))}
          </View>
        )}

        {/* Settlement History Section */}
        {existingSettlements.length > 0 && (
          <View style={styles.section}>
            <View style={styles.headerRow}>
              <Text style={styles.sectionHeader}>Settlement History</Text>
              <View style={{ flex: 1 }} />
              <TouchableOpacity
                onPress={() => {
                  Haptics.selectionAsync();
                  onRecordSettlement?.();
                }}
                style={styles.addButton}
              >
                <Ionicons name="add" size={12} color={Colors.accent} />
                <Text style={styles.addButtonText}>Record</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.card}>
              {existingSettlements.map((settlement, index) => (
                <React.Fragment key={settlement.id}>
                  <SettlementHistoryRow settlement={settlement} currencyCode={currencyCode} />
                  {index < existingSettlements.length - 1 && <View style={styles.divider} />}
                </React.Fragment>
              ))}
            </View>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

// Sub-components

function SettledStateView() {
  return (
    <View style={styles.settledCard}>
      <Text style={styles.settledEmoji}>🎉</Text>
      <Text style={styles.settledTitle}>All Settled Up!</Text>
      <Text style={styles.settledSubtitle}>Everyone is even. No payments needed.</Text>
    </View>
  );
}

function SettlementSuggestionRow({
  settlement,
  currencyCode,
  onPress
}: {
  settlement: DebtRelation;
  currencyCode: string;
  onPress: () => void;
}) {
  // Determine perspective: is current user involved?
  const currentUserIsFrom = settlement.fromParticipant.isCurrentUser;
  const currentUserIsTo = settlement.toParticipant.isCurrentUser;

  // Text and color based on current user's perspective
  let mainText: string;
  let amountColor: string;

  if (currentUserIsFrom) {
    // You owe someone (you give money) → orange
    mainText = `You owe ${settlement.toParticipant.name}`;
    amountColor = '#FF9500'; // Hardcoded Orange
  } else if (currentUserIsTo) {
    // Someone owes you (you receive money) → green
    mainText = `${settlement.fromParticipant.name} owes You`;
    amountColor = '#34C759'; // Hardcoded Green
  } else {
    // Neither is current user, show neutral
    mainText = `${settlement.fromParticipant.name} owes ${settlement.toParticipant.name}`;
    amountColor = '#FFFFFF';
  }

  return (
    <TouchableOpacity onPress={() => { Haptics.selectionAsync(); onPress(); }} activeOpacity={0.7} style={styles.settlementRow}>
      <View style={styles.settlementTextColumn}>
        <Text style={styles.settlementMainText}>{mainText}</Text>
        <Text style={[styles.settlementAmount, { color: amountColor }]}>
          {formatCents(settlement.amountCents, currencyCode)}
        </Text>
      </View>

      <View style={{ flex: 1 }} />

      <View style={styles.payButton}>
        <Text style={styles.payButtonText}>PAY</Text>
        <Ionicons name="chevron-forward" size={12} color={Colors.accent} />
      </View>
    </TouchableOpacity>
  );
}

function SettlementHistoryRow({ settlement, currencyCode }: { settlement: TripSettlement; currencyCode: string }) {
  const fromName = settlement.fromParticipant?.isCurrentUser ? 'You' : settlement.fromParticipant?.name ?? 'Unknown';
  const toName = settlement.toParticipant?.isCurrentUser ? 'You' : settlement.toParticipant?.name ?? 'Unknown';

  return (
    <View style={styles.row}>
      <Ionicons name="checkmark-circle" size={20} color={Colors.success} style={{ marginRight: 12 }} />

      <View style={styles.infoColumn}>
        <View style={styles.historyTextRow}>
          <Text style={styles.historyName}>{fromName}</Text>
          <Text style={styles.historyText}> paid </Text>
          <Text style={styles.historyName}>{toName}</Text>
        </View>

        <Text style={styles.dateText}>
          {format(new Date(settlement.date), 'MMM d, yyyy')}
        </Text>
      </View>

      <View style={{ flex: 1 }} />

      <Text style={[styles.amount, { color: Colors.success }]}>
        {formatCents(settlement.amountCents, currencyCode)}
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

  // Settled State
  settledCard: {
    paddingVertical: 40,
    paddingHorizontal: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 16,
    alignItems: 'center',
    gap: 16,
  },
  settledEmoji: {
    fontSize: 48,
  },
  settledTitle: {
    fontFamily: 'AvenirNextCondensed-Heavy',
    fontSize: 24,
    color: '#FFFFFF',
  },
  settledSubtitle: {
    fontFamily: 'System',
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.6)',
  },

  // Section Headers
  section: {
    gap: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  sectionHeader: {
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.6)',
  },
  countText: {
    fontFamily: 'System',
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.4)',
  },
  instructionText: {
    fontFamily: 'System',
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.4)',
    paddingHorizontal: 20,
    marginTop: -8,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  addButtonText: {
    fontFamily: 'System',
    fontSize: 12,
    fontWeight: '600',
    color: Colors.accent,
  },

  // Card
  card: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 12,
    overflow: 'hidden',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    marginLeft: 20,
  },

  // Rows
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  participantColumn: {
    alignItems: 'center',
    width: 60,
    gap: 4,
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
    fontSize: 14,
    color: '#FFFFFF',
  },
  participantName: {
    fontFamily: 'System',
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.6)',
  },
  arrowColumn: {
    alignItems: 'center',
    width: 80, // Space between participants
    gap: 4,
  },
  amount: {
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 16,
    color: '#FFFFFF',
  },

  // History Row
  infoColumn: {
    gap: 2,
  },
  historyTextRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  historyName: {
    fontFamily: 'System',
    fontWeight: '600',
    fontSize: 14,
    color: '#FFFFFF',
  },
  historyText: {
    fontFamily: 'System',
    fontSize: 14,
    color: '#FFFFFF',
  },
  dateText: {
    fontFamily: 'System',
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.5)',
  },

  // Settlement Suggestion Row (new user-perspective style)
  settlementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 12,
    marginHorizontal: 20,
    marginBottom: 8,
  },
  settlementTextColumn: {
    gap: 4,
  },
  settlementMainText: {
    fontFamily: 'System',
    fontSize: 14,
    color: '#FFFFFF',
  },
  settlementAmount: {
    fontFamily: 'AvenirNextCondensed-Heavy',
    fontSize: 20,
  },
  payButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  payButtonText: {
    fontFamily: 'System',
    fontSize: 12,
    fontWeight: '600',
    color: Colors.accent,
  },
});
