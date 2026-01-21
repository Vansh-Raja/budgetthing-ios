/**
 * Trips Screen - List of all trips (Active & Archived)
 * 
 * Pixel-perfect port of TripsListView.swift
 */

import { CustomPopupProvider, useCustomPopup } from '@/components/ui/CustomPopupProvider';
import { Text } from '@/components/ui/LockedText';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  StatusBar,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import DraggableFlatList, { RenderItemParams } from 'react-native-draggable-flatlist';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@clerk/clerk-expo';
import { Modal } from 'react-native';
import { SharedTripCard } from '../components/SharedTripCard';
import { TripCard } from '../components/TripCard';
import { FloatingTabSwitcher } from '../components/ui/FloatingTabSwitcher';
import { Colors } from '../constants/theme';
import { TripParticipantRepository, TripRepository } from '../lib/db/repositories';
import { useSharedTrips } from '../lib/hooks/useSharedTrips';
import { useTrips } from '../lib/hooks/useTrips';
import { Trip } from '../lib/logic/types';
import { useSyncStatus } from '../lib/sync/SyncProvider';
import { AddSharedTripScreen } from './AddSharedTripScreen';
import { AddTripScreen } from './AddTripScreen';
import { JoinSharedTripScreen } from './JoinSharedTripScreen';
import { SharedTripDetailScreen } from './SharedTripDetailScreen';
import { TripDetailScreen } from './TripDetailScreen';

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
  const { trips: sharedTrips, refresh: refreshSharedTrips } = useSharedTrips();
  const { syncNow } = useSyncStatus();
  const { isSignedIn } = useAuth();

  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    syncNow('manual_refresh')
      .then(() => Promise.all([refresh(), refreshSharedTrips()]))
      .catch((error) => {
        console.error('[Trips] Refresh failed:', error);
      })
      .finally(() => {
        setIsRefreshing(false);
      });
  }, [syncNow, refresh, refreshSharedTrips]);

  // State
  const [showFloatingPager, setShowFloatingPager] = useState(true);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [selectedSharedTripId, setSelectedSharedTripId] = useState<string | null>(null);
  const [showAddTrip, setShowAddTrip] = useState(false);
  const [showAddSharedTrip, setShowAddSharedTrip] = useState(false);
  const [showJoinTrip, setShowJoinTrip] = useState(false);



  const selectedTrip = useMemo(() => trips.find(t => t.id === selectedTripId) || null, [trips, selectedTripId]);
  const selectedSharedTripSummary = useMemo(
    () => sharedTrips.find(t => t.id === selectedSharedTripId) || null,
    [sharedTrips, selectedSharedTripId]
  );

  const [orderedTrips, setOrderedTrips] = useState<Trip[]>([]);

  useEffect(() => {
    setOrderedTrips(trips);
  }, [trips]);

  const { showActionSheet, showPopup } = useCustomPopup();

  const handleAddTrip = useCallback(() => {
    Haptics.selectionAsync();

    if (isSignedIn) {
      showActionSheet({
        title: 'New Trip',
        actions: [
          { text: 'Local Trip', icon: 'airplane-outline', onPress: () => setShowAddTrip(true) },
          { text: 'Shared Trip', icon: 'people-outline', onPress: () => setShowAddSharedTrip(true) },
        ],
      });
      return;
    }

    setShowAddTrip(true);
  }, [isSignedIn, showActionSheet]);

  useEffect(() => {
    if (addTripRequestId <= 0) return;
    setSelectedTripId(null);
    handleAddTrip();
  }, [addTripRequestId, handleAddTrip]);

  const handleJoinTrip = () => {
    if (!isSignedIn) {
      showPopup({
        title: 'Sign in required',
        message: 'Sign in to join shared trips.',
        buttons: [{ text: 'OK', style: 'default' }],
      });
      return;
    }
    Haptics.selectionAsync();
    setShowJoinTrip(true);
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

  const handleSharedTripPress = (tripId: string) => {
    Haptics.selectionAsync();
    setSelectedSharedTripId(tripId);
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
          {isSignedIn && (
            <TouchableOpacity
              onPress={handleJoinTrip}
              style={styles.addButton}
            >
              <Ionicons name="log-in" size={22} color={Colors.accent} />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={handleAddTrip}
            style={styles.addButton}
          >
            <Ionicons name="add" size={24} color={Colors.accent} />
          </TouchableOpacity>
        </View>

        {trips.length === 0 && sharedTrips.length === 0 ? (
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

            {isSignedIn && (
              <TouchableOpacity
                onPress={handleJoinTrip}
                style={[styles.emptyButton, { marginTop: 12, backgroundColor: 'rgba(255, 255, 255, 0.10)' }]}
              >
                <Ionicons name="log-in" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                <Text style={styles.emptyButtonText}>Join Trip</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <DraggableFlatList
            data={orderedTrips}
            keyExtractor={(item) => item.id}
            onDragEnd={handleReorder}
            ListHeaderComponent={
              sharedTrips.length > 0 ? (
                <View style={{ paddingBottom: 14 }}>
                  <Text style={styles.sectionHeader}>Shared</Text>
                  <View style={{ gap: 12 }}>
                    {sharedTrips.map((t) => (
                      <TouchableOpacity
                        key={t.id}
                        onPress={() => handleSharedTripPress(t.id)}
                        activeOpacity={0.7}
                      >
                        <SharedTripCard trip={t} />
                      </TouchableOpacity>
                    ))}
                  </View>
                  {orderedTrips.length > 0 && <Text style={[styles.sectionHeader, { marginTop: 18 }]}>Local</Text>}
                </View>
              ) : null
            }
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

      {/* Shared Trip Detail Modal */}
      {selectedSharedTripSummary && (
        <View style={[StyleSheet.absoluteFill, { zIndex: 110 }]}>
          <SharedTripDetailScreen
            tripId={selectedSharedTripSummary.id}
            onDismiss={() => setSelectedSharedTripId(null)}
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
        <CustomPopupProvider>
          <AddTripScreen
            onDismiss={() => setShowAddTrip(false)}
            onSave={() => refresh()}
          />
        </CustomPopupProvider>
      </Modal>

      {/* Add Shared Trip Modal */}
      <Modal
        visible={showAddSharedTrip}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowAddSharedTrip(false)}
      >
        <CustomPopupProvider>
          <AddSharedTripScreen
            onDismiss={() => setShowAddSharedTrip(false)}
            onCreated={(id) => {
              setSelectedSharedTripId(id);
              refreshSharedTrips();
            }}
          />
        </CustomPopupProvider>
      </Modal>

      {/* Join Shared Trip Modal */}
      <Modal
        visible={showJoinTrip}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowJoinTrip(false)}
      >
        <CustomPopupProvider>
          <JoinSharedTripScreen
            onDismiss={() => setShowJoinTrip(false)}
            onJoined={(id) => {
              setSelectedSharedTripId(id);
              refreshSharedTrips();
            }}
          />
        </CustomPopupProvider>
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
