/**
 * Trips Screen - List of all trips (Active & Archived)
 * 
 * Pixel-perfect port of TripsListView.swift
 */

import React, { useState, useMemo } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { Colors } from '../constants/theme';
import { Trip } from '../lib/logic/types';
import { FloatingTabSwitcher } from '../components/ui/FloatingTabSwitcher';
import { TripCard } from '../components/TripCard';
import { TripDetailScreen } from './TripDetailScreen';
import { AddTripScreen } from './AddTripScreen';
import { Modal } from 'react-native';
import { useTrips } from '../lib/hooks/useTrips';
import { TripRepository, TripParticipantRepository } from '../lib/db/repositories';

// ============================================================================
// Types & Props
// ============================================================================

interface TripsScreenProps {
  selectedIndex: number;
  onSelectIndex: (index: number) => void;
}

// ============================================================================
// Main Component
// ============================================================================

export function TripsScreen({ selectedIndex, onSelectIndex }: TripsScreenProps) {
  const insets = useSafeAreaInsets();
  const { trips, refresh } = useTrips();

  // State
  const [showFloatingPager, setShowFloatingPager] = useState(true);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [showAddTrip, setShowAddTrip] = useState(false);

  const selectedTrip = useMemo(() => trips.find(t => t.id === selectedTripId) || null, [trips, selectedTripId]);

  // Derived state
  const activeTrips = useMemo(() => trips.filter(t => !t.isArchived), [trips]);
  const archivedTrips = useMemo(() => trips.filter(t => t.isArchived), [trips]);

  const handleAddTrip = () => {
    Haptics.selectionAsync();
    setShowAddTrip(true);
  };

  const handleSaveTrip = async (tripData: any) => {
    try {
      const createdTrip = await TripRepository.create({
        name: tripData.name,
        emoji: tripData.emoji,
        isGroup: tripData.isGroup,
        startDate: tripData.startDate,
        endDate: tripData.endDate,
        budgetCents: tripData.budgetCents,
        isArchived: false,
      });

      if (tripData.isGroup && tripData.participants) {
        // Assign colors cyclically
        const colors = ['FF9500', '5856D6', 'FF2D55', '5AC8FA', '4CD964', 'FFCC00'];

        for (let i = 0; i < tripData.participants.length; i++) {
          const p = tripData.participants[i];
          await TripParticipantRepository.create({
            tripId: createdTrip.id,
            name: p.name,
            isCurrentUser: p.isCurrentUser,
            colorHex: colors[i % colors.length],
          });
        }
      }

      console.log("Trip added:", createdTrip);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowAddTrip(false);
      refresh();
    } catch (e) {
      console.error("Failed to save trip:", e);
      // Show error toast?
    }
  };

  const handleTripPress = (trip: Trip) => {
    Haptics.selectionAsync();
    setSelectedTripId(trip.id);
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      <View style={[styles.content, { paddingTop: insets.top + 20 }]}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Trips</Text>
          <View style={{ flex: 1 }} />
          <TouchableOpacity
            onPress={handleAddTrip}
            style={styles.addButton}
          >
            <Ionicons name="add" size={24} color={Colors.accent} />
          </TouchableOpacity>
        </View>

        {trips.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>✈️</Text>
            <Text style={styles.emptyTitle}>No trips yet</Text>
            <Text style={styles.emptySubtitle}>
              Create a trip to track expenses{'\n'}for your travels
            </Text>

            <TouchableOpacity
              onPress={handleAddTrip}
              style={styles.emptyButton}
            >
              <Ionicons name="add" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={styles.emptyButtonText}>New Trip</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Active Trips */}
            {activeTrips.length > 0 && (
              <View style={styles.section}>
                {activeTrips.map(trip => (
                  <TouchableOpacity
                    key={trip.id}
                    onPress={() => handleTripPress(trip)}
                    activeOpacity={0.7}
                  >
                    <TripCard trip={trip} />
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Archived Trips */}
            {archivedTrips.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionHeader}>Archived</Text>
                {archivedTrips.map(trip => (
                  <TouchableOpacity
                    key={trip.id}
                    onPress={() => handleTripPress(trip)}
                    activeOpacity={0.7}
                    style={{ opacity: 0.6 }}
                  >
                    <TripCard trip={trip} />
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </ScrollView>
        )}
      </View>

      {/* Floating Pager (Bottom Nav) */}
      {showFloatingPager && !selectedTrip && (
        <FloatingTabSwitcher
          selectedIndex={selectedIndex}
          onSelectIndex={onSelectIndex}
        />
      )}

      {/* Trip Detail Modal */}
      {selectedTrip && (
        <View style={[StyleSheet.absoluteFill, { zIndex: 100 }]}>
          <TripDetailScreen
            trip={selectedTrip}
            onDismiss={() => setSelectedTripId(null)}
            onTripUpdate={refresh}
          />
        </View>
      )}

      {/* Add Trip Modal */}
      <Modal
        visible={showAddTrip}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowAddTrip(false)}
      >
        <AddTripScreen
          onDismiss={() => setShowAddTrip(false)}
          onSave={() => {
            refresh(); // Just refresh the trips list
            setShowAddTrip(false);
          }}
        />
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
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    marginBottom: 16,
  },
  headerTitle: {
    fontFamily: 'AvenirNextCondensed-Heavy',
    fontSize: 36,
    color: '#FFFFFF',
  },
  addButton: {
    padding: 8, // Hit area
  },

  // List
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 100,
    gap: 16,
  },
  section: {
    gap: 12,
  },
  sectionHeader: {
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.5)',
    marginTop: 8,
  },

  // Empty State
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingBottom: 80, // Offset for tab switcher
  },
  emptyEmoji: {
    fontSize: 64,
    marginBottom: 10,
  },
  emptyTitle: {
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 24,
    color: '#FFFFFF',
  },
  emptySubtitle: {
    fontFamily: 'AvenirNextCondensed-Medium',
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.6)',
    textAlign: 'center',
    lineHeight: 22,
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: Colors.accent,
    borderRadius: 9999,
    marginTop: 8,
  },
  emptyButtonText: {
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 18,
    color: '#FFFFFF',
  },
});
