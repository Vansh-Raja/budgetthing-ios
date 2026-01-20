import React, { useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Text, TextInput } from '@/components/ui/LockedText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import { format } from 'date-fns';

import { Colors } from '../constants/theme';
import type { Trip } from '../lib/logic/types';
import { getCurrencySymbol } from '../lib/logic/currencyUtils';
import { SharedTripLocalRepository } from '../lib/db/sharedTripLocalRepository';
import { useSyncStatus } from '../lib/sync/SyncProvider';
import { EmojiPickerModal } from '../components/emoji/EmojiPickerModal';
import { RECOMMENDED_TRIP_EMOJIS } from '../lib/emoji/recommendedEmojis';

interface EditSharedTripScreenProps {
  trip: Trip;
  onDismiss: () => void;
  onSaved?: () => void;
}

export function EditSharedTripScreen({ trip, onDismiss, onSaved }: EditSharedTripScreenProps) {
  const insets = useSafeAreaInsets();
  const { syncNow } = useSyncStatus();

  const [name, setName] = useState(trip.name);
  const [emoji, setEmoji] = useState(trip.emoji);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const [startDate, setStartDate] = useState(new Date(trip.startDate ?? Date.now()));
  const [endDate, setEndDate] = useState(new Date(trip.endDate ?? Date.now() + 7 * 86400000));

  const [hasBudget, setHasBudget] = useState(!!trip.budgetCents);
  const [budgetString, setBudgetString] = useState(trip.budgetCents ? (trip.budgetCents / 100).toFixed(2) : '');
  const [isSaving, setIsSaving] = useState(false);

  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  const canSave = name.trim().length > 0;
  const currencyCode = 'INR';

  const budgetCents = useMemo(() => {
    if (!hasBudget) return null;
    const parsed = parseFloat(budgetString);
    if (!Number.isFinite(parsed)) return null;
    return Math.round(parsed * 100);
  }, [budgetString, hasBudget]);

  const onDateChange = (event: any, selectedDate?: Date, which?: 'start' | 'end') => {
    if (Platform.OS === 'android') {
      if (which === 'start') setShowStartPicker(false);
      if (which === 'end') setShowEndPicker(false);
    }

    if (selectedDate) {
      if (which === 'start') {
        setStartDate(selectedDate);
        if (selectedDate > endDate) setEndDate(selectedDate);
      } else {
        setEndDate(selectedDate);
        if (selectedDate < startDate) setStartDate(selectedDate);
      }
    }
  };

  const handleSave = async () => {
    if (!canSave) return;

    try {
      setIsSaving(true);
      Haptics.selectionAsync();

      await SharedTripLocalRepository.update(trip.id, {
        name: name.trim(),
        emoji,
        startDateMs: startDate.getTime(),
        endDateMs: endDate.getTime(),
        budgetCents: budgetCents ?? undefined,
      });

      await syncNow('edit_shared_trip');

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSaved?.();
      onDismiss();
    } catch (e) {
      console.error('[EditSharedTrip] Failed:', e);
      Alert.alert('Error', 'Failed to update shared trip.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}
      >
        <TouchableOpacity onPress={onDismiss} style={styles.closeButton}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Shared Trip</Text>
        <TouchableOpacity onPress={handleSave} disabled={!canSave || isSaving}>
          <Text style={[styles.saveText, (!canSave || isSaving) && { opacity: 0.5 }]}>Save</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.formSection}>
          <View style={styles.row}>
            <TouchableOpacity
              style={styles.emojiButton}
              activeOpacity={0.7}
              onPress={() => {
                Haptics.selectionAsync();
                setShowEmojiPicker(true);
              }}
            >
              <Text style={styles.emoji}>{emoji}</Text>
            </TouchableOpacity>
            <TextInput
              style={styles.nameInput}
              value={name}
              onChangeText={setName}
              placeholder="Trip Name"
              placeholderTextColor="rgba(255, 255, 255, 0.3)"
              autoFocus
            />
          </View>
        </View>

        <View style={styles.formSection}>
          <View style={styles.row}>
            <Text style={styles.label}>Start Date</Text>
            {Platform.OS === 'ios' ? (
              <DateTimePicker
                value={startDate}
                mode="date"
                display="compact"
                themeVariant="dark"
                onChange={(e, d) => onDateChange(e, d, 'start')}
                style={{ width: 120 }}
              />
            ) : (
              <TouchableOpacity onPress={() => setShowStartPicker(true)}>
                <Text style={styles.value}>{format(startDate, 'MMM d, yyyy')}</Text>
              </TouchableOpacity>
            )}
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={styles.label}>End Date</Text>
            {Platform.OS === 'ios' ? (
              <DateTimePicker
                value={endDate}
                mode="date"
                display="compact"
                themeVariant="dark"
                onChange={(e, d) => onDateChange(e, d, 'end')}
                style={{ width: 120 }}
                minimumDate={startDate}
              />
            ) : (
              <TouchableOpacity onPress={() => setShowEndPicker(true)}>
                <Text style={styles.value}>{format(endDate, 'MMM d, yyyy')}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        <View style={styles.formSection}>
          <View style={styles.row}>
            <Text style={styles.label}>Total Budget</Text>
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
              <View style={styles.divider} />
              <View style={styles.inputRow}>
                <Text style={[styles.label, { flex: 1 }]}>Amount</Text>
                <Text style={styles.currencySymbol}>{getCurrencySymbol(currencyCode)}</Text>
                <TextInput
                  style={styles.amountInput}
                  value={budgetString}
                  onChangeText={setBudgetString}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor="rgba(255, 255, 255, 0.3)"
                />
              </View>
            </>
          )}
        </View>

        <View style={styles.formSection}>
          <Text style={styles.metaText}>Currency is locked to INR for v1.</Text>
        </View>
      </ScrollView>

      {Platform.OS === 'android' && showStartPicker && (
        <DateTimePicker
          value={startDate}
          mode="date"
          display="default"
          onChange={(e, d) => onDateChange(e, d, 'start')}
        />
      )}
      {Platform.OS === 'android' && showEndPicker && (
        <DateTimePicker
          value={endDate}
          mode="date"
          display="default"
          onChange={(e, d) => onDateChange(e, d, 'end')}
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

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={100}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1C1C1E' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  closeButton: { padding: 8 },
  cancelText: { color: Colors.accent, fontSize: 17 },
  headerTitle: { color: 'white', fontSize: 18, fontWeight: '600' },
  saveText: { color: Colors.accent, fontSize: 17, fontWeight: 'bold' },

  content: { padding: 20, gap: 16 },
  formSection: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 16,
    padding: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  divider: { height: 1, backgroundColor: 'rgba(255, 255, 255, 0.10)', marginVertical: 12 },
  emojiButton: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  emoji: { fontSize: 24 },
  nameInput: {
    flex: 1,
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 20,
    color: '#FFFFFF',
  },
  label: {
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 16,
    color: '#FFFFFF',
  },
  value: {
    fontFamily: 'AvenirNextCondensed-Medium',
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.7)',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  currencySymbol: {
    fontSize: 18,
    color: 'rgba(255, 255, 255, 0.6)',
    marginRight: 6,
  },
  amountInput: {
    fontSize: 18,
    color: 'white',
    fontFamily: 'AvenirNextCondensed-DemiBold',
    minWidth: 100,
    textAlign: 'right',
  },
  metaText: {
    fontFamily: 'System',
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.5)',
    textAlign: 'center',
  },
});
