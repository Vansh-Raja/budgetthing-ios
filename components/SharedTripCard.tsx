import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { Text } from '@/components/ui/LockedText';
import { Ionicons } from '@expo/vector-icons';

import { Colors } from '../constants/theme';
import { formatCents } from '../lib/logic/currencyUtils';
import type { SharedTripSummary } from '../lib/db/sharedTripRepositories';

interface SharedTripCardProps {
  trip: SharedTripSummary;
  style?: ViewStyle;
}

export function SharedTripCard({ trip, style }: SharedTripCardProps) {
  const currencyCode = 'INR';

  return (
    <View style={[styles.container, style]}>
      <View style={styles.topRow}>
        <Text style={styles.emoji}>{trip.emoji}</Text>

        <View style={styles.infoColumn}>
          <Text style={styles.name} numberOfLines={1}>{trip.name}</Text>
          <Text style={styles.subtle}>Shared trip</Text>
        </View>

        <View style={{ flex: 1 }} />

        <View style={styles.groupPill}>
          <Ionicons name="people" size={12} color="rgba(255, 255, 255, 0.5)" />
          {trip.participantCount > 0 && (
            <Text style={styles.groupCount}>{trip.participantCount}</Text>
          )}
        </View>
      </View>

      <View style={styles.bottomRow}>
        <View>
          <Text style={styles.label}>Spent</Text>
          <Text style={styles.amount}>{formatCents(Math.abs(trip.totalSpentCents), currencyCode)}</Text>
        </View>

        <View style={{ flex: 1 }} />

        <Text style={styles.sharedBadge}>SYNC</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    gap: 10,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  emoji: {
    fontSize: 24,
  },
  infoColumn: {
    gap: 2,
  },
  name: {
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 20,
    color: '#FFFFFF',
  },
  subtle: {
    fontFamily: 'System',
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.5)',
  },
  groupPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 9999,
  },
  groupCount: {
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.5)',
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  label: {
    fontFamily: 'System',
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.5)',
    marginBottom: 2,
  },
  amount: {
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 18,
    color: '#FFFFFF',
  },
  sharedBadge: {
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 12,
    color: Colors.accent,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255, 149, 0, 0.35)',
    backgroundColor: 'rgba(255, 149, 0, 0.10)',
  },
});
