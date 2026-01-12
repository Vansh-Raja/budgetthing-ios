/**
 * TripHeaderCard - Summary statistics for a trip
 * 
 * Pixel-perfect port of headerCard in TripDetailView.swift
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '@/components/ui/LockedText';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';

import { Colors } from '../../constants/theme';
import { Trip, TripSummary } from '../../lib/logic/types';
import { formatCents } from '../../lib/logic/currencyUtils';

interface TripHeaderCardProps {
  trip: Trip;
  summary: TripSummary;
  currencyCode?: string;
}

export function TripHeaderCard({ trip, summary, currencyCode = 'INR' }: TripHeaderCardProps) {
  const {
    totalSpentCents,
    budgetRemainingCents,
    dailyAverageCents,
    daysCount,
    budgetPercentUsed
  } = summary;

  const budget = trip.budgetCents;

  const getProgressColor = (percent: number) => {
    if (percent >= 100) return Colors.error;
    if (percent >= 80) return Colors.accent;
    return Colors.success;
  };

  const StatItem = ({ title, value, color }: { title: string; value: string; color: string }) => (
    <View style={styles.statItem}>
      <Text style={styles.statTitle}>{title}</Text>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.statsRow}>
        <StatItem
          title="Total Spent"
          value={formatCents(Math.abs(totalSpentCents), currencyCode)}
          color="#FFFFFF"
        />

        {budget !== undefined && budget > 0 && (
          <>
            <View style={styles.divider} />
            <StatItem
              title="Remaining"
              value={formatCents(budgetRemainingCents ?? 0, currencyCode)}
              color={(budgetRemainingCents ?? 0) >= 0 ? Colors.success : Colors.error}
            />
          </>
        )}

        {daysCount > 1 && (
          <>
            <View style={styles.divider} />
            <StatItem
              title="Daily Avg"
              value={formatCents(Math.abs(dailyAverageCents), currencyCode)}
              color="rgba(255, 255, 255, 0.8)"
            />
          </>
        )}
      </View>

      {/* Budget Progress */}
      {budget !== undefined && budget > 0 && budgetPercentUsed !== undefined && (
        <View style={styles.progressContainer}>
          <View style={styles.progressHeader}>
            <Text style={styles.progressText}>
              {Math.min(Math.round(budgetPercentUsed), 100)}% of budget used
            </Text>
            <View style={{ flex: 1 }} />
            <Text style={styles.progressText}>
              {formatCents(budget, currencyCode)}
            </Text>
          </View>

          <View style={styles.progressBarBg}>
            <View
              style={[
                styles.progressBarFill,
                {
                  width: `${Math.min(budgetPercentUsed, 100)}%`,
                  backgroundColor: getProgressColor(budgetPercentUsed)
                }
              ]}
            />
          </View>
        </View>
      )}

      {/* Date Range */}
      {trip.startDate && (
        <View style={styles.dateRow}>
          <Ionicons name="calendar-outline" size={12} color="rgba(255, 255, 255, 0.5)" />
          <Text style={styles.dateText}>
            {format(new Date(trip.startDate), 'MMM d, yyyy')}
            {trip.endDate && trip.endDate !== trip.startDate && (
              ` – ${format(new Date(trip.endDate), 'MMM d, yyyy')}`
            )}
            {' · '}
            {daysCount} days
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 16,
    gap: 16,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statItem: {
    gap: 4,
  },
  statTitle: {
    fontFamily: 'System',
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.5)',
  },
  statValue: {
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 22,
  },
  divider: {
    width: 1,
    height: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    marginHorizontal: 16,
  },

  // Progress
  progressContainer: {
    gap: 6,
  },
  progressHeader: {
    flexDirection: 'row',
  },
  progressText: {
    fontFamily: 'System',
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.6)',
  },
  progressBarBg: {
    height: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },

  // Date
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dateText: {
    fontFamily: 'System',
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.5)',
  },
});
