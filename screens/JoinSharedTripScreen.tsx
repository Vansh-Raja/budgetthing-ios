import { useCustomPopup } from '@/components/ui/CustomPopupProvider';
import { Text, TextInput } from '@/components/ui/LockedText';
import { Ionicons } from '@expo/vector-icons';
import { useMutation } from 'convex/react';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../convex/_generated/api';

import { Colors } from '../constants/theme';
import { getDefaultTripNickname } from '../lib/auth/displayName';
import { useAuthState } from '../lib/auth/useAuthHooks';
import { useSyncStatus } from '../lib/sync/SyncProvider';

interface JoinSharedTripScreenProps {
  onDismiss: () => void;
  onJoined?: (tripId: string) => void;
}

export function JoinSharedTripScreen({ onDismiss, onJoined }: JoinSharedTripScreenProps) {
  const insets = useSafeAreaInsets();
  const { syncNow, isSyncing } = useSyncStatus();
  const { user } = useAuthState();
  const { showPopup } = useCustomPopup();

  const joinByCode = useMutation(api.sharedTripInvites.joinByCode);

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [isNameDirty, setIsNameDirty] = useState(false);
  const [isJoining, setIsJoining] = useState(false);

  const normalizedCode = useMemo(() => code.trim().toUpperCase().replace(/\s+/g, ''), [code]);

  useEffect(() => {
    // Default name comes from Clerk; don't override user edits.
    if (isNameDirty) return;
    setName(getDefaultTripNickname(user));
  }, [isNameDirty, user]);
  const canJoin = normalizedCode.length >= 6 && !isJoining;

  const handleJoin = useCallback(async () => {
    if (!canJoin) return;

    Haptics.selectionAsync();
    setIsJoining(true);

    try {
      const result = await joinByCode({
        code: normalizedCode,
        participantName: name.trim().length ? name.trim() : getDefaultTripNickname(user),
      });

      await syncNow('join_shared_trip');

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      onJoined?.(result.tripId);
      onDismiss();
    } catch (e: any) {
      console.error('[JoinSharedTrip] join failed', e);
      showPopup({
        title: 'Join Failed',
        message: e?.message ?? 'Could not join this trip.',
        buttons: [{ text: 'OK', style: 'default' }],
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsJoining(false);
    }
  }, [canJoin, joinByCode, normalizedCode, name, onDismiss, onJoined, syncNow, showPopup, user]);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={onDismiss} style={styles.headerButton}>
          <Ionicons name="close" size={24} color="#FFFFFF" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Join Trip</Text>

        <TouchableOpacity
          onPress={handleJoin}
          style={styles.headerButton}
          disabled={!canJoin}
        >
          {isJoining || isSyncing ? (
            <ActivityIndicator color={Colors.accent} />
          ) : (
            <Text style={[styles.joinText, !canJoin && styles.joinTextDisabled]}>Join</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.label}>Join Code</Text>
          <TextInput
            value={code}
            onChangeText={setCode}
            placeholder="e.g., ABCD1234"
            placeholderTextColor="rgba(255, 255, 255, 0.3)"
            autoCapitalize="characters"
            autoCorrect={false}
            style={styles.input}
          />

          <View style={styles.divider} />

          <Text style={styles.label}>Your Name In This Trip</Text>
          <TextInput
            value={name}
            onChangeText={(t) => {
              setIsNameDirty(true);
              setName(t);
            }}
            placeholder="Your name"
            placeholderTextColor="rgba(255, 255, 255, 0.3)"
            autoCorrect={false}
            style={styles.input}
          />
        </View>

        <Text style={styles.helper}>
          Anyone in the trip can share a join code. Once you join, you’ll see the same trip expenses on this device.
        </Text>

        <TouchableOpacity
          style={[styles.primaryButton, !canJoin && { opacity: 0.5 }]}
          onPress={handleJoin}
          disabled={!canJoin}
          activeOpacity={0.8}
        >
          <Ionicons name="log-in" size={18} color="#FFFFFF" />
          <Text style={styles.primaryButtonText}>Join Trip</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  headerButton: {
    padding: 8,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: 'AvenirNextCondensed-Heavy',
    fontSize: 20,
    color: '#FFFFFF',
  },
  joinText: {
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 18,
    color: Colors.accent,
  },
  joinTextDisabled: {
    color: 'rgba(255, 149, 0, 0.3)',
  },
  content: {
    padding: 20,
    gap: 16,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 16,
    padding: 16,
    gap: 10,
  },
  label: {
    fontFamily: 'System',
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.5)',
  },
  input: {
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 20,
    color: '#FFFFFF',
    paddingVertical: 10,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
    marginVertical: 8,
  },
  helper: {
    fontFamily: 'System',
    fontSize: 13,
    lineHeight: 18,
    color: 'rgba(255, 255, 255, 0.5)',
    textAlign: 'center',
    paddingHorizontal: 10,
  },
  primaryButton: {
    height: 54,
    borderRadius: 27,
    backgroundColor: Colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  primaryButtonText: {
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 18,
    color: '#FFFFFF',
  },
});
