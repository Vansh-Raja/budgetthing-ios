/**
 * Trips Screen - List of all trips (Active & Archived)
 * 
 * Pixel-perfect port of TripsListView.swift
 */

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Alert,
} from 'react-native';
import DraggableFlatList, { RenderItemParams } from 'react-native-draggable-flatlist';
import { Text } from '@/components/ui/LockedText';
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
import { useSyncStatus } from '../lib/sync/SyncProvider';
import { TripRepository, TripParticipantRepository } from '../lib/db/repositories';

// ============================================================================
// Types & Props
// ============================================================================

interface TripsScreenProps {
  selectedIndex: number;
  onSelectIndex: (index: number) => void;
  addTripRequestId?: number;
}

// ============================================================================
// Main Component
// ============================================================================

export function TripsScreen({ selectedIndex, onSelectIndex, addTripRequestId = 0 }: TripsScreenProps) {
  const insets = useSafeAreaInsets();
  const { trips, refresh } = useTrips();
  const { syncNow } = useSyncStatus();

  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    syncNow('manual_refresh')
      .then(() => refresh())
      .catch((error) => {
        console.error('[Trips] Refresh failed:', error);
      })
      .finally(() => {
        setIsRefreshing(false);
      });
  }, [syncNow, refresh]);

  // State
  const [showFloatingPager, setShowFloatingPager] = useState(true);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [showAddTrip, setShowAddTrip] = useState(false);

  useEffect(() => {
    if (addTripRequestId <= 0) return;
    setSelectedTripId(null);
    setShowAddTrip(true);
  }, [addTripRequestId]);

  const selectedTrip = useMemo(() => trips.find(t => t.id === selectedTripId) || null, [trips, selectedTripId]);

  const [orderedTrips, setOrderedTrips] = useState<Trip[]>([]);

  useEffect(() => {
    setOrderedTrips(trips);
  }, [trips]);

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

  const handleReorder = useCallback(({ data }: { data: Trip[] }) => {
    setOrderedTrips(data);

    TripRepository.reorder(data.map(t => t.id)).catch((error) => {
      console.error('[Trips] Failed to reorder trips:', error);
      refresh();
    });
  }, [refresh]);

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
          <DraggableFlatList
            data={orderedTrips}
            keyExtractor={(item) => item.id}
            onDragEnd={handleReorder}
            renderItem={({ item: trip, drag, isActive, getIndex }: RenderItemParams<Trip>) => {
              const index = getIndex?.() ?? -1;
              const showArchivedHeader =
                index >= 0 &&
                trip.isArchived &&
                (index === 0 || !orderedTrips[index - 1]?.isArchived);

              return (
                <View style={[trip.isArchived && { opacity: 0.6 }]}>
                  {showArchivedHeader && <Text style={styles.sectionHeader}>Archived</Text>}
                  <TouchableOpacity
                    onPress={() => handleTripPress(trip)}
                    onLongPress={() => {
                      Haptics.selectionAsync();
                      drag();
                    }}
                    disabled={isActive}
                    activeOpacity={0.7}
                  >
                    <TripCard trip={trip} />
                  </TouchableOpacity>
                </View>
              );
            }}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
          />
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
