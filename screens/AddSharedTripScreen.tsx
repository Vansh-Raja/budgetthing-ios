import React, { useCallback, useMemo, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView, Alert, Modal, Platform, Switch } from 'react-native';
import { Text, TextInput } from '@/components/ui/LockedText';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useMutation } from 'convex/react';
import { api } from '../convex/_generated/api';
import DateTimePicker from '@react-native-community/datetimepicker';
import { format } from 'date-fns';

import { getCurrencySymbol } from '../lib/logic/currencyUtils';

import { Colors } from '../constants/theme';
import { useSyncStatus } from '../lib/sync/SyncProvider';
import { useAuthState } from '../lib/auth/useAuthHooks';
import { getDefaultTripNickname } from '../lib/auth/displayName';

interface AddSharedTripScreenProps {
  onDismiss: () => void;
  onCreated?: (tripId: string) => void;
}

export function AddSharedTripScreen({ onDismiss, onCreated }: AddSharedTripScreenProps) {
  const { syncNow } = useSyncStatus();
  const { user } = useAuthState();

  const createTrip = useMutation((api as any).sharedTrips.create);
  const rotateInvite = useMutation((api as any).sharedTripInvites.rotate);

  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('✈️');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(new Date(Date.now() + 7 * 86400000));
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  const [hasBudget, setHasBudget] = useState(false);
  const [budgetString, setBudgetString] = useState('');

  const canSave = name.trim().length > 0;

  const EMOJI_OPTIONS = [
    '✈️', '🏝️', '🏔️', '🏙️', '🏰', '🗽', '🗼', '⛩️',
    '🚗', '🚂', '🚢', '⛺', '🎢', '🏟️', '🏖️', '🏜️',
    '🗺️', '📸', '🎒', '🕶️', '🍷', '🍻', '🍕', '🍱'
  ];

  const handleSave = useCallback(async () => {
    if (!canSave) return;

    try {
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

      const tripId = (result as any).tripId as string;

      // Generate an initial join code immediately.
      const invite = await rotateInvite({ tripId });
      const code = (invite as any).code as string | undefined;

      await syncNow('create_shared_trip');

      if (code) {
        Alert.alert('Join Code', code);
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onCreated?.(tripId);
      onDismiss();
    } catch (e: any) {
      console.error('[AddSharedTrip] Failed:', e);
      Alert.alert('Error', e?.message ?? 'Failed to create trip');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
   }, [canSave, createTrip, emoji, name, onCreated, onDismiss, rotateInvite, syncNow, startDate, endDate, hasBudget, budgetString]);


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
          disabled={!canSave}
        >
          <Text style={[styles.saveText, !canSave && styles.saveTextDisabled]}>Save</Text>
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

       <Modal
         visible={showEmojiPicker}
         transparent
         animationType="fade"
         onRequestClose={() => setShowEmojiPicker(false)}
       >
        <View style={styles.emojiModalBackdrop}>
          <View style={styles.emojiModal}>
            <Text style={styles.emojiModalTitle}>Choose Emoji</Text>
            <View style={styles.emojiGrid}>
              {EMOJI_OPTIONS.map((e) => (
                <TouchableOpacity
                  key={e}
                  style={styles.emojiCell}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setEmoji(e);
                    setShowEmojiPicker(false);
                  }}
                >
                  <Text style={{ fontSize: 28 }}>{e}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity onPress={() => setShowEmojiPicker(false)} style={styles.emojiClose}>
              <Text style={styles.emojiCloseText}>Close</Text>
            </TouchableOpacity>
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

  emojiModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emojiModal: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 20,
    backgroundColor: '#1C1C1E',
    padding: 16,
  },
  emojiModalTitle: {
    fontFamily: 'AvenirNextCondensed-Heavy',
    fontSize: 20,
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 12,
  },
  emojiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
  },
  emojiCell: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiClose: {
    marginTop: 14,
    alignSelf: 'center',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  emojiCloseText: {
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 16,
    color: Colors.accent,
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
