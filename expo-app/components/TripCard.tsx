/**
 * TripCard - Displays summary of a trip
 * 
 * Pixel-perfect port of TripCard.swift
 */

import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { Text } from '@/components/ui/LockedText';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';

import { Colors } from '../constants/theme';
import { Trip } from '../lib/logic/types';
import { formatCents } from '../lib/logic/currencyUtils';

interface TripCardProps {
  trip: Trip;
  currencyCode?: string; // Default to INR if not provided
  style?: ViewStyle;
}

export function TripCard({ trip, currencyCode = 'INR', style }: TripCardProps) {
  // Total spent is computed from hydrated trip expenses.
  const totalSpentCents = trip.expenses?.reduce((sum, e) => sum + (e.transaction?.amountCents || 0), 0) || 0;
  
  // Calculate participant count
  const participantCount = trip.participants?.length || 0;
  
  // Budget progress
  const budgetCents = trip.budgetCents;
  const progress = budgetCents && budgetCents > 0 ? totalSpentCents / budgetCents : null;
  
  // Progress color logic
  const getProgressColor = (p: number) => {
    if (p >= 1.0) return Colors.error; // Red
    if (p >= 0.8) return Colors.accent; // Orange
    return Colors.success; // Green
  };

  // Date formatting
  const formatDateRange = () => {
    if (!trip.startDate) return null;
    const start = new Date(trip.startDate);
    const startStr = format(start, 'MMM d, yyyy'); // Adjust format to match "Oct 24, 2025" style
    
    if (trip.endDate && trip.endDate !== trip.startDate) {
      const end = new Date(trip.endDate);
      const endStr = format(end, 'MMM d, yyyy');
      // If same year, maybe shorten? Swift style: .date. Default is medium.
      return `${startStr} – ${endStr}`;
    }
    return startStr;
  };

  return (
    <View style={[styles.container, style]}>
      {/* Top Row */}
      <View style={styles.topRow}>
        <Text style={styles.emoji}>{trip.emoji}</Text>
        
        <View style={styles.infoColumn}>
          <Text style={styles.name} numberOfLines={1}>{trip.name}</Text>
          {trip.startDate && (
            <Text style={styles.date}>{formatDateRange()}</Text>
          )}
        </View>
        
        <View style={{ flex: 1 }} />
        
        {trip.isGroup && (
          <View style={styles.groupPill}>
            <Ionicons name="people" size={12} color="rgba(255, 255, 255, 0.5)" />
            {participantCount > 0 && (
              <Text style={styles.groupCount}>{participantCount}</Text>
            )}
          </View>
        )}
      </View>
      
      {/* Bottom Row */}
      <View style={styles.bottomRow}>
        <View>
          <Text style={styles.label}>Spent</Text>
          <Text style={styles.amount}>
            {formatCents(Math.abs(totalSpentCents), currencyCode)}
          </Text>
        </View>
        
        <View style={{ flex: 1 }} />
        
        {progress !== null && budgetCents && (
          <View style={styles.budgetColumn}>
            <Text style={styles.label}>
              of {formatCents(budgetCents, currencyCode)}
            </Text>
            
            <View style={styles.progressBarBg}>
              <View 
                style={[
                  styles.progressBarFill, 
                  { 
                    width: `${Math.min(progress * 100, 100)}%`,
                    backgroundColor: getProgressColor(progress)
                  }
                ]} 
              />
            </View>
          </View>
        )}
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
    alignItems: 'center', // Swift alignment is center? No, HStack defaults center vertical
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
  date: {
    fontFamily: 'System', // Swift .date style
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
    alignItems: 'flex-end', // Align baseline
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
  budgetColumn: {
    alignItems: 'flex-end',
    gap: 4,
  },
  progressBarBg: {
    width: 80,
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 2,
  },
});
