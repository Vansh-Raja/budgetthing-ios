/**
 * Add Trip Screen - Create a new trip
 * 
 * Pixel-perfect port of AddTripView.swift
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Switch,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import { format } from 'date-fns';

import { Colors } from '../constants/theme';
import { Trip, TripParticipant } from '../lib/logic/types';
import { getCurrencySymbol } from '../lib/logic/currencyUtils';
import { Actions } from '../lib/logic/actions';

interface AddTripScreenProps {
  onDismiss: () => void;
  onSave?: () => void; // Called after successful save
}

export function AddTripScreen({ onDismiss, onSave }: AddTripScreenProps) {
  const insets = useSafeAreaInsets();

  // State
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('✈️');
  const [isGroup, setIsGroup] = useState(false);
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(new Date(Date.now() + 7 * 86400000));
  const [hasBudget, setHasBudget] = useState(false);
  const [budgetString, setBudgetString] = useState('');

  // Participants
  const [participants, setParticipants] = useState<{ id: string; name: string; isCurrentUser: boolean }[]>([]);
  const [newParticipantName, setNewParticipantName] = useState('');

  // Date Picker State
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const canSave = name.trim().length > 0;
  const currencyCode = 'INR';

  const EMOJI_OPTIONS = [
    '✈️', '🏝️', '🏔️', '🏙️', '🏰', '🗽', '🗼', '⛩️',
    '🚗', '🚂', '🚢', '⛺', '🎢', '🏟️', '🏖️', '🏜️',
    '🗺️', '📸', '🎒', '🕶️', '🍷', '🍻', '🍕', '🍱'
  ];

  const handleSave = async () => {
    if (!canSave) return;

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    try {
      // Prepare participants data
      // Ensure current user is included in group trips
      let finalParticipants = [...participants];
      if (isGroup && !finalParticipants.some(p => p.isCurrentUser)) {
        finalParticipants.unshift({ id: 'me', name: 'You', isCurrentUser: true });
      }

      // If solo, we don't strictly need participants list for creation, 
      // but providing one with just "You" is fine/good for consistency.
      if (!isGroup) {
        finalParticipants = []; // Actions.createTrip handles standard participant creation if list is empty? 
        // No, `Actions.createTrip` takes `participantsData`.
        // If solo, we might not want any extra participants.
        // But usually a trip implies at least one person?
        // Let's stick to: Group -> multiple, Solo -> maybe just me or none explicitly tracked in UI list?
        // The Swift app likely implicitly has "Me".
      }

      await Actions.createTrip({
        name,
        emoji,
        isGroup,
        isArchived: false,
        startDate: startDate.getTime(),
        endDate: endDate.getTime(),
        budgetCents: hasBudget ? Math.round(parseFloat(budgetString) * 100) : undefined,
      }, finalParticipants.map(p => ({
        name: p.name,
        isCurrentUser: p.isCurrentUser
      })));

      if (onSave) onSave();
      onDismiss();
    } catch (e) {
      console.error("Failed to save trip", e);
      Alert.alert("Error", "Failed to save trip. Please try again.");
    }
  };

  const addParticipant = () => {
    if (newParticipantName.trim().length === 0) return;
    Haptics.selectionAsync();
    setParticipants([...participants, {
      id: Math.random().toString(),
      name: newParticipantName.trim(),
      isCurrentUser: false
    }]);
    setNewParticipantName('');
  };

  const removeParticipant = (id: string) => {
    Haptics.selectionAsync();
    setParticipants(participants.filter(p => p.id !== id));
  };

  const toggleTripType = (group: boolean) => {
    Haptics.selectionAsync();
    setIsGroup(group);
    if (group && participants.length === 0) {
      setParticipants([{ id: 'me', name: 'You', isCurrentUser: true }]);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={onDismiss} style={styles.headerButton}>
          <Ionicons name="close" size={24} color="#FFFFFF" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>New Trip</Text>

        <TouchableOpacity
          onPress={handleSave}
          style={styles.headerButton}
          disabled={!canSave}
        >
          <Text style={[styles.saveText, !canSave && styles.saveTextDisabled]}>Save</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.formContainer}>

          {/* Emoji & Name */}
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
              />
            </View>
          </View>

          {/* Trip Type */}
          <View style={styles.section}>
            <Text style={styles.label}>Trip Type</Text>
            <View style={styles.typeRow}>
              <TouchableOpacity
                style={[styles.typeButton, !isGroup && styles.typeButtonActive]}
                onPress={() => toggleTripType(false)}
              >
                <Ionicons name="person" size={14} color={!isGroup ? '#FFFFFF' : 'rgba(255, 255, 255, 0.5)'} />
                <Text style={[styles.typeText, !isGroup && styles.typeTextActive]}>Solo</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.typeButton, isGroup && styles.typeButtonActive]}
                onPress={() => toggleTripType(true)}
              >
                <Ionicons name="people" size={14} color={isGroup ? '#FFFFFF' : 'rgba(255, 255, 255, 0.5)'} />
                <Text style={[styles.typeText, isGroup && styles.typeTextActive]}>Group</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Participants (Group only) */}
          {isGroup && (
            <View style={styles.section}>
              <Text style={styles.label}>Participants</Text>
              <View style={styles.participantsContainer}>
                {participants.map(p => (
                  <View key={p.id} style={styles.participantRow}>
                    <View style={styles.participantAvatar}>
                      <Text style={styles.avatarText}>{p.name.charAt(0)}</Text>
                    </View>
                    <Text style={styles.participantName}>{p.name}</Text>
                    {p.isCurrentUser && <Text style={styles.meLabel}>(me)</Text>}
                    <View style={{ flex: 1 }} />
                    {!p.isCurrentUser && (
                      <TouchableOpacity onPress={() => removeParticipant(p.id)}>
                        <Ionicons name="close-circle" size={20} color="rgba(255, 255, 255, 0.4)" />
                      </TouchableOpacity>
                    )}
                  </View>
                ))}

                {/* Add Participant */}
                <View style={styles.addParticipantRow}>
                  <TextInput
                    style={styles.addParticipantInput}
                    value={newParticipantName}
                    onChangeText={setNewParticipantName}
                    placeholder="Add participant..."
                    placeholderTextColor="rgba(255, 255, 255, 0.3)"
                    onSubmitEditing={addParticipant}
                  />
                  <TouchableOpacity onPress={addParticipant} disabled={!newParticipantName.trim()}>
                    <Ionicons
                      name="add-circle"
                      size={24}
                      color={newParticipantName.trim() ? Colors.accent : 'rgba(255, 255, 255, 0.3)'}
                    />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}

          {/* Dates */}
          <View style={styles.section}>
            <View style={styles.row}>
              <Ionicons name="calendar" size={16} color="rgba(255, 255, 255, 0.7)" />
              <Text style={styles.sectionTitle}>Trip Dates</Text>
            </View>

            <View style={styles.datesRow}>
              <View>
                <Text style={styles.label}>Start</Text>
                {Platform.OS === 'ios' ? (
                  <DateTimePicker
                    value={startDate}
                    mode="date"
                    display="compact"
                    onChange={(e: any, d?: Date) => d && setStartDate(d)}
                    themeVariant="dark"
                    accentColor={Colors.accent}
                    style={{ marginLeft: -10 }}
                  />
                ) : (
                  <TouchableOpacity onPress={() => setShowStartPicker(true)}>
                    <Text style={styles.dateText}>{format(startDate, 'MMM d, yyyy')}</Text>
                  </TouchableOpacity>
                )}
              </View>

              <View>
                <Text style={styles.label}>End</Text>
                {Platform.OS === 'ios' ? (
                  <DateTimePicker
                    value={endDate}
                    mode="date"
                    display="compact"
                    onChange={(e: any, d?: Date) => d && setEndDate(d)}
                    minimumDate={startDate}
                    themeVariant="dark"
                    accentColor={Colors.accent}
                    style={{ marginLeft: -10 }}
                  />
                ) : (
                  <TouchableOpacity onPress={() => setShowEndPicker(true)}>
                    <Text style={styles.dateText}>{format(endDate, 'MMM d, yyyy')}</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>

          {/* Budget */}
          <View style={styles.section}>
            <View style={styles.row}>
              <Text style={styles.sectionTitle}>Set Budget</Text>
              <Switch
                value={hasBudget}
                onValueChange={setHasBudget}
                trackColor={{ false: '#3a3a3c', true: Colors.accent }}
                thumbColor="#FFFFFF"
              />
            </View>

            {hasBudget && (
              <View style={[styles.row, { marginTop: 12 }]}>
                <Text style={styles.currencySymbol}>{getCurrencySymbol(currencyCode)}</Text>
                <TextInput
                  style={styles.budgetInput}
                  value={budgetString}
                  onChangeText={setBudgetString}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor="rgba(255, 255, 255, 0.3)"
                />
              </View>
            )}
          </View>

        </View>
      </ScrollView>

      {/* Android Date Pickers */}
      {showStartPicker && (
        <DateTimePicker
          value={startDate}
          mode="date"
          display="default"
          onChange={(e: any, d?: Date) => {
            setShowStartPicker(false);
            if (d) setStartDate(d);
          }}
        />
      )}
      {showEndPicker && (
        <DateTimePicker
          value={endDate}
          mode="date"
          display="default"
          onChange={(e: any, d?: Date) => {
            setShowEndPicker(false);
            if (d) setEndDate(d);
          }}
        />
      )}

      {/* Emoji Picker Sheet */}
      <Modal
        visible={showEmojiPicker}
        animationType="slide"
        transparent
        onRequestClose={() => setShowEmojiPicker(false)}
      >
        <TouchableOpacity
          style={styles.emojiSheetContainer}
          activeOpacity={1}
          onPress={() => setShowEmojiPicker(false)}
        >
          <View style={styles.emojiSheetContent}>
            <View style={styles.emojiSheetHeader}>
              <Text style={styles.emojiSheetTitle}>Choose Icon</Text>
              <TouchableOpacity onPress={() => setShowEmojiPicker(false)}>
                <Ionicons name="close-circle" size={28} color="rgba(255,255,255,0.3)" />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.emojiGrid}>
              {EMOJI_OPTIONS.map(e => (
                <TouchableOpacity
                  key={e}
                  style={[styles.emojiOption, emoji === e && styles.emojiOptionSelected]}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setEmoji(e);
                    setShowEmojiPicker(false);
                  }}
                >
                  <Text style={styles.emojiOptionText}>{e}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
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
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 16,
    backgroundColor: '#000000',
  },
  headerButton: {
    padding: 8,
  },
  headerTitle: {
    fontFamily: 'AvenirNextCondensed-Heavy',
    fontSize: 22,
    color: '#FFFFFF',
  },
  saveText: {
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 18,
    color: Colors.accent,
  },
  saveTextDisabled: {
    color: 'rgba(255, 255, 255, 0.3)',
  },

  scrollContent: {
    paddingBottom: 40,
  },
  formContainer: {
    padding: 24,
    gap: 24,
  },

  // Emoji & Name
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  emojiButton: {
    width: 64,
    height: 64,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  emoji: {
    fontSize: 44,
  },
  nameContainer: {
    flex: 1,
    gap: 4,
  },
  label: {
    fontFamily: 'System',
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.5)',
  },
  nameInput: {
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 22,
    color: '#FFFFFF',
    padding: 0,
  },

  // Trip Type
  section: {
    gap: 12,
  },
  typeRow: {
    flexDirection: 'row',
    gap: 12,
  },
  typeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  typeButtonActive: {
    backgroundColor: Colors.accent,
  },
  typeText: {
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.5)',
  },
  typeTextActive: {
    color: '#FFFFFF',
  },

  // Participants
  participantsContainer: {
    gap: 8,
  },
  participantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 10,
  },
  participantAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 14,
    color: '#FFFFFF',
  },
  participantName: {
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 16,
    color: '#FFFFFF',
  },
  meLabel: {
    fontFamily: 'System',
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.5)',
  },
  addParticipantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 10,
  },
  addParticipantInput: {
    flex: 1,
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 16,
    color: '#FFFFFF',
  },

  // Dates
  sectionTitle: {
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 16,
    color: '#FFFFFF',
  },
  datesRow: {
    flexDirection: 'row',
    gap: 32,
  },
  dateText: {
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 18,
    color: '#FFFFFF',
    marginTop: 4,
  },

  // Budget
  currencySymbol: {
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 22,
    color: 'rgba(255, 255, 255, 0.5)',
  },
  budgetInput: {
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 22,
    color: '#FFFFFF',
    flex: 1,
    padding: 0,
  },

  // Emoji Sheet
  emojiSheetContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'flex-end',
  },
  emojiSheetContent: {
    backgroundColor: '#1C1C1E',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    gap: 20,
    maxHeight: '60%',
  },
  emojiSheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  emojiSheetTitle: {
    fontFamily: 'AvenirNextCondensed-Bold',
    fontSize: 20,
    color: '#FFFFFF',
  },
  emojiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'center',
  },
  emojiOption: {
    width: 60,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  emojiOptionSelected: {
    backgroundColor: 'rgba(255, 149, 0, 0.3)',
    borderWidth: 2,
    borderColor: Colors.accent,
  },
  emojiOptionText: {
    fontSize: 32,
  },
});
