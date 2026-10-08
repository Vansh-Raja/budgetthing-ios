import { useCustomPopup } from '@/components/ui/CustomPopupProvider';
import { Text, TextInput } from '@/components/ui/LockedText';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useMutation } from 'convex/react';
import { format } from 'date-fns';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Switch, TouchableOpacity, View } from 'react-native';
import { api } from '../convex/_generated/api';

import { getCurrencySymbol } from '../lib/logic/currencyUtils';

import { useToast } from '@/components/ui/ToastProvider';
import { EmojiPickerModal } from '../components/emoji/EmojiPickerModal';
import { Colors } from '../constants/theme';
import { getDefaultTripNickname } from '../lib/auth/displayName';
import { useAuthState } from '../lib/auth/useAuthHooks';
import { RECOMMENDED_TRIP_EMOJIS } from '../lib/emoji/recommendedEmojis';
import { useSyncStatus } from '../lib/sync/SyncProvider';

interface AddSharedTripScreenProps {
  onDismiss: () => void;
  onCreated?: (tripId: string) => void;
}

export function AddSharedTripScreen({ onDismiss, onCreated }: AddSharedTripScreenProps) {
  const { syncNow } = useSyncStatus();
  const { user } = useAuthState();
  const toast = useToast();
  const { showInfo, showPopup } = useCustomPopup();

  const createTrip = useMutation(api.sharedTrips.create);
  const rotateInvite = useMutation(api.sharedTripInvites.rotate);

  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('✈️');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(new Date(Date.now() + 7 * 86400000));
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  const [hasBudget, setHasBudget] = useState(false);
  const [budgetString, setBudgetString] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const canSave = name.trim().length > 0;

  const handleSave = useCallback(async () => {
    if (!canSave) return;
    if (isSaving) return;

    try {
      setIsSaving(true);
      Haptics.selectionAsync();

      const parsedBudget = parseFloat(budgetString);
      const budgetCents = hasBudget && budgetString.trim().length && Number.isFinite(parsedBudget)
        ? Math.round(parsedBudget * 100)
        : undefined;

      const result = await createTrip({
        name: name.trim(),
        emoji,
        startDateMs: startDate.getTime(),
        endDateMs: endDate.getTime(),
        budgetCents,
        participantName: getDefaultTripNickname(user),
      });

      const tripId = result.tripId;

      // Followups are best-effort: the trip is already created.
      let code: string | null = null;
      try {
        const invite = await rotateInvite({ tripId });
        code = invite.code ?? null;
      } catch (e) {
        console.warn('[AddSharedTrip] rotateInvite failed:', e);
        toast.show('Saved. Sync pending.');
      }

      try {
        await syncNow('create_shared_trip');
      } catch (e) {
        console.warn('[AddSharedTrip] syncNow failed:', e);
        toast.show('Saved. Sync pending.');
      }

      if (code) {
        showInfo({
          title: 'Join Code',
          copyableContent: code,
        });
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onCreated?.(tripId);
      onDismiss();
    } catch (e: any) {
      console.error('[AddSharedTrip] Failed:', e);
      showPopup({
        title: 'Error',
        message: e?.message ?? 'Failed to create trip',
        buttons: [{ text: 'OK', style: 'default' }],
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsSaving(false);
    }
  }, [canSave, createTrip, emoji, name, onCreated, onDismiss, rotateInvite, syncNow, startDate, endDate, hasBudget, budgetString, isSaving, toast, user, showInfo, showPopup]);


  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onDismiss} style={styles.headerButton}>
          <Ionicons name="close" size={24} color="#FFFFFF" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>New Shared Trip</Text>

        <TouchableOpacity
          onPress={handleSave}
          style={styles.headerButton}
          disabled={!canSave || isSaving}
        >
          <Text style={[styles.saveText, (!canSave || isSaving) && styles.saveTextDisabled]}>Save</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.formContainer}>
          <View style={styles.row}>
            <TouchableOpacity style={styles.emojiButton} onPress={() => setShowEmojiPicker(true)}>
              <Text style={styles.emoji}>{emoji}</Text>
            </TouchableOpacity>

            <View style={styles.nameContainer}>
              <Text style={styles.label}>Trip Name</Text>
              <TextInput
                style={styles.nameInput}
                value={name}
                onChangeText={setName}
                placeholder="e.g., Goa 2026"
                placeholderTextColor="rgba(255, 255, 255, 0.3)"
                autoFocus
              />
            </View>
          </View>

          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>Shared trip</Text>
            <Text style={styles.infoText}>
              This trip syncs across members. Currency is locked to INR for v1.
            </Text>
          </View>

          <View style={styles.sectionCard}>
            <View style={styles.sectionRow}>
              <Text style={styles.sectionLabel}>Start Date</Text>
              {Platform.OS === 'ios' ? (
                <DateTimePicker
                  value={startDate}
                  mode="date"
                  display="compact"
                  themeVariant="dark"
                  onChange={(_, d) => {
                    if (!d) return;
                    setStartDate(d);
                    if (d > endDate) setEndDate(d);
                  }}
                  style={{ width: 120 }}
                />
              ) : (
                <TouchableOpacity onPress={() => setShowStartPicker(true)}>
                  <Text style={styles.sectionValue}>{format(startDate, 'MMM d, yyyy')}</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.sectionDivider} />

            <View style={styles.sectionRow}>
              <Text style={styles.sectionLabel}>End Date</Text>
              {Platform.OS === 'ios' ? (
                <DateTimePicker
                  value={endDate}
                  mode="date"
                  display="compact"
                  themeVariant="dark"
                  minimumDate={startDate}
                  onChange={(_, d) => {
                    if (!d) return;
                    setEndDate(d);
                    if (d < startDate) setStartDate(d);
                  }}
                  style={{ width: 120 }}
                />
              ) : (
                <TouchableOpacity onPress={() => setShowEndPicker(true)}>
                  <Text style={styles.sectionValue}>{format(endDate, 'MMM d, yyyy')}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          <View style={styles.sectionCard}>
            <View style={styles.sectionRow}>
              <Text style={styles.sectionLabel}>Total Budget</Text>
              <Switch
                value={hasBudget}
                onValueChange={(v) => {
                  Haptics.selectionAsync();
                  setHasBudget(v);
                  if (!v) setBudgetString('');
                }}
                trackColor={{ false: '#3a3a3c', true: Colors.accent }}
                thumbColor="#FFFFFF"
                ios_backgroundColor="#3a3a3c"
              />
            </View>

            {hasBudget && (
              <>
                <View style={styles.sectionDivider} />
                <View style={styles.sectionRow}>
                  <Text style={styles.sectionLabel}>Amount</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={styles.currencySymbol}>{getCurrencySymbol('INR')}</Text>
                    <TextInput
                      style={styles.budgetInput}
                      value={budgetString}
                      onChangeText={setBudgetString}
                      keyboardType="decimal-pad"
                      placeholder="0"
                      placeholderTextColor="rgba(255, 255, 255, 0.3)"
                    />
                  </View>
                </View>
              </>
            )}
          </View>

        </View>
      </ScrollView>

      {/* Android Pickers */}
      {Platform.OS === 'android' && showStartPicker && (
        <DateTimePicker
          value={startDate}
          mode="date"
          display="default"
          onChange={(_, d) => {
            setShowStartPicker(false);
            if (!d) return;
            setStartDate(d);
            if (d > endDate) setEndDate(d);
          }}
        />
      )}
      {Platform.OS === 'android' && showEndPicker && (
        <DateTimePicker
          value={endDate}
          mode="date"
          display="default"
          onChange={(_, d) => {
            setShowEndPicker(false);
            if (!d) return;
            setEndDate(d);
            if (d < startDate) setStartDate(d);
          }}
        />
      )}

      <EmojiPickerModal
        visible={showEmojiPicker}
        title="Choose Icon"
        value={emoji}
        recommendedEmojis={RECOMMENDED_TRIP_EMOJIS}
        onSelect={setEmoji}
        onClose={() => setShowEmojiPicker(false)}
      />
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
  headerButton: { padding: 8 },
  headerTitle: {
    fontFamily: 'AvenirNextCondensed-Heavy',
    fontSize: 20,
    color: '#FFFFFF',
  },
  saveText: {
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 18,
    color: Colors.accent,
  },
  saveTextDisabled: {
    color: 'rgba(255, 149, 0, 0.3)',
  },
  scrollContent: { padding: 20 },
  formContainer: { gap: 16 },
  row: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  emojiButton: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: { fontSize: 28 },
  nameContainer: { flex: 1, gap: 6 },
  label: {
    fontFamily: 'System',
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.5)',
  },
  nameInput: {
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 22,
    color: '#FFFFFF',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.12)',
  },
  infoCard: {
    padding: 16,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.10)',
    gap: 6,
  },
  infoTitle: {
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 18,
    color: '#FFFFFF',
  },
  infoText: {
    fontFamily: 'System',
    fontSize: 13,
    lineHeight: 18,
    color: 'rgba(255, 255, 255, 0.6)',
  },

  sectionCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 16,
    padding: 16,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
    marginVertical: 12,
  },
  sectionLabel: {
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 16,
    color: '#FFFFFF',
  },
  sectionValue: {
    fontFamily: 'AvenirNextCondensed-Medium',
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.7)',
  },
  currencySymbol: {
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.6)',
  },
  budgetInput: {
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 18,
    color: '#FFFFFF',
    minWidth: 90,
    textAlign: 'right',
  },
});
