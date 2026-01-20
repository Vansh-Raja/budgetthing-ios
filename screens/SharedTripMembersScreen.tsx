import React, { useMemo, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView, Alert, Modal } from 'react-native';
import { Text, TextInput } from '@/components/ui/LockedText';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useMutation } from 'convex/react';
import { api } from '../convex/_generated/api';

import { Colors } from '../constants/theme';
import type { Trip, TripParticipant } from '../lib/logic/types';
import { useSyncStatus } from '../lib/sync/SyncProvider';
import { SharedTripParticipantLocalRepository } from '../lib/db/sharedTripLocalRepository';

interface SharedTripMembersScreenProps {
  trip: Trip;
  participants: TripParticipant[];
  onDismiss: () => void;
  onChanged?: () => void;
}

export function SharedTripMembersScreen({ trip, participants, onDismiss, onChanged }: SharedTripMembersScreenProps) {
  const { syncNow } = useSyncStatus();
  const removeMemberMutation = useMutation((api as any).sharedTrips.removeMember);

  const [editModal, setEditModal] = useState<{
    visible: boolean;
    participantId: string;
    name: string;
  }>({ visible: false, participantId: '', name: '' });

  const [newGuestName, setNewGuestName] = useState('');

  const sorted = useMemo(() => {
    const list = [...participants];
    list.sort((a, b) => {
      if (a.isCurrentUser && !b.isCurrentUser) return -1;
      if (!a.isCurrentUser && b.isCurrentUser) return 1;
      return a.name.localeCompare(b.name);
    });
    return list;
  }, [participants]);

  const handleRemove = async (participant: TripParticipant) => {
    const linkedUserId = participant.linkedUserId;
    if (!linkedUserId) {
      Alert.alert('Guest participant', 'Guests are not removable in v1.');
      return;
    }

    Alert.alert(
      'Remove member?',
      `Remove ${participant.isCurrentUser ? 'you' : participant.name} from this trip?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              await removeMemberMutation({ tripId: trip.id, userIdToRemove: linkedUserId });
              await syncNow('remove_shared_trip_member');
              onChanged?.();
              if (participant.isCurrentUser) onDismiss();
            } catch (e: any) {
              console.error('[SharedTripMembers] remove failed', e);
              Alert.alert('Error', e?.message ?? 'Failed to remove member');
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            }
          },
        },
      ]
    );
  };

  const handleAddGuest = async () => {
    const trimmed = newGuestName.trim();
    if (!trimmed) return;

    try {
      const colors = ['FF9500', '5856D6', 'FF2D55', '5AC8FA', '4CD964', 'FFCC00'];
      const nextColor = colors[participants.length % colors.length];

      await SharedTripParticipantLocalRepository.createGuest(trip.id, trimmed, nextColor);

      setNewGuestName('');
      onChanged?.();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      syncNow('add_guest_participant').catch((e) => {
        console.error('[SharedTripMembers] add guest sync failed', e);
      });
    } catch (e: any) {
      console.error('[SharedTripMembers] add guest failed', e);
      Alert.alert('Error', e?.message ?? 'Failed to add guest');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const handleEditName = async () => {
    const participantId = editModal.participantId;

    try {
      const trimmed = editModal.name.trim();
      if (!trimmed) {
        Alert.alert('Name required', 'Please enter a name.');
        return;
      }

      await SharedTripParticipantLocalRepository.updateName(participantId, trimmed);

      // Close immediately (sync can fail independently).
      setEditModal({ visible: false, participantId: '', name: '' });
      onChanged?.();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      syncNow('edit_trip_nickname').catch((e) => {
        console.error('[SharedTripMembers] nickname sync failed', e);
      });
    } catch (e: any) {
      console.error('[SharedTripMembers] edit name failed', e);
      Alert.alert('Error', e?.message ?? 'Failed to update name');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onDismiss} style={styles.headerButton}>
          <Ionicons name="close" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Members</Text>
        <View style={styles.headerButton} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.tripTitle}>{trip.emoji} {trip.name}</Text>
          <Text style={styles.subtle}>Anyone in the trip can edit in v1.</Text>
        </View>

        <View style={styles.section}>
          {sorted.map((p) => {
            const isGuest = !p.linkedUserId;
            const canEditName = p.isCurrentUser || isGuest;

            return (
              <View key={p.id} style={styles.row}>
                <View style={styles.avatar}>
                  <Text style={{ fontSize: 18 }}>{p.isCurrentUser ? '🟠' : (p.colorHex ? '🟣' : '⚪️')}</Text>
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{p.name || 'Unnamed'}</Text>
                  <Text style={styles.meta}>
                    {isGuest ? 'Guest' : 'Member'}{p.isCurrentUser ? ' • You' : ''}
                  </Text>
                </View>

                {canEditName && (
                  <TouchableOpacity
                    onPress={() => {
                      Haptics.selectionAsync();
                      setEditModal({ visible: true, participantId: p.id, name: p.name || '' });
                    }}
                    style={styles.editButton}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.editText}>Edit</Text>
                  </TouchableOpacity>
                )}

                {!isGuest && (
                  <TouchableOpacity
                    onPress={() => handleRemove(p)}
                    style={styles.removeButton}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.removeText}>Remove</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}

          {/* Add Guest */}
          <View style={styles.addGuestRow}>
            <TextInput
              style={styles.addGuestInput}
              value={newGuestName}
              onChangeText={setNewGuestName}
              placeholder="Add guest…"
              placeholderTextColor="rgba(255, 255, 255, 0.3)"
              onSubmitEditing={handleAddGuest}
              returnKeyType="done"
            />
            <TouchableOpacity onPress={handleAddGuest} disabled={!newGuestName.trim()}>
              <Ionicons
                name="add-circle"
                size={24}
                color={newGuestName.trim() ? Colors.accent : 'rgba(255, 255, 255, 0.3)'}
              />
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.footerText}>
          Member roles/permissions will be added later.
        </Text>
      </ScrollView>

      <Modal
        visible={editModal.visible}
        transparent
        animationType="fade"
        onRequestClose={() => setEditModal({ visible: false, participantId: '', name: '' })}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Edit Name</Text>
            <TextInput
              style={styles.modalInput}
              value={editModal.name}
              onChangeText={(t) => setEditModal((s) => ({ ...s, name: t }))}
              placeholder="Name"
              placeholderTextColor="rgba(255,255,255,0.3)"
              autoFocus
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                onPress={() => setEditModal({ visible: false, participantId: '', name: '' })}
                style={[styles.modalButton, styles.modalButtonSecondary]}
              >
                <Text style={styles.modalButtonTextSecondary}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleEditName}
                style={[styles.modalButton, styles.modalButtonPrimary]}
              >
                <Text style={styles.modalButtonTextPrimary}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  headerButton: { padding: 8, width: 44, alignItems: 'center' },
  headerTitle: {
    fontFamily: 'AvenirNextCondensed-Heavy',
    fontSize: 20,
    color: '#FFFFFF',
  },
  content: { padding: 20, gap: 14, paddingBottom: 40 },
  card: {
    padding: 16,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    gap: 6,
  },
  tripTitle: {
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 18,
    color: '#FFFFFF',
  },
  subtle: {
    fontFamily: 'System',
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
  },
  section: {
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    overflow: 'hidden',
  },
  addGuestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  addGuestInput: {
    flex: 1,
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 18,
    color: '#FFFFFF',
    paddingVertical: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
    gap: 12,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 18,
    color: '#FFFFFF',
  },
  meta: {
    fontFamily: 'System',
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 2,
  },
  editButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  editText: {
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 14,
    color: '#FFFFFF',
  },
  removeButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 59, 48, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 59, 48, 0.3)',
  },
  removeText: {
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 14,
    color: '#FF3B30',
  },
  footerText: {
    fontFamily: 'System',
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    textAlign: 'center',
    marginTop: 10,
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: '#1C1C1E',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  modalTitle: {
    fontFamily: 'AvenirNextCondensed-Heavy',
    fontSize: 20,
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 12,
  },
  modalInput: {
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 20,
    color: '#FFFFFF',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.12)',
    marginBottom: 14,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalButtonSecondary: {
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  modalButtonPrimary: {
    backgroundColor: Colors.accent,
  },
  modalButtonTextSecondary: {
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 16,
    color: '#FFFFFF',
  },
  modalButtonTextPrimary: {
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 16,
    color: '#FFFFFF',
  },
});
